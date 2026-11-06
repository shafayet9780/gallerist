// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRAG_SLOP, PAGE, type Strip, attachStrip } from './scroll'
import type { Axis } from './strip'

const strips: Strip[] = [] // destroyed after each test, so no glide runs on into the next

// A strip 400px wide holding 2000px of cards, scrolled `at` px from its start.
const make = (
  opts: {
    at?: number
    axis?: Axis | null
    rtl?: boolean
    more?: () => readonly [boolean, boolean]
  } = {},
) => {
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
  const strip = attachStrip(
    scroller,
    host,
    () => (opts.axis === undefined ? 'x' : opts.axis),
    opts.more,
  )
  strips.push(strip)
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
      buttons: 1, // held (a move with none is a hover)
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

const motion = (reduce: boolean) => {
  window.matchMedia = ((q: string) =>
    ({
      matches: reduce && q.includes('reduced-motion'),
    }) as MediaQueryList) as typeof window.matchMedia
}
// Every frame comes late: a glide's first step is the whole page. Returns the frames asked for.
const lateFrames = () => {
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id))
  return vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb) => Number(setTimeout(() => cb(performance.now() + 1000), 0)))
}
// The strip's scroll offset as a browser keeps it: `set` turns what is written into where it lands.
const offset = (scroller: HTMLElement, set: (to: number, from: number) => number) => {
  let at = scroller.scrollLeft
  Object.defineProperty(scroller, 'scrollLeft', {
    configurable: true,
    get: () => at,
    set: (v: number) => {
      at = set(v, at)
    },
  })
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const settle = (ms = 100) => new Promise((r) => setTimeout(r, ms))

const realMatchMedia = window.matchMedia
afterEach(() => {
  for (const s of strips.splice(0)) s.destroy()
  window.matchMedia = realMatchMedia
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
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

  it('a press released off the strip before it was a drag ends at the next move without a button', async () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 103) // short of a drag; the release lands outside the strip
    pointer(card, 'pointermove', 160, { buttons: 0 }) // a hover back over it
    pointer(card, 'pointermove', 260, { buttons: 0 })
    expect(scroller.scrollLeft).toBe(200)
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointerup', 100)
    card.click()
    expect(onCard).toHaveBeenCalledTimes(1)
  })

  it('a press that leaves the strip before it was a drag is over: a later press from outside, dragged over the strip, does not drag it', () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 102) // short of a drag, then off the strip across it
    scroller.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }))
    pointer(document.body, 'pointerup', 102) // released on the stage: no capture brought it here
    // a press on the stage (not on the strip), dragged onto it and along it
    pointer(card, 'pointermove', 102)
    pointer(card, 'pointermove', 160)
    pointer(card, 'pointermove', 220)
    expect(scroller.scrollLeft).toBe(200)
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointerup', 100)
    card.click()
    expect(onCard).toHaveBeenCalledTimes(1)
  })

  it('a drag goes on past the strip', () => {
    const { scroller, card } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 140)
    scroller.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1 }))
    pointer(card, 'pointermove', 120)
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(true)
    expect(scroller.scrollLeft).toBe(180)
  })

  it('a drag whose release never came is over at the next press: its clicks are clicks again', async () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 140)
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(true)
    pointer(card, 'pointerdown', 100) // no pointerup reached the strip
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
    pointer(card, 'pointerup', 100)
    await new Promise((r) => setTimeout(r))
    card.click()
    expect(onCard).toHaveBeenCalledTimes(1)
  })

  it('losing the pointer capture ends a drag', async () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 140)
    scroller.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }))
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
    pointer(card, 'pointermove', 200)
    expect(scroller.scrollLeft).toBe(160) // no longer follows
    await new Promise((r) => setTimeout(r))
    card.click()
    expect(onCard).toHaveBeenCalledTimes(1)
  })

  it("a card's own capture lost, or another pointer's, does not end the drag", () => {
    const { scroller, card } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 140)
    card.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }))
    scroller.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 2 }))
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(true)
    pointer(card, 'pointermove', 120)
    expect(scroller.scrollLeft).toBe(180)
  })

  it(`a wobble across the strip is still a click; a pen goes ${DRAG_SLOP * 2}px before it drags`, () => {
    const { scroller, card, onCard } = make({ at: 200 })
    pointer(card, 'pointerdown', 100)
    pointer(card, 'pointermove', 102, { clientY: 50 + DRAG_SLOP + 3 }) // across: 8px
    pointer(card, 'pointerup', 102)
    card.click()
    expect(onCard).toHaveBeenCalledTimes(1)
    expect(scroller.scrollLeft).toBe(200)
    pointer(card, 'pointerdown', 100, { pointerType: 'pen' })
    pointer(card, 'pointermove', 100 + DRAG_SLOP + 2, { pointerType: 'pen' })
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(false)
    pointer(card, 'pointermove', 100 + DRAG_SLOP * 2, { pointerType: 'pen' })
    expect(scroller.hasAttribute('data-gallerist-dragging')).toBe(true)
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

  it('cards not drawn yet beyond an end count as more: it fades, its button shows, the wheel stays', () => {
    let more: [boolean, boolean] = [false, true]
    const { scroller, host, strip } = make({ at: 1600, more: () => more }) // at the drawn end
    const [toStart, toEnd] = host.querySelectorAll<HTMLButtonElement>('.gallerist-rail-page')
    strip.update()
    expect(scroller.hasAttribute('data-gallerist-more-end')).toBe(true)
    expect(toEnd?.hidden).toBe(false)
    expect(wheel(scroller, { deltaY: 100 })).toBe(true) // the rail draws more as it goes
    scroller.scrollLeft = 0
    more = [true, false]
    strip.update()
    expect(scroller.hasAttribute('data-gallerist-more-start')).toBe(true)
    expect(toStart?.hidden).toBe(false)
    expect(wheel(scroller, { deltaY: -100 })).toBe(true)
    more = [false, false]
    scroller.scrollLeft = 0
    strip.update()
    expect(scroller.hasAttribute('data-gallerist-more-start')).toBe(false)
    expect(wheel(scroller, { deltaY: -100 })).toBe(false) // the page's
  })

  it('writes its axis once, not on every update', () => {
    const { scroller, strip } = make({ at: 200 })
    strip.update()
    const set = vi.spyOn(scroller, 'setAttribute')
    strip.update()
    strip.update()
    expect(set).not.toHaveBeenCalledWith('data-gallerist-scroll', 'x')
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
    motion(true)
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
    motion(false)
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

  // At its start a browser's offset stops at 0; there, the rail draws 300px of cards before (in its
  // own frame) and keeps what shows in place. `rtl`: the offset runs from 0 down.
  const drawsBefore = (rtl = false) => {
    let drawn = false
    const made = make({ at: 100, rtl, more: () => [!drawn, false] })
    const sign = rtl ? -1 : 1
    offset(made.scroller, (v) => {
      const to = sign * clamp(sign * v, 0, 1600)
      if (to === 0 && !drawn)
        requestAnimationFrame(() => {
          drawn = true
          made.scroller.scrollLeft = sign * 300
        })
      return to
    })
    made.strip.update()
    return made
  }

  it('a late frame that runs into the edge of the drawn cards goes on once the rail draws more', async () => {
    motion(false)
    lateFrames()
    const { scroller, host } = drawsBefore()
    host.querySelector<HTMLButtonElement>('[data-dir="start"]')?.click()
    await settle()
    expect(scroller.scrollLeft).toBe(100 + 300 - 400 * PAGE) // the whole page, the cards drawn before counted
  })

  it('right to left too, where the offset runs negative', async () => {
    motion(false)
    lateFrames()
    const { scroller, host } = drawsBefore(true)
    host.querySelector<HTMLButtonElement>('[data-dir="start"]')?.click()
    await settle()
    expect(scroller.scrollLeft).toBe(-(100 + 300 - 400 * PAGE))
  })

  it('under reduced motion: the whole page at once, carried on once the rail draws more', async () => {
    motion(true)
    const { scroller, host } = drawsBefore()
    host.querySelector<HTMLButtonElement>('[data-dir="start"]')?.click()
    expect(scroller.scrollLeft).toBe(0) // at once, into the edge of the cards drawn
    await settle()
    expect(scroller.scrollLeft).toBe(100 + 300 - 400 * PAGE)
  })

  it('stops at the strip’s true end, with nothing beyond it', async () => {
    motion(false)
    const frames = lateFrames()
    const { scroller, host, strip } = make({ at: 1500, more: () => [false, false] })
    offset(scroller, (v) => clamp(v, 0, 1600))
    strip.update()
    host.querySelector<HTMLButtonElement>('[data-dir="end"]')?.click()
    await settle()
    expect(scroller.scrollLeft).toBe(1600)
    expect(frames).toHaveBeenCalledTimes(2) // the step to the end, and one that didn't move
  })

  it('waits a frame, not more, for cards beyond that the rail doesn’t draw', async () => {
    motion(false)
    const frames = lateFrames()
    const { scroller, host, strip } = make({ at: 1500, more: () => [false, true] })
    offset(scroller, (v) => clamp(v, 0, 1600))
    strip.update()
    host.querySelector<HTMLButtonElement>('[data-dir="end"]')?.click()
    await settle()
    expect(scroller.scrollLeft).toBe(1600)
    expect(frames).toHaveBeenCalledTimes(3) // the step to the edge, then two that didn't move
  })

  it('carries what is left for 30 frames past the glide at most', async () => {
    motion(false)
    const frames = lateFrames()
    const { scroller, host, strip } = make({ at: 800, more: () => [false, true] })
    // a rail that only ever lets it move a pixel a frame
    offset(scroller, (v, from) => from + clamp(v - from, -1, 1))
    strip.update()
    host.querySelector<HTMLButtonElement>('[data-dir="end"]')?.click()
    await settle(300)
    expect(frames).toHaveBeenCalledTimes(31) // the glide's one (late) frame, then 30 more
    expect(scroller.scrollLeft).toBe(800 + 31)
  })

  it('a press or the wheel on the strip stops a glide', async () => {
    motion(false)
    const { scroller, host, strip } = make({ at: 800 })
    strip.update()
    const toEnd = host.querySelector<HTMLButtonElement>('[data-dir="end"]')
    toEnd?.click()
    await settle(60)
    pointer(scroller, 'pointerdown', 100)
    pointer(scroller, 'pointerup', 100)
    const held = scroller.scrollLeft
    expect(held).toBeGreaterThan(800)
    expect(held).toBeLessThan(800 + 400 * PAGE)
    await settle(400)
    expect(scroller.scrollLeft).toBe(held)
    toEnd?.click()
    await settle(60)
    wheel(scroller, { deltaY: 10 })
    const wheeled = scroller.scrollLeft
    await settle(400)
    expect(scroller.scrollLeft).toBe(wheeled)
    expect(wheeled).toBeLessThan(held + 400 * PAGE)
  })

  it('scrolls at once, whatever the page’s CSS says (no smooth scroll-behavior)', () => {
    const { scroller } = make()
    expect(scroller.style.scrollBehavior).toBe('auto')
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
