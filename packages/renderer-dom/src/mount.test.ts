// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from './mount'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg`, alt: id })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1'), item('b2')] },
    { id: 'g2', items: [item('c0'), item('c1')] },
  ],
})

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.removeProperty('overflow')
})

const key = (e: Partial<KeyboardEvent>) => new KeyboardEvent('keydown', { bubbles: true, ...e })

describe('mount — overlay lifecycle', () => {
  it('does not attach to the DOM until open()', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    expect(document.querySelector('.visora')).toBeNull()
    v.open()
    expect(document.querySelector('.visora')).not.toBeNull()
  })

  it('open() sets dialog semantics and locks page scroll', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.visora') as HTMLElement
    expect(root.getAttribute('role')).toBe('dialog')
    expect(root.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('renders the current item and a counter', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('img')).not.toBeNull()
    expect(document.querySelector('.visora-counter')?.textContent).toContain('1 / 3')
  })

  it('close() detaches and restores scroll', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    v.close()
    expect(document.querySelector('.visora')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('mount — navigation reflects in the DOM', () => {
  it('updates the counter and live region on group nav', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    v.next()
    expect(document.querySelector('.visora-counter')?.textContent).toContain('2 / 3')
    expect(document.querySelector('.visora-live')?.textContent).toMatch(/group 2 of 3/i)
  })

  it('announces the secondary axis position in grouped items', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 })
    v.nextItem()
    expect(document.querySelector('.visora-live')?.textContent).toMatch(/screen 2 of 3/i)
  })
})

describe('mount — chrome + keyboard', () => {
  it('the close button calls viewer.close()', () => {
    const v = createViewer({ collection: collection() })
    const spy = vi.spyOn(v, 'close')
    mount(v)
    v.open()
    ;(document.querySelector('.visora-close') as HTMLButtonElement).click()
    expect(spy).toHaveBeenCalled()
  })

  it('next/prev buttons drive the group axis', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    ;(document.querySelector('.visora-next') as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    ;(document.querySelector('.visora-prev') as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('renders SVG icons (not Unicode glyphs) in every nav button', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    for (const cls of [
      '.visora-close',
      '.visora-prev',
      '.visora-next',
      '.visora-item-prev',
      '.visora-item-next',
      '.visora-zoom-reset',
    ]) {
      const btn = document.querySelector(cls) as HTMLElement
      expect(btn, cls).not.toBeNull()
      expect(btn.querySelector('svg'), cls).not.toBeNull()
      expect(btn.textContent ?? '').toBe('') // no text glyph
    }
  })

  it('ArrowRight navigates, Escape closes', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.visora') as HTMLElement
    root.dispatchEvent(key({ key: 'ArrowRight' }))
    expect(v.getState().cursor.g).toBe(1)
    root.dispatchEvent(key({ key: 'Escape' }))
    expect(v.getState().phase).toBe('closed')
  })
})

describe('mount — inline mode', () => {
  it('renders into a provided container without dialog semantics', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const v = createViewer({ collection: collection() })
    mount(v, { container: host })
    v.open()
    expect(host.querySelector('.visora')).not.toBeNull()
    expect(host.querySelector('.visora')?.getAttribute('aria-modal')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('mount — zoom transform', () => {
  it('applies the committed zoom transform to the content layer', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    v.zoomTo(2, { x: 10, y: 20 })
    const content = document.querySelector('.visora-content[data-visora-current]') as HTMLElement
    expect(content.style.transform).toContain('scale(2)')
    expect(content.style.transform).toContain('translate(10px, 20px)')
  })
})

describe('mount — motion axis', () => {
  const current = () => document.querySelector('.visora-slide[data-visora-current]')
  it('tags the current slide with the axis of motion (group vs item)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 })
    v.next() // group axis
    expect(current()?.getAttribute('data-visora-enter')).toBe('group')
    v.prev()
    v.open({ g: 1 })
    v.nextItem() // item axis
    expect(current()?.getAttribute('data-visora-enter')).toBe('item')
  })
})

describe('mount — late mediaAdapters via use()', () => {
  it('an adapter registered after mount() can mount a matching item', () => {
    const col: Collection = {
      groups: [
        {
          id: 'g',
          items: [
            { id: 'vid', type: 'video', source: 'v.mp4' },
            { id: 'img', type: 'image', source: 'a.jpg' },
          ],
        },
      ],
    }
    const v = createViewer({ collection: col })
    mount(v)
    // register a video adapter AFTER mount — adapters must be resolved live, like overlays
    v.use(() => ({
      name: 'late-video',
      mediaAdapters: [
        {
          type: 'video',
          match: (it: Item) => it.type === 'video',
          mount: (_it: Item, slot: HTMLElement) => {
            const elv = document.createElement('video')
            elv.className = 'late-marker'
            slot.appendChild(elv)
            return {
              element: elv,
              ready: Promise.resolve(),
              supportsZoom: false,
              naturalSize: () => null,
              destroy: () => elv.remove(),
            }
          },
        },
      ],
    }))
    v.open() // current item is the video → late adapter must be selected
    expect(document.querySelector('video.late-marker')).not.toBeNull()
  })
})

describe('mount — destroy', () => {
  it('removes the root and stops reacting', () => {
    const v = createViewer({ collection: collection() })
    const handle = mount(v)
    v.open()
    handle.destroy()
    expect(document.querySelector('.visora')).toBeNull()
  })
})
