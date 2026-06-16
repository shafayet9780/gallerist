import { describe, expect, it, vi } from 'vitest'
import { createEmitter, makeCancelable } from './events'

interface TestMap {
  ping: { n: number }
  before: ReturnType<typeof makeCancelable<{ n: number }>>
}

describe('createEmitter', () => {
  it('calls a handler with the payload', () => {
    const e = createEmitter<TestMap>()
    const fn = vi.fn()
    e.on('ping', fn)
    e.emit('ping', { n: 1 })
    expect(fn).toHaveBeenCalledWith({ n: 1 })
  })

  it('the unsubscribe returned by on() removes the handler', () => {
    const e = createEmitter<TestMap>()
    const fn = vi.fn()
    const off = e.on('ping', fn)
    off()
    e.emit('ping', { n: 1 })
    expect(fn).not.toHaveBeenCalled()
  })

  it('off() removes a handler', () => {
    const e = createEmitter<TestMap>()
    const fn = vi.fn()
    e.on('ping', fn)
    e.off('ping', fn)
    e.emit('ping', { n: 1 })
    expect(fn).not.toHaveBeenCalled()
  })

  it('calls every registered handler', () => {
    const e = createEmitter<TestMap>()
    const a = vi.fn()
    const b = vi.fn()
    e.on('ping', a)
    e.on('ping', b)
    e.emit('ping', { n: 2 })
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('emit returns true for a non-cancelable event (even if a handler returns false)', () => {
    const e = createEmitter<TestMap>()
    e.on('ping', () => false)
    expect(e.emit('ping', { n: 1 })).toBe(true)
  })

  it('emit returns false when a handler returns false on a cancelable event', () => {
    const e = createEmitter<TestMap>()
    e.on('before', () => false)
    const p = makeCancelable({ n: 1 })
    expect(e.emit('before', p)).toBe(false)
    expect(p.defaultPrevented).toBe(true)
  })

  it('emit returns false when a handler calls preventDefault()', () => {
    const e = createEmitter<TestMap>()
    e.on('before', (p) => p.preventDefault())
    expect(e.emit('before', makeCancelable({ n: 1 }))).toBe(false)
  })

  it('emit returns true on a cancelable event when nothing cancels', () => {
    const e = createEmitter<TestMap>()
    e.on('before', () => {})
    expect(e.emit('before', makeCancelable({ n: 1 }))).toBe(true)
  })

  it('emit with no handlers returns true', () => {
    expect(createEmitter<TestMap>().emit('ping', { n: 0 })).toBe(true)
  })

  it('clear() removes all handlers', () => {
    const e = createEmitter<TestMap>()
    const fn = vi.fn()
    e.on('ping', fn)
    e.clear()
    e.emit('ping', { n: 1 })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('makeCancelable', () => {
  it('starts not-prevented and flips on preventDefault', () => {
    const p = makeCancelable({ n: 5 })
    expect(p.defaultPrevented).toBe(false)
    expect(p.n).toBe(5)
    p.preventDefault()
    expect(p.defaultPrevented).toBe(true)
  })
})
