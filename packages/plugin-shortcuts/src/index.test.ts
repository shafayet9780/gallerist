// @vitest-environment happy-dom

import { type Collection, type Item, type Plugin, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { type MountOptions, mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fullscreen } from '../../plugin-fullscreen/src/index'
import { grid } from '../../plugin-grid/src/index'
import { pins } from '../../plugin-pins/src/index'
import { download } from '../../plugin-save/src/index'
import { thumbnails } from '../../plugin-thumbnails/src/index'
import { view } from '../../plugin-view/src/index'
import { zoom } from '../../plugin-zoom/src/index'
import { type ShortcutsInstance, type ShortcutsOptions, shortcuts } from './index'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (one = false): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: one ? [item('b0')] : [item('b0'), item('b1'), item('b2')] },
    { id: 'g2', items: [item('c0')] },
  ],
})

const setup = (
  opts?: ShortcutsOptions,
  { plugins = [] as Plugin[], mountOpts = {} as MountOptions, one = false } = {},
) => {
  const plugin = shortcuts(opts)
  const v = createViewer({ collection: collection(one), plugins: [...plugins, plugin] })
  const handle = mount(v, mountOpts)
  v.open()
  return { v, handle, plugin }
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const root = () => q('.gallerist') as HTMLElement
const dialog = () => q('.gallerist-shortcuts')
const keydown = (el: EventTarget, key: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(ev)
  return ev
}
const press = (key: string, init?: KeyboardEventInit) => keydown(focused(), key, init)
const focused = () => document.activeElement as HTMLElement
// the list as text: { section: [[label, keys or gesture]] }
const listed = () =>
  Object.fromEntries(
    [...document.querySelectorAll('.gallerist-shortcuts section')].map((s) => [
      s.querySelector('h3')?.textContent ?? '',
      [...s.querySelectorAll('.gallerist-shortcuts-row')].map((r) => {
        const dd = r.querySelector('dd') as HTMLElement
        const caps = [...dd.querySelectorAll('kbd')].map((k) => k.textContent)
        return [r.querySelector('dt')?.textContent, caps.length ? caps.join(' ') : dd.textContent]
      }),
    ]),
  )
const pointer = (coarse: boolean) => {
  const real = window.matchMedia
  window.matchMedia = ((media: string) => ({
    matches: coarse && media.includes('coarse'),
    media,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  return () => {
    window.matchMedia = real
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('plugin-shortcuts — opening and closing', () => {
  it('? on the viewer opens a modal dialog, named, focused, the rest of the viewer inert', () => {
    setup()
    root().focus()
    press('?', { shiftKey: true })
    const d = dialog() as HTMLElement
    expect(d.getAttribute('role')).toBe('dialog')
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Keyboard shortcuts',
    )
    expect(focused()).toBe(d)
    const scrim = d.parentElement as HTMLElement
    expect(scrim.parentElement).toBe(root())
    for (const child of root().children) expect(child.hasAttribute('inert')).toBe(child !== scrim)
    // the close button: "Esc to close"
    expect(q('.gallerist-shortcuts-close')?.textContent).toBe('Esc to close')
  })

  it('Escape closes it, and only it: the viewer stays open; focus and inert are restored', () => {
    const { v } = setup()
    const tool = q('.gallerist-bar button') as HTMLElement
    tool.focus()
    keydown(tool, '?')
    const ev = press('Escape')
    expect(ev.defaultPrevented).toBe(true)
    expect(dialog()).toBeNull()
    expect(v.getState().phase).toBe('open')
    expect(focused()).toBe(tool)
    expect([...root().children].some((c) => c.hasAttribute('inert'))).toBe(false)
  })

  it('? closes it again; what was inert before stays inert', () => {
    setup()
    const before = root().firstElementChild as HTMLElement
    before.setAttribute('inert', '')
    root().focus()
    press('?')
    press('?')
    expect(dialog()).toBeNull()
    expect(before.hasAttribute('inert')).toBe(true)
    expect(focused()).toBe(root())
  })

  it('not while typing in a field, nor with a modifier', () => {
    setup()
    const input = document.createElement('input')
    q('.gallerist-stage')?.appendChild(input)
    input.focus()
    keydown(input, '?')
    expect(dialog()).toBeNull()
    root().focus()
    press('?', { ctrlKey: true })
    expect(dialog()).toBeNull()
  })

  it('keys in it never reach the viewer: no move, no zoom, no close', () => {
    const { v } = setup(undefined, { plugins: [zoom()] })
    root().focus()
    press('?')
    const seen = vi.fn()
    root().addEventListener('keydown', seen, true)
    for (const key of ['ArrowRight', 'End', '+', '0', 't', '3']) press(key)
    expect(seen).not.toHaveBeenCalled()
    expect(v.getState().cursor).toMatchObject({ g: 0, i: 0 })
    expect(v.getState().zoom.scale).toBe(1)
    expect(dialog()).not.toBeNull()
  })

  it('Tab stays in the dialog: the close button, then the list (which scrolls with the keys)', () => {
    setup()
    root().focus()
    press('?')
    const close = q('.gallerist-shortcuts-close') as HTMLElement
    const body = q('.gallerist-shortcuts-body') as HTMLElement
    expect(body.tabIndex).toBe(0)
    expect(body.hasAttribute('role')).toBe(false) // the dialog's name isn't announced twice
    expect(body.hasAttribute('aria-labelledby')).toBe(false)
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(true) // from the dialog: to the end
    expect(focused()).toBe(body)
    expect(press('Tab').defaultPrevented).toBe(true) // past the end: back to the start
    expect(focused()).toBe(close)
    close.focus()
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(true) // before the start: the end
    expect(focused()).toBe(body)
  })

  it('? typed with AltGr closes it; another chord does not', () => {
    setup()
    root().focus()
    press('?')
    const altGr = new KeyboardEvent('keydown', {
      key: '?',
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(altGr, 'getModifierState', { value: (k: string) => k === 'AltGraph' })
    press('?', { ctrlKey: true })
    expect(dialog()).not.toBeNull()
    focused().dispatchEvent(altGr)
    expect(dialog()).toBeNull()
  })

  it('lets go of its listeners when the viewer goes away with it open', () => {
    setup()
    root().focus()
    press('?')
    const remove = vi.spyOn(window, 'removeEventListener')
    root().remove()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    remove.mockRestore()
  })

  it('the close text puts the Esc key cap where `{key}` is', () => {
    setup({ strings: { toClose: 'Fermer avec {key}' } })
    root().focus()
    press('?')
    const close = q('.gallerist-shortcuts-close') as HTMLElement
    expect(close.textContent).toBe('Fermer avec Esc')
    expect(close.lastChild?.textContent).toBe('')
    expect(close.querySelector('kbd')?.previousSibling?.textContent).toBe('Fermer avec ')
  })

  it('the close button and a press on the scrim close it, focus back; a press on the page too, focus left', () => {
    setup()
    root().focus()
    press('?')
    ;(q('.gallerist-shortcuts-close') as HTMLElement).click()
    expect(dialog()).toBeNull()
    expect(focused()).toBe(root())
    press('?')
    q('.gallerist-shortcuts-row')?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(dialog()).not.toBeNull() // inside
    ;(q('.gallerist-shortcuts-scrim') as HTMLElement).click()
    expect(dialog()).toBeNull()
    expect(focused()).toBe(root())
    press('?')
    const page = document.body.appendChild(document.createElement('button'))
    page.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(dialog()).toBeNull()
    expect(focused()).not.toBe(root()) // left where the press puts it
  })

  it('closes with the viewer; open() does nothing on a closed viewer', () => {
    const { v, plugin } = setup()
    expect(plugin.open()).toBe(true)
    v.close()
    expect(dialog()).toBeNull()
    expect(plugin.open()).toBe(false)
  })

  // 0.4.1 (Apploye): ? did nothing until the opening fade ended, though the other keys worked
  it('? opens it while the viewer is opening, and it stays once open; not while closing', () => {
    const plugin = shortcuts()
    const v = createViewer({ collection: collection(), plugins: [plugin] })
    mount(v)
    // a transition that reports back only when told to (the theme's fade, held)
    const settle: Array<() => void> = []
    getInternals(v).setLifecycleDriver({
      opening: (done) => settle.push(done),
      closing: (done) => settle.push(done),
    })
    v.open()
    expect(v.getState().phase).toBe('opening')
    root().focus()
    press('?', { shiftKey: true })
    expect(dialog()).not.toBeNull()
    expect(focused()).toBe(dialog())
    settle.shift()?.()
    expect(v.getState().phase).toBe('open')
    expect(dialog()).not.toBeNull()
    press('Escape')
    expect(dialog()).toBeNull()
    expect(v.getState().phase).toBe('open')
    // a viewer going away doesn't get it: not on ?, not from the host
    v.close()
    expect(v.getState().phase).toBe('closing')
    root().focus()
    press('?', { shiftKey: true })
    expect(dialog()).toBeNull()
    expect(plugin.open(true)).toBe(false)
    settle.shift()?.()
    expect(v.getState().phase).toBe('closed')
  })

  it('the host opens and closes it: plugin.open() / close(), and the instance', () => {
    const { plugin } = setup()
    expect(plugin.open(true)).toBe(true)
    expect(dialog()?.getAttribute('data-gallerist-list')).toBe('keys')
    plugin.close()
    expect(dialog()).toBeNull()
  })

  it('a destroyed plugin leaves nothing behind', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    const dispose = v.use(shortcuts())
    v.open()
    root().focus()
    press('?')
    const off = vi.spyOn(window, 'removeEventListener')
    dispose()
    expect(dialog()).toBeNull()
    expect(off).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect([...root().children].some((c) => c.hasAttribute('inert'))).toBe(false)
  })
})

describe('plugin-shortcuts — what it lists', () => {
  it('no zoom keys or gestures when no item can zoom (no image)', () => {
    const v = createViewer({
      collection: { groups: [{ id: 'g', items: [{ id: 'v', type: 'video', source: 'v.mp4' }] }] },
      plugins: [shortcuts()],
    })
    mount(v)
    v.open()
    root().focus()
    press('?')
    expect(Object.keys(listed())).toEqual(['Move', 'Viewer'])
    press('Escape')
    const live = getInternals(v)
      .getPlugins()
      .find((p) => p.name === 'shortcuts') as ShortcutsInstance
    live.open(false)
    expect(JSON.stringify(listed())).not.toMatch(/Pinch|Drag/)
  })

  it("with plugin-zoom, its `zoomable` decides: a video that zooms lists the keys, images that don't, none", () => {
    const open = (items: Item[], zoomable: (item: Item) => boolean) => {
      document.body.innerHTML = ''
      const v = createViewer({
        collection: { groups: [{ id: 'g', items }] },
        plugins: [zoom({ zoomable }), shortcuts()],
      })
      mount(v)
      v.open()
      root().focus()
      press('?')
      const sections = Object.keys(listed())
      v.destroy()
      return sections
    }
    const video: Item = { id: 'v', type: 'video', source: 'v.mp4' }
    expect(open([video], (i) => i.type === 'video')).toContain('Zoom')
    expect(open([item('a')], () => false)).not.toContain('Zoom')
  })

  it('a stacked rail: groups on ←/→, items on ↑/↓, Home/End, 1–9; zoom; the rail keys', () => {
    setup(undefined, { plugins: [thumbnails()] })
    root().focus()
    press('?')
    expect(listed()).toEqual({
      Move: [
        ['Previous / next group', '← →'],
        ['Previous / next in the group', '↑ ↓'],
        ['First / last group', 'Home End'],
        ['Item in the group', '1–9'],
      ],
      Zoom: [
        ['Zoom in', '+'],
        ['Zoom out', '−'],
        ['Fit to screen', '0'],
      ],
      Viewer: [
        ['Thumbnails', 'T'],
        ['Item list', 'E'],
        ['This list', '?'],
        ['Close', 'Esc'],
      ],
    })
  })

  it('a row rail walks every item: ←/→ only, no group keys, no item panel', () => {
    setup(undefined, { plugins: [thumbnails({ groupDisplay: 'flat' })] })
    root().focus()
    press('?')
    const list = listed()
    expect(list.Move).toEqual([
      ['Previous / next', '← →'],
      ['First / last', 'Home End'],
    ])
    expect(list.Viewer).toEqual([
      ['Thumbnails', 'T'],
      ['This list', '?'],
      ['Close', 'Esc'],
    ])
  })

  it("a row rail with plugin-thumbnails' clusterKeys: ↑/↓ through a cluster; not down a side rail", () => {
    const rail = () => thumbnails({ groupDisplay: 'flat', cluster: () => 1, clusterKeys: true })
    setup({ strings: { prevNextCluster: 'Other monitor' } }, { plugins: [rail()] })
    root().focus()
    press('?')
    expect(listed().Move).toEqual([
      ['Previous / next', '← →'],
      ['Other monitor', '↑ ↓'],
      ['First / last', 'Home End'],
    ])
    document.body.innerHTML = ''
    setup(undefined, { plugins: [rail()], mountOpts: { rail: 'left' } })
    root().focus()
    press('?')
    expect(listed().Move).toEqual([
      ['Previous / next', '↑ ↓'],
      ['First / last', 'Home End'],
    ])
  })

  it('every group a single item: no item axis', () => {
    setup(undefined, { one: true })
    root().focus()
    press('?')
    expect(listed().Move).toEqual([
      ['Previous / next', '← →'],
      ['First / last', 'Home End'],
    ])
  })

  it('a side rail turns the axes; right to left mirrors ←/→', () => {
    setup(undefined, { plugins: [thumbnails()], mountOpts: { rail: 'left' } })
    root().focus()
    press('?')
    expect(listed().Move?.slice(0, 2)).toEqual([
      ['Previous / next group', '↑ ↓'],
      ['Previous / next in the group', '← →'],
    ])
    document.body.innerHTML = ''
    setup()
    root().setAttribute('data-gallerist-dir', 'rtl')
    root().focus()
    press('?')
    expect(listed().Move?.[0]).toEqual(['Previous / next group', '→ ←'])
  })

  it('the plugins’ keys while they hold them; fullscreen only where it works', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    try {
      setup(undefined, {
        plugins: [fullscreen(), grid(), pins({ onPlace: () => {} }), download({ key: 's' })],
      })
      root().focus()
      press('?')
      expect(listed().Viewer).toEqual([
        ['Fullscreen', 'F'],
        ['Grid', 'G'],
        ['Pins', 'P'],
        ['Add a comment', 'C'],
        ['Download', 'S'],
        ['This list', '?'],
        ['Close', 'Esc'],
      ])
    } finally {
      // biome-ignore lint/performance/noDelete: back to the prototype's
      delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled
    }
    document.body.innerHTML = ''
    setup(undefined, { plugins: [fullscreen()] }) // happy-dom has no fullscreen
    root().focus()
    press('?')
    expect(listed().Viewer?.map(([l]) => l)).toEqual(['This list', 'Close'])
  })

  it('an inline viewer has no Esc to close it, nor a swipe down', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const { plugin } = setup(undefined, { mountOpts: { container } })
    plugin.open(true)
    expect(listed().Viewer).toEqual([['This list', '?']])
    plugin.close()
    plugin.open(false)
    expect(listed()['']?.map(([l]) => l)).not.toContain('Close')
  })

  it('the host’s entries: into the Viewer section, a named built-in one, or a new one', () => {
    setup({
      shortcuts: [
        { keys: ['N'], label: 'Add a note' },
        { keys: ['Shift', 'N'], label: 'Next note', section: 'Move' },
        { keys: ['A'], label: 'Approve', section: 'Review' },
        { gesture: 'Long press', label: 'Pin it' }, // gestures only
      ],
    })
    root().focus()
    press('?')
    const list = listed()
    expect(list.Viewer?.at(-1)).toEqual(['Add a note', 'N'])
    expect(list.Move?.at(-1)).toEqual(['Next note', 'Shift N'])
    expect(list.Review).toEqual([['Approve', 'A']])
    expect(Object.keys(list)).toEqual(['Move', 'Zoom', 'Viewer', 'Review'])
    expect(JSON.stringify(list)).not.toContain('Pin it')
  })

  it('the gestures: swipes, pinch, drag; the swipe up with grouped items; the host’s with one', () => {
    const { plugin } = setup(
      { shortcuts: [{ keys: ['N'], label: 'Add a note', gesture: 'Long press' }] },
      { plugins: [thumbnails()] },
    )
    plugin.open(false)
    const d = dialog() as HTMLElement
    expect(d.getAttribute('data-gallerist-list')).toBe('gestures')
    expect(document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Gestures',
    )
    expect(q('.gallerist-shortcuts-close')?.getAttribute('aria-label')).toBe('Close')
    expect(listed()).toEqual({
      '': [
        ['Previous / next group', 'Swipe left or right'],
        ['Next in the group', 'Swipe up'],
        ['Zoom', 'Pinch, or double-tap'],
        ['Move while zoomed', 'Drag'],
        ['Close', 'Swipe down'],
        ['Add a note', 'Long press'],
      ],
    })
    expect(q('.gallerist-shortcuts-note')?.textContent).toBe(
      'With a keyboard, ? lists its shortcuts.',
    )
  })

  it('by default, the gestures on a coarse pointer and the keys otherwise; the label says which', () => {
    const restore = pointer(true)
    try {
      const plugin = shortcuts()
      const v = createViewer({ collection: collection(), plugins: [plugin] })
      mount(v)
      v.open()
      const instance = getInternals(v)
        .getPlugins()
        .find((p) => p.name === 'shortcuts') as ShortcutsInstance
      expect(instance.label).toBe('Gestures')
      plugin.open()
      expect(dialog()?.getAttribute('data-gallerist-list')).toBe('gestures')
      expect(instance.isOpen).toBe(true)
      plugin.close()
      root().focus()
      press('?') // a keyboard: the keys, whatever the pointer
      expect(dialog()?.getAttribute('data-gallerist-list')).toBe('keys')
      press('Escape')
    } finally {
      restore()
    }
  })

  it('strings translate every label', () => {
    const { plugin } = setup({
      strings: { title: 'Tastenkürzel', move: 'Bewegen', home: 'Pos1', end: 'Ende', esc: 'Esc' },
    })
    plugin.open(true)
    const list = listed()
    expect(Object.keys(list)[0]).toBe('Bewegen')
    expect(list.Bewegen?.at(-2)?.[1]).toBe('Pos1 Ende')
  })
})

describe('plugin-shortcuts — with the View menu', () => {
  it('the popover’s last row names the list and opens it; Escape brings focus back to View', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails(), view(), shortcuts()],
    })
    mount(v)
    v.open()
    const btn = q('.gallerist-view-btn') as HTMLButtonElement
    btn.click()
    const foot = q('.gallerist-view-foot') as HTMLButtonElement
    expect(foot.textContent).toBe('Keyboard shortcuts?')
    foot.click()
    expect(q('.gallerist-view-menu')).toBeNull()
    expect(dialog()?.getAttribute('data-gallerist-list')).toBe('keys')
    press('Escape')
    expect(dialog()).toBeNull()
    expect(focused()).toBe(btn)
    // ? from inside the popover
    btn.click()
    press('?')
    expect(dialog()).not.toBeNull()
  })

  it('on a coarse pointer the row reads Gestures and opens them', () => {
    const restore = pointer(true)
    try {
      const v = createViewer({ collection: collection(), plugins: [view(), shortcuts()] })
      mount(v)
      v.open()
      ;(q('.gallerist-view-btn') as HTMLButtonElement).click()
      const foot = q('.gallerist-view-foot') as HTMLButtonElement
      expect(foot.textContent).toBe('Gestures?')
      foot.click()
      expect(dialog()?.getAttribute('data-gallerist-list')).toBe('gestures')
    } finally {
      restore()
    }
  })
})
