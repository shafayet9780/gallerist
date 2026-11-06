// @gallerist/plugin-thumbnails — windowed thumbnail rail (spec §10.3, §14).
//
// Three display modes (`groupDisplay`):
//  • 'stacked' (default): one card per group; multi-item groups stack with a count badge. The
//    active multi-item group expands its item thumbs (secondary axis), and hovering/focusing any
//    OTHER multi-item card opens a transient *peek* flyout of its items — preview without
//    navigating in. Touch (no hover) gets an explicit expand affordance on the card.
//  • 'flat': every item of every group renders side-by-side as its own card, each group's run
//    wrapped in a group (its label over its items, a divider between groups) so it reads as one
//    group. Item-windowed so it stays bounded even for huge galleries or one giant group. The rail
//    marks its region `data-gallerist-linear`, which turns the renderer's linear traversal on by
//    default (←/→ walk the items in rail order).
//  • 'index': a section index. One row per group (cover, `group.caption`, `group.meta.subtitle`, item
//    count); the active group's items expand in place under its row. On a bottom rail, or any rail at
//    900px wide or less, the rows become a strip of chips.
//
// Reconcile-in-place (M14 UX-B): the rail is NOT torn down on cursor moves. Cursor moves flip
// `data-active` on the previous and the new active thumb only, and scroll the active one into view
// with a card of context on each side (centred once a neighbour would be cut off, see reveal()).
//
// Windowing (U17): the rail draws a contiguous run of cards, what fits in its scroller plus a few each
// side, and follows its own scroll: when the middle of the rail moves, cards that left the run are
// removed and the ones that entered are inserted in place (the rest stay put), with the scroll offset
// corrected so nothing on screen moves. A cursor outside the run re-centres it on the cursor.
//
// Live switch: `setGroupDisplay(viewer, display)` (or the instance's `setDisplay()`) changes the
// display of a mounted rail. The nodes the renderer holds (the rail region, the aside column, the
// toolbar toggle) stay; what's in them is drawn again for the new display around the current item,
// and `viewer.refresh()` tells the renderer to read the region's linear marker again.
//
// Motion (motion.ts): the rail collapsing to its handle (the renderer's `data-gallerist-rail`, from
// the handle, `t` or fullscreen) and a stacked rail's item column opening and closing glide to their
// new size instead of jumping, unless the user prefers reduced motion.
//
// Pull, don't scroll (scroll.ts): the rail shows no scrollbar. A mouse or pen drags it, a vertical
// wheel scrolls a sideways rail, its ends fade where there's more, and ‹ › buttons there page it.

import type {
  Group,
  Item,
  MediaSource,
  Plugin,
  PluginInstance,
  RegionCtx,
  ViewerApi,
} from '@gallerist/core'
import { ICONS, getInternals } from '@gallerist/core/internal'
import { GLIDE, createGlides, sizeOf } from './motion'
import { type Strip, attachStrip } from './scroll'
import { type Axis, axisOf, keepPlace, measureRun, middleOf, spanAround } from './strip'

/** Cards drawn beyond the visible ones on each side, so a step or a short scroll lands on drawn cards. */
const MARGIN = 3
/** Cards on each side of the cursor while the rail has no layout to measure. */
const FALLBACK = 8

export interface ThumbnailsOptions {
  /**
   * Cards drawn on each side of the card in the middle of the rail; scrolling the rail draws the ones
   * it reaches. A jump to a card outside the drawn run first draws around that card (wide enough for
   * it to land at either edge of the rail), and the scroll that reveals it trims the run back to the
   * middle. By default the rail measures itself and draws what fits plus 3 cards on each side (8 on
   * each side before it has a layout to measure). A number fixes the bound, but never below what
   * fits (half the visible cards each side), so the rail is never drawn with gaps. Group cards, or
   * item cards in `flat` mode.
   */
  overscan?: number
  /**
   * Layout of the active group's item thumbs (the secondary ↑/↓ axis), in `stacked` mode.
   * `vertical` (default) stacks them in a column so the highlight moves up/down with the input
   * direction; `horizontal` keeps the legacy inline row. Ignored in `flat` mode.
   */
  itemAxis?: 'vertical' | 'horizontal'
  /**
   * How multi-item groups are shown in the rail. `stacked` (default) collapses each group to one
   * card (hover/focus to peek its items, or tap the expand affordance on touch); `flat` lays every
   * item out side-by-side, each group under its label with a divider between groups, and makes the
   * renderer's `linear` traversal the default; `index` lists named sections with their counts and
   * expands the active one (its items always run as a row). The display the rail starts with:
   * `setGroupDisplay(viewer, display)` switches a mounted rail.
   */
  groupDisplay?: GroupDisplay
  /**
   * Auto-expand the active multi-item group's item panel (`stacked` and `index` modes). Default `true`. Users
   * can hide/show it with the toolbar items-toggle button or the `e` key; the chosen state persists
   * as you navigate. Ignored in `flat` mode (every item is already laid out).
   */
  expandActive?: boolean
  /**
   * Time labels on the rail (`stacked` and `flat` modes), the current group's in the accent.
   * Stacked: a label with a tick above each group card, joined by a track line. Flat: the label
   * heads each group, in place of its `caption` (which still shows where a group has no label).
   * `true` reads the label from `group.meta.time` (a string); a function returns it. The label is
   * part of the card's (flat: the group's) accessible name.
   */
  timeline?: boolean | ((group: Group, index: number) => string | undefined)
  /** Number the item thumbs (1, 2, 3…) in the item stack and peek, so items can be referred to. */
  numberItems?: boolean
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<ThumbnailsStrings>
}

/** How the rail shows groups: see `ThumbnailsOptions.groupDisplay`. */
export type GroupDisplay = 'stacked' | 'flat' | 'index'

/**
 * The plugin's instance on one viewer (in `getInternals(viewer).getPlugins()`, named `thumbnails`).
 * Code that can't import this package finds the rail by these two members: `@gallerist/plugin-view`
 * and React's `groupDisplay` prop do.
 */
export interface ThumbnailsInstance extends PluginInstance {
  /** The rail's display; `undefined` until it has mounted. */
  readonly display: GroupDisplay | undefined
  /** Switch this viewer's rail to `display` (see `setGroupDisplay`). */
  setDisplay(display: GroupDisplay): void
}

// the viewer's thumbnails rails (one owns the rail region: the last registered)
const railsOf = (viewer: ViewerApi) =>
  getInternals(viewer)
    .getPlugins()
    .filter(
      (p): p is ThumbnailsInstance =>
        p.name === 'thumbnails' && typeof (p as ThumbnailsInstance).setDisplay === 'function',
    )

/** The display of the viewer's thumbnails rail; `undefined` until one has mounted. */
export function getGroupDisplay(viewer: ViewerApi): GroupDisplay | undefined {
  return railsOf(viewer).pop()?.display
}

/**
 * Show `display` in the viewer's thumbnails rail, keeping the current item: the rail is drawn again
 * around it, and the renderer follows (a flat rail turns linear traversal on unless `mount()` was
 * given `linear`). Applied like an explicit `groupDisplay`, so the preset rules hold: the preset's
 * `timeline` carries over, its `itemAxis` and `numberItems` apply only to its own display. Before the
 * rail mounts, it's the display the rail mounts with (and it stays for later mounts of the viewer).
 * An unknown display is ignored. With several thumbnails plugins, it's the last registered one's,
 * the rail that shows. Returns whether the viewer has a thumbnails rail.
 */
