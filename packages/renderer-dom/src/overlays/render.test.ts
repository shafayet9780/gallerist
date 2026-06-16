// @vitest-environment happy-dom

import type { Group, Item, OverlaySpec, ViewerApi } from '@visora/core'
import { describe, expect, it, vi } from 'vitest'
import { gatherOverlays, paintOverlays, updateOverlays } from './render'

const group: Group = { id: 'g', items: [] }
const item: Item = { id: 'i', type: 'image', source: 'x.jpg' }

const fakeViewer = () =>
  ({
    emit: vi.fn(),
    getState: () => ({ cursor: { g: 0, i: 0 } }),
  }) as unknown as ViewerApi

const ctx = (viewer: ViewerApi, scale = 2) => ({
  group,
  item,
  viewer,
  zoom: { scale, x: 0, y: 0 },
  stage: { w: 1000, h: 800 },
  natural: { w: 2000, h: 1000 }, // contain → 1000x500 @ (0,150)
})

const paint = (specs: OverlaySpec[], viewer = fakeViewer(), scale = 2) => {
  const vp = document.createElement('div')
  const content = document.createElement('div')
  const entries = paintOverlays(vp, content, specs, ctx(viewer, scale))
  return { vp, content, viewer, entries }
}

describe('gatherOverlays', () => {
  it('merges globals, group, and item overlays', () => {
    const o = (id: string): OverlaySpec => ({
      id,
      anchor: { kind: 'viewport', at: 'top' },
      render: () => id,
    })
    const g: Group = { id: 'g', items: [], overlays: [o('grp')] }
    const i: Item = { id: 'i', type: 'image', source: 'x', overlays: [o('itm')] }
    expect(gatherOverlays(g, i, [o('glob')]).map((s) => s.id)).toEqual(['glob', 'grp', 'itm'])
  })
})

describe('paintOverlays — viewport layer', () => {
  it('places a viewport overlay with anchor styles and renders a string', () => {
    const { vp } = paint([
      {
        id: 'badge',
        anchor: { kind: 'viewport', at: 'top-left', offset: [10, 12] },
        render: () => '95%',
      },
    ])
    const el = vp.querySelector('[data-overlay="badge"]') as HTMLElement
    expect(el.textContent).toBe('95%')
    expect(el.style.top).toBe('12px')
    expect(el.style.left).toBe('10px')
    expect(el.style.pointerEvents).toBe('none')
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('paintOverlays — content layer', () => {
  it('counter-scales a point overlay (constant screen size)', () => {
    const { content } = paint([
      { id: 'pin', anchor: { kind: 'point', x: 0.5, y: 0.5 }, render: () => '•' },
    ])
    const el = content.querySelector('[data-overlay="pin"]') as HTMLElement
    expect(el.style.left).toBe('500px')
    expect(el.style.top).toBe('400px')
    expect(el.style.transform).toContain('scale(0.5)') // 1 / zoom(2)
  })

  it('sizes a region overlay and lets it scale with the image (no counter-scale)', () => {
    const { content } = paint([
      { id: 'box', anchor: { kind: 'region', x: 0, y: 0, w: 1, h: 1 }, render: () => '' },
    ])
    const el = content.querySelector('[data-overlay="box"]') as HTMLElement
    expect(el.style.width).toBe('1000px')
    expect(el.style.height).toBe('500px')
    expect(el.style.transform).toBe('')
  })
})

describe('paintOverlays — interactive + visibility', () => {
  it('an interactive overlay is focusable and emits overlayClick', () => {
    const viewer = fakeViewer()
    const { vp } = paint(
      [
        {
          id: 'btn',
          anchor: { kind: 'viewport', at: 'center' },
          interactive: true,
          render: () => 'x',
        },
      ],
      viewer,
    )
    const el = vp.querySelector('[data-overlay="btn"]') as HTMLElement
    expect(el.style.pointerEvents).toBe('auto')
    expect(el.tabIndex).toBe(0)
    el.click()
    expect(viewer.emit).toHaveBeenCalledWith('overlayClick', expect.objectContaining({ id: 'btn' }))
  })

  it('hides an overlay outside its visibleAt range', () => {
    const { content } = paint(
      [{ id: 'h', anchor: { kind: 'point', x: 0, y: 0 }, visibleAt: [3, 5], render: () => 'h' }],
      fakeViewer(),
      2, // zoom 2 is outside [3,5]
    )
    expect((content.querySelector('[data-overlay="h"]') as HTMLElement).style.display).toBe('none')
  })

  it('updateOverlays re-counter-scales a point on zoom WITHOUT re-invoking render()', () => {
    const renderFn = vi.fn(() => '•')
    const { content, entries } = paint(
      [{ id: 'pin', anchor: { kind: 'point', x: 0.5, y: 0.5 }, render: renderFn }],
      fakeViewer(),
      2,
    )
    const el = content.querySelector('[data-overlay="pin"]') as HTMLElement
    expect(renderFn).toHaveBeenCalledTimes(1)
    expect(el.style.transform).toContain('scale(0.5)')

    updateOverlays(entries, 4) // zoom 2 → 4
    expect(renderFn).toHaveBeenCalledTimes(1) // not rebuilt
    expect(el.style.transform).toContain('scale(0.25)')
  })

  it('updateOverlays toggles visibleAt visibility on zoom change', () => {
    const { content, entries } = paint(
      [{ id: 'h', anchor: { kind: 'point', x: 0, y: 0 }, visibleAt: [3, 5], render: () => 'h' }],
      fakeViewer(),
      2, // hidden at zoom 2
    )
    const el = content.querySelector('[data-overlay="h"]') as HTMLElement
    expect(el.style.display).toBe('none')
    updateOverlays(entries, 4) // now within [3,5]
    expect(el.style.display).toBe('')
  })

  it('orders overlays by layer (z-index)', () => {
    const { vp } = paint([
      { id: 'a', anchor: { kind: 'viewport', at: 'top' }, layer: 5, render: () => 'a' },
      { id: 'b', anchor: { kind: 'viewport', at: 'top' }, layer: 1, render: () => 'b' },
    ])
    const ids = [...vp.children].map((c) => (c as HTMLElement).dataset.overlay)
    expect(ids).toEqual(['b', 'a']) // sorted ascending by layer
  })
})
