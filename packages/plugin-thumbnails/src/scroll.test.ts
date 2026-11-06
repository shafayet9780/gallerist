// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRAG_SLOP, PAGE, attachStrip } from './scroll'
import type { Axis } from './strip'

// A strip 400px wide holding 2000px of cards, scrolled `at` px from its start.
const make = (opts: { at?: number; axis?: Axis | null; rtl?: boolean } = {}) => {
  const host = document.createElement('div')
  const scroller = document.createElement('div')
  if (opts.rtl) scroller.style.direction = 'rtl'
  const card = document.createElement('button')
  const onCard = vi.fn()
  card.addEventListener('click', onCard)
  scroller.append(card)
  host.append(scroller)
  document.body.append(host)
  for (const [k, v] of Object.entries({
    clientWidth: 400,
    scrollWidth: 2000,
    clientHeight: 90,
    scrollHeight: 90,
    offsetWidth: 400,
    offsetHeight: 90,
    offsetLeft: 0,
    offsetTop: 10,
  }))
    Object.defineProperty(scroller, k, { configurable: true, value: v })
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 500 })
  scroller.scrollLeft = (opts.rtl ? -1 : 1) * (opts.at ?? 0)
  const strip = attachStrip(scroller, host, () => (opts.axis === undefined ? 'x' : opts.axis))
  return { host, scroller, card, onCard, strip }
}

const pointer = (el: Element, type: string, x: number, init: PointerEventInit = {}) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: x,
      clientY: 50,
      ...init,
    }),
  )
const wheel = (el: Element, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  // happy-dom's WheelEvent drops the modifier keys
  if (init.ctrlKey) Object.defineProperty(e, 'ctrlKey', { value: true })
  el.dispatchEvent(e)
  return e.defaultPrevented
}

const realMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = realMatchMedia
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('rail strip — drag', () => {
  it(`a press that moves less than ${DRAG_SLOP}px is a click`, () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 100 + DRAG_SLOP - 1)
    pointer(card, 'pointerup', 100 + DRAG_SLOP - 1)
    card.click()
    expect(onCard).toHaveBeenCalledTimes(1)
    expect(scroller.scrollLeft).toBe(200)
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
  })

  it('past it, the strip follows the pointer and the press never clicks', async () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 102)
    pointer(card, 'pointermove', 140)
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(true)
    expect(scroller.scrollLeft).toBe(160) // dragged 40px right: the content follows
    pointer(card, 'pointermove', 120)
    expect(scroller.scrollLeft).toBe(180)
    pointer(card, 'pointerup', 120)
    card.click() // the click a drag would end with
    expect(onCard).not.toHaveBeenCalled()
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
    await new Promise((r) => setTimeout(r))
    card.click() // a later click is a click again
    expect(onCard).toHaveBeenCalledTimes(1)
  })

  it('touch is left to the browser; so is a press that is not the main button', () => {
    const { scroller, card } = make({ at: 200 })
    pointer(card, 'pointerdown', 100, { pointerType: 'touch' })
    pointer(card, 'pointermove', 160, { pointerType: 'touch' })
    pointer(card, 'pointerdown', 100, { button: 2 })
    pointer(card, 'pointermove', 160)
    expect(scroller.scrollLeft).toBe(200)
  })

  it('a pen drags; a side rail drags up and down', () => {
    const { scroller, card } = make({ at: 200 })
    pointer(card, 'pointerdown', 100, { pointerType: 'pen' })
    pointer(card, 'pointermove', 150, { pointerType: 'pen' })
    expect(scroller.scrollLeft).toBe(150)
    const side = make({ axis: 'y' })
    side.scroller.scrollTop = 100
    pointer(side.card, 'pointerdown', 100, { clientY: 300 })
    pointer(side.card, 'pointermove', 100, { clientY: 260 })
    expect(side.scroller.scrollTop).toBe(140)
  })

  it('blocks the native image drag', () => {
    const { scroller } = make()
    const e = new Event('dragstart', { bubbles: true, cancelable: true })
    scroller.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })
})

describe('rail strip — wheel', () => {
  it('a vertical wheel scrolls a sideways strip, towards its end', () => {
    const { scroller } = make({ at: 200 })
    expect(wheel(scroller, { deltaY: 100 })).toBe(true)
    expect(scroller.scrollLeft).toBe(300)
    expect(wheel(scroller, { deltaY: -3, deltaMode: 1 })).toBe(true) // lines
    expect(scroller.scrollLeft).toBe(252)
  })

  it('right to left: towards the end is leftwards', () => {
    const { scroller } = make({ at: 200, rtl: true })
    expect(wheel(scroller, { deltaY: 100 })).toBe(true)
    expect(scroller.scrollLeft).toBe(-300)
  })

  it('leaves the wheel to the page at the end it is going to, or when it cannot scroll', () => {
    const { scroller } = make({ at: 0 })
    expect(wheel(scroller, { deltaY: -100 })).toBe(false)
    scroller.scrollLeft = 1600 // its end (2000 - 400)
    expect(wheel(scroller, { deltaY: 100 })).toBe(false)
    expect(scroller.scrollLeft).toBe(1600)
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 400 })
    scroller.scrollLeft = 0
    expect(wheel(scroller, { deltaY: 100 })).toBe(false)
  })

  it('a sideways wheel or trackpad swipe, a pinch (ctrl) and a side rail keep the browser’s', () => {
    const { scroller } = make({ at: 200 })
    expect(wheel(scroller, { deltaX: 40, deltaY: 10 })).toBe(false)
    expect(wheel(scroller, { deltaY: 10, ctrlKey: true })).toBe(false)
    expect(scroller.scrollLeft).toBe(200)
    const side = make({ axis: 'y' })
    expect(wheel(side.scroller, { deltaY: 100 })).toBe(false)
  })
})

