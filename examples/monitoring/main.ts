import {
  type Collection,
  type Group,
  type Item,
  type OverlaySpec,
  createViewer,
} from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440"><rect width="100%" height="100%" fill="${color}"/><text x="80" y="180" fill="white" font-size="140" font-family="sans-serif">${label}</text></svg>`,
  )}`

// activity ramp (spec §27.6): red <30, amber 30–69, green ≥70
const activityColor = (pct: number) => (pct < 30 ? '#c0392b' : pct < 70 ? '#f39c12' : '#27ae60')

const screen = (moment: number, monitor: number, activity: number): Item => {
  const overlays: OverlaySpec[] = [
    {
      id: `act-${moment}-${monitor}`,
      anchor: { kind: 'viewport', at: 'top-left', offset: [16, 64] },
      render: () => {
        const el = document.createElement('div')
        el.textContent = `${activity}% active`
        el.style.cssText = `background:${activityColor(activity)};color:#fff;padding:4px 8px;border-radius:6px;font:500 13px system-ui`
        return el
      },
    },
    {
      id: `pin-${moment}-${monitor}`,
      anchor: { kind: 'point', x: 0.5, y: 0.5 },
      render: () => {
        const el = document.createElement('div')
        el.textContent = '⌖'
        el.style.cssText = 'font-size:28px;color:#fff;text-shadow:0 1px 4px #000'
        return el
      },
    },
  ]
  return {
    id: `m${moment}-mon${monitor}`,
    type: 'image',
    source: svg(
      `hsl(${moment * 40} 45% ${30 + monitor * 8}%)`,
      `Moment ${moment} · Monitor ${monitor + 1}`,
    ),
    naturalSize: { w: 2560, h: 1440 },
    alt: `Moment ${moment}, monitor ${monitor + 1}`,
    meta: { activity },
    overlays,
  }
}

// 6 moments, each with 1–3 monitors — a real nested (galleries-of-galleries) shape.
const groups: Group[] = Array.from({ length: 6 }, (_, m) => {
  const monitors = 1 + (m % 3)
  return {
    id: `moment-${m}`,
    items: Array.from({ length: monitors }, (_, mon) =>
      screen(m, mon, ((m * 17 + mon * 23) % 100) + 1),
    ),
  }
})

const collection: Collection = { groups }

// itemMemory:'preserve' → keep the same monitor index when moving across moments.
const viewer = createViewer({ collection, loop: true, itemMemory: 'preserve' })
mount(viewer)

const rail = document.getElementById('moments')
groups.forEach((group, g) => {
  const wrap = document.createElement('div')
  wrap.className = 'moment'
  const btn = document.createElement('button')
  btn.type = 'button'
  const img = document.createElement('img')
  const first = group.items[0]
  img.src = first && typeof first.source === 'string' ? first.source : ''
  img.alt = `Moment ${g}`
  btn.appendChild(img)
  btn.addEventListener('click', () => viewer.open({ g }))
  const label = document.createElement('span')
  label.textContent = `Moment ${g} · ${group.items.length} monitor(s)`
  wrap.append(btn, label)
  rail?.appendChild(wrap)
})