export function setGroupDisplay(viewer: ViewerApi, display: GroupDisplay): boolean {
  const rail = railsOf(viewer).pop() // the one whose rail shows
  rail?.setDisplay(display)
  return !!rail
}

export interface ThumbnailsStrings {
  /** accessible name of the rail */
  rail: string
  /** an unnamed group's name, and a group card's accessible name */
  group: (n: number) => string
  /** a group's accessible name with its label: the timeline's, or on a flat rail its caption */
  groupAt: (n: number, time: string) => string
  /** an index row's accessible name */
  section: (name: string, subtitle: string | undefined, count: number) => string
  /** an item thumb's accessible name */
  item: (n: number) => string
  /** accessible name of the peek flyout */
  preview: (n: number) => string
  /** the touch button that opens the peek */
  previewButton: (n: number) => string
  /** accessible name of the active group's item panel */
  groupItems: string
  /** the toolbar button that shows and hides that panel */
  toggleItems: string
}

export const DEFAULT_THUMBNAILS_STRINGS: ThumbnailsStrings = {
  rail: 'Thumbnails',
  group: (n) => `Group ${n}`,
  groupAt: (n, time) => `Group ${n}, ${time}`,
  section: (name, subtitle, count) => `${name}${subtitle ? `, ${subtitle}` : ''} (${count})`,
  item: (n) => `Item ${n}`,
  preview: (n) => `Group ${n} preview`,
  previewButton: (n) => `Preview group ${n}`,
  groupItems: 'Group items',
  toggleItems: 'Toggle group items',
}

const metaTime = (group: Group): string | undefined => {
  const time = (group.meta as { time?: unknown } | undefined)?.time
  return typeof time === 'string' ? time : undefined
}

const metaSubtitle = (group: Group): string | undefined => {
  const subtitle = (group.meta as { subtitle?: unknown } | undefined)?.subtitle
  return typeof subtitle === 'string' ? subtitle : undefined
}

function thumbUrl(source: MediaSource | undefined): string | null {
  if (!source) return null
  if (typeof source === 'string') return source
  if ('src' in source) return source.src
  return null // loader/tiles: skipped in the rail
}

function groupThumb(group: Group): string | null {
  return (
    thumbUrl(group.thumb) ?? thumbUrl(group.items[0]?.thumb) ?? thumbUrl(group.items[0]?.source)
  )
}

function lazyImg(src: string | null, observer: IntersectionObserver | null): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'gallerist-thumb-img'
  img.decoding = 'async'
  img.loading = 'lazy'
  img.alt = '' // decorative — the enclosing button carries the accessible name
  if (!src) return img
  if (observer) {
    img.dataset.src = src
    observer.observe(img)
  } else {
    img.src = src // no IntersectionObserver (e.g. SSR/test) → load eagerly
  }
  return img
}

/** Display caption string, if one was explicitly provided (no `alt` fallback — UX-G). */
function captionOf(x: { caption?: unknown }): string | undefined {
  return typeof x.caption === 'string' ? x.caption : undefined
}

function appendCaption(btn: HTMLElement, text: string | undefined): void {
  if (!text) return
  const cap = document.createElement('span')
  cap.className = 'gallerist-thumb-caption'
  cap.textContent = text
  btn.appendChild(cap)
}

function toggleAriaCurrent(btn: HTMLElement, on: boolean): void {
  if (on) btn.setAttribute('aria-current', 'true')
  else btn.removeAttribute('aria-current')
}

/** Mark a thumb (or a card's wrapper, which only takes `data-active`) active or not; a no-op when it
 *  already is, so a step writes to the two thumbs that changed and nothing else. */
function setActiveAttr(el: HTMLElement, active: boolean): void {
  if (el.hasAttribute('data-active') === active) return
  toggleAttr(el, 'data-active', active)
  if (el.tagName !== 'BUTTON') return
  // index rows are plain buttons (their list holds a listbox of items, which can't nest in another)
  if (el.getAttribute('role') === 'option') el.setAttribute('aria-selected', String(active))
  else toggleAriaCurrent(el, active)
}

/** Place a listbox option in its whole list: the rail draws only a run of it. */
function setPos(el: HTMLElement, pos: number, size: number): void {
  el.setAttribute('aria-posinset', String(pos))
  el.setAttribute('aria-setsize', String(size))
}

function toggleAttr(el: HTMLElement, name: string, on: boolean): void {
  if (on) el.setAttribute(name, '')
  else el.removeAttribute(name)
}

function thumbButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.setAttribute('role', 'option')
  btn.setAttribute('aria-selected', 'false')
  btn.setAttribute('aria-label', label)
  btn.addEventListener('click', onClick)
  return btn
}

// Brings the current card into view with context around it, scrolling only the viewer's own panels
// (scrollIntoView would also scroll the page, moving an inline viewer's host page every time the
// cursor changes). `around` are the cards next to it in its run (the rail's sequence, or the
// group's items), where drawn. While the card and those neighbours all show whole, nothing moves,
// so a click on a card in view doesn't shift the rail. Once one of them is cut by an edge or past
// it, the panel centres the card, which leaves about half a panel of what comes next in view,
// whichever way the cursor went. Cards of different widths (index chips) can leave a wider
// neighbour cut once centred: where the three fit, the scroll goes on from the centre just as far
// as shows them all. The browser clamps that at either end of the rail, so the first and last
// cards stop at their edges. Instant, as every scroll of the rail is (there is no motion
// to take out under prefers-reduced-motion).
function reveal(btn: HTMLElement | undefined, ...around: Array<HTMLElement | undefined>): void {
  if (!btn) return
  const target = btn.getBoundingClientRect()
  if (!target.width && !target.height) return // hidden (an index chip's items): nothing to reveal
  for (let box = btn.parentElement; box; box = box.parentElement) {
    if (box.classList.contains('gallerist')) return
    const { overflowX, overflowY } = getComputedStyle(box)
    if (/auto|scroll/.test(overflowX)) box.scrollLeft += centreBy(box, btn, around, 'left', 'right')
    if (/auto|scroll/.test(overflowY)) box.scrollTop += centreBy(box, btn, around, 'top', 'bottom')
  }
}

/** How far to scroll `box` along one axis: 0 while `btn` and its neighbours show whole, else what
 *  centres `btn` in it, moved on as little as shows them all where they fit. A neighbour with no
 *  box (not laid out, hidden) doesn't count. */
function centreBy(
  box: HTMLElement,
  btn: HTMLElement,
  around: Array<HTMLElement | undefined>,
  lo: 'left' | 'top',
  hi: 'right' | 'bottom',
): number {
  const edge = box.getBoundingClientRect()
  const rs = [btn, ...around].flatMap((el) => {
    const r = el?.getBoundingClientRect()
    return r && (r.width || r.height) ? [r] : []
  })
  if (rs.every((r) => r[lo] >= edge[lo] - 1 && r[hi] <= edge[hi] + 1)) return 0
  const r = btn.getBoundingClientRect()
  const by = (r[lo] + r[hi] - edge[lo] - edge[hi]) / 2
  // the scrolls that show every card whole run from `from` to `to` (none: they don't fit)
  const from = Math.max(...rs.map((q) => q[hi])) - edge[hi]
  const to = Math.min(...rs.map((q) => q[lo])) - edge[lo]
  return from > to + 1 ? by : Math.min(Math.max(by, from), to)
}

