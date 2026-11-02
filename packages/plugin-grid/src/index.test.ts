// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { grid } from './index'

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

  it('does not rebuild while open on a non-cursor change (zoom)', () => {
    const v = open()
    ;(document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click() // open
    const spy = vi.spyOn(gridEl(), 'replaceChildren')
    v.zoomTo(2) // not a cursor/collection change → must not rebuild
    expect(spy).not.toHaveBeenCalled()
    v.next() // cursor change → must rebuild
    expect(spy).toHaveBeenCalled()
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

    it('shows again on the next open, not while navigating after start', () => {
      const v = openSections()
      ;(gridEl().querySelector('.gallerist-grid-start') as HTMLButtonElement).click()
      expect(gridEl().style.display).toBe('none')
      v.next()
      expect(gridEl().style.display).toBe('none')
      v.goTo(0, 0)
      v.close()
      v.open()
      expect(gridEl().style.display).not.toBe('none')
    })

    it('the start button uses startLabel and keeps focus inside the viewer', () => {
      openSections(named(), { startLabel: 'Start tour' })
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
      cells[3]?.click()
      expect(v.getState().cursor).toEqual({ g: 0, i: 3 })
      expect(gridEl().style.display).toBe('none')
    })

    it('without startOpen stays hidden until toggled', () => {
      openSections(named(), { startOpen: false })
      expect(gridEl().style.display).toBe('none')
    })
  })
})
