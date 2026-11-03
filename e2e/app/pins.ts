// Pins fixture (e2e/tests/pins.spec.ts): one landscape item with three pins and one portrait item
// (for the contained zoom bounds). Query: skin, scheme, preset, presentation, card, bg (the landscape
// image's colour), dir.
import { type Collection, createViewer } from '@gallerist/core'
import { type Pin, type PinPresentation, pins } from '@gallerist/plugin-pins'
import { type ColorScheme, type PresetName, mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'

const p = new URLSearchParams(location.search)
if (p.get('dir') === 'rtl') document.documentElement.dir = 'rtl'
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
          source: svg(1600, 1000, p.get('bg') ?? '#2980b9'),
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
// card=form: a host-rendered card, a form whose Save rewrites the pin and redraws (as an app saving a
// comment would); `removed` counts the nodes handed back through onCardRemove
const removed: string[] = []
const formCard =
  p.get('card') === 'form'
    ? {
        renderCard: (pin: Pin) => {
          const form = document.createElement('form')
          form.className = 'host-card'
          const input = document.createElement('input')
          input.setAttribute('aria-label', 'Comment')
          input.value = pin.body ?? ''
          const save = document.createElement('button')
          save.type = 'button'
          save.textContent = 'Save'
          save.addEventListener('click', () => {
            const list = collection.groups[0]?.items[0]?.meta as { pins: Pin[] }
            list.pins = list.pins.map((q) => (q.id === pin.id ? { ...q, body: input.value } : q))
            plugin.refresh()
          })
          form.append(input, save)
          return form
        },
        onCardRemove: (pin: Pin) => removed.push(pin.id),
      }
    : {}
// card=draft: a review app's comment draft: a host card taller than a landscape phone's stage (a
// textarea, Save, Discard); a placed pin opens with focus, and one still without a body when its
// card closes is dropped (onOpenChange by ctx.previous, then refresh(), as the README shows)
const draft = p.get('card') === 'draft'
const pinsOf = () => (collection.groups[0]?.items[0]?.meta as { pins: Pin[] }).pins
const draftCard = draft
  ? {
      renderCard: (pin: Pin) => {
        const form = document.createElement('form')
        form.className = 'host-card'
        const text = document.createElement('textarea')
        text.setAttribute('aria-label', 'Comment')
        text.style.cssText = 'display:block;box-sizing:border-box;width:220px;height:300px'
        text.value = pin.body ?? ''
        const button = (label: string, run: () => void) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.textContent = label
          b.addEventListener('click', run)
          form.append(b)
        }
        form.append(text)
        button('Save', () => {
          const list = pinsOf()
          const at = list.findIndex((q) => q.id === pin.id)
          list[at] = { ...pin, body: text.value }
          plugin.refresh()
        })
        button('Discard', () => plugin.open(null, { focus: true }))
        return form
      },
      onOpenChange: (_pin: Pin | null, { previous }: { previous: Pin | null }) => {
        if (!previous?.id.startsWith('n') || previous.body) return
        const list = pinsOf()
        list.splice(
          list.findIndex((q) => q.id === previous.id),
          1,
        )
        plugin.refresh()
      },
    }
  : {}
const plugin = pins({
  ...formCard,
  ...draftCard,
  presentation: (p.get('presentation') ?? 'tag') as PinPresentation,
  onPlace: (at, { item }) => {
    placed.push(at)
    const id = `n${placed.length}`
    ;(item.meta as { pins: Pin[] }).pins.push({ id, ...at, label: 'New' })
    plugin.refresh()
    if (draft) plugin.open(id, { focus: true })
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
Object.assign(window, { viewer, placed, removed })
