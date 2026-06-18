// @visora/plugin-thumbnails — windowed thumbnail rail (spec §10.3, §14). One card per group
// (grouped stacked cards for multi-item groups); the active multi-item group expands to its item
// thumbs (secondary axis). Windowed + lazy so 10k-item galleries stay bounded.
//
// Reconcile-in-place (M14 UX-B): the rail is NOT torn down on cursor moves. The group rail is
// rebuilt only when the collection or the visible window changes; the item column only when the
// active group changes. Item/group cursor moves just flip `data-active` and scroll the active node
// into view — no DOM churn, no scroll reset (fixes the "active thumb drifts horizontally" bug).

import type { Group, Item, MediaSource, Plugin, ViewerApi } from '@visora/core'
import { windowIndices } from '@visora/core'

export interface ThumbnailsOptions {
  /** group thumbs rendered on each side of the active group (default 24). */
  overscan?: number
  /**
   * Layout of the active group's item thumbs (the secondary ↑/↓ axis). `vertical` (default)
   * stacks them in a column so the highlight moves up/down with the input direction; `horizontal`
   * keeps the legacy inline row.
   */
  itemAxis?: 'vertical' | 'horizontal'
  /**
   * Render each group's `meta` as a time-ribbon tick label beneath its card (UX-J, the reviewer
   * preset's signature). Off by default so plain galleries stay uncluttered.
   */
  ticks?: boolean
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
  img.className = 'visora-thumb-img'
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
  cap.className = 'visora-thumb-caption'
  cap.textContent = text
  btn.appendChild(cap)
}

