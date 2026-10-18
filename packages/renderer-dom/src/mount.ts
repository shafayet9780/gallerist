// Default DOM renderer (spec §8.3, §10, §17). Subscribes to the headless viewer and
// projects state into DOM: portal/inline modes, windowed slides + node recycling, the
// image adapter, minimal chrome, dialog a11y, keyboard map, and the committed zoom transform.
// Live pan/zoom (imperative RAF) and motion land in M3.4 / M5.

import type { MediaAdapter, OverlaySpec, Phase, ViewerApi, ZoomState } from '@gallerist/core'
import { clampPan, clampScale, getInternals } from '@gallerist/core/internal'
import { imageAdapter } from './adapters/image'
import { attachGestures } from './gestures'
import { ICONS } from './icons'
import { type IdleController, createIdleController } from './idle'
import { type OverlayEntry, gatherOverlays, paintOverlays, updateOverlays } from './overlays/render'
import { type PresetName, resolvePreset } from './presets'
import { type RegionHosts, aggregateKeymap, createRegionMounter } from './regions'
import { reconcileKeys, windowIndices } from './windowing'

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
   * `autoHide` (both still overridable by explicit options above). The preset's preferred
   * thumbnails() options are exposed via `resolvePreset(name).thumbnails` for the host to apply.
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
  /** Accessible name for the overlay dialog (default 'Media viewer'); sets aria-label. */
  label?: string
  /** Element (or getter) to return focus to when the overlay closes. Falls back to whatever
   *  had focus when it opened — useful when the trigger lives in a tree that may have unmounted. */
  returnFocus?: HTMLElement | (() => HTMLElement | null)
}

export type ArrowLayout = 'pill-right' | 'corner-br' | 'dpad' | 'split'
export type RailPlacement = 'bottom' | 'hidden' | 'left' | 'right'

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
  overlayItemId?: string
  activated?: boolean
}

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
    (node) => node.tabIndex !== -1 && !node.hasAttribute('disabled'),
  )
}
/** True when the key event originates from a control where typing must not be hijacked. */
function isEditableTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  return !!node && (node.isContentEditable || /^(input|textarea|select)$/i.test(node.tagName ?? ''))
}

/** Longest animation (duration + delay) in ms from a computed style's comma lists. */
function animationMs(style: CSSStyleDeclaration): number {
  const ms = (v: string) => {
    const n = Number.parseFloat(v)
    if (!Number.isFinite(n)) return 0
    return v.trim().endsWith('ms') ? n : n * 1000
  }
  const durations = style.animationDuration.split(',')
  const delays = style.animationDelay.split(',')
  return Math.max(0, ...durations.map((d, i) => ms(d) + ms(delays[i % delays.length] ?? '0s')))
}

/** Max committed zoom (fit == 1 in the contained model); shared by gestures, keys and bounds. */
const MAX_ZOOM = 4

