// @visora/plugin-thumbnails — windowed thumbnail rail (spec §10.3, §14). One entry per group
// (grouped stacked cards for multi-item groups); the active multi-item group expands to its item
// thumbs (secondary axis). Windowed + lazy so 10k-item galleries stay bounded.

import type { Group, Item, MediaSource, Plugin, ViewerApi } from '@visora/core'
import { windowIndices } from '@visora/core'

export interface ThumbnailsOptions {
  /** group thumbs rendered on each side of the active group (default 24). */
  overscan?: number
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

function lazyImg(src: string | null, observer: IntersectionObserver | null): HTMLElement {
  const img = document.createElement('img')
  img.className = 'visora-thumb-img'
  img.decoding = 'async'
  img.loading = 'lazy'
  if (!src) return img
  if (observer) {
    img.dataset.src = src
    observer.observe(img)
  } else {
    img.src = src // no IntersectionObserver (e.g. SSR/test) → load eagerly
  }
  return img
}

function thumbButton(
  label: string,
  className: string,
  selected: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.setAttribute('role', 'option')
  btn.setAttribute('aria-selected', String(selected))
  btn.setAttribute('aria-label', label)
  if (selected) btn.setAttribute('data-active', '')
  btn.addEventListener('click', onClick)
  return btn
}

export function thumbnails(opts: ThumbnailsOptions = {}): Plugin {
  return (viewer: ViewerApi) => {
    const overscan = opts.overscan ?? 24
    let root: HTMLElement | null = null
    let unsub: (() => void) | null = null
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

    const render = () => {
      if (!root) return
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      const groupCount = col.groups.length
      root.replaceChildren()

      for (const g of windowIndices(cur.g, groupCount, overscan, overscan, false)) {
        const group = col.groups[g]
        if (!group) continue
        const multi = group.items.length > 1
        const active = g === cur.g
        const btn = thumbButton(
          `Group ${g + 1}`,
          `visora-thumb${multi ? ' visora-thumb-stacked' : ''}`,
          active,
          () => viewer.goTo(g),
        )
        btn.dataset.group = group.id
        btn.appendChild(lazyImg(groupThumb(group), observer))
        if (multi) {
          const badge = document.createElement('span')
          badge.className = 'visora-thumb-count'
          badge.textContent = String(group.items.length)
          btn.appendChild(badge)
        }
        root.appendChild(btn)
      }

      // active multi-item group → expand its item thumbs (secondary axis)
      const activeGroup = col.groups[cur.g]
      if (activeGroup && activeGroup.items.length > 1) {
        const itemRow = document.createElement('div')
        itemRow.className = 'visora-thumb-items'
        itemRow.setAttribute('role', 'listbox')
        activeGroup.items.forEach((item: Item, i: number) => {
          const ib = thumbButton(`Item ${i + 1}`, 'visora-thumb-item', i === cur.i, () =>
            viewer.goTo(cur.g, i),
          )
          ib.dataset.item = item.id
          ib.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
          itemRow.appendChild(ib)
        })
        root.appendChild(itemRow)
      }
    }

    return {
      name: 'thumbnails',
      init() {
        root = document.createElement('div')
        root.className = 'visora-thumbs'
        root.setAttribute('role', 'listbox')
        root.setAttribute('aria-label', 'Thumbnails')
        render()
        unsub = viewer.subscribe(render)
      },
      destroy() {
        unsub?.()
        observer?.disconnect()
        root = null
      },
      regions: {
        thumbnails: () => root ?? document.createElement('div'),
      },
    }
  }
}
