// Pins fixture (e2e/tests/pins.spec.ts): one landscape item with three pins and one portrait item
// (for the contained zoom bounds). Query: skin, scheme, preset, presentation.
import { type Collection, createViewer } from '@gallerist/core'
import { type Pin, type PinPresentation, pins } from '@gallerist/plugin-pins'
import { type ColorScheme, type PresetName, mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'

const p = new URLSearchParams(location.search)
const svg = (w: number, h: number, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${w / 4}" cy="${h / 4}" r="${w / 40}" fill="white"/></svg>`,
  )}`
const landscapePins: Pin[] = [
  {
    id: 'a',
    x: 0.25,
    y: 0.25,
    label: 'Quarter',
    meta: '$10',
    href: '#a',
    body: 'At the white dot.',
  },
  { id: 'b', x: 0.8, y: 0.8, label: 'Corner', body: 'Near the bottom right.' },
  {
    id: 'c',
    x: 0.5,
    y: 0.5,
    label: 'Centre',
    resolved: true,
    replies: [{ author: 'B', body: 'ok' }],
  },
]
const collection: Collection = {
  groups: [
    {
      id: 'g',
      items: [
        {
          id: 'land',
          type: 'image',
          source: svg(1600, 1000, '#2980b9'),
          naturalSize: { w: 1600, h: 1000 },
          alt: 'landscape',
          meta: { pins: landscapePins },
        },
        {
          id: 'tall',
          type: 'image',
          source: svg(800, 1600, '#27ae60'),
          naturalSize: { w: 800, h: 1600 },
          alt: 'portrait',
          meta: { pins: [] },
        },
      ],
    },
  ],
}
const placed: Array<{ x: number; y: number }> = []
const plugin = pins({
  presentation: (p.get('presentation') ?? 'tag') as PinPresentation,
  onPlace: (at, { item }) => {
    placed.push(at)
    ;(item.meta as { pins: Pin[] }).pins.push({ id: `n${placed.length}`, ...at, label: 'New' })
    plugin.refresh()
  },
})
const viewer = createViewer({ collection, plugins: [plugin] })
mount(viewer, {
  skin: p.get('skin') ?? undefined,
  preset: (p.get('preset') ?? undefined) as PresetName | undefined,
  scheme: (p.get('scheme') ?? undefined) as ColorScheme | undefined,
  autoHide: false,
})
viewer.open({ g: 0, i: Number(p.get('i') ?? 0) })
Object.assign(window, { viewer, placed })
