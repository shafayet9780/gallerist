import { describe, expect, it } from 'vitest'
import type { ZoomState } from '../types'
import {
  clampPan,
  clampScale,
  contentToStage,
  fitScale,
  fitTransform,
  focalZoom,
  stageToContent,
  toggleZoom,
} from './zoom'

const Z = (scale: number, x: number, y: number): ZoomState => ({ scale, x, y })

describe('coordinate conversions', () => {
  it('contentToStage and stageToContent are inverses', () => {
    const z = Z(2, -100, 50)
    const c = { x: 120, y: 30 }
    const s = contentToStage(c, z)
    expect(s).toEqual({ x: 120 * 2 - 100, y: 30 * 2 + 50 })
    expect(stageToContent(s, z)).toEqual(c)
  })
})

describe('focalZoom', () => {
  it('keeps the focal stage-point pinned to its content pixel', () => {
    const z = Z(1, 0, 0)
    const focal = { x: 100, y: 100 }
    const next = focalZoom(z, focal, 2)
    expect(next.scale).toBe(2)
    // the content point under focal must remain under focal after the zoom
    expect(contentToStage(stageToContent(focal, z), next)).toEqual(focal)
  })
})

describe('fitScale / fitTransform', () => {
  it('fitScale is the contain ratio', () => {
    expect(fitScale({ w: 1000, h: 800 }, { w: 2000, h: 1000 })).toBe(0.5)
  })
  it('fitTransform centers the scaled content in the stage', () => {
    const t = fitTransform({ w: 1000, h: 800 }, { w: 2000, h: 1000 })
    expect(t).toEqual({ scale: 0.5, x: 0, y: 150 })
  })
})

describe('clampPan', () => {
  it('centers an axis when scaled content is smaller than the stage', () => {
    // natural 1000 wide at scale 0.5 → 500 < stage 1000 → centered at 250
    const r = clampPan(Z(0.5, 999, 999), { w: 1000, h: 1000 }, { w: 1000, h: 1000 })
    expect(r.x).toBe(250)
    expect(r.y).toBe(250)
  })
  it('clamps an axis to [stage - scaled, 0] when larger than the stage', () => {
    // natural 1000 at scale 1.5 → 1500 > stage 1000 → x in [-500, 0]
    expect(clampPan(Z(1.5, 100, 0), { w: 1000, h: 1000 }, { w: 1000, h: 1000 }).x).toBe(0)
    expect(clampPan(Z(1.5, -800, 0), { w: 1000, h: 1000 }, { w: 1000, h: 1000 }).x).toBe(-500)
    expect(clampPan(Z(1.5, -200, 0), { w: 1000, h: 1000 }, { w: 1000, h: 1000 }).x).toBe(-200)
  })
})

describe('clampScale', () => {
  it('clamps to [min, max]', () => {
    expect(clampScale(0.1, 0.5, 4)).toBe(0.5)
    expect(clampScale(9, 0.5, 4)).toBe(4)
    expect(clampScale(2, 0.5, 4)).toBe(2)
  })
})

describe('toggleZoom (double-tap)', () => {
  it('zooms out to fit when currently zoomed in', () => {
    expect(toggleZoom(2, 0.5, 4)).toBe(0.5)
  })
  it('zooms to actual (1x) from fit when image is larger than the stage', () => {
    expect(toggleZoom(0.5, 0.5, 4)).toBe(1)
  })
  it('zooms to max from fit when the image already fits at >= 1x', () => {
    expect(toggleZoom(1, 1, 4)).toBe(4)
  })
})
