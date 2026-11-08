// Loading fixture: images come from /media/<id>.svg and placeholders from /thumb/<id>.svg, which
// e2e/tests/loading.spec.ts serves (and delays or fails) with route interception.
// ph=url (default) | color | none · ns=1 gives naturalSize · skin / scheme as on mount. The thumbs
// are also static files (public/thumb), for a test with no routes.
import { type Item, createViewer } from '@gallerist/core'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { zoom } from '@gallerist/plugin-zoom'
import { type ColorScheme, mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'

const p = new URLSearchParams(location.search)
const ph = p.get('ph') ?? 'url'
const item = (id: string): Item => ({
  id,
  type: 'image',
  // hold=1: a load that never ends, with no route (routing turns the browser's cache off)
  source:
    p.get('hold') === '1' ? { loader: () => new Promise<string>(() => {}) } : `/media/${id}.svg`,
  thumb: `/thumb/${id}.svg`,
  alt: `screen ${id}`,
  ...(ph === 'url'
    ? { placeholder: `/thumb/${id}.svg` }
    : ph === 'color'
      ? { placeholder: '#3a5a7a' }
      : {}),
  ...(p.get('ns') === '1' ? { naturalSize: { w: 1600, h: 900 } } : {}),
})

const viewer = createViewer({
  collection: { groups: [{ id: 'g', items: ['a', 'b', 'c', 'd'].map(item) }] },
  plugins: [thumbnails(), zoom()],
})
mount(viewer, {
  skin: p.get('skin') ?? undefined,
  scheme: (p.get('scheme') ?? undefined) as ColorScheme | undefined,
  preload: { ahead: 0, behind: 0 },
})
;(window as unknown as { viewer: typeof viewer }).viewer = viewer
viewer.open()
