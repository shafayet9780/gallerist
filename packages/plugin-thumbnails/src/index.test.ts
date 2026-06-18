// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thumbnails } from './index'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1'), item('b2')] },
    { id: 'g2', items: [item('c0'), item('c1')] },
  ],
})

const open = (col = collection()) => {
  const v = createViewer({ collection: col, plugins: [thumbnails()] })
  mount(v)
  v.open()
  return v
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('plugin-thumbnails', () => {
  it('renders one thumb per group in the thumbnails region', () => {
    open()
    const rail = document.querySelector('.visora-region-thumbnails .visora-thumbs')
    expect(rail).not.toBeNull()
    expect(rail?.querySelectorAll('.visora-thumb').length).toBe(3)
  })

  it('marks the active group and tracks the cursor', () => {
    const v = open()
    expect(document.querySelector('.visora-thumb[data-active]')?.getAttribute('data-group')).toBe(
      'g0',
    )
    v.next()
    expect(document.querySelector('.visora-thumb[data-active]')?.getAttribute('data-group')).toBe(
      'g1',
    )
  })

  it('clicking a group thumb navigates', () => {
    const v = open()
    const g2 = document.querySelector('.visora-thumb[data-group="g2"]') as HTMLButtonElement
    g2.click()
    expect(v.getState().cursor.g).toBe(2)
  })

  it('multi-item groups get a stacked card + count badge', () => {
    open()
    const g1 = document.querySelector('.visora-thumb[data-group="g1"]')
    expect(g1?.classList.contains('visora-thumb-stacked')).toBe(true)
    expect(g1?.querySelector('.visora-thumb-count')?.textContent).toBe('3')
  })

  it('shows the count badge only on grouped (multi-item) cards', () => {
    open()
    expect(
      document.querySelector('.visora-thumb[data-group="g0"] .visora-thumb-count'),
    ).toBeNull() // single item → no badge
    expect(
      document.querySelector('.visora-thumb[data-group="g2"] .visora-thumb-count')?.textContent,
    ).toBe('2')
  })

  it('renders a group caption only when provided', () => {
    open({
      groups: [
        { id: 'g0', caption: 'Morning', items: [item('a0')] },
        { id: 'g1', items: [item('b0'), item('b1')] },
      ],
    })
    expect(
      document.querySelector('.visora-thumb[data-group="g0"] .visora-thumb-caption')?.textContent,
    ).toBe('Morning')
    expect(
      document.querySelector('.visora-thumb[data-group="g1"] .visora-thumb-caption'),
    ).toBeNull()
  })

  it('renders item captions only when provided', () => {
    open({
      groups: [{ id: 'g1', items: [{ ...item('b0'), caption: 'First screen' }, item('b1')] }],
    })
    const items = document.querySelectorAll('.visora-thumb-item')
    expect(items[0]?.querySelector('.visora-thumb-caption')?.textContent).toBe('First screen')
    expect(items[1]?.querySelector('.visora-thumb-caption')).toBeNull()
  })

  it('expands the active multi-item group into item thumbs; clicking an item navigates', () => {
    const v = open()
    v.next() // g1 (3 items) active
    const items = document.querySelectorAll('.visora-thumb-items .visora-thumb-item')
    expect(items.length).toBe(3)
    ;(items[2] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('does no work on a non-cursor state change (zoom)', () => {
    const v = open()
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.zoomTo(2) // changes zoom state, not cursor/collection → render must early-return
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not tear down the rail (replaceChildren on root) for cursor moves', () => {
    const v = open()
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.next() // group move
    v.open({ g: 1 })
    v.nextItem() // item move
    expect(spy).not.toHaveBeenCalled() // reconciled in place, never wiped
  })

  it('reconciles item nav in place: stable node identity, active flips, scrolls into view', () => {
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {}
    }
    const v = open()
    v.next() // g1 (3 items) active
    const groupBefore = document.querySelector('.visora-thumb[data-group="g1"]')
    const itemsBefore = [...document.querySelectorAll('.visora-thumb-item')]
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')

    v.nextItem() // i: 0 → 1, same group — must NOT rebuild

    const itemsAfter = [...document.querySelectorAll('.visora-thumb-item')]
    expect(itemsAfter[0]).toBe(itemsBefore[0]) // same nodes, no teardown
    expect(itemsAfter[1]).toBe(itemsBefore[1])
    expect(document.querySelector('.visora-thumb[data-group="g1"]')).toBe(groupBefore)
    expect(
      document.querySelector('.visora-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b1')
    expect(scrollSpy).toHaveBeenCalled()
    scrollSpy.mockRestore()
  })

  it('uses role=group for the expanded item row (valid nested ARIA)', () => {
    const v = open()
    v.next() // g1 active → item row appears
    expect(document.querySelector('.visora-thumb-items')?.getAttribute('role')).toBe('group')
  })

  it('lays the item column out vertically by default (matches ↑/↓ input)', () => {
    const v = open()
    v.next() // g1 active
    const col = document.querySelector('.visora-thumb-items')
    expect(col?.getAttribute('aria-orientation')).toBe('vertical')
    expect(col?.getAttribute('data-axis')).toBe('vertical')
  })

  it('honors itemAxis: "horizontal"', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ itemAxis: 'horizontal' })],
    })
    mount(v)
    v.open()
    v.next()
    const col = document.querySelector('.visora-thumb-items')
    expect(col?.getAttribute('data-axis')).toBe('horizontal')
    expect(col?.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('live-previews the current item on the active group card', () => {
    const v = open()
    v.next() // g1 active (b0,b1,b2)
    const img = document.querySelector(
      '.visora-thumb[data-group="g1"] .visora-thumb-img',
    ) as HTMLImageElement
    v.nextItem() // i → 1
    expect(img.src || img.dataset.src).toContain('b1.jpg')
    v.nextItem() // i → 2
    expect(img.src || img.dataset.src).toContain('b2.jpg')
  })

  it('restores the group cover when its group is no longer active', () => {
    const v = open()
    v.next() // g1
    v.nextItem() // shows b1 on g1's card
    v.prev() // back to g0 → g1 card should revert to its cover (items[0] = b0)
    const img = document.querySelector(
      '.visora-thumb[data-group="g1"] .visora-thumb-img',
    ) as HTMLImageElement
    expect(img.src || img.dataset.src).toContain('b0.jpg')
  })

  it('wires the thumb url for lazy loading', () => {
    open()
    const img = document.querySelector('.visora-thumb .visora-thumb-img') as HTMLImageElement
    expect(img.src || img.dataset.src).toContain('a0.jpg')
  })

  it('windows the rail: a 10k-group collection stays bounded to the window', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    open(big)
    // default overscan 24 → at most 2*24+1 group thumbs live; tight bound catches a windowing regression
    expect(document.querySelectorAll('.visora-thumb').length).toBeLessThanOrEqual(49)
  })
})
