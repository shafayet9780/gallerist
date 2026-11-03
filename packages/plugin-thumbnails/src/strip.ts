// Windowing helpers for the rail: which run of cards to draw, and how to change it without the
// visible cards jumping. Pure or DOM-reading only; the plugin owns the DOM writes.

export type Axis = 'x' | 'y'

/**
 * The inclusive window `[start, end]` of `before + after + 1` positions around `anchor`, shifted
 * (not cut) at either end of `count` so it stays full. Empty (`end < start`) when `count` is 0.
 */
export function spanAround(
  anchor: number,
  count: number,
  before: number,
  after: number,
): [number, number] {
  const size = Math.min(count, before + after + 1)
  const start = Math.max(0, Math.min(anchor - before, count - size))
  return [start, start + size - 1]
}

const edge = (r: DOMRect, axis: Axis) => (axis === 'x' ? r.left : r.top)

/**
 * Which way a run of cards flows, and the smallest step between neighbours, in px. The smallest so an
 * expanded card (an index row with its items open) doesn't make the rail look emptier than it is.
 * `null` without layout (detached, `display: none`, or no layout engine at all).
 */
export function measureRun(hosts: Element[]): { axis: Axis; stride: number } | null {
  let axis: Axis | null = null
  let stride = Number.POSITIVE_INFINITY
  let prev = hosts[0]?.getBoundingClientRect()
  for (let k = 1; prev && k < hosts.length; k++) {
    const r = (hosts[k] as Element).getBoundingClientRect()
    const dx = Math.abs(r.left - prev.left)
    const dy = Math.abs(r.top - prev.top)
    if (!axis && dx + dy > 0.5) axis = dx >= dy ? 'x' : 'y'
    const d = axis === 'y' ? dy : dx
    if (axis && d > 0.5) stride = Math.min(stride, d)
    prev = r
  }
  return axis && stride < Number.POSITIVE_INFINITY ? { axis, stride } : null
}

/** Position (in `hosts`) of the card under the middle of `scroller` along `axis`. */
export function middleOf(scroller: Element, hosts: Element[], axis: Axis): number {
  const box = scroller.getBoundingClientRect()
  const mid = axis === 'x' ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2
  for (let k = 0; k < hosts.length; k++) {
    const r = (hosts[k] as Element).getBoundingClientRect()
    if ((axis === 'x' ? r.right : r.bottom) >= mid) return k
  }
  return hosts.length - 1
}

/**
 * Run `mutate`, then scroll `scroller` so `ref` sits where it was: cards added or dropped before it
 * don't move what's on screen. The scroller needs `overflow-anchor: none`, or the browser's own scroll
 * anchoring could correct the same shift twice.
 */
export function keepPlace(
  scroller: HTMLElement,
  ref: Element | undefined,
  axis: Axis | null,
  mutate: () => void,
): void {
  const before = ref && axis ? edge(ref.getBoundingClientRect(), axis) : null
  mutate()
  if (before === null || !ref?.isConnected || !axis) return
  const shift = edge(ref.getBoundingClientRect(), axis) - before
  if (!shift) return
  if (axis === 'x') scroller.scrollLeft += shift
  else scroller.scrollTop += shift
}
