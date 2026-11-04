import {
  type Collection,
  type EventHandlers,
  type EventMap,
  type Group,
  type Item,
  type OverlaySpec,
  type RegionName,
  type ViewerApi,
  type ViewerOptions,
  createViewer,
} from '@gallerist/core'
import {
  type Accent,
  type ArrowLayout,
  type ColorScheme,
  type ItemIndicator,
  type MountOptions,
  type PresetName,
  type RailPlacement,
  type Skin,
  type Strings,
  applyAppearance,
  mount,
} from '@gallerist/renderer-dom'
import {
  type ReactNode,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { GalleristContext, useViewerContext } from './context'

/**
 * `items` / `groups` / `collection` and `on` are reactive. Changed data swaps the collection in
 * place (diffed by id, keeping the cursor); data rebuilt with the same content is ignored. Every other viewer option
 * (`loop`, `itemMemory`, `startAt`, `plugins`, `overlays`, …) and the layout props (`container`,
 * `preset`, `arrows`, `rail`, …) are read once; change the component's `key` to apply new ones.
 * `skin`, `accent`, `scheme` and `open` are reactive.
 */
export interface GalleristProps extends ViewerOptions {
  /** controlled visibility. */
  open?: boolean
  onClose?: () => void
  container?: HTMLElement | null
  controls?: boolean
  /** layout preset (sets arrow placement, auto-hide, data-gallerist-preset) — UX-E. */
  preset?: PresetName
  /** visual skin, default `gallery`; other skins need their stylesheet (reactive). */
  skin?: Skin
  /** the skin's accent by name, e.g. `mint` (Gallery) or `cyan` (Console) (reactive). */
  accent?: Accent
  /** colour scheme: `dark`, `light` or `auto`; unset, the skin's own default (reactive). */
  scheme?: ColorScheme
  /** within-group arrow placement (overrides the preset default) — UX-D. */
  arrows?: ArrowLayout
  /** thumbnail rail placement (overrides the preset default) — UX-E. */
  rail?: RailPlacement
  /** auto-hide chrome on idle (overrides the preset default) — UX-C. */
  autoHide?: boolean
  /** linear flat traversal: ←/→ walks the flattened item sequence; pairs with a flat thumbnail rail. */
  linear?: boolean
  /** UI text overrides (button labels, announcements) for translation; read once at mount. */
  strings?: Partial<Strings>
  /** item position indicator: `pills` (default), `dots`, `counter` or `placard`; read once at mount. */
  itemIndicator?: ItemIndicator
  /** zoom navigator while zoomed in (overrides the preset default); read once at mount. */
  navigator?: boolean
  /** framed media: the work hangs with room around it (overrides the preset); read once at mount. */
  frame?: boolean
  /** which arrows move between groups (overrides the rail and preset default); read once at mount. */
  groupAxis?: MountOptions['groupAxis']
  /** name the group arrows after their target group (overrides the preset); read once at mount. */
  arrowLabels?: MountOptions['arrowLabels']
  children?: ReactNode
}

// Every viewer event, checked against EventMap (a missing or unknown name fails to compile), so
// the forwarders below can route each one to the latest `on` handlers.
const EVENT_NAMES = Object.keys({
  init: 1,
  destroy: 1,
  open: 1,
  opened: 1,
  close: 1,
  closed: 1,
  beforeSlide: 1,
  slide: 1,
  afterSlide: 1,
  beforeItem: 1,
  item: 1,
  afterItem: 1,
  zoom: 1,
  zoomEnd: 1,
  load: 1,
  loaded: 1,
  loadError: 1,
  collectionChange: 1,
  fullscreenChange: 1,
  overlayClick: 1,
} satisfies Record<keyof EventMap, 1>) as (keyof EventMap)[]

// The collection a data prop describes (flat items → singleton groups). setCollection validates it.
const toCollection = (items?: Item[], groups?: Group[], collection?: Collection): Collection =>
  collection ?? { groups: groups ?? (items ?? []).map((it) => ({ id: it.id, items: [it] })) }

// Values equal at one level of depth: identical, or arrays/plain objects with identical entries
// (a `source: { src }`, `naturalSize`, or a re-created `overlays` array of the same specs).
const shallowSame = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a)
  const rb = b as Record<string, unknown>
  return (
    ka.length === Object.keys(b).length &&
    ka.every((k) => Object.is((a as Record<string, unknown>)[k], rb[k]))
  )
}
const sameRecord = (a: object, b: object, skip?: string): boolean => {
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).filter((k) => k !== skip)
  const kb = Object.keys(rb).filter((k) => k !== skip)
  return ka.length === kb.length && ka.every((k) => shallowSame(ra[k], rb[k]))
}
// Same content (groups, items and their fields), even when rebuilt as fresh objects — so an
// inline `items={photos.map(…)}` doesn't swap the collection (and reset load status) every render.
const sameCollection = (a: Collection, b: Readonly<Collection>): boolean =>
  a.groups.length === b.groups.length &&
  shallowSame(a.meta, b.meta) &&
  a.groups.every((g, gi) => {
    const h = b.groups[gi]
    return (
      !!h &&
      sameRecord(g, h, 'items') &&
      g.items.length === h.items.length &&
      g.items.every((it, ii) => {
        const other = h.items[ii]
        return !!other && sameRecord(it, other)
      })
    )
  })

