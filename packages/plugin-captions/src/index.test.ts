// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captions } from './index'

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  type: 'image',
  source: `${id}.jpg`,
  ...extra,
})
const collection = (): Collection => ({
  groups: [
    {
      id: 'g0',
      items: [
        item('a', { caption: 'Text a', meta: { time: '09:10' } }),
        item('b', { meta: { time: '09:20' } }),
      ],
    },
    { id: 'g1', items: [item('c', { caption: 'Text c' })] },
  ],
})

const $ = (sel: string) => document.querySelector(sel) as HTMLElement
const region = () => $('.gallerist-region-caption')
const bar = () => $('.gallerist-caption')

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('plugin-captions', () => {
  it('renders a node into the caption region and re-renders on navigation', () => {
    const render = vi.fn((it: Item<{ time?: string }>, group, ctx) => {
      const el = document.createElement('strong')
      el.textContent = `${group.id}/${it.id} ${it.meta?.time ?? '-'} @${ctx.cursor.g}.${ctx.cursor.i}`
      return el
    })
    const viewer = createViewer({ collection: collection(), plugins: [captions({ render })] })
    mount(viewer)
    viewer.open()
    expect(region().querySelector('strong')?.textContent).toBe('g0/a 09:10 @0.0')
    expect(bar().hidden).toBe(false)
    expect(bar().hasAttribute('data-gallerist-custom')).toBe(true)
    // the renderer's own text gives way to the region
    expect($('.gallerist-caption-text').textContent).toBe('')

    viewer.nextItem()
    expect(region().textContent).toBe('g0/b 09:20 @0.1')
    viewer.next()
    expect(region().textContent).toBe('g1/c - @1.0')
  })

  it('does not re-render on zoom or pan, only on cursor or collection changes', () => {
    const render = vi.fn(() => 'x')
    const viewer = createViewer({ collection: collection(), plugins: [captions({ render })] })
    mount(viewer)
    viewer.open()
    const calls = render.mock.calls.length
    viewer.zoomTo(2)
    viewer.resetZoom()
    expect(render.mock.calls.length).toBe(calls)

    const next = collection()
    next.groups[0]?.items.push(item('d'))
    viewer.setCollection(next)
    expect(render.mock.calls.length).toBe(calls + 1)
  })

  it('sets a string as text, never as HTML', () => {
    const viewer = createViewer({
      collection: collection(),
      plugins: [captions({ render: () => '<img src=x onerror=alert(1)>' })],
    })
    mount(viewer)
    viewer.open()
    expect(region().querySelector('img')).toBeNull()
    expect(region().textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('falls back to the text caption when render returns null, or to nothing', () => {
    const viewer = createViewer({
      collection: collection(),
      plugins: [captions({ render: (it) => (it.id === 'c' ? 'Custom c' : null) })],
    })
    mount(viewer)
    viewer.open()
    expect(region().textContent).toBe('Text a')
    viewer.nextItem() // b: no text caption
    expect(region().textContent).toBe('')
    expect(bar().hidden).toBe(false) // the band stays, so the stage doesn't jump
    viewer.next()
    expect(region().textContent).toBe('Custom c')
  })

  it('shows the caption bar for a collection without text captions', () => {
    const plain: Collection = { groups: [{ id: 'g', items: [item('x'), item('y')] }] }
    const viewer = createViewer({
      collection: plain,
      plugins: [captions({ render: (it) => `Shot ${it.id}` })],
    })
    mount(viewer)
    viewer.open()
    expect(bar().hidden).toBe(false)
    expect(region().textContent).toBe('Shot x')
  })

  it('keeps the viewer described by the caption (aria-describedby), whatever it renders', () => {
    const viewer = createViewer({
      collection: collection(),
      plugins: [
        captions({
          render: () => {
            const el = document.createElement('span')
            el.textContent = 'Designed'
            return el
          },
        }),
      ],
    })
    mount(viewer)
    viewer.open()
    const root = $('.gallerist')
    const ids = (root.getAttribute('aria-describedby') ?? '').split(' ')
    const text = ids.map((id) => document.getElementById(id)?.textContent ?? '').join('')
    expect(text).toBe('Designed')
  })

  it('refresh() re-renders the current caption', () => {
    let label = 'one'
    const plugin = captions({ render: () => label })
    const viewer = createViewer({ collection: collection(), plugins: [plugin] })
    mount(viewer)
    viewer.open()
    expect(region().textContent).toBe('one')
    label = 'two'
    plugin.refresh()
    expect(region().textContent).toBe('two')
  })

  it('cleans up on dispose: the text caption comes back and render stops', () => {
    const render = vi.fn(() => 'Custom')
    const viewer = createViewer({ collection: collection() })
    mount(viewer)
    viewer.open()
    const dispose = viewer.use(captions({ render }))
    expect(region().textContent).toBe('Custom')
    expect($('.gallerist-caption-text').textContent).toBe('')
    dispose()
    expect(region().childNodes.length).toBe(0)
    expect(bar().hasAttribute('data-gallerist-custom')).toBe(false)
    expect($('.gallerist-caption-text').textContent).toBe('Text a')
    const calls = render.mock.calls.length
    viewer.nextItem()
    expect(render.mock.calls.length).toBe(calls)
    expect($('.gallerist-caption-text').textContent).toBe('')
  })

  it('keeps the node in the placard slot with the item navigator', () => {
    const viewer = createViewer({
      collection: collection(),
      plugins: [captions({ render: () => 'Placard' })],
    })
    mount(viewer, { itemIndicator: 'placard' })
    viewer.open()
    const caption = bar()
    expect(caption.contains(region())).toBe(true)
    expect(caption.querySelector('.gallerist-itemnav')).not.toBeNull()
    expect(region().textContent).toBe('Placard')
  })

  it('works without the built-in controls (headless)', () => {
    const viewer = createViewer({
      collection: collection(),
      plugins: [captions({ render: (it) => it.id })],
    })
    mount(viewer, { controls: false })
    viewer.open()
    expect(bar().hidden).toBe(false)
    expect(region().textContent).toBe('a')
  })

  it('touches no DOM before the renderer mounts its region (server-built viewer)', () => {
    const render = vi.fn(() => 'x')
    const create = vi.spyOn(document, 'createElement')
    const viewer = createViewer({ collection: collection(), plugins: [captions({ render })] })
    viewer.next()
    expect(create).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
    create.mockRestore()
    mount(viewer)
    viewer.open()
    expect(region().textContent).toBe('x')
    expect(render).toHaveBeenCalledTimes(1)
  })
})
