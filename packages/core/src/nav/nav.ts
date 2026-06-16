// Two-axis navigation math (spec §5). Pure functions: (cursor, ctx) → cursor.
// Primary axis (group) wraps when loop; secondary axis (item) clamps, never wraps.

import type { Collection, Cursor, ItemMemory } from '../types'

export interface NavCtx {
  /** item count per group; counts.length is the group count. */
  counts: number[]
  loop: boolean
  itemMemory: ItemMemory
}

/** Cross-axis item-index policy when entering a new group (spec §5, decision D4). */
export function applyItemMemory(prevI: number, count: number, policy: ItemMemory): number {
  if (count <= 0) return 0
  const i = Math.max(0, prevI)
  switch (policy) {
    case 'reset':
      return 0
    case 'preserve':
      return i < count ? i : 0
    case 'clamp':
      return Math.min(i, count - 1)
  }
}

export function nextGroup(cursor: Cursor, ctx: NavCtx): Cursor {
  const n = ctx.counts.length
  if (n === 0) return cursor
  let g = cursor.g + 1
  if (g >= n) {
    if (!ctx.loop) return cursor
    g = 0
  }
  return { g, i: applyItemMemory(cursor.i, ctx.counts[g] ?? 0, ctx.itemMemory) }
}

export function prevGroup(cursor: Cursor, ctx: NavCtx): Cursor {
  const n = ctx.counts.length
  if (n === 0) return cursor
  let g = cursor.g - 1
  if (g < 0) {
    if (!ctx.loop) return cursor
    g = n - 1
  }
  return { g, i: applyItemMemory(cursor.i, ctx.counts[g] ?? 0, ctx.itemMemory) }
}

export function nextItem(cursor: Cursor, ctx: NavCtx): Cursor {
  const count = ctx.counts[cursor.g] ?? 0
  return { g: cursor.g, i: Math.max(0, Math.min(cursor.i + 1, count - 1)) }
}

export function prevItem(cursor: Cursor, _ctx: NavCtx): Cursor {
  return { g: cursor.g, i: Math.max(0, cursor.i - 1) }
}

export function goTo(g: number, i: number | undefined, ctx: NavCtx): Cursor {
  const n = ctx.counts.length
  if (n === 0) return { g: 0, i: 0 }
  const cg = Math.max(0, Math.min(g, n - 1))
  const count = ctx.counts[cg] ?? 0
  const ci = i === undefined ? 0 : Math.max(0, Math.min(i, count - 1))
  return { g: cg, i: ci }
}

/** Resolve a deep-link / API id pair to a cursor; null if not found (spec §4.4, §8.2). */
export function resolveId(collection: Collection, groupId: string, itemId?: string): Cursor | null {
  const g = collection.groups.findIndex((gr) => gr.id === groupId)
  if (g < 0) return null
  if (itemId === undefined) return { g, i: 0 }
  const i = collection.groups[g]?.items.findIndex((it) => it.id === itemId) ?? -1
  if (i < 0) return null
  return { g, i }
}
