import { describe, expect, it } from 'vitest'
import { type FsmState, initialFsm, reduceFsm } from './fsm'

const S = (phase: FsmState['phase']): FsmState => ({ phase })

describe('reduceFsm — phase', () => {
  it('starts closed', () => {
    expect(initialFsm).toEqual({ phase: 'closed' })
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
})
