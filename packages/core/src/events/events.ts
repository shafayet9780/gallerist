import type { ViewerApi } from '../api'
import type { Cursor, Group, Item, ZoomState } from '../types'

// ── Cancelable payloads ───────────────────────────────────────────────────────

export interface Cancelable {
  defaultPrevented: boolean
  preventDefault(): void
}

export function makeCancelable<T extends object>(base: T): T & Cancelable {
  // Closure, not `this`: a destructured `const { preventDefault } = e` must still cancel.
  const payload: T & Cancelable = {
    ...base,
    defaultPrevented: false,
    preventDefault() {
      payload.defaultPrevented = true
    },
  }
  return payload
}

function isCancelable(p: unknown): p is Cancelable {
  return typeof p === 'object' && p !== null && 'preventDefault' in p && 'defaultPrevented' in p
}

// ── Event payloads & map (spec §18) ───────────────────────────────────────────

export interface ViewerEventPayload {
  viewer: ViewerApi
  cursor: Cursor
  // optional: absent for empty collections / lifecycle edges
  group?: Group
  item?: Item
}
export type CancelableNavPayload = ViewerEventPayload & Cancelable

export interface EventMap {
  init: { viewer: ViewerApi }
  destroy: { viewer: ViewerApi }
  open: ViewerEventPayload
  opened: ViewerEventPayload
  close: ViewerEventPayload
  closed: ViewerEventPayload
  beforeSlide: CancelableNavPayload
  slide: ViewerEventPayload
  afterSlide: ViewerEventPayload
  beforeItem: CancelableNavPayload
  item: ViewerEventPayload
  afterItem: ViewerEventPayload
  zoom: ViewerEventPayload & { zoom: ZoomState }
  zoomEnd: ViewerEventPayload & { zoom: ZoomState }
  load: ViewerEventPayload & { id: string }
  loaded: ViewerEventPayload & { id: string }
  loadError: ViewerEventPayload & { id: string; error: unknown }
  collectionChange: { viewer: ViewerApi }
  fullscreenChange: { viewer: ViewerApi; fullscreen: boolean }
  overlayClick: ViewerEventPayload & { id: string }
}

// ── Emitter ───────────────────────────────────────────────────────────────────

// Returns anything; only an explicit `false` cancels a cancelable event.
export type Handler<P> = (payload: P) => unknown

export interface Emitter<M> {
  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void
  off<K extends keyof M>(type: K, fn: Handler<M[K]>): void
  /** returns false if a cancelable payload was prevented. */
  emit<K extends keyof M>(type: K, payload: M[K]): boolean
  clear(): void
}

// Surface a handler's exception without aborting the emit: by the time an event fires the state
// change it describes has already happened, so the remaining handlers must still run (as DOM
// event dispatch does). `reportError` reaches window.onerror in browsers; elsewhere, log it.
const reportHandlerError = (error: unknown): void => {
  const report = (globalThis as { reportError?: (e: unknown) => void }).reportError
  if (typeof report === 'function') report(error)
  else console.error(error)
}

export function createEmitter<M>(): Emitter<M> {
  const map = new Map<keyof M, Set<Handler<unknown>>>()

  const on = <K extends keyof M>(type: K, fn: Handler<M[K]>): (() => void) => {
    let set = map.get(type)
    if (!set) {
      set = new Set()
      map.set(type, set)
    }
    set.add(fn as Handler<unknown>)
    return () => off(type, fn)
  }

  const off = <K extends keyof M>(type: K, fn: Handler<M[K]>): void => {
    map.get(type)?.delete(fn as Handler<unknown>)
  }

  const emit = <K extends keyof M>(type: K, payload: M[K]): boolean => {
    const set = map.get(type)
    if (set) {
      // Snapshot so a handler that (un)subscribes mid-emit doesn't disturb this round.
      for (const fn of [...set]) {
        let result: unknown
        try {
          result = fn(payload)
        } catch (error) {
          reportHandlerError(error)
          continue
        }
        if (result === false && isCancelable(payload)) payload.preventDefault()
      }
    }
    return isCancelable(payload) ? !payload.defaultPrevented : true
  }

  const clear = () => map.clear()

  return { on, off, emit, clear }
}
