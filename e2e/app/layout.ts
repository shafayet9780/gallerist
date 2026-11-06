// Layout-matrix fixture: every chrome configuration is set from the query string so the layout
// lint (e2e/tests/layout.spec.ts) can sweep presets × arrow layouts × rails × direction × viewport.
import { type Collection, type Item, type Plugin, createViewer } from '@gallerist/core'
import { captions } from '@gallerist/plugin-captions'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { grid } from '@gallerist/plugin-grid'
import { download } from '@gallerist/plugin-save'
import { shortcuts } from '@gallerist/plugin-shortcuts'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { type ViewChange, view } from '@gallerist/plugin-view'
import { zoom } from '@gallerist/plugin-zoom'
import {
  type ArrowLayout,
  type ColorScheme,
  type ItemIndicator,
  type PresetName,
  type RailPlacement,
  mount,
} from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'

const p = new URLSearchParams(location.search)
// wide=1: a 3:1 panorama, which fills the stage's width at most sizes (the reviewer's gutters) ·
// tall=1: a 9:16 phone screenshot, which fills its height
const W = p.get('wide') === '1' ? 3200 : p.get('tall') === '1' ? 600 : 1600
const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="1067"><rect width="100%" height="100%" fill="${color}"/><text x="40" y="120" fill="white" font-size="110">${label}</text></svg>`,
  )}`
const img = (id: string, c: string, caption?: string): Item => ({
  id,
  type: 'image',
  source: svg(c, id),
  naturalSize: { w: W, h: 1067 },
  alt: id,
  caption,
})

// captions=1: every group/item captioned · long: one very long item caption · mixed: only some
const captionMode = p.get('captions')
const LONG = 'A long caption that keeps going. '.repeat(30)
const cap = (s: string, g: number, i: number) => {
  if (captionMode === '1') return s
  if (captionMode === 'long') return g === 1 && i === 0 ? LONG : undefined
  if (captionMode === 'mixed') return i % 2 === 0 ? s : undefined
  return undefined
}
const palette = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400']
// 12 groups with mixed sizes: singles, small multi-item groups, and one large group (> 8 items).
// groups=N: only the first N groups · one=1: every group a single item (no item axis anywhere)
const sizes = [1, 3, 2, 1, 5, 12, 1, 4, 2, 1, 3, 2]
  .slice(0, Number(p.get('groups')) || undefined)
  .map((n) => (p.get('one') === '1' ? 1 : n))
