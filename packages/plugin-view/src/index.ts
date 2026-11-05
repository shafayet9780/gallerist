// @gallerist/plugin-view — a View menu in the viewer's toolbar: switch the thumbnails rail's layout
// (stacked or one row) and the colour scheme (dark or light) on an open viewer.
//
// One bar tool opens a small menu (the ARIA menu button pattern) with a group of radio items per
// setting. Who applies a choice is per setting: the plugin itself (the default), or the host
// (`controlled`), which hears about it through `onChange` and applies it its own way (React's
// `scheme` and `groupDisplay` props). The menu is built each time it opens from what the viewer shows
// then (the rail's display, the root's scheme), so it never contradicts a host that applies its own.
//
// The rail is found among the viewer's plugin instances: plugin-thumbnails' instance carries
// `display` and `setDisplay()` (see its README), so this plugin doesn't import it. The scheme is the
// root's `data-gallerist-scheme`, the attribute the renderer's `scheme` option (applyAppearance)
// writes.

import type { Plugin, PluginInstance } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'

/** A thumbnails rail display (plugin-thumbnails' `groupDisplay`). */
export type ViewRail = 'stacked' | 'flat' | 'index'
/** A colour scheme (the renderer's `scheme`). */
export type ViewScheme = 'dark' | 'light' | 'auto'
export type ViewSetting = 'rail' | 'scheme'

/** What the viewer shows: the rail's display (`undefined` with no thumbnails rail mounted) and the
 *  scheme (the one set, else the one in effect: the skin's default, or the system's for `auto`). */
export interface ViewState {
  rail?: ViewRail
  scheme: ViewScheme
}

export interface ViewStrings {
  /** the toolbar button's and the menu's accessible name */
  menu: string
  /** the sections' names */
  rail: string
  scheme: string
  /** the choices */
  stacked: string
  flat: string
  index: string
  dark: string
  light: string
  auto: string
}

export const DEFAULT_VIEW_STRINGS: ViewStrings = {
  menu: 'View',
  rail: 'Rail',
  scheme: 'Scheme',
  stacked: 'Stacked',
  flat: 'Row',
  index: 'Index',
  dark: 'Dark',
  light: 'Light',
  auto: 'Auto',
}

export interface ViewOptions {
  /** Rail layouts to offer, in order (default `['stacked', 'flat']`); `false` leaves the section out.
   *  The section shows only while a thumbnails rail is mounted. */
  rail?: readonly ViewRail[] | false
  /** Schemes to offer, in order (default `['dark', 'light']`); `false` leaves the section out. */
  scheme?: readonly ViewScheme[] | false
  /** Values the plugin applies when the viewer mounts (e.g. restored from storage), over the rail's
   *  and the renderer's own; ignored for a controlled setting. */
  initial?: Partial<ViewState>
  /** Settings the host applies itself (`true`: both). A choice in one only calls `onChange`; the
   *  host applies it (React: the `scheme` / `groupDisplay` props), or doesn't. */
  controlled?: boolean | readonly ViewSetting[]
  /** Called on every choice that changes something, with the state it asks for. */
  onChange?: (state: ViewState) => void
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<ViewStrings>
}

// the shared icon family's look (core's ICONS): sliders, for the viewer's display options
const ICON =
  '<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg>'

type Rail = PluginInstance & {
  readonly display?: ViewRail
  setDisplay?(display: ViewRail): void
}

let menus = 0 // ids, for the button's aria-controls

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attrs: Record<string, string>,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = className
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

