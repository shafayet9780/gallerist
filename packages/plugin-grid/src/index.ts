// @gallerist/plugin-grid — in-viewer contact-sheet grid (spec §14, decision P1-I). Renders into the
// `stage` region, covering the stage; grouped with interval headers, windowed + lazy. Toggle with
// the toolbar button or `g`; clicking a cell navigates and hides the grid.

import type { Item, MediaSource, Plugin, ViewerApi } from '@gallerist/core'
import { windowIndices } from '@gallerist/core/internal'

export interface GridOptions {
  /** groups rendered on each side of the active group (default 12). */
  overscan?: number
  /** keyboard shortcut to toggle the grid (default 'g'). */
  key?: string
}

function thumbUrl(source: MediaSource | undefined): string | null {
  if (!source) return null
  if (typeof source === 'string') return source
  if ('src' in source) return source.src
  return null
}

function lazyImg(src: string | null, observer: IntersectionObserver | null): HTMLElement {
  const img = document.createElement('img')
  img.className = 'gallerist-grid-img'
  img.decoding = 'async'
  img.loading = 'lazy'
  img.alt = '' // decorative — the enclosing cell carries the accessible name
  if (!src) return img
  if (observer) {
    img.dataset.src = src
    observer.observe(img)
  } else {
    img.src = src
  }
  return img
}

export function grid(opts: GridOptions = {}): Plugin {
  return (viewer: ViewerApi) => {
    const overscan = opts.overscan ?? 12
    let root: HTMLElement | null = null
    let toolbarBtn: HTMLElement | null = null
    let open = false
    let unsub: (() => void) | null = null
    // Rebuild only on cursor/collection change — skip unrelated commits while open (review T6).
    let lastG = -1
    let lastI = -1
    let lastCol: object | null = null
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
      if (!root || !open) return
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      if (col === lastCol && cur.g === lastG && cur.i === lastI) return
      lastG = cur.g
      lastI = cur.i
      lastCol = col
      root.replaceChildren()

      for (const g of windowIndices(cur.g, col.groups.length, overscan, overscan, false)) {
        const group = col.groups[g]
        if (!group) continue
        const header = document.createElement('div')
        header.className = 'gallerist-grid-header'
        header.textContent = typeof group.meta === 'string' ? group.meta : `Group ${g + 1}`
        root.appendChild(header)

        const cells = document.createElement('div')
        cells.className = 'gallerist-grid-cells'
        cells.setAttribute('role', 'listbox')
        group.items.forEach((item: Item, i: number) => {
          const cell = document.createElement('button')
          cell.type = 'button'
          cell.className = 'gallerist-grid-cell'
          cell.setAttribute('role', 'option')
          cell.setAttribute('aria-label', `${header.textContent}, item ${i + 1}`)
          const selected = g === cur.g && i === cur.i
          cell.setAttribute('aria-selected', String(selected))
          if (selected) cell.setAttribute('data-active', '')
          cell.dataset.group = group.id
          cell.dataset.item = item.id
          cell.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
          cell.addEventListener('click', () => {
            viewer.goTo(g, i)
            setOpen(false)
          })
          cells.appendChild(cell)
        })
        root.appendChild(cells)
      }
    }

    const setOpen = (v: boolean) => {
      open = v
      if (root) {
        root.style.display = open ? '' : 'none'
        root.setAttribute('aria-hidden', String(!open))
      }
      toolbarBtn?.setAttribute('aria-pressed', String(open))
      if (open) {
        lastCol = null // invalidate the cache so re-opening always rebuilds
        render()
      }
    }
    const toggle = () => setOpen(!open)

    return {
      name: 'grid',
      init() {
        root = document.createElement('div')
        root.className = 'gallerist-grid'
        root.setAttribute('aria-label', 'Grid')
        root.style.display = 'none'
        root.setAttribute('aria-hidden', 'true')
        toolbarBtn = document.createElement('button')
        toolbarBtn.className = 'gallerist-grid-toggle'
        ;(toolbarBtn as HTMLButtonElement).type = 'button'
        toolbarBtn.setAttribute('aria-label', 'Toggle grid')
        toolbarBtn.setAttribute('aria-pressed', 'false')
        toolbarBtn.textContent = '▦'
        toolbarBtn.addEventListener('click', toggle)
        unsub = viewer.subscribe(() => {
          if (open) render()
        })
      },
      destroy() {
        unsub?.()
        observer?.disconnect()
        root = null
        toolbarBtn = null
      },
      keymap: { [opts.key ?? 'g']: toggle },
      regions: {
        stage: () => root ?? document.createElement('div'),
        toolbar: () => toolbarBtn ?? document.createElement('button'),
      },
    }
  }
}
