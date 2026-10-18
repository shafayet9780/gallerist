// @vitest-environment happy-dom

import { type Collection, type Item, type Plugin, createViewer } from '@gallerist/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from './mount'
import { type RegionHosts, aggregateKeymap, mountPluginRegions } from './regions'

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

describe('mountPluginRegions', () => {
  it('additive regions (toolbar) collect nodes from every plugin', () => {
    const h = hosts()
    mountPluginRegions(
      h,
      [
        { name: 'a', regions: { toolbar: node('A') } },
        { name: 'b', regions: { toolbar: node('B') } },
      ],
      { viewer: {} as never },
    )
    expect(h.toolbar.textContent).toBe('AB')
  })

  it('exclusive regions (stage) warn and last wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = hosts()
    mountPluginRegions(
      h,
      [
        { name: 'a', regions: { stage: node('A') } },
        { name: 'b', regions: { stage: node('B') } },
      ],
      { viewer: {} as never },
    )
    expect(h.stage.textContent).toBe('B')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('clears hosts on re-mount (idempotent)', () => {
    const h = hosts()
    const plugins = [{ name: 'a', regions: { toolbar: node('A') } }]
    mountPluginRegions(h, plugins, { viewer: {} as never })
    mountPluginRegions(h, plugins, { viewer: {} as never })
    expect(h.toolbar.textContent).toBe('A') // not 'AA'
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

  it('late use() mounts the new plugin region', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist-region-toolbar')?.textContent).toBe('')
    v.use(() => ({ name: 'late', regions: { toolbar: node('late') } }))
    expect(document.querySelector('.gallerist-region-toolbar')?.textContent).toBe('late')
  })
})
