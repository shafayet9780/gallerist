import { describe, expect, it } from 'vitest'
import type { Collection, Cursor, ItemMemory } from '../types'
import { applyItemMemory, goTo, nextGroup, nextItem, prevGroup, prevItem, resolveId } from './nav'

// 3 groups: g0 has 1 item, g1 has 3, g2 has 2.
const counts = [1, 3, 2]
const ctx = (over: Partial<{ loop: boolean; itemMemory: ItemMemory }> = {}) => ({
  counts,
  loop: over.loop ?? true,
  itemMemory: over.itemMemory ?? ('reset' as ItemMemory),
})
const at = (g: number, i: number): Cursor => ({ g, i })

describe('applyItemMemory', () => {
  it('reset → 0', () => {
    expect(applyItemMemory(2, 3, 'reset')).toBe(0)
  })
  it('preserve → keep index if present, else 0', () => {
    expect(applyItemMemory(2, 3, 'preserve')).toBe(2)
    expect(applyItemMemory(2, 2, 'preserve')).toBe(0)
  })
  it('clamp → min(i, lastIndex)', () => {
    expect(applyItemMemory(5, 3, 'clamp')).toBe(2)
    expect(applyItemMemory(1, 3, 'clamp')).toBe(1)
  })
})

describe('group axis', () => {
  it('nextGroup advances and applies itemMemory reset', () => {
    expect(nextGroup(at(1, 2), ctx())).toEqual({ g: 2, i: 0 })
  })
  it('nextGroup wraps to 0 when loop', () => {
    expect(nextGroup(at(2, 0), ctx({ loop: true }))).toEqual({ g: 0, i: 0 })
  })
  it('nextGroup is a no-op at the last group when not looping', () => {
    expect(nextGroup(at(2, 1), ctx({ loop: false }))).toEqual({ g: 2, i: 1 })
  })
  it('prevGroup wraps to last when loop', () => {
    expect(prevGroup(at(0, 0), ctx({ loop: true }))).toEqual({ g: 2, i: 0 })
  })
  it('prevGroup is a no-op at the first group when not looping', () => {
    expect(prevGroup(at(0, 0), ctx({ loop: false }))).toEqual({ g: 0, i: 0 })
  })
  it('preserve keeps the item index across groups when valid', () => {
    expect(nextGroup(at(1, 2), ctx({ itemMemory: 'preserve' }))).toEqual({ g: 2, i: 0 }) // g2 has 2 → index 2 absent → 0
    expect(prevGroup(at(2, 1), ctx({ itemMemory: 'preserve' }))).toEqual({ g: 1, i: 1 })
  })
  it('clamp keeps the item index clamped to the new group', () => {
    expect(prevGroup(at(1, 2), ctx({ itemMemory: 'clamp' }))).toEqual({ g: 0, i: 0 }) // g0 has 1 → clamp to 0
  })
})

describe('secondary (item) axis', () => {
  it('nextItem advances within the group', () => {
    expect(nextItem(at(1, 0), ctx())).toEqual({ g: 1, i: 1 })
  })
  it('nextItem clamps at the last item when not looping', () => {
    expect(nextItem(at(1, 2), ctx({ loop: false }))).toEqual({ g: 1, i: 2 })
  })
  it('nextItem wraps to the first item when looping', () => {
    expect(nextItem(at(1, 2), ctx({ loop: true }))).toEqual({ g: 1, i: 0 })
  })
  it('prevItem retreats within the group, clamped at 0 when not looping', () => {
    expect(prevItem(at(1, 1), ctx({ loop: false }))).toEqual({ g: 1, i: 0 })
    expect(prevItem(at(1, 0), ctx({ loop: false }))).toEqual({ g: 1, i: 0 })
  })
  it('prevItem wraps to the last item when looping', () => {
    expect(prevItem(at(1, 0), ctx({ loop: true }))).toEqual({ g: 1, i: 2 })
  })
  it('is a no-op in a single-item group (even when looping)', () => {
    expect(nextItem(at(0, 0), ctx({ loop: true }))).toEqual({ g: 0, i: 0 })
    expect(prevItem(at(0, 0), ctx({ loop: true }))).toEqual({ g: 0, i: 0 })
  })
})

describe('goTo', () => {
  it('clamps group index and defaults item to 0', () => {
    expect(goTo(99, undefined, ctx())).toEqual({ g: 2, i: 0 })
    expect(goTo(-5, undefined, ctx())).toEqual({ g: 0, i: 0 })
  })
  it('clamps item index within the target group', () => {
    expect(goTo(1, 5, ctx())).toEqual({ g: 1, i: 2 })
    expect(goTo(1, 1, ctx())).toEqual({ g: 1, i: 1 })
  })
})

describe('resolveId', () => {
  const collection: Collection = {
    groups: [
      { id: 'mon-1', items: [{ id: 's1', type: 'image', source: 'a' }] },
      {
        id: 'mon-2',
        items: [
          { id: 's2', type: 'image', source: 'b' },
          { id: 's3', type: 'image', source: 'c' },
        ],
      },
    ],
  }
  it('resolves a group id (item defaults to 0)', () => {
    expect(resolveId(collection, 'mon-2')).toEqual({ g: 1, i: 0 })
  })
  it('resolves a group + item id', () => {
    expect(resolveId(collection, 'mon-2', 's3')).toEqual({ g: 1, i: 1 })
  })
  it('returns null for an unknown group or item', () => {
    expect(resolveId(collection, 'nope')).toBeNull()
    expect(resolveId(collection, 'mon-2', 'nope')).toBeNull()
  })
})

describe('empty collection', () => {
  const empty = { counts: [] as number[], loop: true, itemMemory: 'reset' as ItemMemory }
  it('group nav is a no-op', () => {
    expect(nextGroup(at(0, 0), empty)).toEqual({ g: 0, i: 0 })
    expect(prevGroup(at(0, 0), empty)).toEqual({ g: 0, i: 0 })
  })
})
