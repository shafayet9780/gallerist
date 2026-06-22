// Idle controller (M14 UX-C). Flags the root with `data-visora-idle` after a period of no pointer/
// key activity so the theme can fade the chrome + rail; any activity wakes it. Inert under
// prefers-reduced-motion — auto-hiding UI is disorienting motion, so we never hide there.

const ATTR = 'data-visora-idle'
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
// pointermove fires many times/second — re-arm the timer at most this often to avoid timer churn.
const REARM_THROTTLE_MS = 200

export interface IdleControllerOptions {
  /** inactivity before idle (ms). default 2500. */
  delay?: number
  /** override reduced-motion detection (mainly for tests). */
  reducedMotion?: boolean
}

export interface IdleController {
  /** reset the timer and wake (clear idle). */
  poke(): void
  destroy(): void
}

function prefersReducedMotion(root: HTMLElement): boolean {
  const win = root.ownerDocument?.defaultView
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function createIdleController(
  root: HTMLElement,
  opts: IdleControllerOptions = {},
): IdleController {
  const delay = opts.delay ?? 2500
  const reduced = opts.reducedMotion ?? prefersReducedMotion(root)

  // Under reduced motion (or no real timers), return an inert controller — chrome stays visible.
  if (reduced) {
    return { poke() {}, destroy() {} }
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let alive = true
  let lastArm = 0
  let isIdle = false

  // Only touch the attribute when the idle state actually flips — onActivity runs on every
  // pointermove/wheel during gestures, so an unconditional removeAttribute is a wasted DOM call
  // per input event (S-PERF3).
  const wake = () => {
    if (!isIdle) return
    isIdle = false
    root.removeAttribute(ATTR)
  }
  const goIdle = () => {
    if (!alive || isIdle) return
    isIdle = true
    root.setAttribute(ATTR, '')
  }
  const arm = () => {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(goIdle, delay)
    lastArm = Date.now()
  }
  // forced reset (public poke) — wake immediately and re-arm.
  const poke = () => {
    wake()
    arm()
  }
  // activity handler — wake instantly, but coalesce re-arming so a stream of pointermoves
  // doesn't recreate the timer on every event.
  const onActivity = () => {
    wake()
    if (Date.now() - lastArm >= REARM_THROTTLE_MS) arm()
  }

  for (const ev of ACTIVITY) root.addEventListener(ev, onActivity, { passive: true })
  arm()

  return {
    poke,
    destroy() {
      alive = false
      if (timer != null) clearTimeout(timer)
      for (const ev of ACTIVITY) root.removeEventListener(ev, onActivity)
      root.removeAttribute(ATTR)
    },
  }
}