const GalleristBase = forwardRef<ViewerApi, GalleristProps>(function Gallerist(props, ref) {
  const {
    open,
    onClose,
    container,
    controls,
    preset,
    skin,
    accent,
    scheme,
    arrows,
    rail,
    autoHide,
    linear,
    strings,
    itemIndicator,
    navigator,
    frame,
    groupAxis,
    arrowLabels,
    children,
    ...options
  } = props
  const rootRef = useRef<HTMLElement | null>(null)
  const { items, groups, collection, on } = options

  // The viewer outlives renders, so its handlers must not capture the first render's `on`: they
  // forward to whatever `on` the latest committed render passed (a returned `false` still cancels).
  const onRef = useRef<EventHandlers | undefined>(on)
  useInsertionEffect(() => {
    onRef.current = on
  })
  // Create the viewer once (core is DOM-free → SSR-safe); options are read at construction. Lazy
  // useState (not useMemo, which React may discard) guarantees a single stable instance. Plugins
  // are deliberately NOT registered at construction — they're managed in an effect below so their
  // teardown runs on unmount (I-X2).
  const [viewer] = useState(() => {
    const { plugins: _plugins, on: _on, ...rest } = options
    const forward: EventHandlers = {}
    for (const name of EVENT_NAMES) {
      ;(forward as Record<string, (p: unknown) => unknown>)[name] = (payload) =>
        (onRef.current?.[name] as ((p: unknown) => unknown) | undefined)?.(payload)
    }
    return createViewer({ ...rest, on: forward })
  })

  // Data props are reactive: new data swaps the collection via setCollection (diffed by id, so the
  // cursor and zoom survive when the current item does). The first render's data is already in the
  // viewer; a new reference with the same content is ignored; invalid data (a duplicate id) is
  // reported and the viewer keeps its current collection instead of crashing the React tree.
  const appliedData = useRef({ items, groups, collection })
  useEffect(() => {
    const prev = appliedData.current
    if (prev.items === items && prev.groups === groups && prev.collection === collection) return
    appliedData.current = { items, groups, collection }
    const next = toCollection(items, groups, collection)
    if (sameCollection(next, viewer.getCollection())) return
    try {
      viewer.setCollection(next)
    } catch (error) {
      console.error('[gallerist] ignored an invalid collection update:', error)
    }
  }, [viewer, items, groups, collection])
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
      strings,
      itemIndicator,
      navigator,
      frame,
      groupAxis,
      arrowLabels,
      skin,
      accent,
      scheme,
      loop: options.loop,
    })
    rootRef.current = handle.root
    return () => {
      handle.destroy()
      rootRef.current = null
    }
  }, [viewer])

  // The appearance is reactive: the skin files key off root attributes, so no remount is needed.
  useEffect(() => {
    const root = rootRef.current
    if (root) applyAppearance(root, { skin, accent, scheme })
  }, [skin, accent, scheme])

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
