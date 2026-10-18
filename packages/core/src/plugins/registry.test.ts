import { describe, expect, it, vi } from 'vitest'
import { createViewer } from '../controller/createViewer'
import { getInternals } from '../controller/internals'
import type { Item } from '../types'
import type { Plugin } from './types'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const base = () => ({ items: [item('a'), item('b')] })

describe('plugin registry (spec §13)', () => {
  it('instantiates plugins with the viewer and runs init()', () => {
    const init = vi.fn()
    const factory: Plugin = (viewer) => {
      expect(viewer).toBeDefined()
      return { name: 'p', init }
    }
    createViewer({ ...base(), plugins: [factory] })
    expect(init).toHaveBeenCalledOnce()
  })

  it('getPlugins() returns a copy — mutating it does not affect the registry', () => {
    const p: Plugin = () => ({ name: 'p' })
    const v = createViewer({ ...base(), plugins: [p] })
    const list = getInternals(v).getPlugins() as unknown as unknown[]
    list.length = 0 // attempt to mutate the returned array
    expect(getInternals(v).getPlugins()).toHaveLength(1)
  })

  it('wires plugin on-handlers (fire on emitted events)', () => {
    const onOpen = vi.fn()
    const p: Plugin = () => ({ name: 'p', on: { open: onOpen } })
    const v = createViewer({ ...base(), plugins: [p] })
    v.open()
    expect(onOpen).toHaveBeenCalled()
  })

  it('a plugin on.init handler sees the init event', () => {
    const onInit = vi.fn()
    const p: Plugin = () => ({ name: 'p', on: { init: onInit } })
    createViewer({ ...base(), plugins: [p] })
    expect(onInit).toHaveBeenCalledOnce()
  })

  it('exposes registered instances via getPlugins()', () => {
    const p: Plugin = () => ({ name: 'thumbs', keymap: { t: () => {} } })
    const v = createViewer({ ...base(), plugins: [p] })
    expect(
      getInternals(v)
        .getPlugins()
        .map((i) => i.name),
    ).toEqual(['thumbs'])
    expect(getInternals(v).getPlugins()[0]?.keymap?.t).toBeTypeOf('function')
  })

  it('use() registers late and notifies onPluginsChanged', () => {
    const v = createViewer(base())
    const changed = vi.fn()
    getInternals(v).onPluginsChanged(changed)
    const init = vi.fn()
    v.use(() => ({ name: 'late', init }))
    expect(init).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledOnce()
    expect(
      getInternals(v)
        .getPlugins()
        .map((i) => i.name),
    ).toEqual(['late'])
  })

  it('onPluginsChanged unsubscribe stops notifications', () => {
    const v = createViewer(base())
    const changed = vi.fn()
    const off = getInternals(v).onPluginsChanged(changed)
    off()
    v.use(() => ({ name: 'x' }))
    expect(changed).not.toHaveBeenCalled()
  })

  it('use() returns a disposer that unregisters, runs destroy, and notifies', () => {
    const destroy = vi.fn()
    const changed = vi.fn()
    const v = createViewer(base())
    getInternals(v).onPluginsChanged(changed)
    const off = v.use(() => ({ name: 'temp', destroy }))
    expect(
      getInternals(v)
        .getPlugins()
        .map((i) => i.name),
    ).toEqual(['temp'])
    changed.mockClear()
    off()
    expect(destroy).toHaveBeenCalledOnce()
    expect(getInternals(v).getPlugins()).toHaveLength(0)
    expect(changed).toHaveBeenCalledOnce()
  })

  it('destroy() runs each plugin destroy() in reverse order', () => {
    const calls: string[] = []
    const mk =
      (name: string): Plugin =>
      () => ({ name, destroy: () => calls.push(name) })
    const v = createViewer({ ...base(), plugins: [mk('a'), mk('b')] })
    v.destroy()
    expect(calls).toEqual(['b', 'a'])
  })

  it('collects extension points (overlays / mediaAdapters) on the instance', () => {
    const p: Plugin = () => ({
      name: 'ext',
      overlays: [{ id: 'o', anchor: { kind: 'viewport', at: 'top' }, render: () => 'x' }],
      mediaAdapters: [
        {
          type: 'video',
          mount: () => ({
            element: null as never,
            ready: Promise.resolve(),
            supportsZoom: false,
            destroy() {},
          }),
        },
      ],
    })
    const v = createViewer({ ...base(), plugins: [p] })
    const inst = getInternals(v).getPlugins()[0]
    expect(inst?.overlays).toHaveLength(1)
    expect(inst?.mediaAdapters?.[0]?.type).toBe('video')
  })
})

describe('the overlays option', () => {
  it('registers global overlays where the renderer collects them', () => {
    const spec = {
      id: 'wm',
      anchor: { kind: 'viewport' as const, at: 'top-right' as const },
      render: () => 'x',
    }
    const v = createViewer({ items: [item('a')], overlays: [spec] })
    const all = getInternals(v)
      .getPlugins()
      .flatMap((p) => (Array.isArray(p.overlays) ? p.overlays : []))
    expect(all).toEqual([spec])
  })

  it('registers nothing when there are no overlays', () => {
    expect(getInternals(createViewer({ items: [item('a')] })).getPlugins()).toHaveLength(0)
    expect(
      getInternals(createViewer({ items: [item('a')], overlays: [] })).getPlugins(),
    ).toHaveLength(0)
  })
})
