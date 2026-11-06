// @vitest-environment happy-dom

import { type Collection, type ViewerApi, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_STOPS, type ZoomOptions, nextStop, zoom } from './index'

const collection = (): Collection => ({
  groups: [
    {
      id: 'g0',
      items: [
        { id: 'a', type: 'image', source: 'a.jpg' },
        { id: 'v', type: 'video', source: 'v.mp4' },
      ],
    },
  ],
})

const tick = () => new Promise((r) => setTimeout(r, 0))
const loaded = (v: ViewerApi, id: string) =>
  getInternals(v).emit('loaded', { viewer: v, cursor: v.cursor, id })

const open = async (opts?: ZoomOptions) => {
  const v = createViewer({ collection: collection(), plugins: [zoom(opts)] })
  mount(v)
  v.open()
  await tick()
  const q = (sel: string) => document.querySelector(sel) as HTMLButtonElement
  return {
    v,
    root: document.querySelector('.gallerist') as HTMLElement,
    out: q('.gallerist-zoom-out'),
    level: q('.gallerist-zoom-level'),
    into: q('.gallerist-zoom-in'),
  }
}
const disabled = (b: HTMLElement) => b.getAttribute('aria-disabled') === 'true'
const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )

afterEach(() => {
  document.body.innerHTML = ''
})

describe('nextStop', () => {
  it('steps to the next stop either way, and stays at the ends', () => {
    expect(nextStop(DEFAULT_STOPS, 1, 1)).toBe(1.5)
    expect(nextStop(DEFAULT_STOPS, 1.2, 1)).toBe(1.5)
    expect(nextStop(DEFAULT_STOPS, 1.2, -1)).toBe(1)
    expect(nextStop(DEFAULT_STOPS, 2.995, 1)).toBe(4) // within a hair of 3 counts as on it
    expect(nextStop(DEFAULT_STOPS, 4, 1)).toBe(4)
    expect(nextStop(DEFAULT_STOPS, 1, -1)).toBe(1)
    expect(nextStop([3, 1, 2], 1, 1)).toBe(2) // any order
  })
})

