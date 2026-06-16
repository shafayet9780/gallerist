// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
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
    const btn = document.querySelector('.visora-fullscreen-btn') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toBe('Toggle fullscreen')
  })

  it('the button requests fullscreen on the viewer root when not fullscreen', () => {
    openViewer()
    const root = document.querySelector('.visora') as HTMLElement
    const req = vi.fn(() => Promise.resolve())
    root.requestFullscreen = req as never
    ;(document.querySelector('.visora-fullscreen-btn') as HTMLButtonElement).click()
    expect(req).toHaveBeenCalled()
  })

  it('exits fullscreen when already fullscreen', () => {
    openViewer()
    const root = document.querySelector('.visora') as HTMLElement
    fsEl = root // currently fullscreen
    const exit = vi.fn(() => Promise.resolve())
    document.exitFullscreen = exit as never
    ;(document.querySelector('.visora-fullscreen-btn') as HTMLButtonElement).click()
    expect(exit).toHaveBeenCalled()
  })

  it('the f key toggles fullscreen', () => {
    openViewer()
    const root = document.querySelector('.visora') as HTMLElement
    const req = vi.fn(() => Promise.resolve())
    root.requestFullscreen = req as never
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    expect(req).toHaveBeenCalled()
  })

  it('emits fullscreenChange on the document fullscreenchange event', () => {
    const v = openViewer()
    const onChange = vi.fn()
    v.on('fullscreenChange', onChange)
    fsEl = document.querySelector('.visora')
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fullscreen: true }))
  })
})
