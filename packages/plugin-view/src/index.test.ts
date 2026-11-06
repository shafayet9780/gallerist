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
const menu = () => q('.gallerist-view-menu[role="dialog"]')
const items = () => [...document.querySelectorAll<HTMLElement>('[role="radio"]')]
const labels = () => items().map((i) => i.textContent)
const checked = () =>
  items()
    .filter((i) => i.getAttribute('aria-checked') === 'true')
    .map((i) => i.textContent)
const itemNamed = (name: string) => items().find((i) => i.textContent === name) as HTMLElement
const groupNames = () =>
  [...document.querySelectorAll('[role="radiogroup"]')].map(
    (g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent,
  )
// a choice by pointer: opens the popover if it's closed, clicks the segment
const pick = (name: string) => {
  if (!menu()) btn().click()
  itemNamed(name).click()
}
const keydown = (el: Element, key: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
const focused = () => document.activeElement as HTMLElement
// plugin-shortcuts' instance, as the popover's footer row finds it
const fakeHelp = (label = 'Keyboard shortcuts') => {
  const open = vi.fn()
  const plugin: Plugin = () => ({ name: 'shortcuts', label, open }) as PluginInstance
  return { plugin, open }
}
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

describe('plugin-view — the button', () => {
  it('adds one bar tool: a named button that opens a dialog, with the shared icon', () => {
    setup()
    expect(document.querySelectorAll('.gallerist-region-toolbar .gallerist-view-btn').length).toBe(
      1,
    )
    expect(btn().getAttribute('aria-label')).toBe('View')
    expect(btn().getAttribute('aria-haspopup')).toBe('dialog')
    expect(btn().getAttribute('aria-expanded')).toBe('false')
    expect(btn().hasAttribute('aria-controls')).toBe(false)
    expect(btn().querySelector('svg.gallerist-icon')).not.toBeNull()
    expect(menu()).toBeNull()
  })

  it('a click opens the popover: a Layout and a Theme radio group, focus on the first checked', () => {
    setup()
    btn().click()
    const m = menu() as HTMLElement
    expect(m.getAttribute('aria-label')).toBe('View')
    expect(m.hasAttribute('aria-modal')).toBe(false) // a popover: the viewer stays usable
    expect(btn().getAttribute('aria-expanded')).toBe('true')
    expect(btn().getAttribute('aria-controls')).toBe(m.id)
    // each group is named by its visible label
    expect(groupNames()).toEqual(['Layout', 'Theme'])
    expect(labels()).toEqual(['Stacked', 'Row', 'Dark', 'Light'])
    expect(checked()).toEqual(['Stacked', 'Dark'])
    // every segment is a button with a glyph; roving focus: one tab stop per group, the checked one
    expect(items().every((i) => i.tagName === 'BUTTON' && i.querySelector('svg'))).toBe(true)
    expect(items().map((i) => i.tabIndex)).toEqual([0, -1, 0, -1])
    expect(focused()).toBe(itemNamed('Stacked'))
    // it lives in the viewer, outside the toolbar's scrolling strip
    expect(m.parentElement).toBe(root())
    // no shortcut row without plugin-shortcuts
    expect(q('.gallerist-view-foot')).toBeNull()
  })

  it('a second click on the button closes it', () => {
    setup()
    btn().click()
    btn().click()
    expect(menu()).toBeNull()
    expect(btn().getAttribute('aria-expanded')).toBe('false')
    expect(btn().hasAttribute('aria-controls')).toBe(false)
  })

  it('↓ / ↑ on the button open it on the first / last stop, without moving the viewer', () => {
    const { v } = setup()
    v.goTo(1, 1)
    btn().focus()
    keydown(btn(), 'ArrowDown')
    expect(focused()).toBe(itemNamed('Stacked'))
    keydown(focused(), 'Escape')
    keydown(btn(), 'ArrowUp')
    expect(focused()).toBe(itemNamed('Dark'))
    expect(v.getState().cursor).toMatchObject({ g: 1, i: 1 })
  })
})

describe('plugin-view — keyboard inside the popover', () => {
  it('←/→ move through a group and choose the segment they reach, wrapping; ↑/↓ too', () => {
    const onChange = vi.fn()
    const { v } = setup({ onChange })
    btn().click()
    keydown(focused(), 'ArrowRight')
    expect(focused().textContent).toBe('Row')
    expect(checked()).toEqual(['Row', 'Dark']) // selection follows focus
    expect(railOf(v).display).toBe('flat')
    expect(itemNamed('Row').tabIndex).toBe(0)
    expect(itemNamed('Stacked').tabIndex).toBe(-1)
    keydown(focused(), 'ArrowRight') // wraps, within the group
    expect(focused().textContent).toBe('Stacked')
    keydown(focused(), 'ArrowLeft')
    expect(focused().textContent).toBe('Row')
    keydown(focused(), 'ArrowDown')
    expect(focused().textContent).toBe('Stacked')
    keydown(focused(), 'ArrowUp')
    expect(focused().textContent).toBe('Row')
    expect(menu()).not.toBeNull() // it stays open
    expect(onChange.mock.calls.map(([c]) => c)).toEqual([
      { rail: 'flat' },
      { rail: 'stacked' },
      { rail: 'flat' },
      { rail: 'stacked' },
      { rail: 'flat' },
    ])
    expect(v.getState().cursor).toMatchObject({ g: 0, i: 0 }) // the viewer didn't move
  })

  it('right to left, ← moves to the next segment and → to the previous', () => {
    setup()
    root().setAttribute('data-gallerist-dir', 'rtl')
    btn().click()
    keydown(focused(), 'ArrowLeft')
    expect(focused().textContent).toBe('Row')
    keydown(focused(), 'ArrowRight')
    expect(focused().textContent).toBe('Stacked')
  })

  it('every key but Tab is kept from the viewer and the page; handled ones are prevented', () => {
    const { v } = setup()
    btn().click()
    const seen = vi.fn()
    root().addEventListener('keydown', seen)
    for (const key of ['ArrowRight', 'End', 'f', 't', '1']) {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      focused().dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(key === 'ArrowRight')
    }
    expect(seen).not.toHaveBeenCalled()
    expect(v.getState().cursor).toMatchObject({ g: 0, i: 0 })
  })

  it('Escape closes the popover, focus back on the button; the viewer stays open', () => {
    const { v } = setup()
    btn().click()
    keydown(focused(), 'Escape')
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(v.getState().phase).not.toBe('closing')
    expect(q('.gallerist')).not.toBeNull()
  })

  it('Tab moves between the groups; past the last stop it closes and moves on from the button', () => {
    setup()
    btn().click()
    // the stops in order: each group's checked segment
    const tab = (shiftKey = false) => {
      const ev = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
      // what the popover did with it (the viewer's own focus trap handles Tab after it)
      let prevented: boolean | undefined
      menu()?.addEventListener('keydown', (e) => {
        prevented = e.defaultPrevented
      })
      focused().dispatchEvent(ev)
      return prevented
    }
    expect(tab()).toBe(false) // the browser moves on to Dark
    expect(menu()).not.toBeNull()
    itemNamed('Dark').focus()
    expect(tab()).toBe(false) // the browser's Tab goes on from the button
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    btn().click()
    expect(tab(true)).toBe(true) // back from the first stop: to the button, and no further
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
  })

  it('Enter chooses the focused segment and closes; Space chooses and stays', () => {
    const { v } = setup()
    btn().click()
    itemNamed('Row').focus()
    keydown(focused(), 'Enter')
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(railOf(v).display).toBe('flat')
    btn().click()
    itemNamed('Light').focus()
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    focused().dispatchEvent(space)
    expect(space.defaultPrevented).toBe(false) // the button's own activation chooses it
    focused().click()
    expect(menu()).not.toBeNull()
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
  })
})

describe('plugin-view — the shortcut list row', () => {
  it('with plugin-shortcuts: a footer row named by its label, after the groups', () => {
    const help = fakeHelp()
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails(), view(), help.plugin],
    })
    mount(v)
    v.open()
    btn().click()
    const foot = q('.gallerist-view-foot') as HTMLButtonElement
    expect(foot.tagName).toBe('BUTTON')
    expect(foot.textContent).toBe('Keyboard shortcuts?')
    expect(foot.querySelector('kbd')?.getAttribute('aria-hidden')).toBe('true')
    expect(menu()?.lastElementChild).toBe(foot)
    // a tab stop after the groups: ↑ on the button opens on it
    keydown(focused(), 'Escape')
    keydown(btn(), 'ArrowUp')
    expect(focused()).toBe(q('.gallerist-view-foot'))
  })

  it('pressing it closes the popover, focus on the button, and opens the list', () => {
    const help = fakeHelp('Gestures')
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails(), view(), help.plugin],
    })
    mount(v)
    v.open()
    btn().click()
    const foot = q('.gallerist-view-foot') as HTMLButtonElement
    expect(foot.textContent).toBe('Gestures?') // the list's own label: gestures on a touch screen
    foot.click()
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(help.open).toHaveBeenCalledWith()
  })

  it('? in the popover opens the keys, from the button', () => {
    const help = fakeHelp()
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails(), view(), help.plugin],
    })
    mount(v)
    v.open()
    btn().click()
    keydown(focused(), '?', { shiftKey: true })
    expect(menu()).toBeNull()
    expect(focused()).toBe(btn())
    expect(help.open).toHaveBeenCalledWith(true)
  })
})

