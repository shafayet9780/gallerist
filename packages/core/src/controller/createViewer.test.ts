import { describe, expect, it, vi } from 'vitest'
import type { Collection, Item } from '../types'
import { createViewer } from './createViewer'

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
  it('zoomTo sets committed zoom and emits zoom + zoomEnd', () => {
    const zoom = vi.fn()
    const zoomEnd = vi.fn()
    const v = createViewer({ items: [item('a')], on: { zoom, zoomEnd } })
    v.open()
    v.zoomTo(2, { x: 10, y: 20 })
    expect(v.getState().zoom).toEqual({ scale: 2, x: 10, y: 20 })
    expect(zoom).toHaveBeenCalled()
    expect(zoomEnd).toHaveBeenCalled()
    v.resetZoom()
    expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
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
    v.next()
    expect(v.getState().zoom).toEqual({ scale: 3, x: 50, y: 50 })
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
})
