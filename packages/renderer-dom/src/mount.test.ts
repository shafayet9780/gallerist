// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
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
    expect(document.querySelector('.gallerist')).toBeNull()
    v.open()
    expect(document.querySelector('.gallerist')).not.toBeNull()
  })

  it('open() sets dialog semantics and locks page scroll', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('role')).toBe('dialog')
    expect(root.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('renders the current item and a counter', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('img')).not.toBeNull()
    expect(document.querySelector('.gallerist-counter')?.textContent).toContain('1 / 3')
  })

  it('close() detaches and restores scroll', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    v.close()
    expect(document.querySelector('.gallerist')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('mount — navigation reflects in the DOM', () => {
  it('updates the counter and live region on group nav', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    v.next()
    expect(document.querySelector('.gallerist-counter')?.textContent).toContain('2 / 3')
    expect(document.querySelector('.gallerist-live')?.textContent).toMatch(/group 2 of 3/i)
  })

  it('announces the secondary axis position in grouped items', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 })
    v.nextItem()
    expect(document.querySelector('.gallerist-live')?.textContent).toMatch(/screen 2 of 3/i)
  })
})

describe('mount — chrome + keyboard', () => {
  it('the close button calls viewer.close()', () => {
    const v = createViewer({ collection: collection() })
    const spy = vi.spyOn(v, 'close')
    mount(v)
    v.open()
    ;(document.querySelector('.gallerist-close') as HTMLButtonElement).click()
    expect(spy).toHaveBeenCalled()
  })

  it('next/prev buttons drive the group axis', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    ;(document.querySelector('.gallerist-next') as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    ;(document.querySelector('.gallerist-prev') as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('renders SVG icons (not Unicode glyphs) in every nav button', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    for (const cls of [
      '.gallerist-close',
      '.gallerist-prev',
      '.gallerist-next',
      '.gallerist-item-prev',
      '.gallerist-item-next',
      '.gallerist-zoom-reset',
    ]) {
      const btn = document.querySelector(cls) as HTMLElement
      expect(btn, cls).not.toBeNull()
      expect(btn.querySelector('svg'), cls).not.toBeNull()
      expect(btn.textContent ?? '').toBe('') // no text glyph
    }
  })

  it('defaults the arrow layout to a right-center pill', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-arrows')).toBe(
      'pill-right',
    )
  })

  it('reflects a configured arrow layout on the root', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { arrows: 'corner-br' })
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-arrows')).toBe(
      'corner-br',
    )
  })

  it("the 't' key toggles rail collapse on the root", () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-rail')).toBe('expanded')
    root.dispatchEvent(key({ key: 't' }))
    expect(root.getAttribute('data-gallerist-rail')).toBe('collapsed')
    root.dispatchEvent(key({ key: 't' }))
    expect(root.getAttribute('data-gallerist-rail')).toBe('expanded')
  })

  it('mounts a rail pull-handle inside the rail region; it toggles collapse', () => {
    // a minimal plugin that owns the thumbnails region so the handle attaches
    const railPlugin = () => ({
      name: 'fake-rail',
      regions: { thumbnails: () => document.createElement('div') },
    })
    const v = createViewer({ collection: collection(), plugins: [railPlugin] })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    const btn = document.querySelector(
      '.gallerist-region-thumbnails .gallerist-rail-handle .gallerist-rail-toggle',
    ) as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    btn.click()
    expect(root.getAttribute('data-gallerist-rail')).toBe('collapsed')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not mount a rail handle when no rail is present', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist-rail-handle')).toBeNull()
  })

  it('collapses the rail on entering fullscreen and restores on exit', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: root })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(root.getAttribute('data-gallerist-rail')).toBe('collapsed')
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(root.getAttribute('data-gallerist-rail')).toBe('expanded')
  })

  it('applies a preset: sets data-gallerist-preset and its default arrow layout', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { preset: 'reviewer' })
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-preset')).toBe('reviewer')
    expect(root.getAttribute('data-gallerist-arrows')).toBe('corner-br') // reviewer default
  })

  it('an explicit arrows option overrides the preset default', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { preset: 'reviewer', arrows: 'dpad' })
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-arrows')).toBe('dpad')
  })

  it('shows segmented position pills for small multi-item groups (≤8)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 }) // g1 has 3 items
    const pos = document.querySelector('.gallerist-position') as HTMLElement
    expect(pos.getAttribute('data-mode')).toBe('pills')
    const pills = pos.querySelectorAll('.gallerist-pill')
    expect(pills.length).toBe(3)
    expect(pos.querySelector('.gallerist-pill[data-active]')?.textContent).toBe('1')
    v.nextItem()
    expect(pos.querySelector('.gallerist-pill[data-active]')?.textContent).toBe('2')
    ;(pills[2] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('falls back to a mono counter for large groups (>8)', () => {
    const big: Collection = {
      groups: [{ id: 'g', items: Array.from({ length: 12 }, (_, i) => item(`x${i}`)) }],
    }
    const v = createViewer({ collection: big })
    mount(v)
    v.open()
    const pos = document.querySelector('.gallerist-position') as HTMLElement
    expect(pos.getAttribute('data-mode')).toBe('counter')
    expect(pos.textContent).toContain('1 / 12')
  })

  it('hides the position indicator for single-item groups', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open() // g0 → single item
    expect((document.querySelector('.gallerist-position') as HTMLElement).hidden).toBe(true)
  })

  it('defaults the rail position to bottom', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-rail-pos')).toBe(
      'bottom',
    )
  })

  it('reflects rail:"left" on the root', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { rail: 'left' })
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-rail-pos')).toBe(
      'left',
    )
  })

  it('rail:"hidden" starts collapsed at the bottom', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { rail: 'hidden' })
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-rail-pos')).toBe('bottom')
    expect(root.getAttribute('data-gallerist-rail')).toBe('collapsed')
  })

  it('ArrowRight navigates, Escape closes', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
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
    expect(host.querySelector('.gallerist')).not.toBeNull()
    expect(host.querySelector('.gallerist')?.getAttribute('aria-modal')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('mount — zoom transform', () => {
  it('applies the committed zoom transform to the content layer', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    getInternals(v).setZoom({ scale: 2, x: 10, y: 20 }) // stage unmeasured in happy-dom: unclamped
    const content = document.querySelector(
      '.gallerist-content[data-gallerist-current]',
    ) as HTMLElement
    expect(content.style.transform).toContain('scale(2)')
    expect(content.style.transform).toContain('translate(10px, 20px)')
  })

  describe('zoom bounds (every commit clamped against the stage)', () => {
    const measure = (w: number, h: number) => {
      const stage = document.querySelector('.gallerist-stage') as HTMLElement
      vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(
        () =>
          ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect,
      )
    }

    it('zooming back out to fit re-centres a panned image (keyboard)', () => {
      const v = createViewer({ collection: collection() })
      mount(v)
      v.open()
      measure(1000, 800)
      getInternals(v).setZoom({ scale: 2, x: -1000, y: 0 }) // zoomed and panned to the right edge
      const root = document.querySelector('.gallerist') as HTMLElement
      for (let k = 0; k < 6; k++) root.dispatchEvent(key({ key: '-' }))
      expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
    })

    it('zoomTo clamps scale into [fit, max] and pivots on the stage centre', () => {
      const v = createViewer({ collection: collection() })
      mount(v)
      v.open()
      measure(1000, 800)
      v.zoomTo(10)
      expect(v.getState().zoom).toEqual({ scale: 4, x: -1500, y: -1200 }) // centre fixed: 500 = 500·4 + x
      v.zoomTo(0.2)
      expect(v.getState().zoom).toEqual({ scale: 1, x: 0, y: 0 })
    })

    it('a pan past the edge is clamped on commit', () => {
      const v = createViewer({ collection: collection() })
      mount(v)
      v.open()
      measure(1000, 800)
      getInternals(v).setZoom({ scale: 2, x: 400, y: -5000 })
      expect(v.getState().zoom).toEqual({ scale: 2, x: 0, y: -800 })
    })

    it('stops clamping once the renderer is destroyed', () => {
      const v = createViewer({ collection: collection() })
      const h = mount(v)
      v.open()
      measure(1000, 800)
      h.destroy()
      v.zoomTo(10)
      expect(v.getState().zoom.scale).toBe(10)
    })
  })
})

describe('mount — motion axis', () => {
  const current = () => document.querySelector('.gallerist-slide[data-gallerist-current]')
  it('tags the current slide with the axis of motion (group vs item)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 })
    v.next() // group axis
    expect(current()?.getAttribute('data-gallerist-enter')).toBe('group')
    v.prev()
    v.open({ g: 1 })
    v.nextItem() // item axis
    expect(current()?.getAttribute('data-gallerist-enter')).toBe('item')
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

describe('mount — load lifecycle', () => {
  // An adapter whose load never settles on its own: it rejects only when aborted, or on fail().
  const pendingAdapter = (failures: Map<string, (e: unknown) => void>) => ({
    type: 'image',
    mount: (it: Item, slot: HTMLElement, ctx: { signal: AbortSignal }) => {
      const img = document.createElement('img')
      slot.appendChild(img)
      const ready = new Promise<void>((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () =>
          reject(new DOMException('Image load aborted', 'AbortError')),
        )
        failures.set(it.id, reject)
      })
      return {
        element: img,
        ready,
        supportsZoom: true,
        naturalSize: () => null,
        destroy: () => img.remove(),
      }
    },
  })
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('a load cancelled by navigation is not reported as loadError', async () => {
    const loadError = vi.fn()
    const v = createViewer({ collection: collection(), on: { loadError } })
    mount(v, { adapters: [pendingAdapter(new Map())] })
    v.open({ g: 1 })
    v.nextItem() // swaps b0 → b1: b0's in-flight load is aborted
    v.next() // g1 → g2 and further: tears slides down mid-load
    v.next()
    await flush()
    expect(loadError).not.toHaveBeenCalled()
    expect(Object.values(v.getState().loaded)).not.toContain('error')
  })

  it('a genuine load failure still emits loadError and marks the item error', async () => {
    const loadError = vi.fn()
    const failures = new Map<string, (e: unknown) => void>()
    const v = createViewer({ collection: collection(), on: { loadError } })
    mount(v, { adapters: [pendingAdapter(failures)] })
    v.open()
    const boom = new Error('404')
    failures.get('a0')?.(boom)
    await flush()
    expect(loadError).toHaveBeenCalledTimes(1)
    expect(loadError.mock.calls[0]?.[0]).toMatchObject({ id: 'a0', error: boom })
    expect(v.getState().loaded.a0).toBe('error')
  })
})

describe('mount — destroy', () => {
  it('removes the root and stops reacting', () => {
    const v = createViewer({ collection: collection() })
    const handle = mount(v)
    v.open()
    handle.destroy()
    expect(document.querySelector('.gallerist')).toBeNull()
  })
})

describe('mount — linear flat traversal', () => {
  // flat order over collection(): a0 (g0i0), b0 b1 b2 (g1), c0 c1 (g2) = 6 items
  const openLinear = (loop = false) => {
    const v = createViewer({ collection: collection(), loop })
    mount(v, { linear: true, loop })
    v.open()
    return v
  }
  const press = (k: string) =>
    (document.querySelector('.gallerist') as HTMLElement).dispatchEvent(key({ key: k }))

  it('sets data-gallerist-linear and hides the within-group pills', () => {
    openLinear()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-linear')).toBe('true')
    expect((document.querySelector('.gallerist-position') as HTMLElement)?.hidden).toBe(true)
  })

  it('ArrowRight walks the flattened item sequence across groups (1a,1b,2a…)', () => {
    const v = openLinear()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 }) // a0
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 }) // b0 — rolls into the next group
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 }) // b1 — next ITEM, not next group
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 }) // b2
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 }) // c0
  })

  it('ArrowLeft walks backward across the group boundary into the previous item', () => {
    const v = openLinear()
    v.goTo(2, 0) // c0
    press('ArrowLeft')
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 }) // back into g1's LAST item
  })

  it('the counter shows the running item position / total', () => {
    const v = openLinear()
    v.goTo(1, 1) // b1 = flat index 2 of 6
    expect(document.querySelector('.gallerist-counter')?.textContent).toContain('3 / 6')
  })

  it('ArrowUp/ArrowDown are inert (the item axis retires)', () => {
    const v = openLinear()
    v.goTo(1, 1)
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    press('ArrowUp')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })

  it('wraps at the ends when loop is set', () => {
    const v = openLinear(true)
    v.goTo(2, 1) // c1 = last
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 }) // wrap to first
    press('ArrowLeft')
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 }) // wrap back to last
  })

  it('clamps at the ends without loop', () => {
    const v = openLinear(false)
    v.goTo(2, 1)
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 }) // stays put
  })

  it('nested mode (default) keeps the two-axis behavior (ArrowRight = next group)', () => {
    const v = createViewer({ collection: collection() })
    mount(v) // no linear
    v.open()
    expect(document.querySelector('.gallerist')?.hasAttribute('data-gallerist-linear')).toBe(false)
    v.goTo(1, 0)
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 }) // group axis, skips g1's remaining items
  })
})

