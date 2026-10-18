import { describe, expect, it, vi } from 'vitest'
import type { Collection, Item } from '../types'
import { createViewer } from './createViewer'
import { getInternals } from './internals'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const grouped = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1'), item('b2')] },
    { id: 'g2', items: [item('c0'), item('c1')] },
  ],
})

describe('createViewer — lifecycle', () => {
  it('starts closed at cursor {0,0}', () => {
    const v = createViewer({ items: [item('a'), item('b')] })
    expect(v.getState().phase).toBe('closed')
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('open() settles to phase=open and emits open then opened', () => {
    const open = vi.fn()
    const opened = vi.fn()
    const v = createViewer({ items: [item('a')], on: { open, opened } })
    v.open()
    expect(v.getState().phase).toBe('open')
    expect(open).toHaveBeenCalledOnce()
    expect(opened).toHaveBeenCalledOnce()
  })

  it('open(at) and startAt set the cursor', () => {
    const v = createViewer({ collection: grouped(), startAt: { g: 2 } })
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    v.open({ g: 1, i: 2 })
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('close() settles to phase=closed and emits close then closed', () => {
    const close = vi.fn()
    const closed = vi.fn()
    const v = createViewer({ items: [item('a')], on: { close, closed } })
    v.open()
    v.close()
    expect(v.getState().phase).toBe('closed')
    expect(close).toHaveBeenCalledOnce()
    expect(closed).toHaveBeenCalledOnce()
  })

  it('open() is idempotent — a second open() does not re-emit (I-C1)', () => {
    const open = vi.fn()
    const opened = vi.fn()
    const v = createViewer({ items: [item('a')], on: { open, opened } })
    v.open()
    v.open()
    expect(open).toHaveBeenCalledOnce()
    expect(opened).toHaveBeenCalledOnce()
  })

  it('close() on a never-opened viewer emits nothing (I-C1)', () => {
    const close = vi.fn()
    const closed = vi.fn()
    const v = createViewer({ items: [item('a')], on: { close, closed } })
    v.close()
    expect(close).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
  })
})

describe('createViewer — navigation', () => {
  it('next/prev move the group axis and wrap with loop', () => {
    const v = createViewer({ collection: grouped(), loop: true })
    v.open()
    v.next()
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    v.prev()
    v.prev()
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 }) // wrapped past 0
  })

  it('nextItem/prevItem move the secondary axis within a group', () => {
    const v = createViewer({ collection: grouped() })
    v.open({ g: 1 })
    v.nextItem()
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    v.prevItem()
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
  })

  it('emits cancelable beforeSlide; returning false blocks the move', () => {
    const v = createViewer({ collection: grouped(), on: { beforeSlide: () => false } })
    v.open()
    v.next()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 }) // blocked
  })

  it('emits cancelable beforeItem; preventDefault blocks the move', () => {
    const v = createViewer({ collection: grouped(), on: { beforeItem: (e) => e.preventDefault() } })
    v.open({ g: 1 })
    v.nextItem()
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 }) // blocked
  })

  it('emits slide with the destination group/item', () => {
    const slide = vi.fn()
    const v = createViewer({ collection: grouped(), on: { slide } })
    v.open()
    v.next()
    expect(slide).toHaveBeenCalledOnce()
    expect(slide.mock.calls[0]?.[0]).toMatchObject({ cursor: { g: 1, i: 0 } })
  })

  it('goToId jumps to a group/item by id', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    v.goToId('g2', 'c1')
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 })
  })

  it('a same-group jump emits item events, a cross-group jump emits slide events', () => {
    const slide = vi.fn()
    const item = vi.fn()
    const v = createViewer({ collection: grouped(), on: { slide, item } })
    v.open({ g: 1 })
    v.goToId('g1', 'b2') // same group → secondary axis
    expect(item).toHaveBeenCalledTimes(1)
    expect(slide).not.toHaveBeenCalled()
    v.goToId('g2', 'c0') // different group → time axis
    expect(slide).toHaveBeenCalledTimes(1)
  })
})

