import { type Collection, type ViewerApi, createViewer } from '@gallerist/core'
import { type Pin, type PinsOptions, pins } from '@gallerist/plugin-pins'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { type MountOptions, mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'

// Three viewers, one per pin presentation. The pictures are drawn SVG scenes so the demo needs no
// assets; each pin's x/y is a fraction of the picture, so it lands on the same spot at any size.

const scene = (w: number, h: number, bg: string, shapes: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${bg}"/>${shapes}</svg>`,
  )}`
const image = (id: string, w: number, h: number, src: string, list: Pin[], alt: string) => ({
  id,
  type: 'image' as const,
  source: src,
  naturalSize: { w, h },
  alt,
  meta: { pins: list },
})

// ── shop: a living room and a portrait detail shot (zoom it: the pan stops at the photo's edges)
const room = scene(
  1600,
  1000,
  '#d9d2c5',
  '<rect y="640" width="1600" height="360" fill="#b9a98f"/><rect x="380" y="430" width="760" height="230" rx="40" fill="#2f5d50"/><rect x="380" y="380" width="760" height="120" rx="40" fill="#3b7363"/><rect x="430" y="660" width="20" height="90" fill="#5b3a22"/><rect x="1070" y="660" width="20" height="90" fill="#5b3a22"/><rect x="1260" y="300" width="14" height="420" fill="#222"/><path d="M1200 300h134l-30-90h-74z" fill="#f2e3b3"/><circle cx="220" cy="560" r="90" fill="#8a6d4c"/>',
)
const detail = scene(
  900,
  1400,
  '#2f5d50',
  '<rect x="120" y="900" width="70" height="420" fill="#5b3a22"/><rect x="0" y="0" width="900" height="900" fill="#3b7363"/>',
)
const shop: Collection = {
  groups: [
    {
      id: 'living',
      caption: 'Living room',
      items: [
        image(
          'room',
          1600,
          1000,
          room,
          [
            {
              id: 'sofa',
              x: 0.5,
              y: 0.47,
              label: 'Marlow 3-seat sofa',
              meta: '$2,490',
              href: '#sofa',
            },
            { id: 'lamp', x: 0.8, y: 0.25, label: 'Task floor lamp', meta: '$320', href: '#lamp' },
            {
              id: 'table',
              x: 0.14,
              y: 0.56,
              label: 'Oak side table',
              meta: '$410',
              href: '#table',
            },
          ],
          'A green sofa, a floor lamp and a side table',
        ),
        image(
          'detail',
          900,
          1400,
          detail,
          [
            {
              id: 'leg',
              x: 0.17,
              y: 0.8,
              label: 'Walnut tapered legs',
              meta: 'Solid walnut',
              href: '#legs',
            },
          ],
          'Detail of the sofa leg',
        ),
      ],
    },
  ],
}

// ── review: a dashboard screenshot with threads
const dash = scene(
  1600,
  1000,
  '#f4f5f6',
  '<rect width="1600" height="72" fill="#16181b"/><rect x="40" y="120" width="720" height="380" rx="8" fill="#fff" stroke="#d3d6db"/><rect x="820" y="120" width="740" height="380" rx="8" fill="#fff" stroke="#d3d6db"/><rect x="40" y="540" width="1520" height="400" rx="8" fill="#fff" stroke="#d3d6db"/><rect x="1380" y="880" width="200" height="56" rx="8" fill="#e0553f"/>',
)
const threads: Pin[] = [
  {
    id: 't1',
    x: 0.92,
    y: 0.9,
    label: 'Ana',
    meta: '12:15',
    body: 'The checkout button is cut off at this width.',
    replies: [{ author: 'Ben', meta: '12:40', body: 'Reproduced on display 3. Fix is in 4.2.1.' }],
  },
  {
    id: 't2',
    x: 0.3,
    y: 0.3,
    label: 'Chen',
    meta: '12:22',
    body: 'Chart legend overlaps the axis.',
    resolved: true,
  },
]
const review: Collection = {
  groups: [
    {
      id: 'drill',
      caption: 'Incident drill',
      items: [image('d3', 1600, 1000, dash, threads, 'Dashboard')],
    },
  ],
}

// ── tour: a kitchen with numbered features
const kitchen = scene(
  1600,
  1000,
  '#efe9df',
  '<rect y="600" width="1600" height="400" fill="#c9b79c"/><rect x="120" y="200" width="300" height="560" rx="10" fill="#e8e8e8" stroke="#bbb"/><rect x="560" y="520" width="380" height="240" fill="#444"/><rect x="900" y="560" width="600" height="200" rx="12" fill="#ddd"/><circle cx="1150" cy="160" r="40" fill="#f2e3b3"/><circle cx="1350" cy="160" r="40" fill="#f2e3b3"/>',
)
const tour: Collection = {
  groups: [
    {
      id: 'kitchen',
      caption: 'Kitchen',
      items: [
        image(
          'k1',
          1600,
          1000,
          kitchen,
          [
            { id: 'f1', x: 0.17, y: 0.45, label: 'Double fridge', body: 'Integrated, 600 L.' },
            {
              id: 'f2',
              x: 0.47,
              y: 0.62,
              label: 'Gas range',
              body: 'Five burners with a griddle.',
            },
            {
              id: 'f3',
              x: 0.75,
              y: 0.66,
              label: 'Breakfast island',
              body: '2.4 m quartz top, seats four.',
            },
            {
              id: 'f4',
              x: 0.78,
              y: 0.16,
              label: 'Pendant lights',
              body: 'Dimmable, on their own circuit.',
            },
          ],
          'A kitchen with a fridge, a range and an island',
        ),
      ],
    },
  ],
}

const viewers = new Map<string, ViewerApi>()
const build = (name: string, collection: Collection, pinOpts: PinsOptions, look: MountOptions) => {
  const plugin = pins(pinOpts)
  const viewer = createViewer({ collection, plugins: [plugin, thumbnails()] })
  mount(viewer, look)
  viewers.set(name, viewer)
  return plugin
}

build('shop', shop, { presentation: 'tag' }, {})
const reviewPins = build(
  'review',
  review,
  {
    presentation: 'comment',
    onPlace: (at, { item }) => {
      const list = (item.meta as { pins: Pin[] }).pins
      list.push({
        id: `t${list.length + 1}`,
        ...at,
        label: 'You',
        meta: 'now',
        body: 'New comment',
      })
      reviewPins.refresh()
      reviewPins.open(`t${list.length}`)
    },
  },
  { skin: 'console', preset: 'reviewer' },
)
build('tour', tour, { presentation: 'feature' }, { scheme: 'light' })

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-demo]')) {
  btn.addEventListener('click', () => viewers.get(btn.dataset.demo ?? '')?.open())
}
