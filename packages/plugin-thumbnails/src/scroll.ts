// The rail as a strip to pull rather than a box with a scrollbar. The theme hides the scrollbar;
// this module gives back what it did, and more:
//  • a mouse or pen drags the strip (past a few px along it, it's a drag: the press never clicks a
//    card; short of that, or across it, it's a click). Touch keeps the browser's own scrolling,
//    momentum included. The native drag of a card (`dragstart`) is cancelled in the strip.
//  • a vertical wheel scrolls a sideways strip, while it can scroll that way (at its end the page
//    gets the wheel). A wheel or trackpad already moving sideways is left to the browser.
//  • each end that has more beyond it (scrolled out of view, or not drawn yet) fades (`data-gallerist-more-start` / `-end`; the theme's mask),
//    updated as it scrolls or resizes.
//  • on a sideways strip, ‹ › buttons at those ends (shown on hover, with a fine pointer) page it by
//    most of its width. They're out of the tab order and hidden from assistive tech: the keys already
//    move through the rail, which scrolls the current card into view. A press or the wheel on the
//    strip stops a page mid-glide.
//  • every scroll of the strip lands at once, even where the page's CSS has it scroll smoothly.
// Reading direction is the strip's own: in a right-to-left rail the start is on the right.

import { ICONS } from '@gallerist/core/internal'
import { reduced } from './motion'
import type { Axis } from './strip'

/** How far the pointer moves along the strip before a press becomes a drag, in px (a pen: twice). */
export const DRAG_SLOP = 5
/** A page button scrolls by this share of what shows. */
export const PAGE = 0.8
const PAGE_MS = 260
const MAX_EXTRA = 30 // frames a page may run past PAGE_MS while the rail draws what lies beyond

export interface Strip {
  /** Read the scroll position again: the ends' fades and the page buttons. */
  update(): void
  destroy(): void
}

const ease = (t: number) => 1 - (1 - t) ** 3

/**
 * Make `scroller` a strip that runs along `axisOf()` (null: no layout yet, nothing to do). With a
 * `host` (the scroller's positioned parent), the page buttons go in it.
 */
