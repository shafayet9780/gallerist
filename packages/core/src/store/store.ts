// Minimal zero-dependency signal store (spec §7, decision D3).
// Read API (get/subscribe) binds to framework adapters; set() is the engine's write path.

export interface Store<S> {
  get(): Readonly<S>
  set(next: S | ((prev: S) => S)): void
  subscribe(fn: (s: Readonly<S>) => void): () => void
  /** Drop all subscribers (used on viewer destroy to avoid leaking consumer closures). */
  clear(): void
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial
  const subs = new Set<(s: S) => void>()

  const get = () => state

  const set = (next: S | ((prev: S) => S)): void => {
    const value = typeof next === 'function' ? (next as (p: S) => S)(state) : next
    if (Object.is(value, state)) return
    state = value
    // Snapshot subscribers so unsubscribing mid-notify is safe.
    for (const fn of [...subs]) fn(state)
  }

  const subscribe = (fn: (s: S) => void): (() => void) => {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }

  const clear = () => subs.clear()

  return { get, set, subscribe, clear }
}
