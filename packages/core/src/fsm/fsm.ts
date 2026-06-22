// Explicit finite-state machine (spec §6): a tiny pure reducer for the viewer lifecycle.
// Invalid transitions return the same reference so the controller can skip redundant work.

import type { Phase } from '../types'

export interface FsmState {
  phase: Phase
}

export type FsmEvent = { t: 'OPEN' } | { t: 'OPENED' } | { t: 'CLOSE' } | { t: 'CLOSED' }

export const initialFsm: FsmState = { phase: 'closed' }

export function reduceFsm(state: FsmState, event: FsmEvent): FsmState {
  switch (event.t) {
    case 'OPEN':
      // From closed or closing, (re)open — a re-open cancels an in-flight close (no flicker).
      if (state.phase === 'closed' || state.phase === 'closing') return { phase: 'opening' }
      return state
    case 'OPENED':
      return state.phase === 'opening' ? { phase: 'open' } : state
    case 'CLOSE':
      if (state.phase === 'open' || state.phase === 'opening') return { phase: 'closing' }
      return state
    case 'CLOSED':
      return state.phase === 'closing' ? { phase: 'closed' } : state
  }
}
