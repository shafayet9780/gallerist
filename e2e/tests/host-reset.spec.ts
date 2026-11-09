import { type Page, type Route, expect, test } from '@playwright/test'

// A host's CSS reset (0.5.1): Tailwind's preflight (and most resets) cap every image at its
// container (`max-width: 100%; height: auto`) and switch the page to border-box. The blurred
// placeholder is overscanned past its clipping box, so a cap there left it short on the right and
// bottom: a soft strip along two edges while the image loads. The reset goes in the page's <head>,
// ahead of the theme, as a host's stylesheet would: unlayered, so it beats any layered rule.
// The chrome keeps the size it has on a page without one (the toolbar was 12px shorter, a side
// index 24px narrower): measured against that page, not against fixed numbers.

const RESET = `*,::before,::after{box-sizing:border-box;border:0 solid}
img,svg,video,canvas{display:block;vertical-align:middle;max-width:100%;height:auto}`

const svg = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2a6f97"/></svg>`
const fulfil = (route: Route, w: number, h: number) =>
  route.fulfill({ contentType: 'image/svg+xml', body: svg(w, h) })

/** The fixture with the reset in its <head>; thumbs at once, the full images held until release(). */
async function withReset(page: Page, url: string) {
  const held: (() => void)[] = []
  await page.route(/\.html(\?.*)?$/, async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace('<head>', `<head><style>${RESET}</style>`)
    await route.fulfill({ response: res, body })
  })
  await page.route('**/thumb/*.svg', (r) => fulfil(r, 320, 180))
  await page.route('**/media/*.svg', async (route) => {
    await new Promise<void>((go) => held.push(go))
    return fulfil(route, 1600, 900)
  })
  page.on('close', () => {
    for (const go of held.splice(0)) go()
  })
  // the page's load event waits for held images: don't
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  return () => {
    for (const go of held.splice(0)) go()
  }
}

const current = '.gallerist-slide[data-gallerist-current]'
const rect = (page: Page, sel: string) =>
  page.locator(sel).evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)

for (const [name, query] of [
  ['its ratio from the placeholder', ''],
  ['naturalSize given', '?ns=1'],
])
  test(`a host reset: the blurred placeholder fills the image box (${name})`, async ({ page }) => {
    const release = await withReset(page, `/loading.html${query}`)
    const pv = page.locator(`${current} .gallerist-media-placeholder > img`)
    await expect
      .poll(() => pv.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
      .toBe(320)
    // the reset is in force (or this proves nothing)
    expect(await pv.evaluate((i) => getComputedStyle(i).boxSizing)).toBe('border-box')

    // overscanned by twice the blur on every side, so the clipped box shows no fringe and no strip
    const box = await rect(page, `${current} .gallerist-media-placeholder`)
    const img = await rect(page, `${current} .gallerist-media-placeholder > img`)
    const o =
      2 *
      (await pv.evaluate((i) =>
        Number.parseFloat(getComputedStyle(i).getPropertyValue('--gallerist-placeholder-blur')),
      ))
    expect(o).toBeGreaterThan(0)
    near(box.x - img.x, o) // left
    near(box.y - img.y, o) // top
    near(img.x + img.w - (box.x + box.w), o) // right
    near(img.y + img.h - (box.y + box.h), o) // bottom

    // and the box is the one the image paints in once it's in: same place, same size
    release()
    const full = page.locator(`${current} .gallerist-media-image`)
    await expect(full).toHaveAttribute('data-gallerist-loaded', '')
    const painted = await full.evaluate((i: HTMLImageElement) => {
      const r = i.getBoundingClientRect()
      const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight) // object-fit: contain
      const w = i.naturalWidth * s
      const h = i.naturalHeight * s
      return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, w, h }
    })
    near(box.x, painted.x)
    near(box.y, painted.y)
    near(box.w, painted.w)
    near(box.h, painted.h)
  })

// ── the chrome under the reset: every element of each kind the size it is without the reset ──
type Size = [w: number, h: number, borders: number]
/** Each selector's elements (in the page and the viewer's popovers): size and border widths. */
const sizes = (page: Page, sels: string[]) =>
  page.evaluate((sels) => {
    const out: Record<string, Size[]> = {}
    for (const sel of sels)
      out[sel] = [...document.querySelectorAll(sel)]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => {
          const r = e.getBoundingClientRect()
          const cs = getComputedStyle(e)
          const b = ['Top', 'Right', 'Bottom', 'Left'].reduce(
            (n, side) => n + Number.parseFloat(cs.getPropertyValue(`border-${side}-width`)),
            0,
          )
          return [r.width, r.height, b] as Size
        })
    return out
  }, sels)

/** Sizes once the layout holds still (two reads 150ms apart agree). */
async function settled(page: Page, sels: string[]) {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await sizes(page, sels))
        const same = now === last
        last = now
        return same
      },
      { intervals: [150] },
    )
    .toBe(true)
  return JSON.parse(last) as Record<string, Size[]>
}

