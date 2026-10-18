// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fullscreen } from './index'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({ groups: [{ id: 'g0', items: [item('a')] }] })

let fsEl: Element | null = null
beforeEach(() => {
  fsEl = null
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl })
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const openViewer = () => {
  const v = createViewer({ collection: collection(), plugins: [fullscreen()] })
  mount(v)
  v.open()
  return v
}

describe('plugin-fullscreen', () => {
  it('exposes a toolbar button and the f key', () => {
    const inst = fullscreen()(createViewer(collection() as never))
    expect(inst.name).toBe('fullscreen')
    expect(inst.keymap?.f).toBeTypeOf('function')
    expect(inst.regions?.toolbar).toBeTypeOf('function')
  })

  it('mounts a labelled toolbar button', () => {
    openViewer()
    const btn = document.querySelector('.gallerist-fullscreen-btn') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toBe('Toggle fullscreen')
  })

  it('the button requests fullscreen on the viewer root when not fullscreen', () => {
    openViewer()
    const root = document.querySelector('.gallerist') as HTMLElement
    const req = vi.fn(() => Promise.resolve())
    root.requestFullscreen = req as never
    ;(document.querySelector('.gallerist-fullscreen-btn') as HTMLButtonElement).click()
    expect(req).toHaveBeenCalled()
  })

  it('exits fullscreen when already fullscreen', () => {
    openViewer()
    const root = document.querySelector('.gallerist') as HTMLElement
    fsEl = root // currently fullscreen
    const exit = vi.fn(() => Promise.resolve())
    document.exitFullscreen = exit as never
    ;(document.querySelector('.gallerist-fullscreen-btn') as HTMLButtonElement).click()
    expect(exit).toHaveBeenCalled()
  })

  it('the f key toggles fullscreen', () => {
    openViewer()
    const root = document.querySelector('.gallerist') as HTMLElement
    const req = vi.fn(() => Promise.resolve())
    root.requestFullscreen = req as never
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    expect(req).toHaveBeenCalled()
  })

  it('fullscreens the bound viewer root, not the first .gallerist, across viewers (I-PL4)', () => {
    const a = createViewer({ collection: collection(), plugins: [fullscreen()] })
    mount(a)
    a.open()
    const b = createViewer({ collection: collection(), plugins: [fullscreen()] })
    mount(b)
    b.open()
    const roots = document.querySelectorAll('.gallerist')
    const reqA = vi.fn(() => Promise.resolve())
    const reqB = vi.fn(() => Promise.resolve())
    ;(roots[0] as HTMLElement).requestFullscreen = reqA as never
    ;(roots[1] as HTMLElement).requestFullscreen = reqB as never
    const btns = document.querySelectorAll('.gallerist-fullscreen-btn')
    ;(btns[1] as HTMLButtonElement).click() // B's button → must fullscreen B, not A
    expect(reqB).toHaveBeenCalled()
    expect(reqA).not.toHaveBeenCalled()
  })

  it('falls back to the webkit-prefixed request on Safari (S-PL1)', () => {
    openViewer()
    const root = document.querySelector('.gallerist') as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>
    }
    root.requestFullscreen = undefined as never
    const req = vi.fn(() => Promise.resolve())
    root.webkitRequestFullscreen = req
    ;(document.querySelector('.gallerist-fullscreen-btn') as HTMLButtonElement).click()
    expect(req).toHaveBeenCalled()
  })

  it('emits fullscreenChange on the document fullscreenchange event', () => {
    const v = openViewer()
    const onChange = vi.fn()
    v.on('fullscreenChange', onChange)
    fsEl = document.querySelector('.gallerist')
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fullscreen: true }))
  })
})

describe('fullscreen() against a stand-in viewer', () => {
  it('can be constructed without a createViewer() viewer (internals are looked up on emit)', () => {
    const stub = { getState: () => ({}), on: () => () => {} } as unknown as Parameters<
      ReturnType<typeof fullscreen>
    >[0]
    expect(() => fullscreen()(stub)).not.toThrow()
  })
})
