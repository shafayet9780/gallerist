import { type Collection, type Group, createViewer } from '@gallerist/core'
import { grid } from '@gallerist/plugin-grid'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

// Drawn placeholders, so the example needs no image files: swap `source` for real photos.
const picture = (hue: number, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="100%" height="100%" fill="hsl(${hue} 28% 62%)"/><rect y="760" width="100%" height="440" fill="hsl(${hue} 30% 44%)"/><rect x="620" y="240" width="560" height="360" fill="hsl(${hue} 40% 84%)"/><text x="80" y="150" fill="white" font-size="96" font-family="sans-serif">${label}</text></svg>`,
  )}`

const room = (id: string, name: string, floor: string, hue: number, count: number): Group => ({
  id,
  caption: name,
  meta: { subtitle: floor },
  items: Array.from({ length: count }, (_, i) => ({
    id: `${id}-${i}`,
    type: 'image' as const,
    source: picture(hue + i * 8, `${name} ${i + 1}`),
    naturalSize: { w: 1800, h: 1200 },
    alt: `${name}, photo ${i + 1}`,
    caption: `${name}, view ${i + 1}`,
  })),
})

const collection: Collection = {
  meta: { title: 'Linden House' },
  groups: [
    room('exterior', 'Exterior', 'Outside', 130, 3),
    room('living', 'Living room', 'Ground floor', 30, 5),
    room('kitchen', 'Kitchen', 'Ground floor', 200, 3),
    room('dining', 'Dining', 'Ground floor', 150, 1),
    room('study', 'Study', 'First floor', 50, 2),
    room('bedroom', 'Primary bedroom', 'First floor', 340, 3),
    room('bathrooms', 'Bathrooms', 'First floor', 190, 3),
  ],
}

const viewer = createViewer({
  collection,
  plugins: [
    // the tour preset makes the rail a section index; an explicit option wins over the preset's
    // (numberItems: false drops the item numbers), the rest still come from the preset
    thumbnails({ numberItems: false }),
    grid({ layout: 'sections', startOpen: true, strings: { start: 'Start tour' } }),
  ],
})
mount(viewer, { preset: 'tour', skin: 'gallery', scheme: 'light', label: 'Linden House tour' })

// open() resumes where the viewer was, so the overview needs the first item asked for; a room's tile goes straight to that room (the first room's
// first photo is where the overview shows, so its tile lands there)
document.getElementById('all')?.addEventListener('click', () => viewer.open({ g: 0, i: 0 }))
const mosaic = document.getElementById('mosaic')
collection.groups.forEach((group, g) => {
  const tile = document.createElement('button')
  tile.type = 'button'
  const img = document.createElement('img')
  img.src = group.items[0]?.source as string
  img.alt = ''
  const name = document.createElement('span')
  name.textContent = group.caption ?? ''
  tile.append(img, name)
  tile.addEventListener('click', () => viewer.open({ g }))
  mosaic?.appendChild(tile)
})