describe('rail strip — the ends', () => {
  it('marks each end that has more beyond it, and shows its page button', () => {
    const { scroller, host, strip } = make({ at: 0 })
    const [toStart, toEnd] = host.querySelectorAll<HTMLButtonElement>('.gallerist-rail-page')
    strip.update()
    expect(scroller.getAttribute('data-gallerist-scroll')).toBe('x')
    expect(scroller.hasAttribute('data-gallerist-more-start')).toBe(false)
    expect(scroller.hasAttribute('data-gallerist-more-end')).toBe(true)
    expect(toStart?.hidden).toBe(true)
    expect(toEnd?.hidden).toBe(false)
    scroller.scrollLeft = 800
    strip.update()
    expect(scroller.hasAttribute('data-gallerist-more-start')).toBe(true)
    expect(toStart?.hidden).toBe(false)
    scroller.scrollLeft = 1600
    strip.update()
    expect(scroller.hasAttribute('data-gallerist-more-end')).toBe(false)
    expect(toEnd?.hidden).toBe(true)
  })

  it('page buttons: out of the tab order, hidden from assistive tech, at the strip’s ends', () => {
    const { host, strip } = make({ at: 800 })
    strip.update()
    const [toStart, toEnd] = host.querySelectorAll<HTMLButtonElement>('.gallerist-rail-page')
    for (const b of [toStart, toEnd]) {
      expect(b?.tabIndex).toBe(-1)
      expect(b?.getAttribute('aria-hidden')).toBe('true')
      expect(b?.style.top).toBe('55px') // level with the strip's middle
    }
    expect(toStart?.style.left).toBe('0px')
    expect(toEnd?.style.right).toBe('100px') // host 500, strip 400
  })

  it('right to left: the start button is on the right', () => {
    const { host, strip } = make({ at: 800, rtl: true })
    strip.update()
    const [toStart, toEnd] = host.querySelectorAll<HTMLButtonElement>('.gallerist-rail-page')
    expect(toStart?.style.right).toBe('100px')
    expect(toEnd?.style.left).toBe('0px')
  })

  it(`a page button scrolls ${PAGE * 100}% of what shows; at once under reduced motion`, () => {
    window.matchMedia = ((q: string) =>
      ({ matches: q.includes('reduced-motion') }) as MediaQueryList) as typeof window.matchMedia
    const { scroller, host, strip } = make({ at: 800 })
    strip.update()
    const [toStart, toEnd] = host.querySelectorAll<HTMLButtonElement>('.gallerist-rail-page')
    toEnd?.click()
    expect(scroller.scrollLeft).toBe(800 + 400 * PAGE)
    toStart?.click()
    toStart?.click()
    expect(scroller.scrollLeft).toBe(800 - 400 * PAGE)
  })

  it('glides otherwise, by what is left to go each frame', async () => {
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes('reduced-motion') && false,
      }) as MediaQueryList) as typeof window.matchMedia
    const { scroller, host, strip } = make({ at: 800 })
    strip.update()
    host.querySelector<HTMLButtonElement>('[data-dir="end"]')?.click()
    await new Promise((r) => setTimeout(r, 120))
    const mid = scroller.scrollLeft
    expect(mid).toBeGreaterThan(800)
    expect(mid).toBeLessThan(800 + 400 * PAGE)
    scroller.scrollLeft += 50 // the rail corrects its offset under it (cards drawn before)
    await new Promise((r) => setTimeout(r, 400))
    expect(scroller.scrollLeft).toBe(800 + 400 * PAGE + 50)
  })

  it('a wheel over a page button scrolls the strip', () => {
    const { scroller, host } = make({ at: 200 })
    const btn = host.querySelector('.gallerist-rail-page') as HTMLElement
    expect(wheel(btn, { deltaY: 100 })).toBe(true)
    expect(scroller.scrollLeft).toBe(300)
  })

  it('destroy takes its buttons and listeners away', () => {
    const { scroller, host, strip } = make({ at: 200 })
    strip.destroy()
    expect(host.querySelectorAll('.gallerist-rail-page')).toHaveLength(0)
    expect(wheel(scroller, { deltaY: 100 })).toBe(false)
  })
})
