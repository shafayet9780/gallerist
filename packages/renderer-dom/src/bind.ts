// Markup init: `<a href="big.jpg" data-gallerist="trip">` links open a viewer, with no collection to
// write. A single delegated listener reads the links on each click, so links added later join in.
// One viewer per gallery name, created on first use. Reads attributes only: captions reach the page as
// text, and the link's URL only ever becomes a media source.

import {
  type Collection,
  type Group,
  type Item,
  type ViewerApi,
  type ViewerOptions,
  createViewer,
} from '@gallerist/core'
import { type MountOptions, type RendererHandle, mount } from './mount'

type PerGallery<T> = T | ((gallery: string) => T)

export interface BindOptions {
  /** which elements are links (default `[data-gallerist]`). */
  selector?: string
  /** where to look for them (default `document`). */
  root?: Document | HTMLElement
  /**
   * `createViewer` options besides the collection (`plugins`, `loop`…), or a function returning a set
   * per gallery. With several galleries use the function for `pins()`, which holds its state on the
   * plugin and so can't be shared between viewers.
   */
  viewer?: PerGallery<Omit<ViewerOptions, 'collection' | 'groups' | 'items'>>
  /** `mount` options (`preset`, `skin`…), or one set per gallery. */
  mount?: PerGallery<MountOptions>
}

export interface BindHandle {
  /** open a gallery from code, at its first item or the one given. */
  open(gallery?: string, at?: { g?: number; i?: number }): void
  /** the gallery's viewer, once it has been opened. */
  viewer(gallery?: string): ViewerApi | undefined
  /** stop listening and destroy every viewer. */
  destroy(): void
}

const attr = (el: Element, name: string): string | undefined =>
  el.getAttribute(`data-gallerist-${name}`) ?? undefined

const dimension = (el: Element, name: string): number => Number(attr(el, name))

function itemFromLink(el: Element, id: string): Item | null {
  const source = attr(el, 'src') ?? el.getAttribute('href')
  if (!source) return null
  const img = el.querySelector('img')
  const item: Item = {
    id: attr(el, 'id') ?? id,
    type: attr(el, 'type') ?? 'image',
    source,
  }
  const thumb = attr(el, 'thumb') ?? img?.getAttribute('src')
  if (thumb) item.thumb = thumb
  const alt = attr(el, 'alt') ?? img?.getAttribute('alt')
  if (alt) item.alt = alt
  const caption = attr(el, 'caption')
  if (caption) item.caption = caption
  const w = dimension(el, 'width')
  const h = dimension(el, 'height')
  if (w > 0 && h > 0) item.naturalSize = { w, h }
  return item
}

interface LinkCollection {
  collection: Collection
  /** where each link landed */
  positions: Map<Element, { g: number; i: number }>
}

/**
 * Build a collection from link elements. A link with `data-gallerist-group` joins the group of that
 * id, in first-seen order (named by `-group-caption`, with `-group-subtitle` in its meta); any other
 * link is a group of its own. Elements with neither a `data-gallerist-src` nor an `href` are skipped.
 */
export function collectionFromLinks(links: Iterable<Element>, idPrefix = 'link'): LinkCollection {
  const groups: Group[] = []
  const byId = new Map<string, number>()
  const positions = new Map<Element, { g: number; i: number }>()
  const usedIds = new Set<string>()
  let n = 0
  for (const el of links) {
    const generated = `${idPrefix}-${n}`
    const item = itemFromLink(el, generated)
    if (!item) continue
    // the same id on two links (a hero and its gallery copy) would fail the whole collection
    if (usedIds.has(item.id)) item.id = usedIds.has(generated) ? `${generated}-dup` : generated
    usedIds.add(item.id)
    const groupId = attr(el, 'group')
    let g = groupId ? byId.get(groupId) : undefined
    if (g === undefined) {
      const group: Group = { id: groupId ?? `${idPrefix}-g${n}`, items: [] }
      const caption = attr(el, 'group-caption')
      if (caption) group.caption = caption
      const subtitle = attr(el, 'group-subtitle')
      if (subtitle) group.meta = { subtitle }
      g = groups.push(group) - 1
      if (groupId) byId.set(groupId, g)
    }
    const items = (groups[g] as Group).items
    positions.set(el, { g, i: items.push(item) - 1 })
    n++
  }
  return { collection: { groups }, positions }
}

/**
 * Open a viewer from `data-gallerist` links. Each distinct attribute value is its own gallery. A plain
 * click opens the viewer at that link; a modified click (new tab, download) stays the browser's.
 */
export function bind(opts: BindOptions = {}): BindHandle {
  const selector = opts.selector ?? '[data-gallerist]'
  const root: Document | HTMLElement = opts.root ?? document
  interface Live {
    viewer: ViewerApi
    handle: RendererHandle
    signature: string
    /** the link that last opened it, which gets focus back */
    link: Element | null
  }
  const live = new Map<string, Live>()
  let destroyed = false

  // the viewer's own controls and pin links aren't gallery links, however broad the selector
  const linksOf = (gallery: string) =>
    [...root.querySelectorAll(selector)].filter(
      (el) => (el.getAttribute('data-gallerist') ?? '') === gallery && !el.closest('.gallerist'),
    )
  const pick = <T>(value: PerGallery<T> | undefined, gallery: string): T | undefined =>
    typeof value === 'function' ? (value as (g: string) => T)(gallery) : value

  const ensure = (gallery: string) => {
    const { collection, positions } = collectionFromLinks(linksOf(gallery), gallery || 'link')
    if (collection.groups.length === 0) return null
    const signature = JSON.stringify(collection)
    const existing = live.get(gallery)
    if (existing) {
      // links changed since the last open
      if (existing.signature !== signature) {
        existing.viewer.setCollection(collection)
        existing.signature = signature
      }
      return { entry: existing, positions }
    }
    const viewer = createViewer({ ...pick(opts.viewer, gallery), collection })
    const handle = mount(viewer, {
      // a link removed meanwhile falls back to what had focus on opening
      returnFocus: () => {
        const link = live.get(gallery)?.link as HTMLElement | null | undefined
        return link?.isConnected ? link : null
      },
      ...pick(opts.mount, gallery),
    })
    const entry: Live = { viewer, handle, signature, link: null }
    live.set(gallery, entry)
    return { entry, positions }
  }

  const onClick = (event: Event) => {
    const e = event as MouseEvent
    if (e.defaultPrevented || e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const link = (e.target as Element | null)?.closest?.(selector)
    if (!link || link.closest('.gallerist')) return
    const ready = ensure(link.getAttribute('data-gallerist') ?? '')
    const at = ready?.positions.get(link)
    if (!ready || !at) return // no source: leave the element alone
    e.preventDefault()
    ready.entry.link = link
    ready.entry.viewer.open(at)
  }
  root.addEventListener('click', onClick)

  return {
    open(gallery, at) {
      if (destroyed) return
      const ready = ensure(gallery ?? '')
      if (!ready) return
      ready.entry.link = null // not opened from a link: focus goes back where it was
      ready.entry.viewer.open(at ?? { g: 0, i: 0 })
    },
    viewer: (gallery = '') => live.get(gallery)?.viewer,
    destroy() {
      destroyed = true
      root.removeEventListener('click', onClick)
      for (const { handle, viewer } of live.values()) {
        handle.destroy()
        viewer.destroy()
      }
      live.clear()
    },
  }
}
