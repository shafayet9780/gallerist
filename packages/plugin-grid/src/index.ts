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
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<GridStrings>
}

export interface GridStrings {
  /** accessible name of the grid */
  grid: string
  /** the toolbar button's label */
  toggle: string
  /** an unnamed group's name */
  group: (n: number) => string
  /** a cell's accessible name */
  cell: (groupName: string, n: number) => string
  /** the last cell of a capped `sections` card: its name, and how many items it stands for */
  cellMore: (groupName: string, n: number, more: number) => string
  /** the `sections` start button, which hides the grid */
  start: string
}

export const DEFAULT_GRID_STRINGS: GridStrings = {
  grid: 'Grid',
  toggle: 'Toggle grid',
  group: (n) => `Group ${n}`,
  cell: (groupName, n) => `${groupName}, item ${n}`,
  cellMore: (groupName, n, more) => `${groupName}, item ${n}, ${more} more`,
  start: 'Start',
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

const textSpan = (className: string, text: string): HTMLElement => {
  const node = document.createElement('span')
  node.className = className
  node.textContent = text
  return node
}

export function grid(opts: GridOptions = {}): Plugin {
  return (viewer: ViewerApi) => {
    const overscan = opts.overscan ?? 12
    const t: GridStrings = { ...DEFAULT_GRID_STRINGS, ...opts.strings }
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
        header.textContent = typeof group.meta === 'string' ? group.meta : t.group(g + 1)
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
      cell.setAttribute('aria-label', t.cell(name, i + 1))
      const selected = g === cur.g && i === cur.i
      cell.setAttribute('aria-selected', String(selected))
      if (selected) cell.setAttribute('data-active', '')
      cell.dataset.group = group.id
      cell.dataset.item = item.id
      cell.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
      cell.addEventListener('click', () => {
        // hide first: navigating rebuilds an open grid, which would drop the focused cell
        setOpen(false)
        viewer.goTo(g, i)
      })
      return cell
    }

    const renderSections = (host: HTMLElement, col: Collection, cur: Cursor) => {
      const top = document.createElement('div')
      top.className = 'gallerist-grid-top'
      const title = col.meta?.title
      if (typeof title === 'string') top.appendChild(textSpan('gallerist-grid-title', title))
      const start = document.createElement('button')
      start.type = 'button'
      start.className = 'gallerist-grid-start'
      start.textContent = t.start
      start.addEventListener('click', () => setOpen(false))
      top.appendChild(start)
      host.appendChild(top)

      const sections = document.createElement('div')
      sections.className = 'gallerist-grid-sections'
      let activeSection: HTMLElement | null = null
      // every section unless asked otherwise: an overview that loses sections isn't one
      const span = opts.overscan ?? col.groups.length
      for (const g of windowIndices(cur.g, col.groups.length, span, span, false)) {
        const group = col.groups[g]
        if (!group) continue
        const name = group.caption ?? t.group(g + 1)
        const section = document.createElement('section')
        section.className = 'gallerist-grid-section'
        section.setAttribute('aria-label', name)
        const head = document.createElement('div')
        head.className = 'gallerist-grid-section-head'
        head.appendChild(textSpan('gallerist-grid-section-name', name))
        head.appendChild(textSpan('gallerist-grid-section-count', String(group.items.length)))
        const subtitle = (group.meta as { subtitle?: unknown } | undefined)?.subtitle
        if (typeof subtitle === 'string') {
          head.appendChild(textSpan('gallerist-grid-section-sub', subtitle))
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
            cell.appendChild(textSpan('gallerist-grid-more', `+${more}`))
            cell.setAttribute('aria-label', t.cellMore(name, i + 1, more))
          }
          cells.appendChild(cell)
        })
        section.appendChild(cells)
        sections.appendChild(section)
        if (g === cur.g) activeSection = section
      }
      host.appendChild(sections)
      // a rebuild starts at the top: bring the current section back into view, without touching the
      // page (scrollIntoView would scroll an inline viewer's host page too)
      const section = activeSection as HTMLElement | null
      if (section) {
        const top = section.getBoundingClientRect().top - host.getBoundingClientRect().top
        if (top > host.clientHeight - section.offsetHeight) host.scrollTop += top
      }
    }

    const setOpen = (v: boolean) => {
      // hiding the focused control would drop focus to <body>, where the viewer's keys don't reach
      if (!v && root?.contains(document.activeElement)) {
        root.closest<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
      }
      // an overview hides the stage's controls (theme): same rescue for a control focused there
      if (v && opts.layout === 'sections') {
        const active = document.activeElement
        if (root?.closest('.gallerist')?.contains(active)) {
          if (active?.closest('.gallerist-controls, .gallerist-caption')) {
            root.closest<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
          }
        }
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
        root.setAttribute('aria-label', t.grid)
        if (opts.layout) root.dataset.layout = opts.layout
        root.style.display = 'none'
        root.setAttribute('aria-hidden', 'true')
        toolbarBtn = document.createElement('button')
        toolbarBtn.className = 'gallerist-grid-toggle'
        ;(toolbarBtn as HTMLButtonElement).type = 'button'
        toolbarBtn.setAttribute('aria-label', t.toggle)
        toolbarBtn.setAttribute('aria-pressed', 'false')
        toolbarBtn.innerHTML = ICONS.grid
        toolbarBtn.addEventListener('click', toggle)
        // a plugin added to an already open viewer doesn't cover what's being viewed
        let wasClosed = viewer.getState().phase === 'closed'
        unsub = viewer.subscribe(() => {
          const { phase, cursor } = viewer.getState()
          const closed = phase === 'closed'
          if (opts.startOpen && wasClosed && !closed) setOpen(cursor.g === 0 && cursor.i === 0)
          wasClosed = closed
          if (!open) return
          // an overview is a place to leave from: moving anywhere (an index row, the keys) enters it
          const moved = cursor.g !== lastG || cursor.i !== lastI
          if (opts.layout === 'sections' && viewer.getCollection() === lastCol && moved)
            setOpen(false)
          else render()
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
