// @gallerist/plugin-shortcuts — the viewer's keyboard shortcuts in a modal dialog, on `?`.
//
// The list is built each time it opens, from what the viewer does then: the renderer's own keys as
// the layout has them (a row rail walks every item with ←/→ and has no ↑/↓; a side rail turns the
// axes; right to left mirrors ←/→), the official plugins' keys while they are registered and hold
// them (the aggregated keymap, so a key another plugin took isn't listed), and the host's entries.
// Opened by a touch (the View menu's row, `open()`, on a coarse pointer) it lists the renderer's
// gestures instead. `?` (with the viewer focused, not in a text field) opens the keys.
//
// The dialog sits in the viewer's root over a scrim that covers the viewer: `aria-modal`, the rest
// of the root inert while it shows, Tab kept inside, focus back where it was on close. Keys pressed
// in it never reach the viewer (a window listener in the capture phase takes them first): Escape and
// `?` close it, and nothing else acts. The root is found from a hidden node in the toolbar region.

import type { Plugin, PluginInstance, ViewerApi } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'

/** A host's own shortcut, listed with the built-in ones. */
export interface ShortcutEntry {
  /** what it does */
  label: string
  /** the keys, each drawn as a key cap (`['N']`, `['Shift', 'N']`); without them it's listed only
   *  with the gestures */
  keys?: readonly string[]
  /** the gesture that does it on a touch screen (`'Long press'`); without one it's listed only with
   *  the keys */
  gesture?: string
  /** the section it joins: a built-in one by its title (`strings.move`, `zoom`, `viewer`) or a new
   *  one after them. Default: the Viewer section. */
  section?: string
}

export interface ShortcutsStrings {
  /** the dialog's title with the keys, and the View menu's row */
  title: string
  /** the dialog's title with the gestures (and the View menu's row on a touch screen) */
  gestures: string
  /** the close button's text after the Esc key cap ("Esc to close"), and its name with gestures */
  toClose: string
  close: string
  /** section titles */
  move: string
  zoom: string
  viewer: string
  /** moving */
  prevNext: string
  prevNextGroup: string
  prevNextItem: string
  nextItem: string
  firstLast: string
  firstLastGroup: string
  jump: string
  /** zooming */
  zoomIn: string
  zoomOut: string
  fit: string
  pan: string
  /** the viewer, and the plugins' keys */
  fullscreen: string
  rail: string
  items: string
  grid: string
  pins: string
  addPin: string
  download: string
  help: string
  exit: string
  /** gestures */
  swipe: string
  swipeUp: string
  swipeDown: string
  pinch: string
  drag: string
  /** under the gestures */
  keysNote: string
  /** key names on their caps */
  home: string
  end: string
  esc: string
}

export const DEFAULT_SHORTCUTS_STRINGS: ShortcutsStrings = {
  title: 'Keyboard shortcuts',
  gestures: 'Gestures',
  toClose: 'to close',
  close: 'Close',
  move: 'Move',
  zoom: 'Zoom',
  viewer: 'Viewer',
  prevNext: 'Previous / next',
  prevNextGroup: 'Previous / next group',
  prevNextItem: 'Previous / next in the group',
  nextItem: 'Next in the group',
  firstLast: 'First / last',
  firstLastGroup: 'First / last group',
  jump: 'Item in the group',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to screen',
  pan: 'Move while zoomed',
  fullscreen: 'Fullscreen',
  rail: 'Thumbnails',
  items: 'Item list',
  grid: 'Grid',
  pins: 'Pins',
  addPin: 'Add a comment',
  download: 'Download',
  help: 'This list',
  exit: 'Close',
  swipe: 'Swipe left or right',
  swipeUp: 'Swipe up',
  swipeDown: 'Swipe down',
  pinch: 'Pinch, or double-tap',
  drag: 'Drag',
  keysNote: 'With a keyboard, ? lists its shortcuts.',
  home: 'Home',
  end: 'End',
  esc: 'Esc',
}

export interface ShortcutsOptions {
  /** the host's own shortcuts, listed after the built-in ones */
  shortcuts?: readonly ShortcutEntry[]
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<ShortcutsStrings>
}

/** The plugin's instance on a viewer (named `shortcuts`); the View menu finds it by that name. */
export interface ShortcutsInstance extends PluginInstance {
  /** what `open()` shows now: the title of the keys, or of the gestures on a coarse pointer */
  readonly label: string
  readonly isOpen: boolean
  /** Opens the list on the open viewer: the keys (`true`), the gestures (`false`), or by the
   *  pointer (default). False when there is no open viewer to show it in. */
  open(keys?: boolean): boolean
  close(): void
}

/** `shortcuts()`: a plugin, with `open()` / `close()` for the host (a help button of its own). */
export interface ShortcutsPlugin extends Plugin {
  /** Opens the list on the viewer this plugin was last registered on that is open. */
  open(keys?: boolean): boolean
  close(): void
}