// labels=uneven: short and longer group names (an index chip's width follows its name), so the
// chips differ in width whatever the fonts: on a phone a longer chip is too wide for centring a
// short one beside it to show it whole, though the two with another short one fit the strip.
// labels=uneven-wide: the same at a 900px window, with much longer names.
const LONGER = ['Laundry room', 'Drawing room', 'Morning room', 'Library wing']
const WIDE = [
  'The long gallery upstairs, with the portraits along its north wall',
  'The garden room and terrace that look out over the orchard below',
]
const label = (g: number) => {
  const mode = p.get('labels')
  if (mode !== 'uneven' && mode !== 'uneven-wide') return undefined
  const names = mode === 'uneven' ? LONGER : WIDE
  // short, longer, short, short, longer, … (a longer one every third group, one between two shorts)
  return g % 3 === 1
    ? names[Math.floor(g / 3) % names.length]
    : ['Hall', 'WC', 'Den', 'Loft'][g % 4]
}
// the reviewer timeline's labels: 09:12, 09:19, … every 7 minutes. time=range: "09:12 – 09:13 am"
// (a start and an end, wider than a one-item group) · time=long: far longer than any group
const clock = (m: number) =>
  `${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const timeOf = (g: number) => {
  const at = 12 + g * 7
  if (p.get('time') === 'range') return `${clock(at)} – ${clock(at + 1)} am`
  if (p.get('time') === 'long')
    return `${clock(at)} – ${clock(at + 1)} am, Weekly review of the dashboard`
  return clock(at)
}
const collection: Collection = {
  meta: { title: 'Fixture house' },
  groups: sizes.map((n, g) => ({
    id: `g${g}`,
    caption: captionMode === '1' ? `Group ${g + 1} title` : label(g),
    meta: {
      subtitle: captionMode === '1' ? `Floor ${(g % 3) + 1}` : undefined,
      time: timeOf(g),
    },
    items: Array.from({ length: n }, (_, i) =>
      img(
        `g${g}i${i}`,
        palette[(g + i) % palette.length] ?? '#333',
        cap(`Item ${i + 1} caption`, g, i),
      ),
    ),
  })),
}

// custom=short|tall: a caption renderer (plugin-captions) owns the caption band. `short` is one line
// (the band keeps its two-line minimum); `tall` is far more than 40vh of text, so the band stops
// growing at 40vh and scrolls.
const customMode = p.get('custom')
const customCaption: Plugin[] = customMode
  ? [
      captions({
        render: (item, _group, { cursor }) => {
          const el = document.createElement('div')
          el.className = 'fixture-caption'
          const head = document.createElement('strong')
          head.textContent = `09:${String(12 + cursor.g).padStart(2, '0')} · ${item.id}`
          el.append(head)
          const lines = customMode === 'tall' ? 60 : 0
          for (let k = 0; k < lines; k++) {
            const line = document.createElement('p')
            line.textContent = `Activity line ${k + 1}: a note about what was on screen.`
            el.append(line)
          }
          return el
        },
      }),
    ]
  : []

if (p.get('dir') === 'rtl') document.documentElement.dir = 'rtl'
const rail = (p.get('rail') ?? undefined) as RailPlacement | undefined
const viewer = createViewer({
  collection,
  startAt: { g: Number(p.get('g') ?? 1) },
  plugins:
    p.get('plugins') === '0'
      ? []
      : [
          // the preset's rail options arrive through mount(); explicit ones win
          thumbnails({
            ...(p.get('display') ? { groupDisplay: p.get('display') as 'flat' | 'index' } : {}),
            ...(p.get('items') ? { itemAxis: p.get('items') as 'vertical' | 'horizontal' } : {}),
          }),
          grid(
            p.get('overview') === '1'
              ? { layout: 'sections', startOpen: true, strings: { start: 'Start tour' } }
              : {},
          ),
          // zoom-tool=1: the zoom tool (− 100% +) before the other tools
          ...(p.get('zoom-tool') === '1' ? [zoom()] : []),
          fullscreen(),
          download(),
          ...customCaption,
          // view=1: the View menu (rail layout + scheme); its choices are recorded for the spec
          ...(p.get('view') === '1'
            ? [
                view({
                  onChange: (change) => {
                    ;(window as unknown as { viewChanges: ViewChange[] }).viewChanges.push(change)
                  },
                }),
              ]
            : []),
          // shortcuts=1: the shortcut list on ?, with one host entry (and its gesture)
          ...(p.get('shortcuts') === '1'
            ? [
                shortcuts({
                  shortcuts: [{ keys: ['N'], label: 'Add a note', gesture: 'Long press' }],
                }),
              ]
            : []),
        ],
})
;(window as unknown as { viewChanges: ViewChange[] }).viewChanges = []
mount(viewer, {
  preset: (p.get('preset') ?? undefined) as PresetName | undefined,
  arrows: (p.get('arrows') ?? undefined) as ArrowLayout | undefined,
  rail,
  // linear=1 / linear=0 force it; unset, it follows the rail (on with a flat one)
  linear: p.get('linear') ? p.get('linear') === '1' : undefined,
  itemIndicator: (p.get('indicator') ?? undefined) as ItemIndicator | undefined,
  controls: p.get('controls') !== '0',
  autoHide: p.get('autohide') === '1', // off unless asked: chrome never fades mid-measurement
  skin: p.get('skin') ?? undefined,
  accent: p.get('accent') ?? undefined,
  scheme: (p.get('scheme') ?? undefined) as ColorScheme | undefined,
  groupAxis: (p.get('axis') ?? undefined) as 'horizontal' | 'vertical' | undefined,
})
;(window as unknown as { viewer: typeof viewer }).viewer = viewer
// late=1: open a moment after mount, as a page does on a click (the overlay root isn't in the
// document until then)
if (p.get('late') === '1') await new Promise((r) => setTimeout(r, 50))
viewer.open()
if (p.get('zoom')) viewer.zoomTo(Number(p.get('zoom')))
// expand the rail even where the preset starts it collapsed (immersive)
if (p.get('railopen') === '1') {
  ;(document.querySelector('.gallerist-rail-toggle') as HTMLButtonElement | null)?.click()
}