/** Whether the primary pointer can hover (desktop). Defaults true when undetectable (SSR/test). */
function canHover(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(hover: hover)').matches ?? true
}

const DISPLAYS = ['stacked', 'flat', 'index'] as const
const AXES = ['vertical', 'horizontal'] as const
// a preset's options that only make sense with the group display it was designed for (its
// `timeline` is not one: stacked and flat both draw it)
const LAYOUT_KEYS = ['itemAxis', 'numberItems'] as const
/** `value` if it is one of `known`, else the first (the default). */
const oneOf = <T extends string>(known: readonly T[], value: unknown): T =>
  known.includes(value as T) ? (value as T) : (known[0] as T)

interface FlatEntry {
  g: number
  i: number
  groupId: string
  itemId: string
}

// The options for `display` (the explicit one when undefined) under a preset's defaults: an option
// left unset takes the preset's, an explicit one wins. The preset's item axis and numbering belong to
// its own group display: a display that differs from it starts from the plugin's defaults for those.
const settle = (
  opts: ThumbnailsOptions,
  preset: ThumbnailsOptions,
  display?: GroupDisplay,
): ThumbnailsOptions => {
  const explicit = display ? { ...opts, groupDisplay: display } : opts
  const o: ThumbnailsOptions = { ...preset }
  if (
    explicit.groupDisplay !== undefined &&
    explicit.groupDisplay !== oneOf(DISPLAYS, preset.groupDisplay)
  )
    for (const k of LAYOUT_KEYS) delete o[k]
  for (const [k, v] of Object.entries(explicit)) if (v !== undefined) Object.assign(o, { [k]: v })
  return o
}

