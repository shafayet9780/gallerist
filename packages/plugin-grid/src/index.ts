// @gallerist/plugin-grid — in-viewer contact-sheet grid (spec §14, decision P1-I). Renders into the
// `stage` region, covering the stage; grouped with interval headers, windowed + lazy. Toggle with
// the toolbar button or `g`; clicking a cell navigates and hides the grid. `layout: 'sections'` draws
// one card per group instead, and `startOpen` makes that the screen a viewer opens on.

import type {
  Collection,
  Cursor,
  Group,
  Item,
  MediaSource,
  Plugin,
  ViewerApi,
} from '@gallerist/core'
import { ICONS, windowIndices } from '@gallerist/core/internal'

export interface GridOptions {
  /** groups rendered on each side of the active group (default 12). */
  overscan?: number
  /** keyboard shortcut to toggle the grid (default 'g'). */
  key?: string
  /**
   * `cells` (default): a header and a run of same-size cells per group. `sections`: an overview, one
   * card per group with its name (`group.caption`), `group.meta.subtitle`, item count, a large first
   * item and thumbnails of the next ones, under the collection's `meta.title` and a start button.
   */
  layout?: 'cells' | 'sections'
  /**
   * Show the grid as soon as the viewer opens on its first item. A viewer opened at any other item
   * (a tapped photo, a deep link) goes straight there.
   */
  startOpen?: boolean
  /** Text of the `sections` start button (default 'Start'); it hides the grid. */
  startLabel?: string
}

/** Items drawn on one `sections` card; the rest are counted on the last thumbnail. */
const SECTION_ITEMS = 9

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

const span = (className: string, text: string): HTMLElement => {
  const node = document.createElement('span')
  node.className = className
  node.textContent = text
  return node
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
      if (opts.layout === 'sections') {
        renderSections(root, col, cur)
        return
      }

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
          cells.appendChild(buildCell(group, item, g, i, header.textContent ?? '', cur))
        })
        root.appendChild(cells)
      }
    }

    const buildCell = (
      group: Group,
      item: Item,
      g: number,
      i: number,
      name: string,
      cur: Cursor,
    ): HTMLButtonElement => {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'gallerist-grid-cell'
      cell.setAttribute('role', 'option')
      cell.setAttribute('aria-label', `${name}, item ${i + 1}`)
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
      return cell
    }

    const renderSections = (host: HTMLElement, col: Collection, cur: Cursor) => {
      const top = document.createElement('div')
      top.className = 'gallerist-grid-top'
      const title = col.meta?.title
      if (typeof title === 'string') top.appendChild(span('gallerist-grid-title', title))
      const start = document.createElement('button')
      start.type = 'button'
      start.className = 'gallerist-grid-start'
      start.textContent = opts.startLabel ?? 'Start'
      start.addEventListener('click', () => setOpen(false))
      top.appendChild(start)
      host.appendChild(top)

      const sections = document.createElement('div')
      sections.className = 'gallerist-grid-sections'
      let activeSection: HTMLElement | null = null
      for (const g of windowIndices(cur.g, col.groups.length, overscan, overscan, false)) {
        const group = col.groups[g]
        if (!group) continue
        const name = group.caption ?? `Group ${g + 1}`
        const section = document.createElement('section')
        section.className = 'gallerist-grid-section'
        section.setAttribute('aria-label', name)
        const head = document.createElement('div')
        head.className = 'gallerist-grid-section-head'
        head.appendChild(span('gallerist-grid-section-name', name))
        head.appendChild(span('gallerist-grid-section-count', String(group.items.length)))
        const subtitle = (group.meta as { subtitle?: unknown } | undefined)?.subtitle
        if (typeof subtitle === 'string') {
          head.appendChild(span('gallerist-grid-section-sub', subtitle))
        }
        section.appendChild(head)
        const cells = document.createElement('div')
        cells.className = 'gallerist-grid-section-cells'
        cells.setAttribute('role', 'listbox')
        cells.setAttribute('aria-label', name)
        const shown = group.items.slice(0, SECTION_ITEMS)
        const more = group.items.length - shown.length
        shown.forEach((item: Item, i: number) => {
          const cell = buildCell(group, item, g, i, name, cur)
          if (more > 0 && i === shown.length - 1) {
            cell.appendChild(span('gallerist-grid-more', `+${more}`))
          }
          cells.appendChild(cell)
        })
        section.appendChild(cells)
        sections.appendChild(section)
        if (g === cur.g) activeSection = section
      }
      host.appendChild(sections)
      // a rebuild starts at the top: bring the current section back into view
      ;(activeSection as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' })
    }

    const setOpen = (v: boolean) => {
      // hiding the focused control would drop focus to <body>, where the viewer's keys don't reach
      if (!v && root?.contains(document.activeElement)) {
        root.closest<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
      }
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
        if (opts.layout) root.dataset.layout = opts.layout
        root.style.display = 'none'
        root.setAttribute('aria-hidden', 'true')
        toolbarBtn = document.createElement('button')
        toolbarBtn.className = 'gallerist-grid-toggle'
        ;(toolbarBtn as HTMLButtonElement).type = 'button'
        toolbarBtn.setAttribute('aria-label', 'Toggle grid')
        toolbarBtn.setAttribute('aria-pressed', 'false')
        toolbarBtn.innerHTML = ICONS.grid
        toolbarBtn.addEventListener('click', toggle)
        let wasClosed = true
        const syncStartOpen = () => {
          const { phase, cursor } = viewer.getState()
          const closed = phase === 'closed'
          if (opts.startOpen && wasClosed && !closed) setOpen(cursor.g === 0 && cursor.i === 0)
          wasClosed = closed
        }
        syncStartOpen()
        unsub = viewer.subscribe(() => {
          syncStartOpen()
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
