// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { download, downloadItem, downloadItems, filenameOf, urlOf } from './index'

const item = (id: string, source: Item['source'] = `${id}.jpg`): Item => ({
  id,
  type: 'image',
  source,
})
const collection = (): Collection => ({ groups: [{ id: 'g0', items: [item('a0')] }] })

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
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
