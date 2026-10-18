// @gallerist/plugin-pins — pins anchored to the image (plan P2-I). Each pin is a point on the item
// that tracks pan and zoom at a constant screen size and opens a card. One plugin, three
// presentations: `comment` (numbered pins with a thread, for review), `tag` (a hotspot with a
// product card) and `feature` (numbered notes, for tours). Pins are read per item, so they work
// with any data source; the theme styles them from the skin's tokens.

import type { Group, Item, OverlaySpec, Plugin, ViewerApi } from '@gallerist/core'
import { ICONS } from '@gallerist/core/internal'

export type PinPresentation = 'comment' | 'tag' | 'feature'

export interface PinReply {
  author?: string
  /** a secondary line, e.g. a timestamp */
  meta?: string
  body: string
}

export interface Pin {
  id: string
  /** position on the image: 0..1 of its width/height (`normalized`, default) or image pixels */
  x: number
  y: number
  space?: 'normalized' | 'natural'
  /** short name: the product, the feature, or the comment's author line; also the pin's label */
  label?: string
  /** the card's text: a comment, a description */
  body?: string
  /** a secondary line: a price, a timestamp, a dimension */
  meta?: string
  /** a link from the card (a product page) */
  href?: string
  /** the link's text; defaults to `strings.open` */
  linkLabel?: string
  /** comment threads: the replies under the first comment */
  replies?: PinReply[]
  /** comment threads: drawn muted and marked as resolved */
  resolved?: boolean
}

export interface PinContext {
  viewer: ViewerApi
  group: Group
  item: Item
}

export interface PinsStrings {
  /** the toolbar toggle's label */
  toggle: string
  /** the "place a comment" button's label */
  add: string
  /** shown while placing a comment */
  placing: string
  /** a pin's accessible name: its number (1-based) and label */
  pin: (n: number, label?: string) => string
  /** the card's close button */
  close: string
  /** default link text */
  open: string
  /** a resolved thread's badge */
  resolved: string
}

export const DEFAULT_PINS_STRINGS: PinsStrings = {
  toggle: 'Show pins',
  add: 'Add a comment',
  placing: 'Click the image to place the comment. Esc cancels.',
  pin: (n, label) => (label ? `${n}. ${label}` : `Pin ${n}`),
  close: 'Close',
  open: 'View',
  resolved: 'Resolved',
}

export interface PinsOptions {
  /** how pins look and what their card holds. Default `tag`. */
  presentation?: PinPresentation
  /** the pins of an item. Default: `item.meta.pins`. */
  pins?: (item: Item, group: Group) => readonly Pin[] | undefined
  /** whether pins start shown (default true); the toolbar toggle and the `p` key flip it */
  visible?: boolean
  /** add the show/hide toggle to the toolbar (default true) */
  toggle?: boolean
  /** replace the card's contents for a pin */
  renderCard?: (pin: Pin, ctx: PinContext) => Node
  /** a pin's card opened (`pin`) or closed (`null`) */
  onOpenChange?: (pin: Pin | null, ctx: PinContext) => void
  /**
   * Turns on placing: an "Add a comment" toolbar button (and the `c` key) arms a one-shot click on
   * the image, and this is called with the point in normalized image coordinates. Add the pin to
   * your data and call `refresh()` (or update the collection) to show it.
   */
  onPlace?: (at: { x: number; y: number }, ctx: PinContext) => void
  strings?: Partial<PinsStrings>
}

/** The plugin, plus controls for the host. */
export interface PinsPlugin extends Plugin {
  /** re-read every pin (after the host changed pin data in place) */
  refresh(): void
  /** show or hide all pins */
  setVisible(visible: boolean): void
  /** open a pin's card on the current item by id; `null` closes it */
  open(id: string | null): void
}

interface Rendered {
  pin: Pin
  el: HTMLElement
  marker: HTMLButtonElement
  card: HTMLElement
  ctx: PinContext
}

const defaultPins = (item: Item): readonly Pin[] | undefined =>
  (item.meta as { pins?: readonly Pin[] } | undefined)?.pins

let uid = 0

