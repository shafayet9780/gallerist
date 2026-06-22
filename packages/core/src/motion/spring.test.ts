import { describe, expect, it } from 'vitest'
import { SPRINGS, sampleSpring } from './spring'

describe('sampleSpring', () => {
  it('starts at 0 and ends exactly at 1', () => {
    const { values } = sampleSpring(SPRINGS.smooth, 60)
    expect(values).toHaveLength(60)
    expect(values[0]).toBe(0)
    expect(values.at(-1)).toBe(1)
  })

  it('handles degenerate sample counts without NaN (S-C1)', () => {
    expect(sampleSpring(SPRINGS.smooth, 0).values).toEqual([])
    expect(sampleSpring(SPRINGS.smooth, 1).values).toEqual([1]) // single keyframe → settled value
    const two = sampleSpring(SPRINGS.smooth, 2).values
    expect(two[0]).toBe(0)
    expect(two.at(-1)).toBe(1)
    expect(two.some(Number.isNaN)).toBe(false)
  })

  it('produces a clamped, positive duration', () => {
    const { duration } = sampleSpring(SPRINGS.smooth)
    expect(duration).toBeGreaterThan(100)
    expect(duration).toBeLessThanOrEqual(600)
  })

  it('a low-damping spring overshoots past 1', () => {
    const { values } = sampleSpring({ stiffness: 300, damping: 12 }, 80)
    expect(Math.max(...values)).toBeGreaterThan(1)
  })

  it('a critically/over-damped spring never overshoots', () => {
    const { values } = sampleSpring({ stiffness: 200, damping: 40 }, 80)
    expect(Math.max(...values)).toBeLessThanOrEqual(1.0001)
  })

  it('a more-damped spring settles faster (shorter duration)', () => {
    const light = sampleSpring({ stiffness: 200, damping: 14 }).duration
    const heavy = sampleSpring({ stiffness: 200, damping: 40 }).duration
    expect(heavy).toBeLessThan(light)
  })

  it('ships the named presets from the spec', () => {
    expect(SPRINGS.smooth).toMatchObject({
      stiffness: expect.any(Number),
      damping: expect.any(Number),
    })
    for (const k of ['smooth', 'snappy', 'pop', 'gentle'] as const) {
      expect(SPRINGS[k]).toBeDefined()
    }
  })
})