type Scene = {
  url: string
  sels: string[]
  /** what to do before measuring (open a popover, hold or fail the image) */
  act?: (page: Page) => Promise<void>
  route?: (page: Page) => Promise<void>
}
const BAR = ['.gallerist-bar', '.gallerist-bar button', '.gallerist-stage']
const scenes: Record<string, (skin: string) => Scene> = {
  'toolbar, tools, zoom group, caption, rail, thumbs and navigator': (skin) => ({
    url: `/layout.html?preset=reviewer&skin=${skin}&captions=1&view=1&zoom-tool=1&shortcuts=1&zoom=2`,
    sels: [
      ...BAR,
      '.gallerist-zoom-tool',
      '.gallerist-region-caption',
      '.gallerist-caption',
      '.gallerist-thumbs',
      '.gallerist-thumb-item',
      '.gallerist-thumb',
      '.gallerist-navigator',
      '.gallerist-navigator-view',
    ],
  }),
  'the view menu': (skin) => ({
    url: `/layout.html?preset=reviewer&skin=${skin}&view=1`,
    sels: [...BAR, '.gallerist-view-menu', '.gallerist-view-item', '.gallerist-view-seg'],
    act: (page) => page.locator('.gallerist-view-btn').click(),
  }),
  'the shortcuts dialog': (skin) => ({
    url: `/layout.html?preset=reviewer&skin=${skin}&shortcuts=1`,
    sels: ['.gallerist-shortcuts', '.gallerist-shortcuts-head', '.gallerist-shortcuts-row'],
    act: async (page) => {
      await page.evaluate(() =>
        (window as unknown as { shortcutsPlugin: { open(): void } }).shortcutsPlugin.open(),
      )
      await expect(page.locator('.gallerist-shortcuts')).toBeVisible()
    },
  }),
  'the tour index cards': (skin) => ({
    url: `/layout.html?preset=tour&skin=${skin}&captions=1&labels=uneven`,
    sels: [
      ...BAR,
      '.gallerist-thumbs',
      '.gallerist-thumb-row',
      '.gallerist-thumb-row-count',
      '.gallerist-thumb-item',
    ],
  }),
  'the chips of a bottom index': (skin) => ({
    url: `/layout.html?preset=tour&skin=${skin}&captions=1&labels=uneven&rail=bottom`,
    sels: [...BAR, '.gallerist-thumbs', '.gallerist-thumb-row', '.gallerist-thumb-row-count'],
  }),
  'the grid': (skin) => ({
    url: `/layout.html?preset=tour&skin=${skin}&captions=1&overview=1&g=0`,
    sels: [
      '.gallerist-grid',
      '.gallerist-grid-section',
      '.gallerist-grid-cell',
      '.gallerist-grid-section-count',
    ],
  }),
  'a side rail': (skin) => ({
    url: `/layout.html?preset=contact&skin=${skin}&captions=1`,
    sels: [...BAR, '.gallerist-thumbs', '.gallerist-thumb-item'],
  }),
  'a pin card': (skin) => ({
    url: `/pins.html?skin=${skin}`,
    sels: [...BAR, '.gallerist-pin-marker', '.gallerist-pin-card'],
    act: async (page) => {
      await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
      await expect(page.locator('[data-pin="a"] .gallerist-pin-card')).toBeVisible()
    },
  }),
  'the loading pill': (skin) => ({
    url: `/loading.html?skin=${skin}&hold=1`,
    sels: [...BAR, '.gallerist-media-pill', '.gallerist-thumb'],
    // its status text arrives after --gallerist-loading-delay and widens it: measure once it has
    act: async (page) => {
      await expect(page.locator(`${current} .gallerist-media-pill`)).toBeVisible()
      await expect(page.locator(`${current} .gallerist-media-pill [role=status]`)).not.toBeEmpty()
    },
  }),
  Retry: (skin) => ({
    url: `/loading.html?skin=${skin}`,
    sels: [...BAR, '.gallerist-media-pill', '.gallerist-media-pill button'],
    route: (page) => page.route('**/media/*.svg', (r) => r.abort()),
    act: (page) => expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible(),
  }),
}

/** The scene's page open, with `reset` in its <head> ahead of the theme (or none), not acted on. */
async function show(page: Page, scene: Scene, reset?: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (reset)
    await page.route(/\.html(\?.*)?$/, async (route) => {
      const res = await route.fetch()
      const body = (await res.text()).replace('<head>', `<head><style>${reset}</style>`)
      await route.fulfill({ response: res, body })
    })
  await scene.route?.(page)
  await page.goto(scene.url)
  await expect(page.locator('.gallerist[data-gallerist-phase="open"]')).toBeVisible()
}

async function look(page: Page, scene: Scene, reset: boolean) {
  await show(page, scene, reset ? RESET : undefined)
  // the reset is in force, or not (or this proves nothing)
  expect(await page.evaluate(() => getComputedStyle(document.body).boxSizing)).toBe(
    reset ? 'border-box' : 'content-box',
  )
  await scene.act?.(page)
  return settled(page, scene.sels)
}