export function attachStrip(
  scroller: HTMLElement,
  host: HTMLElement | null,
  axisOf: () => Axis | null,
  /** whether cards not drawn yet lie before / after the drawn ones (a windowed rail) */
  more?: () => readonly [boolean, boolean],
): Strip {
  const rtl = () => getComputedStyle(scroller).direction === 'rtl'
  // scroll a sideways strip by `by` px, towards its end when positive (whatever the direction)
  const along = (by: number) => {
    scroller.scrollLeft += rtl() ? -by : by
  }
  // every scroll of the strip lands at once, whatever the page's CSS says: a smooth one would still
  // be at its old offset when read back, so a page's next step (or the rail's own correction of its
  // offset as it draws cards) would start from there
  scroller.style.scrollBehavior = 'auto'
  // how far it has scrolled from its start, and how far it can
  const reach = (axis: Axis) => {
    const x = axis === 'x'
    const pos = Math.abs(x ? scroller.scrollLeft : scroller.scrollTop)
    const max = x
      ? scroller.scrollWidth - scroller.clientWidth
      : scroller.scrollHeight - scroller.clientHeight
    return [pos, max] as const
  }

  // a page button's glide, stopped by a press, the wheel, another page or the strip going away
  let glide = 0
  const stop = () => {
    if (glide) cancelAnimationFrame(glide)
    glide = 0
  }

  // ── drag (mouse, pen) ─────────────────────────────────────────────────────
  // the pointer pressed on the strip, and where it went down (once it's a drag: where it last was)
  let press: { id: number; x: number; y: number } | null = null
  let dragging = false
  const swallowClick = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  // The press is over: its pointerup, a cancel, the strip's capture lost, the pointer leaving the
  // strip before it was a drag (no capture yet: its pointerup may land elsewhere, and a later press
  // from outside, dragged over the strip, must not take it up), or the next move with no button.
  const endDrag = () => {
    press = null
    if (!dragging) return
    dragging = false
    scroller.removeAttribute('data-gallerist-dragging')
    // the click (if any) follows the pointerup in the same task
    setTimeout(() => scroller.removeEventListener('click', swallowClick, true))
  }
  const onDown = (e: PointerEvent) => {
    endDrag() // anything left of an earlier press
    stop()
    if (e.pointerType === 'touch' || e.button !== 0 || !axisOf()) return
    press = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const onMove = (e: PointerEvent) => {
    const axis = axisOf()
    if (!press || e.pointerId !== press.id || !axis) return
    if (!(e.buttons & 1)) return endDrag()
    // along the strip: a wobble across it is still a click
    const by = axis === 'y' ? e.clientY - press.y : e.clientX - press.x
    if (!dragging) {
      if (Math.abs(by) < DRAG_SLOP * (e.pointerType === 'pen' ? 2 : 1)) return
      dragging = true
      scroller.setAttribute('data-gallerist-dragging', '')
      scroller.setPointerCapture?.(e.pointerId)
      // a drag never clicks the card it started on
      scroller.addEventListener('click', swallowClick, true)
    }
    // incremental: the rail re-windows as it scrolls and corrects its own offset meanwhile
    if (axis === 'y') scroller.scrollTop -= by
    else scroller.scrollLeft -= by
    press.x = e.clientX
    press.y = e.clientY
    e.preventDefault()
  }
  const onUp = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) endDrag()
  }
  // the strip's own capture lost (not a card's, bubbling up)
  const onLost = (e: PointerEvent) => e.target === scroller && onUp(e)
  const onLeave = () => {
    if (!dragging) press = null
  }
  // no native drag of a thumbnail image (it would take the pointer away mid-drag); the page buttons
  // use it too, to keep focus where it is
  const onDragStart = (e: Event) => e.preventDefault()

  // ── wheel ─────────────────────────────────────────────────────────────────
  const onWheel = (e: WheelEvent) => {
    if (axisOf() !== 'x' || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientWidth : 1
    const by = e.deltaY * unit
    const [pos, max] = reach('x')
    const [before, after] = more?.() ?? []
    // the page's at the end it is going to, unless cards not drawn yet lie beyond it
    if (by > 0 ? pos >= max - 1 && !after : pos <= 1 && !before) return
    stop()
    along(by)
    e.preventDefault()
  }

  // ── page buttons ──────────────────────────────────────────────────────────
  const page = (dir: 1 | -1) => {
    if (axisOf() !== 'x') return
    stop()
    const total = scroller.clientWidth * PAGE
    if (typeof requestAnimationFrame === 'undefined') return along(dir * total)
    // a step a frame, by what's left to go, so the rail's own offset corrections in between (cards
    // drawn and dropped as it moves) don't stop it short or carry it past. A step can run into the
    // edge of the drawn cards (a late frame makes one big step) before the rail draws the ones
    // beyond: what it didn't move is carried to the next frames, until it has gone the whole way
    // or the strip's true end stops it. Under reduced motion it starts past the glide's end: the
    // first step, at once, is the whole way.
    const start = performance.now()
    const t0 = reduced() ? start - PAGE_MS : start
    let done = 0
    let extra = 0 // frames past the glide's end, carrying what's left
    let idle = 0 // frames in a row it didn't move
    const step = (now: number) => {
      // (a frame can be timed a little before the click)
      const t = Math.min(1, Math.max(0, (now - t0) / PAGE_MS))
      const was = scroller.scrollLeft
      along(dir * (Math.round(total * ease(t)) - done))
      const moved = Math.abs(scroller.scrollLeft - was) // every step goes the page's way
      done += moved
      idle = moved ? 0 : idle + 1
      // past its end: on while some is left and it moves, or a frame more while the rail draws the
      // cards beyond
      glide =
        t < 1 ||
        (total - done >= 1 && idle < (more?.()[dir > 0 ? 1 : 0] ? 2 : 1) && ++extra <= MAX_EXTRA)
          ? requestAnimationFrame(step)
          : 0
    }
    if (t0 < start) step(start)
    else glide = requestAnimationFrame(step)
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
    btn.addEventListener('pointerdown', onDragStart)
    btn.addEventListener('mousedown', onDragStart)
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
    const [pos, max] = axis ? reach(axis) : [0, 0]
    const [undrawnBefore, undrawnAfter] = more?.() ?? []
    const before = !!axis && (pos > 1 || !!undrawnBefore)
    const after = !!axis && (pos < max - 1 || !!undrawnAfter)
    if (axis && scroller.getAttribute('data-gallerist-scroll') !== axis)
      scroller.setAttribute('data-gallerist-scroll', axis)
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

  const listeners: Array<[string, (e: never) => void]> = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onUp],
    ['lostpointercapture', onLost],
    ['pointerleave', onLeave],
    ['dragstart', onDragStart],
    ['wheel', onWheel],
  ]
  for (const [type, fn] of listeners)
    scroller.addEventListener(type, fn as EventListener, { passive: false })

  return {
    update,
    destroy() {
      stop()
      for (const [type, fn] of listeners) scroller.removeEventListener(type, fn as EventListener)
      scroller.removeEventListener('click', swallowClick, true)
      toStart?.remove()
      toEnd?.remove()
    },
  }
}
