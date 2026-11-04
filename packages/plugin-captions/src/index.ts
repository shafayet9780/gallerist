// @gallerist/plugin-captions — designed captions. Item data keeps a plain-text `caption`; the look
// of a caption (a title line, a timestamp, a link, a badge) belongs to the viewer, so it is one
// render function here rather than markup in every item. The node goes into the renderer's
// `caption` region, which replaces the caption bar's text; presets keep placing that bar (under the
// stage, the editorial placard, floating in immersive).

import type { Cursor, Group, Item, Plugin, ViewerApi } from '@gallerist/core'

export interface CaptionContext {
  viewer: ViewerApi
  /** the item's position: group index `g`, item index `i` */
  cursor: Readonly<Cursor>
}

export interface CaptionsOptions<GM = unknown, IM = unknown> {
  /**
   * The caption for the current item. A Node is shown as is; a string is set as plain text (never
   * parsed as HTML); `null` (or `undefined`) shows the item's text `caption` in a
   * `span.gallerist-caption-text` (the theme's caption type), or nothing without one.
   * Called when the current item or the collection changes, and on `refresh()`.
   *
   * Return an Element, or a fresh node each call, not a cached DocumentFragment: a fragment empties
   * itself when inserted, so the second time it paints nothing.
   */
  render: (
    item: Item<IM>,
    group: Group<GM, IM>,
    ctx: CaptionContext,
  ) => Node | string | null | undefined
}

/** The plugin, plus a control for the host. */
export interface CaptionsPlugin extends Plugin {
  /** render the current caption again (after the host changed data that `render` reads) */
  refresh(): void
}

// The item's own text caption, styled like the bar's text. Untyped data (JSON, a CDN page) can still
// carry an old object-shaped caption: anything but a string is no caption.
const text = (item: Item): HTMLElement | null => {
  const caption: unknown = item.caption
  if (typeof caption !== 'string' || !caption) return null
  const span = document.createElement('span')
  span.className = 'gallerist-caption-text'
  span.textContent = caption
  return span
}

export function captions<GM = unknown, IM = unknown>(
  opts: CaptionsOptions<GM, IM>,
): CaptionsPlugin {
  const paints = new Set<() => void>()

  const factory: Plugin = (viewer) => {
    // created with the region, not here: a viewer built on the server never touches the DOM
    let host: HTMLElement | null = null
    let col: unknown = null
    let g = -1
    let i = -1
    let off: (() => void) | undefined

    const paint = (force?: boolean) => {
      const collection = viewer.getCollection()
      const cursor = viewer.getState().cursor
      if (!host || (!force && collection === col && cursor.g === g && cursor.i === i)) return
      col = collection
      g = cursor.g
      i = cursor.i
      const group = collection.groups[g] as Group<GM, IM> | undefined
      const item = group?.items[i]
      let out: Node | string | null | undefined = null
      if (group && item) out = opts.render(item, group, { viewer, cursor: { g, i } }) ?? text(item)
      if (out == null || typeof out === 'string') host.textContent = out ?? ''
      else if (host.firstChild !== out || host.childNodes.length > 1) host.replaceChildren(out)
    }
    const repaint = () => paint(true)

    return {
      name: 'captions',
      init() {
        off = viewer.subscribe(() => paint())
        paints.add(repaint)
      },
      destroy() {
        off?.()
        paints.delete(repaint)
        host?.replaceChildren()
        host = null
      },
      regions: {
        caption: () => {
          host = document.createElement('div')
          host.className = 'gallerist-captions'
          paint(true)
          return host
        },
      },
    }
  }

  return Object.assign(factory, {
    refresh: () => {
      for (const repaint of paints) repaint()
    },
  })
}
