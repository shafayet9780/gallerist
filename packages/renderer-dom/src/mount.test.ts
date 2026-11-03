// @vitest-environment happy-dom

import { type Collection, type Group, type Item, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAppearance } from './appearance'
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
    expect(document.querySelector('.gallerist-live')?.textContent).toMatch(/item 2 of 3/i)
    expect(document.querySelector('.gallerist-live')?.textContent).not.toMatch(/screen/i) // generic wording
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

  it('hides the whole item navigator (↑ · position · ↓) for single-item groups', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open() // g0 → single item
    const itemNav = document.querySelector('.gallerist-itemnav') as HTMLElement
    expect(itemNav.hidden).toBe(true)
    expect(itemNav.querySelector('.gallerist-item-prev')).not.toBeNull() // ↑/↓ live inside it
    v.next() // g1 → three items
    expect(itemNav.hidden).toBe(false)
    expect(document.querySelector('.gallerist-position-text')?.textContent).toBe('1 / 3')
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

    it('viewer.refresh() re-measures and re-clamps after a layout change', () => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0)
        return 1
      })
      try {
        const v = createViewer({ collection: collection() })
        mount(v)
        v.open()
        measure(1000, 800)
        getInternals(v).setZoom({ scale: 2, x: -1000, y: 0 })
        measure(300, 800) // the container shrank without a resize notification
        v.refresh()
        expect(v.getState().zoom.x).toBe(-300)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('a zoomed portrait pans only as far as its painted edges, not into the letterbox', () => {
      const portrait = (id: string) => ({ ...item(id), naturalSize: { w: 500, h: 1000 } })
      const v = createViewer({ collection: { groups: [{ id: 'p', items: [portrait('p0')] }] } })
      mount(v)
      v.open()
      measure(1000, 800) // painted box: 400×800 at x 300
      getInternals(v).setZoom({ scale: 2, x: -1000, y: 0 }) // still narrower than the stage
      expect(v.getState().zoom.x).toBe(-500) // centred
      getInternals(v).setZoom({ scale: 4, x: 0, y: 0 }) // dragged right, past the image's left edge
      expect(v.getState().zoom.x).toBe(-1200) // the image's left edge stops at the stage's
    })

    it('clamps the scale even before the stage is laid out', () => {
      const v = createViewer({ collection: collection() })
      mount(v)
      v.open() // happy-dom: the stage measures 0×0
      v.zoomTo(50)
      expect(v.getState().zoom.scale).toBe(4)
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

describe('mount — zoom navigator (M18)', () => {
  const measure = (w: number, h: number) => {
    const stage = document.querySelector('.gallerist-stage') as HTMLElement
    vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(
      () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect,
    )
  }
  const sized = (): Collection => ({
    groups: [{ id: 'g', items: [{ ...item('a'), naturalSize: { w: 1000, h: 800 } }] }],
  })
  const nav = () => document.querySelector('.gallerist-navigator') as HTMLElement | null

  it('is off by default and on with the option or the reviewer preset', () => {
    mount(createViewer({ collection: sized() }))
    expect(nav()).toBeNull()
    document.body.innerHTML = ''
    const v = createViewer({ collection: sized() })
    mount(v, { preset: 'reviewer' })
    v.open()
    expect(nav()).not.toBeNull()
  })

  it('shows only while zoomed in, with a view box for the visible part', () => {
    const v = createViewer({ collection: sized() })
    mount(v, { navigator: true })
    v.open()
    measure(1000, 800)
    expect(nav()?.hidden).toBe(true)
    getInternals(v).setZoom({ scale: 2, x: -500, y: -400 }) // the centre quarter is visible
    expect(nav()?.hidden).toBe(false)
    const view = nav()?.querySelector('.gallerist-navigator-view') as HTMLElement
    expect([view.style.left, view.style.top, view.style.width, view.style.height]).toEqual([
      '25%',
      '25%',
      '50%',
      '50%',
    ])
    expect(nav()?.getAttribute('aria-hidden')).toBe('true')
    v.resetZoom()
    expect(nav()?.hidden).toBe(true)
  })

  it('keeps no minimap for media that cannot zoom, and ignores secondary buttons', () => {
    const v = createViewer({ collection: sized() })
    mount(v, {
      navigator: true,
      adapters: [
        {
          type: 'image',
          mount: (_it, slot) => {
            const node = document.createElement('video')
            node.className = 'gallerist-media'
            slot.appendChild(node)
            return {
              element: node,
              ready: Promise.resolve(),
              naturalSize: () => ({ w: 1000, h: 800 }),
              supportsZoom: false,
              destroy: () => node.remove(),
            }
          },
        },
      ],
    })
    v.open()
    measure(1000, 800)
    getInternals(v).setZoom({ scale: 2, x: -500, y: -400 })
    expect(nav()?.hidden).toBe(true)
  })

  it('a right-button press on the minimap does not pan', () => {
    const v = createViewer({ collection: sized() })
    mount(v, { navigator: true })
    v.open()
    measure(1000, 800)
    getInternals(v).setZoom({ scale: 2, x: -500, y: -400 })
    const n = nav() as HTMLElement
    vi.spyOn(n, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 80,
    } as DOMRect)
    n.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 2, clientX: 25, clientY: 20 }),
    )
    expect(v.getState().zoom).toEqual({ scale: 2, x: -500, y: -400 })
  })

  it('pointing at the minimap centres the view there', () => {
    const v = createViewer({ collection: sized() })
    mount(v, { navigator: true })
    v.open()
    measure(1000, 800)
    getInternals(v).setZoom({ scale: 2, x: -500, y: -400 })
    const n = nav() as HTMLElement
    vi.spyOn(n, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 80,
    } as DOMRect)
    n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 25, clientY: 20 }))
    // the top-left quarter's centre (250, 200) at 2× is centred: x = 500 - 500, y = 400 - 400
    expect(v.getState().zoom).toEqual({ scale: 2, x: 0, y: 0 })
  })
})

