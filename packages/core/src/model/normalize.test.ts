import { describe, expect, it } from 'vitest'
import type { Group, Item } from '../types'
import { normalize } from './normalize'

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  type: 'image',
  source: `${id}.jpg`,
  ...over,
})

describe('normalize', () => {
  it('wraps flat items into singleton groups, group.id = item.id', () => {
    const a = item('a')
    const b = item('b')
    const c = normalize({ items: [a, b] })
    expect(c.groups).toHaveLength(2)
    expect(c.groups[0]).toMatchObject({ id: 'a', items: [a] })
    expect(c.groups[1]).toMatchObject({ id: 'b', items: [b] })
  })

  it('passes groups through unchanged in shape', () => {
    const g: Group = { id: 'g1', items: [item('a1'), item('a2')] }
    const c = normalize({ groups: [g] })
    expect(c.groups).toHaveLength(1)
    expect(c.groups[0]?.items).toHaveLength(2)
    expect(c.groups[0]?.id).toBe('g1')
  })

  it('passes a full collection through, preserving meta', () => {
    const c = normalize({
      collection: { groups: [{ id: 'g1', items: [item('a1')] }], meta: { source: 'apploye' } },
    })
    expect(c.groups).toHaveLength(1)
    expect(c.meta).toEqual({ source: 'apploye' })
  })

  it('allows an empty flat gallery (items: [])', () => {
    expect(normalize({ items: [] }).groups).toEqual([])
  })

  it('throws when more than one front door is provided', () => {
    expect(() =>
      normalize({ items: [item('a')], groups: [{ id: 'g', items: [item('a')] }] }),
    ).toThrow()
  })

  it('throws when no front door is provided', () => {
    expect(() => normalize({})).toThrow()
  })

  it('throws when an item is missing an id', () => {
    const bad = { type: 'image', source: 'x.jpg' } as unknown as Item
    expect(() => normalize({ items: [bad] })).toThrow(/id/i)
  })

  it('throws when a group has an empty items array', () => {
    expect(() => normalize({ groups: [{ id: 'g', items: [] }] })).toThrow(/items/i)
  })

  it('throws when a group is missing an id', () => {
    const bad = { items: [item('a')] } as unknown as Group
    expect(() => normalize({ groups: [bad] })).toThrow(/id/i)
  })

  it('does not mutate the input items/groups', () => {
    const items = [item('a'), item('b')]
    const snapshot = JSON.parse(JSON.stringify(items))
    normalize({ items })
    expect(items).toEqual(snapshot)
  })
})
