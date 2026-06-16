import { describe, expect, it } from 'vitest'
import { type FsmState, initialFsm, reduceFsm } from './fsm'

const S = (phase: FsmState['phase'], interaction: FsmState['interaction'] = 'idle'): FsmState => ({
  phase,
  interaction,
})

describe('reduceFsm — phase', () => {
  it('starts closed / idle', () => {
    expect(initialFsm).toEqual({ phase: 'closed', interaction: 'idle' })
  })
  it('closed --OPEN--> opening', () => {
    expect(reduceFsm(S('closed'), { t: 'OPEN' })).toEqual(S('opening'))
  })
  it('opening --OPENED--> open', () => {
    expect(reduceFsm(S('opening'), { t: 'OPENED' })).toEqual(S('open'))
  })
  it('open --CLOSE--> closing', () => {
    expect(reduceFsm(S('open'), { t: 'CLOSE' })).toEqual(S('closing'))
  })
  it('closing --CLOSED--> closed', () => {
    expect(reduceFsm(S('closing'), { t: 'CLOSED' })).toEqual(S('closed'))
  })
  it('closing --OPEN--> opening (re-open cancels the close, no flicker)', () => {
    expect(reduceFsm(S('closing'), { t: 'OPEN' })).toEqual(S('opening'))
  })
  it('opening --CLOSE--> closing (cancel mid-open)', () => {
    expect(reduceFsm(S('opening'), { t: 'CLOSE' })).toEqual(S('closing'))
  })
  it('resets interaction to idle when leaving open via CLOSE', () => {
    expect(reduceFsm(S('open', 'zooming'), { t: 'CLOSE' })).toEqual(S('closing'))
  })
})

describe('reduceFsm — interaction (orthogonal, only while open)', () => {
  it('sets the interaction kind while open', () => {
    expect(reduceFsm(S('open'), { t: 'INTERACT', kind: 'panning' })).toEqual(S('open', 'panning'))
  })
  it('INTERACT idle returns to idle', () => {
    expect(reduceFsm(S('open', 'dragging'), { t: 'INTERACT', kind: 'idle' })).toEqual(S('open'))
  })
  it('ignores interaction changes when not open', () => {
    const s = S('opening')
    expect(reduceFsm(s, { t: 'INTERACT', kind: 'zooming' })).toBe(s)
  })
})

describe('reduceFsm — invalid transitions are no-ops (same reference)', () => {
  it('closed ignores OPENED/CLOSE/CLOSED', () => {
    const s = S('closed')
    expect(reduceFsm(s, { t: 'OPENED' })).toBe(s)
    expect(reduceFsm(s, { t: 'CLOSE' })).toBe(s)
    expect(reduceFsm(s, { t: 'CLOSED' })).toBe(s)
  })
  it('open ignores a redundant OPEN', () => {
    const s = S('open')
    expect(reduceFsm(s, { t: 'OPEN' })).toBe(s)
  })
  it('setting the same interaction is a no-op', () => {
    const s = S('open', 'panning')
    expect(reduceFsm(s, { t: 'INTERACT', kind: 'panning' })).toBe(s)
  })
})
