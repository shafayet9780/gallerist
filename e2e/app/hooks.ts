// The host hooks as a time tracker's screenshot reviewer uses them (e2e/tests/hooks.spec.ts):
//  • timeframes as groups, each labelled with its range, an activity meter (or "Idle") and a note
//    count drawn by the host at the end of the label (renderGroupMeta)
//  • two monitors per capture, ordered capture by capture: each thumb shows its monitor
//    (renderItemBadge), the screens of one capture sit close together (cluster)
//  • manual time as a marker between timeframes, with a tooltip (markers)
//  • a notes popover from the caption bar: the host portals it into the viewer root, so it rises
//    over the stage; Escape in it closes it, not the viewer; N opens it (a plugin keymap)
//  • the zoom tool, the View popover and the shortcut list (?) with the host's N and long press
// Query: display=flat|stacked (default flat) · skin · scheme · dir=rtl · preset (default reviewer)
import { type Group, type Item, type Plugin, createViewer } from '@gallerist/core'
import { captions } from '@gallerist/plugin-captions'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { download } from '@gallerist/plugin-save'
import { shortcuts } from '@gallerist/plugin-shortcuts'
import { type RailMarker, refreshRail, thumbnails } from '@gallerist/plugin-thumbnails'
import { view } from '@gallerist/plugin-view'
import { zoom } from '@gallerist/plugin-zoom'
import { type ColorScheme, type PresetName, mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'
import './hooks.css'

const p = new URLSearchParams(location.search)
if (p.get('dir') === 'rtl') document.documentElement.dir = 'rtl'

interface Shot {
  capture: number // capture time, as minutes past 10:00
  screen: number
}
interface Frame {
  range: string
  activity: number | null // null: idle
}

const clock = (m: number) => {
  const h = 10 + Math.floor(m / 60)
  return `${h > 12 ? h - 12 : h}:${String(m % 60).padStart(2, '0')}`
}
const shot = (screen: number, capture: number, color: string): Item<Shot> => ({
  id: `s${capture}-${screen}`,
  type: 'image',
  source: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="100%" height="100%" fill="${color}"/><text x="60" y="160" fill="white" font-size="110" font-family="sans-serif">${clock(capture)} · screen ${screen}</text></svg>`,
  )}`,
  naturalSize: { w: 1600, h: 1000 },
  alt: `Screenshot at ${clock(capture)}, monitor ${screen}`,
  meta: { capture, screen },
})

// [start minute, activity, captures, monitors]; a gap from 11:20 to 11:45 is manual time
const FRAMES: Array<[number, number | null, number, number]> = [
  [50, 81, 2, 2],
  [60, 64, 2, 2],
  [70, null, 2, 1],
  [105, 23, 1, 2],
  [110, 41, 2, 2],
  [120, 71, 1, 1],
  [130, 55, 2, 1],
]
const palette = ['#3b4a6b', '#4a6b5b', '#6b4a5b', '#5b5b3b', '#3b5b6b', '#6b5b4a']
const groups: Array<Group<Frame, Shot>> = FRAMES.map(([start, activity, caps, screens], g) => ({
  id: `tf${start}`,
  meta: { range: `${clock(start)} – ${clock(start + 10)}`, activity },
  items: Array.from({ length: caps * screens }, (_, k) =>
    // capture by capture, then monitor
    shot(
      (k % screens) + 1,
      start + 2 + Math.floor(k / screens) * 5,
      palette[(g + k) % 6] ?? '#444',
    ),
  ),
}))

// the host's notes, per timeframe
const notes: Record<string, string[]> = {
  tf60: ['Reviewed the dashboard numbers.', 'Asked about the 11:05 gap.'],
  tf110: ['Looks fine.'],
}

const el = (tag: string, cls: string, text?: string) => {
  const node = document.createElement(tag)
  node.className = cls
  if (text) node.textContent = text
  return node
}
const MONITOR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
const level = (pct: number) => (pct < 30 ? 'low' : pct < 60 ? 'mid' : 'high')
const readout = (f: Frame, wide: boolean) => {
  if (f.activity === null) {
    const idle = el('span', 'hk-idle', '⏸ Idle')
    idle.setAttribute('aria-label', 'Idle')
    return idle
  }
  const r = el('span', `hk-readout hk-${level(f.activity)}${wide ? ' hk-wide' : ''}`)
  r.setAttribute('aria-label', `Activity ${f.activity}%`)
  const bar = el('span', 'hk-meter')
  const fill = el('i', '')
  fill.style.width = `${f.activity}%`
  bar.append(fill)
  r.append(bar, el('span', 'hk-pct', `${f.activity}%`))
  return r
}
const noteCount = (id: string) => {
  const n = notes[id]?.length ?? 0
  if (!n) return null
  const c = el('span', 'hk-notes', `✉ ${n}`)
  c.setAttribute('aria-label', `${n} note${n > 1 ? 's' : ''}`)
  return c
}

const manual: RailMarker = {
  id: 'manual-1',
  after: 'tf70',
  caption: 'Manual',
  label: 'Manual time, 11:20 – 11:45, 25 minutes',
  render: () => '✎ 25m',
  tip: () => {
    const t = el('div', 'hk-tip')
    t.append(
      el('strong', '', 'Manual time'),
      el('div', '', '11:20 – 11:45, 25m'),
      el('div', '', 'Client call: Q4 keyword review'),
      el('div', 'hk-muted', 'Added by Rafi Ahmed. No screenshots.'),
    )
    return t
  },
}

const display = p.get('display') === 'stacked' ? 'stacked' : 'flat'
const rail = thumbnails({
  groupDisplay: display,
  timeline: (g) => (g.meta as Frame).range,
  renderGroupMeta: (g, _i, { display, place }) => {
    const f = g.meta as Frame
    const count = noteCount(g.id)
    if (display === 'stacked' && place === 'below') return readout(f, true)
    if (display === 'stacked') return count
    const line = el('span', 'hk-line')
    if (count) line.append(count)
    line.append(readout(f, false))
    line.setAttribute(
      'aria-label',
      [count?.getAttribute('aria-label'), readout(f, false).getAttribute('aria-label')]
        .filter(Boolean)
        .join(', '),
    )
    return line
  },
  renderItemBadge: (item) => {
    const screen = (item.meta as Shot).screen
    const b = el('span', 'hk-badge')
    b.innerHTML = MONITOR
    b.append(String(screen))
    b.setAttribute('aria-label', `Monitor ${screen}`)
    return b
  },
  cluster: (item) => (item.meta as Shot).capture,
  markers: () => [manual],
})

// ── the notes popover, from a button in the caption bar ────────────────────────
let popover: HTMLElement | null = null
let noteBtn: HTMLButtonElement | null = null
const viewerRoot = () => document.querySelector<HTMLElement>('.gallerist')
const closeNotes = () => {
  popover?.remove()
  popover = null
  noteBtn?.setAttribute('aria-expanded', 'false')
}
const openNotes = () => {
  const root = viewerRoot()
  const btn = noteBtn
  if (!root || !btn || popover) return
  const g = viewer.getState().cursor.g
  const id = groups[g]?.id ?? ''
  const pop = el('div', 'hk-popover')
  pop.id = 'hk-notes'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', `Notes, ${groups[g]?.meta?.range}`)
  const list = el('ul', 'hk-note-list')
  for (const n of notes[id] ?? []) list.append(el('li', '', n))
  const box = document.createElement('textarea')
  box.className = 'hk-note-box'
  box.setAttribute('aria-label', 'New note')
  box.placeholder = 'Add a note'
  const add = el('button', 'hk-add', 'Add note') as HTMLButtonElement
  add.type = 'button'
  add.addEventListener('click', () => {
    if (!box.value.trim()) return
    notes[id] = [...(notes[id] ?? []), box.value.trim()]
    closeNotes()
    caption.refresh()
    refreshRail(viewer)
    noteBtn?.focus()
  })
  pop.append(list, box, add)
  // Escape closes the popover and goes no further: the viewer stays open
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    closeNotes()
    btn.focus()
  })
  // portal into the viewer root: the caption band scrolls (and so clips), the root doesn't
  root.append(pop)
  if (!matchMedia('(max-width: 600px)').matches) {
    const r = root.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    pop.style.bottom = `${r.bottom - b.top + 8}px`
    pop.style.insetInlineEnd = `${document.dir === 'rtl' ? b.left - r.left : r.right - b.right}px`
  }
  popover = pop
  btn.setAttribute('aria-expanded', 'true')
  box.focus()
}

