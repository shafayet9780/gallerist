// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from './mount'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.removeProperty('overflow')
})

describe('virtualization (spec §20: bounded DOM at scale)', () => {
  const bigCollection = (n: number): Collection => ({
    groups: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
  })

  it('keeps only a small slide window live for a 10,000-group collection', () => {
    const v = createViewer({ collection: bigCollection(10_000) })
    mount(v)
    v.open()
    expect(document.querySelectorAll('.visora-slide').length).toBeLessThan(10)
  })

  it('preloads the wrap-around neighbor at the last group when loop is on (C4)', () => {
    const v = createViewer({ collection: bigCollection(10), loop: true })
    mount(v)
    v.open()
    for (let i = 0; i < 9; i++) v.next() // navigate to the last group (g9)
    expect(v.getState().cursor.g).toBe(9)
    // next() wraps g9 → g0, so the slide window must include g0 (else a blank frame on wrap)
    expect(document.querySelector('[data-group="g0"]')).not.toBeNull()
  })

  it('stays bounded across deep navigation (node pool recycles, no growth)', () => {
    const v = createViewer({ collection: bigCollection(10_000), loop: true })
    mount(v)
    v.open()
    for (let i = 0; i < 500; i++) v.next()
    expect(v.getState().cursor.g).toBe(500)
    expect(document.querySelectorAll('.visora-slide').length).toBeLessThan(10)
    // only one image (the current slide's active item) is mounted at a time per slide
    expect(document.querySelectorAll('img').length).toBeLessThan(10)
  })
})
