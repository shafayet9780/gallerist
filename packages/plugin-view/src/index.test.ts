// @vitest-environment happy-dom

import {
  type Collection,
  type Item,
  type Plugin,
  type PluginInstance,
  createViewer,
} from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { type MountOptions, applyAppearance, mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ThumbnailsInstance, thumbnails } from '../../plugin-thumbnails/src/index'
import { type ViewOptions, type ViewState, view } from './index'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1'), item('b2')] },
    { id: 'g2', items: [item('c0'), item('c1')] },
  ],
})

const setup = (
  opts?: ViewOptions,
  { rail = true, mountOpts = {} as MountOptions, before = false } = {},
) => {
  const own: Plugin[] = rail ? [thumbnails()] : []
  const plugins = before ? [view(opts), ...own] : [...own, view(opts)]
  const v = createViewer({ collection: collection(), plugins })
  const handle = mount(v, mountOpts)
  v.open()
  return { v, handle }
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const root = () => q('.gallerist') as HTMLElement
const btn = () => q('.gallerist-view-btn') as HTMLButtonElement
const menu = () => q('[role="menu"]')
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
const labels = () => items().map((i) => i.textContent)
const checked = () =>
  items()
    .filter((i) => i.getAttribute('aria-checked') === 'true')
    .map((i) => i.textContent)
const itemNamed = (name: string) => items().find((i) => i.textContent === name) as HTMLElement
const keydown = (el: Element, key: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
const focused = () => document.activeElement as HTMLElement
const railOf = (v: ReturnType<typeof createViewer>) =>
  getInternals(v)
    .getPlugins()
    .find((p) => p.name === 'thumbnails') as ThumbnailsInstance

afterEach(() => {
  document.body.innerHTML = ''
})

// a system in the dark scheme (happy-dom's matchMedia answers light)
const darkSystem = () => {
  const real = window.matchMedia
  window.matchMedia = ((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  return () => {
    window.matchMedia = real
  }
}
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
// the menu's width (happy-dom lays nothing out)
const menuWidth = (w: number) => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList.contains('gallerist-view-menu') ? w : 0
    },
  })
  return () => {
    // biome-ignore lint/performance/noDelete: restore the prototype's own getter
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth
  }
}

describe('plugin-view — the menu button', () => {
  it('adds one bar tool: a named menu button with the shared icon', () => {
    setup()
    expect(document.querySelectorAll('.gallerist-region-toolbar .gallerist-view-btn').length).toBe(
      1,
    )
    expect(btn().getAttribute('aria-label')).toBe('View')
    expect(btn().getAttribute('aria-haspopup')).toBe('menu')
    expect(btn().getAttribute('aria-expanded')).toBe('false')
    expect(btn().hasAttribute('aria-controls')).toBe(false)
    expect(btn().querySelector('svg.gallerist-icon')).not.toBeNull()
    expect(menu()).toBeNull()
  })

  it('a click opens the menu: Rail and Scheme groups of radio items, the first one focused', () => {
    setup()
    btn().click()
    const m = menu() as HTMLElement
    expect(m.getAttribute('aria-label')).toBe('View')
    expect(btn().getAttribute('aria-expanded')).toBe('true')
    expect(btn().getAttribute('aria-controls')).toBe(m.id)
    const groups = [...m.querySelectorAll('[role="group"]')]
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Rail', 'Scheme'])
    // the visible headings are the groups' names, not read twice
    expect(
      [...m.querySelectorAll('.gallerist-view-heading')].map((h) => h.getAttribute('aria-hidden')),
    ).toEqual(['true', 'true'])
    expect(labels()).toEqual(['Stacked', 'Row', 'Dark', 'Light'])
    expect(checked()).toEqual(['Stacked', 'Dark'])
    expect(items().every((i) => i.tabIndex === -1)).toBe(true)
    expect(focused()).toBe(items()[0])
    // it lives in the viewer, outside the toolbar's scrolling strip
    expect(m.parentElement).toBe(root())
  })

  it('a second click on the button closes it', () => {
    setup()
    btn().click()
    btn().click()
    expect(menu()).toBeNull()
    expect(btn().getAttribute('aria-expanded')).toBe('false')
    expect(btn().hasAttribute('aria-controls')).toBe(false)
  })

  it('↓ / ↑ on the button open it on the first / last item, without moving the viewer', () => {
    const { v } = setup()
    v.goTo(1, 1)
    btn().focus()
    keydown(btn(), 'ArrowDown')
    expect(focused()).toBe(items()[0])
    keydown(focused(), 'Escape')
    keydown(btn(), 'ArrowUp')
    expect(focused()).toBe(items()[3])
    expect(v.getState().cursor).toMatchObject({ g: 1, i: 1 })
  })
})

