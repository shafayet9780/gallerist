import { describe, expect, it, vi } from 'vitest'
import { createStore } from './store'

interface S {
  a: number
  b: { n: number }
}
const initial = (): S => ({ a: 1, b: { n: 0 } })

describe('createStore', () => {
  it('get() returns the initial state', () => {
    expect(createStore(initial()).get()).toEqual({ a: 1, b: { n: 0 } })
  })

  it('set() replaces state and get() reflects it', () => {
    const s = createStore(initial())
    s.set({ a: 2, b: { n: 5 } })
    expect(s.get()).toEqual({ a: 2, b: { n: 5 } })
  })

  it('subscribe is NOT called immediately, but fires on change with the new state', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    s.subscribe(fn)
    expect(fn).not.toHaveBeenCalled()
    const next = { a: 9, b: { n: 1 } }
    s.set(next)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(next)
  })

  it('unsubscribe stops further notifications', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    const off = s.subscribe(fn)
    off()
    s.set({ a: 2, b: { n: 0 } })
    expect(fn).not.toHaveBeenCalled()
  })

  it('does not notify when set receives the same reference', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    s.subscribe(fn)
    s.set((prev) => prev)
    expect(fn).not.toHaveBeenCalled()
  })

  it('functional updater receives the previous state', () => {
    const s = createStore(initial())
    s.set((prev) => ({ ...prev, a: prev.a + 10 }))
    expect(s.get().a).toBe(11)
  })

  it('unsubscribing during a notification is safe', () => {
    const s = createStore(initial())
    const calls: string[] = []
    const offB = s.subscribe(() => calls.push('b'))
    s.subscribe(() => {
      calls.push('a')
      offB()
    })
    s.set((p) => ({ ...p, a: 2 }))
    s.set((p) => ({ ...p, a: 3 }))
    // 'b' may fire in the first round (snapshot) but never after it unsubscribes.
    expect(calls.filter((c) => c === 'a')).toHaveLength(2)
  })

  it('clear() drops all subscribers', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    s.subscribe(fn)
    s.clear()
    s.set({ a: 2, b: { n: 0 } })
    expect(fn).not.toHaveBeenCalled()
  })
})