describe('mount — vertical rail (left/right) axis remap', () => {
  const openV = (rail: 'left' | 'right') => {
    const v = createViewer({ collection: collection() })
    mount(v, { rail })
    v.open()
    return v
  }
  const press = (k: string) =>
    (document.querySelector('.gallerist') as HTMLElement).dispatchEvent(key({ key: k }))

  it('sets data-gallerist-rail-pos and orientation=vertical', () => {
    openV('right')
    const root = document.querySelector('.gallerist')
    expect(root?.getAttribute('data-gallerist-rail-pos')).toBe('right')
    expect(root?.getAttribute('data-gallerist-orientation')).toBe('vertical')
  })

  it('↑/↓ drive the group axis and ←/→ drive the item axis', () => {
    const v = openV('left')
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
    press('ArrowDown') // next GROUP (was ArrowRight in horizontal)
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    press('ArrowRight') // next ITEM
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    press('ArrowLeft') // prev ITEM
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    press('ArrowDown') // next GROUP
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    press('ArrowUp') // prev GROUP
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
  })

  it('horizontal rail keeps the classic mapping (orientation=horizontal)', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { rail: 'bottom' })
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-orientation')).toBe(
      'horizontal',
    )
    v.goTo(1, 0)
    press('ArrowRight') // group axis in horizontal → next group
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
  })

  it('collapses/expands a vertical rail with the t key (slide direction is CSS)', () => {
    openV('left')
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-rail')).toBe('expanded')
    press('t')
    expect(root.getAttribute('data-gallerist-rail')).toBe('collapsed')
    press('t')
    expect(root.getAttribute('data-gallerist-rail')).toBe('expanded')
  })

  it('vertical + linear: ↑/↓ walk the flattened sequence, ←/→ stay inert', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { rail: 'left', linear: true })
    v.open()
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
    press('ArrowDown') // primary (vertical) axis → linear step
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 }) // crosses into the next item linearly
    press('ArrowRight') // item axis retired in linear → inert
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })
})