function applyTransform(content: HTMLElement, zoom: ZoomState): void {
  content.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
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
  const preset = opts.preset ? resolvePreset(opts.preset) : null
  const arrows: ArrowLayout = opts.arrows ?? preset?.arrows ?? 'pill-right'
  const autoHide = opts.autoHide ?? preset?.autoHide ?? true
  const rail: RailPlacement = opts.rail ?? preset?.rail ?? 'bottom'
  const railHidden = rail === 'hidden'
  const railPos = rail === 'hidden' ? 'bottom' : rail // bottom | left | right
  // left/right rails run vertically, so the group axis becomes ↑/↓ and items ←/→ (point 5). Touch
  // swipes stay conventional (horizontal = group, swipe-down = dismiss) — only keys/arrows/layout flip.
  const orientation: 'horizontal' | 'vertical' =
    rail === 'left' || rail === 'right' ? 'vertical' : 'horizontal'
  const vertical = orientation === 'vertical'
  const linear = opts.linear ?? false
  // Default to the viewer's resolved loop so linear traversal and the slide window agree; an
  // explicit mount({ loop }) still overrides for the rare case they should differ (review #2).
  const loop = opts.loop ?? viewer.loop

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
  const currentGlobalOverlays = () => [
    ...(opts.overlays ?? []),
    ...internals.getPlugins().flatMap((p) => p.overlays ?? []),
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
  const root = el('div', 'gallerist')
  root.setAttribute('data-gallerist-mode', overlay ? 'overlay' : 'inline')
  root.setAttribute('data-gallerist-arrows', arrows)
  root.setAttribute('data-gallerist-rail-pos', railPos)
  root.setAttribute('data-gallerist-orientation', orientation)
  root.setAttribute('data-gallerist-rail', railHidden ? 'collapsed' : 'expanded')
  if (linear) root.setAttribute('data-gallerist-linear', 'true')
  if (preset) for (const [k, val] of Object.entries(preset.rootAttrs)) root.setAttribute(k, val)
  if (overlay) {
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', opts.label ?? 'Media viewer') // dialog accessible name (I-UX1)
    root.tabIndex = -1
  } else {
    root.setAttribute('role', 'group')
    root.setAttribute('aria-roledescription', 'carousel')
  }

  if (overlay) root.appendChild(el('div', 'gallerist-backdrop'))
  const stage = el('div', 'gallerist-stage')
  const track = el('div', 'gallerist-track')
  const viewportLayer = el('div', 'gallerist-viewport-layer')
  const stageRegion = el('div', 'gallerist-region gallerist-region-stage')
  stage.append(track, viewportLayer, stageRegion)
  root.appendChild(stage)

  // Named region hosts for plugins (spec §13).
  const regionHosts: RegionHosts = {
    backdrop: el('div', 'gallerist-region gallerist-region-backdrop'),
    stage: stageRegion,
    toolbar: el('div', 'gallerist-region gallerist-region-toolbar'),
    thumbnails: el('div', 'gallerist-region gallerist-region-thumbnails'),
    footer: el('div', 'gallerist-region gallerist-region-footer'),
  }
  root.prepend(regionHosts.backdrop)
  root.append(regionHosts.toolbar, regionHosts.thumbnails, regionHosts.footer)

  const live = el('div', 'gallerist-live', { 'aria-live': 'polite', role: 'status' })
  root.appendChild(live)

  // Rail collapse (UX-C): a pull-handle attached to the rail's edge + `t` key + fullscreen →
  // data-gallerist-rail. The handle lives inside the thumbnails region so it reads as part of the
  // gallery and slides with it; it's (re)attached in mountRegions since the host is replaceChildren'd.
  let railCollapsed = railHidden
  let preFsCollapsed: boolean | null = null
  const railHandle = el('div', 'gallerist-rail-handle')
  const railToggle = el('button', 'gallerist-rail-toggle', {
    type: 'button',
    'aria-label': railHidden ? 'Show thumbnails' : 'Hide thumbnails',
    'aria-pressed': String(railHidden),
  })
  railToggle.innerHTML = ICONS.collapse
  railHandle.appendChild(railToggle)
  const setRailCollapsed = (v: boolean, manual = false) => {
    railCollapsed = v
    root.setAttribute('data-gallerist-rail', v ? 'collapsed' : 'expanded')
    railToggle.setAttribute('aria-pressed', String(v))
    railToggle.setAttribute('aria-label', v ? 'Show thumbnails' : 'Hide thumbnails')
    // a manual toggle while fullscreen wins over the on-exit restore
    if (manual) preFsCollapsed = null
  }
  railToggle.addEventListener('click', () => setRailCollapsed(!railCollapsed, true))

  let counter: HTMLElement | undefined
  let position: HTMLElement | undefined
  // segmented pills are rebuilt only when the active group / its size changes (UX-H)
  let posG = -1
  let posM = -1
  if (controls) {
    const chrome = el('div', 'gallerist-chrome')
    const close = el('button', 'gallerist-close', { type: 'button', 'aria-label': 'Close' })
    close.innerHTML = ICONS.close
    close.addEventListener('click', () => viewer.close())
    // Icons follow the orientation: horizontal → group ←/→, item ↑/↓; vertical → group ↑/↓, item ←/→.
    // (Positions are the CSS counterpart in `[data-gallerist-orientation="vertical"]`; keep the two in sync.)
    const prev = el('button', 'gallerist-prev', { type: 'button', 'aria-label': 'Previous' })
    prev.innerHTML = vertical ? ICONS.itemPrev : ICONS.prev
    prev.addEventListener('click', () => nav.prev())
    const next = el('button', 'gallerist-next', { type: 'button', 'aria-label': 'Next' })
    next.innerHTML = vertical ? ICONS.itemNext : ICONS.next
    next.addEventListener('click', () => nav.next())
    const prevItem = el('button', 'gallerist-item-prev', {
      type: 'button',
      'aria-label': 'Previous item',
    })
    prevItem.innerHTML = vertical ? ICONS.prev : ICONS.itemPrev
    prevItem.addEventListener('click', () => nav.prevItem())
    const nextItem = el('button', 'gallerist-item-next', {
      type: 'button',
      'aria-label': 'Next item',
    })
    nextItem.innerHTML = vertical ? ICONS.next : ICONS.itemNext
    nextItem.addEventListener('click', () => nav.nextItem())
    const reset = el('button', 'gallerist-zoom-reset', {
      type: 'button',
      'aria-label': 'Reset zoom',
    })
    reset.innerHTML = ICONS.zoomReset
    reset.addEventListener('click', () => viewer.resetZoom())
    counter = el('div', 'gallerist-counter')
    position = el('div', 'gallerist-position')
    position.hidden = true
    chrome.append(close, prev, next, prevItem, nextItem, reset, counter, position)
    root.appendChild(chrome)
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
      if (rec && it && rec.itemId === it.id && rec.overlayItemId === it.id) {
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
            if (groupIndex(slideKey) !== viewer.getState().cursor.g) return // no longer current
            r.overlayItemId = undefined // force a repaint at the now-known natural size
            if (attached) renderWindow()
          })
          .catch((error) => {
            // A load we cancelled (slide torn down, item swapped out) is not a failure — adapters
            // reject `ready` on abort, and reporting it would mark the item 'error'.
            if (abort.signal.aborted) return
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
          // Repaint (re-invokes user render() + rebuilds DOM) only when the item changes.
          // On a zoom-only change, update retained overlays in place (spec §9.2: no rebuild).
          if (rec.overlayItemId !== it.id) {
            const r = stage.getBoundingClientRect()
            const stageSize = { w: r.width, h: r.height }
            rec.overlayEls = paintOverlays(
              viewportLayer,
              rec.overlayHost,
              gatherOverlays(group, it, currentGlobalOverlays()),
              {
                group,
                item: it,
                viewer,
                zoom: state.zoom,
                stage: stageSize,
                natural: rec.media?.naturalSize?.() ?? stageSize,
              },
            )
            rec.overlayItemId = it.id
          } else if (rec.overlayEls) {
            updateOverlays(rec.overlayEls, state.zoom.scale)
          }
        }
      } else {
        rec.slide.removeAttribute('data-gallerist-current')
        rec.content.removeAttribute('data-gallerist-current')
        rec.overlayHost.replaceChildren()
        rec.overlayEls = undefined
        rec.overlayItemId = undefined
      }
    }
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

  // within-group position: segmented pills for small groups, a mono counter for large ones (UX-H)
  const PILL_MAX = 8
  const updatePosition = (g: number, i: number, itemCount: number) => {
    if (!position) return
    if (itemCount <= 1) {
      if (posM !== 0) {
        position.replaceChildren()
        position.removeAttribute('data-mode')
        posG = -1
        posM = 0
      }
      position.hidden = true
      return
    }
    position.hidden = false
    if (itemCount > PILL_MAX) {
      position.dataset.mode = 'counter'
      position.textContent = `${i + 1} / ${itemCount}`
      posG = g
      posM = itemCount
      return
    }
    if (g !== posG || itemCount !== posM || position.dataset.mode !== 'pills') {
      position.dataset.mode = 'pills'
      position.replaceChildren()
      const label = el('span', 'gallerist-position-label')
      label.textContent = 'screen'
      position.appendChild(label)
      for (let k = 0; k < itemCount; k++) {
        const pill = el('button', 'gallerist-pill', {
          type: 'button',
          'aria-label': `Screen ${k + 1}`,
        })
        pill.textContent = String(k + 1)
        pill.addEventListener('click', () => viewer.goTo(g, k))
        position.appendChild(pill)
      }
      posG = g
      posM = itemCount
    }
    for (const [k, pill] of position.querySelectorAll('.gallerist-pill').entries()) {
      if (k === i) pill.setAttribute('data-active', '')
      else pill.removeAttribute('data-active')
    }
  }

  // gate chrome updates to cursor/collection changes — skip zoom/pan commits (mirrors the rail)
  let chromeG = -1
  let chromeI = -1
  let chromeCol: unknown = null
  const updateChrome = () => {
    const col = viewer.getCollection()
    const cur = viewer.getState().cursor
    if (col === chromeCol && cur.g === chromeG && cur.i === chromeI) return
    chromeCol = col
    chromeG = cur.g
    chromeI = cur.i
    const G = col.groups.length
    const itemCount = col.groups[cur.g]?.items.length ?? 0
    // Announce the item's own description alongside the position so SR users hear what they
    // navigated to, not just the index (S-UX4).
    const alt = col.groups[cur.g]?.items[cur.i]?.alt
    const desc = alt ? ` — ${alt}` : ''
    if (linear) {
      // flat linear: one running position across all items; the within-group pills retire.
      const pos = flatPosition(cur.g, cur.i) + 1 // flatPosition() also rebuilds flatSeq if needed
      const total = flatSeq.length
      if (counter) counter.textContent = `${pos} / ${total}`
      if (position) position.hidden = true
      live.textContent = `Item ${pos} of ${total}${desc}`
    } else {
      if (counter) counter.textContent = `${cur.g + 1} / ${G}`
      updatePosition(cur.g, cur.i, itemCount)
      live.textContent =
        itemCount > 1
          ? `Group ${cur.g + 1} of ${G}, screen ${cur.i + 1} of ${itemCount}${desc}`
          : `Group ${cur.g + 1} of ${G}${desc}`
    }
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
      renderWindow()
      updateChrome()
    }
  }

  // Keyboard zoom pivots on the stage centre (zoomTo's default pivot), spec §5; the zoom bounds
  // clamp the scale and pan.
  const zoomAroundCenter = (factor: number) => viewer.zoomTo(viewer.zoom.scale * factor)

  // ── keyboard (spec §5) ───────────────────────────────────────────────────────
  // Which physical arrow drives which axis depends on orientation (point 5): a vertical (left/right)
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

  const onKey = (e: KeyboardEvent) => {
    // Don't hijack typing inside an embedded control (overlay input/textarea/etc); Escape still
    // closes from anywhere (I-UX2).
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
        viewer.close()
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
      // Phase 0 coordinate model: the media is CSS-contained (object-fit) so the content
      // layer fills the stage and scale 1 == fit. Pan bounds therefore use the stage size;
      // the media's true pixel size drives only the CSS layout. (Natural-coordinate overlays
      // map through the contained rect in M4.)
      return {
        stageRect: { left: r.left, top: r.top, width: r.width, height: r.height },
        naturalSize: { w: r.width, h: r.height },
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
  // layer, so fit == scale 1 and pan bounds use the stage size.
  const stageSize = () => {
    const r = stage.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }
  const constrainZoom = (z: ZoomState): ZoomState => {
    const size = stageSize()
    if (!(size.w > 0 && size.h > 0)) return z // not laid out (closed overlay): nothing to clamp to
    return clampPan({ scale: clampScale(z.scale, 1, MAX_ZOOM), x: z.x, y: z.y }, size, size)
  }
  const offZoomBounds = internals.setZoomBounds({
    center: () => {
      const size = stageSize()
      return { x: size.w / 2, y: size.h / 2 }
    },
    constrain: constrainZoom,
  })

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
      const cur = currentRec()
      if (cur) cur.overlayItemId = undefined // re-anchor overlays against the new stage rect
      const z = viewer.getState().zoom
      const clamped = constrainZoom(z)
      if (clamped.scale !== z.scale || clamped.x !== z.x || clamped.y !== z.y) {
        internals.setZoom(clamped) // commit → sync → repaint
      } else {
        renderWindow() // repaint overlays at the new rect
      }
    })
  }
  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onStageResize) : null
  resizeObserver?.observe(stage)

  // ── plugin regions (spec §13) ──────────────────────────────────────────────
  const mountPluginRegions = createRegionMounter(regionHosts, { viewer })
  const mountRegions = () => {
    pluginKeymap = aggregateKeymap(internals.getPlugins())
    mountPluginRegions(internals.getPlugins())
    // attach the pull-handle into the rail region (only when a rail is mounted); the mounter
    // replaces a host's children when its plugin nodes change, so (re)prepend it each time.
    if (regionHosts.thumbnails.childElementCount > 0) {
      regionHosts.thumbnails.prepend(railHandle)
    }
    // plugin overlays may have changed (e.g. React <Gallerist.Overlay> mount/unmount) → force repaint
    const cur = currentRec()
    if (cur) cur.overlayItemId = undefined
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
      cancelPhaseWait?.()
      offLifecycle() // settles a transition in flight, so `closed` still fires
      detachGestures()
      resizeObserver?.disconnect()
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      idle?.destroy()
      document.removeEventListener('fullscreenchange', onFsChange)
      root.removeEventListener('keydown', onKey)
      for (const rec of mounted.values()) teardownSlide(rec)
      mounted.clear()
      detach()
      if (!overlay) root.remove()
    },
  }
}