export function view(opts: ViewOptions = {}): Plugin {
  const t: ViewStrings = { ...DEFAULT_VIEW_STRINGS, ...opts.strings }
  const choices = {
    rail: opts.rail === false ? [] : (opts.rail ?? ['stacked', 'flat']),
    scheme: opts.scheme === false ? [] : (opts.scheme ?? ['dark', 'light']),
  }
  const owns = (s: ViewSetting) =>
    !(opts.controlled === true || (Array.isArray(opts.controlled) && opts.controlled.includes(s)))
  // the plugin's own values (the initial ones, then the user's choices), applied to every mount
  const mine: Partial<ViewState> = { ...opts.initial }

  return (viewer) => {
    let btn: HTMLButtonElement | null = null
    let menu: HTMLElement | null = null
    let unsub: (() => void) | null = null
    const id = `gallerist-view-${++menus}`
    const root = () => btn?.closest<HTMLElement>('.gallerist') ?? null

    // the mounted thumbnails rail, if any (the last one registered owns the rail region)
    const rail = () =>
      getInternals(viewer)
        .getPlugins()
        .filter((p) => p.name === 'thumbnails' && typeof (p as Rail).setDisplay === 'function')
        .pop() as Rail | undefined
    const scheme = (): ViewScheme => {
      const r = root()
      const set = r?.getAttribute('data-gallerist-scheme') as ViewScheme | null | undefined
      if (set && choices.scheme.includes(set)) return set
      // the one in effect: every skin sets `color-scheme` for the scheme it shows
      const shown = r ? getComputedStyle(r).colorScheme : ''
      if (shown === 'dark' || shown === 'light') return shown
      if (set === 'auto')
        return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      return set ?? (r?.getAttribute('data-gallerist-skin') === 'editorial' ? 'light' : 'dark')
    }
    const state = (): ViewState => ({ rail: rail()?.display, scheme: scheme() })

    const apply = (s: ViewSetting, value: string) => {
      if (s === 'rail') rail()?.setDisplay?.(value as ViewRail)
      else root()?.setAttribute('data-gallerist-scheme', value)
    }
    // the plugin's values for this mount: the rail's before it builds (or switched once built), the
    // scheme once the button is in the viewer
    const applyRail = () => {
      if (owns('rail') && mine.rail) apply('rail', mine.rail)
    }
    const applyScheme = () => {
      if (owns('scheme') && mine.scheme) apply('scheme', mine.scheme)
    }

    const choose = (s: ViewSetting, value: ViewRail | ViewScheme) => {
      const now = state()
      if (now[s] === value) return
      if (owns(s)) {
        Object.assign(mine, { [s]: value })
        apply(s, value)
      }
      opts.onChange?.({ ...now, [s]: value })
    }

    const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]

    const onOutside = (e: Event) => {
      const at = e.target as Node
      if (!menu?.contains(at) && !btn?.contains(at)) close()
    }
    const close = (refocus = false) => {
      if (!menu) return
      menu.remove()
      menu = null
      btn?.setAttribute('aria-expanded', 'false')
      btn?.removeAttribute('aria-controls')
      document.removeEventListener('pointerdown', onOutside, true)
      window.removeEventListener('resize', place)
      if (refocus) btn?.focus()
    }

    // Under the button, its inline end on the button's, inside the viewer (a phone's narrow bar). A
    // button the toolbar's strip has scrolled partly out of view (a narrow bar) is shown whole first.
    function place() {
      const r = root()
      const strip = btn?.parentElement
      if (!menu || !btn || !r || !strip) return
      const s = strip.getBoundingClientRect()
      const b = btn.getBoundingClientRect()
      strip.scrollLeft += Math.max(0, b.right - s.right) || Math.min(0, b.left - s.left)
      const box = r.getBoundingClientRect()
      const at = btn.getBoundingClientRect()
      const w = menu.offsetWidth
      const top = at.bottom - box.top + 6
      const x = r.getAttribute('data-gallerist-dir') === 'rtl' ? at.left : at.right - w
      Object.assign(menu.style, {
        top: `${top}px`,
        left: `${Math.max(8, Math.min(x - box.left, box.width - w - 8))}px`,
        maxHeight: `${Math.max(0, box.height - top - 8)}px`,
      })
    }

    // Menu keys (APG menu): ↑/↓ move (wrapping), Home/End, a letter jumps to the next item starting
    // with it, Enter/Space choose and close, Escape closes, Tab closes and moves on from the button.
    // Keys stay in the menu, so the viewer doesn't navigate or close under it.
    const onMenuKey = (e: KeyboardEvent) => {
      const list = items()
      const at = list.indexOf(document.activeElement as HTMLElement)
      const n = list.length
      let to = -1
      switch (e.key) {
        case 'ArrowDown':
          to = (at + 1) % n
          break
        case 'ArrowUp':
          to = at < 0 ? n - 1 : (at - 1 + n) % n
          break
        case 'Home':
          to = 0
          break
        case 'End':
          to = n - 1
          break
        case 'Enter':
        case ' ':
          list[at]?.click()
          break
        case 'Escape':
          close(true)
          break
        case 'Tab':
          close(true) // the browser then moves focus on from the button
          return
        case 'ArrowLeft':
        case 'ArrowRight':
          break // nothing beside a menu item, but the viewer mustn't move either
        default: {
          if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
          const k = e.key.toLowerCase()
          for (let d = 1; d <= n; d++) {
            const item = list[(at + d) % n]
            if (item?.textContent?.toLowerCase().startsWith(k)) {
              to = (at + d) % n
              break
            }
          }
        }
      }
      list[to]?.focus()
      e.preventDefault()
      e.stopPropagation()
    }

    const open = (last: boolean) => {
      const r = root()
      if (menu || !btn || !r) return
      const sections: Array<[ViewSetting, readonly string[], string | undefined]> = []
      const now = state()
      if (now.rail && choices.rail.length) sections.push(['rail', choices.rail, now.rail])
      if (choices.scheme.length) sections.push(['scheme', choices.scheme, now.scheme])
      if (!sections.length) return
      const m = el('div', 'gallerist-view-menu', { id, role: 'menu', 'aria-label': t.menu })
      for (const [s, values, current] of sections) {
        const group = el('div', 'gallerist-view-group', { role: 'group', 'aria-label': t[s] })
        // the group's name already
        const head = el('div', 'gallerist-view-heading', { 'aria-hidden': 'true' })
        head.textContent = t[s]
        group.appendChild(head)
        for (const value of values) {
          const item = el('div', 'gallerist-view-item', {
            role: 'menuitemradio',
            'aria-checked': String(value === current),
            tabindex: '-1',
          })
          item.textContent = t[value as keyof ViewStrings] ?? value
          item.addEventListener('click', () => {
            close(true)
            choose(s, value as ViewRail | ViewScheme)
          })
          group.appendChild(item)
        }
        m.appendChild(group)
      }
      m.addEventListener('keydown', onMenuKey)
      m.addEventListener('mousedown', (e) => e.preventDefault()) // a click doesn't move focus
      r.appendChild(m)
      menu = m
      place()
      btn.setAttribute('aria-expanded', 'true')
      btn.setAttribute('aria-controls', id)
      document.addEventListener('pointerdown', onOutside, true)
      window.addEventListener('resize', place)
      const list = items()
      list[last ? list.length - 1 : 0]?.focus()
    }

    const button = () => {
      close()
      const b = el('button', 'gallerist-view-btn', {
        type: 'button',
        'aria-label': t.menu,
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
      })
      b.innerHTML = ICON
      b.addEventListener('click', () => (menu ? close() : open(false)))
      // ↓ / ↑ open the menu on its first / last item (and don't move the viewer)
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        e.stopPropagation()
        open(e.key === 'ArrowUp')
      })
      btn = b
      applyRail()
      queueMicrotask(applyScheme) // the renderer puts the button in the viewer once this returns
      return b
    }

    return {
      name: 'view',
      init() {
        applyRail() // a rail registered before this plugin mounts with it
        unsub = viewer.subscribe((s) => {
          if (s.phase === 'closing' || s.phase === 'closed') close()
        })
      },
      destroy() {
        close()
        unsub?.()
        unsub = null
        btn = null
      },
      regions: { toolbar: button },
    }
  }
}
