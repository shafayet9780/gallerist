// Windowing helpers for the rail: which run of cards to draw, and how to change it without the
// visible cards jumping. Pure or DOM-reading only; the plugin owns the DOM writes.

const INF = 1 / 0 // Infinity, in fewer bytes

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
const far = (r: DOMRect, axis: Axis) => (axis === 'x' ? r.right : r.bottom)

/**
 * Which way `scroller` runs its cards: down a column (a side rail, a flex column, or a box that only
 * scrolls vertically), else along a row. Read from the scroller, not from the cards, which can sit
 * side by side inside a vertical rail (a flat rail's group rows). A flex row runs along x. A block or
 * grid box that scrolls both ways (or neither) runs the way its content overflows most, else along
 * its longer side.
 */
export function axisOf(scroller: Element): Axis {
  const s = getComputedStyle(scroller)
  if (/column/.test(s.flexDirection)) return 'y'
  const scrollsX = /auto|scroll/.test(s.overflowX)
  const scrollsY = /auto|scroll/.test(s.overflowY)
  if (scrollsY && /hidden|clip/.test(s.overflowX)) return 'y'
  // a flex row runs along x, even though overflow-x: auto computes overflow-y to auto as well
  if (/flex/.test(s.display)) return 'x'
  if (scrollsX !== scrollsY) return scrollsY ? 'y' : 'x'
  const { scrollWidth: sw, clientWidth: cw, scrollHeight: sh, clientHeight: ch } = scroller
  const overX = Math.max(0, sw - cw)
  const overY = Math.max(0, sh - ch)
  return overY > overX || (overY === overX && ch > cw) ? 'y' : 'x'
}

/**
 * How far apart neighbouring cards sit along `axis` (the smallest step, in px, so an expanded card,
 * an index row with its items open, doesn't make the rail look emptier than it is), and the most
 * cards that share one step (cards side by side across the axis). `null` without layout (detached,
 * `display: none`, or no layout engine at all).
 */
export function measureRun(
  hosts: Element[],
  axis: Axis,
): { stride: number; perLine: number } | null {
  let stride = INF
  let perLine = 1
  let line = 1
  let prev = hosts[0]?.getBoundingClientRect()
  for (let k = 1; prev && k < hosts.length; k++) {
    const r = (hosts[k] as Element).getBoundingClientRect()
    const d = Math.abs(edge(r, axis) - edge(prev, axis))
    if (d > 0.5) {
      stride = Math.min(stride, d)
      line = 1
    } else perLine = Math.max(perLine, ++line)
    prev = r
  }
  return stride < INF ? { stride, perLine } : null
}

/**
 * Position (in `hosts`) of the card under the middle of `scroller` along `axis`, or the one whose
 * centre is nearest it. Any order: in a right-to-left rail the first card is the rightmost.
 */
export function middleOf(scroller: Element, hosts: Element[], axis: Axis): number {
  const box = scroller.getBoundingClientRect()
  const mid = (edge(box, axis) + far(box, axis)) / 2
  let best = 0
  let gap = INF
  for (let k = 0; k < hosts.length; k++) {
    const r = (hosts[k] as Element).getBoundingClientRect()
    if (edge(r, axis) <= mid && far(r, axis) >= mid) return k
    const d = Math.abs((edge(r, axis) + far(r, axis)) / 2 - mid)
    if (d < gap) {
      gap = d
      best = k
    }
  }
  return best
}

// what keepPlace's whole-px scrolls left out, per scroller: carried into its next one, so cards of
// fractional width (84 × 16/9) don't drift up to 0.5px a re-window, all the same way (0.4.1)
const owed = new WeakMap<Element, number>()

/**
 * Run `mutate`, then scroll `scroller` so `ref` sits where it was: cards added or dropped before it
 * don't move what's on screen. The scroller needs `overflow-anchor: none`, or the browser's own scroll
 * anchoring could correct the same shift twice. Scrolls whole px; the fraction left out is carried to
 * the next call for the same scroller, so what shows stays within half a px of where it was.
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
  // whole px: WebKit drops a scroll's fraction, and two such drops (the reveal, then this) can cut
  // 2px off a card meant to show whole
  const want = edge(ref.getBoundingClientRect(), axis) - before + (owed.get(scroller) ?? 0)
  const shift = Math.round(want)
  owed.set(scroller, want - shift)
  if (!shift) return
  if (axis === 'x') scroller.scrollLeft += shift
  else scroller.scrollTop += shift
}