for (const skin of ['gallery', 'console', 'editorial'])
  for (const [name, scene] of Object.entries(scenes))
    test(`a host reset: ${name} keep their size (${skin})`, async ({ page, context }) => {
      const s = scene(skin)
      const plain = await look(page, s, false)
      const reset = await look(await context.newPage(), s, true)
      for (const sel of s.sels) {
        expect(plain[sel]?.length, `${sel}: none to measure`).toBeGreaterThan(0)
        expect(reset[sel]?.length, `${sel}: how many`).toBe(plain[sel]?.length)
        plain[sel]?.forEach(([w, h, b], i) => {
          const [rw, rh, rb] = reset[sel]?.[i] ?? []
          const at = `${sel} #${i}: ${w}×${h} (borders ${b}) without the reset, ${rw}×${rh} (${rb}) with it`
          expect(Math.abs(w - (rw ?? Number.NaN)), at).toBeLessThanOrEqual(1)
          expect(Math.abs(h - (rh ?? Number.NaN)), at).toBeLessThanOrEqual(1)
          expect(Math.abs(b - (rb ?? Number.NaN)), at).toBeLessThanOrEqual(1)
        })
      }
    })

// ── a host's font rule (0.5.2): `* { font-family; font-weight }` on every element ──
// Apploye's page sets Montserrat 500 on `*`, unlayered. It matches each element of the viewer, so
// one that set no font of its own took the page's instead of its parent's: the stacked rail's time
// text went sans and lost the current label's weight (it is in a span inside the label, which sets
// both). So did the index rows, the position count, the View menu, the shortcut list and the
// loading pill's text. Every element holding text keeps the family and weight it has without it.

const FONT_RESET = '*{font-family:serif;font-weight:400}'

/** Each visible element of the viewer that holds text of its own: its family and weight. */
const fonts = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.gallerist *')]
      .filter(
        (e) =>
          // drawn (not the 1px live region, whose text comes and goes)
          e.getBoundingClientRect().width > 1 &&
          [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()),
      )
      .map((e) => {
        const cs = getComputedStyle(e)
        return `${e.className || e.tagName}: ${cs.fontFamily} ${cs.fontWeight}`
      }),
  )

const fontScenes: Record<string, (skin: string) => Scene> = {
  ...scenes,
  'the stacked timeline rail': (skin) => ({
    url: `/layout.html?preset=reviewer&skin=${skin}&display=stacked&captions=1`,
    sels: [],
  }),
}

for (const skin of ['gallery', 'console', 'editorial'])
  for (const [name, scene] of Object.entries(fontScenes))
    test(`a host font rule: ${name} keep their font (${skin})`, async ({ page, context }) => {
      const s = scene(skin)
      await show(page, s)
      await s.act?.(page)
      const plain = await fonts(page)
      const other = await context.newPage()
      await show(other, s, FONT_RESET)
      // the rule is in force (or this proves nothing): an element of the page's own takes it
      const probe = await other.evaluate(() => {
        const i = document.body.appendChild(document.createElement('i'))
        const { fontFamily, fontWeight } = getComputedStyle(i)
        i.remove()
        return `${fontFamily} ${fontWeight}`
      })
      expect(probe).toBe('serif 400')
      await s.act?.(other)
      expect(plain.length, 'none to compare').toBeGreaterThan(0)
      expect(await fonts(other)).toEqual(plain)
    })

// the reported case, as Apploye has it: the current label at 600, the time in the label's face
for (const skin of ['gallery', 'console', 'editorial'])
  test(`a host font rule: the stacked time text keeps its face and the current label its weight (${skin})`, async ({
    page,
  }) => {
    await show(
      page,
      { url: `/layout.html?preset=reviewer&skin=${skin}&display=stacked`, sels: [] },
      `${FONT_RESET}.gallerist{--gallerist-label-current-weight:600}`,
    )
    const labels = await page.locator('.gallerist-thumb-time').evaluateAll((els) =>
      els.map((label) => {
        const text = label.querySelector('.gallerist-thumb-time-text') as Element
        const cs = getComputedStyle(text)
        return {
          current: !!label.closest('[data-active]'),
          family: cs.fontFamily,
          // the token, resolved: the face the label is drawn in
          mono: getComputedStyle(label).getPropertyValue('--gallerist-mono').trim(),
          weight: cs.fontWeight,
        }
      }),
    )
    expect(labels.length).toBeGreaterThan(3)
    expect(labels.filter((l) => l.current)).toHaveLength(1)
    for (const l of labels) {
      expect(l.family).not.toBe('serif')
      // (WebKit drops the quotes around a family name)
      expect(l.family.replace(/["\s]/g, '')).toBe(l.mono.replace(/["\s]/g, ''))
      expect(l.weight).toBe(l.current ? '600' : '500')
    }
    if (skin === 'console') expect(labels[0]?.family).toContain('IBM Plex Mono')
  })
