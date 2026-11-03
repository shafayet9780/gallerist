// Default DOM renderer (spec §8.3, §10, §17). Subscribes to the headless viewer and
// projects state into DOM: portal/inline modes, windowed slides + node recycling, the
// image adapter, minimal chrome, dialog a11y, keyboard map, and the committed zoom transform.
// Live pan/zoom (imperative RAF) and motion land in M3.4 / M5.

import type {
  Group,
  Item,
  MediaAdapter,
  MediaSource,
  OverlaySpec,
  Phase,
  ViewerApi,
  ZoomState,
} from '@gallerist/core'
import { clampPanToBox, clampScale, getInternals } from '@gallerist/core/internal'
import { imageAdapter, mountImage } from './adapters/image'
import { type Accent, type ColorScheme, type Skin, applyAppearance } from './appearance'
import { attachGestures } from './gestures'
import { ICONS } from './icons'
import { type IdleController, createIdleController } from './idle'
import { containRect } from './overlays/position'
import { type OverlayEntry, gatherOverlays, paintOverlays, updateOverlays } from './overlays/render'
import { type PresetName, resolvePreset } from './presets'
import { type RegionHosts, aggregateKeymap, createRegionMounter } from './regions'
import { DEFAULT_STRINGS, type Strings } from './strings'
import { zoomTransform } from './transform'
import { reconcileKeys, windowIndices } from './windowing'

export type ItemIndicator = 'pills' | 'dots' | 'counter' | 'placard'

export interface MountOptions {
  /** null/undefined → overlay (portal to body); element → inline. */
  container?: HTMLElement | null
  controls?: boolean
  adapters?: MediaAdapter[]
  preload?: { ahead: number; behind: number }
  /** global overlays applied to every slide (spec §8.1, §9). */
  overlays?: OverlaySpec[]
  /**
   * Placement of the within-group ↑/↓ arrows, surfaced as `data-gallerist-arrows` for the theme
   * (UX-D). `pill-right` (default): ←/→ on the side edges, ↑/↓ as a stacked pill at right-center.
   * `corner-br`: ↑/↓ paired bottom-right. `dpad`: all four clustered as a d-pad. `split`: legacy
   * ↑/↓ top/bottom-center.
   */
  arrows?: ArrowLayout
  /**
   * Auto-hide the chrome after a period of inactivity (UX-C), flagged as `data-gallerist-idle` for
   * the theme. Default true; inert under prefers-reduced-motion. The thumbnail rail collapses
   * separately (the `t` key / toggle button / fullscreen), tracked as `data-gallerist-rail`.
   */
  autoHide?: boolean
  /**
   * Named layout preset (UX-E) — sets `data-gallerist-preset` and supplies defaults for `arrows` and
   * `autoHide` (both still overridable by explicit options above). Plugin regions get the preset
   * too: thumbnails() takes `resolvePreset(name).thumbnails` for the options it wasn't given.
   */
  preset?: PresetName
  /**
   * Thumbnail rail placement (UX-E), surfaced as `data-gallerist-rail-pos`. `bottom` (default) keeps
   * the rail horizontal (group axis = ←/→); `left` / `right` run it vertically and remap the
   * keys/arrows (group axis = ↑/↓, items = ←/→ — touch swipes stay conventional); `hidden` starts
   * collapsed (reveal with the toggle / `t` / hover). Overridable; presets supply a default.
   */
  rail?: RailPlacement
  /**
   * Linear traversal (pairs with `thumbnails({ groupDisplay: 'flat' })`). When true, ←/→ walks the
   * flattened item sequence across groups (1a, 1b, 2a, 2b, 2c, 3a…), ↑/↓ retire, the counter shows
   * `item N / total`, and the within-group pills hide — surfaced as `data-gallerist-linear`.
   */
  linear?: boolean
  /**
   * Whether navigation wraps at the ends (mirror of the core `loop` option). Only consulted for
   * `linear` traversal, to wrap the flattened sequence at the global first/last item. Default false.
   */
  loop?: boolean
  /** UI text overrides (button labels, announcements) for translation; merged over English. */
  strings?: Partial<Strings>
  /**
   * How the position within a multi-item group is shown, surfaced as the indicator's `data-mode`.
   * `pills` (default): numbered pills up to 8 items, then `n / N`. `dots`: plain dots with the
   * `n / N` count, up to 12 items, then the count alone. `counter`: always `n / N`. `placard`: the
   * whole item navigator (↑ · ticks · `n / N` · ↓) moves into the caption, which becomes a label
   * beside the work in the `editorial` preset. On a touch screen the theme shows the count only
   * (swipes navigate).
   */
  itemIndicator?: ItemIndicator
  /**
   * Visual skin (`data-gallerist-skin`, default `gallery`). Other skins need their stylesheet loaded
   * after gallerist.css, e.g. `@gallerist/theme-default/console.css` for `console`.
   */
  skin?: Skin
  /** The skin's accent by name (`data-gallerist-accent`); unset uses the skin's default. */
  accent?: Accent
  /** `dark`, `light`, or `auto` to follow the system (`data-gallerist-scheme`); unset, the skin's
   *  own default (Gallery and Console dark, Editorial light). */
  scheme?: ColorScheme
  /**
   * Zoom navigator: while zoomed in, a minimap of the image in the stage's bottom corner with a box
   * for the visible part; click or drag it to move around. Default off (the `reviewer` preset turns
   * it on). Part of the built-in controls, so `controls: false` has none.
   */
  navigator?: boolean
  /**
   * Framed media: the image hangs inside the stage with room around it (the skin's
   * `--gallerist-frame-inset`), and the media element is sized to the image itself so a skin can
   * give it a mat and a shadow. Zoom bounds, overlays and pins follow the framed box. Default off
   * (the `editorial` preset turns it on).
   */
  frame?: boolean
  /**
   * Which arrow keys and on-screen arrows move between groups. Default: follows the rail (`horizontal`
   * with a bottom rail, `vertical` with a side rail). The `tour` preset keeps `horizontal` beside a
   * side rail, so ←/→ moves between sections while ↑/↓ moves within one.
   */
  groupAxis?: GroupAxis
  /**
   * Name the group arrows after the group they go to: `true` uses `group.caption`, a function returns
   * the label. Needs horizontal group arrows in the `pill-right` layout; otherwise ignored. The name
   * also goes into the arrow's accessible name (`strings.previousTo` / `nextTo`).
   */
  arrowLabels?: boolean | ((group: Group, index: number) => string | undefined)
  /** Accessible name for the overlay dialog (default 'Media viewer'); sets aria-label. */
  label?: string
  /** Element (or getter) to return focus to when the overlay closes. Falls back to whatever
   *  had focus when it opened — useful when the trigger lives in a tree that may have unmounted. */
  returnFocus?: HTMLElement | (() => HTMLElement | null)
}

export type ArrowLayout = 'pill-right' | 'corner-br' | 'dpad' | 'split'
export type RailPlacement = 'bottom' | 'hidden' | 'left' | 'right'
export type GroupAxis = 'horizontal' | 'vertical'

export interface RendererHandle {
  root: HTMLElement
  destroy(): void
}

interface SlideRec {
  slide: HTMLElement
  content: HTMLElement
  overlayHost: HTMLElement
  itemId?: string
  media?: ReturnType<MediaAdapter['mount']>
  abort?: AbortController
  overlayEls?: OverlayEntry[]
  /** the item whose overlays are painted; a new object (changed data) repaints them */
  overlayItem?: Item
  activated?: boolean
}

/** A plain URL for a media source (loader and tiled sources have none). */
const sourceUrl = (source: MediaSource | undefined): string | null =>
  typeof source === 'string' ? source : source && 'src' in source ? source.src : null

/** A text caption, or '' for anything else (untyped data may still hold an old caption object). */
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