describe('mount — editorial: frame and placard (M19)', () => {
  const measure = (w: number, h: number) => {
    const stage = document.querySelector('.gallerist-stage') as HTMLElement
    vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(
      () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect,
    )
  }
  const sized = (): Collection => ({
    groups: [
      {
        id: 'g',
        items: [
          { ...item('a'), naturalSize: { w: 1000, h: 500 }, caption: 'Above the Inversion' },
          { ...item('b'), naturalSize: { w: 1000, h: 500 } },
        ],
      },
    ],
  })
  const current = () =>
    document.querySelector('.gallerist-content[data-gallerist-current]') as HTMLElement

  it('the editorial preset frames media and puts the item navigator in a placard', () => {
    const v = createViewer({ collection: sized() })
    mount(v, { preset: 'editorial' })
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.hasAttribute('data-gallerist-frame')).toBe(true)
    expect(root.getAttribute('data-gallerist-indicator')).toBe('placard')
    const caption = document.querySelector('.gallerist-caption') as HTMLElement
    expect(caption.hidden).toBe(false)
    expect(caption.querySelector('.gallerist-caption-text')?.textContent).toBe(
      'Above the Inversion',
    )
    expect(caption.querySelector('.gallerist-itemnav')).not.toBeNull()
    expect(document.querySelector('.gallerist-controls .gallerist-itemnav')).toBeNull()
    v.nextItem()
    expect(caption.querySelector('.gallerist-caption-text')?.textContent).toBe('')
    expect(caption.querySelector('.gallerist-itemnav')).not.toBeNull() // still there
  })

  it('a framed slide carries its painted box, inset by the skin, and zoom bounds use it', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    try {
      const v = createViewer({ collection: sized() })
      mount(v, { frame: true })
      v.open()
      const root = document.querySelector('.gallerist') as HTMLElement
      root.style.setProperty('--gallerist-frame-inset', '50px')
      measure(1000, 800)
      v.refresh() // re-measure: reads the inset, frames every slide
      // inner 900×700; a 2:1 image fits 900×450, centred: x 50, y 50 + 125
      const s = current().style
      expect([
        s.getPropertyValue('--gallerist-box-x'),
        s.getPropertyValue('--gallerist-box-y'),
        s.getPropertyValue('--gallerist-box-w'),
        s.getPropertyValue('--gallerist-box-h'),
      ]).toEqual(['50px', '175px', '900px', '450px'])
      // at 2× the box is 1800 wide: its left edge may not come inside the stage
      getInternals(v).setZoom({ scale: 2, x: 0, y: 0 })
      expect(v.getState().zoom.x).toBe(-100) // the box's left edge (50 × 2) at the stage's
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a content overlay maps through the framed box', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    try {
      const col = sized()
      const first = col.groups[0]?.items[0]
      if (first)
        first.overlays = [
          { id: 'tl', anchor: { kind: 'point', x: 0, y: 0 }, render: () => 'x', interactive: true },
        ]
      const v = createViewer({ collection: col })
      mount(v, { frame: true })
      v.open()
      const root = document.querySelector('.gallerist') as HTMLElement
      root.style.setProperty('--gallerist-frame-inset', '50px')
      measure(1000, 800)
      v.refresh()
      const host = document.querySelector('[data-overlay="tl"]') as HTMLElement
      expect([host.style.left, host.style.top]).toEqual(['50px', '175px'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('without a scheme option the root leaves the scheme to the skin', () => {
    const v = createViewer({ collection: sized() })
    mount(v, { skin: 'editorial' })
    v.open()
    expect(document.querySelector('.gallerist')?.hasAttribute('data-gallerist-scheme')).toBe(false)
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
    const statuses = v.getState().loaded
    expect(Object.values(statuses)).not.toContain('error')
    // b1's load was abandoned: back to idle instead of reading 'loading' forever. b0 was
    // remounted as g1's preview once g1 stopped being current, so its fresh load owns the status.
    expect(statuses.b1).toBe('idle')
    expect(statuses.b0).toBe('loading')
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

describe('mount — overlays option', () => {
  it('paints global overlays passed to createViewer({ overlays })', () => {
    const v = createViewer({
      collection: collection(),
      overlays: [{ id: 'wm', anchor: { kind: 'viewport', at: 'top-right' }, render: () => 'WM' }],
    })
    mount(v)
    v.open()
    const el = document.querySelector('.gallerist-viewport-layer [data-overlay="wm"]')
    expect(el?.textContent).toBe('WM')
  })
})

describe('mount — open/close transitions (lifecycle driver)', () => {
  afterEach(() => vi.restoreAllMocks()) // the getComputedStyle mock must not leak into later tests
  // happy-dom loads no theme CSS: pretend the root runs a 180ms phase animation.
  const animated = () =>
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (el: Element) =>
        ({
          animationName: (el as HTMLElement).classList.contains('gallerist')
            ? 'gallerist-fade-out'
            : 'none',
          animationDuration: '0.18s',
          animationDelay: '0s',
        }) as CSSStyleDeclaration,
    )
  const root = () => document.querySelector('.gallerist') as HTMLElement | null
  const animationEnd = (target: Element) =>
    target.dispatchEvent(new Event('animationend', { bubbles: true }))

  it('reflects the phase on the root; with no animation it settles at once', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect(v.getState().phase).toBe('open')
    expect(root()?.getAttribute('data-gallerist-phase')).toBe('open')
  })

  it('stays mounted through the exit animation, then detaches and fires closed', () => {
    const closed = vi.fn()
    const v = createViewer({ collection: collection(), on: { closed } })
    mount(v)
    animated()
    v.open()
    const el = root() as HTMLElement
    animationEnd(el) // opening done
    expect(v.getState().phase).toBe('open')
    v.close()
    expect(v.getState().phase).toBe('closing')
    expect(el.getAttribute('data-gallerist-phase')).toBe('closing')
    expect(root()).not.toBeNull()
    expect(closed).not.toHaveBeenCalled()
    animationEnd(el)
    expect(root()).toBeNull()
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('ignores animationend bubbling up from a descendant', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    animated()
    v.open()
    animationEnd(document.querySelector('.gallerist-slide') as HTMLElement)
    expect(v.getState().phase).toBe('opening')
  })

  it('the backup timer covers every iteration of the phase animation', () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        () =>
          ({
            animationName: 'pulse',
            animationDuration: '100ms',
            animationDelay: '0s',
            animationIterationCount: '3',
          }) as CSSStyleDeclaration,
      )
      const v = createViewer({ collection: collection() })
      mount(v)
      v.open()
      vi.advanceTimersByTime(340) // 3 × 100ms + 50ms grace = 350ms
      expect(v.getState().phase).toBe('opening')
      vi.advanceTimersByTime(20)
      expect(v.getState().phase).toBe('open')
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles on a timer if animationend never fires', () => {
    vi.useFakeTimers()
    try {
      const v = createViewer({ collection: collection() })
      mount(v)
      animated()
      v.open()
      vi.advanceTimersByTime(229) // 180ms + 50ms grace
      expect(v.getState().phase).toBe('opening')
      vi.advanceTimersByTime(2)
      expect(v.getState().phase).toBe('open')
    } finally {
      vi.useRealTimers()
    }
  })

  it('destroying the renderer mid-close still settles to closed', () => {
    const closed = vi.fn()
    const v = createViewer({ collection: collection(), on: { closed } })
    const h = mount(v)
    animated()
    v.open()
    animationEnd(root() as HTMLElement)
    v.close()
    h.destroy()
    expect(v.getState().phase).toBe('closed')
    expect(closed).toHaveBeenCalledTimes(1)
    expect(root()).toBeNull()
  })
})

describe('mount — chrome structure (M15)', () => {
  const captioned = (): Collection => ({
    groups: [
      { id: 'g0', caption: 'Morning', items: [{ ...item('a0'), caption: 'Front view' }] },
      { id: 'g1', items: [item('b0'), item('b1')] },
    ],
  })

  it('lays the chrome out in its own areas: bar, main, caption, aside, footer, rail', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const kids = [...(document.querySelector('.gallerist') as HTMLElement).children].map(
      (c) => c.className,
    )
    for (const cls of ['gallerist-bar', 'gallerist-main', 'gallerist-caption']) {
      expect(kids).toContain(cls)
    }
    expect(document.querySelector('.gallerist-bar .gallerist-region-toolbar')).not.toBeNull()
    expect(document.querySelector('.gallerist-main .gallerist-stage')).not.toBeNull()
    expect(document.querySelector('.gallerist-main .gallerist-next')).not.toBeNull()
    expect(document.querySelector('.gallerist > .gallerist-region-aside')).not.toBeNull()
  })

  it('shows the group caption as the bar title and the item caption in the caption bar', () => {
    const v = createViewer({ collection: captioned() })
    mount(v)
    v.open()
    const title = document.querySelector('.gallerist-title') as HTMLElement
    const cap = document.querySelector('.gallerist-caption') as HTMLElement
    expect([title.hidden, title.textContent]).toEqual([false, 'Morning'])
    expect([cap.hidden, cap.textContent]).toEqual([false, 'Front view'])
    v.next() // no captions: the title hides, the caption track stays reserved (no stage jump)
    expect(title.hidden).toBe(true)
    expect([cap.hidden, cap.textContent]).toEqual([false, ''])
  })

  it('shows zoom reset only while zoomed in', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const reset = document.querySelector('.gallerist-zoom-reset') as HTMLElement
    expect(reset.hidden).toBe(true)
    getInternals(v).setZoom({ scale: 2, x: 0, y: 0 })
    expect(reset.hidden).toBe(false)
    v.resetZoom()
    expect(reset.hidden).toBe(true)
  })

  it('keeps plugin tools in the bar without built-in controls', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { controls: false })
    v.open()
    expect(document.querySelector('.gallerist-bar .gallerist-region-toolbar')).not.toBeNull()
    expect(document.querySelector('.gallerist-close')).toBeNull()
  })
})

