import { describe, expect, it, vi } from 'vitest'
import { resolvePreset } from './presets'

describe('resolvePreset', () => {
  it('filmstrip: bottom rail, side pill arrows, persistent chrome', () => {
    const p = resolvePreset('filmstrip')
    expect(p.rootAttrs['data-gallerist-preset']).toBe('filmstrip')
    expect(p.arrows).toBe('pill-right')
    expect(p.autoHide).toBe(false)
    expect(p.rail).toBe('bottom')
    expect(p.thumbnails).toEqual({ itemAxis: 'vertical' })
  })

  it('immersive: rail hidden + chrome auto-hide', () => {
    const p = resolvePreset('immersive')
    expect(p.autoHide).toBe(true)
    expect(p.rail).toBe('hidden')
    expect(p.rootAttrs['data-gallerist-preset']).toBe('immersive')
  })

  it('reviewer: bottom timeline rail + corner arrows', () => {
    const p = resolvePreset('reviewer')
    expect(p.arrows).toBe('corner-br')
    expect(p.rail).toBe('bottom')
    expect(p.rootAttrs['data-gallerist-preset']).toBe('reviewer')
    expect(p.thumbnails).toMatchObject({ timeline: true, numberItems: true })
    expect(p.navigator).toBe(true)
    expect(resolvePreset('filmstrip').navigator).toBe(false)
  })

  it('contact: right (vertical) rail', () => {
    const p = resolvePreset('contact')
    expect(p.rail).toBe('right')
    expect(p.rootAttrs['data-gallerist-preset']).toBe('contact')
  })

  it('falls back to filmstrip for an unknown name (and warns)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolvePreset('nope')).toEqual(resolvePreset('filmstrip'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown preset "nope"'))
    warn.mockRestore()
  })
})
