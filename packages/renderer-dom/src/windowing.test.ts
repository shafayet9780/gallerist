import { describe, expect, it } from 'vitest'
import { reconcileKeys, windowIndices } from './windowing'

describe('windowIndices', () => {
  it('returns center ± behind/ahead, clamped when not looping', () => {
    expect(windowIndices(5, 10, 2, 1, false)).toEqual([4, 5, 6, 7])
  })
  it('drops out-of-range indices at the edges when not looping', () => {
    expect(windowIndices(0, 10, 2, 1, false)).toEqual([0, 1, 2])
    expect(windowIndices(9, 10, 2, 1, false)).toEqual([8, 9])
  })
  it('wraps around when looping', () => {
    expect(windowIndices(0, 10, 2, 1, true)).toEqual([9, 0, 1, 2])
    expect(windowIndices(9, 10, 2, 0, true)).toEqual([9, 0, 1])
  })
  it('a single item yields just [0]', () => {
    expect(windowIndices(0, 1, 2, 1, true)).toEqual([0])
  })
  it('an empty count yields []', () => {
    expect(windowIndices(0, 0, 2, 1, true)).toEqual([])
  })
  it('dedupes when wrapping over a small count, keeping order', () => {
    expect(windowIndices(0, 2, 2, 1, true)).toEqual([1, 0])
  })
})

describe('reconcileKeys', () => {
  it('computes enter / exit / keep for a navigation step', () => {
    expect(reconcileKeys(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
      enter: ['d'],
      exit: ['a'],
      keep: ['b', 'c'],
    })
  })
  it('handles first mount', () => {
    expect(reconcileKeys([], ['a'])).toEqual({ enter: ['a'], exit: [], keep: [] })
  })
  it('no change → everything kept', () => {
    expect(reconcileKeys(['a', 'b'], ['a', 'b'])).toEqual({ enter: [], exit: [], keep: ['a', 'b'] })
  })
})
