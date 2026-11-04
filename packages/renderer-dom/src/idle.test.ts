// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleController } from './idle'

const ATTR = 'data-gallerist-idle'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('createIdleController', () => {
  it('marks the root idle after the delay elapses', () => {
    const root = document.createElement('div')
    const c = createIdleController(root, { delay: 1000, reducedMotion: false })
    expect(root.hasAttribute(ATTR)).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(root.hasAttribute(ATTR)).toBe(true)
    c.destroy()
  })

  it('clears idle and re-arms on pointer activity', () => {
    const root = document.createElement('div')
    const c = createIdleController(root, { delay: 1000, reducedMotion: false })
    vi.advanceTimersByTime(1000)
    expect(root.hasAttribute(ATTR)).toBe(true)

    root.dispatchEvent(new Event('pointermove'))
    expect(root.hasAttribute(ATTR)).toBe(false) // woke up

    vi.advanceTimersByTime(999)
    expect(root.hasAttribute(ATTR)).toBe(false) // timer was reset
    vi.advanceTimersByTime(1)
    expect(root.hasAttribute(ATTR)).toBe(true) // idle again
    c.destroy()
  })

  it('is inert under prefers-reduced-motion (never auto-hides)', () => {
    const root = document.createElement('div')
    const c = createIdleController(root, { delay: 1000, reducedMotion: true })
    vi.advanceTimersByTime(10_000)
    expect(root.hasAttribute(ATTR)).toBe(false)
    c.destroy()
  })

  it('stops marking idle after destroy', () => {
    const root = document.createElement('div')
    const c = createIdleController(root, { delay: 1000, reducedMotion: false })
    c.destroy()
    vi.advanceTimersByTime(5000)
    expect(root.hasAttribute(ATTR)).toBe(false)
  })

  it('poke() clears idle and re-arms', () => {
    const root = document.createElement('div')
    const c = createIdleController(root, { delay: 1000, reducedMotion: false })
    vi.advanceTimersByTime(1000)
    expect(root.hasAttribute(ATTR)).toBe(true)
    c.poke()
    expect(root.hasAttribute(ATTR)).toBe(false)
    c.destroy()
  })
})