describe('plugin-view — keyboard inside the menu', () => {
  it('↑/↓ move through every item and wrap; Home/End jump; ←/→ stay', () => {
    const { v } = setup()
    btn().click()
    keydown(focused(), 'ArrowDown')
    expect(focused().textContent).toBe('Row')
    keydown(focused(), 'ArrowDown')
    expect(focused().textContent).toBe('Dark') // across the group boundary
    keydown(focused(), 'End')
    expect(focused().textContent).toBe('Light')
    keydown(focused(), 'ArrowDown')
    expect(focused().textContent).toBe('Stacked') // wraps
    keydown(focused(), 'ArrowUp')
    expect(focused().textContent).toBe('Light')
    keydown(focused(), 'Home')
    expect(focused().textContent).toBe('Stacked')
    keydown(focused(), 'ArrowRight')
    keydown(focused(), 'ArrowLeft')
    expect(focused().textContent).toBe('Stacked')
    expect(v.getState().cursor).toMatchObject({ g: 0, i: 0 }) // the viewer didn't move
  })

  it('a letter moves to the next item starting with it', () => {
    setup()
    btn().click()
    keydown(focused(), 'l')
    expect(focused().textContent).toBe('Light')
    keydown(focused(), 'R')
    expect(focused().textContent).toBe('Row')
    keydown(focused(), 'z') // no match: stays
    expect(focused().textContent).toBe('Row')
  })

  it('handled keys are kept from the viewer and the page', () => {
    setup()
    btn().click()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    const seen = vi.fn()
    root().addEventListener('keydown', seen)
    focused().dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(seen).not.toHaveBeenCalled()
  })

  it('Escape closes the menu, focus back on the button; the viewer stays open', () => {
    const { v } = setup()
    btn().click()
    keydown(focused(), 'Escape')
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(v.getState().phase).not.toBe('closing')
    expect(q('.gallerist')).not.toBeNull()
  })

  it('Tab closes the menu and leaves focus to move on from the button', () => {
    setup()
    btn().click()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    // what the menu did with it (the viewer's own focus trap handles Tab after it)
    let prevented: boolean | undefined
    menu()?.addEventListener('keydown', (e) => {
      prevented = e.defaultPrevented
    })
    focused().dispatchEvent(ev)
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(prevented).toBe(false) // the browser's Tab goes on from there
  })

  it('Enter chooses the focused item and closes; Space too', () => {
    const { v } = setup()
    btn().click()
    keydown(focused(), 'ArrowDown') // Row
    keydown(focused(), 'Enter')
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(railOf(v).display).toBe('flat')
    btn().click()
    keydown(focused(), 'End') // Light
    keydown(focused(), ' ')
    expect(menu()).toBeNull()
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
  })
})

