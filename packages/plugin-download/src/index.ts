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

// Security: only schemes that fetch/save inert media. Rejects javascript:/data:/file: etc., which
// could navigate the host frame or exfiltrate. Relative URLs resolve to http(s) and are allowed.
const SAFE_SCHEMES = new Set(['http:', 'https:', 'blob:'])

/** Return `url` if its scheme is download-safe, else null. */
export function safeHref(url: string): string | null {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/'
    return SAFE_SCHEMES.has(new URL(url, base).protocol) ? url : null
  } catch {
    return null
  }
}

/** Strip path separators, traversal, and control chars so a filename can't escape its directory
 *  (zip-slip) or inject headers. Falls back to 'download'. */
export function sanitizeName(name: string): string {
  const stripped = name
    .replace(/[/\\]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+/, '')
  let clean = ''
  for (const ch of stripped) {
    const c = ch.codePointAt(0) ?? 0
    clean += c < 0x20 || c === 0x7f ? '_' : ch // drop control chars (CRLF, NUL, …)
  }
  return clean.slice(0, 200) || 'download'
}

export function filenameOf(item: Item, url?: string | null): string {
  const base = url?.split(/[?#]/)[0]?.split('/').pop()
  return sanitizeName(base?.includes('.') ? base : item.id)
}

function anchorDownload(url: string, filename: string): void {
  const safe = safeHref(url)
  if (!safe) return // reject javascript:/data:/file: — never click an unsafe scheme
  const a = document.createElement('a')
  a.href = safe
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
  /** aborts the in-flight zip fetches. */
  signal?: AbortSignal
}

export async function downloadItems(items: Item[], opts: ZipOptions = {}): Promise<void> {
  if (!opts.zip) {
    for (const item of items) await downloadItem(item)
    return
  }
  let downloadZip: typeof import('client-zip').downloadZip
  try {
    ;({ downloadZip } = await import('client-zip'))
  } catch {
    // optional dep not installed → degrade gracefully to per-file downloads
    for (const item of items) await downloadItem(item)
    return
  }
  const entries = (
    await Promise.all(
      items.map(async (item) => {
        const url = await urlOf(item.source)
        const safe = url ? safeHref(url) : null
        if (!safe) return null
        const res = await fetch(safe, { signal: opts.signal })
        if (!res.ok) return null // skip failures instead of zipping an error body
        return { name: filenameOf(item, url), input: res }
      }),
    )
  ).filter((e): e is { name: string; input: Response } => e !== null)
  if (entries.length === 0) return // nothing fetched → don't produce an empty archive
  const blob = await downloadZip(entries).blob()
  const objectUrl = URL.createObjectURL(blob)
  anchorDownload(objectUrl, opts.zipName ?? 'visora.zip')
  // Defer the revoke: revoking the blob URL synchronously can cancel the still-starting download
  // in some browsers (notably older Firefox). One tick lets the download begin first (I-PL5).
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
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
