import { type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><rect width="100%" height="100%" fill="${color}"/><text x="60" y="140" fill="white" font-size="110" font-family="sans-serif">${label}</text></svg>`,
  )}`

const colors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085']
const items: Item[] = colors.map((c, i) => ({
  id: `photo-${i}`,
  type: 'image',
  source: svg(c, `Photo ${i + 1}`),
  naturalSize: { w: 1600, h: 1067 },
  alt: `Photo ${i + 1}`,
}))

// Flat sugar: items[] is normalized to singleton groups internally.
const viewer = createViewer({ items, loop: true })
mount(viewer)

const grid = document.getElementById('grid')
items.forEach((item, i) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  const img = document.createElement('img')
  img.src = typeof item.source === 'string' ? item.source : ''
  img.alt = item.alt ?? ''
  btn.appendChild(img)
  btn.addEventListener('click', () => viewer.open({ g: i }))
  grid?.appendChild(btn)
})
