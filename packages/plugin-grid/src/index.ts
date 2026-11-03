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
import { ICONS } from '@gallerist/core/internal'
import { groupAt, spanAround } from './run'

export interface GridOptions {
  /**
   * Cells (`cells`) or sections (`sections`) drawn on each side of the current one when the grid
   * opens (default 40 cells, 4 sections). Scrolling near either end draws as many more, so the whole
   * collection stays reachable while only what's been scrolled to is in the document.
   */
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
/** Default `overscan`: cells, and sections, drawn each side of the current one at first. */
const CELL_SPAN = 40
const SECTION_SPAN = 4

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
    const sections = opts.layout === 'sections'
    const span = opts.overscan ?? (sections ? SECTION_SPAN : CELL_SPAN)
    const t: GridStrings = { ...DEFAULT_GRID_STRINGS, ...opts.strings }
    let root: HTMLElement | null = null
    let toolbarBtn: HTMLElement | null = null
    let open = false
    let unsub: (() => void) | null = null
    // Rebuild only on cursor/collection change — skip unrelated commits while open (review T6).
    let lastG = -1
    let lastI = -1
    let lastCol: Collection | null = null
    // The drawn run (U17): units first..last, inclusive. A unit is a group (`sections`) or an item
    // (`cells`, numbered across groups through `offsets`). Sentinels at both ends draw more as they
    // come near the viewport; closing drops it all.
    let first = 0
    let last = -1
    let offsets: number[] = [0] // cells: items before each group, then the total
    let box: HTMLElement | null = null // where sections go (cells go in per-group blocks on root)
    let head: HTMLElement | null = null
    let tail: HTMLElement | null = null
    const blocks = new Map<number, { header: HTMLElement; cells: HTMLElement }>()
    const drawn = new Map<number, HTMLElement>() // unit → its section or cell
    let activeCell: HTMLElement | null = null
    let edges: IntersectionObserver | null = null
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

    const unitCount = (col: Collection) => (sections ? col.groups.length : (offsets.at(-1) ?? 0))
    const unitOf = (cur: Cursor) => (sections ? cur.g : (offsets[cur.g] ?? 0) + cur.i)

    const setSelected = (cell: HTMLElement, on: boolean) => {
      cell.setAttribute('aria-selected', String(on))
      if (on) cell.setAttribute('data-active', '')
      else cell.removeAttribute('data-active')
    }

    // bring `el` into the grid's view, without touching the page (scrollIntoView would scroll an
    // inline viewer's host page too)
    const reveal = (el: HTMLElement | null | undefined) => {
      if (!root || !el) return
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top
      if (top < 0 || top > root.clientHeight - el.offsetHeight) root.scrollTop += top
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
      setSelected(cell, selected)
      if (selected) activeCell = cell
      cell.dataset.group = group.id
      cell.dataset.item = item.id
      cell.appendChild(lazyImg(thumbUrl(item.thumb) ?? thumbUrl(item.source), observer))
      cell.addEventListener('click', () => {
        // hide first: hiding hands focus to the viewer before the cell goes
        setOpen(false)
        viewer.goTo(g, i)
      })
      return cell
    }

    const buildSection = (group: Group, g: number, cur: Cursor): HTMLElement => {
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
      return section
    }

    // draw unit `u` at the start or the end of the run
    const drawUnit = (col: Collection, u: number, atStart: boolean, cur: Cursor) => {
      if (!root || !head || !tail) return
      if (sections) {
        const group = col.groups[u]
        if (!group || !box) return
        const section = buildSection(group, u, cur)
        if (atStart) box.prepend(section)
        else box.append(section)
        drawn.set(u, section)
        return
      }
      const g = groupAt(offsets, u)
      const group = col.groups[g]
      const item = group?.items[u - (offsets[g] ?? 0)]
      if (!group || !item) return
      let block = blocks.get(g)
      if (!block) {
        const header = document.createElement('div')
        header.className = 'gallerist-grid-header'
        header.textContent = typeof group.meta === 'string' ? group.meta : t.group(g + 1)
        const cells = document.createElement('div')
        cells.className = 'gallerist-grid-cells'
        cells.setAttribute('role', 'listbox')
        root.insertBefore(header, atStart ? head.nextSibling : tail)
        root.insertBefore(cells, header.nextSibling)
        block = { header, cells }
        blocks.set(g, block)
      }
      const cell = buildCell(
        group,
        item,
        g,
        u - (offsets[g] ?? 0),
        block.header.textContent ?? '',
        cur,
      )
      if (atStart) block.cells.prepend(cell)
      else block.cells.append(cell)
      drawn.set(u, cell)
    }

