import {
  type Collection,
  type Group,
  type Item,
  type OverlaySpec,
  createViewer,
} from '@gallerist/core'
import { captions } from '@gallerist/plugin-captions'
import { type Pin, pins } from '@gallerist/plugin-pins'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'

const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1440"><rect width="100%" height="100%" fill="${color}"/><text x="80" y="180" fill="white" font-size="140" font-family="sans-serif">${label}</text></svg>`,
  )}`

// activity ramp (spec §27.6): red <30, amber 30–69, green ≥70
const activityColor = (pct: number) => (pct < 30 ? '#c0392b' : pct < 70 ? '#f39c12' : '#27ae60')

// one capture every 10 minutes from 09:00 (the reviewer timeline labels each moment with it)
const time = (moment: number) => `09:${String(moment * 10).padStart(2, '0')}`

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
  ]
  // review comments pinned to the screenshot (plugin-pins reads item.meta.pins)
  const comments: Pin[] =
    monitor === 0
      ? [
          {
            id: `c-${moment}-1`,
            x: 0.72,
            y: 0.64,
            label: 'R. Okafor',
            meta: `${time(moment)}`,
            body: 'Idle for most of this window. Was a meeting scheduled?',
            replies: [{ author: 'M. Lindqvist', meta: 'later', body: 'Yes: sprint planning.' }],
          },
          {
            id: `c-${moment}-2`,
            x: 0.24,
            y: 0.3,
            label: 'J. Tanaka',
            meta: `${time(moment)}`,
            body: 'Private browsing window, blurred as expected.',
            resolved: moment % 2 === 0,
          },
        ]
      : []
  return {
    id: `m${moment}-mon${monitor}`,
    type: 'image',
    source: svg(
      `hsl(${moment * 40} 45% ${30 + monitor * 8}%)`,
      `Moment ${moment} · Monitor ${monitor + 1}`,
    ),
    naturalSize: { w: 2560, h: 1440 },
    alt: `Moment ${moment}, monitor ${monitor + 1}`,
    meta: { activity, pins: comments },
    overlays,
  }
}

// 6 moments, each with 1–3 monitors — a real nested (galleries-of-galleries) shape.
const groups: Group[] = Array.from({ length: 6 }, (_, m) => {
  const monitors = 1 + (m % 3)
  return {
    id: `moment-${m}`,
    caption: `${monitors} monitor${monitors > 1 ? 's' : ''}`,
    meta: { time: time(m) },
    items: Array.from({ length: monitors }, (_, mon) =>
      screen(m, mon, ((m * 17 + mon * 23) % 100) + 1),
    ),
  }
})

const collection: Collection = { groups }

// itemMemory:'preserve' → keep the same monitor index when moving across moments.
// A review tool: the Console skin with the reviewer preset (timeline rail, numbered monitors, zoom
// navigator) and comment pins; press C (or the toolbar button) and click to add a comment.
const commentPins = pins({
  presentation: 'comment',
  onPlace: (at, { item }) => {
    const list = (item.meta as { pins: Pin[] }).pins
    const id = `new-${list.length + 1}`
    list.push({ id, ...at, label: 'You', meta: 'now', body: 'New comment' })
    commentPins.refresh()
    commentPins.open(id)
  },
})
// The caption bar, designed once for the viewer: the capture time, which monitor, and the activity
// (item data keeps only facts; plugin-captions turns them into markup for the current screen).
const screenCaption = captions<{ time: string }, { activity: number }>({
  render: (item, group, { cursor }) => {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;gap:12px;align-items:baseline'
    const at = document.createElement('strong')
    at.textContent = group.meta?.time ?? ''
    const where = document.createElement('span')
    where.textContent = `Monitor ${cursor.i + 1} of ${group.items.length}`
    const activity = item.meta?.activity ?? 0
    const level = document.createElement('span')
    level.textContent = `${activity}% active`
    level.style.color = activityColor(activity)
    el.append(at, where, level)
    return el
  },
})
const viewer = createViewer({
  collection,
  loop: true,
  itemMemory: 'preserve',
  // the reviewer preset sets the rail: a timeline over the groups, numbered items
  plugins: [thumbnails(), commentPins, screenCaption],
})
mount(viewer, { skin: 'console', preset: 'reviewer' })

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
