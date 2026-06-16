// @visora/plugin-download — download the current item, a group, or a bulk zip (spec §14).
// Single/group use anchor downloads (zero dep); bulk zip dynamically imports a tiny streaming
// zip lib so it costs nothing until used (decision P1-H).

import type { Group, Item, MediaSource, Plugin } from '@visora/core'

/** Resolve a MediaSource to a downloadable URL (string/responsive sync; loader async). */
export async function urlOf(source: MediaSource): Promise<string | null> {
  if (typeof source === 'string') return source
  if ('src' in source) return source.src
  if ('loader' in source) {
    const res = await source.loader(new AbortController().signal)
    return typeof res === 'string' ? res : null
  }
  return null // tiles (DZI) — not downloadable here
}

export function filenameOf(item: Item, url?: string | null): string {
  const base = url?.split(/[?#]/)[0]?.split('/').pop()
  return base?.includes('.') ? base : item.id
}

function anchorDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function downloadItem(item: Item): Promise<void> {
  const url = await urlOf(item.source)
  if (url) anchorDownload(url, filenameOf(item, url))
}

export interface ZipOptions {
  zip?: boolean
  zipName?: string
}

export async function downloadItems(items: Item[], opts: ZipOptions = {}): Promise<void> {
  if (!opts.zip) {
    for (const item of items) await downloadItem(item)
    return
  }
  const { downloadZip } = await import('client-zip')
  const entries = await Promise.all(
    items.map(async (item) => {
      const url = await urlOf(item.source)
      return { name: filenameOf(item, url), input: url ? await fetch(url) : '' }
    }),
  )
  const blob = await downloadZip(entries).blob()
  const objectUrl = URL.createObjectURL(blob)
  anchorDownload(objectUrl, opts.zipName ?? 'visora.zip')
  URL.revokeObjectURL(objectUrl)
}

export const downloadGroup = (group: Group, opts?: ZipOptions): Promise<void> =>
  downloadItems(group.items, opts)

export interface DownloadOptions {
  /** keyboard shortcut for downloading the current item (default 'd'). */
  key?: string
}

export function download(opts: DownloadOptions = {}): Plugin {
  return (viewer) => {
    const current = (): Item | undefined => {
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      return col.groups[cur.g]?.items[cur.i]
    }
    const run = () => {
      const item = current()
      if (item) void downloadItem(item)
    }
    return {
      name: 'download',
      keymap: { [opts.key ?? 'd']: run },
      regions: {
        toolbar: () => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'visora-download-btn'
          btn.setAttribute('aria-label', 'Download')
          btn.textContent = '⬇'
          btn.addEventListener('click', run)
          return btn
        },
      },
    }
  }
}