export function pins(opts: PinsOptions = {}): PinsPlugin {
  const presentation = opts.presentation ?? 'tag'
  const read = opts.pins ?? defaultPins
  const t: PinsStrings = { ...DEFAULT_PINS_STRINGS, ...opts.strings }
  let visible = opts.visible ?? true
  let bound: ViewerApi | null = null
  let root: HTMLElement | null = null
  let toggleBtn: HTMLButtonElement | null = null
  let rendered: Rendered[] = []
  let openId: string | null = null
  let placing = false
  let cleanup: (() => void) | undefined
  const instance = ++uid

  const live = () => {
    rendered = rendered.filter((r) => r.el.isConnected)
    return rendered
  }

  // `openId` is the pin asked for; `shown` the one whose card is on screen. They differ while a pin
  // asked for by `open(id)` hasn't been painted yet (it opens when it is).
  let shown: Rendered | null = null
  const setOpen = (id: string | null, focusMarker = false) => {
    openId = id
    let opened: Rendered | null = null
    for (const r of live()) {
      const isOpen = r.pin.id === id
      r.card.hidden = !isOpen
      r.marker.setAttribute('aria-expanded', String(isOpen))
      r.el.toggleAttribute('data-open', isOpen)
      // the open pin's overlay sits above its neighbours so its card isn't covered
      const host = r.el.parentElement
      if (host) host.style.zIndex = isOpen ? '30' : '20'
      if (isOpen) opened = r
    }
    if (focusMarker && shown && shown !== opened && shown.marker.isConnected) shown.marker.focus()
    if (opened?.pin.id !== shown?.pin.id) {
      const ctx = (opened ?? shown)?.ctx
      if (ctx) opts.onOpenChange?.(opened ? opened.pin : null, ctx)
    }
    shown = opened
    if (openId) document.addEventListener('pointerdown', onOutside, true)
    else document.removeEventListener('pointerdown', onOutside, true)
  }

  const onOutside = (e: Event) => {
    const target = e.target as Node | null
    if (target && live().some((r) => r.el.contains(target))) return
    setOpen(null)
  }

  const setVisible = (v: boolean) => {
    visible = v
    if (!v) setOpen(null)
    for (const r of live()) r.el.hidden = !v
    toggleBtn?.setAttribute('aria-pressed', String(v))
  }

  // ── placing a comment: a one-shot click on the image ───────────────────────────
  const stopPlacing = () => {
    placing = false
    root?.removeAttribute('data-gallerist-placing')
    root?.removeEventListener('click', onPlaceClick, true)
    root?.removeEventListener('keydown', onPlaceKey, true)
  }
  const startPlacing = () => {
    if (!root || !opts.onPlace) return
    placing = true
    setOpen(null)
    root.setAttribute('data-gallerist-placing', '')
    root.addEventListener('click', onPlaceClick, true)
    root.addEventListener('keydown', onPlaceKey, true)
    announce(t.placing)
  }
  const onPlaceKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation() // cancel placing, don't close the viewer
    stopPlacing()
  }
  const onPlaceClick = (e: MouseEvent) => {
    const target = e.target as Element | null
    if (!target?.closest('.gallerist-content[data-gallerist-current]')) {
      if (!target?.closest('.gallerist-pin-add')) stopPlacing() // a click elsewhere cancels
      return
    }
    const at = pointOnImage(e)
    stopPlacing()
    if (!at || !bound) return
    e.stopPropagation()
    const ctx = currentCtx(bound)
    if (ctx) opts.onPlace?.(at, ctx)
  }
  // The painted image box (object-fit: contain inside the transformed content layer), in screen px.
  const pointOnImage = (e: MouseEvent): { x: number; y: number } | null => {
    const media = root?.querySelector<HTMLElement>(
      '.gallerist-content[data-gallerist-current] .gallerist-media',
    )
    if (!media || !bound) return null
    const r = media.getBoundingClientRect()
    const item = currentCtx(bound)?.item
    const img = media as HTMLImageElement
    const nat = item?.naturalSize ??
      (img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null) ?? {
        w: r.width,
        h: r.height,
      }
    const s = Math.min(r.width / nat.w, r.height / nat.h)
    const w = nat.w * s
    const h = nat.h * s
    const x = (e.clientX - (r.left + (r.width - w) / 2)) / w
    const y = (e.clientY - (r.top + (r.height - h) / 2)) / h
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
  }
  const announce = (text: string) => {
    const region = root?.querySelector('.gallerist-live')
    if (region) region.textContent = text
  }

  const currentCtx = (viewer: ViewerApi): PinContext | null => {
    const { g, i } = viewer.getState().cursor
    const group = viewer.getCollection().groups[g]
    const item = group?.items[i]
    return group && item ? { viewer, group, item } : null
  }

  // ── one pin: a marker button and its card ─────────────────────────────────────
  const renderPin = (pin: Pin, n: number, ctx: PinContext): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'gallerist-pin'
    el.dataset.presentation = presentation
    el.dataset.pin = pin.id
    if (pin.resolved) el.setAttribute('data-resolved', '')
    el.hidden = !visible
    // open the card away from the image's nearer edges
    const nx = pin.space === 'natural' ? pin.x / (ctx.item.naturalSize?.w ?? Number.NaN) : pin.x
    const ny = pin.space === 'natural' ? pin.y / (ctx.item.naturalSize?.h ?? Number.NaN) : pin.y
    el.dataset.side = nx > 0.6 ? 'left' : 'right'
    el.dataset.v = ny > 0.6 ? 'up' : 'down'

    const cardId = `gallerist-pin-${instance}-${pin.id}`
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.className = 'gallerist-pin-marker'
    marker.setAttribute('aria-label', t.pin(n, pin.label))
    marker.setAttribute('aria-expanded', 'false')
    marker.setAttribute('aria-controls', cardId)
    const dot = document.createElement('span')
    dot.className = 'gallerist-pin-dot'
    dot.setAttribute('aria-hidden', 'true')
    if (presentation !== 'tag') dot.textContent = String(n)
    marker.appendChild(dot)

    const card = document.createElement('div')
    card.className = 'gallerist-pin-card'
    card.id = cardId
    card.hidden = true
    card.setAttribute('role', 'group')
    card.setAttribute('aria-label', t.pin(n, pin.label))
    card.appendChild(opts.renderCard ? opts.renderCard(pin, ctx) : cardBody(pin))
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'gallerist-pin-close'
    close.setAttribute('aria-label', t.close)
    close.innerHTML = ICONS.close
    close.addEventListener('click', () => setOpen(null, true))
    card.appendChild(close)

    marker.addEventListener('click', () => setOpen(openId === pin.id ? null : pin.id))
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || openId !== pin.id) return
      e.stopPropagation() // close the card, not the viewer
      setOpen(null, true)
    })
    // a click inside a card must not reach the stage (no swipe, no close-on-backdrop)
    card.addEventListener('pointerdown', (e) => e.stopPropagation())
    el.append(marker, card)
    rendered.push({ pin, el, marker, card, ctx })
    return el
  }

  const cardBody = (pin: Pin): Node => {
    const frag = document.createDocumentFragment()
    const line = (cls: string, text: string | undefined, tag = 'div') => {
      if (!text) return
      const node = document.createElement(tag)
      node.className = cls
      node.textContent = text
      frag.appendChild(node)
    }
    if (presentation === 'comment') {
      const head = document.createElement('div')
      head.className = 'gallerist-pin-head'
      if (pin.label) {
        const who = document.createElement('span')
        who.className = 'gallerist-pin-title'
        who.textContent = pin.label
        head.appendChild(who)
      }
      if (pin.meta) {
        const when = document.createElement('span')
        when.className = 'gallerist-pin-meta'
        when.textContent = pin.meta
        head.appendChild(when)
      }
      if (pin.resolved) {
        const badge = document.createElement('span')
        badge.className = 'gallerist-pin-badge'
        badge.textContent = t.resolved
        head.appendChild(badge)
      }
      frag.appendChild(head)
      line('gallerist-pin-body', pin.body, 'p')
      if (pin.replies?.length) {
        const list = document.createElement('ol')
        list.className = 'gallerist-pin-replies'
        for (const reply of pin.replies) {
          const li = document.createElement('li')
          const h = document.createElement('div')
          h.className = 'gallerist-pin-head'
          if (reply.author) {
            const who = document.createElement('span')
            who.className = 'gallerist-pin-title'
            who.textContent = reply.author
            h.appendChild(who)
          }
          if (reply.meta) {
            const when = document.createElement('span')
            when.className = 'gallerist-pin-meta'
            when.textContent = reply.meta
            h.appendChild(when)
          }
          const p = document.createElement('p')
          p.className = 'gallerist-pin-body'
          p.textContent = reply.body
          li.append(h, p)
          list.appendChild(li)
        }
        frag.appendChild(list)
      }
    } else {
      line('gallerist-pin-title', pin.label)
      line('gallerist-pin-meta', pin.meta)
      line('gallerist-pin-body', pin.body, 'p')
    }
    if (pin.href) {
      const a = document.createElement('a')
      a.className = 'gallerist-pin-link'
      a.href = pin.href
      a.textContent = pin.linkLabel ?? t.open
      frag.appendChild(a)
    }
    return frag
  }

  // ── toolbar ────────────────────────────────────────────────────────────────
  const toolbar = () => {
    const wrap = document.createDocumentFragment()
    if (opts.toggle !== false) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'gallerist-pins-toggle'
      btn.setAttribute('aria-label', `${t.toggle} (P)`)
      btn.setAttribute('aria-pressed', String(visible))
      btn.innerHTML = ICONS.pin
      btn.addEventListener('click', () => setVisible(!visible))
      toggleBtn = btn
      wrap.appendChild(btn)
    }
    if (opts.onPlace) {
      const add = document.createElement('button')
      add.type = 'button'
      add.className = 'gallerist-pin-add'
      add.setAttribute('aria-label', `${t.add} (C)`)
      add.innerHTML = ICONS.comment
      add.addEventListener('click', () => (placing ? stopPlacing() : startPlacing()))
      wrap.appendChild(add)
    }
    const host = document.createElement('div')
    host.className = 'gallerist-pins-tools'
    host.appendChild(wrap)
    // capture the viewer root once mounted (placing listens on it; announcements go to its live region)
    queueMicrotask(() => {
      root = host.closest<HTMLElement>('.gallerist') ?? root
    })
    return host
  }

  const factory: Plugin = (viewer) => {
    bound = viewer
    const overlays = ({ group, item }: { group: Group; item: Item }): OverlaySpec[] => {
      const list = read(item, group) ?? []
      const ctx: PinContext = { viewer, group, item }
      if (openId && !list.some((p) => p.id === openId)) openId = null
      return list.map((pin, k) => ({
        id: `pin:${pin.id}`,
        anchor: { kind: 'point', x: pin.x, y: pin.y, space: pin.space ?? 'normalized' },
        interactive: true,
        layer: 20,
        class: 'gallerist-pin-overlay',
        render: () => {
          const el = renderPin(pin, k + 1, ctx)
          // a card left open stays open across a repaint (zoom bounds, refresh)
          if (openId === pin.id) queueMicrotask(() => setOpen(pin.id))
          return el
        },
      }))
    }
    return {
      name: 'pins',
      init() {
        // close any open card when the item changes
        const off = viewer.on('afterItem', () => setOpen(null))
        const offSlide = viewer.on('afterSlide', () => setOpen(null))
        cleanup = () => {
          off()
          offSlide()
        }
      },
      destroy() {
        cleanup?.()
        stopPlacing()
        setOpen(null)
        rendered = []
        bound = null
      },
      overlays,
      keymap: {
        p: () => setVisible(!visible),
        ...(opts.onPlace ? { c: () => (placing ? stopPlacing() : startPlacing()) } : {}),
      },
      regions:
        opts.toggle !== false || opts.onPlace
          ? {
              toolbar,
            }
          : undefined,
    }
  }

  return Object.assign(factory, {
    refresh: () => bound?.refresh(),
    setVisible,
    open: (id: string | null) => setOpen(id),
  })
}
