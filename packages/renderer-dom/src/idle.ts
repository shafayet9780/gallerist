// Idle controller (M14 UX-C). Flags the root with `data-visora-idle` after a period of no pointer/
// key activity so the theme can fade the chrome + rail; any activity wakes it. Inert under
// prefers-reduced-motion — auto-hiding UI is disorienting motion, so we never hide there.

const ATTR = 'data-visora-idle'
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

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

  const goIdle = () => {
    if (alive) root.setAttribute(ATTR, '')
  }
  const arm = () => {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(goIdle, delay)
  }
  const wake = () => {
    root.removeAttribute(ATTR)
    arm()
  }

  for (const ev of ACTIVITY) root.addEventListener(ev, wake, { passive: true })
  arm()

  return {
    poke: wake,
    destroy() {
      alive = false
      if (timer != null) clearTimeout(timer)
      for (const ev of ACTIVITY) root.removeEventListener(ev, wake)
      root.removeAttribute(ATTR)
    },
  }
}
