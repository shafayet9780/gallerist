// Gesture arbitration (spec §11.3): a single pointer-down resolves to exactly one intent,
// evaluated on first move past a threshold. Pure & stateless — the caller locks the result
// for the rest of the gesture (no mid-gesture flip-flop). Real Pointer Events wire to this
// in the renderer (M3); the rules matrix is exhaustively tested here.

import { EPS } from './zoom'

export type Intent = 'none' | 'navigate' | 'pan' | 'close' | 'zoom' | 'secondary'

export interface ArbitrationInput {
  pointerCount: number
  /** total delta from gesture start. */
  dx: number
  dy: number
  scale: number
  fitScale: number
  /** current group has >1 item → the secondary (up-swipe) axis is available. */
  grouped: boolean
  threshold: number
}

export function arbitrate(input: ArbitrationInput): Intent {
  const { pointerCount, dx, dy, scale, fitScale, grouped, threshold } = input

  if (pointerCount >= 2) return 'zoom'

  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < threshold && ay < threshold) return 'none'

  // Zoomed in: any single-pointer drag pans (boundary→navigate handoff lives in the renderer).
  if (scale > fitScale + EPS) return 'pan'

  // At fit: choose by dominant axis (ties favor horizontal/navigate).
  if (ax >= ay) return 'navigate'
  if (dy > 0) return 'close'
  return grouped ? 'secondary' : 'none'
}