describe('plugin-zoom', () => {
  it('puts a named group of − 100% + in the toolbar', async () => {
    const { out, level, into } = await open()
    const group = document.querySelector('.gallerist-region-toolbar .gallerist-zoom-tool')
    expect(group?.getAttribute('role')).toBe('group')
    expect(group?.getAttribute('aria-label')).toBe('Zoom')
    expect([...(group?.children ?? [])]).toEqual([out, level, into])
    expect(out.getAttribute('aria-label')).toBe('Zoom out')
    expect(into.getAttribute('aria-label')).toBe('Zoom in')
    expect(level.textContent).toBe('100%')
    expect(level.getAttribute('aria-label')).toBe('100%, fit to screen')
    for (const b of [out, level, into]) expect(b.type).toBe('button')
  })

  it('unavailable while the image loads; then + steps in, − back, the percentage fits', async () => {
    const { v, out, level, into } = await open()
    expect([disabled(out), disabled(into)]).toEqual([true, true]) // loading
    into.click()
    expect(v.getState().zoom.scale).toBe(1)
    loaded(v, 'a')
    expect([disabled(out), disabled(level), disabled(into)]).toEqual([true, true, false])
    into.click()
    expect(v.getState().zoom.scale).toBe(1.5)
    expect(level.textContent).toBe('150%')
    expect(level.getAttribute('aria-label')).toBe('150%, fit to screen')
    expect([disabled(out), disabled(level)]).toEqual([false, false])
    for (let k = 0; k < 5; k++) into.click()
    expect(v.getState().zoom.scale).toBe(4)
    expect(level.textContent).toBe('400%')
    expect(disabled(into)).toBe(true) // the end of the range
    out.click()
    expect(v.getState().zoom.scale).toBe(3)
    level.click()
    expect(v.getState().zoom.scale).toBe(1)
    expect(level.textContent).toBe('100%')
    expect(disabled(out)).toBe(true)
  })

  it('a video can’t zoom: − and + stay unavailable, and its keys do nothing but go on to the page', async () => {
    const { v, root, into } = await open()
    v.nextItem()
    loaded(v, 'v')
    expect(disabled(into)).toBe(true)
    into.click()
    const above: string[] = []
    document.addEventListener('keydown', (e) => above.push(e.key))
    key(root, '+')
    expect(v.getState().zoom.scale).toBe(1) // nor the renderer's step
    expect(above).toEqual(['+'])
  })

  it('leaves the keys to a dialog or menu in the viewer, a slider-like widget, a shadow root’s field', async () => {
    const { v, root } = await open()
    loaded(v, 'a')
    const host = (role: string) => {
      const box = root.appendChild(document.createElement('div'))
      box.setAttribute('role', role)
      const inner = box.appendChild(document.createElement('button'))
      return inner
    }
    for (const role of ['dialog', 'menu', 'spinbutton', 'slider', 'tree', 'grid']) {
      const el = host(role)
      let reached = false
      el.addEventListener('keydown', (e) => {
        reached = true
        e.preventDefault() // the widget's own step
      })
      key(el, '-')
      key(el, '+')
      expect(reached, role).toBe(true)
      expect(v.getState().zoom.scale, role).toBe(1)
    }
    const shadowHost = root.appendChild(document.createElement('div'))
    const field = shadowHost
      .attachShadow({ mode: 'open' })
      .appendChild(document.createElement('input'))
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', bubbles: true, composed: true, cancelable: true }),
    )
    expect(v.getState().zoom.scale).toBe(1)
    // the viewer's own root is a dialog (an overlay): its keys are still the tool's
    key(root, '+')
    expect(v.getState().zoom.scale).toBe(1.5)
  })

  it('brings stops outside the renderer’s range into it, so + and − never do nothing', async () => {
    const { v, into, out } = await open({ stops: [0.5, 1, 2, 8] })
    loaded(v, 'a')
    expect(disabled(out)).toBe(true) // at fit, the range's start
    into.click()
    into.click()
    expect(v.getState().zoom.scale).toBe(4) // 8 → 400%
    expect(disabled(into)).toBe(true)
  })

  it('says the zoom it takes in the viewer’s live region', async () => {
    const { v, root, into, level } = await open()
    loaded(v, 'a')
    const live = root.querySelector('.gallerist-live') as HTMLElement
    into.click()
    expect(live.textContent).toBe('150%')
    key(root, '+')
    expect(live.textContent).toBe('200%')
    level.click()
    expect(live.textContent).toBe('100%')
  })

  it('a failed load is unavailable too', async () => {
    const { v, into } = await open()
    getInternals(v).emit('loadError', { viewer: v, cursor: v.cursor, id: 'a', error: new Error() })
    expect(disabled(into)).toBe(true)
  })

  it('+ / = and - step through the stops in place of the renderer’s factor; 0 fits', async () => {
    const { v, root, level } = await open()
    loaded(v, 'a')
    key(root, '+')
    expect(v.getState().zoom.scale).toBe(1.5) // one step, not 1.5 × 1.25
    key(root, '=')
    expect(v.getState().zoom.scale).toBe(2)
    key(root, '-')
    expect(v.getState().zoom.scale).toBe(1.5)
    expect(level.textContent).toBe('150%')
    key(root, '0')
    expect(v.getState().zoom.scale).toBe(1)
  })

  it('leaves the keys alone while typing in the viewer, and with a modifier', async () => {
    const { v, root } = await open()
    loaded(v, 'a')
    const field = document.createElement('textarea')
    root.append(field)
    key(field, '+')
    expect(v.getState().zoom.scale).toBe(1)
    key(root, '+', { ctrlKey: true }) // not the tool's: the renderer's own, as without it
    expect(v.getState().zoom.scale).toBe(1.25)
  })

  it('keys: false leaves them to the renderer', async () => {
    const { v, root } = await open({ keys: false })
    loaded(v, 'a')
    key(root, '+')
    expect(v.getState().zoom.scale).toBe(1.25) // the renderer's own step
  })

  it('shows a gesture’s live zoom before it commits, and the committed one after', async () => {
    const { v, level } = await open()
    loaded(v, 'a')
    const content = document.querySelector(
      '.gallerist-content[data-gallerist-current]',
    ) as HTMLElement
    content.style.transform = 'translate(-10px, -4px) scale(2.3)'
    await tick()
    expect(level.textContent).toBe('230%')
    // a drag to dismiss shrinks the content: not a zoom
    content.style.transform = 'translate(0px, 40px) scale(0.8)'
    await tick()
    expect(level.textContent).toBe('100%')
    v.zoomTo(3)
    expect(level.textContent).toBe('300%')
  })

  it('takes its stops and strings from the options', async () => {
    const { v, into, level } = await open({
      stops: [1, 2],
      strings: { zoomIn: 'Agrandir', percent: (s) => `${Math.round(s * 100)} %` },
    })
    loaded(v, 'a')
    expect(into.getAttribute('aria-label')).toBe('Agrandir')
    into.click()
    expect(v.getState().zoom.scale).toBe(2)
    expect(level.textContent).toBe('200 %')
    expect(disabled(into)).toBe(true)
  })

  it('a key it takes stops there; once destroyed, it takes none', async () => {
    const { v, root } = await open()
    loaded(v, 'a')
    const above: string[] = []
    document.addEventListener('keydown', (e) => above.push(e.key))
    key(root, '+')
    key(root, 'f')
    expect(above).toEqual(['f'])
    v.destroy()
    key(root, '+')
    expect(above).toEqual(['f', '+'])
  })
})
