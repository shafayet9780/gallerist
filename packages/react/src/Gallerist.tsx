import {
  type OverlaySpec,
  type RegionName,
  type ViewerApi,
  type ViewerOptions,
  createViewer,
} from '@gallerist/core'
import {
  type ArrowLayout,
  type PresetName,
  type RailPlacement,
  mount,
} from '@gallerist/renderer-dom'
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
import { GalleristContext, useViewerContext } from './context'

export interface GalleristProps extends ViewerOptions {
  /** controlled visibility. */
  open?: boolean
  onClose?: () => void
  container?: HTMLElement | null
  controls?: boolean
  /** layout preset (sets arrow placement, auto-hide, data-gallerist-preset) — UX-E. */
  preset?: PresetName
  /** accent variant, applied as data-gallerist-theme (reactive) — UX-I. */
  theme?: 'amber' | 'cyan' | 'vermilion'
  /** within-group arrow placement (overrides the preset default) — UX-D. */
  arrows?: ArrowLayout
  /** thumbnail rail placement (overrides the preset default) — UX-E. */
  rail?: RailPlacement
  /** auto-hide chrome on idle (overrides the preset default) — UX-C. */
  autoHide?: boolean
  /** linear flat traversal: ←/→ walks the flattened item sequence; pairs with a flat thumbnail rail. */
  linear?: boolean
  children?: ReactNode
}

const GalleristBase = forwardRef<ViewerApi, GalleristProps>(function Gallerist(props, ref) {
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
    linear,
    children,
    ...options
  } = props
  const rootRef = useRef<HTMLElement | null>(null)
  // Create the viewer once (core is DOM-free → SSR-safe); options are read at construction. Lazy
  // useState (not useMemo, which React may discard) guarantees a single stable instance. Plugins
  // are deliberately NOT registered at construction — they're managed in an effect below so their
  // teardown runs on unmount (I-X2).
  const [viewer] = useState(() => {
    const { plugins: _plugins, ...rest } = options
    return createViewer(rest)
  })
  useImperativeHandle(ref, () => viewer, [viewer])

  // Register the construction-time plugins via use() and dispose them on unmount, so their
  // init()-created store subscriptions / observers / DOM don't leak on every remount (the viewer
  // itself is intentionally never destroyed — see the mount effect). Plugins are mount-time config.
  // biome-ignore lint/correctness/useExhaustiveDependencies: register once for the viewer's life
  useEffect(() => {
    const disposers = (options.plugins ?? []).map((plugin) => viewer.use(plugin))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, [viewer])

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
      linear,
      loop: options.loop,
    })
    rootRef.current = handle.root
    return () => {
      handle.destroy()
      rootRef.current = null
    }
  }, [viewer])

  // theme is reactive — reflect it as data-gallerist-theme on the mounted root.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (theme) root.setAttribute('data-gallerist-theme', theme)
    else root.removeAttribute('data-gallerist-theme')
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

  return <GalleristContext.Provider value={viewer}>{children}</GalleristContext.Provider>
})

export interface GalleristOverlayProps {
  anchor: OverlaySpec['anchor']
  id?: string
  layer?: number
  interactive?: boolean
  visibleAt?: [number, number]
  className?: string
  children?: ReactNode
}

/** Render a React subtree as an image-space / viewport overlay via a portal (decision P0-G). */
function Overlay(props: GalleristOverlayProps): ReactNode {
  const viewer = useViewerContext()
  const [host, setHost] = useState<HTMLElement | null>(null)
  // useId is SSR-deterministic (server + client agree), unlike a module-global counter.
  const autoId = useId()
  const id = props.id ?? autoId

  // Depend on the VALUE of the object/array props, not their identity. The common usage passes
  // inline literals (`anchor={{ kind: 'viewport', … }}`) that are a fresh reference every render;
  // keying on identity disposed+re-registered the overlay plugin on every parent render, forcing a
  // full overlay repaint. Serializing makes re-registration happen only on a real change (I-X3).
  const anchorKey = JSON.stringify(props.anchor)
  const visibleAtKey = JSON.stringify(props.visibleAt ?? null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: anchor/visibleAt tracked by value key
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
  }, [viewer, id, anchorKey, visibleAtKey, props.layer, props.interactive, props.className])

  return host ? createPortal(props.children, host) : null
}

export interface GalleristRegionProps {
  name: RegionName
  children?: ReactNode
}

/** Render a React subtree into a named renderer region (toolbar, footer, …) via a portal. */
function Region(props: GalleristRegionProps): ReactNode {
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

export const Gallerist = Object.assign(GalleristBase, { Overlay, Region })
