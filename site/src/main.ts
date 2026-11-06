import './site.css'
import { type Collection, type ViewerApi, createViewer } from '@gallerist/core'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { grid } from '@gallerist/plugin-grid'
import { type Pin, pins } from '@gallerist/plugin-pins'
import { download } from '@gallerist/plugin-save'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { view } from '@gallerist/plugin-view'
import { zoom } from '@gallerist/plugin-zoom'
import {
  type ColorScheme,
  type PresetName,
  type RendererHandle,
  type Skin,
  mount,
} from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'

const SKINS: Skin[] = ['gallery', 'console', 'editorial']
const PRESETS: PresetName[] = ['filmstrip', 'reviewer', 'immersive', 'contact', 'editorial', 'tour']
const ACCENTS: Record<string, string[]> = {
  gallery: ['periwinkle', 'mint', 'amber', 'vermilion'],
  console: ['amber', 'cyan', 'vermilion'],
  editorial: ['vermilion', 'cobalt'],
}
const SCHEMES = ['skin default', 'dark', 'light', 'auto']

interface Setup {
  skin: Skin
  preset: PresetName
  accent: string
  scheme: string
}

const PAIRINGS: Array<{ label: string; setup: Setup }> = [
  {
    label: 'Photos',
    setup: { skin: 'gallery', preset: 'filmstrip', accent: 'periwinkle', scheme: 'skin default' },
  },
  {
    label: 'Review',
    setup: { skin: 'console', preset: 'reviewer', accent: 'amber', scheme: 'skin default' },
  },
  {
    label: 'Portfolio',
    setup: { skin: 'editorial', preset: 'editorial', accent: 'vermilion', scheme: 'skin default' },
  },
  { label: 'Listing', setup: { skin: 'gallery', preset: 'tour', accent: 'mint', scheme: 'light' } },
]

const photo = (n: number, id: string, caption: string, comments: Pin[] = []) => ({
  id,
  type: 'image' as const,
  source: `./photos/tech-0${n}.jpg`,
  thumb: `./photos/tech-0${n}-thumb.jpg`,
  alt: caption,
  caption,
  meta: { pins: comments },
})

const makeCollection = (): Collection => ({
  meta: { title: 'A day of work' },
  groups: [
    {
      id: 'morning',
      caption: 'Morning',
      meta: { time: '09:00', subtitle: 'At the bench' },
      items: [
        photo(1, 'morning-1', 'Circuit board', [
          {
            id: 'pin-1',
            x: 0.32,
            y: 0.42,
            label: 'Pinned to the image',
            body: 'Zoom in: this stays on the same spot.',
          },
        ]),
        photo(2, 'morning-2', 'Green terminal'),
        photo(3, 'morning-3', 'Teal circuit'),
      ],
    },
    {
      id: 'afternoon',
      caption: 'Afternoon',
      meta: { time: '14:30', subtitle: 'In the office' },
      items: [photo(4, 'afternoon-1', 'Dashboard'), photo(5, 'afternoon-2', 'Office floor')],
    },
    {
      id: 'evening',
      caption: 'Evening',
      meta: { time: '18:45', subtitle: 'At the desk' },
      items: [photo(6, 'evening-1', 'Code editor')],
    },
  ],
})

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ── playground ──────────────────────────────────────────────────────────────
const state: Setup = { ...(PAIRINGS[0] as { setup: Setup }).setup }
let viewer: ViewerApi | null = null
let handle: RendererHandle | null = null

function radios(id: keyof Setup, values: string[]) {
  const set = $(id)
  for (const old of set.querySelectorAll('label')) old.remove()
  for (const value of values) {
    const label = document.createElement('label')
    label.className = 'choice'
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = id
    input.value = value
    input.checked = state[id] === value
    input.addEventListener('change', () => {
      ;(state[id] as string) = value
      if (id === 'skin') {
        state.accent = ACCENTS[value]?.[0] ?? ''
        radios('accent', ACCENTS[value] ?? [])
      }
      render()
    })
    const text = document.createElement('span')
    text.textContent = value
    label.append(input, text)
    set.append(label)
  }
}

function syncControls() {
  radios('skin', SKINS)
  radios('preset', PRESETS)
  radios('accent', ACCENTS[state.skin] ?? [])
  radios('scheme', SCHEMES)
}

function snippet(s: Setup): string {
  const options = [`preset: '${s.preset}'`, `skin: '${s.skin}'`]
  if (s.accent !== ACCENTS[s.skin]?.[0]) options.push(`accent: '${s.accent}'`)
  if (s.scheme !== 'skin default') options.push(`scheme: '${s.scheme}'`)
  const extra = s.skin === 'gallery' ? '' : `import '@gallerist/theme-default/${s.skin}.css'\n`
  return `import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import '@gallerist/theme-default/gallerist.css'
${extra}
const viewer = createViewer({
  collection,
  plugins: [thumbnails()], // the preset sets the rail
})
mount(viewer, { ${options.join(', ')} })
viewer.open()`
}