describe('mount — stacked overlays scroll-lock (S-R2)', () => {
  it('keeps the page locked until the last overlay closes, then restores the original', () => {
    document.body.style.overflow = 'scroll' // a pre-existing value that must come back
    const a = createViewer({ collection: collection() })
    mount(a)
    a.open()
    const b = createViewer({ collection: collection() })
    mount(b)
    b.open()
    expect(document.body.style.overflow).toBe('hidden')
    a.close()
    expect(document.body.style.overflow).toBe('hidden') // b still open → stays locked
    b.close()
    expect(document.body.style.overflow).toBe('scroll') // last one closed → original restored
  })
})

describe('mount — linear Home/End (S-R3)', () => {
  it('End jumps to the true last flat item, not the last group head', () => {
    const v = createViewer({ collection: collection() }) // last flat item is g2/i1 (c1)
    mount(v, { linear: true })
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    root.dispatchEvent(key({ key: 'End' }))
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 })
    root.dispatchEvent(key({ key: 'Home' }))
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })
})

describe('mount — resize re-clamp (C2)', () => {
  it('re-clamps committed zoom when the stage shrinks', () => {
    let roCb: () => void = () => {}
    class FakeRO {
      constructor(cb: () => void) {
        roCb = cb
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeRO)
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      cb()
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    try {
      const v = createViewer({ collection: collection() })
      const h = mount(v)
      v.open()
      const stage = document.querySelector('.gallerist-stage') as HTMLElement
      let w = 1000
      vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            width: w,
            height: 800,
            left: 0,
            top: 0,
            right: w,
            bottom: 800,
            x: 0,
            y: 0,
          }) as DOMRect,
      )
      getInternals(v).setZoom({ scale: 2, x: -1000, y: 0 }) // valid: the right edge of a 1000px stage
      expect(v.getState().zoom.x).toBe(-1000)
      w = 300 // stage shrinks: the content is now 600px wide, so x must lie in [-300, 0]
      roCb() // ResizeObserver fires
      expect(v.getState().zoom.x).toBe(-300) // re-clamped to the new edge
      h.destroy()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('mount — modal accessibility (WS-3)', () => {
  it('gives the overlay dialog an accessible name (I-UX1)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('aria-label')).toBe('Media viewer')
  })

  it('inerts the rest of the page while open and restores on close (C5)', () => {
    const sibling = document.createElement('div')
    document.body.appendChild(sibling)
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(sibling.hasAttribute('inert')).toBe(true)
    v.close()
    expect(sibling.hasAttribute('inert')).toBe(false)
  })

  it('does not hijack shortcut keys while typing in an overlay control (I-UX2)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    const input = document.createElement('input')
    root.appendChild(input)
    input.focus()
    input.dispatchEvent(key({ key: 't' })) // would toggle the rail if not guarded
    expect(root.getAttribute('data-gallerist-rail')).toBe('expanded')
    input.dispatchEvent(key({ key: 'Escape' })) // Escape still closes from a field
    expect(v.getState().phase).toBe('closed')
  })

  it('announces the current item description in the live region (S-UX4)', () => {
    const v = createViewer({ collection: collection() }) // items carry alt = id
    mount(v)
    v.open({ g: 1 }) // b0
    expect(document.querySelector('.gallerist-live')?.textContent).toContain('b0')
  })

  it('flips the horizontal arrow keys in an RTL document (S-UX3)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    root.setAttribute('dir', 'rtl')
    root.dispatchEvent(key({ key: 'ArrowLeft' })) // RTL: left advances
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    root.dispatchEvent(key({ key: 'ArrowRight' })) // RTL: right retreats
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
  })
})

describe('mount — degenerate collections (#61)', () => {
  it('opens an empty collection without throwing and renders no media', () => {
    const v = createViewer({ items: [] })
    expect(() => {
      mount(v)
      v.open()
    }).not.toThrow()
    expect(document.querySelector('.gallerist')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })
})
