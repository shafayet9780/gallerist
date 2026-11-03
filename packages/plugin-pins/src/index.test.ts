// @vitest-environment happy-dom

import { type Collection, type Item, type ViewerApi, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Pin, type PinsOptions, defaultPinCard, pins } from './index'

const pin = (id: string, x: number, y: number, extra: Partial<Pin> = {}): Pin => ({
  id,
  x,
  y,
  ...extra,
})
const item = (id: string, list?: Pin[]): Item => ({
  id,
  type: 'image',
  source: `${id}.jpg`,
  naturalSize: { w: 1000, h: 800 },
  meta: list ? { pins: list } : undefined,
})
const collection = (): Collection => ({
  groups: [
    {
      id: 'g0',
      items: [
        item('a', [
          pin('p1', 0.2, 0.3, { label: 'Sofa', meta: '$1,200', href: '/sofa' }),
          pin('p2', 0.8, 0.9, { label: 'Lamp' }),
        ]),
        item('b', [pin('p3', 0.5, 0.5, { label: 'Chair' })]),
      ],
    },
  ],
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const key = (k: string) => new KeyboardEvent('keydown', { key: k, bubbles: true })
const flush = () => new Promise((r) => setTimeout(r, 0))

const open = (opts: PinsOptions = {}, col = collection()) => {
  const plugin = pins(opts)
  const v = createViewer({ collection: col, plugins: [plugin] })
  mount(v)
  v.open()
  return { v, plugin }
}
const markers = () => [...document.querySelectorAll<HTMLButtonElement>('.gallerist-pin-marker')]
const cards = () => [...document.querySelectorAll<HTMLElement>('.gallerist-pin-card')]

describe('plugin-pins', () => {
  it('paints a pin per point of the current item, read from item.meta.pins', () => {
    open()
    expect(markers().map((m) => m.getAttribute('aria-label'))).toEqual(['1. Sofa', '2. Lamp'])
    const overlay = document.querySelector('.gallerist-pin-overlay') as HTMLElement
    expect(overlay.tabIndex).toBe(-1) // the marker is the tab stop, not its host
    expect(overlay.style.pointerEvents).toBe('auto')
  })

  it('numbers comment and feature pins; a tag is a plain hotspot', () => {
    open({ presentation: 'comment' })
    expect(document.querySelector('.gallerist-pin-dot')?.textContent).toBe('1')
    document.body.innerHTML = ''
    open({ presentation: 'tag' })
    expect(document.querySelector('.gallerist-pin-dot')?.textContent).toBe('')
  })

  it('takes pins from a custom reader', () => {
    open({ pins: (it) => (it.id === 'a' ? [pin('z', 0.5, 0.5, { label: 'Custom' })] : []) })
    expect(markers().map((m) => m.getAttribute('aria-label'))).toEqual(['1. Custom'])
  })

  it('opens one card at a time; a tag card shows the product and a link', () => {
    open()
    const [m1, m2] = markers()
    m1?.click()
    expect(m1?.getAttribute('aria-expanded')).toBe('true')
    expect(cards()[0]?.hidden).toBe(false)
    expect(cards()[0]?.querySelector('.gallerist-pin-title')?.textContent).toBe('Sofa')
    expect(cards()[0]?.querySelector('.gallerist-pin-meta')?.textContent).toBe('$1,200')
    expect(cards()[0]?.querySelector('a')?.getAttribute('href')).toBe('/sofa')
    m2?.click()
    expect(cards()[0]?.hidden).toBe(true)
    expect(cards()[1]?.hidden).toBe(false)
    m2?.click()
    expect(cards()[1]?.hidden).toBe(true)
  })

  it('opens the card away from the near edges', () => {
    open()
    const [a, b] = [...document.querySelectorAll<HTMLElement>('.gallerist-pin')]
    expect([a?.dataset.side, a?.dataset.v]).toEqual(['right', 'down'])
    expect([b?.dataset.side, b?.dataset.v]).toEqual(['left', 'up'])
  })

  it('Escape closes the card and returns focus to its pin, without closing the viewer', () => {
    const { v } = open()
    const [m1] = markers()
    m1?.click()
    cards()[0]?.querySelector('a')?.focus()
    document.activeElement?.dispatchEvent(key('Escape'))
    expect(cards()[0]?.hidden).toBe(true)
    expect(document.activeElement).toBe(m1)
    expect(v.getState().phase).not.toMatch(/clos/)
  })

  it('a pointer down outside the card closes it', () => {
    open()
    markers()[0]?.click()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(cards()[0]?.hidden).toBe(true)
  })

  it('reports opening and closing', () => {
    const onOpenChange = vi.fn()
    open({ onOpenChange })
    markers()[0]?.click()
    expect(onOpenChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'p1' }),
      expect.objectContaining({ item: expect.objectContaining({ id: 'a' }) }),
    )
    markers()[0]?.click()
    expect(onOpenChange).toHaveBeenLastCalledWith(null, expect.anything())
  })

  it('moving to another item closes the card and shows that item’s pins', () => {
    const { v } = open()
    markers()[0]?.click()
    v.nextItem()
    expect(markers().map((m) => m.getAttribute('aria-label'))).toEqual(['1. Chair'])
    expect(cards().every((c) => c.hidden)).toBe(true)
  })

  it('the toolbar toggle and the p key hide and show every pin', async () => {
    open()
    await flush()
    const toggle = document.querySelector('.gallerist-pins-toggle') as HTMLButtonElement
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    toggle.click()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(
      [...document.querySelectorAll<HTMLElement>('.gallerist-pin')].every((p) => p.hidden),
    ).toBe(true)
    const root = document.querySelector('.gallerist') as HTMLElement
    root.dispatchEvent(key('p'))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector<HTMLElement>('.gallerist-pin')?.hidden).toBe(false)
  })

  it('starts hidden with visible: false, and leaves the toolbar alone with toggle: false', () => {
    open({ visible: false, toggle: false })
    expect(document.querySelector<HTMLElement>('.gallerist-pin')?.hidden).toBe(true)
    expect(document.querySelector('.gallerist-pins-toggle')).toBeNull()
  })

  it('refresh() re-reads pins changed in place', async () => {
    const col = collection()
    const { plugin } = open({}, col)
    const list = (col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins
    list.push(pin('p9', 0.4, 0.4, { label: 'New' }))
    plugin.refresh()
    await new Promise((r) => requestAnimationFrame(r)) // refresh repaints on the next frame
    expect(markers().map((m) => m.getAttribute('aria-label'))).toContain('3. New')
  })

  it('open(id) right after refresh() opens the new pin once it is painted', async () => {
    const col = collection()
    const onOpenChange = vi.fn()
    const { plugin } = open({ onOpenChange }, col)
    ;(col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins.push(pin('p9', 0.4, 0.4))
    plugin.refresh()
    plugin.open('p9')
    await new Promise((r) => requestAnimationFrame(r))
    await flush()
    const card = document.querySelector('[data-pin="p9"] .gallerist-pin-card') as HTMLElement
    expect(card.hidden).toBe(false)
    expect(onOpenChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p9' }),
      expect.anything(),
    )
  })

  it('new data for the same item (setCollection) repaints its pins', () => {
    const { v } = open()
    v.setCollection({
      groups: [{ id: 'g0', items: [item('a', [pin('q', 0.1, 0.1, { label: 'Q' })])] }],
    })
    expect(markers().map((m) => m.getAttribute('aria-label'))).toEqual(['1. Q'])
  })

  it('renderCard replaces the card contents', () => {
    open({
      renderCard: (p) => {
        const el = document.createElement('strong')
        el.textContent = `custom ${p.id}`
        return el
      },
    })
    expect(cards()[0]?.querySelector('strong')?.textContent).toBe('custom p1')
  })

  it('renderCard returning null keeps the default card for that pin', () => {
    open({
      renderCard: (p) => {
        if (p.id !== 'p2') return null
        const el = document.createElement('strong')
        el.textContent = 'custom p2'
        return el
      },
    })
    const [first, second] = cards()
    expect(first?.querySelector('.gallerist-pin-title')?.textContent).toBe('Sofa')
    expect(first?.querySelector('.gallerist-pin-link')?.getAttribute('href')).toBe('/sofa')
    expect(second?.querySelector('strong')?.textContent).toBe('custom p2')
    expect(second?.querySelector('.gallerist-pin-title')).toBeNull()
  })

  it('exports the default card builder for wrapping or extending', () => {
    const extra = (p: Pin) => {
      const wrap = document.createElement('div')
      wrap.className = 'wrapped'
      wrap.appendChild(
        defaultPinCard(p, { presentation: 'comment', strings: { resolved: 'Done' } }),
      )
      return wrap
    }
    open({
      presentation: 'comment',
      pins: () => [pin('c1', 0.5, 0.5, { label: 'Ana', body: 'Cut off', resolved: true })],
      renderCard: extra,
    })
    const card = cards()[0] as HTMLElement
    expect(card.querySelector('.wrapped .gallerist-pin-title')?.textContent).toBe('Ana')
    expect(card.querySelector('.wrapped .gallerist-pin-body')?.textContent).toBe('Cut off')
    expect(card.querySelector('.wrapped .gallerist-pin-badge')?.textContent).toBe('Done')
    // the default presentation is `tag`: no comment head, a link with the English label
    const tag = defaultPinCard(pin('t', 0, 0, { label: 'Lamp', href: '/lamp' }))
    expect(tag.querySelector('.gallerist-pin-head')).toBeNull()
    expect(tag.querySelector('.gallerist-pin-link')?.textContent).toBe('View')
  })

  it('the default card links only to http(s), mailto and relative URLs', () => {
    const link = (href: string) =>
      defaultPinCard(pin('l', 0, 0, { label: 'Lamp', href }))
        .querySelector('.gallerist-pin-link')
        ?.getAttribute('href') ?? null
    expect(link('https://shop.example/lamp')).toBe('https://shop.example/lamp')
    expect(link('http://shop.example/lamp')).toBe('http://shop.example/lamp')
    expect(link('mailto:sales@example.com')).toBe('mailto:sales@example.com')
    expect(link('/lamp')).toBe('/lamp')
    expect(link('lamp?id=2')).toBe('lamp?id=2')
    expect(link('#lamp')).toBe('#lamp')
    for (const bad of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://shop.example/1',
    ]) {
      expect(link(bad), bad).toBeNull()
    }
  })

  it('a pin with an unsafe href renders through the plugin without a link', () => {
    open({ pins: () => [pin('x', 0.5, 0.5, { label: 'Bad', href: 'javascript:alert(1)' })] })
    expect(cards()[0]?.querySelector('a')).toBeNull()
    expect(cards()[0]?.querySelector('.gallerist-pin-title')?.textContent).toBe('Bad')
  })

  it('comment threads show the author, time, replies and a resolved badge', () => {
    open({
      presentation: 'comment',
      pins: () => [
        pin('c1', 0.5, 0.5, {
          label: 'Ana',
          meta: '2h',
          body: 'Button is cut off',
          resolved: true,
          replies: [{ author: 'Ben', meta: '1h', body: 'Fixed in 4.2.1' }],
        }),
      ],
    })
    const card = cards()[0] as HTMLElement
    expect(card.querySelector('.gallerist-pin-title')?.textContent).toBe('Ana')
    expect(card.querySelector('.gallerist-pin-badge')?.textContent).toBe('Resolved')
    expect(card.querySelectorAll('.gallerist-pin-replies li')).toHaveLength(1)
    expect(document.querySelector('.gallerist-pin')?.hasAttribute('data-resolved')).toBe(true)
  })

  describe('review fixes', () => {
    it('Escape closes a card opened by open(id) while focus is on the viewer, not the viewer', () => {
      const { v, plugin } = open()
      const root = document.querySelector('.gallerist') as HTMLElement
      root.focus()
      plugin.open('p1')
      expect(cards()[0]?.hidden).toBe(false)
      root.dispatchEvent(key('Escape'))
      expect(cards()[0]?.hidden).toBe(true)
      expect(v.getState().phase).not.toMatch(/clos/)
      root.dispatchEvent(key('Escape')) // with no card open, Escape is the viewer's again
      expect(v.getState().phase).toMatch(/clos/)
    })

    it('hiding pins while one has focus hands focus to the toggle', async () => {
      open()
      await flush()
      markers()[0]?.focus()
      ;(document.querySelector('.gallerist') as HTMLElement).dispatchEvent(key('P'))
      expect(document.activeElement?.classList.contains('gallerist-pins-toggle')).toBe(true)
    })

    it('a repaint keeps keyboard focus on the same pin', async () => {
      const { v } = open()
      markers()[1]?.focus()
      v.refresh()
      await new Promise((r) => requestAnimationFrame(r))
      expect(document.activeElement).toBe(markers()[1])
    })

    it('reports the close when the open pin disappears from the data', () => {
      const onOpenChange = vi.fn()
      const { v } = open({ onOpenChange })
      markers()[0]?.click()
      v.setCollection({ groups: [{ id: 'g0', items: [item('a', [pin('q', 0.1, 0.1)])] }] })
      expect(onOpenChange).toHaveBeenLastCalledWith(null, expect.anything())
    })

    it('marks interactive overlay hosts so a double-click in a card does not zoom', () => {
      open()
      expect(
        document.querySelector('.gallerist-pin-overlay')?.hasAttribute('data-interactive'),
      ).toBe(true)
    })
  })

  describe('placing a comment', () => {
    const arm = async (onPlace: PinsOptions['onPlace']) => {
      const r = open({ presentation: 'comment', onPlace })
      await flush()
      // the current image occupies a 1000×800 box at (100, 50); its natural size matches
      const media = document.querySelector(
        '.gallerist-content[data-gallerist-current] .gallerist-media',
      ) as HTMLElement
      vi.spyOn(media, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 50,
        width: 1000,
        height: 800,
      } as DOMRect)
      ;(document.querySelector('.gallerist-pin-add') as HTMLButtonElement).click()
      return { ...r, media }
    }
    const clickAt = (el: Element, x: number, y: number) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }))

    it('the add button arms a click on the image, reported in normalized coordinates', async () => {
      const onPlace = vi.fn()
      const { media } = await arm(onPlace)
      const root = document.querySelector('.gallerist') as HTMLElement
      expect(root.hasAttribute('data-gallerist-placing')).toBe(true)
      clickAt(media, 350, 450)
      expect(onPlace).toHaveBeenCalledWith(
        { x: 0.25, y: 0.5 },
        expect.objectContaining({ item: expect.objectContaining({ id: 'a' }) }),
      )
      expect(root.hasAttribute('data-gallerist-placing')).toBe(false)
    })

    it('a drag (a pan) and a click beside the image keep placing armed', async () => {
      const onPlace = vi.fn()
      const { media } = await arm(onPlace)
      const root = document.querySelector('.gallerist') as HTMLElement
      const add = document.querySelector('.gallerist-pin-add') as HTMLElement
      expect(add.getAttribute('aria-pressed')).toBe('true')
      media.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 300 }),
      )
      clickAt(media, 420, 300) // released 120px away: a pan
      expect(root.hasAttribute('data-gallerist-placing')).toBe(true)
      clickAt(document.querySelector('.gallerist-stage') as Element, 50, 50) // beside the image
      expect(root.hasAttribute('data-gallerist-placing')).toBe(true)
      expect(onPlace).not.toHaveBeenCalled()
      clickAt(media, 350, 450)
      expect(onPlace).toHaveBeenCalledTimes(1)
      expect(add.getAttribute('aria-pressed')).toBe('false')
    })

    it('Escape cancels placing without closing the viewer', async () => {
      const onPlace = vi.fn()
      const { v, media } = await arm(onPlace)
      const root = document.querySelector('.gallerist') as HTMLElement
      root.dispatchEvent(key('Escape'))
      expect(root.hasAttribute('data-gallerist-placing')).toBe(false)
      expect(v.getState().phase).not.toMatch(/clos/)
      clickAt(media, 350, 450)
      expect(onPlace).not.toHaveBeenCalled()
    })

    it('has no add button or c key without onPlace', async () => {
      const { v } = open({ presentation: 'comment' })
      await flush()
      expect(document.querySelector('.gallerist-pin-add')).toBeNull()
      const inst = pins({})(v as ViewerApi)
      expect(inst.keymap?.c).toBeUndefined()
    })
  })
})
