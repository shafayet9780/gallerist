// The rail as a strip to pull rather than a box with a scrollbar. The theme hides the scrollbar;
// this module gives back what it did, and more:
//  • a mouse or pen drags the strip (past a few px it's a drag: the press never clicks a card; short
//    of that it's a click). Touch keeps the browser's own scrolling, momentum included.
//  • a vertical wheel scrolls a sideways strip, while it can scroll that way (at its end the page
//    gets the wheel). A wheel or trackpad already moving sideways is left to the browser.
//  • each end that has more beyond it fades (`data-gallerist-more-start` / `-end`; the theme's mask),
//    updated as it scrolls or resizes.
//  • on a sideways strip, ‹ › buttons at those ends (shown on hover, with a fine pointer) page it by
//    most of its width. They're out of the tab order and hidden from assistive tech: the keys already
//    move through the rail, which scrolls the current card into view.
// Reading direction is the strip's own: in a right-to-left rail the start is on the right.

import { ICONS } from '@gallerist/core/internal'
import type { Axis } from './strip'

/** How far the pointer moves before a press becomes a drag, in px. */
export const DRAG_SLOP = 5
/** A page button scrolls by this share of what shows. */
export const PAGE = 0.8
const PAGE_MS = 260

export interface Strip {
  /** Read the scroll position again: the ends' fades and the page buttons. */
  update(): void
  destroy(): void
}

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const ease = (t: number) => 1 - (1 - t) ** 3

/**
 * Make `scroller` a strip that runs along `axisOf()` (null: no layout yet, nothing to do). With a
 * `host` (the scroller's positioned parent), the page buttons go in it.
 */
