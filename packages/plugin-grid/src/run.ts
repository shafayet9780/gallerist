// Windowing helpers for the grid's drawn run (pure).

/** The inclusive run of `2 * side + 1` units around `at`, shifted (not cut) to fit in `count`. */
export function spanAround(at: number, count: number, side: number): [number, number] {
  const size = Math.min(count, 2 * side + 1)
  const start = Math.max(0, Math.min(at - side, count - size))
  return [start, start + size - 1]
}

/** The group holding unit `u` of a run of groups whose item counts sum up to `offsets` (prefix sums). */
export function groupAt(offsets: number[], u: number): number {
  let lo = 0
  let hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((offsets[mid] as number) <= u) lo = mid
    else hi = mid - 1
  }
  return lo
}