describe('mount — strings (translation)', () => {
  it('uses English defaults with generic wording', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 })
    expect(document.querySelector('.gallerist-close')?.getAttribute('aria-label')).toBe('Close')
    expect(document.querySelector('.gallerist-pill')?.getAttribute('aria-label')).toBe('Item 1')
    expect(document.querySelector('.gallerist-live')?.textContent).toBe(
      'Group 2 of 3, Item 1 of 3 — b0',
    )
  })

  it('applies partial overrides, including position templates', () => {
    const v = createViewer({ collection: collection() })
    mount(v, {
      strings: {
        close: 'Schließen',
        next: 'Weiter',
        item: (n) => `Bild ${n}`,
        groupOf: (n, total) => `Gruppe ${n} von ${total}`,
        itemOf: (n, total) => `Bild ${n} von ${total}`,
      },
    })
    v.open({ g: 1 })
    expect(document.querySelector('.gallerist-close')?.getAttribute('aria-label')).toBe('Schließen')
    expect(document.querySelector('.gallerist-next')?.getAttribute('aria-label')).toBe('Weiter')
    expect(document.querySelector('.gallerist-prev')?.getAttribute('aria-label')).toBe('Previous') // not overridden
    expect(document.querySelector('.gallerist-pill')?.getAttribute('aria-label')).toBe('Bild 1')
    expect(document.querySelector('.gallerist-live')?.textContent).toBe(
      'Gruppe 2 von 3, Bild 1 von 3 — b0',
    )
  })
})