    // Draw `span` more units past either end of the run; false when there are none. Units added
    // above what's on screen would push it down: the scroll offset follows.
    const extend = (atStart: boolean): boolean => {
      const col = viewer.getCollection()
      if (!root || !open || col !== lastCol) return false
      const to = atStart ? Math.max(0, first - span) : Math.min(unitCount(col) - 1, last + span)
      if (to === (atStart ? first : last)) return false
      const cur = viewer.getState().cursor
      if (atStart) {
        const ref = drawn.get(first)
        const top = ref?.getBoundingClientRect().top ?? 0
        for (let u = first - 1; u >= to; u--) drawUnit(col, u, true, cur)
        if (ref) root.scrollTop += ref.getBoundingClientRect().top - top
        first = to
      } else {
        for (let u = last + 1; u <= to; u++) drawUnit(col, u, false, cur)
        last = to
      }
      return true
    }

    const clear = () => {
      root?.replaceChildren()
      edges?.disconnect()
      observer?.disconnect() // the lazy images went too
      blocks.clear()
      drawn.clear()
      activeCell = null
      box = head = tail = null
      first = 0
      last = -1
    }

    // draw the run around the cursor, from scratch
    const draw = (col: Collection, cur: Cursor) => {
      if (!root) return
      clear()
      head = document.createElement('div')
      tail = document.createElement('div')
      head.className = tail.className = 'gallerist-grid-edge'
      if (sections) {
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
        box = document.createElement('div')
        box.className = 'gallerist-grid-sections'
        root.append(top, head, box, tail)
      } else {
        offsets = [0]
        for (const group of col.groups) offsets.push((offsets.at(-1) ?? 0) + group.items.length)
        root.append(head, tail)
      }
      ;[first, last] = spanAround(unitOf(cur), unitCount(col), span)
      for (let u = first; u <= last; u++) drawUnit(col, u, false, cur)
      edges?.observe(head)
      edges?.observe(tail)
      // a redraw starts at the top: bring the current section or cell back into view
      reveal(sections ? drawn.get(cur.g) : activeCell)
    }

    const render = () => {
      if (!root || !open) return
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      if (col === lastCol && cur.g === lastG && cur.i === lastI) return
      lastG = cur.g
      lastI = cur.i
      const u = unitOf(cur)
      if (!sections && col === lastCol && u >= first && u <= last) {
        // a move within the drawn cells: only the selection changes
        if (activeCell) setSelected(activeCell, false)
        activeCell = drawn.get(u) ?? null
        if (activeCell) setSelected(activeCell, true)
        reveal(activeCell)
        return
      }
      lastCol = col
      draw(col, cur)
    }

    const setOpen = (v: boolean) => {
      // hiding the focused control would drop focus to <body>, where the viewer's keys don't reach
      if (!v && root?.contains(document.activeElement)) {
        root.closest<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
      }
      // an overview hides the stage's controls (theme): same rescue for a control focused there
      if (v && sections) {
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
      lastCol = null // re-opening always redraws
      if (open) render()
      else clear() // a hidden grid keeps nothing in the document
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
        root.style.overflowAnchor = 'none' // extend() corrects the offset itself
        root.setAttribute('aria-hidden', 'true')
        if (typeof IntersectionObserver !== 'undefined') {
          edges = new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                // still near after drawing more: observing again reports it again
                if (e.isIntersecting && extend(e.target === head)) {
                  edges?.unobserve(e.target)
                  edges?.observe(e.target)
                }
              }
            },
            { root, rootMargin: '50% 0px' },
          )
        }
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
          if (sections && viewer.getCollection() === lastCol && moved) setOpen(false)
          else render()
        })
      },
      destroy() {
        unsub?.()
        observer?.disconnect()
        edges?.disconnect()
        edges = null
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
