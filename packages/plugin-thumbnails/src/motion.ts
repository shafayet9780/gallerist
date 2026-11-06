// Panels that open and close by resizing (the rail as it collapses to its handle, a stacked rail's
// item column): their size glides from where it was to where it lays out now, so the stage beside
// them grows or shrinks smoothly rather than jumping. One Web Animation per panel, on its width or
// height; the browser lays the frame out once per step (the stage follows through its own resize
// handling, which keeps a zoomed image's view). Nothing moves under prefers-reduced-motion.

export type Dim = 'width' | 'height'

/** Marks a panel mid-glide: the theme keeps it displayed (a collapsed rail is `display: none`
 *  otherwise) and anchors its contents to the edge it slides from. */
export const GLIDE = 'data-gallerist-glide'

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)' // in and out: a size change, not an entrance

interface Running {
  anim: Animation
  done: () => void
}

/** A panel's laid-out size along `dim`, in px (0 when not laid out). */
export const sizeOf = (el: Element, dim: Dim): number => el.getBoundingClientRect()[dim]

/** Whether panels should move: not under prefers-reduced-motion, and only where the browser
 *  animates elements (Web Animations). */
export function canGlide(el: Element): boolean {
  return typeof (el as HTMLElement).animate === 'function' && !reduced()
}

/** Whether the page asks for reduced motion. */
export const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A CSS time (`220ms`, `0.3s`, `0`) in ms; 220 when it isn't one (the token unset). */
export const toMs = (v: string): number => {
  const n = Number.parseFloat(v)
  return Number.isNaN(n) ? 220 : /\ds$/i.test(v.trim()) ? n * 1000 : n
}

export function createGlides(duration: () => number) {
  const running = new Map<HTMLElement, Running>()

  /** End `el`'s glide where it is (its `end` runs): the caller measures and starts the next. */
  const stop = (el: HTMLElement): void => running.get(el)?.done()

  /**
   * Resize `el` along `dim` from `from` px to `to` px, clipped, displayed throughout and, while it
   * closes, inert (it can't take focus or clicks on its way out); then `end`. Without motion, with a
   * duration of 0, or with nothing to move, `end` runs at once.
   */
  const glide = (el: HTMLElement, dim: Dim, from: number, to: number, end?: () => void): void => {
    stop(el)
    const settle = () => {
      el.removeAttribute(GLIDE)
      el.inert = false
      end?.()
    }
    const ms = duration()
    if (Math.abs(from - to) < 1 || !(ms > 0) || !canGlide(el)) {
      settle()
      return
    }
    el.setAttribute(GLIDE, '')
    el.inert = to < from
    const anim = el.animate(
      // the sizes are border boxes (what was measured), whatever the panel's own box-sizing
      {
        [dim]: [`${from}px`, `${to}px`],
        boxSizing: ['border-box', 'border-box'],
        overflow: ['hidden', 'hidden'],
      },
      { duration: ms, easing: EASE },
    )
    const done = () => {
      running.delete(el)
      anim.onfinish = null
      anim.cancel()
      settle()
    }
    anim.onfinish = done
    running.set(el, { anim, done })
  }

  return {
    glide,
    stop,
    /** whether `el` is mid-glide */
    moving: (el: HTMLElement) => running.has(el),
    /** end every glide (teardown) */
    stopAll: () => {
      for (const r of [...running.values()]) r.done()
    },
  }
}
