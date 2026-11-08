import { type Page, type Route, expect, test } from '@playwright/test'

// A host's CSS reset (0.5.1): Tailwind's preflight (and most resets) cap every image at its
// container (`max-width: 100%; height: auto`) and switch the page to border-box. The blurred
// placeholder is overscanned past its clipping box, so a cap there left it short on the right and
// bottom: a soft strip along two edges while the image loads. The reset goes in the page's <head>,
// ahead of the theme, as a host's stylesheet would.

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
