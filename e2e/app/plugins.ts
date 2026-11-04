import { type Collection, type Item, createViewer } from '@gallerist/core'
import { download } from '@gallerist/plugin-download'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { grid } from '@gallerist/plugin-grid'
import { hash } from '@gallerist/plugin-hash'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><rect width="100%" height="100%" fill="${color}"/><text x="40" y="120" fill="white" font-size="110">${label}</text></svg>`,
  )}`

const img = (id: string, c: string): Item => ({
  id,
  type: 'image',
  source: svg(c, id),
  naturalSize: { w: 1600, h: 1067 },
  alt: id,
})

const collection: Collection = {
  groups: [
    { id: 'g0', items: [img('a0', '#c0392b')] },
    { id: 'g1', items: [img('b0', '#2980b9'), img('b1', '#27ae60'), img('b2', '#f39c12')] },
    { id: 'g2', items: [img('c0', '#8e44ad'), img('c1', '#16a085')] },
  ],
}

const params = new URLSearchParams(location.search)
const groupDisplay = params.get('display') === 'flat' ? 'flat' : 'stacked'
const railParam = params.get('rail') ?? ''
const rail = (['left', 'right'].includes(railParam) ? railParam : 'bottom') as
  | 'bottom'
  | 'left'
  | 'right'
const linear = params.get('linear') === '1'

const viewer = createViewer({
  collection,
  loop: true,
  plugins: [thumbnails({ groupDisplay }), grid(), fullscreen(), hash({ open: false }), download()],
})
mount(viewer, { autoHide: false, rail, linear, loop: true }) // deterministic e2e: no idle-timer chrome fade
;(window as unknown as { viewer: typeof viewer }).viewer = viewer
document.getElementById('open')?.addEventListener('click', () => viewer.open())
