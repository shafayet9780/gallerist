// Layout-matrix fixture: every chrome configuration is set from the query string so the layout
// lint (e2e/tests/layout.spec.ts) can sweep presets × arrow layouts × rails × direction × viewport.
import { type Collection, type Item, createViewer } from '@gallerist/core'
import { download } from '@gallerist/plugin-download'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { grid } from '@gallerist/plugin-grid'
import { thumbnails } from '@gallerist/plugin-thumbnails'
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

const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><rect width="100%" height="100%" fill="${color}"/><text x="40" y="120" fill="white" font-size="110">${label}</text></svg>`,
  )}`
const img = (id: string, c: string, caption?: string): Item => ({
  id,
  type: 'image',
  source: svg(c, id),
  naturalSize: { w: 1600, h: 1067 },
  alt: id,
  caption,
})

const p = new URLSearchParams(location.search)
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
// 12 groups with mixed sizes: singles, small multi-item groups, and one large group (> 8 items)
const sizes = [1, 3, 2, 1, 5, 12, 1, 4, 2, 1, 3, 2]
const collection: Collection = {
  groups: sizes.map((n, g) => ({
    id: `g${g}`,
    caption: captionMode === '1' ? `Group ${g + 1} title` : undefined,
    items: Array.from({ length: n }, (_, i) =>
      img(
        `g${g}i${i}`,
        palette[(g + i) % palette.length] ?? '#333',
        cap(`Item ${i + 1} caption`, g, i),
      ),
    ),
  })),
}

if (p.get('dir') === 'rtl') document.documentElement.dir = 'rtl'
const rail = (p.get('rail') ?? undefined) as RailPlacement | undefined
const viewer = createViewer({
  collection,
  startAt: { g: Number(p.get('g') ?? 1) },
  plugins:
    p.get('plugins') === '0'
      ? []
      : [
          thumbnails({ groupDisplay: p.get('display') === 'flat' ? 'flat' : 'stacked' }),
          grid(),
          fullscreen(),
          download(),
        ],
})
mount(viewer, {
  preset: (p.get('preset') ?? undefined) as PresetName | undefined,
  arrows: (p.get('arrows') ?? undefined) as ArrowLayout | undefined,
  rail,
  linear: p.get('linear') === '1',
  itemIndicator: (p.get('indicator') ?? undefined) as ItemIndicator | undefined,
  controls: p.get('controls') !== '0',
  autoHide: false, // deterministic: chrome never fades mid-measurement
  skin: p.get('skin') ?? undefined,
  accent: p.get('accent') ?? undefined,
  scheme: (p.get('scheme') ?? undefined) as ColorScheme | undefined,
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
