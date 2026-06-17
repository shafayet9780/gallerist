// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  download,
  downloadItem,
  downloadItems,
  filenameOf,
  safeHref,
  sanitizeName,
  urlOf,
} from './index'

const item = (id: string, source: Item['source'] = `${id}.jpg`): Item => ({
  id,
  type: 'image',
  source,
})
const collection = (): Collection => ({ groups: [{ id: 'g0', items: [item('a0')] }] })

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.doUnmock('client-zip')
  vi.resetModules()
})

describe('urlOf / filenameOf', () => {
  it('resolves string and responsive sources', async () => {
    expect(await urlOf('a.jpg')).toBe('a.jpg')
    expect(await urlOf({ src: 'b.jpg', srcset: '...' })).toBe('b.jpg')
  })
  it('resolves a loader source', async () => {
    expect(await urlOf({ loader: async () => 'c.jpg' })).toBe('c.jpg')
  })
  it('derives a filename from the URL, falling back to the id', () => {
    expect(filenameOf(item('x'), 'https://h/path/photo.png?q=1')).toBe('photo.png')
    expect(filenameOf(item('x'), 'https://h/nofile')).toBe('x')
  })
})

describe('safeHref (scheme allowlist)', () => {
  it('allows http/https/blob and relative, rejects javascript/data/file', () => {
    expect(safeHref('https://h/a.jpg')).toBe('https://h/a.jpg')
    expect(safeHref('a0.jpg')).toBe('a0.jpg') // relative → resolves to http(s)
    expect(safeHref('blob:abc')).toBe('blob:abc')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
  })
})

describe('sanitizeName (zip-slip / filename injection)', () => {
  it('strips path separators, traversal, and control chars', () => {
    expect(sanitizeName('../../etc/passwd')).not.toMatch(/[/\\]|\.\./)
    expect(sanitizeName('a\\b\\c')).not.toContain('\\')
    expect(sanitizeName('foo\r\nbar')).not.toMatch(/[\r\n]/)
    expect(sanitizeName('')).toBe('download')
  })
  it('filenameOf runs through sanitize incl the id fallback', () => {
    expect(filenameOf(item('../evil'), 'https://h/nofile')).not.toMatch(/[/\\]|\.\./)
  })
})

describe('downloadItem security', () => {
  it('does not click for a javascript: source', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await downloadItem(item('x', 'javascript:alert(1)'))
    expect(click).not.toHaveBeenCalled()
  })
})

describe('downloadItem', () => {
  it('triggers an anchor download with the resolved url + filename', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await downloadItem(item('a0', 'pics/a0.jpg'))
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('downloadItems zip', () => {
  it('dynamically imports client-zip for bulk', async () => {
    const downloadZip = vi.fn(() => ({ blob: async () => new Blob(['z']) }))
    vi.doMock('client-zip', () => ({ downloadZip }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x')),
    )
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadItems([item('a'), item('b')], { zip: true, zipName: 'all.zip' })
    expect(downloadZip).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('falls back to per-file downloads when client-zip is unavailable', async () => {
    vi.doMock('client-zip', () => {
      throw new Error('module not installed')
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { downloadItems: di } = await import('./index')
    await di([item('a'), item('b')], { zip: true })
    expect(click).toHaveBeenCalledTimes(2) // one anchor download per item
  })

  it('skips entries whose fetch is not ok and never zips an empty set', async () => {
    const downloadZip = vi.fn(() => ({ blob: async () => new Blob(['z']) }))
    vi.doMock('client-zip', () => ({ downloadZip }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 404 })),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { downloadItems: di } = await import('./index')
    await di([item('a'), item('b')], { zip: true })
    expect(downloadZip).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('plugin-download', () => {
  it('mounts a toolbar button that downloads the current item', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const v = createViewer({ collection: collection(), plugins: [download()] })
    mount(v)
    v.open()
    ;(document.querySelector('.visora-download-btn') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0)) // run() resolves urlOf asynchronously
    expect(click).toHaveBeenCalled()
  })
})