describe('plugin-view — pointer', () => {
  it('a click on a segment chooses it; the popover stays open, showing it', () => {
    const { v } = setup()
    v.goTo(1, 1)
    pick('Row')
    expect(menu()).not.toBeNull()
    expect(railOf(v).display).toBe('flat')
    expect(checked()).toEqual(['Row', 'Dark'])
    expect(v.getState().cursor).toMatchObject({ g: 1, i: 1 })
    expect(root().getAttribute('data-gallerist-linear')).toBe('true')
    itemNamed('Light').click()
    expect(checked()).toEqual(['Row', 'Light'])
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

  it('a mouse press in the popover doesn’t move focus out of it', () => {
    setup()
    btn().click()
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    q('.gallerist-view-label')?.dispatchEvent(ev)
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

  it('a press inside the popover of a viewer in a shadow root keeps it open', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const container = document.createElement('div')
    host.attachShadow({ mode: 'open' }).appendChild(container)
    const v = createViewer({ collection: collection(), plugins: [thumbnails(), view()] })
    mount(v, { container })
    v.open()
    const button = container.querySelector('.gallerist-view-btn') as HTMLButtonElement
    button.click()
    const inside = container.querySelector('[role="radio"]') as HTMLElement
    expect(inside).not.toBeNull()
    inside.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(container.querySelector('.gallerist-view-menu')).toBeNull()
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
    expect(groupNames()).toEqual(['Theme'])
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
    expect(groupNames()).toEqual(['Leiste', 'Theme'])
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
    pick('Row')
    expect(railOf(v).display).toBe('flat')
    expect(onChange).toHaveBeenLastCalledWith({ rail: 'flat' })
    pick('Light')
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
    pick('Stacked')
    expect(railOf(v).display).toBe('stacked')
    expect(onChange).toHaveBeenLastCalledWith({ rail: 'stacked' })
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('choosing what is already stored reports nothing', () => {
    const onChange = vi.fn()
    setup({ onChange }, { mountOpts: { scheme: 'dark' } })
    pick('Stacked')
    pick('Dark')
    expect(onChange).not.toHaveBeenCalled()
    expect(checked()).toEqual(['Stacked', 'Dark'])
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

  it('controlled: the choice is only reported; the popover shows what the host applies', async () => {
    const onChange = vi.fn()
    const { v } = setup({ controlled: true, onChange })
    pick('Row')
    expect(onChange).toHaveBeenLastCalledWith({ rail: 'flat' })
    expect(railOf(v).display).toBe('stacked') // not applied
    pick('Light')
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
    expect(root().hasAttribute('data-gallerist-scheme')).toBe(false)
    expect(checked()).toEqual(['Stacked', 'Dark'])
    // the host applies them its own way, later (a React render): the open popover follows
    railOf(v).setDisplay('flat')
    applyAppearance(root(), { scheme: 'light' })
    await new Promise((r) => setTimeout(r))
    expect(checked()).toEqual(['Row', 'Light'])
    expect(itemNamed('Row').tabIndex).toBe(0)
    keydown(focused(), 'Escape')
    btn().click()
    expect(checked()).toEqual(['Row', 'Light'])
  })

  it('controlled per setting: the plugin applies the rest', () => {
    const onChange = vi.fn()
    const { v } = setup({ controlled: ['scheme'], onChange })
    pick('Row')
    expect(railOf(v).display).toBe('flat')
    pick('Light')
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
    pick('Light')
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
    pick('Light')
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
    pick('Light')
    pick('Row')
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