export function thumbnails(opts: ThumbnailsOptions = {}): Plugin {
  return (viewer: ViewerApi): ThumbnailsInstance => {
    const t: ThumbnailsStrings = { ...DEFAULT_THUMBNAILS_STRINGS, ...opts.strings }
    // The options settle when the rail region mounts (configure): an option left unset takes the
    // mounted preset's default (`RegionCtx.preset.thumbnails`, e.g. the reviewer's timeline), an
    // explicit one wins. Until then they hold the explicit options alone. A display set at run time
    // (setDisplay) counts as an explicit `groupDisplay`.
    let o: ThumbnailsOptions = opts
    let preset: ThumbnailsOptions = {}
    let want: GroupDisplay | undefined // the display asked for at run time, if any
    let groupDisplay: GroupDisplay = 'stacked'
    let isIndex = false
    let isFlat = false
    let itemAxis: NonNullable<ThumbnailsOptions['itemAxis']> = 'vertical'
    let timeLabel: ((group: Group, index: number) => string | undefined) | null = null
    let panelOpen = true // whether the active group's item panel is shown (toggle: button / `e`)
    const configure = () => {
      o = settle(opts, preset, want)
      // untyped values (a renderer's preset, plain JS) outside the known ones take the default
      groupDisplay = oneOf(DISPLAYS, o.groupDisplay)
      isIndex = groupDisplay === 'index'
      isFlat = groupDisplay === 'flat'
      itemAxis = isIndex ? 'horizontal' : oneOf(AXES, o.itemAxis)
      timeLabel =
        !isIndex && o.timeline ? (typeof o.timeline === 'function' ? o.timeline : metaTime) : null
    }
    configure()
    // `regionEl` is the node handed to the renderer's `thumbnails` region; `root` (the scrollable
    // rail) lives inside it, and the floating panels (item column / peek) are siblings of `root`
    // inside `regionEl`. The renderer `replaceChildren()`s region hosts on every plugin-set change
    // (regions.ts) and re-appends only the region node — so the panels MUST live inside `regionEl`
    // to survive a late `viewer.use()`, not be bare children of the host.
    let regionEl: HTMLElement | null = null
    let root: HTMLElement | null = null
    let itemRow: HTMLElement | null = null
    // A vertical item stack goes in the renderer's `aside` column (beside the stage, taking space
    // rather than covering it); a horizontal row stays inline in the rail region.
    let asideEl: HTMLElement | null = null
    let toolbarBtn: HTMLButtonElement | null = null
    let unsub: (() => void) | null = null
    let hoverCapable = true
    // the viewer's root, once the rail is in it, and what it last said about the rail's collapse
    let viewerRoot: HTMLElement | null = null
    let strip: Strip | null = null // the rail's drag, wheel, end fades and page buttons
    let railObs: MutationObserver | null = null
    let railCollapsed = false
    const glides = createGlides(
      () =>
        Number.parseFloat(
          viewerRoot ? getComputedStyle(viewerRoot).getPropertyValue('--gallerist-dur-panel') : '',
        ) || 220,
    )

    // Reconcile state. Group cards + item buttons are keyed by id so we can flip active state and
    // reorder without destroying nodes.
    let lastCol: object | null = null
    let lastG = -1
    let lastI = -1
    let lastActiveGroupId: string | null = null
    let activeEls: HTMLElement[] = [] // the thumbs (and card wrappers) now marked active
    let liveCardId: string | null = null // group card currently showing a live item preview
    // the drawn run: positions winStart..winEnd of the sequence (groups; flat: items), inclusive
    let winStart = 0
    let winEnd = -1
    let axis: Axis | null = null // which way the rail scrolls, once measured
    let perView = 0 // cards that fit in the rail, once measured
    let resizeObs: ResizeObserver | null = null
    let frame = 0 // pending rAF for a scroll/resize re-window
    const groupBtns = new Map<string, HTMLButtonElement>()
    const itemBtns = new Map<string, HTMLButtonElement>()
    const coverUrls = new Map<string, string | null>() // group id → its fixed cover thumb
    const cardHost = new Map<string, HTMLElement>() // group id → node appended to the rail (card or wrap)

    // peek (stacked mode): a transient flyout previewing a non-active group's items.
    let peekRow: HTMLElement | null = null
    let peekGroupId: string | null = null
    let peekTimer: ReturnType<typeof setTimeout> | null = null

    // flat mode: a flattened (g,i) sequence + the group wrappers that bracket runs of items.
    let flat: FlatEntry[] = []
    const flatPos = new Map<string, number>() // `${g}:${i}` → flat index
    const groupIndexById = new Map<string, number>()
    const groupWraps = new Map<string, HTMLElement>()

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                const img = e.target as HTMLImageElement
                // skip imgs pinned by the live-preview (setCardImage); don't clobber their src
                if (!img.dataset.live && img.dataset.src) img.src = img.dataset.src
                observer?.unobserve(img)
              }
            }
          })
        : null

    // placed within its group (1-based), which may be drawn only in part
    const buildItemButton = (item: Item, gIndex: number, iIndex: number): HTMLButtonElement => {
      const btn = thumbButton(t.item(iIndex + 1), 'gallerist-thumb-item', () =>
        viewer.goTo(gIndex, iIndex),
      )
      setPos(btn, iIndex + 1, viewer.getCollection().groups[gIndex]?.items.length ?? 0)
      btn.dataset.item = item.id
      btn.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
      if (o.numberItems) {
        const num = document.createElement('span')
        num.className = 'gallerist-thumb-num'
        num.setAttribute('aria-hidden', 'true') // the label already says "Item n"
        num.textContent = String(iIndex + 1)
        btn.appendChild(num)
      }
      appendCaption(btn, captionOf(item))
      return btn
    }

    // Fill a column/flyout with one item button per group item; `track` registers them in itemBtns
    // (the active-state map) — peek flyouts are presentation-only and pass `track: false`.
    const fillColumn = (container: HTMLElement, group: Group, gIndex: number, track: boolean) => {
      container.replaceChildren()
      group.items.forEach((item, i) => {
        const ib = buildItemButton(item, gIndex, i)
        if (track) itemBtns.set(item.id, ib)
        container.appendChild(ib)
      })
    }

    // ── peek flyout ──────────────────────────────────────────────────────────
    const removePeek = () => {
      if (peekRow) {
        peekRow.remove()
        peekRow = null
      }
      peekGroupId = null
    }
    const cancelPeekClose = () => {
      if (peekTimer != null) {
        clearTimeout(peekTimer)
        peekTimer = null
      }
    }
    const closePeek = () => {
      cancelPeekClose()
      removePeek()
    }
    const schedulePeekClose = () => {
      cancelPeekClose()
      peekTimer = setTimeout(closePeek, 120)
    }
    const openPeek = (group: Group, gIndex: number, host: HTMLElement) => {
      if (!root || groupDisplay !== 'stacked') return
      if (group.items.length <= 1) return // nothing to preview
      // skip only when the active group's own panel is already showing it (avoids a double panel);
      // if that panel is hidden/dismissed, hovering the active card peeks like any other (point 1).
      if (group.id === lastActiveGroupId && panelOpen && itemRow) return
      if (peekGroupId === group.id) return // already open
      cancelPeekClose()
      removePeek()
      const col = document.createElement('div')
      col.className = 'gallerist-thumb-peek'
      // its own listbox (a sibling of the rail on the region host, not nested in it) → valid `option`
      // children. aria-label distinguishes it from the rail's "Thumbnails" listbox.
      col.setAttribute('role', 'listbox')
      col.setAttribute('aria-label', t.preview(gIndex + 1))
      col.dataset.axis = itemAxis
      fillColumn(col, group, gIndex, false)
      // Mount in `regionEl` (a sibling of the rail), not inside `.gallerist-thumbs`: the rail's overflow
      // + backdrop-filter makes it a clipping containing block. `regionEl` is positioned + unclipped
      // and is preserved across region remounts, so the flyout shows, stays clickable, and survives.
      const mountEl = regionEl ?? root
      const cardRect = host.getBoundingClientRect()
      const baseRect = mountEl.getBoundingClientRect()
      col.style.left = `${cardRect.left - baseRect.left}px`
      col.addEventListener('mouseenter', cancelPeekClose)
      col.addEventListener('mouseleave', schedulePeekClose)
      mountEl.appendChild(col)
      peekRow = col
      peekGroupId = group.id
    }

    // ── stacked mode ─────────────────────────────────────────────────────────
    // ── index mode ───────────────────────────────────────────────────────────
    const buildIndexRow = (group: Group, gIndex: number): HTMLButtonElement => {
      const name = captionOf(group) ?? t.group(gIndex + 1)
      const subtitle = metaSubtitle(group)
      const count = group.items.length
      const label = t.section(name, subtitle, count)
      const btn = thumbButton(label, 'gallerist-thumb-row', () => viewer.goTo(gIndex))
      btn.removeAttribute('role')
      btn.removeAttribute('aria-selected')
      btn.dataset.group = group.id
      btn.appendChild(lazyImg(groupThumb(group), observer))
      const text = document.createElement('span')
      text.className = 'gallerist-thumb-row-text'
      const nameEl = document.createElement('span')
      nameEl.className = 'gallerist-thumb-row-name'
      nameEl.textContent = name
      text.appendChild(nameEl)
      if (subtitle) {
        const sub = document.createElement('span')
        sub.className = 'gallerist-thumb-row-sub'
        sub.textContent = subtitle
        text.appendChild(sub)
      }
      btn.appendChild(text)
      const badge = document.createElement('span')
      badge.className = 'gallerist-thumb-row-count'
      badge.textContent = String(count)
      btn.appendChild(badge)
      const wrap = document.createElement('div')
      wrap.className = 'gallerist-thumb-section'
      wrap.dataset.group = group.id
      wrap.appendChild(btn)
      cardHost.set(group.id, wrap)
      return btn
    }

    const buildGroupCard = (group: Group, gIndex: number): HTMLButtonElement => {
      if (isIndex) return buildIndexRow(group, gIndex)
      const multi = group.items.length > 1
      const btn = thumbButton(
        t.group(gIndex + 1),
        `gallerist-thumb${multi ? ' gallerist-thumb-stacked' : ''}`,
        () => viewer.goTo(gIndex),
      )
      btn.dataset.group = group.id
      setPos(btn, gIndex + 1, viewer.getCollection().groups.length)
      const cover = groupThumb(group)
      coverUrls.set(group.id, cover)
      btn.appendChild(lazyImg(cover, observer))
      if (multi) {
        const badge = document.createElement('span')
        badge.className = 'gallerist-thumb-count'
        badge.textContent = String(group.items.length)
        btn.appendChild(badge)
      }
      appendCaption(btn, captionOf(group))

      // peek wiring (multi-item groups only) — `host` is the node appended to the rail, so the
      // flyout anchors to it; on touch the card is wrapped so a sibling expand button is valid HTML.
      // A timeline wraps every card, with its label above.
      let host: HTMLElement = btn
      const time = timeLabel?.(group, gIndex)
      const wrapCard = () => {
        if (host !== btn) return host
        const wrap = document.createElement('div')
        wrap.className = 'gallerist-thumb-wrap'
        wrap.dataset.group = group.id
        wrap.appendChild(btn)
        host = wrap
        return wrap
      }
      if (timeLabel) {
        const wrap = wrapCard()
        const label = document.createElement('span')
        label.className = 'gallerist-thumb-time'
        label.setAttribute('aria-hidden', 'true') // folded into the card's name below
        const text = document.createElement('span')
        text.className = 'gallerist-thumb-time-text'
        text.textContent = time ?? ''
        label.appendChild(text)
        wrap.prepend(label)
        if (time) btn.setAttribute('aria-label', t.groupAt(gIndex + 1, time))
      }
      if (multi) {
        btn.addEventListener('focusin', () => openPeek(group, gIndex, host))
        btn.addEventListener('focusout', schedulePeekClose)
        if (hoverCapable) {
          btn.addEventListener('mouseenter', () => openPeek(group, gIndex, host))
          btn.addEventListener('mouseleave', schedulePeekClose)
        } else {
          const wrap = wrapCard()
          const caret = document.createElement('button')
          caret.type = 'button'
          caret.className = 'gallerist-thumb-expand'
          caret.setAttribute('aria-label', t.previewButton(gIndex + 1))
          caret.addEventListener('click', (e) => {
            e.stopPropagation()
            openPeek(group, gIndex, wrap)
          })
          wrap.appendChild(caret)
        }
      }
      cardHost.set(group.id, host)
      return btn
    }

    // a removed card's lazy image stops being watched (it would otherwise stay observed, detached)
    const drop = (el: Element) => {
      el.remove()
      for (const img of el.querySelectorAll('img')) observer?.unobserve(img)
    }

    // Run `redraw`; a focused thumb it took out of the document hands focus to the viewer, so the
    // keys keep working (focus would fall to <body>).
    const keepFocus = (redraw: () => void) => {
      const focused = document.activeElement
      const viewerEl = regionEl?.closest<HTMLElement>('.gallerist')
      redraw()
      if (focused instanceof HTMLElement && !focused.isConnected) {
        viewerEl?.focus({ preventScroll: true })
      }
    }

    // Put `node` right after `prev` (or first in `parent`), unless it already is there: cards that stay
    // in the run are already in order, so only the ones entering it are inserted.
    const place = (parent: Element, node: Element, prev: Element | null) => {
      const at = prev ? prev.nextSibling : parent.firstChild
      if (at !== node) parent.insertBefore(node, at)
    }

    // redraw the group rail as groups start..end, keeping the cards that stay (identity preserved)
    const rebuildRail = (
      col: ReturnType<ViewerApi['getCollection']>,
      start: number,
      end: number,
    ) => {
      if (!root) return
      const desiredIds = new Set<string>()
      for (let g = start; g <= end; g++) {
        const group = col.groups[g]
        if (group) desiredIds.add(group.id)
      }
      for (const [id, btn] of groupBtns) {
        if (!desiredIds.has(id)) {
          drop(cardHost.get(id) ?? btn)
          groupBtns.delete(id)
          coverUrls.delete(id) // keep the cover cache windowed too (avoids unbounded growth)
          cardHost.delete(id)
        }
      }
      let prev: Element | null = null
      for (let g = start; g <= end; g++) {
        const group = col.groups[g]
        if (!group) continue
        let btn = groupBtns.get(group.id)
        if (!btn) {
          btn = buildGroupCard(group, g)
          groupBtns.set(group.id, btn)
        }
        const host = cardHost.get(group.id) ?? btn
        place(root, host, prev)
        prev = host
      }
      // the active item column lives on the region host (see rebuildItemColumn), not the rail.
    }

    // Build/show the active group's item panel when `panelOpen`. A vertical stack is mounted in the
    // `aside` column; a horizontal row in the rail region (not inside `.gallerist-thumbs`, whose
    // overflow would clip it). While any group has several items the stack stays up even for a
    // one-item group, so the stage doesn't change width on every navigation.
    let collectionHasMulti = false
    const rebuildItemColumn = (activeGroup: Group | undefined, gIndex: number) => {
      if (!root) return
      itemBtns.clear()
      // the aside column when the renderer hosts one (asideEl is in the document); otherwise fall
      // back to the rail region rather than letting the stack silently disappear
      const mountEl =
        (isIndex && activeGroup ? cardHost.get(activeGroup.id) : null) ??
        (itemAxis === 'vertical' && asideEl?.parentNode ? asideEl : null) ??
        regionEl ??
        root
      const show =
        panelOpen &&
        !!activeGroup &&
        (activeGroup.items.length > 1 || (itemAxis === 'vertical' && collectionHasMulti))
      if (show && activeGroup) {
        if (!itemRow) {
          itemRow = document.createElement('div')
          itemRow.className = 'gallerist-thumb-items'
          // its own listbox (host-mounted sibling of the rail, not nested) → valid `option` children
          itemRow.setAttribute('role', 'listbox')
          itemRow.setAttribute('aria-label', t.groupItems)
          itemRow.setAttribute('aria-orientation', itemAxis)
          itemRow.dataset.axis = itemAxis
          // a mouse drags the stack too (it keeps its scrollbar: it sits on a panel)
          if (itemAxis === 'vertical') attachStrip(itemRow, null, () => 'y')
        }
        fillColumn(itemRow, activeGroup, gIndex, true)
        mountEl.appendChild(itemRow)
      } else if (itemRow) {
        itemRow.remove()
        itemRow = null
      }
    }

    // Swap a card's thumb image in place (active group's live preview). `url` is a
    // collection-provided thumbnail/source URL — same sink class as the main image adapter
    // (`img.src`, not a navigation/script sink), so no scheme allowlist by design; `data:` LQIP
    // thumbs are intentionally allowed. The `live` flag pins the src against the lazy observer.
    const setCardImage = (card: HTMLElement, url: string | null) => {
      const img = card.querySelector<HTMLImageElement>('.gallerist-thumb-img')
      if (!img) return
      img.dataset.live = '1'
      if (img.getAttribute('src') !== (url ?? '')) img.src = url ?? ''
    }

    // Active state, O(1) per step: unmark what was active, mark the thumbs for (g, i). Thumbs drawn
    // since (a re-drawn card, a rebuilt item column) are new elements, so they're compared by node.
    const markActive = (col: ReturnType<ViewerApi['getCollection']>, g: number, i: number) => {
      const activeGroup = col.groups[g]
      const activeGroupId = activeGroup?.id ?? null
      const activeItemId = activeGroup?.items[i]?.id ?? null
      const card = activeGroupId ? groupBtns.get(activeGroupId) : undefined
      // a card's wrapper, or (flat) the group the current item sits in
      const host = activeGroupId
        ? (cardHost.get(activeGroupId) ?? groupWraps.get(activeGroupId))
        : undefined
      const next = [card, host, activeItemId ? itemBtns.get(activeItemId) : undefined].filter(
        (el): el is HTMLElement => !!el,
      )
      for (const el of activeEls) if (!next.includes(el)) setActiveAttr(el, false)
      for (const el of next) setActiveAttr(el, true)
      activeEls = next

      // live-preview (UX-A): the active multi-item group's card mirrors the currently-viewed item;
      // restore a card's fixed cover once its group is no longer the live one.
      if (liveCardId && liveCardId !== activeGroupId) {
        const prev = groupBtns.get(liveCardId)
        if (prev) setCardImage(prev, coverUrls.get(liveCardId) ?? null)
        liveCardId = null
      }
      // an index row keeps its section's cover: the expanded items below it show the current one
      if (!isIndex && card && activeGroupId && activeGroup && activeGroup.items.length > 1) {
        const it = activeGroup.items[i]
        const url =
          thumbUrl(it?.thumb) ?? thumbUrl(it?.source) ?? coverUrls.get(activeGroupId) ?? null
        setCardImage(card, url)
        liveCardId = activeGroupId
      }
    }

    // Reveal the current card with the ones beside it in the rail (a flat rail's items in rail
    // order, across groups; else the group cards, or index rows), and the current item with its
    // neighbours in the group's item panel (the item column, an index section's items)
    const revealActive = (col: ReturnType<ViewerApi['getCollection']>, g: number, i: number) => {
      const at = isFlat ? (flatPos.get(`${g}:${i}`) ?? 0) : g
      const card = (k: number) =>
        isFlat ? itemBtns.get(flat[k]?.itemId ?? '') : groupBtns.get(col.groups[k]?.id ?? '')
      // Centring scrolls up to half the rail past what shows, and the drawn run reaches only a few
      // cards past it: when the rail is about to centre, draw what the centred card's half-rails
      // need first (keepPlace holds the screen still), or the scroll would stop at the run's end.
      // The scroll that follows trims the run back (rewindow).
      const btn = card(at)
      if (root && btn && axis && perView) {
        const [lo, hi] = axis === 'x' ? (['left', 'right'] as const) : (['top', 'bottom'] as const)
        if (centreBy(root, btn, [card(at - 1), card(at + 1)], lo, hi)) {
          const reach = Math.ceil(perView / 2) + 1
          setWindow(
            col,
            Math.min(winStart, Math.max(0, at - reach)),
            Math.max(winEnd, Math.min(seqLength(col) - 1, at + reach)),
          )
        }
      }
      reveal(btn, card(at - 1), card(at + 1))
      const items = col.groups[g]?.items ?? []
      const item = (k: number) => itemBtns.get(items[k]?.id ?? '')
      if (!isFlat) reveal(item(i), item(i - 1), item(i + 1))
    }

    const applyActive = (col: ReturnType<ViewerApi['getCollection']>, g: number, i: number) => {
      markActive(col, g, i)
      revealActive(col, g, i)
    }

    // re-evaluate the active item panel for the current cursor (used when `panelOpen` toggles, since
    // the cursor itself didn't change so `render` wouldn't otherwise rebuild it).
    const syncPanel = () => {
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      keepFocus(() => rebuildItemColumn(col.groups[cur.g], cur.g))
      applyActive(col, cur.g, cur.i)
    }

    // The item column beside the stage glides to its new width: open, it grows to the stack; closed,
    // the stack stays (inert) while the column narrows, then goes.
    const toggleActivePanel = () => {
      if (isFlat) return // a flat rail has no item panel (the toggle is hidden; `e` isn't claimed)
      panelOpen = !panelOpen
      toolbarBtn?.setAttribute('aria-pressed', String(panelOpen))
      if (panelOpen) closePeek() // the persistent panel supersedes a transient peek
      const column = !isIndex && itemAxis === 'vertical' && asideEl?.isConnected ? asideEl : null
      if (!column) return syncPanel()
      const from = sizeOf(column, 'width') // mid-glide: as far as it got
      glides.stop(column)
      const leaving = itemRow
      syncPanel()
      const to = sizeOf(column, 'width')
      if (leaving && !leaving.isConnected) {
        column.append(leaving)
        glides.glide(column, 'width', from, to, () => leaving.remove())
      } else glides.glide(column, 'width', from, to)
    }

    // The rail collapsing or coming back (the renderer flips `data-gallerist-rail` on its root): the
    // rail glides between its height (its width on a side rail) and none, and a stacked rail's item
    // column beside the stage between its width and none. A collapse that takes focus with it hands
    // focus to the viewer first.
    const onRailChange = () => {
      const collapsed = viewerRoot?.getAttribute('data-gallerist-rail') === 'collapsed'
      if (!viewerRoot || !regionEl || collapsed === railCollapsed) return
      railCollapsed = collapsed
      if (collapsed && regionEl.parentElement?.contains(document.activeElement))
        viewerRoot.focus({ preventScroll: true })
      const side = viewerRoot.getAttribute('data-gallerist-orientation') === 'vertical'
      for (const [el, dim] of [
        [regionEl, side ? 'width' : 'height'],
        [asideEl, 'width'],
      ] as const) {
        if (!el?.isConnected || el.hidden) continue
        const mid = glides.moving(el)
        el.setAttribute(GLIDE, '') // displayed (and so measured) while it moves
        const now = sizeOf(el, dim)
        glides.stop(el)
        el.setAttribute(GLIDE, '')
        const full = sizeOf(el, dim)
        if (collapsed) glides.glide(el, dim, now, 0)
        else glides.glide(el, dim, mid ? now : 0, full)
      }
    }
    const watchRail = () => {
      const root = regionEl?.closest<HTMLElement>('.gallerist') ?? null
      if (!root || root === viewerRoot || typeof MutationObserver === 'undefined') return
      railObs?.disconnect()
      viewerRoot = root
      railCollapsed = root.getAttribute('data-gallerist-rail') === 'collapsed'
      railObs = new MutationObserver(onRailChange)
      railObs.observe(root, { attributeFilter: ['data-gallerist-rail'] })
    }

    // ── flat mode ────────────────────────────────────────────────────────────
    const buildFlatModel = (col: ReturnType<ViewerApi['getCollection']>) => {
      flat = []
      flatPos.clear()
      groupIndexById.clear()
      col.groups.forEach((grp, g) => {
        groupIndexById.set(grp.id, g)
        grp.items.forEach((item, i) => {
          flatPos.set(`${g}:${i}`, flat.length)
          flat.push({ g, i, groupId: grp.id, itemId: item.id })
        })
      })
    }

    // A group's label (the timeline's, else its caption) heads it and joins its accessible name.
    const buildGroupWrapper = (group: Group, gIndex: number): HTMLElement => {
      const wrap = document.createElement('div')
      wrap.className = 'gallerist-thumb-group'
      wrap.dataset.group = group.id
      wrap.setAttribute('role', 'group')
      const label = timeLabel?.(group, gIndex) ?? captionOf(group)
      wrap.setAttribute('aria-label', label ? t.groupAt(gIndex + 1, label) : t.group(gIndex + 1))
      if (label) {
        const cap = document.createElement('span')
        cap.className = 'gallerist-thumb-group-cap'
        cap.setAttribute('aria-hidden', 'true') // already in the group's name
        cap.textContent = label
        wrap.appendChild(cap)
      }
      const row = document.createElement('div')
      row.className = 'gallerist-thumb-group-row'
      wrap.appendChild(row)
      return wrap
    }

    const rebuildRailFlat = (
      col: ReturnType<ViewerApi['getCollection']>,
      start: number,
      end: number,
    ) => {
      if (!root) return
      const desiredItemIds = new Set<string>()
      const desiredGroupIds = new Set<string>()
      const minI = new Map<string, number>()
      const maxI = new Map<string, number>()
      for (let fi = start; fi <= end; fi++) {
        const e = flat[fi]
        if (!e) continue
        desiredItemIds.add(e.itemId)
        desiredGroupIds.add(e.groupId)
        minI.set(e.groupId, Math.min(minI.get(e.groupId) ?? e.i, e.i))
        maxI.set(e.groupId, Math.max(maxI.get(e.groupId) ?? e.i, e.i))
      }
      // evict nodes that left the window
      for (const [id, btn] of itemBtns) {
        if (!desiredItemIds.has(id)) {
          drop(btn)
          itemBtns.delete(id)
        }
      }
      for (const [id, w] of groupWraps) {
        if (!desiredGroupIds.has(id)) {
          drop(w)
          groupWraps.delete(id)
        }
      }
      // place in window order, inserting only what entered (the rest is already in order)
      let curGroupId: string | null = null
      let prevWrap: Element | null = null
      let row: Element = root
      let prevBtn: Element | null = null
      for (let fi = start; fi <= end; fi++) {
        const e = flat[fi]
        if (!e) continue
        const grp = col.groups[e.g]
        const item = grp?.items[e.i]
        if (!grp || !item) continue
        let wrap = groupWraps.get(e.groupId)
        if (!wrap) {
          wrap = buildGroupWrapper(grp, e.g)
          groupWraps.set(e.groupId, wrap)
        }
        if (e.groupId !== curGroupId) {
          place(root, wrap, prevWrap)
          prevWrap = wrap
          curGroupId = e.groupId
          row = wrap.querySelector('.gallerist-thumb-group-row') ?? wrap
          prevBtn = null
        }
        let ib = itemBtns.get(e.itemId)
        if (!ib) {
          ib = buildItemButton(item, e.g, e.i) // placed within its group, like the item column
          itemBtns.set(e.itemId, ib)
        }
        place(row, ib, prevBtn)
        prevBtn = ib
      }
      // partial-edge flags (a group the drawn run cuts); the label shows only over a group's start
      for (const [id, wrap] of groupWraps) {
        const gi = groupIndexById.get(id)
        if (gi == null) continue
        const grp = col.groups[gi]
        if (!grp) continue
        const mn = minI.get(id) ?? 0
        const mx = maxI.get(id) ?? 0
        toggleAttr(wrap, 'data-partial-start', mn > 0)
        toggleAttr(wrap, 'data-partial-end', mx < grp.items.length - 1)
        const cap = wrap.querySelector<HTMLElement>('.gallerist-thumb-group-cap')
        if (cap) cap.hidden = mn > 0
      }
    }

    // wipe everything (collection identity changed — ids may be entirely different)
    const resetAll = () => {
      if (root) root.replaceChildren()
      observer?.disconnect() // every lazy image went with it
      groupBtns.clear()
      itemBtns.clear()
      coverUrls.clear()
      cardHost.clear()
      groupWraps.clear()
      removePeek()
      itemRow?.remove() // itemRow lives on the region host, so root.replaceChildren() won't catch it
      itemRow = null
      liveCardId = null
      winStart = 0
      winEnd = -1
      lastActiveGroupId = null
      activeEls = []
      flat = []
      flatPos.clear()
      groupIndexById.clear()
    }

    // ── the drawn run ────────────────────────────────────────────────────────
    const seqLength = (col: ReturnType<ViewerApi['getCollection']>) =>
      isFlat ? flat.length : col.groups.length
    // the node in the rail for position `idx` of the sequence, when drawn
    const hostAt = (col: ReturnType<ViewerApi['getCollection']>, idx: number) => {
      if (isFlat) {
        const e = flat[idx]
        return e ? itemBtns.get(e.itemId) : undefined
      }
      const id = col.groups[idx]?.id
      return id ? (cardHost.get(id) ?? groupBtns.get(id)) : undefined
    }
    const drawnHosts = (col: ReturnType<ViewerApi['getCollection']>) => {
      const out: HTMLElement[] = []
      for (let k = winStart; k <= winEnd; k++) {
        const h = hostAt(col, k)
        if (h) out.push(h)
      }
      return out
    }

    // Draw positions start..end. A card drawn both before and after anchors the scroll offset, so
    // cards entering or leaving before it don't move what's on screen.
    const setWindow = (col: ReturnType<ViewerApi['getCollection']>, start: number, end: number) => {
      if (!root || (start === winStart && end === winEnd)) return
      const shared = Math.max(start, winStart)
      const ref = shared <= Math.min(end, winEnd) ? hostAt(col, shared) : undefined
      // a section's items live in its row: lift them out when that row leaves the run, and put them
      // back when it's drawn again (left alone otherwise, so a focused item keeps its focus)
      const g = viewer.getState().cursor.g
      const active = isIndex && itemRow ? col.groups[g] : undefined
      const scroller = root
      keepFocus(() =>
        keepPlace(scroller, ref, axis, () => {
          if (active && (g < start || g > end)) itemRow?.remove()
          if (isFlat) rebuildRailFlat(col, start, end)
          else rebuildRail(col, start, end)
          const host = active ? cardHost.get(active.id) : undefined
          if (host && itemRow && itemRow.parentNode !== host) host.appendChild(itemRow)
        }),
      )
      winStart = start
      winEnd = end
    }

    // Which way the rail runs, and how many cards fit in it; false while it has no layout.
    const measure = (col: ReturnType<ViewerApi['getCollection']>) => {
      if (!root) return false
      const along = axisOf(root)
      const run = measureRun(drawnHosts(col), along)
      const extent = run && (along === 'x' ? root.clientWidth : root.clientHeight)
      if (!run || !extent) return false
      axis = along
      // a part-shown line at each end; a line can hold several cards (a flat rail's group rows)
      perView = (Math.ceil(extent / run.stride) + 1) * run.perLine
      return true
    }
    // cards each side: `overscan`, but never fewer than `least` (a measured rail would show gaps)
    const sideOf = (least: number, fallback: number) =>
      perView ? Math.max(o.overscan ?? fallback, least) : (o.overscan ?? fallback)

    // Re-centre the run on the middle of the rail (after a scroll, a resize, or opening).
    const rewindow = () => {
      if (!root || winEnd < 0) return
      const col = viewer.getCollection()
      if (col !== lastCol || !measure(col)) return
      const hosts = drawnHosts(col)
      const middle = winStart + middleOf(root, hosts, axis as Axis)
      const half = Math.ceil(perView / 2)
      const side = sideOf(half, half + MARGIN)
      setWindow(col, ...spanAround(middle, seqLength(col), side, side))
      const cur = viewer.getState().cursor
      markActive(col, cur.g, cur.i) // a re-drawn active card gets its state back
    }
    const scheduleRewindow = () => {
      if (frame || typeof requestAnimationFrame === 'undefined') return
      frame = requestAnimationFrame(() => {
        frame = 0
        rewindow()
        strip?.update()
      })
    }

    // The rail first renders before it has any layout, so a viewer opening on a far group has to
    // reveal the active thumb once it's on screen.
    let wasClosed = true
    const revealOnOpen = () => {
      const closed = viewer.getState().phase === 'closed'
      if (wasClosed && !closed) {
        requestAnimationFrame(() => {
          if (!root) return
          const { g, i } = viewer.getState().cursor
          revealActive(viewer.getCollection(), g, i)
          rewindow() // the first layout: size the run to the rail
          strip?.update()
        })
      }
      wasClosed = closed
    }

    const render = () => {
      if (!root) return
      if (!railObs) watchRail()
      revealOnOpen()
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      if (col === lastCol && cur.g === lastG && cur.i === lastI) return // skip zoom/pan/etc.

      const colChanged = col !== lastCol
      if (colChanged) {
        keepFocus(resetAll) // new data: every thumb is drawn afresh
        collectionHasMulti = col.groups.some((g) => g.items.length > 1)
      }

      if (isFlat && colChanged) buildFlatModel(col)
      // The rail is an ordered display slice, not a preload window, so it never wraps (viewer.loop
      // is the slide window's business, mount.ts). A cursor outside the drawn run re-centres it: wide
      // enough for the cursor to land at either edge of the rail once scrolled into view, then the
      // scroll that follows trims it to the middle of the rail (rewindow).
      const at = isFlat ? (flatPos.get(`${cur.g}:${cur.i}`) ?? 0) : cur.g
      if (colChanged || at < winStart || at > winEnd) {
        const side = sideOf(perView, perView ? perView + MARGIN : FALLBACK)
        setWindow(col, ...spanAround(at, seqLength(col), side, side))
      }
      if (!isFlat) {
        const activeGroup = col.groups[cur.g]
        const activeGroupId = activeGroup?.id ?? null
        if (colChanged || activeGroupId !== lastActiveGroupId) {
          keepFocus(() => rebuildItemColumn(activeGroup, cur.g)) // a focused item thumb goes with it
          lastActiveGroupId = activeGroupId
        }
        if (peekGroupId && peekGroupId === activeGroupId) closePeek() // navigated into the peeked group
      }
      applyActive(col, cur.g, cur.i)
      strip?.update()

      lastCol = col
      lastG = cur.g
      lastI = cur.i
    }

    // Drop the rail's DOM and listeners (destroy, or a new mount that builds it again).
    const teardown = () => {
      unsub?.()
      unsub = null
      railObs?.disconnect()
      railObs = null
      viewerRoot = null
      glides.stopAll()
      strip?.destroy()
      strip = null
      resizeObs?.disconnect()
      resizeObs = null
      root?.removeEventListener('scroll', scheduleRewindow)
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      cancelPeekClose()
      resetAll()
      toolbarBtn?.removeEventListener('click', toggleActivePanel)
      toolbarBtn = null
      asideEl = null
      regionEl = null
      root = null
      lastCol = null
      lastG = lastI = -1
      axis = null
      perView = 0
      wasClosed = true
    }

    // Apply the settled display to the built nodes: the rail's role and marks, the region's linear
    // marker (a flat rail runs item by item: the renderer walks it that way unless told otherwise), the
    // aside column (a stacked rail's) and the items toggle (not on a flat rail, which has no panel:
    // hidden, and marked off so a bar without built-in controls doesn't show for it alone).
    const layout = () => {
      configure()
      if (!root || !regionEl) return
      root.setAttribute('role', isIndex ? 'group' : 'listbox')
      toggleAttr(root, 'data-timeline', !!timeLabel)
      if (groupDisplay === 'stacked') delete root.dataset.display
      else root.dataset.display = groupDisplay
      toggleAttr(regionEl, 'data-gallerist-linear', isFlat)
      if (asideEl) asideEl.hidden = groupDisplay !== 'stacked'
      if (toolbarBtn) {
        // a focused toggle that hides hands focus to the viewer (else it falls to <body>)
        if (isFlat && document.activeElement === toolbarBtn)
          regionEl.closest<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
        toolbarBtn.hidden = isFlat
        toggleAttr(toolbarBtn, 'data-gallerist-off', isFlat)
      }
    }

    // Show `display` in the mounted rail: the current item stays, the rail is drawn again around it
    // (new cards, new run, the item panel for a stacked or index rail), and the renderer reads the
    // linear marker again. Before the rail mounts, it's the display the rail mounts with.
    const setDisplay = (display: GroupDisplay) => {
      if (!DISPLAYS.includes(display)) return
      want = display
      if (!root || display === groupDisplay) return
      keepFocus(() => {
        cancelPeekClose()
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        resetAll()
        lastCol = null // draw everything again (render)
        lastG = lastI = -1
        axis = null // a new layout: measured again
        perView = 0
        layout()
        render()
      })
      // its first layout: show the current card with its neighbours, and size the run to the rail
      if (typeof requestAnimationFrame !== 'undefined')
        requestAnimationFrame(() => {
          if (!root) return
          const { g, i } = viewer.getState().cursor
          revealActive(viewer.getCollection(), g, i)
          rewindow()
          strip?.update()
        })
      viewer.refresh()
    }

    // Build the rail when its region mounts, with the mounted preset's defaults (configure). No DOM
    // before then, so a viewer that is never mounted (server rendering) creates none. Every region of
    // one mount gets the same context; a later mount (after the first one was destroyed) brings a
    // new one, maybe with another preset, so the rail is built again for it. The nodes handed to the
    // renderer are made for every display the rail can switch to: the aside column while a stacked
    // rail would stack its items there, and the items toggle.
    let builtFor: RegionCtx | null = null
    const build = (ctx: RegionCtx) => {
      if (ctx === builtFor) return
      if (builtFor) teardown()
      builtFor = ctx
      const defaults = ctx.preset?.thumbnails
      preset = (defaults && typeof defaults === 'object' ? defaults : {}) as ThumbnailsOptions
      configure()
      panelOpen = o.expandActive ?? true
      regionEl = document.createElement('div')
      regionEl.className = 'gallerist-thumbs-region'
      root = document.createElement('div')
      root.className = 'gallerist-thumbs'
      root.setAttribute('aria-label', t.rail)
      regionEl.appendChild(root)
      root.style.overflowAnchor = 'none' // keepPlace corrects the offset itself
      root.addEventListener('scroll', scheduleRewindow, { passive: true })
      const rail = root
      strip = attachStrip(rail, regionEl, () => axis ?? axisOf(rail))
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(scheduleRewindow)
        resizeObs.observe(root)
      }
      if (oneOf(AXES, settle(opts, preset, 'stacked').itemAxis) === 'vertical') {
        asideEl = document.createElement('div')
        asideEl.className = 'gallerist-thumbs-aside'
      }
      toolbarBtn = document.createElement('button')
      toolbarBtn.type = 'button'
      toolbarBtn.className = 'gallerist-items-toggle'
      toolbarBtn.setAttribute('aria-label', t.toggleItems)
      toolbarBtn.setAttribute('aria-pressed', String(panelOpen))
      toolbarBtn.innerHTML = ICONS.itemStack
      toolbarBtn.addEventListener('click', toggleActivePanel)
      layout()
      render()
      unsub = viewer.subscribe(render)
      queueMicrotask(watchRail) // once the renderer has put the rail in the viewer
    }

    // Which regions to claim is decided now, before the preset is known (and the display can change
    // at run time): whatever the explicit options leave possible. A region the settled layout can't
    // use gets an empty comment node.
    const none = () => document.createComment('')
    const regions: PluginInstance['regions'] = {
      thumbnails: (ctx) => {
        build(ctx)
        return regionEl ?? document.createElement('div')
      },
      toolbar: (ctx) => {
        build(ctx)
        return toolbarBtn ?? none()
      },
    }
    if (opts.itemAxis !== 'horizontal') {
      regions.aside = (ctx) => {
        build(ctx)
        if (!asideEl) return none() // the preset made a stacked rail's items a row (editorial)
        // the renderer attaches asideEl right after this returns: move a stacked rail's stack in then
        queueMicrotask(() => {
          if (asideEl?.parentNode && !asideEl.hidden && itemRow && itemRow.parentNode !== asideEl)
            syncPanel()
        })
        return asideEl
      }
    }

    const keys = { e: () => toggleActivePanel(), E: () => toggleActivePanel() }
    const instance: ThumbnailsInstance = {
      name: 'thumbnails',
      get display() {
        return root ? groupDisplay : undefined
      },
      setDisplay,
      init() {
        hoverCapable = canHover()
      },
      destroy() {
        teardown()
        builtFor = null
      },
      regions,
      // A flat rail has no item panel, nor has a rail not built yet (or never: another renderer), so
      // `e` stays another plugin's (the renderer reads the keymaps after mounting the regions, again
      // when the plugin set changes and on viewer.refresh(), which a switch calls).
      get keymap() {
        return isFlat || !root ? undefined : keys
      },
    }
    return instance
  }
}
