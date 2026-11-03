// Perf fixture (e2e/tests/perf.spec.ts): a large collection under one of the real setups.
//   ?config=default | reviewer | tour | grid | grid-sections | flat
//   ?shape=<groups>x<items per group>, e.g. 1x10000, 2000x5, 5000x2
// The viewer stays closed until #open is clicked, so the spec can time the open.
import {
  type Collection,
  type Group,
  type Item,
  type OverlaySpec,
  createViewer,
} from '@gallerist/core'
import { grid } from '@gallerist/plugin-grid'
import { type Pin, pins } from '@gallerist/plugin-pins'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { mount, resolvePreset } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'

const p = new URLSearchParams(location.search)
const config = p.get('config') ?? 'default'
const [groupCount, perGroup] = (p.get('shape') ?? '2000x5').split('x').map(Number) as [
  number,
  number,
]

// a handful of shared sources: 10k distinct data URIs would measure string storage, not the viewer
const svg = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="hsl(${hue} 40% 40%)"/></svg>`,
  )}`
const SOURCES = Array.from({ length: 12 }, (_, k) => svg(k * 30))
const time = (g: number) =>
  `${String(9 + (Math.floor(g / 60) % 15)).padStart(2, '0')}:${String(g % 60).padStart(2, '0')}`

const reviewer = config === 'reviewer'
const item = (g: number, i: number): Item => {
  const it: Item = {
    id: `g${g}i${i}`,
    type: 'image',
    source: SOURCES[(g + i) % SOURCES.length] as string,
    naturalSize: { w: 1600, h: 900 },
    alt: `Group ${g + 1}, item ${i + 1}`,
  }
  if (reviewer) {
    // as examples/monitoring: an activity badge overlay and two comment pins on the first monitor
    const overlays: OverlaySpec[] = [
      {
        id: `act-${g}-${i}`,
        anchor: { kind: 'viewport', at: 'top-left', offset: [16, 64] },
        render: () => {
          const el = document.createElement('div')
          el.textContent = `${(g * 17 + i * 23) % 100}% active`
          return el
        },
      },
    ]
    const comments: Pin[] =
      i === 0
        ? [
            { id: `c-${g}-1`, x: 0.72, y: 0.64, label: 'R. Okafor', meta: time(g), body: 'Idle?' },
            {
              id: `c-${g}-2`,
              x: 0.24,
              y: 0.3,
              label: 'J. Tanaka',
              body: 'Blurred.',
              resolved: true,
            },
          ]
        : []
    it.overlays = overlays
    it.meta = { pins: comments }
  }
  return it
}
const groups: Group[] = Array.from({ length: groupCount }, (_, g) => ({
  id: `g${g}`,
  caption: `Section ${g + 1}`,
  meta: { time: time(g), subtitle: `Floor ${(g % 3) + 1}` },
  items: Array.from({ length: perGroup }, (_, i) => item(g, i)),
}))
const collection: Collection = { meta: { title: 'Perf fixture' }, groups }

const plugins = (() => {
  switch (config) {
    case 'reviewer':
      return [thumbnails(resolvePreset('reviewer').thumbnails), pins({ presentation: 'comment' })]
    case 'tour':
      return [
        thumbnails(resolvePreset('tour').thumbnails),
        grid({ layout: 'sections', startOpen: true, strings: { start: 'Start tour' } }),
      ]
    case 'grid':
      return [thumbnails(), grid()]
    case 'grid-sections':
      return [thumbnails(), grid({ layout: 'sections' })]
    case 'flat':
      return [thumbnails({ groupDisplay: 'flat' })]
    default:
      return [thumbnails()]
  }
})()

const viewer = createViewer({
  collection,
  loop: true,
  itemMemory: reviewer ? 'preserve' : undefined,
  plugins,
})
if (reviewer) mount(viewer, { skin: 'console', preset: 'reviewer' })
else if (config === 'tour') mount(viewer, { preset: 'tour', skin: 'gallery', scheme: 'light' })
else mount(viewer, { autoHide: false, linear: config === 'flat' })

const w = window as unknown as { viewer: typeof viewer; __openClickAt?: number }
w.viewer = viewer
document.getElementById('open')?.addEventListener('click', () => {
  w.__openClickAt = performance.now()
  viewer.open({ g: 0, i: 0 })
})
