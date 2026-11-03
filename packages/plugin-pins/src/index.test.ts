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
// a real keydown is cancelable: preventDefault() only sticks on one
const cancelableKey = (k: string) =>
  new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
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

  it('renderCard replaces the card contents, drawn when the card opens', () => {
    const renderCard = vi.fn((p: Pin) => {
      const el = document.createElement('strong')
      el.textContent = `custom ${p.id}`
      return el
    })
    open({ renderCard })
    expect(renderCard).not.toHaveBeenCalled() // a closed card is empty (but its close button)
    expect(cards()[0]?.childElementCount).toBe(1)
    markers()[0]?.click()
    expect(renderCard).toHaveBeenCalledTimes(1)
    expect(cards()[0]?.querySelector('strong')?.textContent).toBe('custom p1')
    expect(cards()[0]?.lastElementChild?.className).toBe('gallerist-pin-close')
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
    markers()[0]?.click()
    expect(first?.querySelector('.gallerist-pin-title')?.textContent).toBe('Sofa')
    expect(first?.querySelector('.gallerist-pin-link')?.getAttribute('href')).toBe('/sofa')
    markers()[1]?.click()
    expect(first?.childElementCount).toBe(1) // closed: emptied
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
    markers()[0]?.click()
    const card = cards()[0] as HTMLElement
    expect(card.querySelector('.wrapped .gallerist-pin-title')?.textContent).toBe('Ana')
    expect(card.querySelector('.wrapped .gallerist-pin-body')?.textContent).toBe('Cut off')
    expect(card.querySelector('.wrapped .gallerist-pin-badge')?.textContent).toBe('Done')
    // the default presentation is `tag`: no comment head, a link with the English label
    const tag = defaultPinCard(pin('t', 0, 0, { label: 'Lamp', href: '/lamp' }))
    expect(tag.querySelector('.gallerist-pin-head')).toBeNull()
    expect(tag.querySelector('.gallerist-pin-link')?.textContent).toBe('View')
  })

  it('the default card links only to http(s), mailto, tel and relative URLs', () => {
    const link = (href: string) =>
      defaultPinCard(pin('l', 0, 0, { label: 'Lamp', href }))
        .querySelector('.gallerist-pin-link')
        ?.getAttribute('href') ?? null
    expect(link('https://shop.example/lamp')).toBe('https://shop.example/lamp')
    expect(link('http://shop.example/lamp')).toBe('http://shop.example/lamp')
    expect(link('mailto:sales@example.com')).toBe('mailto:sales@example.com')
    expect(link('tel:+15550100')).toBe('tel:+15550100')
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

  it('keeps relative links on a page whose own URL is not http (about:srcdoc)', () => {
    vi.stubGlobal('location', { href: 'about:srcdoc', protocol: 'about:' })
    try {
      const card = defaultPinCard(pin('l', 0, 0, { label: 'Lamp', href: 'lamp?id=2' }))
      expect(card.querySelector('.gallerist-pin-link')?.getAttribute('href')).toBe('lamp?id=2')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a pin with an unsafe href renders through the plugin without a link', () => {
    open({ pins: () => [pin('x', 0.5, 0.5, { label: 'Bad', href: 'javascript:alert(1)' })] })
    markers()[0]?.click()
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
    markers()[0]?.click()
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

    it('a form in a card can keep Escape with preventDefault(): card and viewer stay open', () => {
      const { v } = open({
        renderCard: () => {
          const input = document.createElement('input')
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') e.preventDefault()
          })
          return input
        },
      })
      markers()[0]?.click()
      const input = cards()[0]?.querySelector('input') as HTMLInputElement
      input.focus()
      input.dispatchEvent(cancelableKey('Escape'))
      expect(cards()[0]?.hidden).toBe(false)
      expect(document.activeElement).toBe(input)
      expect(v.getState().phase).not.toMatch(/clos/)
    })

    it('Escape in a card form that does not keep it closes the card, not the viewer', () => {
      const { v } = open({ renderCard: () => document.createElement('input') })
      const [m1] = markers()
      m1?.click()
      const input = cards()[0]?.querySelector('input') as HTMLInputElement
      input.focus()
      const esc = cancelableKey('Escape')
      input.dispatchEvent(esc)
      expect(esc.defaultPrevented).toBe(true) // marked handled for anything listening later
      expect(cards()[0]?.hidden).toBe(true)
      expect(document.activeElement).toBe(m1)
      expect(v.getState().phase).not.toMatch(/clos/)
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

  describe('card lifecycle (host-rendered cards)', () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    // a host card: a form whose Save rewrites the pin in place and redraws, as a host would
    const host = (made: Array<{ pin: string; node: Node }>, onSave?: () => void) => {
      return (p: Pin) => {
        if (p.id === 'p2') return null // the default card
        const form = document.createElement('form')
        form.className = 'host-card'
        const input = document.createElement('input')
        const save = document.createElement('button')
        save.type = 'button'
        save.className = 'save'
        save.addEventListener('click', () => onSave?.())
        form.append(input, save)
        made.push({ pin: p.id, node: form })
        return form
      }
    }

    it('onCardRemove: once per returned node, on close, redraw, navigation and destroy', async () => {
      const made: Array<{ pin: string; node: Node }> = []
      const dropped: Array<{ pin: string; node: Node; inCard: boolean }> = []
      const { v, plugin } = open({
        renderCard: host(made),
        onCardRemove: (p, node) =>
          dropped.push({ pin: p.id, node, inCard: !!(node as Element).closest?.('.gallerist') }),
      })
      const card = () =>
        document.querySelector('[data-pin="p1"] .gallerist-pin-card') as HTMLElement
      markers()[0]?.click() // open p1
      expect(made).toHaveLength(1)
      markers()[0]?.click() // closed by its pin
      expect(dropped.map((d) => d.node)).toEqual([made[0]?.node])
      plugin.open('p1')
      v.refresh() // a redraw: a new node, the old one dropped
      await frame()
      await flush()
      expect(made).toHaveLength(3)
      expect(dropped.map((d) => d.node)).toEqual([made[0]?.node, made[1]?.node])
      expect(card().hidden).toBe(false)
      expect(card().contains(made[2]?.node as Node)).toBe(true)
      markers()[1]?.click() // another pin (a default card) replaces it
      expect(dropped).toHaveLength(3)
      markers()[1]?.click() // closing a default card reports nothing
      expect(dropped).toHaveLength(3)
      plugin.open('p1')
      card().dispatchEvent(key('Escape')) // Escape
      expect(dropped).toHaveLength(4)
      plugin.open('p1')
      v.nextItem() // navigation away
      expect(dropped).toHaveLength(5)
      v.prevItem()
      plugin.open('p1')
      v.destroy() // the viewer (and the plugin with it)
      expect(dropped).toHaveLength(6)
      // every node made was dropped exactly once, in order, for its own pin, off the page
      expect(dropped.map((d) => d.node)).toEqual(made.map((m) => m.node))
      expect(dropped.map((d) => d.pin)).toEqual(made.map((m) => m.pin))
      expect(dropped.every((d) => !d.inCard)).toBe(true)
    })

    it('save → redraw → focus on the pin → Escape closes the card, not the viewer', async () => {
      const made: Array<{ pin: string; node: Node }> = []
      const col = collection()
      const onSave = () => {
        const list = (col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins
        list[0] = { ...(list[0] as Pin), body: 'saved' }
        r.plugin.refresh()
      }
      const onCardRemove = vi.fn()
      const r = open({ renderCard: host(made, onSave), onCardRemove }, col)
      markers()[0]?.click()
      const save = document.querySelector('.host-card .save') as HTMLButtonElement
      save.focus()
      save.click()
      await frame()
      await flush()
      expect(onCardRemove).toHaveBeenCalledTimes(1)
      const marker = document.querySelector('[data-pin="p1"] .gallerist-pin-marker')
      expect(document.activeElement).toBe(marker)
      const card = document.querySelector('[data-pin="p1"] .gallerist-pin-card') as HTMLElement
      expect(card.hidden).toBe(false) // still open, redrawn
      document.activeElement?.dispatchEvent(key('Escape'))
      expect(card.hidden).toBe(true)
      expect(document.activeElement).toBe(marker)
      expect(r.v.getState().phase).not.toMatch(/clos/)
      document.activeElement?.dispatchEvent(key('Escape')) // no card open: the viewer's again
      expect(r.v.getState().phase).toMatch(/clos/)
    })

    it('focus in a card whose pin leaves the data goes to the add button, never <body>', async () => {
      const col = collection()
      const r = open({ renderCard: host([]), onPlace: () => {} }, col)
      await flush()
      markers()[0]?.click()
      ;(document.querySelector('.host-card input') as HTMLInputElement).focus()
      ;(col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins.shift() // p1 is gone
      r.plugin.refresh()
      await frame()
      await flush()
      expect(document.querySelector('[data-pin="p1"]')).toBeNull()
      expect(document.activeElement?.className).toBe('gallerist-pin-add')
    })

    it('focus in a card goes to the viewer when its item changes (no add button)', async () => {
      const { v } = open({ renderCard: host([]) })
      markers()[0]?.click()
      ;(document.querySelector('.host-card input') as HTMLInputElement).focus()
      v.nextItem()
      await flush()
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    it('a card closed from the host while focus is inside hands focus to its pin', () => {
      const { plugin } = open({ renderCard: host([]) })
      const [m1] = markers()
      m1?.click()
      ;(document.querySelector('.host-card input') as HTMLInputElement).focus()
      plugin.open(null)
      expect(document.activeElement).toBe(m1)
    })

    it('open(id, { focus: true }) focuses the card; open(null, { focus: true }) its pin', async () => {
      const col = collection()
      const { plugin } = open({}, col)
      const root = document.querySelector('.gallerist') as HTMLElement
      root.focus()
      plugin.open('p2')
      expect(document.activeElement).toBe(root) // no focus asked for: it stays
      plugin.open('p1', { focus: true })
      expect(document.activeElement).toBe(cards()[0])
      plugin.open(null, { focus: true })
      expect(document.activeElement).toBe(markers()[0])
      // a pin not painted yet takes focus once it is
      ;(col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins.push(pin('p9', 0.4, 0.4))
      plugin.refresh()
      plugin.open('p9', { focus: true })
      await frame()
      await flush()
      expect(document.activeElement).toBe(
        document.querySelector('[data-pin="p9"] .gallerist-pin-card'),
      )
    })

    it('pins still open after the overlay viewer closes and reopens', async () => {
      const { v, plugin } = open()
      v.close()
      await flush()
      expect(document.querySelector('.gallerist')).toBeNull()
      plugin.setVisible(true) // anything the plugin does while the viewer is out of the document
      plugin.open(null)
      v.open()
      await flush()
      markers()[0]?.click()
      expect(cards()[0]?.hidden).toBe(false)
    })

    it('onOpenChange reports the pin that closed as ctx.previous', () => {
      const onOpenChange = vi.fn()
      open({ onOpenChange })
      const [m1, m2] = markers()
      m1?.click()
      expect(onOpenChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'p1' }),
        expect.objectContaining({ previous: null, item: expect.objectContaining({ id: 'a' }) }),
      )
      m2?.click()
      expect(onOpenChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'p2' }),
        expect.objectContaining({ previous: expect.objectContaining({ id: 'p1' }) }),
      )
      m2?.click()
      expect(onOpenChange).toHaveBeenLastCalledWith(
        null,
        expect.objectContaining({ previous: expect.objectContaining({ id: 'p2' }) }),
      )
      expect(onOpenChange).toHaveBeenCalledTimes(3)
    })

    it('a renderCard that throws: default card for that pin, state settles, error reported', () => {
      const report = vi.fn()
      vi.stubGlobal('reportError', report)
      const boom = new Error('boom')
      const made: Node[] = []
      const onCardRemove = vi.fn()
      const onOpenChange = vi.fn()
      try {
        const { plugin } = open({
          renderCard: (p) => {
            if (p.id === 'p2') throw boom
            const node = document.createElement('form')
            made.push(node)
            return node
          },
          onCardRemove,
          onOpenChange,
        })
        const [c1, c2] = cards()
        plugin.open('p1')
        plugin.open('p2') // p1's node leaves; p2's renderCard throws
        expect(onCardRemove).toHaveBeenCalledTimes(1)
        expect(onCardRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), made[0])
        expect(c1?.hidden).toBe(true)
        expect(c2?.hidden).toBe(false)
        expect(c2?.querySelector('.gallerist-pin-title')?.textContent).toBe('Lamp') // default card
        expect(markers()[1]?.getAttribute('aria-expanded')).toBe('true')
        expect(onOpenChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ id: 'p2' }),
          expect.objectContaining({ previous: expect.objectContaining({ id: 'p1' }) }),
        )
        expect(report).toHaveBeenCalledTimes(1)
        expect(report).toHaveBeenCalledWith(boom)
        // and it still behaves: Escape closes it, a default card reports no removal
        document.querySelector('.gallerist')?.dispatchEvent(key('Escape'))
        expect(c2?.hidden).toBe(true)
        expect(onCardRemove).toHaveBeenCalledTimes(1)
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('a node returned again for the redrawn card is not handed back until it leaves', async () => {
      const cache = new Map<string, HTMLElement>()
      const onCardRemove = vi.fn()
      const { v, plugin } = open({
        renderCard: (p) => {
          let node = cache.get(p.id)
          if (!node) {
            node = document.createElement('div')
            node.className = 'host-card'
            cache.set(p.id, node)
          }
          return node
        },
        onCardRemove,
      })
      plugin.open('p1')
      const node = cache.get('p1') as HTMLElement
      v.refresh() // redraw: the same node comes back
      await frame()
      await flush()
      expect(onCardRemove).not.toHaveBeenCalled()
      const card = document.querySelector('[data-pin="p1"] .gallerist-pin-card') as HTMLElement
      expect(card.hidden).toBe(false)
      expect(card.contains(node)).toBe(true)
      v.setCollection(collection()) // a synchronous repaint too
      await flush()
      expect(onCardRemove).not.toHaveBeenCalled()
      plugin.open(null)
      expect(onCardRemove).toHaveBeenCalledTimes(1)
      expect(onCardRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), node)
      expect(node.isConnected).toBe(false)
      plugin.open('p1') // reused again: one more removal when it leaves again
      plugin.open('p2')
      expect(onCardRemove).toHaveBeenCalledTimes(2)
    })

    it('open() from onCardRemove: events arrive in order, the last one names the open pin', () => {
      const events: Array<[string | null, string | null]> = []
      const ref: { plugin?: ReturnType<typeof pins> } = {}
      const r = open({
        renderCard: () => document.createElement('div'),
        onCardRemove: (p) => {
          if (p.id === 'p1') ref.plugin?.open('p2')
        },
        onOpenChange: (p, ctx) => events.push([p?.id ?? null, ctx.previous?.id ?? null]),
      })
      ref.plugin = r.plugin
      r.plugin.open('p1')
      r.plugin.open(null) // p1's node leaves → the host opens p2
      expect(events).toEqual([
        ['p1', null],
        [null, 'p1'],
        ['p2', null],
      ])
      expect(cards()[1]?.hidden).toBe(false)
      expect(cards()[0]?.hidden).toBe(true)
    })

    it('a repaint’s pending reopen does nothing after open(null) or destroy', async () => {
      const onOpenChange = vi.fn()
      const { v, plugin } = open({ onOpenChange })
      plugin.open('p1')
      v.setCollection(collection()) // synchronous repaint: the card reopens in a microtask
      plugin.open(null) // … unless closed first, in the same task
      await flush()
      expect(
        document.querySelector('[data-pin="p1"] .gallerist-pin-card')?.hasAttribute('hidden'),
      ).toBe(true)
      expect(onOpenChange).toHaveBeenLastCalledWith(null, expect.anything())
      plugin.open('p1')
      v.setCollection(collection())
      const add = vi.spyOn(document, 'addEventListener')
      const calls = onOpenChange.mock.calls.length
      v.destroy() // … or destroyed
      await flush()
      expect(add).not.toHaveBeenCalledWith('pointerdown', expect.anything(), true)
      expect(onOpenChange).toHaveBeenCalledTimes(calls + 1) // the close on destroy, nothing after
      expect(onOpenChange).toHaveBeenLastCalledWith(null, expect.anything())
    })

    it('open(id, { focus: true }) for a pin not painted yet leaves focus that moved meanwhile', async () => {
      const col = collection()
      const { plugin } = open({}, col)
      const root = document.querySelector('.gallerist') as HTMLElement
      root.focus()
      ;(col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins.push(pin('p9', 0.4, 0.4))
      plugin.refresh()
      plugin.open('p9', { focus: true })
      const toggle = document.querySelector('.gallerist-pins-toggle') as HTMLButtonElement
      toggle.focus() // the user moved on before the pin was painted
      await frame()
      await flush()
      expect(
        document.querySelector('[data-pin="p9"] .gallerist-pin-card')?.hasAttribute('hidden'),
      ).toBe(false)
      expect(document.activeElement).toBe(toggle)
    })

    it('after destroy, the same plugin in a new viewer listens on the new viewer', () => {
      const plugin = pins({ toggle: false }) // no toolbar: the root comes from a painted pin
      const v1 = createViewer({ collection: collection(), plugins: [plugin] })
      mount(v1)
      v1.open()
      plugin.open('p1')
      v1.destroy()
      const v2 = createViewer({ collection: collection(), plugins: [plugin] })
      mount(v2)
      v2.open()
      const root2 = [...document.querySelectorAll('.gallerist')].pop() as HTMLElement
      const card = root2.querySelector('[data-pin="p1"] .gallerist-pin-card') as HTMLElement
      plugin.open('p1')
      expect(card.hidden).toBe(false)
      root2.dispatchEvent(key('Escape'))
      expect(card.hidden).toBe(true) // the card closed, not the viewer
      expect(v2.getState().phase).not.toMatch(/clos/)
    })

    it('inline viewer: focus on <body> stays there when the host changes the item', () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const plugin = pins({ renderCard: host([]) })
      const v = createViewer({ collection: collection(), plugins: [plugin] })
      mount(v, { container })
      v.open()
      markers()[0]?.click() // a click that doesn't focus the pin (Safari)
      ;(document.activeElement as HTMLElement | null)?.blur()
      expect(document.activeElement).toBe(document.body)
      v.nextItem() // e.g. a host button or a slideshow
      expect(document.activeElement).toBe(document.body)
      v.prevItem()
      markers()[0]?.click()
      const input = document.querySelector('.host-card input') as HTMLInputElement
      input.focus()
      input.blur() // focus fell out of the card (its slide went away), then the item changes
      v.nextItem()
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    // the host (README pattern) drops an empty draft when its card closes: in onOpenChange, by
    // ctx.previous, then refresh(). The repaint takes the marker focus went to, a frame later.
    const draftHost = () => {
      const col = collection()
      const list = () => (col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins
      list().push(pin('d', 0.5, 0.5)) // a draft: no body yet
      const r = open(
        {
          presentation: 'comment',
          onPlace: () => {},
          renderCard: host([]),
          onOpenChange: (p, { previous }) => {
            if (p || !previous || previous.body) return
            const at = list().findIndex((q) => q.id === previous.id)
            if (at >= 0) list().splice(at, 1)
            r.plugin.refresh()
          },
        },
        col,
      )
      r.plugin.open('d', { focus: true })
      const input = document.querySelector('[data-pin="d"] .host-card input') as HTMLInputElement
      input.focus()
      return { ...r, input, add: document.querySelector('.gallerist-pin-add') as HTMLElement }
    }

    it('× on an empty draft the host removes: after the repaint focus is on the add button', async () => {
      const { v, add } = draftHost()
      const close = document.querySelector('[data-pin="d"] .gallerist-pin-close') as HTMLElement
      close.focus()
      close.click()
      expect(document.activeElement).toBe(markers()[2]) // its pin, until the repaint drops it
      await frame()
      await flush()
      expect(document.querySelector('[data-pin="d"]')).toBeNull()
      expect(document.activeElement).toBe(add) // not <body>: the viewer's keys still answer
      document.activeElement?.dispatchEvent(key('p'))
      expect(markers()[0]?.closest<HTMLElement>('.gallerist-pin')?.hidden).toBe(true)
      expect(v.getState().phase).not.toMatch(/clos/)
    })

    it('Escape on an empty draft the host removes: the viewer stays, focus on the add button', async () => {
      const { v, input, add } = draftHost()
      input.dispatchEvent(cancelableKey('Escape'))
      await frame()
      await flush()
      expect(document.querySelector('[data-pin="d"]')).toBeNull()
      expect(document.activeElement).toBe(add)
      expect(v.getState().phase).not.toMatch(/clos/)
    })

    it('a repaint without the focused pin and no add button: focus on the viewer', async () => {
      const col = collection()
      const { plugin } = open({}, col)
      markers()[1]?.focus()
      ;(col.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins.pop()
      plugin.refresh()
      await frame()
      await flush()
      expect(markers()).toHaveLength(1)
      expect(document.activeElement).toBe(document.querySelector('.gallerist'))
    })

    it('a rescue after a key shows the focus ring (focusVisible); after a click it does not', () => {
      open({ renderCard: host([]) })
      const focus = vi.spyOn(HTMLElement.prototype, 'focus')
      markers()[0]?.click()
      const input = document.querySelector('.host-card input') as HTMLInputElement
      input.focus()
      input.dispatchEvent(cancelableKey('Escape'))
      expect(document.activeElement).toBe(markers()[0])
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true, focusVisible: true })
      markers()[0]?.click()
      // the close button clicked with a pointer (it doesn't match :focus-visible): left to the
      // browser, which shows no ring after a click
      const close = document.querySelector('[data-pin="p1"] .gallerist-pin-close') as HTMLElement
      vi.spyOn(close, 'matches').mockReturnValue(false)
      close.focus()
      close.click()
      expect(document.activeElement).toBe(markers()[0])
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true, focusVisible: undefined })
    })
  })

  describe('card placement (on screen)', () => {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
      }) as DOMRect
    // a laid-out viewer: the boxes by class, and a card `h` px tall (its content) under max-height
    const layout = (boxes: Record<string, DOMRect>, h: number) => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const hit = Object.keys(boxes).find((c) => this.classList.contains(c))
        return hit ? (boxes[hit] as DOMRect) : rect(0, 0, 0, 0)
      })
      const height = (el: HTMLElement) =>
        Math.min(h, Number.parseFloat(el.style.maxHeight) || Number.POSITIVE_INFINITY)
      const isCard = (el: HTMLElement) => el.classList.contains('gallerist-pin-card')
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return isCard(this) ? height(this) : 0
      })
      for (const prop of ['clientHeight', 'scrollHeight'] as const)
        vi.spyOn(HTMLElement.prototype, prop, 'get').mockImplementation(function (
          this: HTMLElement,
        ) {
          return isCard(this) ? (prop === 'scrollHeight' ? h : height(this)) : 0
        })
    }
    // the pin's box (marker and its wrapper) at (x, y), 44px
    const pinAt = (x: number, y: number) => ({
      'gallerist-pin-marker': rect(x, y, 44, 44),
      'gallerist-pin': rect(x, y, 44, 44),
    })
    const openCard = () => {
      markers()[0]?.click()
      return cards()[0] as HTMLElement
    }

    it('a card taller than a short stage (844×390) fits it and scrolls, in the tab order', () => {
      const { v } = open()
      // the Apploye phone: a 159px stage, a 194px host card, the pin mid-stage
      layout({ 'gallerist-stage': rect(225, 57, 282, 159), ...pinAt(340, 110) }, 194)
      const card = openCard()
      expect(card.style.maxHeight).toBe('143px') // the stage less 8px each side
      expect(card.style.top).toBe(`${65 - 110}px`) // slid up to the stage's top (+8)
      expect(card.style.bottom).toBe('auto')
      expect(card.tabIndex).toBe(0) // it scrolls: the keys can reach it
      // ↓ on the focused card scrolls it, it doesn't change the item
      card.focus()
      card.dispatchEvent(key('ArrowDown'))
      card.dispatchEvent(key('End'))
      expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
      expect(card.hidden).toBe(false)
    })

    it('a card that fits sits level with its pin, slid up from the bottom edge, out of the tab order', () => {
      open()
      layout({ 'gallerist-stage': rect(0, 50, 800, 400), ...pinAt(100, 120) }, 100)
      const card = openCard()
      expect(card.style.top).toBe('0px') // level with the pin
      expect(card.tabIndex).toBe(-1)
      expect(card.closest<HTMLElement>('.gallerist-pin')?.dataset.side).toBe('right')
      markers()[0]?.click()
      // near the bottom: as low as fits (stage bottom 450 - 8 - 100 = 342)
      layout({ 'gallerist-stage': rect(0, 50, 800, 400), ...pinAt(700, 420) }, 100)
      const again = openCard()
      expect(again.style.top).toBe(`${342 - 420}px`)
      expect(again.closest<HTMLElement>('.gallerist-pin')?.dataset.side).toBe('left') // more room
      expect(again.style.maxWidth).toBe('280px')
    })

    it('never under a band floated over the stage (immersive: the inset controls box)', () => {
      open()
      layout(
        {
          'gallerist-stage': rect(0, 0, 844, 390),
          'gallerist-controls': rect(0, 52, 844, 260), // a top bar and a bottom rail over it
          ...pinAt(400, 60),
        },
        300,
      )
      const card = openCard()
      expect(card.style.maxHeight).toBe(`${260 - 16}px`)
      expect(card.style.top).toBe(`${60 - 60}px`) // the free area's top (52 + 8)
    })
  })
})
