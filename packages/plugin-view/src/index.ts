// @gallerist/plugin-view — a View menu in the viewer's toolbar: switch the thumbnails rail's layout
// (stacked or one row) and the colour scheme (dark or light) on an open viewer.
//
// One bar tool opens a small popover (a non-modal dialog) with a segmented control per setting (a
// radio group with roving focus), and a row for the shortcut list when plugin-shortcuts is there.
// Who applies a choice is per setting: the plugin itself (the default), or the host, which
// hears about it through `onChange` and applies it its own way. A host takes a setting with the
// `controlled` option or by marking it on the viewer (`Symbol.for('gallerist.controlled')`, which
// React's `scheme` and `groupDisplay` props set while they're passed); the plugin then never
// writes it. The popover shows what the viewer shows (the rail's display, the scheme in effect),
// when it opens and whenever either changes while it's open, so it never contradicts a host that
// applies its own, and `onChange` reports the value picked, never one resolved from the system or
// the skin.
//
// The rail is found among the viewer's plugin instances: plugin-thumbnails' instance carries
// `display` and `setDisplay()` (see its README), so this plugin doesn't import it. The scheme is the
// root's `data-gallerist-scheme`, the attribute the renderer's `scheme` option (applyAppearance)
// writes. The shortcut list is the instance named `shortcuts` with an `open()` (plugin-shortcuts).

import type { Plugin, PluginInstance, ViewerApi } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'

/** A thumbnails rail display (plugin-thumbnails' `groupDisplay`). */
export type ViewRail = 'stacked' | 'flat' | 'index'
/** A colour scheme (the renderer's `scheme`). */
export type ViewScheme = 'dark' | 'light' | 'auto'
export type ViewSetting = 'rail' | 'scheme'

/** The menu's settings as stored: the rail's display and the scheme set on the viewer (unset, the
 *  skin's default). `initial` takes them; `onChange` reports one at a time. */
export interface ViewState {
  rail?: ViewRail
  scheme?: ViewScheme
}

/** One choice in the menu: the setting it changes, with the value picked (`{ scheme: 'light' }`).
 *  Merge it into what you keep (`{ ...saved, ...change }`). */
export type ViewChange = { rail: ViewRail; scheme?: never } | { scheme: ViewScheme; rail?: never }

export interface ViewStrings {
  /** the toolbar button's and the popover's accessible name */
  menu: string
  /** the settings' names (Layout, Theme) */
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
  rail: 'Layout',
  scheme: 'Theme',
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
   *  and the renderer's own; an unknown value is ignored, and so is one for a setting the host
   *  controls. The user's choices then replace them, for each viewer. */
  initial?: ViewState
  /** Settings the host applies itself (`true`: both). A choice in one only calls `onChange`; the
   *  host applies it, or doesn't. A host can also mark them on the viewer, read at each use:
   *  `Object.assign(viewer, { [Symbol.for('gallerist.controlled')]: ['scheme'] })` (React's `scheme`
   *  and `groupDisplay` props do, while they're passed). */
  controlled?: boolean | readonly ViewSetting[]
  /** Called on every choice that changes the stored value, with that one setting:
   *  `{ rail: 'flat' }` or `{ scheme: 'light' }`. */
  onChange?: (change: ViewChange) => void
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<ViewStrings>
}

// the shared icon family's look (core's ICONS): sliders, for the viewer's display options
const ICON =
  '<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg>'

