// @gallerist/plugin-download — download the current item, a group, or a bulk zip (spec §14).
// Single/group use anchor downloads (zero dep); bulk zip dynamically imports a tiny streaming
// zip lib (client-zip, a regular dependency) so it costs nothing until used (decision P1-H).

import type { Group, Item, MediaSource, Plugin } from '@gallerist/core'
import { ICONS, safeUrl } from '@gallerist/core/internal'

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
const SAFE_SCHEMES = ['http:', 'https:', 'blob:']

/** Return `url` if its scheme is download-safe (http(s), blob, or relative), else null. */
export function safeHref(url: string): string | null {
  return safeUrl(url, SAFE_SCHEMES)
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

// A blob: URL is this document's own; anything else compares its origin with the page's.
const crossOrigin = (url: string): boolean => {
  if (typeof location === 'undefined') return false
  const u = new URL(url, location.href)
  return u.protocol !== 'blob:' && u.origin !== location.origin
}

function anchorDownload(url: string, filename: string): void {
  const safe = safeHref(url)
  if (!safe) return // reject javascript:/data:/file: — never click an unsafe scheme
  const a = document.createElement('a')
  a.href = safe
  a.download = filename
  a.rel = 'noopener'
  // Browsers ignore `download` on a cross-origin URL and follow the link instead: open it in a new
  // tab so the host page isn't navigated away.
  if (crossOrigin(safe)) a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * The file to save for an item, e.g. a full-resolution original where `source` is a display size.
 * Return `null` when the item can't be downloaded, `undefined` to use its source.
 */
export type DownloadUrl = (item: Item) => string | null | undefined

/** The safe URL a download of `item` saves (see `DownloadUrl`), or null when there is none. */
export async function resolveDownloadUrl(
  item: Item,
  downloadUrl?: DownloadUrl,
): Promise<string | null> {
  const custom = downloadUrl?.(item)
  const url = custom === undefined ? await urlOf(item.source) : custom
  return url ? safeHref(url) : null
}

export async function downloadItem(item: Item, downloadUrl?: DownloadUrl): Promise<void> {
  const url = await resolveDownloadUrl(item, downloadUrl)
  if (url) anchorDownload(url, filenameOf(item, url))
}

export interface ZipOptions {
  zip?: boolean
  zipName?: string
  /** aborts the in-flight zip fetches. */
  signal?: AbortSignal
  /** the file to save per item (default: its source) */
  downloadUrl?: DownloadUrl
}

export async function downloadItems(items: Item[], opts: ZipOptions = {}): Promise<void> {
  const each = async () => {
    for (const item of items) await downloadItem(item, opts.downloadUrl)
  }
  if (!opts.zip) return each()
  let downloadZip: typeof import('client-zip').downloadZip
  try {
    ;({ downloadZip } = await import('client-zip'))
  } catch {
    // the chunk failed to load (offline, a CDN hiccup) → degrade to per-file downloads
    return each()
  }
  const entries = (
    await Promise.all(
      items.map(async (item) => {
        const safe = await resolveDownloadUrl(item, opts.downloadUrl)
        if (!safe) return null
        const res = await fetch(safe, { signal: opts.signal })
        if (!res.ok) return null // skip failures instead of zipping an error body
        return { name: filenameOf(item, safe), input: res }
      }),
    )
  ).filter((e): e is { name: string; input: Response } => e !== null)
  if (entries.length === 0) return // nothing fetched → don't produce an empty archive
  const blob = await downloadZip(entries).blob()
  const objectUrl = URL.createObjectURL(blob)
  anchorDownload(objectUrl, opts.zipName ?? 'gallerist.zip')
  // Defer the revoke: revoking the blob URL synchronously can cancel the still-starting download
  // in some browsers (notably older Firefox). One tick lets the download begin first (I-PL5).
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

export const downloadGroup = (group: Group, opts?: ZipOptions): Promise<void> =>
  downloadItems(group.items, opts)

export interface DownloadStrings {
  /** the toolbar button's label */
  download: string
}

export const DEFAULT_DOWNLOAD_STRINGS: DownloadStrings = { download: 'Download' }

export interface DownloadOptions {
  /** keyboard shortcut for downloading the current item (default 'd'). */
  key?: string
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<DownloadStrings>
  /**
   * The file to save for an item, e.g. the full-resolution original; `null` marks the item as not
   * downloadable, `undefined` uses its source. Read for the current item on every navigation.
   */
  downloadUrl?: DownloadUrl
}

// Whether the item has something safe to save, known without loading: a loader source resolves on
// click, so it counts as downloadable until then. Takes `downloadUrl(item)`'s result, so a click
// calls the host's function once.
const downloadable = (item: Item, custom: string | null | undefined): boolean => {
  if (custom !== undefined) return !!custom && !!safeHref(custom)
  const { source } = item
  if (typeof source === 'string') return !!safeHref(source)
  if ('src' in source) return !!safeHref(source.src)
  return 'loader' in source
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
      if (!item) return
      const custom = opts.downloadUrl?.(item)
      if (downloadable(item, custom)) void downloadItem(item, () => custom)
    }
    let btn: HTMLButtonElement | null = null
    let shown: Item | undefined | null = null
    // An item without a safe URL (none, data:, javascript:, file:) disables the button rather than
    // leaving a click that does nothing. aria-disabled, not disabled: the button keeps focus.
    const update = () => {
      const item = current()
      if (!btn || item === shown) return
      shown = item
      const ok = !!item && downloadable(item, opts.downloadUrl?.(item))
      btn.setAttribute('aria-disabled', String(!ok))
    }
    let off: (() => void) | undefined
    return {
      name: 'download',
      init() {
        off = viewer.subscribe(update)
      },
      destroy() {
        off?.()
        btn = null
      },
      keymap: { [opts.key ?? 'd']: run },
      regions: {
        toolbar: () => {
          btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'gallerist-download-btn'
          btn.setAttribute(
            'aria-label',
            opts.strings?.download ?? DEFAULT_DOWNLOAD_STRINGS.download,
          )
          btn.innerHTML = ICONS.download
          btn.addEventListener('click', run)
          shown = null
          update()
          return btn
        },
      },
    }
  }
}
