// Spring → keyframe sampler (spec §27.2, decision P0-H). Samples a damped harmonic oscillator
// (0→1) into progress values for Element.animate. Tiny & pure; the renderer maps values to
// transforms. theme-default ships the cubic-bezier fallbacks for the CSS path.

export interface SpringParams {
  stiffness: number
  damping: number
  mass?: number
}

/** Named presets (spec §27.2). */
export const SPRINGS = {
  smooth: { stiffness: 210, damping: 26 }, // shared-element open/close
  snappy: { stiffness: 320, damping: 30 }, // time-axis nav, dismiss spring-back
  pop: { stiffness: 300, damping: 18 }, // screen-axis depth (slight overshoot)
  gentle: { stiffness: 140, damping: 24 }, // chrome / backdrop fades
} as const satisfies Record<string, SpringParams>

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface SpringSample {
  /** progress values in [0, ~1] at evenly spaced offsets (0..1 of the duration). */
  values: number[]
  /** suggested animation duration in ms (clamped to a hero-motion band). */
  duration: number
}

export function sampleSpring(params: SpringParams, count = 60): SpringSample {
  const m = params.mass ?? 1
  const k = params.stiffness
  const c = params.damping
  const omega0 = Math.sqrt(k / m)
  const zeta = c / (2 * Math.sqrt(k * m))
  const decay = zeta * omega0

  // Settle when the response is within 1% of target; clamp to a sane hero band.
  const settle = decay > 0 ? Math.min(2, -Math.log(0.01) / decay) : 2 // seconds
  const duration = clamp(settle * 1000, 120, 600)

  const at = (t: number): number => {
    if (zeta < 1) {
      const wd = omega0 * Math.sqrt(1 - zeta * zeta)
      return 1 - Math.exp(-decay * t) * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t))
    }
    if (zeta === 1) {
      return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t)
    }
    const wd = omega0 * Math.sqrt(zeta * zeta - 1)
    const r1 = -omega0 * zeta + wd
    const r2 = -omega0 * zeta - wd
    const a = (r2 * 1) / (r2 - r1)
    const b = 1 - a
    return 1 - (a * Math.exp(r1 * t) + b * Math.exp(r2 * t))
  }

  if (count <= 0) return { values: [], duration }
  // Guard the divisor: count===1 would divide by zero → NaN sample times. A single keyframe
  // collapses to the settled value [1]; count>=2 samples evenly start..end (review S-C1).
  const denom = count > 1 ? count - 1 : 1
  const values: number[] = []
  for (let i = 0; i < count; i++) {
    values.push(at((settle * i) / denom))
  }
  values[0] = 0
  values[count - 1] = 1
  return { values, duration }
}
