// @gallerist/plugin-pins — pins anchored to the image (plan P2-I). Each pin is a point on the item
// that tracks pan and zoom at a constant screen size and opens a card. One plugin, three
// presentations: `comment` (numbered pins with a thread, for review), `tag` (a hotspot with a
// product card) and `feature` (numbered notes, for tours). Pins are read per item, so they work
// with any data source; the theme styles them from the skin's tokens.

import type { Group, Item, OverlaySpec, Plugin, ViewerApi } from '@gallerist/core'
import { ICONS, reportHandlerError, safeUrl } from '@gallerist/core/internal'

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

/** `onOpenChange`'s context: the pin's item, and the pin whose card was open before this change. */
export interface PinOpenChange extends PinContext {
  /** the pin whose card was open until now (the one that closed), or `null` if none was */
  previous: Pin | null
}

/** Options for `open()`. */
export interface PinOpenOptions {
  /** move focus: into the card when it opens (once it is painted), to the pin when it closes */
  focus?: boolean
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
  toggle: 'Show pins (P)',
  add: 'Add a comment (C)',
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
  /**
   * Replace the card's contents for a pin; `null` (or `undefined`) keeps the default card
   * (`defaultPinCard`) for that pin. Called each time the card opens, and again when an open card
   * is redrawn (`refresh()`, new data); the card is empty while closed. Returning the same node
   * again (one cached per pin) is supported. If it throws, the pin gets the default card and the
   * error is reported (`reportError`, else `console.error`). Don't call `open()` from here.
   */
  renderCard?: (pin: Pin, ctx: PinContext) => Node | null | undefined
  /**
   * A node `renderCard` returned was dropped: its card closed (by the user, `open()`, moving to
   * another item, the pin leaving the data), was redrawn, or the plugin or viewer was destroyed.
   * Called once per returned node, after it left the card, so a host can unmount what it rendered
   * there (a React root or portal). Not called for the default card, nor for a node `renderCard`
   * returned again for the redrawn card (it hasn't left; it is handed back when it does). Runs once
   * the change has settled, before `onOpenChange`; calling `open()` from it is fine.
   */
  onCardRemove?: (pin: Pin, node: Node) => void
  /**
   * A pin's card opened (`pin`) or closed (`null`). `ctx.previous` is the pin whose card was open
   * until now: the one that closed, also when another pin's card replaced it. When a callback
   * changes the card again (`open()`), an earlier call may describe a state already replaced: the
   * last one is current.
   */
  onOpenChange?: (pin: Pin | null, ctx: PinOpenChange) => void
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
  /** open a pin's card on the current item by id; `null` closes it. `{ focus: true }` moves focus
   *  into the card (or, closing, to its pin). */
  open(id: string | null, opts?: PinOpenOptions): void
}

/** What `defaultPinCard` draws: the presentation and the strings it uses (`open`, `resolved`). */
export interface PinCardOptions {
  /** default `tag` */
  presentation?: PinPresentation
  strings?: Partial<PinsStrings>
}

/**
 * The card contents `pins()` draws for a pin by default, for a `renderCard` that wraps or extends
 * them (text is set as text, never parsed as HTML).
 */
export function defaultPinCard(pin: Pin, opts: PinCardOptions = {}): DocumentFragment {
  const presentation = opts.presentation ?? 'tag'
  const t: PinsStrings = { ...DEFAULT_PINS_STRINGS, ...opts.strings }
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
  const href = pin.href && safeLink(pin.href)
  if (href) {
    const a = document.createElement('a')
    a.className = 'gallerist-pin-link'
    a.href = href
    a.textContent = pin.linkLabel ?? t.open
    frag.appendChild(a)
  }
  return frag
}

// Security: pin data can come from users (comments) or a CMS, so the card links only to http(s),
// mailto, tel and relative URLs; a `javascript:`, `data:` or other scheme drops the link rather than
// becoming something to click. plugin-download's safeHref uses the same check with its own list.
const LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']
const safeLink = (url: string): string | null => safeUrl(url, LINK_SCHEMES)

interface Rendered {
  pin: Pin
  el: HTMLElement
  marker: HTMLButtonElement
  card: HTMLElement
  ctx: PinContext
  /** what fills the card while it is open: the node `renderCard` returned, `null` for the default
   *  card; `undefined` while empty */
  content?: Node | null
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
  let addBtn: HTMLButtonElement | null = null
  let rendered: Rendered[] = []
  let openId: string | null = null
  let placing = false
  let cleanup: (() => void) | undefined
  const instance = ++uid