const caption = captions<Frame, Shot>({
  render: (item, group) => {
    const bar = el('div', 'hk-caption')
    const where = el('span', 'hk-where')
    where.append(el('strong', '', 'Acme Web – SEO'), el('span', 'hk-muted', ' / Keyword research'))
    const when = el('span', 'hk-when', `${clock(item.meta?.capture ?? 0)} in ${group.meta?.range}`)
    const n = notes[group.id]?.length ?? 0
    const btn = el('button', 'hk-note-btn', n ? `✉ ${n}` : '✉ +') as HTMLButtonElement
    btn.type = 'button'
    btn.setAttribute('aria-label', n ? `Notes (${n})` : 'Add a note')
    btn.setAttribute('aria-haspopup', 'dialog')
    btn.setAttribute('aria-expanded', 'false')
    btn.addEventListener('click', () => (popover ? closeNotes() : openNotes()))
    noteBtn = btn
    bar.append(where, when, btn)
    return bar
  },
})
// N opens the notes, through a plugin keymap (the renderer leaves it alone while typing). It moves
// focus into the note box, so it takes the key (preventDefault), or the box would get an "n".
const onN = (e: KeyboardEvent) => {
  e.preventDefault()
  openNotes()
}
const notesKey: Plugin = () => ({ name: 'notes', keymap: { n: onN, N: onN } })

const viewer = createViewer({
  collection: { groups },
  startAt: { g: 1, i: 1 },
  plugins: [
    rail,
    zoom(),
    fullscreen(),
    download(),
    view(),
    caption,
    notesKey,
    // the host's own entries join the list: N (keys), a long press on the marker (gestures)
    shortcuts({
      shortcuts: [
        { label: 'Notes', keys: ['N'] },
        { label: 'Manual time details', gesture: 'Long press the marker' },
      ],
    }),
  ],
})
// the popover belongs to its timeframe and its button: it goes when the viewer closes or moves
let at = ''
viewer.subscribe(() => {
  const { phase, cursor } = viewer.getState()
  const now = `${cursor.g}:${cursor.i}`
  if (popover && (phase === 'closed' || now !== at)) closeNotes()
  at = now
})
mount(viewer, {
  preset: (p.get('preset') ?? 'reviewer') as PresetName,
  skin: p.get('skin') ?? undefined,
  scheme: (p.get('scheme') ?? undefined) as ColorScheme | undefined,
  autoHide: false,
})
;(window as unknown as { viewer: typeof viewer; notes: typeof notes }).viewer = viewer
;(window as unknown as { notes: typeof notes }).notes = notes
viewer.open()
