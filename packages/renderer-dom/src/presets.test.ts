import { describe, expect, it } from 'vitest'
import { resolvePreset } from './presets'

describe('resolvePreset', () => {
  it('filmstrip: side pill arrows, persistent chrome, no ticks', () => {
    const p = resolvePreset('filmstrip')
    expect(p.rootAttrs['data-visora-preset']).toBe('filmstrip')
    expect(p.arrows).toBe('pill-right')
    expect(p.autoHide).toBe(false)
    expect(p.thumbnails).toEqual({ itemAxis: 'vertical', ticks: false })
  })

  it('immersive: auto-hides the chrome', () => {
    expect(resolvePreset('immersive').autoHide).toBe(true)
    expect(resolvePreset('immersive').rootAttrs['data-visora-preset']).toBe('immersive')
  })

  it('reviewer: corner arrows + time-ribbon ticks', () => {
    const p = resolvePreset('reviewer')
    expect(p.arrows).toBe('corner-br')
    expect(p.thumbnails.ticks).toBe(true)
    expect(p.rootAttrs['data-visora-preset']).toBe('reviewer')
  })

  it('contact: tagged for the grid-first layout', () => {
    expect(resolvePreset('contact').rootAttrs['data-visora-preset']).toBe('contact')
  })

  it('falls back to filmstrip for an unknown name', () => {
    expect(resolvePreset('nope')).toEqual(resolvePreset('filmstrip'))
  })
})
