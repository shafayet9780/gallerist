// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
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
  it('zooms in on wheel-up around the cursor', () => {
    const v = setup()
    const spy = vi.spyOn(v, 'zoomTo')
    const e = Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
      deltaY: -100,
      clientX: 500,
      clientY: 400,
    })
    stage.dispatchEvent(e)
    expect(spy).toHaveBeenCalled()
    expect(v.getState().zoom.scale).toBeGreaterThan(1)
  })

  it('floors zoom-out at the fit scale', () => {
    const v = setup()
    for (let i = 0; i < 20; i++) {
      stage.dispatchEvent(
        Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
          deltaY: 100,
          clientX: 500,
          clientY: 400,
        }),
      )
    }
    expect(v.getState().zoom.scale).toBeCloseTo(0.5, 5)
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
    const spy = vi.spyOn(v, 'zoomTo')
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
    stage.dispatchEvent(pe('pointermove', 505, 360)) // dy -40 vertical-up
    stage.dispatchEvent(pe('pointerup', 505, 360))
    expect(nextItem).toHaveBeenCalled()
  })
})
