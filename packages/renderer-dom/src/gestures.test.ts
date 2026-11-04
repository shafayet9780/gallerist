// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Geometry, attachGestures } from './gestures'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1'), item('b2')] },
  ],
})

// stage 1000x800, natural 2000x1000 → fit = 0.5
const geom: Geometry = {
  stageRect: { left: 0, top: 0, width: 1000, height: 800 },
  naturalSize: { w: 2000, h: 1000 },
}

let stage: HTMLElement
let content: HTMLElement
let detach: () => void

const setup = (over: { startAt?: { g?: number } } = {}) => {
  const v = createViewer({ collection: collection(), ...over })
  detach = attachGestures({
    stage,
    viewer: v,
    getContent: () => content,
    getGeometry: () => geom,
    raf: (cb) => {
      cb()
      return 1
    },
    caf: () => {},
  })
  return v
}

const pe = (type: string, x: number, y: number, id = 1): Event => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { clientX: x, clientY: y, pointerId: id })
  return e
}

beforeEach(() => {
  stage = document.createElement('div')
  content = document.createElement('div')
  document.body.append(stage, content)
})
afterEach(() => {
  detach?.()
  document.body.innerHTML = ''
})

describe('wheel zoom', () => {
  const wheel = (deltaY: number) =>
    Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
      deltaY,
      clientX: 500,
      clientY: 400,
    })

  it('zooms in on wheel-up around the cursor (committed on settle)', () => {
    vi.useFakeTimers()
    try {
      const v = setup()
      const spy = vi.spyOn(getInternals(v), 'setZoom')
      stage.dispatchEvent(wheel(-100))
      vi.advanceTimersByTime(100) // wheel commit debounce
      expect(spy).toHaveBeenCalled()
      expect(v.getState().zoom.scale).toBeGreaterThan(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('floors zoom-out at the fit scale', () => {
    vi.useFakeTimers()
    try {
      const v = setup()
      for (let i = 0; i < 20; i++) stage.dispatchEvent(wheel(100))
      vi.advanceTimersByTime(100)
      expect(v.getState().zoom.scale).toBeCloseTo(0.5, 5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('commits the store once per wheel burst, not per tick (I-PERF1)', () => {
    vi.useFakeTimers()
    try {
      const v = setup()
      const spy = vi.spyOn(getInternals(v), 'setZoom')
      for (let i = 0; i < 5; i++) stage.dispatchEvent(wheel(-100))
      expect(spy).not.toHaveBeenCalled() // imperative during the burst, no store commit yet
      vi.advanceTimersByTime(100)
      expect(spy).toHaveBeenCalledTimes(1) // a single commit when it settles
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes a pending wheel zoom when a pointer gesture starts, with no late re-commit (#1)', () => {
    vi.useFakeTimers()
    try {
      const v = setup()
      stage.dispatchEvent(wheel(-100))
      expect(v.getState().zoom.scale).toBe(1) // pending on the debounce, not committed yet
      stage.dispatchEvent(pe('pointerdown', 500, 400)) // onDown must flush the wheel first
      const flushed = v.getState().zoom.scale
      expect(flushed).toBeGreaterThan(1) // committed by the flush, so the gesture base is current
      stage.dispatchEvent(pe('pointerup', 500, 400))
      vi.advanceTimersByTime(120) // the cleared wheel timer must not re-commit and clobber
      expect(v.getState().zoom.scale).toBe(flushed)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('double-click', () => {
  it('toggles zoom from fit to a zoomed-in scale', () => {
    const v = setup()
    v.zoomTo(0.5, { x: 0, y: 0 })
    stage.dispatchEvent(
      Object.assign(new Event('dblclick', { bubbles: true }), { clientX: 500, clientY: 400 }),
    )
    expect(v.getState().zoom.scale).toBeGreaterThan(0.5)
  })
})

describe('pointer gestures → arbitration', () => {
  it('pans when zoomed in (scale > fit) and commits clamped translation', () => {
    const v = setup() // default scale 1 > fit 0.5
    const spy = vi.spyOn(getInternals(v), 'setZoom')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 440, 400)) // dx -60 horizontal
    stage.dispatchEvent(pe('pointerup', 440, 400))
    expect(spy).toHaveBeenCalled()
    expect(v.getState().zoom).toMatchObject({ scale: 1, x: -60 })
  })

  it('navigates to the next group on a horizontal swipe at fit', () => {
    const v = setup()
    v.zoomTo(0.5, { x: 0, y: 0 }) // not zoomed
    const next = vi.spyOn(v, 'next')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 400, 405)) // dx -100 dominant horizontal
    stage.dispatchEvent(pe('pointerup', 400, 405))
    expect(next).toHaveBeenCalled()
  })

  it('closes on a downward swipe past the dismiss threshold at fit', () => {
    const v = setup()
    v.zoomTo(0.5, { x: 0, y: 0 })
    const close = vi.spyOn(v, 'close')
    stage.dispatchEvent(pe('pointerdown', 500, 200))
    stage.dispatchEvent(pe('pointermove', 505, 360)) // dy +160 dominant vertical-down
    stage.dispatchEvent(pe('pointerup', 505, 360))
    expect(close).toHaveBeenCalled()
  })

  it('advances the secondary axis on an upward swipe in a grouped item', () => {
    const v = setup({ startAt: { g: 1 } }) // g1 has 3 items
    v.zoomTo(0.5, { x: 0, y: 0 })
    const nextItem = vi.spyOn(v, 'nextItem')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 505, 300)) // dy -100 vertical-up, past commitNav
    stage.dispatchEvent(pe('pointerup', 505, 300))
    expect(nextItem).toHaveBeenCalled()
  })

  it('a short upward flick (past the intent threshold, short of commitNav) does not change item', () => {
    const v = setup({ startAt: { g: 1 } })
    v.zoomTo(0.5, { x: 0, y: 0 })
    const nextItem = vi.spyOn(v, 'nextItem')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 502, 380)) // dy -20: secondary intent, not committed
    stage.dispatchEvent(pe('pointerup', 502, 380))
    expect(nextItem).not.toHaveBeenCalled()
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
  })
})

describe('pointercancel abandons the gesture', () => {
  const dragStart = (target: Element) => {
    const e = new Event('dragstart', { bubbles: true, cancelable: true })
    target.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('prevents native drag-and-drop of the media (it would fire pointercancel mid-swipe)', () => {
    setup()
    stage.appendChild(content) // as in the renderer: the content layer lives inside the stage
    const img = content.appendChild(document.createElement('img'))
    expect(dragStart(img)).toBe(true)
  })

  it('leaves drag-and-drop alone for overlays and other stage UI', () => {
    setup()
    stage.appendChild(content)
    const overlays = content.appendChild(document.createElement('div'))
    overlays.className = 'gallerist-overlays-content'
    const pin = overlays.appendChild(document.createElement('img'))
    const pluginUi = stage.appendChild(document.createElement('a'))
    expect(dragStart(pin)).toBe(false)
    expect(dragStart(pluginUi)).toBe(false)
  })

  it('stops preventing native drag once detached', () => {
    setup()
    stage.appendChild(content)
    const img = content.appendChild(document.createElement('img'))
    detach()
    expect(dragStart(img)).toBe(false)
  })

  it('does not navigate when a swipe is cancelled past the commit distance', () => {
    const v = setup()
    v.zoomTo(0.5, { x: 0, y: 0 })
    const next = vi.spyOn(v, 'next')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 380, 402)) // dx -120: would navigate on release
    stage.dispatchEvent(pe('pointercancel', 380, 402))
    expect(next).not.toHaveBeenCalled()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('does not close on a cancelled drag-to-dismiss, and clears the dismiss progress', () => {
    const v = setup()
    v.open()
    v.zoomTo(0.5, { x: 0, y: 0 })
    const close = vi.spyOn(v, 'close')
    stage.dispatchEvent(pe('pointerdown', 500, 200))
    stage.dispatchEvent(pe('pointermove', 502, 400)) // dy +200: past closeDismiss
    expect(stage.style.getPropertyValue('--gallerist-dismiss')).not.toBe('')
    stage.dispatchEvent(pe('pointercancel', 502, 400))
    expect(close).not.toHaveBeenCalled()
    expect(stage.style.getPropertyValue('--gallerist-dismiss')).toBe('')
  })

  it('snaps a cancelled pan back to the committed transform without committing', () => {
    const v = setup() // scale 1 > fit 0.5 → drags pan
    const setZoom = vi.spyOn(getInternals(v), 'setZoom')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 400, 400)) // live pan dx -100
    expect(content.style.transform).toContain('-100px')
    stage.dispatchEvent(pe('pointercancel', 400, 400))
    expect(setZoom).not.toHaveBeenCalled()
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('leaves the gesture state clean so the next gesture works', () => {
    const v = setup()
    v.zoomTo(0.5, { x: 0, y: 0 })
    const next = vi.spyOn(v, 'next')
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 380, 402))
    stage.dispatchEvent(pe('pointercancel', 380, 402))
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 380, 402))
    stage.dispatchEvent(pe('pointerup', 380, 402))
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('zoom commits settle back to a centred fit', () => {
  it('a pan clamped back to where it started shows the committed transform, not the drag', () => {
    const v = setup() // scale 1 > fit 0.5; x is bounded to [-1000, 0]
    stage.dispatchEvent(pe('pointerdown', 500, 400))
    stage.dispatchEvent(pe('pointermove', 600, 400)) // live x = +100, past the left edge
    expect(content.style.transform).toContain('translate(100px')
    stage.dispatchEvent(pe('pointerup', 600, 400)) // settles to x = 0: same as the stored zoom
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  // stage 1000x800, natural 2000x1000 → fit 0.5, centred fit transform = { 0.5, 0, 150 }
  it('double-click from a panned zoom returns to the centred fit', () => {
    const v = setup()
    getInternals(v).setZoom({ scale: 1, x: -300, y: -50 })
    stage.dispatchEvent(
      Object.assign(new Event('dblclick', { bubbles: true }), { clientX: 900, clientY: 100 }),
    )
    expect(v.getState().zoom).toEqual({ scale: 0.5, x: 0, y: 150 })
  })

  it('pinching a panned zoom back out to fit re-centres instead of keeping the pan offset', () => {
    const v = setup()
    getInternals(v).setZoom({ scale: 1, x: -300, y: -50 }) // zoomed in and panned
    stage.dispatchEvent(pe('pointerdown', 100, 100, 1)) // fingers 400px apart, off-centre
    stage.dispatchEvent(pe('pointerdown', 500, 100, 2))
    stage.dispatchEvent(pe('pointermove', 200, 100, 1)) // pinch to 200px apart → factor 0.5 → fit
    stage.dispatchEvent(pe('pointermove', 400, 100, 2))
    stage.dispatchEvent(pe('pointerup', 200, 100, 1))
    stage.dispatchEvent(pe('pointerup', 400, 100, 2))
    expect(v.getState().zoom).toEqual({ scale: 0.5, x: 0, y: 150 })
  })
})

describe('multi-touch pinch → pan handoff (I-R2)', () => {
  it('commits the pinch zoom when the first finger lifts and lets the second finger pan', () => {
    const v = setup()
    v.zoomTo(0.5, { x: 0, y: 0 }) // start at fit
    const next = vi.spyOn(v, 'next')
    // two fingers down (200px apart) → pinch intent
    stage.dispatchEvent(pe('pointerdown', 400, 400, 1))
    stage.dispatchEvent(pe('pointerdown', 600, 400, 2))
    // spread to 400px apart → factor 2 → scale 1.0 (from fit 0.5)
    stage.dispatchEvent(pe('pointermove', 300, 400, 1))
    stage.dispatchEvent(pe('pointermove', 700, 400, 2))
    // lift finger 1 → pinch must commit now, not stay frozen until finger 2 lifts
    stage.dispatchEvent(pe('pointerup', 300, 400, 1))
    const scaleAfterPinch = v.getState().zoom.scale
    const xAfterPinch = v.getState().zoom.x
    expect(scaleAfterPinch).toBeGreaterThan(0.5)
    // the lingering finger must now pan (not be dead, not navigate)
    stage.dispatchEvent(pe('pointermove', 650, 400, 2)) // dx -50 from its 700 start
    stage.dispatchEvent(pe('pointerup', 650, 400, 2))
    expect(next).not.toHaveBeenCalled()
    expect(v.getState().zoom.scale).toBeCloseTo(scaleAfterPinch, 5) // pan preserves scale
    expect(v.getState().zoom.x).toBeLessThan(xAfterPinch) // panned left
  })
})
