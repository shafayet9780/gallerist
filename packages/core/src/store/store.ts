// Minimal zero-dependency signal store (spec §7, decision D3).
// Read API (get/subscribe/select) binds to framework adapters; set() is the engine's write path.

export interface Store<S> {
  get(): Readonly<S>
  set(next: S | ((prev: S) => S)): void
  subscribe(fn: (s: Readonly<S>) => void): () => void
  /** Selector subscription: fires only when the selected slice changes (avoids over-notifying). */
  select<T>(sel: (s: S) => T, fn: (t: T) => void, eq?: (a: T, b: T) => boolean): () => void
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

  const select = <T>(
    sel: (s: S) => T,
    fn: (t: T) => void,
    eq: (a: T, b: T) => boolean = Object.is,
  ): (() => void) => {
    let prev = sel(state)
    return subscribe((s) => {
      const nextVal = sel(s)
      if (!eq(prev, nextVal)) {
        prev = nextVal
        fn(nextVal)
      }
    })
  }

  const clear = () => subs.clear()

  return { get, set, subscribe, select, clear }
}