type Row = [label: string, keys: readonly string[] | string]

const KEYBOARD =
  '<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>'
const X =
  '<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>'
const TABBABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

let lists = 0 // ids, for aria-labelledby

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}
const cap = (k: string) => (k.length === 1 ? k.toUpperCase() : k)

export function shortcuts(opts: ShortcutsOptions = {}): ShortcutsPlugin {
  const t: ShortcutsStrings = { ...DEFAULT_SHORTCUTS_STRINGS, ...opts.strings }
  const live: ShortcutsInstance[] = [] // registered instances, the latest last

  const plugin = (viewer: ViewerApi): ShortcutsInstance => {
    let anchor: HTMLElement | null = null
    let scrim: HTMLElement | null = null
    let back: HTMLElement | null = null // focus before it opened
    let inerted: Element[] = []
    let unsub: (() => void) | null = null
    const id = `gallerist-shortcuts-${++lists}`
    const root = () => anchor?.closest<HTMLElement>('.gallerist') ?? null
    const coarse = () => !!window.matchMedia?.('(pointer: coarse)').matches

    // What the viewer does now, read from its root and its plugins.
    const rows = (keys: boolean): Array<[string, Row[]]> => {
      const r = root() as HTMLElement
      const plugins = getInternals(viewer).getPlugins()
      const map: Record<string, unknown> = {}
      for (const p of plugins) Object.assign(map, p.keymap)
      // the key `k` of the plugin `name`, while it holds it (none: its first key)
      const held = (name: string, k?: string) => {
        const own = plugins.find((p) => p.name === name)?.keymap ?? {}
        const key = k ?? Object.keys(own)[0]
        return key && own[key] && map[key] === own[key] ? key : undefined
      }
      const linear = r.hasAttribute('data-gallerist-linear')
      const vertical = r.getAttribute('data-gallerist-axis') === 'vertical'
      const across = r.getAttribute('data-gallerist-dir') === 'rtl' ? ['→', '←'] : ['←', '→']
      const along = ['↑', '↓']
      const grouped = !linear && viewer.getCollection().groups.some((g) => g.items.length > 1)
      const overlay = r.getAttribute('data-gallerist-mode') === 'overlay'
      const rail = (
        plugins.find((p) => p.name === 'thumbnails') as { display?: string } | undefined
      )?.display

      let sections: Array<[string, Row[]]>
      if (keys) {
        const move: Row[] = grouped
          ? [
              [t.prevNextGroup, vertical ? along : across],
              [t.prevNextItem, vertical ? across : along],
              [t.firstLastGroup, [t.home, t.end]],
              [t.jump, ['1–9']],
            ]
          : [
              [t.prevNext, vertical ? along : across],
              [t.firstLast, [t.home, t.end]],
            ]
        const fs = (document as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
        const tools: Array<[string, string | undefined]> = [
          [t.fullscreen, (document.fullscreenEnabled ?? fs) ? held('fullscreen', 'f') : undefined],
          [t.rail, rail ? 't' : undefined],
          [t.items, held('thumbnails', 'e')],
          [t.grid, held('grid')],
          [t.pins, held('pins', 'p')],
          [t.addPin, held('pins', 'c')],
          [t.download, held('download')],
          [t.help, '?'],
          [t.exit, overlay ? t.esc : undefined],
        ]
        sections = [
          [t.move, move],
          [
            t.zoom,
            [
              [t.zoomIn, ['+']],
              [t.zoomOut, ['−']],
              [t.fit, ['0']],
            ],
          ],
          [t.viewer, tools.flatMap(([label, k]) => (k ? [[label, [cap(k)]] as Row] : []))],
        ]
      } else {
        sections = [
          [
            '',
            [
              [grouped ? t.prevNextGroup : t.prevNext, t.swipe],
              ...(grouped ? [[t.nextItem, t.swipeUp] as Row] : []),
              [t.zoom, t.pinch],
              [t.pan, t.drag],
              ...(overlay ? [[t.exit, t.swipeDown] as Row] : []),
            ],
          ],
        ]
      }
      for (const x of opts.shortcuts ?? []) {
        const what = keys ? x.keys : x.gesture
        if (!what?.length) continue
        const title = keys ? (x.section ?? t.viewer) : ''
        let section = sections.find(([s]) => s === title)
        if (!section) {
          section = [title, []]
          sections.push(section)
        }
        section[1].push([x.label, what])
      }
      return sections.filter(([, list]) => list.length)
    }

    const close = (refocus = false) => {
      if (!scrim) return
      scrim.remove()
      scrim = null
      for (const node of inerted) node.removeAttribute('inert')
      inerted = []
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
      if (refocus) (back?.isConnected ? back : root())?.focus({ preventScroll: true })
      back = null
    }

    // Every key pressed in the viewer while the list shows stops here: the viewer's keys, the zoom
    // tool's and the page's never see it. Escape and ? close; Tab stays in the dialog.
    const onKey = (e: KeyboardEvent) => {
      const r = root()
      if (!scrim || !r || !e.composedPath().includes(r)) return
      e.stopPropagation()
      if (e.key === 'Escape' || (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault()
        close(true)
      } else if (e.key === 'Tab') {
        const box = scrim.firstElementChild as HTMLElement
        const list = [...box.querySelectorAll<HTMLElement>(TABBABLE)]
        const active = (r.getRootNode() as Document | ShadowRoot).activeElement
        const first = list[0]
        const last = list[list.length - 1]
        const to = e.shiftKey
          ? active === first || active === box
            ? last
            : null
          : active === last
            ? first
            : null
        if (!first || to) {
          e.preventDefault()
          to?.focus()
        }
      }
    }
    // A press on the page outside the viewer closes it, leaving focus where the press puts it (a
    // press on the scrim closes it too, with focus back where it was: see open()).
    const onPress = (e: Event) => {
      if (!e.composedPath().includes(root() as EventTarget)) close()
    }

    const open = (keys = !coarse()): boolean => {
      const r = root()
      if (!r || !anchor?.isConnected || viewer.getState().phase !== 'open') return false
      close()
      back = (r.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null
      const s = el('div', 'gallerist-shortcuts-scrim')
      const box = el('div', 'gallerist-shortcuts')
      box.setAttribute('role', 'dialog')
      box.setAttribute('aria-modal', 'true')
      box.setAttribute('aria-labelledby', id)
      box.tabIndex = -1
      box.setAttribute('data-gallerist-list', keys ? 'keys' : 'gestures')
      const head = el('div', 'gallerist-shortcuts-head')
      if (keys) head.innerHTML = KEYBOARD
      const title = head.appendChild(el('h2', '', keys ? t.title : t.gestures))
      title.id = id
      const x = head.appendChild(el('button', 'gallerist-shortcuts-close'))
      x.type = 'button'
      if (keys) x.append(el('kbd', '', t.esc), ` ${t.toClose}`)
      else {
        x.innerHTML = X
        x.setAttribute('aria-label', t.close)
      }
      x.addEventListener('click', () => close(true))
      const body = el('div', 'gallerist-shortcuts-body')
      for (const [name, list] of rows(keys)) {
        const section = body.appendChild(el('section'))
        if (name) section.appendChild(el('h3', '', name))
        const dl = section.appendChild(el('dl'))
        for (const [label, what] of list) {
          const row = dl.appendChild(el('div', 'gallerist-shortcuts-row'))
          row.appendChild(el('dt', '', label))
          const dd = row.appendChild(el('dd'))
          if (typeof what === 'string') dd.textContent = what
          else for (const k of what) dd.appendChild(el('kbd', '', k))
        }
      }
      box.append(head, body)
      if (!keys) box.appendChild(el('p', 'gallerist-shortcuts-note', t.keysNote))
      s.appendChild(box)
      // the scrim takes no focus (the viewer's root would, under a press), and a click on it closes
      s.addEventListener('mousedown', (e) => e.target === s && e.preventDefault())
      s.addEventListener('click', (e) => e.target === s && close(true))
      // the rest of the viewer is inert while the dialog shows (what was inert already stays so)
      for (const node of r.children)
        if (!node.hasAttribute('inert')) {
          node.setAttribute('inert', '')
          inerted.push(node)
        }
      r.appendChild(s)
      scrim = s
      window.addEventListener('keydown', onKey, true)
      document.addEventListener('pointerdown', onPress, true)
      box.focus({ preventScroll: true })
      return true
    }

    const instance: ShortcutsInstance = {
      name: 'shortcuts',
      get label() {
        return coarse() ? t.gestures : t.title
      },
      get isOpen() {
        return !!scrim
      },
      open,
      close: () => close(true),
      init() {
        live.push(instance)
        unsub = viewer.subscribe((st) => {
          if (st.phase === 'closing' || st.phase === 'closed') close()
        })
      },
      destroy() {
        close()
        unsub?.()
        unsub = anchor = null
        const at = live.indexOf(instance)
        if (at >= 0) live.splice(at, 1)
      },
      keymap: { '?': () => open(true) },
      // a hidden node, to find the viewer's root by (marked off: a bar shows not for it)
      regions: {
        toolbar: () => {
          anchor = el('span')
          anchor.hidden = true
          anchor.setAttribute('data-gallerist-off', '')
          return anchor
        },
      },
    }
    return instance
  }
  return Object.assign(plugin, {
    open: (keys?: boolean) => live.reduceRight((done, i) => done || i.open(keys), false),
    close: () => {
      for (const i of live) i.close()
    },
  })
}