describe('mount — item indicator variants', () => {
  const big = (n: number): Collection => ({
    groups: [{ id: 'g', items: Array.from({ length: n }, (_, k) => item(`i${k}`)) }],
  })
  const ind = () => document.querySelector('.gallerist-position') as HTMLElement

  it('pills (default): numbered pills up to 8 items, then the count', () => {
    let v = createViewer({ collection: big(8) })
    mount(v)
    v.open()
    expect(ind().dataset.mode).toBe('pills')
    expect(ind().querySelectorAll('.gallerist-pill')).toHaveLength(8)
    document.body.innerHTML = ''
    v = createViewer({ collection: big(9) })
    mount(v)
    v.open()
    expect(ind().dataset.mode).toBe('counter')
    expect(ind().querySelector('.gallerist-pill')).toBeNull()
  })

  it('dots: a dot per item (up to 12) that jumps to it, with the count alongside', () => {
    const v = createViewer({ collection: big(5) })
    mount(v, { itemIndicator: 'dots' })
    v.open()
    expect(ind().dataset.mode).toBe('dots')
    const dots = ind().querySelectorAll<HTMLButtonElement>('.gallerist-dot')
    expect(dots).toHaveLength(5)
    dots[3]?.click()
    expect(v.getState().cursor).toEqual({ g: 0, i: 3 })
    expect(dots[3]?.hasAttribute('data-active')).toBe(true)
    expect(ind().querySelector('.gallerist-position-text')?.textContent).toBe('4 / 5')
  })

  it('counter: always the count, no jump buttons', () => {
    const v = createViewer({ collection: big(3) })
    mount(v, { itemIndicator: 'counter' })
    v.open()
    expect(ind().dataset.mode).toBe('counter')
    expect(ind().querySelector('button')).toBeNull()
  })
})

