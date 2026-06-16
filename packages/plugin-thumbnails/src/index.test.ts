// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('expands the active multi-item group into item thumbs; clicking an item navigates', () => {
    const v = open()
    v.next() // g1 (3 items) active
    const items = document.querySelectorAll('.visora-thumb-items .visora-thumb-item')
    expect(items.length).toBe(3)
    ;(items[2] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('wires the thumb url for lazy loading', () => {
    open()
    const img = document.querySelector('.visora-thumb .visora-thumb-img') as HTMLImageElement
    expect(img.src || img.dataset.src).toContain('a0.jpg')
  })

  it('windows the rail: a 10k-group collection stays bounded (<200 thumbs)', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    open(big)
    expect(document.querySelectorAll('.visora-thumb').length).toBeLessThan(200)
  })
})