describe('plugin-view — pointer', () => {
  it('a click on an item chooses it and closes the menu', () => {
    const { v } = setup()
    v.goTo(1, 1)
    btn().click()
    itemNamed('Row').click()
    expect(menu()).toBeNull()
    expect(railOf(v).display).toBe('flat')
    expect(v.getState().cursor).toMatchObject({ g: 1, i: 1 })
    expect(root().getAttribute('data-gallerist-linear')).toBe('true')
    btn().click()
    expect(checked()).toEqual(['Row', 'Dark'])
  })

  it('a press outside closes it without taking focus; a press inside does not', () => {
    setup()
    btn().click()
    const inside = items()[1] as HTMLElement
    inside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu()).not.toBeNull()
    const outside = q('.gallerist-stage') as HTMLElement
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu()).toBeNull()
    expect(btn().getAttribute('aria-expanded')).toBe('false')
  })

  it('a mouse press in the menu doesn’t move focus out of it', () => {
    setup()
    btn().click()
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    q('.gallerist-view-heading')?.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('sits under the button, its end on the button’s, kept inside the viewer', () => {
    setup()
    root().getBoundingClientRect = () => rect(0, 0, 390, 800)
    btn().getBoundingClientRect = () => rect(300, 10, 44, 44)
    const restore = menuWidth(180)
    try {
      btn().click()
      expect((menu() as HTMLElement).style.top).toBe('60px')
      expect((menu() as HTMLElement).style.left).toBe('164px') // 344 − 180
      ;(menu() as HTMLElement).remove()
      btn().click() // closes (the plugin still counts it open)
      btn().getBoundingClientRect = () => rect(20, 10, 44, 44)
      root().setAttribute('data-gallerist-dir', 'rtl')
      btn().click()
      expect((menu() as HTMLElement).style.left).toBe('20px') // its start on the button's
      btn().click()
      root().removeAttribute('data-gallerist-dir')
      btn().click()
      expect((menu() as HTMLElement).style.left).toBe('8px') // 64 − 180, kept 8px inside
    } finally {
      restore()
    }
  })

  it('a press inside the menu of a viewer in a shadow root keeps it open', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const container = document.createElement('div')
    host.attachShadow({ mode: 'open' }).appendChild(container)
    const v = createViewer({ collection: collection(), plugins: [thumbnails(), view()] })
    mount(v, { container })
    v.open()
    const button = container.querySelector('.gallerist-view-btn') as HTMLButtonElement
    button.click()
    const inside = container.querySelector('[role="menuitemradio"]') as HTMLElement
    expect(inside).not.toBeNull()
    inside.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(container.querySelector('[role="menu"]')).not.toBeNull()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('follows its button when the toolbar’s strip scrolls', () => {
    setup()
    root().getBoundingClientRect = () => rect(0, 0, 390, 800)
    btn().getBoundingClientRect = () => rect(300, 10, 44, 44)
    const restore = menuWidth(180)
    try {
      btn().click()
      expect((menu() as HTMLElement).style.left).toBe('164px')
      btn().getBoundingClientRect = () => rect(250, 10, 44, 44) // the strip scrolled 50px
      q('.gallerist-region-toolbar')?.dispatchEvent(new Event('scroll'))
      expect((menu() as HTMLElement).style.left).toBe('114px')
    } finally {
      restore()
    }
  })

  it('closes when the viewer closes', () => {
    const { v } = setup()
    btn().click()
    v.close()
    expect(menu()).toBeNull()
  })
})

describe('plugin-view — sections and choices', () => {
  it('no Rail section without a thumbnails rail', () => {
    setup(undefined, { rail: false })
    btn().click()
    expect(
      [...document.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Scheme'])
    expect(labels()).toEqual(['Dark', 'Light'])
  })

  it('the Rail section follows a rail added after mount', () => {
    const { v } = setup(undefined, { rail: false })
    v.use(thumbnails())
    btn().click()
    expect(labels()).toEqual(['Stacked', 'Row', 'Dark', 'Light'])
  })

  it('choices and sections come from the options, labels from the strings', () => {
    setup({
      rail: ['flat', 'stacked', 'index'],
      scheme: ['light', 'dark', 'auto'],
      strings: { menu: 'Ansicht', rail: 'Leiste', flat: 'Reihe', auto: 'System' },
    })
    expect(btn().getAttribute('aria-label')).toBe('Ansicht')
    btn().click()
    expect(menu()?.getAttribute('aria-label')).toBe('Ansicht')
    expect(
      [...document.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Leiste', 'Scheme'])
    expect(labels()).toEqual(['Reihe', 'Stacked', 'Index', 'Light', 'Dark', 'System'])
  })

  it('a section set to false is left out', () => {
    setup({ scheme: false })
    expect(btn().hidden).toBe(false)
    btn().click()
    expect(labels()).toEqual(['Stacked', 'Row'])
  })

  it('with no section to show the button is hidden (marked off), and shows when a rail comes', async () => {
    const { v } = setup({ scheme: false }, { rail: false, mountOpts: { controls: false } })
    const bar = q('.gallerist-bar') as HTMLElement
    expect(btn().hidden).toBe(true)
    expect(btn().hasAttribute('data-gallerist-off')).toBe(true)
    expect(bar.hidden).toBe(true) // a bar without built-in controls doesn't show for it alone
    const dispose = v.use(thumbnails({ groupDisplay: 'flat' })) // its own toggle is off too
    await Promise.resolve() // once the renderer has built the rail
    expect(btn().hidden).toBe(false)
    expect(btn().hasAttribute('data-gallerist-off')).toBe(false)
    expect(bar.hidden).toBe(false)
    btn().click()
    expect(labels()).toEqual(['Stacked', 'Row'])
    dispose()
    await Promise.resolve()
    expect(menu()).toBeNull()
    expect(btn().hidden).toBe(true)
    expect(bar.hidden).toBe(true)
  })

  it('a rail registered after it shows the button once built, whatever the plugin order', async () => {
    setup({ scheme: false }, { before: true, mountOpts: { controls: false } })
    await Promise.resolve()
    expect(btn().hidden).toBe(false)
    expect((q('.gallerist-bar') as HTMLElement).hidden).toBe(false)
    btn().click()
    expect(labels()).toEqual(['Stacked', 'Row'])
  })

  it('a rail that never builds (another renderer’s) has no section: the button stays hidden', async () => {
    // registered, but nothing mounts it: no display to show, nothing to switch
    const unbuilt: Plugin = () => ({ name: 'thumbnails', setDisplay() {} }) as PluginInstance
    const v = createViewer({
      collection: collection(),
      plugins: [unbuilt, view({ scheme: false })],
    })
    mount(v)
    v.open()
    await Promise.resolve()
    expect(btn().hidden).toBe(true)
    expect(btn().hasAttribute('data-gallerist-off')).toBe(true)
  })

  it('checks the scheme in effect: the skin’s default, the one set, or auto when offered', () => {
    setup(undefined, { mountOpts: { skin: 'editorial' } })
    btn().click()
    expect(checked()).toEqual(['Stacked', 'Light']) // Editorial is light by default
    document.body.innerHTML = ''
    setup(undefined, { mountOpts: { scheme: 'light' } })
    btn().click()
    expect(checked()).toEqual(['Stacked', 'Light'])
    document.body.innerHTML = ''
    setup({ scheme: ['dark', 'light', 'auto'] }, { mountOpts: { scheme: 'auto' } })
    btn().click()
    expect(checked()).toEqual(['Stacked', 'Auto'])
  })
})

describe('plugin-view — who applies a choice', () => {
  it('uncontrolled: the plugin applies it and reports the one setting picked', () => {
    const onChange = vi.fn()
    const { v } = setup({ onChange })
    btn().click()
    itemNamed('Row').click()
    expect(railOf(v).display).toBe('flat')
    expect(onChange).toHaveBeenLastCalledWith({ rail: 'flat' })
    btn().click()
    itemNamed('Light').click()
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
    btn().click()
    itemNamed('Stacked').click()
    expect(railOf(v).display).toBe('stacked')
    expect(onChange).toHaveBeenLastCalledWith({ rail: 'stacked' })
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('choosing what is already stored reports nothing', () => {
    const onChange = vi.fn()
    setup({ onChange }, { mountOpts: { scheme: 'dark' } })
    btn().click()
    itemNamed('Stacked').click()
    btn().click()
    itemNamed('Dark').click()
    expect(onChange).not.toHaveBeenCalled()
    expect(menu()).toBeNull()
  })

  it('on a viewer following the system (auto): a rail change reports the rail only', () => {
    const restore = darkSystem()
    try {
      const onChange = vi.fn()
      setup({ onChange }, { mountOpts: { scheme: 'auto' } })
      btn().click()
      expect(checked()).toEqual(['Stacked', 'Dark']) // the scheme in effect is checked
      itemNamed('Row').click()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenLastCalledWith({ rail: 'flat' })
      expect(root().getAttribute('data-gallerist-scheme')).toBe('auto') // still the system's
    } finally {
      restore()
    }
  })

  it('Dark picked while auto (or nothing) shows dark stores dark', () => {
    const restore = darkSystem()
    try {
      for (const scheme of ['auto', undefined] as const) {
        const onChange = vi.fn()
        setup({ onChange }, { mountOpts: { scheme } })
        btn().click()
        expect(checked()).toEqual(['Stacked', 'Dark'])
        itemNamed('Dark').click()
        expect(root().getAttribute('data-gallerist-scheme')).toBe('dark')
        expect(onChange).toHaveBeenLastCalledWith({ scheme: 'dark' })
        document.body.innerHTML = ''
      }
    } finally {
      restore()
    }
  })

  it('controlled: the choice is only reported; the menu shows what the host applies', () => {
    const onChange = vi.fn()
    const { v } = setup({ controlled: true, onChange })
    btn().click()
    itemNamed('Row').click()
    expect(onChange).toHaveBeenLastCalledWith({ rail: 'flat' })
    expect(railOf(v).display).toBe('stacked') // not applied
    btn().click()
    itemNamed('Light').click()
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
    expect(root().hasAttribute('data-gallerist-scheme')).toBe(false)
    btn().click()
    expect(checked()).toEqual(['Stacked', 'Dark'])
    keydown(focused(), 'Escape')
    // the host applies them its own way
    railOf(v).setDisplay('flat')
    applyAppearance(root(), { scheme: 'light' })
    btn().click()
    expect(checked()).toEqual(['Row', 'Light'])
  })

  it('controlled per setting: the plugin applies the rest', () => {
    const onChange = vi.fn()
    const { v } = setup({ controlled: ['scheme'], onChange })
    btn().click()
    itemNamed('Row').click()
    expect(railOf(v).display).toBe('flat')
    btn().click()
    itemNamed('Light').click()
    expect(root().hasAttribute('data-gallerist-scheme')).toBe(false)
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
  })

  it('a host’s mark on the viewer controls a setting as the option does', async () => {
    const onChange = vi.fn()
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails(), view({ initial: { rail: 'flat', scheme: 'light' }, onChange })],
    })
    ;(v as unknown as Record<symbol, unknown>)[Symbol.for('gallerist.controlled')] = ['scheme']
    mount(v, { scheme: 'dark' })
    v.open()
    await Promise.resolve()
    expect(railOf(v).display).toBe('flat') // the plugin's
    expect(root().getAttribute('data-gallerist-scheme')).toBe('dark') // the host's
    btn().click()
    itemNamed('Light').click()
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
    expect(root().getAttribute('data-gallerist-scheme')).toBe('dark')
  })

  it('unknown initial values (old or edited storage) are ignored', async () => {
    const { v } = setup({ initial: { rail: 'diagonal', scheme: 'blue' } as unknown as ViewState })
    await Promise.resolve()
    expect(railOf(v).display).toBe('stacked')
    expect(root().hasAttribute('data-gallerist-scheme')).toBe(false)
  })

  it('initial values apply when the viewer mounts, whatever the plugin order', () => {
    for (const before of [false, true]) {
      const { v } = setup({ initial: { rail: 'flat', scheme: 'light' } }, { before })
      expect(railOf(v).display).toBe('flat')
      expect(q('.gallerist-thumbs')?.getAttribute('data-display')).toBe('flat')
      expect(root().getAttribute('data-gallerist-linear')).toBe('true')
      document.body.innerHTML = ''
    }
  })

  it('the initial scheme lands on the root once the button is in it', async () => {
    setup({ initial: { scheme: 'light' } })
    await Promise.resolve()
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
  })

  it('initial values are ignored for a controlled setting', async () => {
    const { v } = setup({ initial: { rail: 'flat', scheme: 'light' }, controlled: true })
    await Promise.resolve()
    expect(railOf(v).display).toBe('stacked')
    expect(root().hasAttribute('data-gallerist-scheme')).toBe(false)
  })

  it('the user’s choices carry over to a new mount of the viewer', async () => {
    const v = createViewer({ collection: collection(), plugins: [thumbnails(), view()] })
    const first = mount(v)
    v.open()
    btn().click()
    itemNamed('Light').click()
    first.destroy()
    mount(v)
    await Promise.resolve()
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
  })

  it('two viewers from one view(): each keeps its own choices', async () => {
    const plugin = view()
    const a = createViewer({ collection: collection(), plugins: [thumbnails(), plugin] })
    const first = mount(a)
    a.open()
    btn().click()
    itemNamed('Light').click()
    btn().click()
    itemNamed('Row').click()
    first.destroy()
    const b = createViewer({ collection: collection(), plugins: [thumbnails(), plugin] })
    mount(b)
    b.open()
    await Promise.resolve()
    expect(root().hasAttribute('data-gallerist-scheme')).toBe(false)
    expect(railOf(b).display).toBe('stacked')
  })

  it('a renderer destroyed under the open menu: its listeners go with the next press or resize', () => {
    for (const next of ['resize', 'pointerdown'] as const) {
      const { handle } = setup()
      btn().click()
      const offDoc = vi.spyOn(document, 'removeEventListener')
      const offWin = vi.spyOn(window, 'removeEventListener')
      handle.destroy()
      if (next === 'resize') window.dispatchEvent(new Event('resize'))
      else document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      expect(offDoc).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
      expect(offWin).toHaveBeenCalledWith('resize', expect.any(Function))
      offDoc.mockRestore()
      offWin.mockRestore()
      document.body.innerHTML = ''
    }
  })

  it('a destroyed plugin leaves no menu or listener behind', () => {
    const v = createViewer({ collection: collection() })
    mount(v)
    const dispose = v.use(view())
    v.open()
    btn().click()
    const remove = vi.spyOn(document, 'removeEventListener')
    dispose()
    expect(menu()).toBeNull()
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(q('.gallerist-view-btn')).toBeNull()
  })
})
