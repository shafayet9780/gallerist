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

  it('select fires only when the selected slice changes (Object.is default)', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    s.select((st) => st.a, fn)
    s.set((p) => ({ ...p, b: { n: 99 } })) // a unchanged
    expect(fn).not.toHaveBeenCalled()
    s.set((p) => ({ ...p, a: 2 }))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2)
  })

  it('select honors a custom equality fn', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    const shallow = (x: { n: number }, y: { n: number }) => x.n === y.n
    s.select((st) => st.b, fn, shallow)
    s.set((p) => ({ ...p, b: { n: 0 } })) // new ref, same n → suppressed
    expect(fn).not.toHaveBeenCalled()
    s.set((p) => ({ ...p, b: { n: 1 } }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('select unsubscribe works', () => {
    const s = createStore(initial())
    const fn = vi.fn()
    const off = s.select((st) => st.a, fn)
    off()
    s.set((p) => ({ ...p, a: 5 }))
    expect(fn).not.toHaveBeenCalled()
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
