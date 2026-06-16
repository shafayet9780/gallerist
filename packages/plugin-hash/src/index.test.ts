// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
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
})