function setActiveAttr(btn: HTMLElement, active: boolean): void {
  if (active) btn.setAttribute('data-active', '')
  else btn.removeAttribute('data-active')
  btn.setAttribute('aria-selected', String(active))
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

function scrollActiveIntoView(btn: HTMLElement | undefined): void {
  btn?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

export function thumbnails(opts: ThumbnailsOptions = {}): Plugin {
  return (viewer: ViewerApi) => {
    const overscan = opts.overscan ?? 24
    const itemAxis = opts.itemAxis ?? 'vertical'
    const ticks = opts.ticks ?? false
    let root: HTMLElement | null = null
    let itemRow: HTMLElement | null = null
    let unsub: (() => void) | null = null

    // Reconcile state. Group cards + item buttons are keyed by id so we can flip active state and
    // reorder without destroying nodes.
    let lastCol: object | null = null
    let lastG = -1
    let lastI = -1
    let lastWindowKey = ''
    let lastActiveGroupId: string | null = null
    let liveCardId: string | null = null // group card currently showing a live item preview
    const groupBtns = new Map<string, HTMLButtonElement>()
    const itemBtns = new Map<string, HTMLButtonElement>()
    const coverUrls = new Map<string, string | null>() // group id → its fixed cover thumb

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                const img = e.target as HTMLImageElement
                if (img.dataset.src) img.src = img.dataset.src
                observer?.unobserve(img)
              }
            }
          })
        : null

    const buildGroupCard = (group: Group, gIndex: number): HTMLButtonElement => {
      const multi = group.items.length > 1
      const btn = thumbButton(
        `Group ${gIndex + 1}`,
        `visora-thumb${multi ? ' visora-thumb-stacked' : ''}`,
        () => viewer.goTo(gIndex),
      )
      btn.dataset.group = group.id
      const cover = groupThumb(group)
      coverUrls.set(group.id, cover)
      btn.appendChild(lazyImg(cover, observer))
      if (multi) {
        const badge = document.createElement('span')
        badge.className = 'visora-thumb-count'
        badge.textContent = String(group.items.length)
        btn.appendChild(badge)
      }
      if (ticks) {
        const tick = document.createElement('span')
        tick.className = 'visora-thumb-tick'
        tick.textContent = group.meta != null ? String(group.meta) : ''
        btn.appendChild(tick)
      }
      appendCaption(btn, captionOf(group))
      return btn
    }

    const buildItemButton = (item: Item, gIndex: number, iIndex: number): HTMLButtonElement => {
      const btn = thumbButton(`Item ${iIndex + 1}`, 'visora-thumb-item', () =>
        viewer.goTo(gIndex, iIndex),
      )
      btn.dataset.item = item.id
      btn.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
      appendCaption(btn, captionOf(item))
      return btn
    }

    // wipe everything (collection identity changed — ids may be entirely different)
    const resetAll = () => {
      if (root) root.replaceChildren()
      groupBtns.clear()
      itemBtns.clear()
      coverUrls.clear()
      itemRow = null
      liveCardId = null
      lastWindowKey = ''
      lastActiveGroupId = null
    }

    // rebuild the group rail to the windowed set, reusing existing cards (identity preserved)
    const rebuildRail = (col: ReturnType<ViewerApi['getCollection']>, windowIdx: number[]) => {
      if (!root) return
      const desiredIds = new Set<string>()
      for (const g of windowIdx) {
        const group = col.groups[g]
        if (group) desiredIds.add(group.id)
      }
      for (const [id, btn] of groupBtns) {
        if (!desiredIds.has(id)) {
          btn.remove()
          groupBtns.delete(id)
        }
      }
      for (const g of windowIdx) {
        const group = col.groups[g]
        if (!group) continue
        let btn = groupBtns.get(group.id)
        if (!btn) {
          btn = buildGroupCard(group, g)
          groupBtns.set(group.id, btn)
        }
        root.appendChild(btn) // moves existing node to the end → reorders, preserves identity
      }
      if (itemRow) root.appendChild(itemRow) // keep the item column last
    }

    const rebuildItemColumn = (activeGroup: Group | undefined, gIndex: number) => {
      if (!root) return
      itemBtns.clear()
      if (activeGroup && activeGroup.items.length > 1) {
        if (!itemRow) {
          itemRow = document.createElement('div')
          itemRow.className = 'visora-thumb-items'
          itemRow.setAttribute('role', 'group') // a listbox can't nest inside the rail listbox
          itemRow.setAttribute('aria-orientation', itemAxis)
          itemRow.dataset.axis = itemAxis
        }
        itemRow.replaceChildren()
        activeGroup.items.forEach((item, i) => {
          const ib = buildItemButton(item, gIndex, i)
          itemBtns.set(item.id, ib)
          itemRow?.appendChild(ib)
        })
        root.appendChild(itemRow)
      } else if (itemRow) {
        itemRow.remove()
        itemRow = null
      }
    }

    // swap a card's thumb image in place (used for the active group's live preview)
    const setCardImage = (card: HTMLElement, url: string | null) => {
      const img = card.querySelector<HTMLImageElement>('.visora-thumb-img')
      if (!img) return
      img.dataset.src = '' // stop the lazy observer from overriding our explicit src
      img.src = url ?? ''
    }

    const applyActive = (col: ReturnType<ViewerApi['getCollection']>, g: number, i: number) => {
      const activeGroup = col.groups[g]
      const activeGroupId = activeGroup?.id ?? null
      const activeItemId = activeGroup?.items[i]?.id ?? null
      for (const [id, btn] of groupBtns) setActiveAttr(btn, id === activeGroupId)
      for (const [id, btn] of itemBtns) setActiveAttr(btn, id === activeItemId)

      // live-preview (UX-A): the active multi-item group's card mirrors the currently-viewed item;
      // restore a card's fixed cover once its group is no longer the live one.
      if (liveCardId && liveCardId !== activeGroupId) {
        const prev = groupBtns.get(liveCardId)
        if (prev) setCardImage(prev, coverUrls.get(liveCardId) ?? null)
        liveCardId = null
      }
      if (activeGroupId && activeGroup && activeGroup.items.length > 1) {
        const card = groupBtns.get(activeGroupId)
        const it = activeGroup.items[i]
        const url =
          thumbUrl(it?.thumb) ?? thumbUrl(it?.source) ?? coverUrls.get(activeGroupId) ?? null
        if (card) setCardImage(card, url)
        liveCardId = activeGroupId
      }

      if (activeGroupId) scrollActiveIntoView(groupBtns.get(activeGroupId))
      if (activeItemId) scrollActiveIntoView(itemBtns.get(activeItemId))
    }

    const render = () => {
      if (!root) return
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      if (col === lastCol && cur.g === lastG && cur.i === lastI) return // skip zoom/pan/etc.

      const colChanged = col !== lastCol
      if (colChanged) resetAll()

      const windowIdx = windowIndices(cur.g, col.groups.length, overscan, overscan, false)
      const windowKey = windowIdx.join(',')
      if (colChanged || windowKey !== lastWindowKey) {
        rebuildRail(col, windowIdx)
        lastWindowKey = windowKey
      }

      const activeGroup = col.groups[cur.g]
      const activeGroupId = activeGroup?.id ?? null
      if (colChanged || activeGroupId !== lastActiveGroupId) {
        rebuildItemColumn(activeGroup, cur.g)
        lastActiveGroupId = activeGroupId
      }

      applyActive(col, cur.g, cur.i)
      lastCol = col
      lastG = cur.g
      lastI = cur.i
    }

    return {
      name: 'thumbnails',
      init() {
        root = document.createElement('div')
        root.className = 'visora-thumbs'
        root.setAttribute('role', 'listbox')
        root.setAttribute('aria-label', 'Thumbnails')
        if (ticks) root.dataset.ticks = ''
        render()
        unsub = viewer.subscribe(render)
      },
      destroy() {
        unsub?.()
        observer?.disconnect()
        groupBtns.clear()
        itemBtns.clear()
        coverUrls.clear()
        itemRow = null
        liveCardId = null
        root = null
      },
      regions: {
        thumbnails: () => root ?? document.createElement('div'),
      },
    }
  }
}
