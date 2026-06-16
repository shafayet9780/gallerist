// Pure virtualization helpers (spec §10.1). No DOM — drives which slides/items mount and
// how the node pool recycles containers across navigation.

/** Indices around `center` within [0,count), [behind..ahead], wrapping when `loop`. Deduped. */
export function windowIndices(
  center: number,
  count: number,
  ahead: number,
  behind: number,
  loop: boolean,
): number[] {
  if (count <= 0) return []
  const out: number[] = []
  for (let off = -behind; off <= ahead; off++) {
    let idx = center + off
    if (loop) {
      idx = ((idx % count) + count) % count
    } else if (idx < 0 || idx >= count) {
      continue
    }
    out.push(idx)
  }
  return [...new Set(out)]
}

export interface KeyReconcile {
  enter: string[]
  exit: string[]
  keep: string[]
}

/** Diff mounted keys → which to create, recycle/remove, and retain (node pool, spec §10.1). */
export function reconcileKeys(prev: string[], next: string[]): KeyReconcile {
  const prevSet = new Set(prev)
  const nextSet = new Set(next)
  return {
    enter: next.filter((k) => !prevSet.has(k)),
    exit: prev.filter((k) => !nextSet.has(k)),
    keep: next.filter((k) => prevSet.has(k)),
  }
}
