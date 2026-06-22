// The vanilla controller (spec §8): composes normalize + store + FSM + nav + events
// into the ViewerApi. Headless — no DOM. Lifecycle transitions settle synchronously here;
// the DOM renderer (M3) will drive opening/closing over real CSS transitions and own the
// async nav coalescing (spec §6) once transitions become time-based.

import type { EventHandlers, ViewerApi, ViewerOptions } from '../api'
import {
  type EventMap,
  type Handler,
  type ViewerEventPayload,
  createEmitter,
  makeCancelable,
} from '../events/events'
import { reduceFsm } from '../fsm/fsm'
import { normalize } from '../model/normalize'
import * as nav from '../nav/nav'
import type { Plugin, PluginInstance } from '../plugins/types'
import { createStore } from '../store/store'
import type { Collection, Cursor, ViewerState, ZoomState } from '../types'

const IDENTITY_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 }

export function createViewer(options: ViewerOptions): ViewerApi {
  const loop = options.loop ?? true
  const itemMemory = options.itemMemory ?? 'reset'
  const keepZoomOnNav = options.keepZoomOnNav ?? false

  let collection: Collection = normalize(options)
  let destroyed = false

  const navCtx = (): nav.NavCtx => ({
    counts: collection.groups.map((g) => g.items.length),
    loop,
    itemMemory,
  })

  const initialCursor: Cursor = options.startAt
    ? nav.goTo(options.startAt.g ?? 0, options.startAt.i, navCtx())
    : { g: 0, i: 0 }

  const store = createStore<ViewerState>({
    phase: 'closed',
    interaction: 'idle',
    cursor: initialCursor,
    zoom: { ...IDENTITY_ZOOM },
    loaded: {},
    fullscreen: false,
  })

  const emitter = createEmitter<EventMap>()

  // ── plugin registry (spec §13) ─────────────────────────────────────────────
  const pluginInstances: PluginInstance[] = []
  const pluginsChanged = new Set<() => void>()
  const notifyPlugins = () => {
    for (const fn of [...pluginsChanged]) fn()
  }
  const registerPlugin = (plugin: Plugin): (() => void) => {
    if (destroyed) return () => {}
    const inst = plugin(api)
    pluginInstances.push(inst)
    const offs: (() => void)[] = []
    if (inst.on) {
      for (const [type, fn] of Object.entries(inst.on) as [
        keyof EventMap,
        Handler<EventMap[keyof EventMap]>,
      ][]) {
        offs.push(emitter.on(type, fn))
      }
    }
    inst.init?.()
    notifyPlugins()
    // disposer — removes the instance, its handlers, runs destroy, re-notifies (used by React)
    return () => {
      const idx = pluginInstances.indexOf(inst)
      if (idx < 0) return
      pluginInstances.splice(idx, 1)
      for (const off of offs) off()
      inst.destroy?.()
      notifyPlugins()
    }
  }

  // api is referenced by event payloads; assigned below before any emit can run.
  // biome-ignore lint/style/useConst: forward reference — helpers close over api, assigned later.
  let api: ViewerApi

  // ── helpers ──────────────────────────────────────────────────────────────
  const payloadAt = (c: Cursor): ViewerEventPayload => {
    const group = collection.groups[c.g]
    return { viewer: api, cursor: c, group, item: group?.items[c.i] }
  }
  const basePayload = () => payloadAt(store.get().cursor)

  // Returns whether the FSM actually transitioned, so lifecycle emits can be gated on a real
  // state change (a no-op OPEN/CLOSE must not re-fire open/close events — review I-C1).
  const dispatch = (event: Parameters<typeof reduceFsm>[1]): boolean => {
    const s = store.get()
    const prev = { phase: s.phase, interaction: s.interaction }
    const next = reduceFsm(prev, event)
    if (next === prev) return false
    store.set((st) => ({ ...st, phase: next.phase, interaction: next.interaction }))
    return true
  }

  const setCursor = (c: Cursor): boolean => {
    const cur = store.get().cursor
    if (cur.g === c.g && cur.i === c.i) return false
    store.set((s) => ({ ...s, cursor: c }))
    return true
  }

  const groupNav = (target: Cursor): void => {
    if (destroyed) return
    const cur = store.get().cursor
    if (cur.g === target.g && cur.i === target.i) return
    if (!emitter.emit('beforeSlide', makeCancelable(payloadAt(target)))) return
    // Group change resets committed zoom unless keepZoomOnNav (spec §6/§8.1, review I-C2) —
    // otherwise you land pre-zoomed/pan-clamped on a differently-sized image. Combined with the
    // cursor write so subscribers see one coherent update.
    store.set((s) => ({ ...s, cursor: target, zoom: keepZoomOnNav ? s.zoom : { ...IDENTITY_ZOOM } }))
    emitter.emit('slide', basePayload())
    emitter.emit('afterSlide', basePayload())
  }

  const itemNav = (target: Cursor): void => {
    if (destroyed) return
    const cur = store.get().cursor
    if (cur.g === target.g && cur.i === target.i) return
    if (!emitter.emit('beforeItem', makeCancelable(payloadAt(target)))) return
    setCursor(target)
    emitter.emit('item', basePayload())
    emitter.emit('afterItem', basePayload())
  }

  // A jump within the same group is a secondary-axis move (item events); otherwise it's a
  // group-axis move (slide events) — keeps the §18 event taxonomy honest for goTo/goToId.
  const navTo = (target: Cursor): void => {
    const cur = store.get().cursor
    if (target.g === cur.g && target.i !== cur.i) itemNav(target)
    else groupNav(target)
  }

  const commitZoom = (z: ZoomState): void => {
    store.set((s) => ({ ...s, zoom: z }))
    emitter.emit('zoom', { ...basePayload(), zoom: z })
    emitter.emit('zoomEnd', { ...basePayload(), zoom: z })
  }

  // ── public api ───────────────────────────────────────────────────────────
  api = {
    open(at) {
      if (destroyed) return
      if (at) setCursor(nav.goTo(at.g ?? store.get().cursor.g, at.i, navCtx()))
      // Only emit when OPEN actually transitions — a second open() on an already-open viewer
      // must not re-fire open/opened (review I-C1).
      if (!dispatch({ t: 'OPEN' })) return
      emitter.emit('open', basePayload())
      dispatch({ t: 'OPENED' }) // sync settle (renderer overrides in M3)
      emitter.emit('opened', basePayload())
    },
    close() {
      if (destroyed) return
      // Only emit when CLOSE actually transitions — close() on an already-closed viewer is a
      // no-op and must not re-fire close/closed (review I-C1; also kills the React controlled
      // open+onClose double-fire, I-X1).
      if (!dispatch({ t: 'CLOSE' })) return
      emitter.emit('close', basePayload())
      dispatch({ t: 'CLOSED' })
      emitter.emit('closed', basePayload())
    },
    next() {
      groupNav(nav.nextGroup(store.get().cursor, navCtx()))
    },
    prev() {
      groupNav(nav.prevGroup(store.get().cursor, navCtx()))
    },
    nextItem() {
      itemNav(nav.nextItem(store.get().cursor, navCtx()))
    },
    prevItem() {
      itemNav(nav.prevItem(store.get().cursor, navCtx()))
    },
    goTo(g, i) {
      navTo(nav.goTo(g, i, navCtx()))
    },
    goToId(groupId, itemId) {
      const c = nav.resolveId(collection, groupId, itemId)
      if (c) navTo(c)
    },
    zoomTo(scale, focal) {
      if (destroyed) return
      const cur = store.get().zoom
      commitZoom({ scale, x: focal?.x ?? cur.x, y: focal?.y ?? cur.y })
    },
    resetZoom() {
      if (destroyed) return
      commitZoom({ ...IDENTITY_ZOOM })
    },
    setCollection(next) {
      if (destroyed) return
      const s = store.get()
      const prevGroup = collection.groups[s.cursor.g]
      const prevItem = prevGroup?.items[s.cursor.i]

      collection = normalize({ collection: next })

      let c: Cursor | null = null
      let sameItem = false
      if (prevGroup && prevItem) {
        c = nav.resolveId(collection, prevGroup.id, prevItem.id)
        if (c) sameItem = true // exact item still present → keep committed zoom
      }
      if (!c && prevGroup) c = nav.resolveId(collection, prevGroup.id)
      const cursor = c ?? nav.goTo(s.cursor.g, s.cursor.i, navCtx())

      store.set((st) => ({
        ...st,
        cursor,
        zoom: sameItem ? st.zoom : { ...IDENTITY_ZOOM },
      }))
      emitter.emit('collectionChange', { viewer: api })
    },
    getCollection() {
      return collection
    },
    refresh() {
      // renderer re-measures; no-op in the headless core.
    },
    getState() {
      return store.get()
    },
    subscribe(fn) {
      return store.subscribe(fn)
    },
    on(event, handler) {
      return emitter.on(event, handler)
    },
    emit(event, payload) {
      return emitter.emit(event, payload)
    },
    use(plugin) {
      return registerPlugin(plugin)
    },
    getPlugins() {
      return [...pluginInstances] // copy — callers must not mutate the registry
    },
    onPluginsChanged(fn) {
      pluginsChanged.add(fn)
      return () => {
        pluginsChanged.delete(fn)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      emitter.emit('destroy', { viewer: api })
      for (const inst of [...pluginInstances].reverse()) inst.destroy?.()
      pluginInstances.length = 0
      pluginsChanged.clear()
      emitter.clear()
      store.clear()
    },
    get cursor() {
      return store.get().cursor
    },
    get zoom() {
      return store.get().zoom
    },
    get loop() {
      return loop
    },
  }

  // wire `on` option handlers
  if (options.on) {
    for (const [type, fn] of Object.entries(options.on) as [
      keyof EventMap,
      Handler<unknown> | undefined,
    ][]) {
      if (fn) emitter.on(type, fn as Handler<EventMap[keyof EventMap]>)
    }
  }

  // register plugins before init so their on-handlers see the init event
  if (options.plugins) for (const plugin of options.plugins) registerPlugin(plugin)

  emitter.emit('init', { viewer: api })
  return api
}

export type { EventHandlers }
