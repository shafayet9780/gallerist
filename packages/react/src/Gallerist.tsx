import {
  type Collection,
  type Cursor,
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
import { getInternals } from '@gallerist/core/internal'
import {
  type Accent,
  type Appearance,
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
import { useCurrentItem } from './useCurrentItem'

/** A position to open at: group `g`, item `i` (default: the group's remembered item). */
export interface GalleristOpenAt {
  g: number
  i?: number
}

/**
 * `items` / `groups` / `collection` and `on` are reactive. Changed data swaps the collection in
 * place (diffed by id, keeping the cursor); data rebuilt with the same content is ignored. Every other viewer option
 * (`loop`, `itemMemory`, `startAt`, `plugins`, `overlays`, …) and the layout props (`container`,
 * `preset`, `arrows`, `rail`, `label`, `preload`, `adapters`, …) are read once; change the
 * component's `key` to apply new ones. `skin`, `accent`, `scheme`, `groupDisplay` and `open` are
 * reactive.
 */
export interface GalleristProps extends ViewerOptions {
  /**
   * Controlled visibility. `true` opens at the current position; `{ g, i }` opens there, and a new
   * position while open moves the cursor (applied when the value changes, so the user can still
   * navigate away from it); `false` closes. Leave it undefined to drive the viewer through the ref.
   */
  open?: boolean | GalleristOpenAt
  onClose?: () => void
  container?: HTMLElement | null
  controls?: boolean
  /** layout preset (arrow placement, auto-hide, data-gallerist-preset, the thumbnails() defaults) — UX-E. */
  preset?: PresetName
  /** visual skin, default `gallery`; other skins need their stylesheet (reactive). */
  skin?: Skin
  /** the skin's accent by name, e.g. `mint` (Gallery) or `cyan` (Console) (reactive). */
  accent?: Accent
  /**
   * colour scheme: `dark`, `light` or `auto`; unset, the skin's own default (reactive). Written only
   * when it changes, so a scheme set another way (a View menu) stays while it doesn't. While it's
   * passed, the prop owns the scheme: a View menu (`@gallerist/plugin-view`) only reports a choice
   * (`onChange`) and doesn't apply its own (`initial`, a past choice) over it.
   */
  scheme?: ColorScheme
  /**
   * The thumbnails rail's display (`stacked`, `flat` or `index`), reactive: a new value switches the
   * mounted rail in place, keeping the current item (no remount). Omitted, the rail keeps its own
   * (`thumbnails({ groupDisplay })`, the preset's, a View menu's choice). While it's passed, the prop
   * owns the display, as `scheme` does: a View menu only reports a choice.
   */
  groupDisplay?: 'stacked' | 'flat' | 'index'
  /** within-group arrow placement (overrides the preset default) — UX-D. */
  arrows?: ArrowLayout
  /** thumbnail rail placement (overrides the preset default) — UX-E. */
  rail?: RailPlacement
  /** auto-hide chrome on idle (overrides the preset default) — UX-C. */
  autoHide?: boolean
  /** linear traversal: ←/→ walk the flattened item sequence. Omitted, it follows the rail (on with a
   *  flat thumbnails rail, off otherwise); `true` / `false` fix it. */
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
  /** the overlay dialog's accessible name (default `strings.dialog`); read once at mount. */
  label?: string
  /** where focus returns when the overlay closes (default: what had focus when it opened); read
   *  once at mount, so pass a getter for a target that changes. */
  returnFocus?: MountOptions['returnFocus']
  /** how many groups to keep mounted ahead of and behind the current one; read once at mount. */
  preload?: MountOptions['preload']
  /** media adapters, replacing the default image adapter; read once at mount. */
  adapters?: MountOptions['adapters']
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

// Switch the viewer's thumbnails rail (the last one registered, whose rail shows): plugin-thumbnails'
// instance carries `setDisplay` (so this adapter doesn't depend on the plugin). Before the rail
// mounts, it's the display it mounts with.
const showDisplay = (viewer: ViewerApi, display: GalleristProps['groupDisplay']) => {
  if (display)
    (
      getInternals(viewer)
        .getPlugins()
        .filter((p) => p.name === 'thumbnails')
        .pop() as { setDisplay?: (d: string) => void } | undefined
    )?.setDisplay?.(display)
}

// The settings a host applies itself, marked on the viewer (plugin-view reads it, as its `controlled`)
const CONTROLLED = Symbol.for('gallerist.controlled')

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
    groupDisplay,
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
    label,
    returnFocus,
    preload,
    adapters,
    children,
    ...options
  } = props
  const rootRef = useRef<HTMLElement | null>(null)
  const appearance = useRef<Appearance>({}) // what the root was last given
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
  // While `scheme` / `groupDisplay` are passed they own those settings, so a View menu only reports a
  // choice for them. Marked before the plugins register and the renderer mounts (insertion effects
  // run first), and on every commit after.
  useInsertionEffect(() => {
    ;(viewer as { [CONTROLLED]?: unknown })[CONTROLLED] = [
      scheme && 'scheme',
      groupDisplay && 'rail',
    ].filter(Boolean)
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
    showDisplay(viewer, groupDisplay) // the rail builds with it
    appearance.current = { skin, accent, scheme }
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
      label,
      returnFocus,
      preload,
      adapters,
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

  // The appearance is reactive: the skin files key off root attributes, so no remount is needed. Only
  // the props that changed are written: a scheme the host doesn't pass (or doesn't change), set by
  // a View menu, stays when the accent changes.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const prev = appearance.current as Record<string, unknown>
    const next = { skin, accent, scheme }
    appearance.current = next
    applyAppearance(
      root,
      Object.fromEntries(Object.entries(next).filter(([k, v]) => prev[k] !== v)) as Appearance,
    )
  }, [skin, accent, scheme])

  // The rail's display is reactive too: the rail switches in place (the mount effect gave it the
  // first value, so this one changes nothing then)
  useEffect(() => showDisplay(viewer, groupDisplay), [viewer, groupDisplay])

  // `open` is compared by value, so an inline `open={{ g: 2 }}` re-applies only when g or i change
  const openG = typeof open === 'object' && open ? open.g : undefined
  const openI = typeof open === 'object' && open ? open.i : undefined
  const shown = open === undefined ? undefined : !!open
  useEffect(() => {
    if (shown === undefined) return
    // open({ g, i }) on a viewer already showing is a navigation (core)
    if (shown) viewer.open(openG === undefined ? undefined : { g: openG, i: openI })
    else viewer.close()
  }, [shown, openG, openI, viewer])

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

export interface GalleristCaptionProps<GM = unknown, IM = unknown> {
  /**
   * the caption for the current item; `null`, `undefined`, `true` or `false` shows its text
   * `caption` (in a `span.gallerist-caption-text`, the theme's caption type)
   */
  children: (current: {
    item: Item<IM>
    group: Group<GM, IM>
    cursor: Readonly<Cursor>
  }) => ReactNode
}

/**
 * Render the caption for the current item with React, into the renderer's caption region (the
 * caption bar, the editorial placard, wherever the preset puts it). Re-renders on navigation and
 * collection changes. Its text is the viewer's accessible description, like a text caption.
 */
function Caption<GM = unknown, IM = unknown>(props: GalleristCaptionProps<GM, IM>): ReactNode {
  const { item, group, cursor } = useCurrentItem<GM, IM>()
  const out = item && group ? props.children({ item, group, cursor }) : null
  return (
    <Region name="caption">
      {out == null || typeof out === 'boolean' ? text(item?.caption) : out}
    </Region>
  )
}

// The item's own text caption, styled like the bar's text. Untyped data (JSON, a CDN page) can still
// carry an old object-shaped caption, which React would throw on: anything but a string is none.
function text(caption: unknown): ReactNode {
  return typeof caption === 'string' && caption ? (
    <span className="gallerist-caption-text">{caption}</span>
  ) : null
}

export const Gallerist = Object.assign(GalleristBase, { Overlay, Region, Caption })
