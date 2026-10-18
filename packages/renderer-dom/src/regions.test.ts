// @vitest-environment happy-dom

import { type Collection, type Item, type Plugin, createViewer } from '@gallerist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from './mount'
import { type RegionHosts, aggregateKeymap, createRegionMounter } from './regions'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({ groups: [{ id: 'g0', items: [item('a')] }] })

const hosts = (): RegionHosts =>
  ({
    backdrop: document.createElement('div'),
    stage: document.createElement('div'),
    toolbar: document.createElement('div'),
    thumbnails: document.createElement('div'),
    footer: document.createElement('div'),
  }) as RegionHosts

const node = (text: string) => () => {
  const el = document.createElement('div')
  el.textContent = text
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('createRegionMounter', () => {
  it('additive regions (toolbar) collect nodes from every plugin', () => {
    const h = hosts()
    createRegionMounter(h, { viewer: {} as never })([
      { name: 'a', regions: { toolbar: node('A') } },
      { name: 'b', regions: { toolbar: node('B') } },
    ])
    expect(h.toolbar.textContent).toBe('AB')
  })

  it('exclusive regions (stage) warn and last wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = hosts()
    createRegionMounter(h, { viewer: {} as never })([
      { name: 'a', regions: { stage: node('A') } },
      { name: 'b', regions: { stage: node('B') } },
    ])
    expect(h.stage.textContent).toBe('B')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('is idempotent across re-mounts', () => {
    const h = hosts()
    const plugins = [{ name: 'a', regions: { toolbar: node('A') } }]
    const mountRegions = createRegionMounter(h, { viewer: {} as never })
    mountRegions(plugins)
    mountRegions(plugins)
    expect(h.toolbar.textContent).toBe('A') // not 'AA'
  })

  it('runs each region renderer once per plugin instance (PLUGIN-AUTHORING contract)', () => {
    const h = hosts()
    const render = vi.fn(node('A'))
    const a = { name: 'a', regions: { toolbar: render } }
    const mountRegions = createRegionMounter(h, { viewer: {} as never })
    mountRegions([a])
    mountRegions([a, { name: 'overlay-only' }])
    mountRegions([a])
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('leaves a host untouched when its nodes did not change', () => {
    const h = hosts()
    const a = { name: 'a', regions: { toolbar: node('A') } }
    const mountRegions = createRegionMounter(h, { viewer: {} as never })
    mountRegions([a])
    const replace = vi.spyOn(h.toolbar, 'replaceChildren')
    mountRegions([a, { name: 'overlay-only', overlays: [] }]) // e.g. a React overlay mounting
    expect(replace).not.toHaveBeenCalled()
  })

  it('removes a disposed plugin node and renders a new instance fresh', () => {
    const h = hosts()
    const a = { name: 'a', regions: { toolbar: node('A') } }
    const b = { name: 'b', regions: { toolbar: node('B') } }
    const mountRegions = createRegionMounter(h, { viewer: {} as never })
    mountRegions([a, b])
    mountRegions([a])
    expect(h.toolbar.textContent).toBe('A')
    mountRegions([a, { name: 'b', regions: { toolbar: node('B2') } }])
    expect(h.toolbar.textContent).toBe('AB2')
  })
})

describe('aggregateKeymap', () => {
  it('merges keymaps; later plugins win on conflict', () => {
    const a = () => {}
    const b = () => {}
    const map = aggregateKeymap([
      { name: 'a', keymap: { t: a, x: a } },
      { name: 'b', keymap: { x: b } },
    ])
    expect(map.t).toBe(a)
    expect(map.x).toBe(b)
  })
})

describe('mount — plugin consumption', () => {
  it('mounts a plugin toolbar region into the toolbar host', () => {
    const p: Plugin = () => ({ name: 'tb', regions: { toolbar: node('btn') } })
    const v = createViewer({ collection: collection(), plugins: [p] })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist-region-toolbar')?.textContent).toBe('btn')
  })

  it('a plugin keymap handles its key', () => {
    const hit = vi.fn()
    const p: Plugin = () => ({ name: 'k', keymap: { g: hit } })
    const v = createViewer({ collection: collection(), plugins: [p] })
    mount(v)
    v.open()
    document
      .querySelector('.gallerist')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
    expect(hit).toHaveBeenCalled()
  })

  it('a plugin change elsewhere does not re-run or re-attach a mounted region', () => {
    const render = vi.fn(node('rail'))
    const v = createViewer({
      collection: collection(),
      plugins: [() => ({ name: 'r', regions: { toolbar: render } })],
    })
    mount(v)
    v.open()
    const el = document.querySelector('.gallerist-region-toolbar')?.firstChild
    const dispose = v.use(() => ({ name: 'overlay', overlays: [] })) // React <Gallerist.Overlay> does this
    dispose()
    expect(render).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.gallerist-region-toolbar')?.firstChild).toBe(el)
  })

  it('late use() mounts the new plugin region', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist-region-toolbar')?.textContent).toBe('')
    v.use(() => ({ name: 'late', regions: { toolbar: node('late') } }))
    expect(document.querySelector('.gallerist-region-toolbar')?.textContent).toBe('late')
  })
})
