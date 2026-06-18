import {
  type OverlaySpec,
  type RegionName,
  type ViewerApi,
  type ViewerOptions,
  createViewer,
} from '@visora/core'
import { type ArrowLayout, type PresetName, type RailPlacement, mount } from '@visora/renderer-dom'
import {
  type ReactNode,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { VisoraContext, useViewerContext } from './context'

export interface VisoraProps extends ViewerOptions {
  /** controlled visibility. */
  open?: boolean
  onClose?: () => void
  container?: HTMLElement | null
  controls?: boolean
  /** layout preset (sets arrow placement, auto-hide, data-visora-preset) — UX-E. */
  preset?: PresetName
  /** accent variant, applied as data-visora-theme (reactive) — UX-I. */
  theme?: 'amber' | 'cyan' | 'vermilion'
  /** within-group arrow placement (overrides the preset default) — UX-D. */
  arrows?: ArrowLayout
  /** thumbnail rail placement (overrides the preset default) — UX-E. */
  rail?: RailPlacement
  /** auto-hide chrome on idle (overrides the preset default) — UX-C. */
  autoHide?: boolean
  children?: ReactNode
}

const VisoraBase = forwardRef<ViewerApi, VisoraProps>(function Visora(props, ref) {
  const {
    open,
    onClose,
    container,
    controls,
    preset,
    theme,
    arrows,
    rail,
    autoHide,
    children,
    ...options
  } = props
  const rootRef = useRef<HTMLElement | null>(null)
  // Create the viewer once (core is DOM-free → SSR-safe); options are read at construction. Lazy
  // useState (not useMemo, which React may discard) guarantees a single stable instance.
  const [viewer] = useState(() => createViewer(options))
  useImperativeHandle(ref, () => viewer, [viewer])

  // Mount the renderer once per viewer (client-side); container/controls are mount-time only. Only
  // the renderer (the DOM holder) is torn down here. The viewer is NOT destroyed on cleanup: under
  // StrictMode the simulated unmount would run viewer.destroy() on the stable useState instance,
  // permanently poisoning it (registerPlugin/nav short-circuit once destroyed) so re-registered
  // overlays/regions vanish. The viewer is plain JS (no DOM) and is reclaimed by GC once the
  // component unmounts and the renderer/hook/overlay subscriptions have all cleaned themselves up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-once (layout opts read once)
  useEffect(() => {
    const handle = mount(viewer, {
      container: container ?? null,
      controls,
      preset,
      arrows,
      rail,
      autoHide,
    })
    rootRef.current = handle.root
    return () => {
      handle.destroy()
      rootRef.current = null
    }
  }, [viewer])

  // theme is reactive — reflect it as data-visora-theme on the mounted root.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (theme) root.setAttribute('data-visora-theme', theme)
    else root.removeAttribute('data-visora-theme')
  }, [theme])

  useEffect(() => {
    if (open === undefined) return
    if (open) viewer.open()
    else viewer.close()
  }, [open, viewer])

  useEffect(() => {
    if (!onClose) return
    return viewer.on('closed', () => onClose())
  }, [onClose, viewer])

  return <VisoraContext.Provider value={viewer}>{children}</VisoraContext.Provider>
})

export interface VisoraOverlayProps {
  anchor: OverlaySpec['anchor']
  id?: string
  layer?: number
  interactive?: boolean
  visibleAt?: [number, number]
  className?: string
  children?: ReactNode
}

/** Render a React subtree as an image-space / viewport overlay via a portal (decision P0-G). */
function Overlay(props: VisoraOverlayProps): ReactNode {
  const viewer = useViewerContext()
  const [host, setHost] = useState<HTMLElement | null>(null)
  // useId is SSR-deterministic (server + client agree), unlike a module-global counter.
  const autoId = useId()
  const id = props.id ?? autoId

  useEffect(() => {
    const node = document.createElement('div')
    setHost(node)
    const spec: OverlaySpec = {
      id,
      anchor: props.anchor,
      layer: props.layer,
      interactive: props.interactive,
      visibleAt: props.visibleAt,
      class: props.className,
      render: () => node, // stable host; React owns its children through the portal
    }
    const dispose = viewer.use(() => ({ name: `overlay:${id}`, overlays: [spec] }))
    return () => {
      dispose()
      setHost(null)
    }
  }, [viewer, id, props.anchor, props.layer, props.interactive, props.visibleAt, props.className])

  return host ? createPortal(props.children, host) : null
}

export interface VisoraRegionProps {
  name: RegionName
  children?: ReactNode
}

/** Render a React subtree into a named renderer region (toolbar, footer, …) via a portal. */
function Region(props: VisoraRegionProps): ReactNode {
  const viewer = useViewerContext()
  const [host, setHost] = useState<HTMLElement | null>(null)
  const { name } = props

  useEffect(() => {
    const node = document.createElement('div')
    setHost(node)
    const dispose = viewer.use(() => ({
      name: `region:${name}`,
      regions: { [name]: () => node },
    }))
    return () => {
      dispose()
      setHost(null)
    }
  }, [viewer, name])

  return host ? createPortal(props.children, host) : null
}

export const Visora = Object.assign(VisoraBase, { Overlay, Region })