// a segment's glyph per value, drawn like the shared icon family at the segment's size
const icon = (body: string) =>
  `<svg class="gallerist-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
const ICONS: Record<string, string> = {
  stacked: icon(
    '<rect x="3" y="8" width="13" height="12" rx="2"/><path d="M7 4h11a2 2 0 0 1 2 2v10"/>',
  ),
  flat: icon('<path d="M3 7h5v10H3zm6.5 0h5v10h-5zM16 7h5v10h-5z"/>'),
  index: icon('<path d="M9 6h12M9 12h12M9 18h12M4 6h0m0 6h0m0 6h0"/>'),
  dark: icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  light: icon(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  auto: icon(
    '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/>',
  ),
}

type Rail = PluginInstance & {
  readonly display?: ViewRail
  setDisplay?(display: ViewRail): void
}

// plugin-shortcuts' instance: what its list is called now, and how to open it (`true`: the keys)
type Help = PluginInstance & { readonly label?: string; open?(keys?: boolean): void }

let menus = 0 // ids, for the button's aria-controls
const SCHEMES: readonly string[] = ['dark', 'light', 'auto']
const SCHEME = 'data-gallerist-scheme'
const OFF = 'data-gallerist-off'
// a host's mark on the viewer for the settings it applies itself (React's props)
const HOST = Symbol.for('gallerist.controlled')
const listed = (list: unknown, s: ViewSetting) =>
  list === true || (Array.isArray(list) && list.includes(s))

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
  // The plugin's own values per viewer (the initial ones, then the user's choices), applied to every
  // mount of it, and kept when the plugin is registered on it again (React running its effects again).
  // An unknown initial scheme is dropped here; the rail ignores an unknown display itself.
  const kept = new WeakMap<ViewerApi, ViewState>()
  const { rail: r0, scheme: s0 } = opts.initial ?? {}
  const initial = { rail: r0, scheme: SCHEMES.includes(s0 as string) ? s0 : undefined }

  return (viewer) => {
    const mine = kept.get(viewer) ?? { ...initial }
    kept.set(viewer, mine)
    const owns = (s: ViewSetting) =>
      !listed(opts.controlled, s) && !listed((viewer as { [HOST]?: unknown })[HOST], s)
    let btn: HTMLButtonElement | null = null
    let menu: HTMLElement | null = null
    // the open popover's segments, with the setting and value each stands for
    let radios: Array<[HTMLElement, ViewSetting, string]> = []
    let watch: MutationObserver | null = null
    let unsub: (() => void) | null = null
    let offPlugins: (() => void) | null = null
    const id = `gallerist-view-${++menus}`
    const root = () => btn?.closest<HTMLElement>('.gallerist') ?? null
    const rtl = () => root()?.getAttribute('data-gallerist-dir') === 'rtl'
    const help = () =>
      getInternals(viewer)
        .getPlugins()
        .find((p) => p.name === 'shortcuts' && typeof (p as Help).open === 'function') as
        | Help
        | undefined

    // the mounted thumbnails rail, if any (the last one registered owns the rail region)
    const rail = () =>
      getInternals(viewer)
        .getPlugins()
        .filter((p) => p.name === 'thumbnails' && typeof (p as Rail).setDisplay === 'function')
        .pop() as Rail | undefined
    // the scheme set on the viewer (unset: undefined), and the one to show checked: the one set when
    // it's offered, else the one in effect (the skin's default, the system's for `auto`)
    const stored = (): ViewState => ({
      rail: rail()?.display,
      scheme: (root()?.getAttribute(SCHEME) ?? undefined) as ViewScheme | undefined,
    })
    const shown = (): ViewScheme => {
      const r = root()
      const set = r?.getAttribute(SCHEME) as ViewScheme | null | undefined
      if (set && choices.scheme.includes(set)) return set
      // the one in effect: every skin sets `color-scheme` for the scheme it shows
      const cs = r ? getComputedStyle(r).colorScheme : ''
      if (cs === 'dark' || cs === 'light') return cs
      if (set === 'auto')
        return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      return set ?? (r?.getAttribute('data-gallerist-skin') === 'editorial' ? 'light' : 'dark')
    }

    const apply = (s: ViewSetting, value: string) => {
      if (s === 'rail') rail()?.setDisplay?.(value as ViewRail)
      else root()?.setAttribute(SCHEME, value)
    }
    // the plugin's values for this mount: the rail's before it builds (or switched once built), the
    // scheme once the button is in the viewer
    const applyRail = () => {
      if (owns('rail') && mine.rail) apply('rail', mine.rail)
    }
    const applyScheme = () => {
      if (owns('scheme') && mine.scheme) apply('scheme', mine.scheme)
    }

    // A choice is compared with the stored value, not the one shown: Dark picked under `auto` (or
    // with no scheme set) stores `dark`.
    const choose = (s: ViewSetting, value: ViewRail | ViewScheme) => {
      if (stored()[s] === value) return
      if (owns(s)) {
        mine[s] = value as never
        apply(s, value)
      }
      opts.onChange?.({ [s]: value } as unknown as ViewChange)
    }

    // The button shows while the menu has a section: the schemes, or a rail while one shows (one
    // registered but never built, as under another renderer, has none). Hidden, it's marked off too,
    // so a bar without built-in controls doesn't show for it alone. Read again once the renderer has
    // mounted the regions (a rail builds in the same pass, maybe after this button), and then the
    // renderer reads the bar again if it changed.
    const sync = () => {
      const off = !(choices.scheme.length || (choices.rail.length && rail()?.display))
      if (!btn || btn.hidden === off) return false
      btn.hidden = off
      btn.toggleAttribute(OFF, off)
      close()
      return true
    }
    const resync = () => sync() && viewer.refresh()

    // A press outside closes the popover (the event's path, so a viewer in a shadow root works), and
    // so does any press once the renderer has gone (the button left the document under it).
    const onOutside = (e: Event) => {
      if (!btn?.isConnected || !e.composedPath().some((n) => n === menu || n === btn)) close()
    }
    const close = (refocus = false) => {
      if (!menu) return
      menu.remove()
      menu = null
      radios = []
      watch?.disconnect()
      btn?.setAttribute('aria-expanded', 'false')
      btn?.removeAttribute('aria-controls')
      document.removeEventListener('pointerdown', onOutside, true)
      document.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      if (refocus) btn?.focus()
    }

    // Under the button, its inline end on the button's, inside the viewer (a phone's narrow bar); again
    // when the window resizes or the toolbar's strip scrolls. A renderer destroyed under the open
    // popover took the button out of the document: then it closes.
    function place() {
      const r = root()
      if (!menu || !btn?.isConnected || !r) return close()
      const box = r.getBoundingClientRect()
      const at = btn.getBoundingClientRect()
      const w = menu.offsetWidth
      const top = at.bottom - box.top + 6
      const x = rtl() ? at.left : at.right - w
      Object.assign(menu.style, {
        top: `${top}px`,
        left: `${Math.max(8, Math.min(x - box.left, box.width - w - 8))}px`,
        maxHeight: `${Math.max(0, box.height - top - 8)}px`,
      })
    }

    // Each segment shows what the viewer shows now: after a choice, and when a host applies one
    // (its rail switch or scheme lands while the popover is open). A group whose value isn't offered
    // keeps its first segment in the tab order.
    const paint = () => {
      const now: ViewState = { rail: rail()?.display, scheme: shown() }
      for (const [r, s, value] of radios) {
        r.setAttribute('aria-checked', String(now[s] === value))
        r.tabIndex =
          now[s] === value ||
          (!r.previousElementSibling && !radios.some(([, o, v]) => o === s && now[o] === v))
            ? 0
            : -1
      }
    }
    // the popover's tab stops: a segment per group (the checked one), then the footer
    const stops = () => [...(menu?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? [])]

    // Popover keys (APG radio group, in a non-modal dialog): ←/→ (↑/↓ too) move through a group's
    // segments, wrapping, and choose the one they reach (mirrored right to left); Enter chooses and
    // closes; Space chooses; Tab moves between the groups and the footer, and on past either end
    // closes; Escape closes; ? opens the shortcut list. Every key but Tab stays in the popover, so
    // the viewer doesn't navigate or close under it.
    const onMenuKey = (e: KeyboardEvent) => {
      const at = e.target as HTMLElement
      const radio = at.getAttribute('role') === 'radio'
      const flip = rtl() ? -1 : 1
      const step = radio
        ? (
            { ArrowRight: flip, ArrowLeft: -flip, ArrowDown: 1, ArrowUp: -1 } as Record<
              string,
              number
            >
          )[e.key]
        : undefined
      if (e.key === 'Tab') {
        const list = stops()
        const i = list.indexOf(at)
        if (e.shiftKey ? i <= 0 : i === list.length - 1) {
          close(true) // forward, the browser then moves on from the button
          if (e.shiftKey) e.preventDefault()
        }
        return
      }
      e.stopPropagation()
      if (step) {
        const group = [...(at.parentElement?.children ?? [])] as HTMLElement[]
        const to = group[(group.indexOf(at) + step + group.length) % group.length]
        to?.focus()
        to?.click()
      } else if (e.key === 'Escape') close(true)
      else if (e.key === 'Enter' && radio) {
        at.click()
        close(true)
      } else if (e.key === '?' && help()) {
        close(true)
        help()?.open?.(true)
      } else return
      e.preventDefault()
    }

    const open = (last: boolean) => {
      const r = root()
      if (menu || !btn || !r) return
      const sections: Array<[ViewSetting, readonly string[]]> = []
      if (rail()?.display && choices.rail.length) sections.push(['rail', choices.rail])
      if (choices.scheme.length) sections.push(['scheme', choices.scheme])
      if (!sections.length) return
      const m = el('div', 'gallerist-view-menu', { id, role: 'dialog', 'aria-label': t.menu })
      for (const [s, values] of sections) {
        const label = el('span', 'gallerist-view-label', { id: `${id}-${s}` })
        label.textContent = t[s]
        const group = el('div', 'gallerist-view-seg', {
          role: 'radiogroup',
          'aria-labelledby': label.id,
        })
        for (const value of values) {
          const item = el('button', 'gallerist-view-item', { type: 'button', role: 'radio' })
          item.innerHTML = ICONS[value] ?? ''
          item.append(t[value as keyof ViewStrings] ?? value)
          item.addEventListener('click', () => {
            choose(s, value as ViewRail | ViewScheme)
            paint()
          })
          radios.push([item, s, value])
          group.appendChild(item)
        }
        m.append(label, group)
      }
      // the shortcut list's row, while plugin-shortcuts is registered
      const h = help()
      if (h) {
        const foot = el('button', 'gallerist-view-foot', { type: 'button', tabindex: '0' })
        foot.textContent = h.label ?? ''
        foot.appendChild(el('kbd', '', { 'aria-hidden': 'true' })).textContent = '?'
        foot.addEventListener('click', () => {
          close(true)
          h.open?.()
        })
        m.appendChild(foot)
      }
      m.addEventListener('keydown', onMenuKey)
      m.addEventListener('mousedown', (e) => e.preventDefault()) // a click doesn't move focus
      r.appendChild(m)
      menu = m
      paint()
      // a host applying a choice while the popover is open: the rail's display, the root's scheme
      if (typeof MutationObserver !== 'undefined') {
        watch = new MutationObserver(paint)
        watch.observe(r, { subtree: true, attributeFilter: [SCHEME, 'data-display'] })
      }
      // a button the toolbar's strip has scrolled partly out of view (a narrow bar) is shown whole,
      // with the strip's scroll-padding (the theme's room for a focus ring) as a keyboard focus does
      const strip = btn.parentElement
      if (strip) {
        const s = strip.getBoundingClientRect()
        const b = btn.getBoundingClientRect()
        const pad = Number.parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0
        strip.scrollLeft +=
          Math.max(0, b.right - s.right + pad) || Math.min(0, b.left - s.left - pad)
      }
      place()
      btn.setAttribute('aria-expanded', 'true')
      btn.setAttribute('aria-controls', id)
      document.addEventListener('pointerdown', onOutside, true)
      document.addEventListener('scroll', place, true) // the toolbar's strip (scroll doesn't bubble)
      window.addEventListener('resize', place)
      const list = stops()
      list[last ? list.length - 1 : 0]?.focus()
    }

    const button = () => {
      close()
      const b = el('button', 'gallerist-view-btn', {
        type: 'button',
        'aria-label': t.menu,
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
      })
      b.innerHTML = ICON
      b.addEventListener('click', () => (menu ? close() : open(false)))
      // ↓ / ↑ open the popover on its first / last stop (and don't move the viewer)
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        e.stopPropagation()
        open(e.key === 'ArrowUp')
      })
      btn = b
      sync()
      applyRail()
      // the renderer puts the button in the viewer once this returns
      queueMicrotask(() => {
        applyScheme()
        resync()
      })
      return b
    }

    return {
      name: 'view',
      init() {
        applyRail() // a rail registered before this plugin mounts with it
        unsub = viewer.subscribe((s) => {
          if (s.phase === 'closing' || s.phase === 'closed') close()
        })
        // a rail added or removed: show or hide the button once the renderer has mounted it
        offPlugins = getInternals(viewer).onPluginsChanged(() => queueMicrotask(resync))
      },
      destroy() {
        close()
        unsub?.()
        offPlugins?.()
        unsub = offPlugins = null
        btn = null
      },
      regions: { toolbar: button },
    }
  }
}