function render() {
  const stage = $('stage')
  const at = viewer?.getState().cursor ?? { g: 0, i: 0 }
  handle?.destroy()
  viewer?.destroy()
  stage.replaceChildren()
  const presentation =
    state.preset === 'reviewer' ? 'comment' : state.preset === 'tour' ? 'feature' : 'tag'
  const current = createViewer({
    collection: makeCollection(),
    startAt: at,
    plugins: [
      thumbnails(),
      grid(state.preset === 'tour' ? { layout: 'sections', strings: { start: 'Start tour' } } : {}),
      pins({ presentation }),
      zoom(),
      fullscreen(),
      download(),
      // the View menu switches the rail and the scheme in the open viewer; the page's scheme follows
      view({
        onChange: ({ scheme }) => {
          if (!scheme) return // a rail choice
          state.scheme = scheme
          radios('scheme', SCHEMES)
          $('snippet').textContent = snippet(state)
        },
      }),
    ],
  })
  viewer = current
  handle = mount(current, {
    container: stage,
    preset: state.preset,
    skin: state.skin,
    accent: state.accent,
    scheme: state.scheme === 'skin default' ? undefined : (state.scheme as ColorScheme),
    label: 'Playground viewer',
  })
  current.open(at)
  // close and Esc work here as they do on a page, so offer the way back
  let reopen: HTMLButtonElement | null = null
  current.subscribe(() => {
    const closed = current.getState().phase === 'closed'
    if (closed && !reopen) {
      reopen = document.createElement('button')
      reopen.type = 'button'
      reopen.className = 'reopen'
      reopen.textContent = 'Open the viewer again'
      reopen.addEventListener('click', () => current.open())
      stage.append(reopen)
      reopen.focus()
    } else if (!closed && reopen) {
      // removing the focused button would drop focus to <body>, where the viewer's keys don't reach
      const hadFocus = document.activeElement === reopen
      reopen.remove()
      reopen = null
      if (hadFocus) stage.querySelector<HTMLElement>('.gallerist')?.focus({ preventScroll: true })
    }
  })
  $('snippet').textContent = snippet(state)
}

for (const { label, setup } of PAIRINGS) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', () => {
    Object.assign(state, setup)
    syncControls()
    render()
  })
  $('pairings').append(button)
}
$<HTMLFormElement>('controls').addEventListener('submit', (e) => e.preventDefault())
$('copy').addEventListener('click', async () => {
  const button = $('copy')
  try {
    await navigator.clipboard.writeText($('snippet').textContent ?? '')
    button.textContent = 'Copied'
  } catch {
    button.textContent = 'Press Ctrl+C to copy'
    const range = document.createRange()
    range.selectNodeContents($('snippet'))
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  setTimeout(() => {
    button.textContent = 'Copy'
  }, 1800)
})
syncControls()
render()

// ── the contact sheet: the core on its own, no renderer ─────────────────────
type Memory = 'reset' | 'preserve' | 'clamp'
const collection = makeCollection()
let sheetViewer = createViewer({ collection })
const cells = new Map<string, HTMLElement>()

const sheet = $('sheet')
collection.groups.forEach((group, g) => {
  const row = document.createElement('div')
  row.className = 'sheet-row'
  const name = document.createElement('span')
  name.className = 'sheet-name'
  name.textContent = group.caption ?? ''
  row.append(name)
  group.items.forEach((item, i) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'sheet-cell'
    cell.setAttribute('aria-label', `${group.caption}, photo ${i + 1}`)
    const img = document.createElement('img')
    img.src = item.thumb as string
    img.alt = ''
    img.loading = 'lazy'
    cell.append(img)
    cell.addEventListener('click', () => sheetViewer.goTo(g, i))
    cells.set(`${g}:${i}`, cell)
    row.append(cell)
  })
  sheet.append(row)
})
const mark = () => {
  const { g, i } = sheetViewer.getState().cursor
  for (const [key, cell] of cells) {
    if (key === `${g}:${i}`) cell.setAttribute('aria-current', 'true')
    else cell.removeAttribute('aria-current')
  }
}
const connect = () => {
  sheetViewer.subscribe(mark)
  mark()
}
$('right').addEventListener('click', () => sheetViewer.next())
$('left').addEventListener('click', () => sheetViewer.prev())
$('down').addEventListener('click', () => sheetViewer.nextItem())
$('up').addEventListener('click', () => sheetViewer.prevItem())
$<HTMLSelectElement>('memory').addEventListener('change', (e) => {
  const { cursor } = sheetViewer.getState()
  sheetViewer.destroy()
  sheetViewer = createViewer({
    collection,
    startAt: cursor,
    itemMemory: (e.target as HTMLSelectElement).value as Memory,
  })
  connect()
})
connect()