export function attachStrip(
  scroller: HTMLElement,
  host: HTMLElement | null,
  axisOf: () => Axis | null,
): Strip {
  const rtl = () => getComputedStyle(scroller).direction === 'rtl'
  // scroll by `by` px along the axis, towards the end when positive (whatever the direction)
  const along = (axis: Axis, by: number) => {
    if (axis === 'y') scroller.scrollTop += by
    else scroller.scrollLeft += rtl() ? -by : by
  }
  // how far it has scrolled from its start, and how far it can
  const reach = (axis: Axis) => {
    const x = axis === 'x'
    const pos = Math.abs(x ? scroller.scrollLeft : scroller.scrollTop)
    const max = x
      ? scroller.scrollWidth - scroller.clientWidth
      : scroller.scrollHeight - scroller.clientHeight
    return { pos, max }
  }

  // ── drag (mouse, pen) ─────────────────────────────────────────────────────
  let press: { id: number; x: number; y: number; lastX: number; lastY: number } | null = null
  let dragging = false
  const swallowClick = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0 || !axisOf()) return
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY }
    dragging = false
  }
  const onMove = (e: PointerEvent) => {
    const axis = axisOf()
    if (!press || e.pointerId !== press.id || !axis) return
    if (!dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP) return
      dragging = true
      scroller.setAttribute('data-gallerist-dragging', '')
      scroller.setPointerCapture?.(e.pointerId)
      // a drag never clicks the card it started on
      scroller.addEventListener('click', swallowClick, true)
    }
    // incremental: the rail re-windows as it scrolls and corrects its own offset meanwhile
    if (axis === 'y') scroller.scrollTop -= e.clientY - press.lastY
    else scroller.scrollLeft -= e.clientX - press.lastX
    press.lastX = e.clientX
    press.lastY = e.clientY
    e.preventDefault()
  }
  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return
    press = null
    if (!dragging) return
    dragging = false
    scroller.removeAttribute('data-gallerist-dragging')
    // the click (if any) follows this pointerup in the same task
    setTimeout(() => scroller.removeEventListener('click', swallowClick, true))
  }
  // no native drag of a thumbnail image (it would take the pointer away mid-drag)
  const onDragStart = (e: Event) => e.preventDefault()

  // ── wheel ─────────────────────────────────────────────────────────────────
  const onWheel = (e: WheelEvent) => {
    if (axisOf() !== 'x' || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientWidth : 1
    const by = e.deltaY * unit
    const { pos, max } = reach('x')
    if (max < 1 || (by > 0 && pos >= max - 1) || (by < 0 && pos <= 1)) return // the page's
    along('x', by)
    e.preventDefault()
  }

  // ── page buttons ──────────────────────────────────────────────────────────
  let glide = 0
  const page = (dir: 1 | -1) => {
    const axis = axisOf()
    if (axis !== 'x') return
    const total = dir * scroller.clientWidth * PAGE
    if (glide) cancelAnimationFrame(glide)
    glide = 0
    if (reduced() || typeof requestAnimationFrame === 'undefined') return along('x', total)
    // a step at a time, by what's left to go, so the rail's own offset corrections in between
    // (cards drawn and dropped as it moves) don't stop it short or carry it past
    const t0 = performance.now()
    let done = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / PAGE_MS)
      const to = Math.round(total * ease(t))
      along('x', to - done)
      done = to
      glide = t < 1 ? requestAnimationFrame(step) : 0
    }
    glide = requestAnimationFrame(step)
  }
  const button = (dir: 1 | -1) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'gallerist-rail-page'
    btn.dataset.dir = dir > 0 ? 'end' : 'start'
    btn.tabIndex = -1
    btn.setAttribute('aria-hidden', 'true')
    btn.innerHTML = dir > 0 ? ICONS.next : ICONS.prev
    btn.hidden = true
    // keep focus where it is (the buttons are for the pointer only)
    btn.addEventListener('pointerdown', (e) => e.preventDefault())
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', () => page(dir))
    btn.addEventListener('wheel', onWheel, { passive: false }) // over a button, the wheel is the strip's
    return btn
  }
  const toStart = host ? button(-1) : null
  const toEnd = host ? button(1) : null
  if (host && toStart && toEnd) host.append(toStart, toEnd)

  // ── the ends ──────────────────────────────────────────────────────────────
  let placed = ''
  const mark = (name: string, on: boolean) => {
    if (on !== scroller.hasAttribute(name)) scroller.toggleAttribute(name, on)
  }
  const update = () => {
    const axis = axisOf()
    const { pos, max } = axis ? reach(axis) : { pos: 0, max: 0 }
    const before = !!axis && pos > 1
    const after = !!axis && pos < max - 1
    if (axis) scroller.setAttribute('data-gallerist-scroll', axis)
    mark('data-gallerist-more-start', before)
    mark('data-gallerist-more-end', after)
    if (!host || !toStart || !toEnd) return
    const side = axis === 'x'
    toStart.hidden = !(side && before)
    toEnd.hidden = !(side && after)
    if (!side) return
    // at the strip's ends, level with its middle (it may share the host with an item row)
    const left = scroller.offsetLeft
    const right = host.clientWidth - left - scroller.offsetWidth
    const top = scroller.offsetTop + scroller.offsetHeight / 2
    const [l, r] = rtl() ? [toEnd, toStart] : [toStart, toEnd]
    const at = `${left} ${right} ${top} ${l === toStart}`
    if (at === placed) return
    placed = at
    l.style.left = `${left}px`
    l.style.right = ''
    r.style.right = `${right}px`
    r.style.left = ''
    for (const b of [l, r]) b.style.top = `${top}px`
  }

  scroller.addEventListener('pointerdown', onDown)
  scroller.addEventListener('pointermove', onMove)
  scroller.addEventListener('pointerup', onUp)
  scroller.addEventListener('pointercancel', onUp)
  scroller.addEventListener('dragstart', onDragStart)
  scroller.addEventListener('wheel', onWheel, { passive: false })

  return {
    update,
    destroy() {
      if (glide) cancelAnimationFrame(glide)
      glide = 0
      scroller.removeEventListener('pointerdown', onDown)
      scroller.removeEventListener('pointermove', onMove)
      scroller.removeEventListener('pointerup', onUp)
      scroller.removeEventListener('pointercancel', onUp)
      scroller.removeEventListener('dragstart', onDragStart)
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('click', swallowClick, true)
      toStart?.remove()
      toEnd?.remove()
    },
  }
}
