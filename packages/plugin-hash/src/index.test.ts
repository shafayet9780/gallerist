// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { afterEach, describe, expect, it } from 'vitest'
import { formatHash, hash, parseHash } from './index'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1')] },
  ],
})

afterEach(() => {
  window.location.hash = ''
})

describe('parse/format', () => {
  it('round-trips a group + item', () => {
    expect(parseHash('#g=mon-2&i=s3')).toEqual({ g: 'mon-2', i: 's3' })
    expect(formatHash('mon-2', 's3')).toBe('g=mon-2&i=s3')
  })
  it('handles group-only and url-encoding', () => {
    expect(parseHash('#g=a%20b')).toEqual({ g: 'a b' })
    expect(formatHash('a b')).toBe('g=a%20b')
  })
  it('tolerates a malformed percent-escape without throwing (I-PL1)', () => {
    expect(() => parseHash('#g=%')).not.toThrow()
    expect(parseHash('#g=%')).toEqual({ g: '%' })
    expect(() => parseHash('#g=%E0%A4%A')).not.toThrow()
  })
  it('preserves ids containing "=" by splitting on the first only (I-PL2)', () => {
    expect(parseHash('#g=a=b&i=c')).toEqual({ g: 'a=b', i: 'c' })
  })
})

describe('plugin-hash', () => {
  it('writes the hash on navigation', () => {
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    v.open()
    v.next()
    expect(window.location.hash).toContain('g=g1')
  })

  it('navigates on an external hashchange', () => {
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    v.open()
    window.location.hash = 'g=g1&i=b1'
    window.dispatchEvent(new Event('hashchange'))
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })

  it('opens at the hash position on load', () => {
    window.location.hash = 'g=g1&i=b1'
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    expect(v.getState().phase).toBe('open')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })

  it('does not open on load when open:false', () => {
    window.location.hash = 'g=g1'
    const v = createViewer({ collection: collection(), plugins: [hash({ open: false })] })
    expect(v.getState().phase).toBe('closed')
  })

  it('does not swallow an external hashchange after a nav (no stuck latch)', () => {
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    v.open()
    v.next() // writes the hash; a boolean latch would arm here with no event to consume it
    window.location.hash = 'g=g0' // external back navigation
    window.dispatchEvent(new Event('hashchange'))
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('ignores the echo of its own hash write (no feedback loop)', () => {
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    v.open()
    v.next() // g1
    window.dispatchEvent(new Event('hashchange')) // browser echo: hash unchanged from our write
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
  })

  it('replaces history rather than pushing on intra-gallery nav (I-PL3)', () => {
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    v.open()
    const before = window.history.length
    v.next()
    v.nextItem()
    expect(window.history.length).toBe(before) // no new Back-trapping entries
    expect(window.location.hash).toContain('g=g1')
  })

  it('ignores a malformed hash without throwing', () => {
    const v = createViewer({ collection: collection(), plugins: [hash()] })
    v.open()
    v.next() // g1
    window.location.hash = 'i=oops' // no g
    window.dispatchEvent(new Event('hashchange'))
    expect(v.getState().cursor.g).toBe(1)
  })
})
