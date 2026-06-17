// @visora/plugin-hash — deep-link the cursor to the URL hash `#g=<groupId>&i=<itemId>` (spec §14, §16).
// Client-only (SSR-guarded); reflects nav into the URL and applies the URL on load + back/forward.

import type { Plugin } from '@visora/core'

export interface HashOptions {
  /** open the viewer on load if a hash is present (default true). */
  open?: boolean
}

/** Parse a location.hash like "#g=mon-2&i=s3" → { g, i } (values URL-decoded). */
export function parseHash(hash: string): { g?: string; i?: string } {
  const out: { g?: string; i?: string } = {}
  const raw = hash.replace(/^#/, '')
  for (const part of raw.split('&')) {
    const [k, v] = part.split('=')
    if (!v) continue
    if (k === 'g') out.g = decodeURIComponent(v)
    else if (k === 'i') out.i = decodeURIComponent(v)
  }
  return out
}

/** Format a group/item id pair into a hash body "g=<id>&i=<id>" (no leading #). */
export function formatHash(groupId: string, itemId?: string): string {
  const g = `g=${encodeURIComponent(groupId)}`
  return itemId !== undefined ? `${g}&i=${encodeURIComponent(itemId)}` : g
}

export function hash(opts: HashOptions = {}): Plugin {
  return (viewer) => {
    if (typeof window === 'undefined') return { name: 'hash' } // SSR no-op

    // Track the last value we wrote and ignore matching hashchange events. Robust to the browser
    // coalescing / firing hashchange asynchronously (a boolean latch can get stuck and then swallow
    // a genuine back/forward); comparing the value can't (review T9).
    let lastWritten: string | null = null
    const offs: (() => void)[] = []

    const applyFromHash = (): boolean => {
      const { g, i } = parseHash(window.location.hash)
      if (!g) return false
      viewer.goToId(g, i)
      return true
    }

    const writeHash = () => {
      const col = viewer.getCollection()
      const cur = viewer.getState().cursor
      const group = col.groups[cur.g]
      if (!group) return
      const item = group.items[cur.i]
      lastWritten = formatHash(group.id, item?.id)
      window.location.hash = lastWritten
    }

    const onHashChange = () => {
      if (window.location.hash.replace(/^#/, '') === lastWritten) return // our own write
      applyFromHash()
    }

    return {
      name: 'hash',
      init() {
        window.addEventListener('hashchange', onHashChange)
        offs.push(
          viewer.on('slide', writeHash),
          viewer.on('item', writeHash),
          viewer.on('opened', writeHash),
        )
        if (parseHash(window.location.hash).g) {
          applyFromHash()
          if (opts.open !== false) viewer.open()
        }
      },
      destroy() {
        window.removeEventListener('hashchange', onHashChange)
        for (const off of offs) off()
      },
    }
  }
}
