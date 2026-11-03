// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { grid } from './index'
import { groupAt, spanAround } from './run'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0'), item('a1')] },
    { id: 'g1', items: [item('b0')] },
  ],
})

const open = (col = collection()) => {
  const v = createViewer({ collection: col, plugins: [grid()] })
  mount(v)
  v.open()
  return v
}
const gridEl = () =>
  document.querySelector('.gallerist-region-stage .gallerist-grid') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('plugin-grid', () => {
  it('renders into the stage region, hidden by default', () => {
    open()
    expect(gridEl()).not.toBeNull()
    expect(gridEl().style.display).toBe('none')
  })

  it('a toolbar toggle button is present', () => {
    open()
    expect(document.querySelector('.gallerist-grid-toggle')).not.toBeNull()
  })

  it('toggling shows the grid with group headers + item cells', () => {
    open()
    ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
    expect(gridEl().style.display).not.toBe('none')
    expect(gridEl().querySelectorAll('.gallerist-grid-header').length).toBe(2)
    expect(gridEl().querySelectorAll('.gallerist-grid-cell').length).toBe(3) // 2 + 1 items
  })

  it('clicking a cell navigates and hides the grid', () => {
    const v = open()
    ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
    const cell = gridEl().querySelector(
      '.gallerist-grid-cell[data-group="g0"][data-item="a1"]',
    ) as HTMLButtonElement
    cell.click()
    expect(v.getState().cursor).toEqual({ g: 0, i: 1 })
    expect(gridEl().style.display).toBe('none')
  })

  it('the g key toggles the grid', () => {
    open()
    document
      .querySelector('.gallerist')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
    expect(gridEl().style.display).not.toBe('none')
  })

  it('does not rebuild while open: a zoom changes nothing, a move only the selection', () => {
    const v = open()
    ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click() // open
    const spy = vi.spyOn(gridEl(), 'replaceChildren')
    const cells = [...gridEl().querySelectorAll('.gallerist-grid-cell')]
    v.zoomTo(2) // not a cursor/collection change → must not rebuild
    v.next() // a drawn cell: the selection moves, the cells stay
    expect(spy).not.toHaveBeenCalled()
    expect([...gridEl().querySelectorAll('.gallerist-grid-cell')]).toEqual(cells)
    const selected = gridEl().querySelectorAll('[aria-selected="true"]')
    expect([...selected].map((c) => (c as HTMLElement).dataset.item)).toEqual(['b0'])
    expect(gridEl().querySelectorAll('[data-active]').length).toBe(1)
  })

  it('re-opening with the same cursor still renders cells', () => {
    open()
    const toggle = document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement
    toggle.click() // open
    toggle.click() // close
    toggle.click() // reopen, same cursor → cache must be invalidated on open
    expect(gridEl().querySelectorAll('.gallerist-grid-cell').length).toBe(3)
  })

  it('windows the grid for a 10k-group collection (bounded cells)', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    open(big)
    ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
    expect(gridEl().querySelectorAll('.gallerist-grid-cell').length).toBeLessThan(200)
  })

  describe('sections layout', () => {
    const named = (): Collection => ({
      meta: { title: 'House' },
      groups: [
        {
          id: 'g0',
          caption: 'Kitchen',
          meta: { subtitle: 'Ground floor' },
          items: [item('a0'), item('a1')],
        },
        { id: 'g1', caption: 'Study', items: [item('b0')] },
      ],
    })
    const openSections = (
      col = named(),
      opts: Parameters<typeof grid>[0] = {},
      at?: { g: number; i?: number },
    ) => {
      const v = createViewer({
        collection: col,
        plugins: [grid({ layout: 'sections', startOpen: true, ...opts })],
      })
      mount(v)
      v.open(at)
      return v
    }

    it('startOpen shows one card per group on opening at the first item', () => {
      openSections()
      expect(gridEl().style.display).not.toBe('none')
      expect(gridEl().querySelector('.gallerist-grid-title')?.textContent).toBe('House')
      const names = [...gridEl().querySelectorAll('.gallerist-grid-section-name')]
      expect(names.map((n) => n.textContent)).toEqual(['Kitchen', 'Study'])
      expect(gridEl().querySelector('.gallerist-grid-section-sub')?.textContent).toBe(
        'Ground floor',
      )
      expect(gridEl().querySelector('.gallerist-grid-section-count')?.textContent).toBe('2')
    })

    it('opening at another item skips the overview', () => {
      const v = openSections(named(), {}, { g: 1 })
      expect(v.getState().cursor.g).toBe(1)
      expect(gridEl().style.display).toBe('none')
    })

    it('shows again on opening at the first item; a plain open resumes where it was', () => {
      const v = openSections()
      ;(gridEl().querySelector('.gallerist-grid-start') as HTMLButtonElement).click()
      expect(gridEl().style.display).toBe('none')
      v.next()
      expect(gridEl().style.display).toBe('none')
      v.close()
      v.open()
      expect(v.getState().cursor.g).toBe(1)
      expect(gridEl().style.display).toBe('none')
      v.close()
      v.open({ g: 0, i: 0 })
      expect(gridEl().style.display).not.toBe('none')
    })

    it('moving the cursor leaves the overview', () => {
      const v = openSections()
      v.next()
      expect(v.getState().cursor.g).toBe(1)
      expect(gridEl().style.display).toBe('none')
    })

    it('a cell click keeps focus inside the viewer', () => {
      openSections()
      const cell = gridEl().querySelector('[data-item="b0"]') as HTMLButtonElement
      cell.focus()
      cell.click()
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    it('opening the overview from a stage control keeps focus inside the viewer', () => {
      const v = createViewer({ collection: named(), plugins: [grid({ layout: 'sections' })] })
      mount(v)
      v.open()
      const next = document.querySelector('.gallerist-next') as HTMLButtonElement
      next.focus()
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    it('draws the sections near the current one (4 each side, or overscan)', () => {
      const many: Collection = {
        groups: Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, items: [item(`m${i}`)] })),
      }
      openSections(many)
      expect(gridEl().querySelectorAll('.gallerist-grid-section').length).toBe(9)
      document.body.innerHTML = ''
      openSections(many, { overscan: 2 })
      expect(gridEl().querySelectorAll('.gallerist-grid-section').length).toBe(5)
    })

    it('added to an open viewer, startOpen does not cover what is being viewed', () => {
      const v = createViewer({ collection: named() })
      mount(v)
      v.open()
      v.use(grid({ layout: 'sections', startOpen: true }))
      expect(gridEl().style.display).toBe('none')
    })

    it('the start button uses strings.start and keeps focus inside the viewer', () => {
      openSections(named(), { strings: { start: 'Start tour' } })
      const start = gridEl().querySelector('.gallerist-grid-start') as HTMLButtonElement
      expect(start.textContent).toBe('Start tour')
      start.focus()
      start.click()
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    it('a cell navigates; a long group is capped with the rest counted', () => {
      const long: Collection = {
        groups: [{ id: 'g0', items: Array.from({ length: 30 }, (_, i) => item(`x${i}`)) }],
      }
      const v = openSections(long)
      const cells = gridEl().querySelectorAll<HTMLButtonElement>('.gallerist-grid-cell')
      expect(cells.length).toBe(9)
      expect(gridEl().querySelector('.gallerist-grid-more')?.textContent).toBe('+21')
      expect(cells[8]?.getAttribute('aria-label')).toContain('21 more')
      cells[3]?.click()
      expect(v.getState().cursor).toEqual({ g: 0, i: 3 })
      expect(gridEl().style.display).toBe('none')
    })

    it('without startOpen stays hidden until toggled', () => {
      openSections(named(), { startOpen: false })
      expect(gridEl().style.display).toBe('none')
    })
  })

  describe('drawn run (U17)', () => {
    // An IntersectionObserver the test drives: `near(el)` reports `el` as come into range.
    type Fake = { cb: IntersectionObserverCallback; targets: Set<Element>; root: unknown }
    let fakes: Fake[] = []
    const stubIO = () => {
      fakes = []
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          f: Fake
          constructor(cb: IntersectionObserverCallback, o?: IntersectionObserverInit) {
            this.f = { cb, targets: new Set(), root: o?.root }
            fakes.push(this.f)
          }
          observe(el: Element) {
            this.f.targets.add(el)
          }
          unobserve(el: Element) {
            this.f.targets.delete(el)
          }
          disconnect() {
            this.f.targets.clear()
          }
        },
      )
    }
    const near = (el: Element) => {
      const f = fakes.find((x) => x.root && x.targets.has(el))
      f?.cb(
        [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
        {} as never,
      )
    }
    const edges = () => [...gridEl().querySelectorAll('.gallerist-grid-edge')]
    const oneGroup = (n: number): Collection => ({
      groups: [{ id: 'g0', items: Array.from({ length: n }, (_, i) => item(`x${i}`)) }],
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('cells: one 10k-item group draws 40 cells each side of the current one', () => {
      const v = open(oneGroup(10_000))
      v.goTo(0, 5000)
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      const cells = gridEl().querySelectorAll<HTMLElement>('.gallerist-grid-cell')
      expect(cells.length).toBe(81)
      expect(cells[0]?.dataset.item).toBe('x4960')
      expect(cells[80]?.dataset.item).toBe('x5040')
      expect(gridEl().querySelector('[data-active]')?.getAttribute('data-item')).toBe('x5000')
    })

    it('cells: a move outside the drawn run redraws around it', () => {
      const v = open(oneGroup(10_000))
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      v.goTo(0, 9000)
      const cells = gridEl().querySelectorAll<HTMLElement>('.gallerist-grid-cell')
      expect(cells.length).toBe(81)
      expect(gridEl().querySelector('[data-active]')?.getAttribute('data-item')).toBe('x9000')
    })

    it('cells: scrolling near either end draws more, keeping groups in order', () => {
      stubIO()
      const groups = Array.from({ length: 100 }, (_, g) => ({
        id: `g${g}`,
        items: [item(`a${g}`), item(`b${g}`)],
      }))
      const v = open({ groups })
      v.goTo(50, 0) // unit 100
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      const ids = () =>
        [...gridEl().querySelectorAll<HTMLElement>('.gallerist-grid-cell')].map(
          (c) => c.dataset.item,
        )
      expect(ids().length).toBe(81) // units 60..140
      const [head, tail] = edges() as [Element, Element]
      near(tail)
      near(head)
      const drawn = ids()
      expect(drawn.length).toBe(161) // units 20..180
      expect(drawn[0]).toBe('a10')
      expect(drawn.at(-1)).toBe('a90')
      // one header + one cells block per group, in collection order, between the edges
      const kids = [...gridEl().children]
      expect(kids[0]).toBe(head)
      expect(kids.at(-1)).toBe(tail)
      const headers = gridEl().querySelectorAll('.gallerist-grid-header')
      expect([...headers].map((h) => h.textContent)).toEqual(
        Array.from({ length: 81 }, (_, k) => `Group ${k + 11}`),
      )
    })

    it('sections: scrolling near the end draws the next ones; the first one is never lost', () => {
      stubIO()
      const groups = Array.from({ length: 50 }, (_, g) => ({ id: `g${g}`, items: [item(`m${g}`)] }))
      const v = createViewer({ collection: { groups }, plugins: [grid({ layout: 'sections' })] })
      mount(v)
      v.open({ g: 20, i: 0 })
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      const names = () =>
        [...gridEl().querySelectorAll('.gallerist-grid-section')].map((s) =>
          s.getAttribute('aria-label'),
        )
      expect(names()).toEqual(Array.from({ length: 9 }, (_, k) => `Group ${k + 17}`))
      const [head, tail] = edges() as [Element, Element]
      for (let k = 0; k < 10; k++) near(tail)
      for (let k = 0; k < 10; k++) near(head)
      expect(names()).toEqual(Array.from({ length: 50 }, (_, k) => `Group ${k + 1}`))
    })

    // happy-dom lays nothing out: the grids report `cols` columns, a cell's top is its row's
    let cols = 4
    const stubLayout = () => {
      cols = 4
      const real = window.getComputedStyle.bind(window)
      vi.stubGlobal('getComputedStyle', (el: Element, p?: string | null) =>
        el.matches('.gallerist-grid-cells, .gallerist-grid-sections')
          ? ({ gridTemplateColumns: Array(cols).fill('100px').join(' ') } as CSSStyleDeclaration)
          : real(el, p),
      )
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const k = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0
        const top = this.matches('.gallerist-grid-cell') ? Math.floor(k / cols) * 100 : 0
        return { top, bottom: top + 100, left: 0, right: 0, width: 0, height: 100 } as DOMRect
      })
    }
    const openWith = (
      col: Collection,
      opts: Parameters<typeof grid>[0],
      at: { g: number; i: number },
    ) => {
      const v = createViewer({ collection: col, plugins: [grid(opts)] })
      mount(v)
      v.open(at)
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      return v
    }
    // every drawn cell sits in its own column: its place in its block, mod cols, is its index's
    const inColumns = () =>
      [...gridEl().querySelectorAll('.gallerist-grid-cells')].every((b) =>
        [...b.children].every(
          (c, k) => (Number(c.getAttribute('aria-posinset')) - 1) % cols === k % cols,
        ),
      )
    const firstIndex = () =>
      Number(gridEl().querySelector('.gallerist-grid-cell')?.getAttribute('aria-posinset')) - 1

    it('cells: the run starts on a row, and grows at the start by whole rows', () => {
      stubIO()
      stubLayout()
      openWith(oneGroup(10_000), { overscan: 10 }, { g: 0, i: 5003 }) // 4993..5013
      expect(firstIndex()).toBe(4992)
      expect(gridEl().querySelector('[data-active]')?.getAttribute('data-item')).toBe('x5003')
      expect(inColumns()).toBe(true)
      const scrolled = gridEl().scrollTop
      near(edges()[0] as Element) // from 4982, down to its row: 4980
      expect(firstIndex()).toBe(4980)
      expect(inColumns()).toBe(true)
      // 12 cells, 3 rows, went above what was on screen: the offset follows
      expect(gridEl().scrollTop - scrolled).toBe(300)
    })

    it('cells: across groups each block starts on a row; a new column count realigns', () => {
      stubIO()
      stubLayout()
      const groups = Array.from({ length: 100 }, (_, g) => ({
        id: `g${g}`,
        items: Array.from({ length: 7 }, (_, i) => item(`x${g}_${i}`)),
      }))
      openWith({ groups }, { overscan: 9 }, { g: 50, i: 5 }) // units 346..364: g49 #3 → #0
      expect(gridEl().querySelector('.gallerist-grid-cell')?.getAttribute('data-item')).toBe(
        'x49_0',
      )
      expect(inColumns()).toBe(true)
      near(edges()[0] as Element) // unit 334: g47 #5 → #4
      expect(gridEl().querySelector('.gallerist-grid-cell')?.getAttribute('data-item')).toBe(
        'x47_4',
      )
      expect(inColumns()).toBe(true)
      cols = 3 // a resize
      near(edges()[0] as Element) // unit 322: g46 #0
      near(edges()[0] as Element) // unit 312: g44 #4 → #3
      expect(gridEl().querySelector('.gallerist-grid-cell')?.getAttribute('data-item')).toBe(
        'x44_3',
      )
      expect(inColumns()).toBe(true)
    })

    it('sections: the run starts on a row, and grows at the start by whole rows', () => {
      stubIO()
      stubLayout()
      cols = 3
      const groups = Array.from({ length: 50 }, (_, g) => ({ id: `g${g}`, items: [item(`m${g}`)] }))
      openWith({ groups }, { layout: 'sections' }, { g: 20, i: 0 }) // 16..24 → 15..24
      const firstName = () =>
        gridEl().querySelector('.gallerist-grid-section')?.getAttribute('aria-label')
      expect(firstName()).toBe('Group 16')
      expect(gridEl().querySelectorAll('.gallerist-grid-section').length).toBe(10)
      near(edges()[0] as Element) // from 11, down to its row: 9
      expect(firstName()).toBe('Group 10')
    })

    it('focus on a cell moves to the new current cell when the grid redraws', () => {
      const v = open()
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      const old = gridEl().querySelector('[data-active]') as HTMLButtonElement
      old.focus()
      v.setCollection({ groups: [...collection().groups, { id: 'g2', items: [item('c0')] }] })
      const now = gridEl().querySelector('[data-active]')
      expect(now).not.toBe(old)
      expect(now?.getAttribute('data-item')).toBe('a0')
      expect(document.activeElement).toBe(now)

      document.body.innerHTML = ''
      const w = open(oneGroup(10_000))
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      ;(gridEl().querySelector('[data-active]') as HTMLButtonElement).focus()
      w.goTo(0, 9000) // outside the drawn run
      expect(document.activeElement?.getAttribute('data-item')).toBe('x9000')
    })

    it('focus falls back to the viewer when the redraw has no current cell', () => {
      const long = (): Collection => oneGroup(30) // a card shows 9: item 20 is counted, not drawn
      const v = openWith(long(), { layout: 'sections' }, { g: 0, i: 20 })
      ;(gridEl().querySelector('.gallerist-grid-cell') as HTMLButtonElement).focus()
      v.setCollection(long())
      expect(gridEl().querySelectorAll('.gallerist-grid-cell').length).toBe(9)
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    it('cells carry their place in the whole group (aria-setsize / aria-posinset)', () => {
      open()
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      const at = (c: Element) => [c.getAttribute('aria-posinset'), c.getAttribute('aria-setsize')]
      expect([...gridEl().querySelectorAll('.gallerist-grid-cell')].map(at)).toEqual([
        ['1', '2'],
        ['2', '2'],
        ['1', '1'],
      ])
      document.body.innerHTML = ''
      const v = open(oneGroup(10_000))
      v.goTo(0, 5000)
      ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()
      const cells = gridEl().querySelectorAll('.gallerist-grid-cell')
      expect(at(cells[0] as Element)).toEqual(['4961', '10000'])
      expect(at(cells[80] as Element)).toEqual(['5041', '10000'])
    })

    it('a sections card, all of whose cells are drawn, leaves them to the browser', () => {
      openWith(oneGroup(30), { layout: 'sections' }, { g: 0, i: 0 })
      const cell = gridEl().querySelector('.gallerist-grid-cell')
      expect(cell?.hasAttribute('aria-setsize')).toBe(false)
      expect(cell?.hasAttribute('aria-posinset')).toBe(false)
    })

    it('closing drops what it drew; re-opening draws it again', () => {
      open()
      const toggle = document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement
      toggle.click()
      expect(gridEl().children.length).toBeGreaterThan(0)
      toggle.click()
      expect(gridEl().children.length).toBe(0)
      toggle.click()
      expect(gridEl().querySelectorAll('.gallerist-grid-cell').length).toBe(3)
    })

    it('the tour start drops the overview', () => {
      const v = createViewer({
        collection: { groups: [{ id: 'g0', items: [item('a')] }] },
        plugins: [grid({ layout: 'sections', startOpen: true })],
      })
      mount(v)
      v.open()
      ;(gridEl().querySelector('.gallerist-grid-start') as HTMLButtonElement).click()
      expect(gridEl().children.length).toBe(0)
    })
  })
})

describe('run helpers', () => {
  it('spanAround keeps the run full at either end', () => {
    expect(spanAround(5, 100, 2)).toEqual([3, 7])
    expect(spanAround(0, 100, 2)).toEqual([0, 4])
    expect(spanAround(99, 100, 2)).toEqual([95, 99])
    expect(spanAround(1, 3, 2)).toEqual([0, 2])
    expect(spanAround(0, 0, 2)).toEqual([0, -1])
  })

  it('groupAt finds the group holding a unit, past empty groups', () => {
    const offsets = [0, 2, 2, 5, 6] // sizes 2, 0, 3, 1
    expect([0, 1, 2, 3, 4, 5].map((u) => groupAt(offsets, u))).toEqual([0, 0, 2, 2, 2, 3])
  })
})
