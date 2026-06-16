// Explicit finite-state machine (spec §6): a tiny pure reducer the renderer subscribes to.
// `phase` is the lifecycle; `interaction` is an orthogonal region meaningful only while open.
// Invalid transitions return the same reference so the store skips redundant notifications.

import type { Interaction, Phase } from '../types'

export interface FsmState {
  phase: Phase
  interaction: Interaction
}

export type FsmEvent =
  | { t: 'OPEN' }
  | { t: 'OPENED' }
  | { t: 'CLOSE' }
  | { t: 'CLOSED' }
  | { t: 'INTERACT'; kind: Interaction }

export const initialFsm: FsmState = { phase: 'closed', interaction: 'idle' }

export function reduceFsm(state: FsmState, event: FsmEvent): FsmState {
  switch (event.t) {
    case 'OPEN':
      // From closed or closing, (re)open — a re-open cancels an in-flight close (no flicker).
      if (state.phase === 'closed' || state.phase === 'closing') {
        return { phase: 'opening', interaction: 'idle' }
      }
      return state
    case 'OPENED':
      return state.phase === 'opening' ? { phase: 'open', interaction: state.interaction } : state
    case 'CLOSE':
      if (state.phase === 'open' || state.phase === 'opening') {
        return { phase: 'closing', interaction: 'idle' }
      }
      return state
    case 'CLOSED':
      return state.phase === 'closing' ? { phase: 'closed', interaction: 'idle' } : state
    case 'INTERACT':
      // Interactions are tracked only while fully open.
      if (state.phase !== 'open' || state.interaction === event.kind) return state
      return { phase: state.phase, interaction: event.kind }
  }
}