  // pins still in a viewer (a closed overlay viewer is out of the document, its pins still count)
  const live = () => {
    rendered = rendered.filter((r) => r.el.closest('.gallerist'))
    return rendered
  }
  // the viewer root: captured from the toolbar, or from any painted pin (no toolbar)
  const viewerRoot = (): HTMLElement | null => {
    if (!root) root = live()[0]?.el.closest<HTMLElement>('.gallerist') ?? null
    return root
  }

  // The card stays inside the free stage (the stage less the bands immersive floats over it, by
  // which the controls box is inset, 8px in from its edges) on both axes: beside its pin toward the
  // side with more room, level with it, each slid along when it doesn't fit; at most as wide and as
  // tall as the room (it scrolls past that, and joins the tab order so the keys scroll it); never
  // under the docked item navigator (a root grid item: immersive floats it over the stage's corner).
  // Decided from where the pin is on screen (zoom and pan included) when the card opens, and again
  // after a zoom or pan, and as its contents resize (a host renders late).
  const placeCard = (r: Rendered) => {
    const box = (sel: string) => viewerRoot()?.querySelector(sel)?.getBoundingClientRect()
    const s = box('.gallerist-stage')
    if (!s?.width) return
    const c = box('.gallerist-controls')
    const k = c?.width ? c : s
    const n = box('.gallerist > .gallerist-itemnav')
    const m = r.marker.getBoundingClientRect()
    const at = r.el.getBoundingClientRect()
    const top = Math.max(s.top, k.top) + 8
    let bottom = Math.min(s.bottom, k.bottom) - 8
    const left = Math.max(s.left, k.left) + 8
    const right = Math.min(s.right, k.right) - 8
    const toLeft = m.left - left > right - m.right
    const card = r.card
    const st = card.style
    st.maxWidth = `${Math.min(280, right - left, Math.max(120, (toLeft ? m.left - left : right - m.right) - 4))}px`
    const w = card.offsetWidth
    const x = Math.max(left, Math.min(toLeft ? m.left - 4 - w : m.right + 4, right - w))
    st.left = `${x - at.left}px`
    if (n?.width && n.top < bottom && n.bottom > top && x < n.right && x + w > n.left)
      bottom = n.top - 8
    st.maxHeight = `${Math.max(60, bottom - top)}px`
    st.top = `${Math.max(top, Math.min(m.top, bottom - card.offsetHeight)) - at.top}px`
    card.tabIndex = card.scrollHeight > card.clientHeight + 1 ? 0 : -1
  }
  // placed again a frame after a zoom or pan (the pin has moved, its card offset hasn't) or a resize
  // of the card or its contents: not from inside the observer's delivery, where placeCard's own
  // writes would resize what it observes again (a ResizeObserver loop error)
  let frame = 0
  const replace = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => shown && placeCard(shown))
  }
  const fit = typeof ResizeObserver === 'function' ? new ResizeObserver(replace) : null

  // While a card is open, Escape closes it (not the viewer), wherever focus is in the viewer: some
  // browsers don't focus a clicked button, and `open(id)` leaves focus where it was. An Escape from
  // inside the card is left to the card's own (bubble) listener, so a host form in the card sees it
  // first and can keep it with preventDefault().
  const onOpenKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !openId) return
    if (shown && e.target instanceof Node && shown.card.contains(e.target)) return
    e.stopPropagation()
    setOpen(null, true)
  }
  let keyRoot: HTMLElement | null = null

  // Host callbacks (onCardRemove, onOpenChange, a renderCard error) wait in `calls` until the
  // outermost setOpen has settled, then run in order, so a call back into the plugin (open() from
  // onCardRemove) sees the settled state and its own events come after the ones that led to it.
  // A throw is reported (reportError, else console.error: core's emitter's reporter) and the rest run.
  const calls: Array<() => void> = []
  let depth = 0
  // nodes handed to onCardRemove's queue and not delivered yet (each is delivered once)
  const leaving = new Set<Node>()

  // A card holds its contents only while open: drawn when it opens (or is redrawn), dropped when it
  // closes, so a host's node is handed back exactly once (onCardRemove, once setOpen has settled).
  // A renderCard that throws gets the default card for that pin; the error is reported after.
  const fill = (r: Rendered) => {
    if (r.content !== undefined) return
    let node: Node | null = null
    try {
      node = opts.renderCard?.(r.pin, r.ctx) ?? null
    } catch (e) {
      calls.push(() => {
        throw e
      })
    }
    r.content = node
    r.card.prepend(node ?? defaultPinCard(r.pin, { presentation, strings: t }))
  }
  const empty = (r: Rendered) => {
    const node = r.content
    if (node === undefined) return
    r.content = undefined
    r.card.replaceChildren(r.card.lastChild as Node) // keep the close button
    if (node && !leaving.has(node)) {
      leaving.add(node)
      calls.push(() => {
        leaving.delete(node)
        // a host may return the same node again (one cached per pin): if it is back in the open
        // card, it hasn't left; it is handed back when it does
        if (shown?.content !== node) opts.onCardRemove?.(r.pin, node)
      })
    }
  }

  // Focus leaving a card that closed, or whose nodes were dropped: to the pin's marker on the current
  // item, else the add-pin button, else the viewer, never <body> (the next Escape would close the
  // viewer). Moved if it is on <body> or inside `from` (`document`: from anywhere, as Escape or the
  // close button do). It shows the focus ring if the input that led here was a key, and not if it
  // was a pointer (`focusVisible`; a browser without the option decides by its own heuristic). Not
  // inferred from the element focus leaves (a text field always matches :focus-visible).
  const rescue = (id: string, from: Node | null) => {
    const a = document.activeElement
    if (a && a !== document.body && !from?.contains(a)) return
    const item = bound && currentCtx(bound)?.item
    for (const to of [
      ...live()
        .filter((r) => r.pin.id === id && r.ctx.item === item)
        .map((r) => r.marker),
      addBtn,
      viewerRoot(),
    ]) {
      to?.focus({ preventScroll: true, focusVisible: kbd } as FocusOptions)
      if (to && document.activeElement === to) return
    }
  }
  // again after the current task, as a repaint may drop the marker it went to (the pin is gone)
  const refocus = (id: string, card: HTMLElement, force: boolean) => {
    rescue(id, force ? document : card)
    queueMicrotask(() => rescue(id, card))
  }
  // the last input was a key (keydown), not a pointer (pointerdown), seen on the document in capture
  // while the plugin is in a viewer; a keyboard click (no pointer: `detail` 0) on × counts as a key
  let kbd = false
  const modality = (e: Event) => {
    kbd = e.type === 'keydown'
  }

  // `openId` is the pin asked for; `shown` the one whose card is on screen. They differ while a pin
  // asked for by `open(id)` hasn't been painted yet (it opens when it is).
  let shown: Rendered | null = null
  // open(id, { focus: true }): where focus was when asked; the card takes it (now, or once its pin is
  // painted) unless the user moved it meanwhile: it is still there, fell to <body>, or what held it
  // was repainted away (the renderer hands focus to the new pin)
  let want: { from: Element | null } | null = null
  // the card focus last went into (cleared when focus moves to another element, or by setOpen)
  let focusedCard: HTMLElement | null = null
  const setOpen = (id: string | null, focus = false) => {
    depth++
    try {
      change(id, focus)
    } finally {
      if (!--depth)
        for (let f = calls.shift(); f; f = calls.shift()) {
          depth++
          try {
            f()
          } catch (e) {
            reportHandlerError(e)
          }
          depth--
        }
    }
  }
  const change = (asked: string | null, focus: boolean) => {
    // nothing opens once the plugin has left its viewer (open() from a callback run by destroy): no
    // listeners left behind, and no card a later viewer would open on its first paint
    const id = bound ? asked : null
    if (id !== openId) want = null
    if (focus && id) want = { from: document.activeElement }
    openId = id
    const prev = shown
    const a = document.activeElement
    const v = viewerRoot()
    // the pin on the current item (its neighbours' slides may carry the same id)
    const item = bound && currentCtx(bound)?.item
    // Focus is in the card on its way out, or fell to <body> as its nodes were dropped or its slide
    // stopped being the current one: from inside the card, or anywhere in an open overlay viewer
    // (Escape on <body> would close it). Not from a host control outside an inline viewer.
    const had =
      !!prev &&
      (prev.card.contains(a) ||
        ((!a || a === document.body) &&
          (prev.ctx.item !== item || !prev.el.closest('.gallerist')) &&
          (focusedCard === prev.card || (!!v?.isConnected && v.hasAttribute('aria-modal')))))
    let opened: Rendered | null = null
    for (const r of live()) {
      const isOpen = !opened && r.pin.id === id && r.ctx.item === item
      if (isOpen) opened = r
      else empty(r)
      r.card.hidden = !isOpen
      r.marker.setAttribute('aria-expanded', String(isOpen))
      r.el.toggleAttribute('data-open', isOpen)
      // the open pin's overlay sits above its neighbours so its card isn't covered
      const host = r.el.parentElement
      if (host) host.style.zIndex = isOpen ? '30' : '20'
    }
    if (prev !== opened) focusedCard = null // a new card: focus hasn't been in it yet
    if (prev && prev !== opened) empty(prev) // also when a repaint took it off the page
    fit?.disconnect()
    if (opened) {
      fill(opened)
      placeCard(opened)
      fit?.observe(opened.card)
      if (opened.content instanceof Element) fit?.observe(opened.content)
    }
    if (opened && want) {
      const now = document.activeElement
      if (now === want.from || !now || now === document.body || !want.from?.isConnected)
        opened.card.focus({ preventScroll: true, focusVisible: kbd } as FocusOptions)
      want = null
    } else if (bound && prev && prev !== opened && (had || (focus && !id))) {
      refocus(prev.pin.id, prev.card, focus)
    }
    shown = opened
    keyRoot?.removeEventListener('keydown', onOpenKey, true)
    keyRoot = null
    if (openId) {
      document.addEventListener('pointerdown', onOutside, true)
      keyRoot = v
      keyRoot?.addEventListener('keydown', onOpenKey, true)
    } else {
      document.removeEventListener('pointerdown', onOutside, true)
    }
    // the host hears about it last (queued after the onCardRemove calls), once state has settled
    const ctx = (opened ?? prev)?.ctx
    if (ctx && opened?.pin.id !== prev?.pin.id) {
      const pin = opened ? opened.pin : null
      const previous = prev?.pin ?? null
      calls.push(() => opts.onOpenChange?.(pin, { ...ctx, previous }))
    }
  }

  const onOutside = (e: Event) => {
    const target = e.target as Node | null
    if (target && live().some((r) => r.el.contains(target))) return
    setOpen(null)
  }

  const setVisible = (v: boolean) => {
    visible = v
    if (!v) {
      setOpen(null)
      // hiding the focused pin would drop focus to <body>: hand it to the toggle (or the viewer)
      const active = document.activeElement
      if (active && live().some((r) => r.el.contains(active))) {
        const to = toggleBtn?.isConnected ? toggleBtn : viewerRoot()
        to?.focus({ preventScroll: true })
      }
    }
    for (const r of live()) r.el.hidden = !v
    toggleBtn?.setAttribute('aria-pressed', String(v))
  }

  // ── placing a comment: a one-shot click on the image ───────────────────────────
  const stopPlacing = () => {
    placing = false
    addBtn?.setAttribute('aria-pressed', 'false')
    root?.removeAttribute('data-gallerist-placing')
    root?.removeEventListener('click', onPlaceClick, true)
    root?.removeEventListener('keydown', onPlaceKey, true)
    root?.removeEventListener('pointerdown', onPlaceDown, true)
  }
  // a click that ends a drag (a pan) neither places nor cancels
  let downAt: { x: number; y: number } | null = null
  const onPlaceDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY }
  }
  const startPlacing = () => {
    if (!root || !opts.onPlace) return
    placing = true
    setOpen(null)
    addBtn?.setAttribute('aria-pressed', 'true')
    root.setAttribute('data-gallerist-placing', '')
    root.addEventListener('pointerdown', onPlaceDown, true)
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
    const dragged = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5
    downAt = null
    if (dragged) return
    if (!target?.closest('.gallerist-content[data-gallerist-current]')) {
      // a click outside the stage cancels; inside it (beside the image) placing stays armed
      if (!target?.closest('.gallerist-stage, .gallerist-pin-add')) stopPlacing()
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
    card.tabIndex = -1 // open(id, { focus: true }) lands here; the contents are drawn on open
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'gallerist-pin-close'
    close.setAttribute('aria-label', t.close)
    close.innerHTML = ICONS.close
    close.addEventListener('click', (e) => {
      kbd = !e.detail
      setOpen(null, true)
    })
    card.appendChild(close)

    marker.addEventListener('click', () => setOpen(openId === pin.id ? null : pin.id))
    // a click inside a card must not reach the stage (no swipe, no close-on-backdrop); nor a wheel
    // over a card that scrolls (in the tab order then), which scrolls it rather than zooming the
    // image. A pinch (ctrl+wheel), or a wheel over a card that doesn't scroll, zooms the image as
    // anywhere on the stage, whose handler keeps it from zooming the page.
    card.addEventListener('pointerdown', (e) => e.stopPropagation())
    card.addEventListener('wheel', (e) => {
      if (!card.tabIndex && !e.ctrlKey) e.stopPropagation()
    })
    card.addEventListener('focusin', () => {
      focusedCard = card
    })
    card.addEventListener('focusout', (e) => {
      if (e.relatedTarget) focusedCard = null
    })
    // Escape from inside the card closes the card, unless a host handler in it kept the key
    // (preventDefault); then it goes no further, so the viewer stays open
    card.addEventListener('keydown', (e) => {
      // a scrolling card (focused itself) scrolls with these keys rather than navigating
      if (
        e.target === card &&
        !card.tabIndex &&
        /^(Arrow(Up|Down)|Home|End|Page(Up|Down))$/.test(e.key)
      )
        e.stopPropagation()
      if (e.key !== 'Escape' || e.defaultPrevented || openId !== pin.id) return
      e.preventDefault()
      e.stopPropagation()
      kbd = true
      setOpen(null, true)
    })
    el.append(marker, card)
    rendered.push({ pin, el, marker, card, ctx })
    return el
  }

  // ── toolbar ────────────────────────────────────────────────────────────────
  const toolbar = () => {
    const wrap = document.createDocumentFragment()
    if (opts.toggle !== false) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'gallerist-pins-toggle'
      btn.setAttribute('aria-label', t.toggle)
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
      add.setAttribute('aria-label', t.add)
      add.setAttribute('aria-pressed', 'false')
      add.innerHTML = ICONS.comment
      addBtn = add
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
      // a repaint dropping the pin that holds focus (the host removed it, say a draft left empty)
      // leaves focus on <body>: once it is done, focus goes where a closing card's would
      const a = document.activeElement
      const held = item === currentCtx(viewer)?.item && live().find((r) => r.el.contains(a))
      if (held) queueMicrotask(() => rescue(held.pin.id, null))
      // its pin is gone from the current item (a neighbour's slide has its own pins)
      if (openId && item === currentCtx(viewer)?.item && !list.some((p) => p.id === openId))
        setOpen(null)
      return list.map((pin, k) => ({
        id: `pin:${pin.id}`,
        anchor: { kind: 'point', x: pin.x, y: pin.y, space: pin.space ?? 'normalized' },
        interactive: true,
        layer: 20,
        class: 'gallerist-pin-overlay',
        render: () => {
          const el = renderPin(pin, k + 1, ctx)
          // a card left open stays open across a repaint (zoom bounds, refresh), unless it was
          // closed or the plugin destroyed before the microtask runs
          if (openId === pin.id)
            queueMicrotask(() => {
              if (bound === viewer && openId === pin.id) setOpen(pin.id)
            })
          return el
        },
      }))
    }
    return {
      name: 'pins',
      init() {
        // close any open card when the item changes; place it again after a zoom or pan; follow the
        // last input (a key or a pointer) for the focus ring
        const offs = [
          viewer.on('afterItem', () => setOpen(null)),
          viewer.on('afterSlide', () => setOpen(null)),
          viewer.on('zoom', replace),
        ]
        for (const type of ['keydown', 'pointerdown'])
          document.addEventListener(type, modality, true)
        cleanup = () => {
          for (const off of offs) off()
          for (const type of ['keydown', 'pointerdown'])
            document.removeEventListener(type, modality, true)
        }
      },
      destroy() {
        cleanup?.()
        stopPlacing()
        bound = null // no refocusing into a viewer on its way out
        setOpen(null) // drops the open card's contents (onCardRemove)
        rendered = []
        root = null // a later viewer captures its own
      },
      overlays,
      keymap: {
        p: () => setVisible(!visible),
        P: () => setVisible(!visible),
        ...(opts.onPlace
          ? {
              c: () => (placing ? stopPlacing() : startPlacing()),
              C: () => (placing ? stopPlacing() : startPlacing()),
            }
          : {}),
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
    open: (id: string | null, o?: PinOpenOptions) => setOpen(id, !!o?.focus),
  })
}