describe('createViewer — zoom (committed)', () => {
  it('zoomTo zooms around the focal point and emits zoom + zoomEnd', () => {
    const zoom = vi.fn()
    const zoomEnd = vi.fn()
    const v = createViewer({ items: [item('a')], on: { zoom, zoomEnd } })
    v.open()
    v.zoomTo(2, { x: 10, y: 20 })
    // the content pixel under (10, 20) stays under it: 10 = 10·2 + x → x = -10
    expect(v.getState().zoom).toEqual({ scale: 2, x: -10, y: -20 })
    expect(zoom).toHaveBeenCalled()
    expect(zoomEnd).toHaveBeenCalled()
    v.resetZoom()
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('ignores a non-finite or non-positive scale and a non-finite focal (no poisoned state)', () => {
    const zoom = vi.fn()
    const v = createViewer({ items: [item('a')], on: { zoom } })
    v.open()
    v.zoomTo(2, { x: 10, y: 20 })
    const before = v.getState().zoom
    zoom.mockClear()
    for (const bad of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) v.zoomTo(bad)
    v.zoomTo(2, { x: Number.NaN, y: 0 })
    getInternals(v).setZoom({ scale: 2, x: Number.NaN, y: 0 })
    expect(v.getState().zoom).toEqual(before)
    expect(zoom).not.toHaveBeenCalled()
  })

  it('zoomTo without a focal point pivots on the stage origin when no renderer lent bounds', () => {
    const v = createViewer({ items: [item('a')] })
    v.zoomTo(2)
    expect(v.getState().zoom).toEqual({ scale: 2, x: 0, y: 0 })
  })

  it('zoomTo without a focal point pivots on the bounds centre', () => {
    const v = createViewer({ items: [item('a')] })
    getInternals(v).setZoomBounds({ center: () => ({ x: 100, y: 50 }), constrain: (z) => z })
    v.zoomTo(2)
    expect(v.getState().zoom).toEqual({ scale: 2, x: -100, y: -50 })
  })

  it('every commit passes through the zoom bounds (zoomTo, resetZoom, setZoom)', () => {
    const v = createViewer({ items: [item('a')] })
    const constrain = vi.fn((z: { scale: number; x: number; y: number }) => ({
      scale: Math.min(z.scale, 4),
      x: 0,
      y: 0,
    }))
    getInternals(v).setZoomBounds({ center: () => ({ x: 0, y: 0 }), constrain })
    v.zoomTo(9, { x: 30, y: 30 })
    expect(v.getState().zoom).toEqual({ scale: 4, x: 0, y: 0 })
    getInternals(v).setZoom({ scale: 2, x: -50, y: -50 })
    expect(v.getState().zoom).toEqual({ scale: 2, x: 0, y: 0 })
    constrain.mockClear()
    v.resetZoom()
    expect(constrain).toHaveBeenCalledWith({ scale: 1, x: 0, y: 0 })
  })

  it('a bounds disposer only clears its own bounds (StrictMode remount)', () => {
    const v = createViewer({ items: [item('a')] })
    const internals = getInternals(v)
    const offFirst = internals.setZoomBounds({
      center: () => ({ x: 0, y: 0 }),
      constrain: (z) => z,
    })
    internals.setZoomBounds({ center: () => ({ x: 10, y: 10 }), constrain: (z) => z })
    offFirst() // the first renderer tears down after the second mounted
    v.zoomTo(2)
    expect(v.getState().zoom).toEqual({ scale: 2, x: -10, y: -10 }) // second bounds still active
  })

  it('resets committed zoom on group navigation by default (I-C2)', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    v.zoomTo(3, { x: 50, y: 50 })
    v.next()
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('keepZoomOnNav retains committed zoom across group navigation (I-C2)', () => {
    const v = createViewer({ collection: grouped(), keepZoomOnNav: true })
    v.open()
    v.zoomTo(3, { x: 50, y: 50 })
    const zoomed = v.getState().zoom
    v.next()
    expect(v.getState().zoom).toEqual(zoomed)
  })
})

describe('createViewer — load status + trimmed state (WS-1 hybrid)', () => {
  it('load/loaded/loadError events drive state.loaded', () => {
    const v = createViewer({ items: [item('a')] })
    const base = { viewer: v, cursor: v.cursor, id: 'a' }
    getInternals(v).emit('load', base)
    expect(v.getState().loaded.a).toBe('loading')
    getInternals(v).emit('loaded', base)
    expect(v.getState().loaded.a).toBe('loaded')
    getInternals(v).emit('loadError', { ...base, error: new Error('boom') })
    expect(v.getState().loaded.a).toBe('error')
  })

  it('public state no longer carries the dead interaction/fullscreen fields', () => {
    const s = createViewer({ items: [item('a')] }).getState()
    expect('interaction' in s).toBe(false)
    expect('fullscreen' in s).toBe(false)
    expect(s).toHaveProperty('loaded')
  })
})

describe('createViewer — subscribe / destroy', () => {
  it('subscribe is notified on state change', () => {
    const v = createViewer({ collection: grouped() })
    const fn = vi.fn()
    v.subscribe(fn)
    v.open()
    expect(fn).toHaveBeenCalled()
  })

  it('destroy emits destroy and stops notifications', () => {
    const destroy = vi.fn()
    const sub = vi.fn()
    const v = createViewer({ items: [item('a')], on: { destroy } })
    v.subscribe(sub)
    v.destroy()
    expect(destroy).toHaveBeenCalledOnce()
    sub.mockClear()
    v.open()
    expect(sub).not.toHaveBeenCalled()
  })
})

describe('createViewer — setCollection diff', () => {
  it('preserves the cursor by id across an update', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    v.goToId('g2', 'c1') // cursor on item c1 of g2
    const next: Collection = {
      groups: [
        { id: 'gX', items: [item('x')] }, // new group prepended
        { id: 'g2', items: [item('c0'), item('c1')] },
      ],
    }
    v.setCollection(next)
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 }) // g2/c1 now at index 1
  })

  it('falls back to the same group (item 0) when the item id is gone', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    v.goToId('g1', 'b2')
    v.setCollection({ groups: [{ id: 'g1', items: [item('b0')] }] })
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('clamps the cursor when both group and item are gone, and emits collectionChange', () => {
    const change = vi.fn()
    const v = createViewer({ collection: grouped(), on: { collectionChange: change } })
    v.open()
    v.goToId('g2', 'c1')
    v.setCollection({ groups: [{ id: 'new', items: [item('z')] }] })
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
    expect(change).toHaveBeenCalledOnce()
  })

  it('keeps committed zoom when the item id survives, resets it when gone (#63)', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    v.goToId('g1', 'b1')
    v.zoomTo(2, { x: 10, y: 20 })
    const zoomed = v.getState().zoom
    v.setCollection({ groups: [{ id: 'g1', items: [item('b0'), item('b1')] }] }) // b1 still present
    expect(v.getState().zoom).toEqual(zoomed)
    v.setCollection({ groups: [{ id: 'zz', items: [item('z')] }] }) // b1 gone
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('handles setCollection to an empty collection without throwing', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    expect(() => v.setCollection({ groups: [] })).not.toThrow()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })
})

describe('createViewer — internals boundary (spec §8.4)', () => {
  it('keeps renderer plumbing off the public api', () => {
    const v = createViewer({ items: [item('a')] }) as unknown as Record<string, unknown>
    expect(v.emit).toBeUndefined()
    expect(v.getPlugins).toBeUndefined()
    expect(v.onPluginsChanged).toBeUndefined()
  })

  it('exposes them through getInternals, non-enumerably', () => {
    const v = createViewer({ items: [item('a')] })
    const internals = getInternals(v)
    expect(typeof internals.emit).toBe('function')
    expect(Object.keys(v)).not.toContain('emit')
    expect(Object.getOwnPropertySymbols({ ...v })).toHaveLength(0) // not copied by a spread
  })

  it('is reachable from a plugin factory', () => {
    let seen: unknown
    createViewer({
      items: [item('a')],
      plugins: [
        (viewer) => {
          seen = getInternals(viewer).getPlugins()
          return { name: 'probe' }
        },
      ],
    })
    expect(seen).toEqual([])
  })

  it('throws a clear error for an object that is not a viewer', () => {
    expect(() => getInternals({} as never)).toThrow(/not a viewer created by createViewer/)
  })
})

describe('createViewer — lifecycle driver (async open/close)', () => {
  // A driver that parks each transition's done() so the test settles it explicitly.
  const parked = () => {
    const pending: { opening: (() => void)[]; closing: (() => void)[] } = {
      opening: [],
      closing: [],
    }
    return {
      pending,
      driver: {
        opening: (done: () => void) => void pending.opening.push(done),
        closing: (done: () => void) => void pending.closing.push(done),
      },
    }
  }

  it('opened/closed fire only when the driver reports the transition done', () => {
    const opened = vi.fn()
    const closed = vi.fn()
    const v = createViewer({ items: [item('a')], on: { opened, closed } })
    const { pending, driver } = parked()
    getInternals(v).setLifecycleDriver(driver)
    v.open()
    expect(v.getState().phase).toBe('opening')
    expect(opened).not.toHaveBeenCalled()
    pending.opening[0]?.()
    expect(v.getState().phase).toBe('open')
    expect(opened).toHaveBeenCalledTimes(1)
    v.close()
    expect(v.getState().phase).toBe('closing')
    pending.closing[0]?.()
    expect(v.getState().phase).toBe('closed')
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('a done() from a superseded transition is ignored (close during opening)', () => {
    const opened = vi.fn()
    const v = createViewer({ items: [item('a')], on: { opened } })
    const { pending, driver } = parked()
    getInternals(v).setLifecycleDriver(driver)
    v.open()
    v.close() // interrupts the opening
    pending.opening[0]?.() // the stale opening finishes late
    expect(v.getState().phase).toBe('closing')
    expect(opened).not.toHaveBeenCalled()
    pending.closing[0]?.()
    expect(v.getState().phase).toBe('closed')
  })

  it('reopening during closing ignores the stale close and settles the new open', () => {
    const closed = vi.fn()
    const v = createViewer({ items: [item('a')], on: { closed } })
    const { pending, driver } = parked()
    getInternals(v).setLifecycleDriver(driver)
    v.open()
    pending.opening[0]?.()
    v.close()
    v.open() // reopen mid-close
    pending.closing[0]?.() // stale
    expect(v.getState().phase).toBe('opening')
    expect(closed).not.toHaveBeenCalled()
    pending.opening[1]?.()
    expect(v.getState().phase).toBe('open')
  })

  it('calling done() twice settles once', () => {
    const opened = vi.fn()
    const v = createViewer({ items: [item('a')], on: { opened } })
    const { pending, driver } = parked()
    getInternals(v).setLifecycleDriver(driver)
    v.open()
    pending.opening[0]?.()
    pending.opening[0]?.()
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('removing the driver mid-transition settles it (closed still fires)', () => {
    const closed = vi.fn()
    const v = createViewer({ items: [item('a')], on: { closed } })
    const { pending, driver } = parked()
    const off = getInternals(v).setLifecycleDriver(driver)
    v.open()
    pending.opening[0]?.()
    v.close()
    off() // e.g. the renderer unmounts during the close animation
    expect(v.getState().phase).toBe('closed')
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it("a replaced driver's disposer neither clears nor settles the new driver's transition", () => {
    const v = createViewer({ items: [item('a')] })
    const internals = getInternals(v)
    const offFirst = internals.setLifecycleDriver(parked().driver)
    const second = parked()
    internals.setLifecycleDriver(second.driver)
    v.open()
    offFirst()
    expect(v.getState().phase).toBe('opening')
    second.pending.opening[0]?.()
    expect(v.getState().phase).toBe('open')
  })

  it('a throwing driver hook settles the transition and surfaces the error', () => {
    const v = createViewer({ items: [item('a')] })
    getInternals(v).setLifecycleDriver({
      opening: () => {
        throw new Error('renderer bug')
      },
    })
    expect(() => v.open()).toThrow('renderer bug')
    expect(v.getState().phase).toBe('open')
  })

  it('a missing hook settles synchronously', () => {
    const v = createViewer({ items: [item('a')] })
    getInternals(v).setLifecycleDriver({ closing: (done) => done() })
    v.open()
    expect(v.getState().phase).toBe('open')
  })

  it('a done() after destroy is ignored', () => {
    const v = createViewer({ items: [item('a')] })
    const { pending, driver } = parked()
    getInternals(v).setLifecycleDriver(driver)
    v.open()
    v.destroy()
    expect(() => pending.opening[0]?.()).not.toThrow()
  })
})

describe('createViewer — refresh', () => {
  it('refresh() notifies the renderer listeners until they unsubscribe', () => {
    const v = createViewer({ items: [item('a')] })
    const fn = vi.fn()
    const off = getInternals(v).onRefresh(fn)
    v.refresh()
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    v.refresh()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('refresh() is a no-op after destroy', () => {
    const v = createViewer({ items: [item('a')] })
    const fn = vi.fn()
    getInternals(v).onRefresh(fn)
    v.destroy()
    v.refresh()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('createViewer — open(at)', () => {
  it('on an open viewer, open({ g }) navigates with slide events (and the group move resets zoom)', () => {
    const slide = vi.fn()
    const opened = vi.fn()
    const v = createViewer({ collection: grouped(), on: { slide, opened } })
    v.open()
    v.zoomTo(2)
    v.open({ g: 2 })
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
    expect(slide).toHaveBeenCalledTimes(1)
    expect(opened).toHaveBeenCalledTimes(1) // not re-fired
  })

  it('on an open viewer, open({ g, i }) within the group is an item move, and cancelable', () => {
    const item = vi.fn()
    const v = createViewer({ collection: grouped(), startAt: { g: 1 }, on: { item } })
    v.open()
    v.open({ g: 1, i: 2 })
    expect(item).toHaveBeenCalledTimes(1)
    v.on('beforeSlide', () => false)
    v.open({ g: 0 })
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('reopening starts at fit instead of the last session zoom', () => {
    const v = createViewer({ collection: grouped() })
    v.open()
    v.zoomTo(2, { x: 10, y: 10 })
    v.close()
    v.open()
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('opening a closed viewer at a position does not emit navigation events', () => {
    const slide = vi.fn()
    const v = createViewer({ collection: grouped(), on: { slide } })
    v.open({ g: 2, i: 1 })
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 })
    expect(slide).not.toHaveBeenCalled()
  })
})

describe('createViewer — review follow-ups', () => {
  it('a commit identical to the current zoom is skipped (no store change, no zoom event)', () => {
    const zoom = vi.fn()
    const subscriber = vi.fn()
    const v = createViewer({ items: [item('a')], on: { zoom } })
    getInternals(v).setZoomBounds({
      center: () => ({ x: 0, y: 0 }),
      constrain: (z) => ({ ...z, scale: Math.min(z.scale, 4) }),
    })
    v.zoomTo(4)
    v.subscribe(subscriber)
    zoom.mockClear()
    v.zoomTo(9) // already at max: clamps to the same transform
    v.zoomTo(4)
    expect(zoom).not.toHaveBeenCalled()
    expect(subscriber).not.toHaveBeenCalled()
  })

  it('a transition settles when its driver is disposed even after another driver replaced it', () => {
    const closed = vi.fn()
    const v = createViewer({ items: [item('a')], on: { closed } })
    const internals = getInternals(v)
    const offA = internals.setLifecycleDriver({ closing: () => {} }) // A never reports done
    v.open()
    v.close() // A is running the closing transition
    internals.setLifecycleDriver({ closing: () => {} }) // renderer B takes over
    offA() // A is destroyed mid-close
    expect(v.getState().phase).toBe('closed')
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('open({ g }) while closing navigates with events, then reopens', () => {
    const slide = vi.fn()
    const v = createViewer({ collection: grouped(), on: { slide } })
    getInternals(v).setLifecycleDriver({ closing: () => {} }) // keep it in 'closing'
    v.open()
    v.close()
    v.open({ g: 2 })
    expect(slide).toHaveBeenCalledTimes(1)
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    expect(v.getState().phase).toBe('open')
  })

  it('cancelLoad returns a loading item to idle and leaves other statuses alone', () => {
    const v = createViewer({ items: [item('a'), item('b')] })
    const internals = getInternals(v)
    const base = { viewer: v, cursor: v.cursor }
    internals.emit('load', { ...base, id: 'a' })
    internals.emit('loaded', { ...base, id: 'b' })
    internals.cancelLoad('a')
    internals.cancelLoad('b')
    expect(v.getState().loaded).toEqual({ a: 'idle', b: 'loaded' })
  })
})
