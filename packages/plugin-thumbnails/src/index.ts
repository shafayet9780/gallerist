// @gallerist/plugin-thumbnails — windowed thumbnail rail (spec §10.3, §14).
//
// Three display modes (`groupDisplay`):
//  • 'stacked' (default): one card per group; multi-item groups stack with a count badge. The
//    active multi-item group expands its item thumbs (secondary axis), and hovering/focusing any
//    OTHER multi-item card opens a transient *peek* flyout of its items — preview without
//    navigating in. Touch (no hover) gets an explicit expand affordance on the card.
//  • 'flat': every item of every group renders side-by-side as its own card, each group's run
//    wrapped in a bordered container so it reads as one group. Item-windowed so it stays bounded
//    even for huge galleries or one giant group.
//  • 'index': a section index. One row per group (cover, `group.caption`, `group.meta.subtitle`, item
//    count); the active group's items expand in place under its row. On a bottom rail, or any rail at
//    900px wide or less, the rows become a strip of chips.
//
// Reconcile-in-place (M14 UX-B): the rail is NOT torn down on cursor moves. Cursor moves flip
// `data-active` on the previous and the new active thumb only, and scroll the active one into view.
//
// Windowing (U17): the rail draws a contiguous run of cards, what fits in its scroller plus a few each
// side, and follows its own scroll: when the middle of the rail moves, cards that left the run are
// removed and the ones that entered are inserted in place (the rest stay put), with the scroll offset
// corrected so nothing on screen moves. A cursor outside the run re-centres it on the cursor.

import type { Group, Item, MediaSource, Plugin, PluginInstance, ViewerApi } from '@gallerist/core'
import { ICONS } from '@gallerist/core/internal'
import { type Axis, keepPlace, measureRun, middleOf, spanAround } from './strip'

/** Cards drawn beyond the visible ones on each side, so a step or a short scroll lands on drawn cards. */
const MARGIN = 3
/** Cards on each side of the cursor while the rail has no layout to measure. */
const FALLBACK = 8

export interface ThumbnailsOptions {
  /**
   * Cards drawn on each side of the middle of the rail; scrolling the rail draws the ones it reaches.
   * By default the rail measures itself and draws what fits plus 3 cards on each side (8 on each
   * side before it has a layout to measure). A number fixes the bound. Group cards, or item cards
   * in `flat` mode.
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
   * item out side-by-side with each group wrapped in a bordered container; `index` lists named
   * sections with their counts and expands the active one (its items always run as a row).
   */
  groupDisplay?: 'stacked' | 'flat' | 'index'
  /**
   * Auto-expand the active multi-item group's item panel (`stacked` and `index` modes). Default `true`. Users
   * can hide/show it with the toolbar items-toggle button or the `e` key; the chosen state persists
   * as you navigate. Ignored in `flat` mode (every item is already laid out).
   */
  expandActive?: boolean
  /**
   * A timeline over the rail (`stacked` mode): a label with a tick above each group card, joined
   * by a track line, the current one in the accent. `true` reads the label from `group.meta.time`
   * (a string); a function returns it. The label is part of the card's accessible name.
   */
  timeline?: boolean | ((group: Group, index: number) => string | undefined)
  /** Number the item thumbs (1, 2, 3…) in the item stack and peek, so items can be referred to. */
  numberItems?: boolean
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<ThumbnailsStrings>
}