let mounts = 0 // ids for the caption, which describes the viewer (aria-describedby)

function el(tag: string, className?: string, attrs?: Record<string, string>): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

const FOCUSABLE_SELECTOR =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex],[contenteditable="true"]'
/** Tabbable descendants of `root`, in DOM order (used by the dialog focus trap). */
function focusableWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    // a hidden control can't take focus: counted as the last one, it would let Tab out of the trap
    (node) =>
      node.tabIndex !== -1 && !node.hasAttribute('disabled') && node.checkVisibility?.() !== false,
  )
}
/** True when the key event originates from a control where typing must not be hijacked. */
function isEditableTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  return !!node && (node.isContentEditable || /^(input|textarea|select)$/i.test(node.tagName ?? ''))
}

/** Longest animation (delay + duration × iterations) in ms from a computed style's comma lists.
 *  An infinite animation counts one iteration: it never ends, so the timer settles after one. */
function animationMs(style: CSSStyleDeclaration): number {
  const ms = (v: string) => {
    const n = Number.parseFloat(v)
    if (!Number.isFinite(n)) return 0
    return v.trim().endsWith('ms') ? n : n * 1000
  }
  const count = (v: string | undefined) => {
    const n = Number.parseFloat(v ?? '1')
    return Number.isFinite(n) && n > 0 ? n : 1
  }
  const at = (list: string[], i: number) => list[i % list.length]
  const durations = style.animationDuration.split(',')
  const delays = style.animationDelay.split(',')
  const iterations = (style.animationIterationCount || '1').split(',')
  return Math.max(
    0,
    ...durations.map((d, i) => ms(at(delays, i) ?? '0s') + ms(d) * count(at(iterations, i))),
  )
}

/** Max committed zoom (fit == 1 in the contained model); shared by gestures, keys and bounds. */
const MAX_ZOOM = 4

function applyTransform(content: HTMLElement, zoom: ZoomState): void {
  content.style.transform = zoomTransform(zoom)
}

// Body scroll-lock is shared across all open overlay viewers: the original overflow is
// captured when the first overlay opens and restored only when the last one is removed. A
// per-instance capture would let a viewer opened over another record the already-locked
// 'hidden' as the value to restore, permanently locking page scroll (S-R2). Presence is read
// from the DOM (the overlay roots themselves) so it self-corrects and never leaks a count.
let savedBodyOverflow = ''
const anyOverlayMounted = () =>
  !!document.querySelector('.gallerist[data-gallerist-mode="overlay"]')
function lockBodyScroll(): void {
  if (!anyOverlayMounted()) savedBodyOverflow = document.body.style.overflow // first of the stack
  document.body.style.overflow = 'hidden'
}
function unlockBodyScroll(): void {
  if (!anyOverlayMounted()) document.body.style.overflow = savedBodyOverflow // last one removed
}

// Background inerting is shared across stacked overlays via the same DOM-presence model as the
// scroll-lock: every element we mark is tracked module-wide, and inert is only released when the
// last overlay is gone — so closing an overlay out of LIFO order can't un-inert the page while
// another modal is still open (review #6, C5).
const inertedByGallerist = new Set<HTMLElement>()
function inertBackground(root: HTMLElement): void {
  for (const child of [...document.body.children]) {
    if (child !== root && child instanceof HTMLElement && !child.hasAttribute('inert')) {
      child.setAttribute('inert', '')
      inertedByGallerist.add(child)
    }
  }
}
function releaseBackgroundInert(): void {
  if (anyOverlayMounted()) return // another overlay still needs the page inert
  for (const el of inertedByGallerist) el.removeAttribute('inert')
  inertedByGallerist.clear()
}