describe('mount — review fixes (M15)', () => {
  const captioned = (): Collection => ({
    groups: [
      { id: 'g0', items: [{ ...item('a0'), caption: 'Front view' }, item('a1')] },
      { id: 'g1', items: [item('b0')] },
    ],
  })

  it('no captions anywhere: no caption track at all', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    expect((document.querySelector('.gallerist-caption') as HTMLElement).hidden).toBe(true)
  })

  it('reserves the caption track across items once the collection has captions', () => {
    const v = createViewer({ collection: captioned() })
    mount(v)
    v.open()
    const cap = document.querySelector('.gallerist-caption') as HTMLElement
    expect([cap.hidden, cap.textContent]).toEqual([false, 'Front view'])
    v.nextItem()
    expect([cap.hidden, cap.textContent]).toEqual([false, ''])
  })

  it('hiding a focused control hands focus to the viewer root (keymap keeps working)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open({ g: 1 })
    const root = document.querySelector('.gallerist') as HTMLElement
    const nextItemBtn = document.querySelector('.gallerist-item-next') as HTMLElement
    nextItemBtn.focus()
    v.goTo(0) // single-item group: the item navigator hides under focus
    expect(document.activeElement).toBe(root)
  })

  it('an empty bar is hidden when there are no built-in controls and no plugin tools', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { controls: false })
    v.open()
    expect((document.querySelector('.gallerist-bar') as HTMLElement).hidden).toBe(true)
    v.use(() => ({ name: 'tool', regions: { toolbar: () => document.createElement('button') } }))
    expect((document.querySelector('.gallerist-bar') as HTMLElement).hidden).toBe(false)
  })

  it('reflects skin, accent and scheme as root attributes (M16)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-skin')).toBe('gallery')
    expect(root.hasAttribute('data-gallerist-scheme')).toBe(false) // the skin's own default
    expect(root.hasAttribute('data-gallerist-accent')).toBe(false)
  })

  it('takes a skin, accent and scheme from the options', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { skin: 'console', accent: 'cyan', scheme: 'auto' })
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-skin')).toBe('console')
    expect(root.getAttribute('data-gallerist-accent')).toBe('cyan')
    expect(root.getAttribute('data-gallerist-scheme')).toBe('auto')
  })

  it('applyAppearance changes only the options it is given', () => {
    const v = createViewer({ collection: collection() })
    const { root } = mount(v, { skin: 'console', scheme: 'light' })
    applyAppearance(root, { accent: 'cyan' })
    expect(root.getAttribute('data-gallerist-skin')).toBe('console')
    expect(root.getAttribute('data-gallerist-scheme')).toBe('light')
    expect(root.getAttribute('data-gallerist-accent')).toBe('cyan')
    applyAppearance(root, { scheme: undefined, accent: undefined })
    expect(root.hasAttribute('data-gallerist-scheme')).toBe(false)
    expect(root.hasAttribute('data-gallerist-accent')).toBe(false)
    expect(root.getAttribute('data-gallerist-skin')).toBe('console')
  })

  it('marks the reading direction for the theme', () => {
    document.documentElement.dir = 'rtl'
    try {
      const v = createViewer({ collection: collection() })
      mount(v)
      v.open()
      expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-dir')).toBe('rtl')
    } finally {
      document.documentElement.removeAttribute('dir')
    }
  })

  it('translates the dialog name and the inline role description', () => {
    const v = createViewer({ collection: collection() })
    mount(v, { strings: { dialog: 'Visionneuse' } })
    v.open()
    expect(document.querySelector('.gallerist')?.getAttribute('aria-label')).toBe('Visionneuse')
    document.body.innerHTML = ''
    const host = document.body.appendChild(document.createElement('div'))
    mount(createViewer({ collection: collection() }), {
      container: host,
      strings: { carousel: 'carrousel' },
    })
    expect(host.querySelector('.gallerist')?.getAttribute('aria-roledescription')).toBe('carrousel')
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
    expect((document.querySelector('.gallerist-itemnav') as HTMLElement)?.hidden).toBe(true)
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
    // every ResizeObserver the renderer creates; "the stage resized" fires them all
    const roCbs: (() => void)[] = []
    const roCb = () => {
      for (const cb of roCbs) cb()
    }
    class FakeRO {
      constructor(cb: () => void) {
        roCbs.push(cb)
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

  it('keeps the viewer open on an Escape a host handler already took (defaultPrevented)', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    const input = document.createElement('input')
    root.appendChild(input)
    // a host form clears its field on Escape and keeps the viewer up
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.preventDefault()
    })
    input.focus()
    input.dispatchEvent(key({ key: 'Escape', cancelable: true }))
    expect(v.getState().phase).toBe('open')
    // from a non-editable target too
    const button = document.createElement('button')
    root.appendChild(button)
    button.addEventListener('keydown', (e) => e.preventDefault())
    button.dispatchEvent(key({ key: 'Escape', cancelable: true }))
    expect(v.getState().phase).toBe('open')
    // an Escape nobody took still closes
    root.dispatchEvent(key({ key: 'Escape', cancelable: true }))
    expect(v.getState().phase).toBe('closed')
  })

  it('describes the viewer with the caption (aria-describedby)', () => {
    const v = createViewer({
      collection: {
        groups: [{ id: 'g0', items: [{ ...item('a0'), caption: 'Front view' }, item('a1')] }],
      },
    })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    const describe = () =>
      (root.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join('')
    expect(describe()).toBe('Front view')
    v.nextItem()
    expect(describe()).toBe('')
    // ids are unique per viewer
    const w = createViewer({
      collection: { groups: [{ id: 'g0', items: [{ ...item('b0'), caption: 'Back view' }] }] },
    })
    mount(w)
    w.open()
    const roots = document.querySelectorAll('.gallerist')
    expect(roots[1]?.getAttribute('aria-describedby')).toBeTruthy()
    expect(roots[1]?.getAttribute('aria-describedby')).not.toBe(
      root.getAttribute('aria-describedby'),
    )
  })

  it('is described by the caption only while the caption bar shows', () => {
    const captioned = {
      groups: [{ id: 'g0', items: [{ ...item('a0'), caption: 'Front view' }] }],
    }
    const v = createViewer({ collection: captioned })
    mount(v, { controls: false }) // no chrome: the caption bar stays hidden
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(document.querySelector('.gallerist-caption')?.hasAttribute('hidden')).toBe(true)
    expect(root.hasAttribute('aria-describedby')).toBe(false)
    // nor without any caption in the collection
    const w = createViewer({ collection: collection() })
    mount(w)
    w.open()
    expect(document.querySelectorAll('.gallerist')[1]?.hasAttribute('aria-describedby')).toBe(false)
  })

  // A caption renderer's band that overflows takes focus and a name (axe scrollable-region-focusable),
  // only while it overflows; the band keeps ↑/↓/Home/End for scrolling.
  for (const indicator of ['pills', 'placard'] as const) {
    it(`an overflowing custom caption band is keyboard-scrollable (${indicator})`, () => {
      const fits: (() => void)[] = []
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(cb: () => void) {
            fits.push(cb)
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      )
      try {
        const tall = document.createElement('div')
        tall.textContent = 'Long'
        const v = createViewer({
          collection: {
            groups: [
              { id: 'g0', items: [item('a0'), item('a1')] },
              { id: 'g1', items: [item('b0')] },
            ],
          },
          plugins: [() => ({ name: 'tall-caption', regions: { caption: () => tall } })],
        })
        mount(v, { itemIndicator: indicator })
        v.open()
        const band = (
          indicator === 'placard'
            ? document.querySelector('.gallerist-region-caption')
            : document.querySelector('.gallerist-caption')
        ) as HTMLElement
        let content = 50
        Object.defineProperty(band, 'scrollHeight', { get: () => content, configurable: true })
        Object.defineProperty(band, 'clientHeight', { get: () => 100, configurable: true })
        const resize = () => {
          for (const fit of fits) fit()
        }
        resize()
        expect(band.hasAttribute('tabindex')).toBe(false)
        expect(band.hasAttribute('role')).toBe(false)
        content = 300 // now it scrolls
        resize()
        expect(band.getAttribute('tabindex')).toBe('0')
        expect(band.getAttribute('role')).toBe('region')
        const label = document.getElementById(band.getAttribute('aria-labelledby') ?? '')
        expect(label?.textContent).toBe('Caption')
        // the viewer's description is still the caption's text, not the band's name
        const root = document.querySelector('.gallerist') as HTMLElement
        expect(root.getAttribute('aria-describedby')?.split(' ')).not.toContain(label?.id)
        // ↑/↓/Home/End on the focused band scroll it rather than navigate
        band.focus()
        band.dispatchEvent(key({ key: 'ArrowDown', cancelable: true }))
        band.dispatchEvent(key({ key: 'End', cancelable: true }))
        expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
        band.dispatchEvent(key({ key: 'ArrowRight', cancelable: true })) // ← / → still navigate
        expect(v.getState().cursor.g).toBe(1)
        content = 80 // fits again
        resize()
        for (const a of ['tabindex', 'role', 'aria-labelledby'])
          expect(band.hasAttribute(a), a).toBe(false)
      } finally {
        vi.unstubAllGlobals()
      }
    })
  }

  it('ignores a caption that is not a string (untyped data with an old caption object)', () => {
    const v = createViewer({
      collection: {
        groups: [
          {
            id: 'g0',
            items: [
              { ...item('a0'), caption: { id: 'c', render: () => 'x' } as unknown as string },
            ],
          },
        ],
      },
    })
    mount(v)
    v.open()
    const bar = document.querySelector('.gallerist-caption') as HTMLElement
    expect(bar.textContent).not.toContain('[object Object]')
    expect(bar.hidden).toBe(true) // no text caption anywhere: no band reserved for one
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

describe('groupAxis and arrowLabels', () => {
  const key = (k: string) =>
    document
      .querySelector('.gallerist')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  const rooms = (): Collection => ({
    groups: [
      { id: 'a', caption: 'Hall', items: [{ id: 'a0', type: 'image', source: 'a0.jpg' }] },
      {
        id: 'b',
        caption: 'Kitchen',
        items: [
          { id: 'b0', type: 'image', source: 'b0.jpg' },
          { id: 'b1', type: 'image', source: 'b1.jpg' },
        ],
      },
      { id: 'c', items: [{ id: 'c0', type: 'image', source: 'c0.jpg' }] },
    ],
  })
  const label = (cls: string) => document.querySelector(`${cls} .gallerist-arrow-label`)
  const open = (opts: Parameters<typeof mount>[1], loop = false) => {
    const v = createViewer({ collection: rooms(), loop })
    mount(v, opts)
    v.open()
    return v
  }

  it('a side rail keeps its default vertical group axis', () => {
    const v = open({ rail: 'left' })
    const root = document.querySelector('.gallerist')
    expect(root?.getAttribute('data-gallerist-axis')).toBe('vertical')
    key('ArrowDown')
    expect(v.getState().cursor.g).toBe(1)
  })

  it('groupAxis: horizontal beside a side rail: left/right for groups, up/down for items', () => {
    const v = open({ rail: 'left', groupAxis: 'horizontal' })
    const root = document.querySelector('.gallerist')
    expect(root?.getAttribute('data-gallerist-orientation')).toBe('vertical') // the rail still runs down
    expect(root?.getAttribute('data-gallerist-axis')).toBe('horizontal')
    key('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    key('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })

  it('the tour preset labels its arrows with the groups they go to', () => {
    const v = open({ preset: 'tour' })
    expect(label('.gallerist-next')?.textContent).toBe('Kitchen')
    expect(document.querySelector('.gallerist-next')?.getAttribute('aria-label')).toBe(
      'Next: Kitchen',
    )
    expect(label('.gallerist-prev')?.hasAttribute('hidden')).toBe(true) // at the first group
    expect(document.querySelector('.gallerist-prev')?.getAttribute('aria-label')).toBe('Previous')
    v.next()
    expect(label('.gallerist-prev')?.textContent).toBe('Hall')
    expect(label('.gallerist-next')?.hasAttribute('hidden')).toBe(true) // the next group has no name
  })

  it('labels wrap with a looping viewer', () => {
    const v = open({ preset: 'tour' }, true)
    v.goTo(2)
    expect(label('.gallerist-next')?.textContent).toBe('Hall') // past the end, back to the first
    expect(label('.gallerist-prev')?.textContent).toBe('Kitchen')
  })

  it('a looping viewer with one group has nowhere to name', () => {
    const v = createViewer({ collection: { groups: [rooms().groups[0] as Group] }, loop: true })
    mount(v, { preset: 'tour' })
    v.open()
    expect(label('.gallerist-next')?.hasAttribute('hidden')).toBe(true)
    expect(document.querySelector('.gallerist-next')?.getAttribute('aria-label')).toBe('Next')
  })

  it('labels follow a replaced collection', () => {
    const v = open({ preset: 'tour' })
    v.setCollection({
      groups: [
        { id: 'x', items: [{ id: 'x0', type: 'image', source: 'x0.jpg' }] },
        { id: 'y', caption: 'Attic', items: [{ id: 'y0', type: 'image', source: 'y0.jpg' }] },
      ],
    })
    expect(label('.gallerist-next')?.textContent).toBe('Attic')
  })

  it('in RTL the horizontal group axis mirrors beside a side rail; items never flip', () => {
    document.documentElement.dir = 'rtl'
    try {
      const v = open({ rail: 'left', groupAxis: 'horizontal' })
      key('ArrowLeft')
      expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
      key('ArrowDown')
      expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    } finally {
      document.documentElement.removeAttribute('dir')
    }
  })

  it('a function names them, and strings translate the accessible name', () => {
    open({
      arrowLabels: (_g, i) => `Room ${i + 1}`,
      strings: { nextTo: (name) => `Weiter: ${name}` },
    })
    expect(label('.gallerist-next')?.textContent).toBe('Room 2')
    expect(document.querySelector('.gallerist-next')?.getAttribute('aria-label')).toBe(
      'Weiter: Room 2',
    )
  })

  it('needs horizontal pill-right arrows; an explicit false beats the preset', () => {
    open({ arrowLabels: true, rail: 'right' })
    expect(label('.gallerist-next')).toBeNull()
    document.body.innerHTML = ''
    open({ arrowLabels: true, arrows: 'dpad' })
    expect(label('.gallerist-next')).toBeNull()
    document.body.innerHTML = ''
    open({ preset: 'tour', arrowLabels: false })
    expect(label('.gallerist-next')).toBeNull()
    expect(document.querySelector('.gallerist')?.hasAttribute('data-gallerist-arrow-labels')).toBe(
      false,
    )
  })
})

describe('mount — preloading within a group (U17)', () => {
  // Image stub: records each warmer and every src it is given (nothing is fetched in happy-dom)
  let warmers: Array<{ img: HTMLImageElement; srcs: string[] }> = []
  const stubImage = () => {
    warmers = []
    const Real = window.Image
    vi.stubGlobal(
      'Image',
      class extends Real {
        rec = { img: this as HTMLImageElement, srcs: [] as string[] }
        constructor() {
          super()
          warmers.push(this.rec)
        }
        override set src(v: string) {
          this.rec.srcs.push(v)
        }
      },
    )
  }
  const warmed = () => warmers.map((w) => w.srcs[0])
  const group = (): Collection => ({
    groups: [
      {
        id: 'g0',
        items: [
          item('p0'),
          item('p1'),
          { id: 'clip', type: 'video', source: 'clip.mp4' },
          { id: 'p3', type: 'image', source: { src: 'p3.jpg', srcset: 'p3-2x.jpg 2x' } },
          item('p4'),
        ],
      },
    ],
  })
  // the current image finished loading: its adapter's `ready` settles
  const loadCurrent = () =>
    document
      .querySelector('.gallerist-slide[data-gallerist-current] img')
      ?.dispatchEvent(new Event('load'))
  afterEach(() => vi.unstubAllGlobals())

  it('warms the images a step within the group lands on, once the current one is ready', async () => {
    stubImage()
    const v = createViewer({ collection: group() })
    mount(v)
    v.open({ g: 0, i: 1 })
    expect(warmers).toEqual([]) // nothing competes with the image on screen
    loadCurrent()
    // behind 1 (p0); ahead 2: the video is skipped, p3 is warmed with its srcset
    await vi.waitFor(() => expect(warmed()).toEqual(['p0.jpg', 'p3.jpg']))
    const p3 = warmers[1]?.img
    expect(p3?.srcset).toBe('p3-2x.jpg 2x')
    expect(p3?.fetchPriority).toBe('low')
  })

  it('cancels the warmers a move leaves behind, and keeps the ones still wanted', async () => {
    stubImage()
    const v = createViewer({ collection: group() })
    mount(v)
    v.open({ g: 0, i: 1 })
    loadCurrent()
    await vi.waitFor(() => expect(warmers.length).toBe(2))
    v.goTo(0, 4) // wants p3 (behind) only
    const [p0, p3] = warmers
    expect(p0?.srcs.at(-1)).toBe('') // its request is dropped
    expect(p3?.srcs).toEqual(['p3.jpg'])
    loadCurrent()
    await new Promise((r) => setTimeout(r, 0))
    expect(warmers.length).toBe(2) // p3 isn't fetched twice
  })

  it('leaves items a custom adapter mounts alone', async () => {
    stubImage()
    const v = createViewer({ collection: group() })
    const custom = {
      type: 'image',
      mount: (_item: Item, slot: HTMLElement) => {
        const node = document.createElement('div')
        slot.appendChild(node)
        return {
          element: node,
          ready: Promise.resolve(),
          supportsZoom: false,
          destroy: () => node.remove(),
        }
      },
    }
    mount(v, { adapters: [custom] })
    v.open({ g: 0, i: 1 })
    await new Promise((r) => setTimeout(r, 0))
    expect(warmers).toEqual([])
  })

  it('destroying the viewer cancels warmers in flight', async () => {
    stubImage()
    const v = createViewer({ collection: group() })
    const handle = mount(v)
    v.open({ g: 0, i: 1 })
    loadCurrent()
    await vi.waitFor(() => expect(warmers.length).toBe(2))
    handle.destroy()
    expect(warmers.map((w) => w.srcs.at(-1))).toEqual(['', ''])
  })
})
