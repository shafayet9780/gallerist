import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import '@visora/theme-default/visora.css'

const svg = (w: number, h: number, color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><text x="40" y="120" fill="white" font-size="120" font-family="sans-serif">${label}</text></svg>`,
  )}`

const imageItem = (id: string, color: string): Item => ({
  id,
  type: 'image',
  source: svg(3000, 2000, color, id),
  naturalSize: { w: 3000, h: 2000 },
  alt: `image ${id}`,
})

const collection: Collection = {
  groups: [
    { id: 'g0', items: [imageItem('a0', '#c0392b')] },
    {
      id: 'g1',
      items: [imageItem('b0', '#2980b9'), imageItem('b1', '#27ae60'), imageItem('b2', '#f39c12')],
    },
    { id: 'g2', items: [imageItem('c0', '#8e44ad'), imageItem('c1', '#16a085')] },
  ],
}

const viewer = createViewer({ collection, loop: true })
mount(viewer)

// expose for assertions
;(window as unknown as { viewer: typeof viewer }).viewer = viewer

document.getElementById('open')?.addEventListener('click', () => viewer.open())