export function mount(viewer: ViewerApi, opts: MountOptions = {}): RendererHandle {
  const overlay = !opts.container
  const container = opts.container ?? null
  const controls = opts.controls ?? true
  const preload = opts.preload ?? { ahead: 2, behind: 1 }
  const preset = opts.preset ? resolvePreset(opts.preset) : undefined
  const arrows: ArrowLayout = opts.arrows ?? preset?.arrows ?? 'pill-right'
  const autoHide = opts.autoHide ?? preset?.autoHide ?? true
  const showNavigator = opts.navigator ?? preset?.navigator ?? false
  const frame = opts.frame ?? preset?.frame ?? false
  const rail: RailPlacement = opts.rail ?? preset?.rail ?? 'bottom'
  const railHidden = rail === 'hidden'
  const railPos = rail === 'hidden' ? 'bottom' : rail // bottom | left | right
  // left/right rails run vertically, so the group axis becomes ↑/↓ and items ←/→ (point 5). Touch
  // swipes stay conventional (horizontal = group, swipe-down = dismiss) — only keys/arrows/layout flip.
  const orientation: 'horizontal' | 'vertical' =
    rail === 'left' || rail === 'right' ? 'vertical' : 'horizontal'
  const groupAxis: GroupAxis = opts.groupAxis ?? preset?.groupAxis ?? orientation
  const vertical = groupAxis === 'vertical'
  const linear = opts.linear ?? false
  const arrowLabelsOpt = opts.arrowLabels ?? preset?.arrowLabels ?? false
  const arrowLabel: ((group: Group, index: number) => string | undefined) | null =
    !arrowLabelsOpt || !controls || vertical || linear || arrows !== 'pill-right'
      ? null
      : arrowLabelsOpt === true
        ? (group) => group.caption
        : arrowLabelsOpt
  // Default to the viewer's resolved loop so linear traversal and the slide window agree; an
  // explicit mount({ loop }) still overrides for the rare case they should differ (review #2).
  const loop = opts.loop ?? viewer.loop
  const ui: Strings = { ...DEFAULT_STRINGS, ...opts.strings }
  const itemIndicator: ItemIndicator = opts.itemIndicator ?? preset?.itemIndicator ?? 'pills'
  const placard = itemIndicator === 'placard'

  // Aggregate plugin extensions (adapters/overlays captured at mount; regions + keymap re-applied
  // live on plugin changes, see below). Plugins register on the viewer (decision P1-C).
  const internals = getInternals(viewer)
  const plugins = internals.getPlugins()
  const baseAdapters = opts.adapters ?? [imageAdapter()]
  // Adapters, overlays, and keymap are recomputed live so a plugin added via use() after mount
  // contributes all of its extensions, not just regions (review T4 / Important #5).
  const currentAdapters = () => [
    ...baseAdapters,
    ...internals.getPlugins().flatMap((p) => p.mediaAdapters ?? []),
  ]
  // A plugin's overlays are a list, or a function of the slide (per-item pins, annotations).
  const currentGlobalOverlays = (group: Group, item: Item) => [
    ...(opts.overlays ?? []),
    ...internals
      .getPlugins()
      .flatMap((p) =>
        typeof p.overlays === 'function' ? p.overlays({ group, item }) : (p.overlays ?? []),
      ),
  ]
  let pluginKeymap = aggregateKeymap(plugins)

  const pickAdapter = (type: string, item: Parameters<MediaAdapter['mount']>[0]) =>
    currentAdapters().find((a) => (a.match ? a.match(item) : a.type === type))

  // ── navigation routing (linear flat traversal, point 3) ──────────────────────
  // In linear mode ←/→ walks the flattened (g,i) sequence across groups (1a,1b,2a,2b,2c,3a…) and
  // ↑/↓ retire; the flat list is cached and rebuilt only when the collection changes. `nav.*` is the
  // single seam the keymap, arrow buttons, and gestures route through, so behavior follows the mode.
  let flatSeq: Array<{ g: number; i: number }> = []
  let flatIdx = new Map<string, number>()
  let flatCol: unknown = null
  const ensureFlat = () => {
    const col = viewer.getCollection()
    if (col === flatCol) return
    flatCol = col
    flatSeq = []
    flatIdx = new Map()
    col.groups.forEach((grp, g) =>
      grp.items.forEach((_, i) => {
        flatIdx.set(`${g}:${i}`, flatSeq.length)
        flatSeq.push({ g, i })
      }),
    )
  }
  const flatPosition = (g: number, i: number): number => {
    ensureFlat()
    return flatIdx.get(`${g}:${i}`) ?? 0
  }
  const linearStep = (dir: 1 | -1) => {
    ensureFlat()
    if (flatSeq.length === 0) return
    const { g, i } = viewer.getState().cursor
    let n = (flatIdx.get(`${g}:${i}`) ?? 0) + dir
    if (n >= flatSeq.length) n = loop ? 0 : flatSeq.length - 1
    if (n < 0) n = loop ? flatSeq.length - 1 : 0
    const t = flatSeq[n]
    if (t) viewer.goTo(t.g, t.i)
  }
  const nav = {
    next: () => (linear ? linearStep(1) : viewer.next()),
    prev: () => (linear ? linearStep(-1) : viewer.prev()),
    nextItem: () => {
      if (!linear) viewer.nextItem() // the item axis retires in linear mode
    },
    prevItem: () => {
      if (!linear) viewer.prevItem()
    },
  }

  // ── DOM scaffold ───────────────────────────────────────────────────────────
  // The root is a grid of areas (theme base.css): bar / main / aside / caption / footer / rail. Every
  // piece of chrome lives in its own area, so persistent chrome takes space instead of covering the
  // stage and nothing can collide; only the arrows and the item navigator sit over the stage, inside
  // `main`. Presets and rail positions change the grid template, never the DOM.
  const root = el('div', 'gallerist')
  root.setAttribute('data-gallerist-mode', overlay ? 'overlay' : 'inline')
  root.setAttribute('data-gallerist-arrows', arrows)
  root.setAttribute('data-gallerist-rail-pos', railPos)
  root.setAttribute('data-gallerist-orientation', orientation)
  root.setAttribute('data-gallerist-axis', groupAxis)
  if (arrowLabel) root.setAttribute('data-gallerist-arrow-labels', '')
  root.setAttribute('data-gallerist-rail', railHidden ? 'collapsed' : 'expanded')
  if (linear) root.setAttribute('data-gallerist-linear', 'true')
  if (frame) root.setAttribute('data-gallerist-frame', '')
  if (placard) root.setAttribute('data-gallerist-indicator', 'placard')
  applyAppearance(root, { skin: opts.skin, accent: opts.accent, scheme: opts.scheme })
  if (preset) for (const [k, val] of Object.entries(preset.rootAttrs)) root.setAttribute(k, val)
  if (overlay) {
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', opts.label ?? ui.dialog) // dialog accessible name (I-UX1)
    root.tabIndex = -1
  } else {
    root.setAttribute('role', 'group')
    root.setAttribute('aria-roledescription', ui.carousel)
    root.tabIndex = -1 // focus lands here when a focused control hides (see setHiddenKeepingFocus)
  }

  if (overlay) root.appendChild(el('div', 'gallerist-backdrop'))
  const bar = el('div', 'gallerist-bar')
  const main = el('div', 'gallerist-main')
  const stage = el('div', 'gallerist-stage')
  const track = el('div', 'gallerist-track')
  const viewportLayer = el('div', 'gallerist-viewport-layer')
  const stageRegion = el('div', 'gallerist-region gallerist-region-stage')
  stage.append(track, viewportLayer, stageRegion)
  main.appendChild(stage)

  // Named region hosts for plugins (spec §13).
  const regionHosts: RegionHosts = {
    backdrop: el('div', 'gallerist-region gallerist-region-backdrop'),
    stage: stageRegion,
    toolbar: el('div', 'gallerist-region gallerist-region-toolbar'),
    aside: el('div', 'gallerist-region gallerist-region-aside'),
    thumbnails: el('div', 'gallerist-region gallerist-region-thumbnails'),
    footer: el('div', 'gallerist-region gallerist-region-footer'),
    caption: el('div', 'gallerist-region gallerist-region-caption'),
  }
  // The caption bar holds the item's text caption, or a plugin's caption node in its region
  // (plugin-captions), which then replaces the text. Either is the viewer's accessible description.
  const caption = el('div', 'gallerist-caption')
  const cid = `gallerist-caption-${++mounts}`
  const captionText = el('span', 'gallerist-caption-text', { id: cid })
  regionHosts.caption.id = `${cid}r`
  caption.append(captionText, regionHosts.caption)
  caption.hidden = true
  let anyCaption = false
  const syncCaption = () => {
    const own = regionHosts.caption.hasChildNodes()
    const { g, i } = viewer.getState().cursor
    // the text caption (the theme clamps it), unless a caption region replaces it
    captionText.textContent = own ? '' : str(viewer.getCollection().groups[g]?.items[i]?.caption)
    // a placard is always up: it holds the item navigator as well as the caption
    const hide = !(own || (controls && (anyCaption || placard)))
    caption.hidden = hide
    caption.toggleAttribute('data-gallerist-custom', own)
    // described by the caption only while it shows (hidden text would still be read out)
    root[hide ? 'removeAttribute' : 'setAttribute']('aria-describedby', `${cid} ${cid}r`)
  }
  root.append(
    regionHosts.backdrop,
    bar,
    main,
    regionHosts.aside,
    caption,
    regionHosts.footer,
    regionHosts.thumbnails,
  )

  const live = el('div', 'gallerist-live', { 'aria-live': 'polite', role: 'status' })
  root.appendChild(live)

  // Rail collapse (UX-C): a pull-handle attached to the rail's edge + `t` key + fullscreen →
  // data-gallerist-rail. The handle lives inside the thumbnails region so it reads as part of the
  // gallery; it's (re)placed in mountRegions.
  let railCollapsed = railHidden
  let preFsCollapsed: boolean | null = null
  const railHandle = el('div', 'gallerist-rail-handle')
  const railToggle = el('button', 'gallerist-rail-toggle', {
    type: 'button',
    'aria-label': railHidden ? ui.showThumbnails : ui.hideThumbnails,
    'aria-pressed': String(railHidden),
  })
  railToggle.innerHTML = ICONS.collapse
  railHandle.appendChild(railToggle)
  const setRailCollapsed = (v: boolean, manual = false) => {
    railCollapsed = v
    root.setAttribute('data-gallerist-rail', v ? 'collapsed' : 'expanded')
    railToggle.setAttribute('aria-pressed', String(v))
    railToggle.setAttribute('aria-label', v ? ui.showThumbnails : ui.hideThumbnails)
    // a manual toggle while fullscreen wins over the on-exit restore
    if (manual) preFsCollapsed = null
  }
  railToggle.addEventListener('click', () => setRailCollapsed(!railCollapsed, true))

  let counter: HTMLElement | undefined
  let title: HTMLElement | undefined
  let position: HTMLElement | undefined
  let itemNav: HTMLElement | undefined
  let controlsBox: HTMLElement | undefined
  let reset: HTMLElement | undefined
  let navigatorEl: HTMLElement | undefined
  let navigatorView: HTMLElement | undefined
  let prevArrow: HTMLElement | undefined
  let nextArrow: HTMLElement | undefined
  // segmented pills are rebuilt only when the active group / its size changes (UX-H)
  let posG = -1
  let posM = -1
  if (controls) {
    // top bar: counter → title → plugin tools → zoom reset → close (one row, never overlapping)
    counter = el('div', 'gallerist-counter')
    title = el('div', 'gallerist-title')
    title.hidden = true
    reset = el('button', 'gallerist-zoom-reset', { type: 'button', 'aria-label': ui.resetZoom })
    reset.innerHTML = ICONS.zoomReset
    reset.hidden = true // only while zoomed in
    reset.addEventListener('click', () => viewer.resetZoom())
    const close = el('button', 'gallerist-close', { type: 'button', 'aria-label': ui.close })
    close.innerHTML = ICONS.close
    close.addEventListener('click', () => viewer.close())
    bar.append(counter, title, regionHosts.toolbar, reset, close)

    // over the stage: group arrows and the item navigator (↑ · position · ↓) as one cluster, so
    // each arrow layout places it as a unit. Icons follow the group axis: horizontal → group ←/→,
    // item ↑/↓; vertical (side rail) → group ↑/↓, item ←/→.
    const prev = el('button', 'gallerist-prev', { type: 'button', 'aria-label': ui.previous })
    prev.innerHTML = vertical ? ICONS.itemPrev : ICONS.prev
    prev.addEventListener('click', () => nav.prev())
    const next = el('button', 'gallerist-next', { type: 'button', 'aria-label': ui.next })
    next.innerHTML = vertical ? ICONS.itemNext : ICONS.next
    next.addEventListener('click', () => nav.next())
    prevArrow = prev
    nextArrow = next
    const prevItem = el('button', 'gallerist-item-prev', {
      type: 'button',
      'aria-label': ui.previousItem,
    })
    prevItem.innerHTML = vertical ? ICONS.prev : ICONS.itemPrev
    prevItem.addEventListener('click', () => nav.prevItem())
    const nextItem = el('button', 'gallerist-item-next', {
      type: 'button',
      'aria-label': ui.nextItem,
    })
    nextItem.innerHTML = vertical ? ICONS.next : ICONS.itemNext
    nextItem.addEventListener('click', () => nav.nextItem())
    position = el('div', 'gallerist-position')
    itemNav = el('div', 'gallerist-itemnav')
    itemNav.hidden = true // shown only for groups with more than one item (and not in linear mode)
    itemNav.append(prevItem, position, nextItem)
    controlsBox = el('div', 'gallerist-controls')
    controlsBox.append(prev, next)
    // a placard carries the item navigator in the caption, under the label
    if (placard) caption.appendChild(itemNav)
    else controlsBox.appendChild(itemNav)
    if (showNavigator) {
      // a pointer aid only (keyboard users zoom and pan with the keys), so hidden from AT
      navigatorEl = el('div', 'gallerist-navigator', { 'aria-hidden': 'true' })
      navigatorEl.hidden = true
      navigatorView = el('div', 'gallerist-navigator-view')
      navigatorEl.appendChild(navigatorView)
      navigatorEl.addEventListener('pointerdown', onNavigatorDown)
      controlsBox.appendChild(navigatorEl)
    }
    main.appendChild(controlsBox)
  } else {
    bar.appendChild(regionHosts.toolbar) // plugin tools keep their place without built-in chrome
  }

  // ── slide window ─────────────────────────────────────────────────────────────
  const mounted = new Map<string, SlideRec>()
  let lastCursor: { g: number; i: number } | null = null
  // Window-diff cache: a zoom/pan-only commit (same collection + cursor, current slide fully
  // painted) skips windowIndices/reconcileKeys and just re-applies the transform (I-PERF2).
  let lastWindowCol: unknown = null
  let lastWindowG = -1
  let lastWindowI = -1

  // groupId → index, rebuilt only when the collection reference changes (setCollection).
  // Avoids an O(groups) findIndex per mounted slide on every render (matters at 10k groups).
  let indexCol: unknown = null
  let idIndex = new Map<string, number>()
  const groupIndex = (id: string): number => {
    const col = viewer.getCollection()
    if (col !== indexCol) {
      indexCol = col
      idIndex = new Map(col.groups.map((g, i) => [g.id, i]))
    }
    return idIndex.get(id) ?? -1
  }

  // Tag the current slide with the axis of motion so the theme can use visibly distinct
  // transitions (spec §27.5): group axis = horizontal time slide, item axis = depth pop.
  const tagAxis = (currentSlide: HTMLElement, cur: { g: number; i: number }) => {
    if (lastCursor && (lastCursor.g !== cur.g || lastCursor.i !== cur.i)) {
      const axis = lastCursor.g !== cur.g ? 'group' : 'item'
      currentSlide.removeAttribute('data-gallerist-enter')
      void currentSlide.offsetWidth // reflow to restart the CSS animation
      currentSlide.setAttribute('data-gallerist-enter', axis)
    }
    lastCursor = { g: cur.g, i: cur.i }
  }

  const teardownSlide = (rec: SlideRec) => {
    rec.abort?.abort()
    rec.media?.destroy()
    rec.slide.remove()
  }

  let rendering = false
  const renderWindowInner = () => {
    const state = viewer.getState()
    const col = viewer.getCollection()
    const groupCount = col.groups.length
    if (groupCount === 0) return
    const cur = state.cursor

    // Fast path: nothing about the window changed (zoom/pan-only commit) — re-apply the transform
    // and counter-scale overlays for the current slide, skip the whole diff + allocations (I-PERF2).
    if (col === lastWindowCol && cur.g === lastWindowG && cur.i === lastWindowI) {
      const rec = mounted.get(col.groups[cur.g]?.id ?? '')
      const it = col.groups[cur.g]?.items[cur.i]
      if (rec && it && rec.itemId === it.id && rec.overlayItem === it) {
        applyTransform(rec.content, state.zoom)
        if (rec.overlayEls) updateOverlays(rec.overlayEls, state.zoom.scale)
        return
      }
    }
    lastWindowCol = col
    lastWindowG = cur.g
    lastWindowI = cur.i

    const idxs = windowIndices(cur.g, groupCount, preload.ahead, preload.behind, viewer.loop)
    const wantKeys = idxs.map((g) => col.groups[g]?.id ?? '')
    const { enter, exit } = reconcileKeys([...mounted.keys()], wantKeys)

    for (const k of exit) {
      const rec = mounted.get(k)
      if (rec) teardownSlide(rec)
      mounted.delete(k)
    }
    for (const k of enter) {
      const slide = el('div', 'gallerist-slide', { 'data-group': k })
      const content = el('div', 'gallerist-content')
      const overlayHost = el('div', 'gallerist-overlays-content')
      content.appendChild(overlayHost)
      slide.appendChild(content)
      track.appendChild(slide)
      mounted.set(k, { slide, content, overlayHost })
    }

    for (const [k, rec] of mounted) {
      const g = groupIndex(k)
      if (g < 0) continue
      const isCurrent = g === cur.g
      const group = col.groups[g]
      if (!group) continue
      const itemIndex = isCurrent ? cur.i : 0
      const it = group.items[itemIndex]
      if (it && rec.itemId !== it.id) {
        rec.abort?.abort()
        rec.media?.destroy()
        const abort = new AbortController()
        rec.media = pickAdapter(it.type, it)?.mount(it, rec.content, {
          signal: abort.signal,
          priority: isCurrent ? 'high' : 'low',
        })
        rec.abort = abort
        rec.itemId = it.id
        rec.activated = false
        rec.content.appendChild(rec.overlayHost) // keep overlays above the media
        frameSlide(rec)
        // Surface the media load lifecycle (spec §18: load/loaded/loadError, which also drive
        // state.loaded). On `loaded`, repaint content overlays: before decode naturalSize() is
        // null and paint falls back to the stage rect (a wrong full-stage contain rect), so the
        // overlays re-anchor to the real image box once the natural size is known (I-R1).
        const mountedId = it.id
        const slideKey = k
        // group/item are stable for this slide; the cursor is read fresh at emit time because
        // loaded/loadError fire later from the ready promise, when the cursor may have moved (review #5).
        const loadBase = { viewer, group, item: it }
        internals.emit('load', { ...loadBase, cursor: viewer.cursor, id: mountedId })
        rec.media?.ready
          ?.then(() => {
            internals.emit('loaded', { ...loadBase, cursor: viewer.cursor, id: mountedId })
            const r = mounted.get(slideKey)
            if (!r || r.itemId !== mountedId) return // navigated away / item swapped out
            frameSlide(r) // the frame fits the now-known natural size
            if (groupIndex(slideKey) !== viewer.getState().cursor.g) return // no longer current
            r.overlayItem = undefined // force a repaint at the now-known natural size
            // a zoom committed before the size was known was bounded by the whole layer
            if (attached) reclampZoom()
          })
          .catch((error) => {
            // A load we cancelled (slide torn down, item swapped out) is not a failure — adapters
            // reject `ready` on abort, and reporting it would mark the item 'error'. Return its
            // status to 'idle' unless the item is already mounted again (a fresh load owns it now).
            if (abort.signal.aborted) {
              const remounted = [...mounted.values()].some((r) => r.itemId === mountedId)
              if (!remounted) internals.cancelLoad(mountedId)
              return
            }
            internals.emit('loadError', {
              ...loadBase,
              cursor: viewer.cursor,
              id: mountedId,
              error,
            })
          })
      }
      // activate/deactivate media on slide enter/leave (spec §12 — play/pause for video)
      if (isCurrent && !rec.activated) {
        rec.media?.activate?.()
        rec.activated = true
      } else if (!isCurrent && rec.activated) {
        rec.media?.deactivate?.()
        rec.activated = false
      }
      if (isCurrent) {
        tagAxis(rec.slide, cur)
        rec.slide.setAttribute('data-gallerist-current', '')
        rec.content.setAttribute('data-gallerist-current', '')
        applyTransform(rec.content, state.zoom)
        if (it) {
          // Repaint (re-invokes user render() + rebuilds DOM) only when the item changes, including
          // new data for the same id (setCollection).
          // On a zoom-only change, update retained overlays in place (spec §9.2: no rebuild).
          if (rec.overlayItem !== it) {
            const r = stage.getBoundingClientRect()
            const stageSize = { w: r.width, h: r.height }
            rec.overlayEls = paintOverlays(
              viewportLayer,
              rec.overlayHost,
              gatherOverlays(group, it, currentGlobalOverlays(group, it)),
              {
                group,
                item: it,
                viewer,
                zoom: state.zoom,
                stage: stageSize,
                natural: rec.media?.naturalSize?.() ?? stageSize,
                box: paintedBox(stageSize, rec.media?.naturalSize?.()),
              },
            )
            rec.overlayItem = it
          } else if (rec.overlayEls) {
            updateOverlays(rec.overlayEls, state.zoom.scale)
          }
        }
      } else {
        rec.slide.removeAttribute('data-gallerist-current')
        rec.content.removeAttribute('data-gallerist-current')
        rec.overlayHost.replaceChildren()
        rec.overlayEls = undefined
        rec.overlayItem = undefined
      }
    }
    // Warm the cache for the images `preload.ahead/behind` steps within the group land on (spec §11:
    // the slides above cover the neighbouring groups, showing their first item). Only items the
    // built-in image adapter would mount; low priority, and only once the current media is ready,
    // so they don't compete with it. Ones no longer wanted are cancelled.
    const items = col.groups[cur.g]?.items ?? []
    const want = new Map<string, Item>()
    for (let d = -preload.behind; d <= preload.ahead; d++) {
      const it = d ? items[cur.i + d] : undefined
      if (it && sourceUrl(it.source) && pickAdapter(it.type, it)?.mount === mountImage)
        want.set(it.id, it)
    }
    for (const [id, img] of warm) if (!want.has(id)) unwarm(id, img)
    const run = ++warmRun
    const start = () => {
      if (run !== warmRun) return // the cursor moved on: a newer render owns the warm set
      for (const [id, it] of want) {
        const s = it.source as { srcset?: string; sizes?: string } // a string has neither
        if (!warm.has(id)) {
          warm.set(
            id,
            Object.assign(new Image(), {
              fetchPriority: 'low',
              sizes: s.sizes ?? '',
              srcset: s.srcset ?? '',
              src: sourceUrl(it.source),
            }),
          )
        }
      }
    }
    const ready = mounted.get(col.groups[cur.g]?.id ?? '')?.media?.ready
    if (ready) ready.then(start, start)
    else start()
  }
  // in-group warmers by item id; cancelling one drops its request
  const warm = new Map<string, HTMLImageElement>()
  let warmRun = 0
  const unwarm = (id: string, img: HTMLImageElement) => {
    img.srcset = img.src = ''
    warm.delete(id)
  }
  // Guard against re-entrancy: emitting load/loaded updates state.loaded, whose store
  // notification re-enters sync()/renderWindow while we're mid-iteration over `mounted`.
  const renderWindow = () => {
    if (rendering) return
    rendering = true
    try {
      renderWindowInner()
    } finally {
      rendering = false
    }
  }

  // Within-group position (UX-H): always an "n / N" text, plus a jump button per item while the
  // group is small enough — numbered pills (≤ PILL_MAX) or plain dots (≤ DOT_MAX), per the
  // `itemIndicator` option. The theme decides what to show per device (the text alone on touch).
  const PILL_MAX = 8
  const DOT_MAX = 12
  const updatePosition = (g: number, i: number, itemCount: number) => {
    if (!position) return
    const mode =
      itemIndicator === 'pills' && itemCount <= PILL_MAX
        ? 'pills'
        : (itemIndicator === 'dots' || placard) && itemCount <= DOT_MAX
          ? 'dots'
          : 'counter'
    if (g !== posG || itemCount !== posM || position.dataset.mode !== mode) {
      position.dataset.mode = mode
      position.replaceChildren()
      const text = el('span', 'gallerist-position-text')
      position.appendChild(text)
      if (mode !== 'counter') {
        for (let k = 0; k < itemCount; k++) {
          const jump = el('button', mode === 'pills' ? 'gallerist-pill' : 'gallerist-dot', {
            type: 'button',
            'aria-label': ui.item(k + 1),
          })
          if (mode === 'pills') jump.textContent = String(k + 1)
          jump.addEventListener('click', () => viewer.goTo(g, k))
          position.appendChild(jump)
        }
      }
      posG = g
      posM = itemCount
    }
    const text = position.querySelector('.gallerist-position-text')
    if (text) text.textContent = `${i + 1} / ${itemCount}`
    for (const [k, jump] of position
      .querySelectorAll('.gallerist-pill, .gallerist-dot')
      .entries()) {
      if (k === i) jump.setAttribute('data-active', '')
      else jump.removeAttribute('data-active')
    }
  }

  // Hide a control without dropping keyboard focus: if it (or a child) has focus, hand focus to the
  // viewer root first — otherwise the browser drops it to <body> and the root's keymap goes deaf.
  const setHiddenKeepingFocus = (node: HTMLElement, hidden: boolean) => {
    if (hidden && !node.hidden && node.contains(document.activeElement)) {
      root.focus({ preventScroll: true })
    }
    node.hidden = hidden
  }

  // A labelled group arrow names where it goes; at an end of the collection it has no name to show.
  const setArrowLabel = (
    arrow: HTMLElement | undefined,
    name: string | undefined,
    plain: string,
    named: (name: string) => string,
  ) => {
    if (!arrow) return
    let label = arrow.querySelector<HTMLElement>('.gallerist-arrow-label')
    if (!label) {
      label = el('span', 'gallerist-arrow-label', { 'aria-hidden': 'true' })
      arrow.appendChild(label)
    }
    label.textContent = name ?? ''
    label.hidden = !name
    arrow.setAttribute('aria-label', name ? named(name) : plain)
  }

  // gate chrome updates to cursor/collection changes — skip zoom/pan commits (mirrors the rail)
  let chromeG = -1
  let chromeI = -1
  let chromeCol: unknown = null
  const updateChrome = () => {
    const col = viewer.getCollection()
    const cur = viewer.getState().cursor
    if (col === chromeCol && cur.g === chromeG && cur.i === chromeI) return
    if (col !== chromeCol) {
      // Reserve the caption track for the whole collection when any item has a text caption, so
      // moving between captioned and uncaptioned items never resizes the stage.
      anyCaption = col.groups.some((grp) => grp.items.some((it) => str(it.caption)))
    }
    chromeCol = col
    chromeG = cur.g
    chromeI = cur.i
    const G = col.groups.length
    const group = col.groups[cur.g]
    const item = group?.items[cur.i]
    const itemCount = group?.items.length ?? 0
    // the item axis exists only for multi-item groups, and retires in linear mode
    const multi = !linear && itemCount > 1
    if (itemNav) setHiddenKeepingFocus(itemNav, !multi)
    if (title) {
      title.textContent = group?.caption ?? ''
      title.hidden = !group?.caption
    }
    if (arrowLabel) {
      const nameAt = (step: number) => {
        const n = viewer.loop && G > 1 ? (cur.g + step + G) % G : cur.g + step
        const target = col.groups[n]
        return target ? arrowLabel(target, n) : undefined
      }
      setArrowLabel(prevArrow, nameAt(-1), ui.previous, ui.previousTo)
      setArrowLabel(nextArrow, nameAt(1), ui.next, ui.nextTo)
    }
    syncCaption()
    // Announce the item's own description alongside the position so SR users hear what they
    // navigated to, not just the index (S-UX4).
    const desc = item?.alt ? ` — ${item.alt}` : ''
    if (linear) {
      // flat linear: one running position across all items
      const pos = flatPosition(cur.g, cur.i) + 1 // flatPosition() also rebuilds flatSeq if needed
      const total = flatSeq.length
      if (counter) counter.textContent = `${pos} / ${total}`
      live.textContent = `${ui.itemOf(pos, total)}${desc}`
    } else {
      if (counter) counter.textContent = `${cur.g + 1} / ${G}`
      if (multi) updatePosition(cur.g, cur.i, itemCount)
      live.textContent = multi
        ? `${ui.groupOf(cur.g + 1, G)}, ${ui.itemOf(cur.i + 1, itemCount)}${desc}`
        : `${ui.groupOf(cur.g + 1, G)}${desc}`
    }
  }

  // zoom reset only while zoomed in (fit == 1 in the contained model)
  const updateZoomChrome = () => {
    if (reset) setHiddenKeepingFocus(reset, !(viewer.getState().zoom.scale > 1.001))
    updateNavigator()
  }

  // ── zoom navigator ────────────────────────────────────────────────────────────
  // The minimap is the image at the navigator's size; the view box is the stage's visible part,
  // mapped from content space through the painted media box (the same box the zoom bounds use).
  function updateNavigator() {
    if (!navigatorEl || !navigatorView) return
    const z = viewer.getState().zoom
    const rec = currentRec()
    const natural = rec?.media?.naturalSize?.()
    const { g, i } = viewer.getState().cursor
    const it = viewer.getCollection().groups[g]?.items[i]
    // the image itself (already loaded): a thumb may be cropped to another shape
    const src = it ? (sourceUrl(it.source) ?? sourceUrl(it.thumb)) : null
    const size = stageSize()
    const zoomable = rec?.media?.supportsZoom !== false // a video keeps no minimap
    if (!(z.scale > 1.001) || !zoomable || !natural || !src || !(size.w > 0)) {
      navigatorEl.hidden = true
      return
    }
    const box = mediaBox(size)
    const url = `url(${JSON.stringify(src)})`
    if (navigatorEl.style.backgroundImage !== url) navigatorEl.style.backgroundImage = url
    // the image's shape; the theme sizes its longer side from --gallerist-navigator-size
    navigatorEl.style.aspectRatio = `${natural.w} / ${natural.h}`
    navigatorEl.dataset.shape = natural.h > natural.w ? 'portrait' : 'landscape'
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
    const x0 = clamp01((-z.x / z.scale - box.x) / box.w)
    const y0 = clamp01((-z.y / z.scale - box.y) / box.h)
    const x1 = clamp01(((size.w - z.x) / z.scale - box.x) / box.w)
    const y1 = clamp01(((size.h - z.y) / z.scale - box.y) / box.h)
    Object.assign(navigatorView.style, {
      left: `${x0 * 100}%`,
      top: `${y0 * 100}%`,
      width: `${(x1 - x0) * 100}%`,
      height: `${(y1 - y0) * 100}%`,
    })
    navigatorEl.hidden = false
  }
  // centre the visible part on the pointed spot of the minimap
  const panNavigatorTo = (e: PointerEvent) => {
    if (!navigatorEl) return
    const r = navigatorEl.getBoundingClientRect()
    const size = stageSize()
    if (!(r.width > 0) || !(size.w > 0)) return
    const box = mediaBox(size)
    const z = viewer.getState().zoom
    const cx = box.x + ((e.clientX - r.left) / r.width) * box.w
    const cy = box.y + ((e.clientY - r.top) / r.height) * box.h
    internals.setZoom({
      scale: z.scale,
      x: size.w / 2 - cx * z.scale,
      y: size.h / 2 - cy * z.scale,
    })
  }
  function onNavigatorDown(e: PointerEvent) {
    if (e.button !== 0) return // primary button (or touch / pen contact) only
    const nav = e.currentTarget as HTMLElement
    e.preventDefault()
    e.stopPropagation()
    nav.setPointerCapture?.(e.pointerId)
    panNavigatorTo(e)
    const move = (ev: PointerEvent) => panNavigatorTo(ev)
    const up = () => {
      nav.removeEventListener('pointermove', move)
      nav.removeEventListener('pointerup', up)
      nav.removeEventListener('pointercancel', up)
      nav.removeEventListener('lostpointercapture', up)
    }
    nav.addEventListener('pointermove', move)
    nav.addEventListener('pointerup', up)
    nav.addEventListener('pointercancel', up)
    // hidden mid-drag (zoom reset): capture is lost and no pointerup arrives here
    nav.addEventListener('lostpointercapture', up)
  }

  // ── attach / detach ──────────────────────────────────────────────────────────
  let attached = false
  let restoreFocus: HTMLElement | null = null

  // Auto-hide chrome on idle (UX-C); inert under reduced motion. Rail collapse is independent.
  // Created before attach() so the (TDZ-safe) poke on show works in both overlay and inline modes.
  const idle: IdleController | null = autoHide ? createIdleController(root) : null

  const attach = () => {
    if (attached) return
    attached = true
    if (overlay) {
      restoreFocus = document.activeElement as HTMLElement | null
      lockBodyScroll()
      document.body.appendChild(root)
      // Inert every other top-level element so the dialog is truly modal — focus and the SR
      // virtual cursor can't reach the obscured page behind it (C5). aria-modal alone doesn't
      // enforce this.
      inertBackground(root)
      root.focus()
    }
    setDir()
    readFrameInset()
    idle?.poke() // start the idle countdown from when the viewer is shown
  }
  const detach = () => {
    if (!attached) return
    attached = false
    if (overlay) {
      root.remove() // remove this overlay first so the presence checks below are accurate
      unlockBodyScroll()
      releaseBackgroundInert()
      // Prefer an explicit returnFocus target (survives a trigger that unmounted), else restore
      // focus to whatever was focused on open (S-UX4).
      const target =
        typeof opts.returnFocus === 'function' ? opts.returnFocus() : (opts.returnFocus ?? null)
      ;(target ?? restoreFocus)?.focus?.()
    }
  }

  // inline mode is always present in its container
  if (!overlay && container) {
    container.appendChild(root)
    attached = true
    idle?.poke()
  }

  const sync = () => {
    const phase: Phase = viewer.getState().phase
    // The theme keys the open/close animation off the phase (see the lifecycle driver below).
    if (root.getAttribute('data-gallerist-phase') !== phase)
      root.setAttribute('data-gallerist-phase', phase)
    if (overlay) {
      if (phase !== 'closed') attach()
      else detach()
    }
    if (attached) {
      if (!root.hasAttribute('data-gallerist-dir')) setDir() // inline mode: attached at mount
      renderWindow()
      updateChrome()
      updateZoomChrome()
    }
  }

  // Keyboard zoom pivots on the stage centre (zoomTo's default pivot), spec §5; the zoom bounds
  // clamp the scale and pan.
  const zoomAroundCenter = (factor: number) => viewer.zoomTo(viewer.zoom.scale * factor)

  // ── keyboard (spec §5) ───────────────────────────────────────────────────────
  // Which physical arrow drives which axis depends on the group axis (point 5): by default a side
  // rail makes ↑/↓ the group axis and ←/→ the item axis; horizontal keeps the classic mapping.
  const arrowNav: Record<string, () => void> = vertical
    ? {
        ArrowDown: nav.next,
        ArrowUp: nav.prev,
        ArrowRight: nav.nextItem,
        ArrowLeft: nav.prevItem,
      }
    : {
        ArrowRight: nav.next,
        ArrowLeft: nav.prev,
        ArrowDown: nav.nextItem,
        ArrowUp: nav.prevItem,
      }
  const isRtl = (): boolean => {
    const dir = root.closest('[dir]')?.getAttribute('dir')
    if (dir) return dir === 'rtl'
    try {
      return getComputedStyle(root).direction === 'rtl'
    } catch {
      return false
    }
  }
  // Mirror the keymap's notion of direction onto the root so the theme agrees with it (arrow glyphs,
  // physical side rails) — no reliance on :dir(), and it honours a CSS-only `direction: rtl`.
  const setDir = () => root.setAttribute('data-gallerist-dir', isRtl() ? 'rtl' : 'ltr')

  const onKey = (e: KeyboardEvent) => {
    // Don't hijack typing inside an embedded control (overlay input/textarea/etc); Escape still
    // closes from anywhere (I-UX2), unless a handler before ours called preventDefault() on it
    // (a host form keeping Escape for itself).
    if (isEditableTarget(e.target) && e.key !== 'Escape') return
    // Focus trap: cycle Tab within the dialog so focus can't escape to the inert page (C5).
    if (e.key === 'Tab' && overlay) {
      const tabbables = focusableWithin(root)
      const first = tabbables[0]
      const last = tabbables[tabbables.length - 1]
      if (!first || !last) {
        e.preventDefault()
        return
      }
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === root)) {
        last.focus()
        e.preventDefault()
      } else if (!e.shiftKey && active === last) {
        first.focus()
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowDown': {
        // In an RTL document the horizontal arrows mirror (ArrowLeft advances), matching the
        // logical-property chrome layout (S-UX3). Vertical (Up/Down) is unaffected.
        const flip = isRtl() && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')
        const k = flip ? (e.key === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight') : e.key
        arrowNav[k]?.()
        break
      }
      case 'Escape':
        if (!e.defaultPrevented) viewer.close()
        break
      case '+':
      case '=':
        zoomAroundCenter(1.25)
        break
      case '-':
        zoomAroundCenter(1 / 1.25)
        break
      case '0':
        viewer.resetZoom()
        break
      case 't':
      case 'T':
        setRailCollapsed(!railCollapsed, true)
        break
      case 'Home':
        if (linear) {
          ensureFlat()
          const t = flatSeq[0]
          if (t) viewer.goTo(t.g, t.i)
        } else viewer.goTo(0)
        break
      case 'End':
        if (linear) {
          ensureFlat()
          const t = flatSeq[flatSeq.length - 1]
          if (t) viewer.goTo(t.g, t.i)
        } else viewer.goTo(viewer.getCollection().groups.length - 1)
        break
      default:
        // Modified chords (Ctrl/Cmd/Alt) belong to the browser/OS, not our single-letter map.
        if (e.ctrlKey || e.metaKey || e.altKey) return
        // Within-group digit jumps are meaningless in linear mode (the pills retire), so skip them.
        if (!linear && /^[1-9]$/.test(e.key)) {
          viewer.goTo(viewer.getState().cursor.g, Number(e.key) - 1)
        } else if (pluginKeymap[e.key]) {
          pluginKeymap[e.key]?.(e)
        }
        return
    }
    e.preventDefault()
  }
  root.addEventListener('keydown', onKey)

  // Collapse the rail by default while our element is fullscreen; restore the prior state on exit.
  const isOurFullscreen = () => {
    const fe = document.fullscreenElement
    return !!fe && (fe === root || root.contains(fe))
  }
  const onFsChange = () => {
    if (isOurFullscreen()) {
      if (preFsCollapsed === null) preFsCollapsed = railCollapsed
      setRailCollapsed(true)
    } else if (preFsCollapsed !== null) {
      setRailCollapsed(preFsCollapsed)
      preFsCollapsed = null
    }
  }
  document.addEventListener('fullscreenchange', onFsChange)

  // ── live gestures (spec §11; imperative during gesture, decision P0-E) ─────────
  const currentRec = () => {
    const key = viewer.getCollection().groups[viewer.getState().cursor.g]?.id
    return key ? mounted.get(key) : undefined
  }
  const detachGestures = attachGestures({
    stage,
    viewer,
    maxScale: MAX_ZOOM,
    nav, // route swipes through the linear/oriented nav seam
    getContent: () => currentRec()?.content ?? null,
    getGeometry: () => {
      const r = stage.getBoundingClientRect()
      // Contained model: the content layer fills the stage and scale 1 == fit; the media is
      // object-fit: contain inside it, so pan bounds use the painted box (see mediaBox).
      return {
        stageRect: { left: r.left, top: r.top, width: r.width, height: r.height },
        naturalSize: { w: r.width, h: r.height },
        mediaBox: mediaBox({ w: r.width, h: r.height }),
      }
    },
  })

  // ── open/close transitions (spec §6, §27) ───────────────────────────────────────
  // The theme animates the root per data-gallerist-phase (fade in while opening, out while
  // closing) and the viewer settles to open/closed when that animation ends, so the overlay stays
  // mounted, focus-trapped and scroll-locked through its exit. No animation (reduced motion, inline
  // mode, a theme without one) settles at once. A timer backs up animationend, which never fires if
  // the animation is cancelled or the root is display:none.
  let cancelPhaseWait: (() => void) | null = null
  const awaitPhaseAnimation = (done: () => void) => {
    cancelPhaseWait?.()
    const style = getComputedStyle(root)
    if (!style.animationName || style.animationName === 'none') return done()
    const onEnd = (e: Event) => {
      if (e.target === root) finish() // slide/thumbnail animations bubble up too
    }
    const stop = () => {
      root.removeEventListener('animationend', onEnd)
      clearTimeout(timer)
      cancelPhaseWait = null
    }
    const finish = () => {
      stop()
      done()
    }
    root.addEventListener('animationend', onEnd) // events dispatch async: never before `timer` exists
    const timer = setTimeout(finish, animationMs(style) + 50)
    cancelPhaseWait = stop
  }
  const offLifecycle = internals.setLifecycleDriver({
    opening: awaitPhaseAnimation,
    closing: awaitPhaseAnimation,
  })

  // ── zoom bounds (spec §11.1) ───────────────────────────────────────────────────
  // Lend the core the stage geometry so every committed zoom (API, keyboard, gesture end, resize)
  // is clamped in one place. Contained model: the media is object-fit inside a stage-sized content
  // layer, so fit == scale 1, and the pan keeps the painted media box (not the letterbox around it)
  // covering the stage.
  const stageSize = () => {
    const r = stage.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }
  // The current media's painted box in content space; the whole layer until its size is known.
  // The painted media box in content space at fit: the media's contain rect, inside the frame
  // inset when framed; the whole (inset) layer until the natural size is known. Zoom bounds, the
  // navigator, overlays and the framed media element all use this one box.
  let frameInset = 0
  const readFrameInset = () => {
    frameInset = frame
      ? Number.parseFloat(getComputedStyle(root).getPropertyValue('--gallerist-frame-inset')) || 0
      : 0
  }
  function paintedBox(
    size: { w: number; h: number },
    natural: { w: number; h: number } | null | undefined,
  ) {
    const inset = Math.max(0, Math.min(frameInset, size.w / 4, size.h / 4))
    const inner = { w: size.w - 2 * inset, h: size.h - 2 * inset }
    if (!(natural && natural.w > 0 && natural.h > 0)) return { x: inset, y: inset, ...inner }
    const r = containRect(inner, natural)
    return { x: r.x + inset, y: r.y + inset, w: r.w, h: r.h }
  }
  function mediaBox(size: { w: number; h: number }) {
    return paintedBox(size, currentRec()?.media?.naturalSize?.())
  }
  // Framed: size the slide's media element to its painted box (the theme reads these variables).
  function frameSlide(rec: SlideRec) {
    if (!frame) return
    const size = stageSize()
    if (!(size.w > 0 && size.h > 0)) return
    const box = paintedBox(size, rec.media?.naturalSize?.())
    const s = rec.content.style
    s.setProperty('--gallerist-box-x', `${box.x}px`)
    s.setProperty('--gallerist-box-y', `${box.y}px`)
    s.setProperty('--gallerist-box-w', `${box.w}px`)
    s.setProperty('--gallerist-box-h', `${box.h}px`)
  }
  const constrainZoom = (z: ZoomState): ZoomState => {
    const scaled = { scale: clampScale(z.scale, 1, MAX_ZOOM), x: z.x, y: z.y }
    const size = stageSize()
    // Not laid out (closed overlay, hidden container): the scale range needs no geometry, the pan
    // bounds do; the ResizeObserver re-clamps the pan once the stage has a size.
    if (!(size.w > 0 && size.h > 0)) return scaled
    return clampPanToBox(scaled, size, mediaBox(size))
  }
  const offZoomBounds = internals.setZoomBounds({
    center: () => {
      const size = stageSize()
      return { x: size.w / 2, y: size.h / 2 }
    },
    constrain: constrainZoom,
  })

  // Re-check the committed zoom against the current geometry; repaints either way.
  const reclampZoom = () => {
    const z = viewer.getState().zoom
    const clamped = constrainZoom(z)
    if (clamped.scale !== z.scale || clamped.x !== z.x || clamped.y !== z.y) {
      internals.setZoom(clamped) // commit → sync → repaint
    } else {
      renderWindow() // repaint overlays at the new rect
      updateNavigator()
    }
  }

  // ── re-measure on resize (spec §10.5) ──────────────────────────────────────────
  // A single ResizeObserver on the stage, debounced to one frame. On resize / device rotation
  // it repaints the current slide's content overlays (their px box is derived from the stage
  // rect) and re-clamps the committed zoom against the new fit, so image-space overlays don't
  // drift and a zoomed image can't be stranded panned past the new edge (C2).
  let resizeFrame = 0
  const onStageResize = () => {
    if (resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      if (!attached) return
      readFrameInset() // the inset can change with the viewport (the mobile layer)
      for (const rec of mounted.values()) frameSlide(rec)
      const cur = currentRec()
      if (cur) cur.overlayItem = undefined // re-anchor overlays against the new stage rect
      reclampZoom()
    })
  }
  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onStageResize) : null
  resizeObserver?.observe(stage)

  // Immersive floats the bar, caption, rail and side column over the full-bleed stage. Measure
  // where they overlap it and inset the on-stage controls box by that much, so arrows and the item
  // navigator never end up underneath chrome (in every arrow layout, rail expanded or collapsed).
  let insetFrame = 0
  const updateControlsInset = () => {
    insetFrame = 0
    if (!controlsBox) return
    if (root.getAttribute('data-gallerist-preset') !== 'immersive' || !attached) {
      controlsBox.style.removeProperty('--gallerist-controls-inset')
      return
    }
    const m = main.getBoundingClientRect()
    let top = 0
    let right = 0
    let bottom = 0
    let left = 0
    for (const band of [
      bar,
      caption,
      regionHosts.footer,
      regionHosts.thumbnails,
      regionHosts.aside,
    ]) {
      if (band.hidden) continue
      const r = band.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.width >= m.width * 0.5) {
        // a horizontal band: it covers the top or the bottom of the stage
        if (r.top - m.top < m.bottom - r.bottom) top = Math.max(top, r.bottom - m.top)
        else bottom = Math.max(bottom, m.bottom - r.top)
      } else if (r.left - m.left < m.right - r.right) {
        left = Math.max(left, r.right - m.left)
      } else {
        right = Math.max(right, m.right - r.left)
      }
    }
    controlsBox.style.setProperty(
      '--gallerist-controls-inset',
      `${top}px ${right}px ${bottom}px ${left}px`,
    )
  }
  const scheduleInset = () => {
    if (!insetFrame) insetFrame = requestAnimationFrame(updateControlsInset)
  }
  const bandObserver =
    controlsBox && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleInset) : null
  for (const band of [
    main,
    bar,
    caption,
    regionHosts.footer,
    regionHosts.thumbnails,
    regionHosts.aside,
  ]) {
    bandObserver?.observe(band)
  }
  // viewer.refresh(): an explicit re-measure, for layout changes a ResizeObserver can't see
  const offRefresh = internals.onRefresh(onStageResize)

  // ── plugin regions (spec §13) ──────────────────────────────────────────────
  const mountPluginRegions = createRegionMounter(regionHosts, { viewer, preset })
  const mountRegions = () => {
    pluginKeymap = aggregateKeymap(internals.getPlugins())
    mountPluginRegions(internals.getPlugins())
    // The pull-handle leads the rail region while a rail plugin is mounted. The mounter leaves
    // nodes it didn't add alone, so place (or drop) the handle here.
    const thumbs = regionHosts.thumbnails
    const hasRail = [...thumbs.childNodes].some((n) => n !== railHandle)
    if (!hasRail) railHandle.remove()
    else if (thumbs.firstChild !== railHandle) thumbs.prepend(railHandle)
    if (!controls) bar.hidden = regionHosts.toolbar.childElementCount === 0
    syncCaption()
    // plugin overlays may have changed (e.g. React <Gallerist.Overlay> mount/unmount) → force repaint
    const cur = currentRec()
    if (cur) cur.overlayItem = undefined
    if (attached) renderWindow()
  }
  mountRegions()
  const offPlugins = internals.onPluginsChanged(mountRegions)

  const unsubscribe = viewer.subscribe(sync)
  sync()

  return {
    root,
    destroy() {
      unsubscribe()
      offPlugins()
      offZoomBounds()
      offRefresh()
      cancelPhaseWait?.()
      offLifecycle() // settles a transition in flight, so `closed` still fires
      detachGestures()
      resizeObserver?.disconnect()
      bandObserver?.disconnect()
      if (insetFrame) cancelAnimationFrame(insetFrame)
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      idle?.destroy()
      document.removeEventListener('fullscreenchange', onFsChange)
      root.removeEventListener('keydown', onKey)
      for (const rec of mounted.values()) teardownSlide(rec)
      mounted.clear()
      warmRun++
      for (const [id, img] of warm) unwarm(id, img)
      detach()
      if (!overlay) root.remove()
    },
  }
}
