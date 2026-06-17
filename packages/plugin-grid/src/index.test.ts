// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
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
const gridEl = () => document.querySelector('.visora-region-stage .visora-grid') as HTMLElement

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
    expect(document.querySelector('.visora-grid-toggle')).not.toBeNull()
  })

  it('toggling shows the grid with group headers + item cells', () => {
    open()
    ;(document.querySelector('.visora-grid-toggle') as HTMLButtonElement).click()
    expect(gridEl().style.display).not.toBe('none')
    expect(gridEl().querySelectorAll('.visora-grid-header').length).toBe(2)
    expect(gridEl().querySelectorAll('.visora-grid-cell').length).toBe(3) // 2 + 1 items
  })

  it('clicking a cell navigates and hides the grid', () => {
    const v = open()
    ;(document.querySelector('.visora-grid-toggle') as HTMLButtonElement).click()
    const cell = gridEl().querySelector(
      '.visora-grid-cell[data-group="g0"][data-item="a1"]',
    ) as HTMLButtonElement
    cell.click()
    expect(v.getState().cursor).toEqual({ g: 0, i: 1 })
    expect(gridEl().style.display).toBe('none')
  })

  it('the g key toggles the grid', () => {
    open()
    document
      .querySelector('.visora')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
    expect(gridEl().style.display).not.toBe('none')
  })

  it('does not rebuild while open on a non-cursor change (zoom)', () => {
    const v = open()
    ;(document.querySelector('.visora-grid-toggle') as HTMLButtonElement).click() // open
    const spy = vi.spyOn(gridEl(), 'replaceChildren')
    v.zoomTo(2) // not a cursor/collection change → must not rebuild
    expect(spy).not.toHaveBeenCalled()
    v.next() // cursor change → must rebuild
    expect(spy).toHaveBeenCalled()
  })

  it('re-opening with the same cursor still renders cells', () => {
    open()
    const toggle = document.querySelector('.visora-grid-toggle') as HTMLButtonElement
    toggle.click() // open
    toggle.click() // close
    toggle.click() // reopen, same cursor → cache must be invalidated on open
    expect(gridEl().querySelectorAll('.visora-grid-cell').length).toBe(3)
  })

  it('windows the grid for a 10k-group collection (bounded cells)', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    open(big)
    ;(document.querySelector('.visora-grid-toggle') as HTMLButtonElement).click()
    expect(gridEl().querySelectorAll('.visora-grid-cell').length).toBeLessThan(200)
  })
})
