import { describe, expect, it } from 'vitest'
import { type ArbitrationInput, arbitrate } from './arbitration'

const base: ArbitrationInput = {
  pointerCount: 1,
  dx: 0,
  dy: 0,
  scale: 1,
  fitScale: 1,
  grouped: false,
  threshold: 10,
}
const inp = (o: Partial<ArbitrationInput>): ArbitrationInput => ({ ...base, ...o })

describe('arbitrate (spec §11.3)', () => {
  it('two pointers → zoom, regardless of movement', () => {
    expect(arbitrate(inp({ pointerCount: 2, dx: 0, dy: 0 }))).toBe('zoom')
  })

  it('below the threshold → none (undecided)', () => {
    expect(arbitrate(inp({ dx: 5, dy: 5 }))).toBe('none')
  })

  it('not zoomed, dominant-horizontal → navigate (group axis)', () => {
    expect(arbitrate(inp({ dx: 40, dy: 5 }))).toBe('navigate')
  })

  it('not zoomed, dominant-vertical-down → close', () => {
    expect(arbitrate(inp({ dx: 5, dy: 40 }))).toBe('close')
  })

  it('not zoomed, dominant-vertical-up, grouped → secondary axis', () => {
    expect(arbitrate(inp({ dx: 5, dy: -40, grouped: true }))).toBe('secondary')
  })

  it('not zoomed, dominant-vertical-up, not grouped → none (ignored)', () => {
    expect(arbitrate(inp({ dx: 5, dy: -40, grouped: false }))).toBe('none')
  })

  it('zoomed in → pan for a single-pointer drag (horizontal)', () => {
    expect(arbitrate(inp({ dx: 40, dy: 5, scale: 2, fitScale: 1 }))).toBe('pan')
  })

  it('zoomed in → pan for a single-pointer drag (vertical)', () => {
    expect(arbitrate(inp({ dx: 5, dy: 40, scale: 2, fitScale: 1 }))).toBe('pan')
  })

  it('treats scale == fitScale as not zoomed', () => {
    expect(arbitrate(inp({ dx: 40, dy: 5, scale: 1, fitScale: 1 }))).toBe('navigate')
  })

  it('a diagonal tie favors the horizontal (navigate) axis when not zoomed', () => {
    expect(arbitrate(inp({ dx: 30, dy: 30 }))).toBe('navigate')
  })
})