export interface ThumbnailsStrings {
  /** accessible name of the rail */
  rail: string
  /** an unnamed group's name, and a group card's accessible name */
  group: (n: number) => string
  /** a group card's accessible name with its timeline label */
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
function captionOf(x: { caption?: string | { id: string } }): string | undefined {
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

// Scrolls only the viewer's own panels. scrollIntoView would also scroll the page, moving an inline
// viewer's host page every time the cursor changes.
function scrollActiveIntoView(btn: HTMLElement | undefined): void {
  if (!btn) return
  const target = btn.getBoundingClientRect()
  if (!target.width && !target.height) return // hidden (an index chip's items): nothing to reveal
  for (let box = btn.parentElement; box; box = box.parentElement) {
    if (box.classList.contains('gallerist')) return
    const { overflowX, overflowY } = getComputedStyle(box)
    const edge = box.getBoundingClientRect()
    if (/auto|scroll/.test(overflowX)) {
      box.scrollLeft += nearest(target.left, target.right, edge.left, edge.right)
    }
    if (/auto|scroll/.test(overflowY)) {
      box.scrollTop += nearest(target.top, target.bottom, edge.top, edge.bottom)
    }
  }
}

/** How far to scroll so [start, end] shows inside [min, max], moving as little as possible. */
function nearest(start: number, end: number, min: number, max: number): number {
  if (start < min) return start - min
  return end > max ? end - max : 0
}

/** Whether the primary pointer can hover (desktop). Defaults true when undetectable (SSR/test). */
function canHover(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(hover: hover)').matches ?? true
}

interface FlatEntry {
  g: number
  i: number
  groupId: string
  itemId: string
}

export function thumbnails(opts: ThumbnailsOptions = {}): Plugin {
  return (viewer: ViewerApi) => {
    const t: ThumbnailsStrings = { ...DEFAULT_THUMBNAILS_STRINGS, ...opts.strings }
    const groupDisplay = opts.groupDisplay ?? 'stacked'
    const isIndex = groupDisplay === 'index'
    const itemAxis = isIndex ? 'horizontal' : (opts.itemAxis ?? 'vertical')
    const expandActive = opts.expandActive ?? true
    const timeLabel =
      groupDisplay === 'stacked' && opts.timeline
        ? opts.timeline === true
          ? metaTime
          : opts.timeline
        : null
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
    let panelOpen = expandActive // whether the active group's item panel is shown (toggle: button / `e`)
    let unsub: (() => void) | null = null
    let hoverCapable = true

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

    const buildItemButton = (item: Item, gIndex: number, iIndex: number): HTMLButtonElement => {
      const btn = thumbButton(t.item(iIndex + 1), 'gallerist-thumb-item', () =>
        viewer.goTo(gIndex, iIndex),
      )
      btn.dataset.item = item.id
      btn.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
      if (opts.numberItems) {
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
      const name = group.caption ?? t.group(gIndex + 1)
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
      const host = activeGroupId ? cardHost.get(activeGroupId) : undefined
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

    const applyActive = (col: ReturnType<ViewerApi['getCollection']>, g: number, i: number) => {
      markActive(col, g, i)
      const group = col.groups[g]
      if (group) scrollActiveIntoView(groupBtns.get(group.id))
      const item = group?.items[i]
      if (item) scrollActiveIntoView(itemBtns.get(item.id))
    }

    // re-evaluate the active item panel for the current cursor (used when `panelOpen` toggles, since
    // the cursor itself didn't change so `render` wouldn't otherwise rebuild it).
    const syncPanel = () => {
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      rebuildItemColumn(col.groups[cur.g], cur.g)
      applyActive(col, cur.g, cur.i)
    }

    const toggleActivePanel = () => {
      panelOpen = !panelOpen
      toolbarBtn?.setAttribute('aria-pressed', String(panelOpen))
      if (panelOpen) closePeek() // the persistent panel supersedes a transient peek
      syncPanel()
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

    const buildGroupWrapper = (group: Group, gIndex: number): HTMLElement => {
      const wrap = document.createElement('div')
      wrap.className = 'gallerist-thumb-group'
      wrap.dataset.group = group.id
      wrap.setAttribute('role', 'group')
      wrap.setAttribute('aria-label', t.group(gIndex + 1))
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
          ib = buildItemButton(item, e.g, e.i)
          itemBtns.set(e.itemId, ib)
        }
        place(row, ib, prevBtn)
        prevBtn = ib
      }
      // per-wrapper caption header + partial-edge flags
      for (const [id, wrap] of groupWraps) {
        const gi = groupIndexById.get(id)
        if (gi == null) continue
        const grp = col.groups[gi]
        if (!grp) continue
        const mn = minI.get(id) ?? 0
        const mx = maxI.get(id) ?? 0
        toggleAttr(wrap, 'data-partial-start', mn > 0)
        toggleAttr(wrap, 'data-partial-end', mx < grp.items.length - 1)
        const wantCap = typeof grp.caption === 'string' && mn === 0
        const first = wrap.firstElementChild
        const hasCap = !!first && first.classList.contains('gallerist-thumb-group-cap')
        if (wantCap && !hasCap) {
          const cap = document.createElement('span')
          cap.className = 'gallerist-thumb-group-cap'
          cap.textContent = grp.caption as string
          wrap.insertBefore(cap, wrap.firstChild)
        } else if (!wantCap && hasCap && first) {
          first.remove()
        }
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
    const isFlat = groupDisplay === 'flat'
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
      const focused = document.activeElement
      // a section's items live in its row: lift them out when that row leaves the run, and put them
      // back when it's drawn again (left alone otherwise, so a focused item keeps its focus)
      const g = viewer.getState().cursor.g
      const active = isIndex && itemRow ? col.groups[g] : undefined
      keepPlace(root, ref, axis, () => {
        if (active && (g < start || g > end)) itemRow?.remove()
        if (isFlat) rebuildRailFlat(col, start, end)
        else rebuildRail(col, start, end)
        const host = active ? cardHost.get(active.id) : undefined
        if (host && itemRow && itemRow.parentNode !== host) host.appendChild(itemRow)
      })
      winStart = start
      winEnd = end
      // a focused card scrolled out of the run: keep the keys working (focus would fall to <body>)
      if (focused instanceof HTMLElement && !focused.isConnected) {
        regionEl?.closest<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
      }
    }

    // How many cards fit in the rail, and which way it runs; false while it has no layout.
    const measure = (col: ReturnType<ViewerApi['getCollection']>) => {
      if (!root) return false
      const run = measureRun(drawnHosts(col))
      const extent = run && (run.axis === 'x' ? root.clientWidth : root.clientHeight)
      if (!run || !extent) return false
      axis = run.axis
      perView = Math.ceil(extent / run.stride) + 1 // a part-shown card at each end
      return true
    }

    // Re-centre the run on the middle of the rail (after a scroll, a resize, or opening).
    const rewindow = () => {
      if (!root || winEnd < 0) return
      const col = viewer.getCollection()
      if (col !== lastCol || !measure(col)) return
      const hosts = drawnHosts(col)
      const middle = winStart + middleOf(root, hosts, axis as Axis)
      const side = opts.overscan ?? Math.ceil(perView / 2) + MARGIN
      setWindow(col, ...spanAround(middle, seqLength(col), side, side))
      const cur = viewer.getState().cursor
      markActive(col, cur.g, cur.i) // a re-drawn active card gets its state back
    }
    const scheduleRewindow = () => {
      if (frame || typeof requestAnimationFrame === 'undefined') return
      frame = requestAnimationFrame(() => {
        frame = 0
        rewindow()
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
          const group = viewer.getCollection().groups[g]
          if (!group) return
          scrollActiveIntoView(groupBtns.get(group.id))
          const item = group.items[i]
          if (item) scrollActiveIntoView(itemBtns.get(item.id))
          rewindow() // the first layout: size the run to the rail
        })
      }
      wasClosed = closed
    }

    const render = () => {
      if (!root) return
      revealOnOpen()
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      if (col === lastCol && cur.g === lastG && cur.i === lastI) return // skip zoom/pan/etc.

      const colChanged = col !== lastCol
      if (colChanged) {
        resetAll()
        collectionHasMulti = col.groups.some((g) => g.items.length > 1)
      }

      if (isFlat && colChanged) buildFlatModel(col)
      // The rail is an ordered display slice, not a preload window, so it never wraps (viewer.loop
      // is the slide window's business, mount.ts). A cursor outside the drawn run re-centres it: wide
      // enough for the cursor to land at either edge of the rail once scrolled into view, then the
      // scroll that follows trims it to the middle of the rail (rewindow).
      const at = isFlat ? (flatPos.get(`${cur.g}:${cur.i}`) ?? 0) : cur.g
      if (colChanged || at < winStart || at > winEnd) {
        const side = opts.overscan ?? (perView ? perView + MARGIN : FALLBACK)
        setWindow(col, ...spanAround(at, seqLength(col), side, side))
      }
      if (!isFlat) {
        const activeGroup = col.groups[cur.g]
        const activeGroupId = activeGroup?.id ?? null
        if (colChanged || activeGroupId !== lastActiveGroupId) {
          rebuildItemColumn(activeGroup, cur.g)
          lastActiveGroupId = activeGroupId
        }
        if (peekGroupId && peekGroupId === activeGroupId) closePeek() // navigated into the peeked group
      }
      applyActive(col, cur.g, cur.i)

      lastCol = col
      lastG = cur.g
      lastI = cur.i
    }

    const regions: PluginInstance['regions'] = {
      thumbnails: () => regionEl ?? document.createElement('div'),
    }
    if (groupDisplay === 'stacked' && itemAxis === 'vertical') {
      regions.aside = () => {
        // the renderer attaches asideEl right after this returns: move the stack in then
        queueMicrotask(() => {
          if (asideEl?.parentNode && itemRow && itemRow.parentNode !== asideEl) syncPanel()
        })
        return asideEl ?? document.createElement('div')
      }
    }
    const keymap: PluginInstance['keymap'] = {}
    // the item panel + its toggle don't exist in flat mode (it lays every item out already).
    if (groupDisplay !== 'flat') {
      regions.toolbar = () => toolbarBtn ?? document.createElement('button')
      keymap.e = () => toggleActivePanel()
      keymap.E = () => toggleActivePanel()
    }

    return {
      name: 'thumbnails',
      init() {
        hoverCapable = canHover()
        regionEl = document.createElement('div')
        regionEl.className = 'gallerist-thumbs-region'
        root = document.createElement('div')
        root.className = 'gallerist-thumbs'
        root.setAttribute('role', isIndex ? 'group' : 'listbox')
        root.setAttribute('aria-label', t.rail)
        if (timeLabel) root.setAttribute('data-timeline', '')
        regionEl.appendChild(root)
        root.style.overflowAnchor = 'none' // keepPlace corrects the offset itself
        root.addEventListener('scroll', scheduleRewindow, { passive: true })
        if (typeof ResizeObserver !== 'undefined') {
          resizeObs = new ResizeObserver(scheduleRewindow)
          resizeObs.observe(root)
        }
        if (groupDisplay === 'flat') {
          root.dataset.display = 'flat'
        } else {
          if (isIndex) root.dataset.display = 'index'
          if (itemAxis === 'vertical') {
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
        }
        render()
        unsub = viewer.subscribe(render)
      },
      destroy() {
        unsub?.()
        observer?.disconnect()
        resizeObs?.disconnect()
        resizeObs = null
        root?.removeEventListener('scroll', scheduleRewindow)
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        cancelPeekClose()
        removePeek()
        groupBtns.clear()
        itemBtns.clear()
        coverUrls.clear()
        cardHost.clear()
        groupWraps.clear()
        itemRow?.remove()
        itemRow = null
        asideEl = null
        toolbarBtn?.removeEventListener('click', toggleActivePanel)
        toolbarBtn = null
        liveCardId = null
        regionEl = null
        root = null
      },
      regions,
      keymap,
    }
  }
}
