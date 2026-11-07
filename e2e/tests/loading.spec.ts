import { type Page, type Route, expect, test } from '@playwright/test'

// Loading (0.5): an image placeholder shows at once, blurred, in the box the image will paint in;
// the image fades in over it; a slow load gets a quiet pill, a failure keeps the placeholder and
// offers Retry; with no placeholder, a skeleton. Media is served by route interception here, so
// each test sets how fast (or whether) it arrives.

const svg = (w: number, h: number, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/><rect x="${w / 4}" y="${h / 4}" width="${w / 2}" height="${h / 2}" fill="#fff"/></svg>`
const fulfil = (route: Route, w: number, h: number, fill: string) =>
  route.fulfill({ contentType: 'image/svg+xml', body: svg(w, h, fill) })

type Media = 'fast' | 'hold' | 'fail-once' | 'fail'
/** Serves thumbs at once and the full images as `media` says; resolves held ones on release(). */
async function serve(page: Page, media: Media) {
  const held: (() => void)[] = []
  let failed = 0
  await page.route('**/thumb/*.svg', (r) => fulfil(r, 320, 180, '#2a6f97'))
  await page.route('**/media/*.svg', async (route) => {
    if (media === 'fail' || (media === 'fail-once' && failed++ === 0)) return route.abort()
    if (media === 'hold') await new Promise<void>((go) => held.push(go))
    return fulfil(route, 1600, 900, '#2a6f97')
  })
  const release = () => {
    for (const go of held.splice(0)) go()
  }
  page.on('close', release)
  return { release }
}

// the page's load event waits for held images: don't
const open = (page: Page, url: string) => page.goto(url, { waitUntil: 'domcontentloaded' })

const current = '.gallerist-slide[data-gallerist-current]'
const box = (page: Page) => page.locator(`${current} .gallerist-media-placeholder`)
const pill = (page: Page) => page.locator(`${current} .gallerist-media-pill`)
const full = (page: Page) => page.locator(`${current} .gallerist-media-image`)

/** The contain box a w:h image gets in the current slide's content layer. */
async function containBox(page: Page, w: number, h: number) {
  const r = await page.locator(`${current} .gallerist-content`).boundingBox()
  if (!r) throw new Error('no content layer')
  const s = Math.min(r.width / w, r.height / h)
  return { x: r.x + (r.width - w * s) / 2, y: r.y + (r.height - h * s) / 2, w: w * s, h: h * s }
}
/** Waits out an element's CSS animations that end (a delayed fade-in), then reads its opacity. */
const settledOpacity = (l: ReturnType<Page['locator']>) =>
  l.evaluate(async (e) => {
    const ending = e
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
    await Promise.all(ending.map((a) => a.finished))
    return Number(getComputedStyle(e).opacity)
  })
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)

test.describe('loading: an image placeholder', () => {
  test('shows at once, blurred, in the image box, and goes once the image is in', async ({
    page,
  }) => {
    const media = await serve(page, 'hold')
    await open(page, '/loading.html')
    const pv = box(page).locator('img')
    await expect(pv).toBeVisible()
    await expect
      .poll(() => pv.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
      .toBe(320)
    // the box is the image's (16:9 from the placeholder, no naturalSize given), and clips the blur
    const want = await containBox(page, 16, 9)
    const got = await box(page).boundingBox()
    if (!got) throw new Error('no placeholder box')
    near(got.x, want.x)
    near(got.y, want.y)
    near(got.width, want.w)
    near(got.height, want.h)
    expect(await box(page).evaluate((b) => getComputedStyle(b).overflow)).toBe('hidden')
    expect(await pv.evaluate((i) => getComputedStyle(i).filter)).toBe('blur(6px)')
    // overscanned by twice the blur: no dark fringe inside the box
    const over = await pv.boundingBox()
    if (!over) throw new Error('no placeholder image')
    near(over.x, got.x - 12)
    near(over.width, got.width + 24)
    expect(await full(page).evaluate((i) => getComputedStyle(i).opacity)).toBe('0')

    media.release()
    await expect(full(page)).toHaveAttribute('data-gallerist-loaded', '')
    await expect(box(page)).toBeHidden() // visibility: hidden once the 150ms reveal is over
    await expect(pill(page)).toHaveCount(0)
    // the image fills the same box the placeholder did
    const img = await full(page).evaluate((i: HTMLImageElement) => [
      i.naturalWidth,
      i.naturalHeight,
    ])
    expect(img).toEqual([1600, 900])
  })

  test('the pill shows only when the load is slow, in the image box’s bottom end corner', async ({
    page,
  }) => {
    const media = await serve(page, 'hold')
    await open(page, '/loading.html')
    await expect(pill(page)).toHaveCount(1)
    // not yet: it waits --gallerist-loading-delay (400ms) into the load, then fades in
    // (read as an item mounts: page load may outlast 400ms on a busy machine)
    const fresh = await page.evaluate(() => {
      ;(window as unknown as { viewer: { nextItem(): void } }).viewer.nextItem()
      const s = document.querySelector('.gallerist-slide[data-gallerist-current]')
      const p = s?.querySelector('.gallerist-media-pill')
      return p ? Number(getComputedStyle(p).opacity) : -1
    })
    expect(fresh).toBe(0)
    const delay = await pill(page).evaluate((p) => p.getAnimations()[0]?.effect?.getTiming().delay)
    expect(delay).toBe(400)
    expect(await settledOpacity(pill(page))).toBe(1)
    await expect(pill(page).getByRole('status')).toHaveText('Loading full size…')
    expect(await pill(page).evaluate((p) => getComputedStyle(p, '::before').animationName)).toBe(
      'gallerist-spin',
    )
    const b = await box(page).boundingBox()
    const p = await pill(page).boundingBox()
    if (!b || !p) throw new Error('no box')
    expect(p.x).toBeGreaterThan(b.x + b.width / 2) // the end (right) half…
    expect(p.y).toBeGreaterThan(b.y + b.height / 2) // …and the bottom half
    near(b.x + b.width - (p.x + p.width), 12)
    near(b.y + b.height - (p.y + p.height), 12)
    media.release()
    await expect(pill(page)).toHaveCount(0)
  })

  test('a fast load never shows the pill', async ({ page }) => {
    await serve(page, 'fast')
    await open(page, '/loading.html')
    // sample the pill every frame until the image is in: it never reaches any opacity
    const seen = await page.evaluate(
      () =>
        new Promise<number>((done) => {
          let max = 0
          const tick = () => {
            const s = document.querySelector('.gallerist-slide[data-gallerist-current]')
            const p = s?.querySelector('.gallerist-media-pill')
            if (p) max = Math.max(max, Number(getComputedStyle(p).opacity))
            if (s?.querySelector('.gallerist-media-image[data-gallerist-loaded]')) done(max)
            else requestAnimationFrame(tick)
          }
          tick()
        }),
    )
    expect(seen).toBe(0)
    await expect(pill(page)).toHaveCount(0)
  })

  test('moving to an item whose thumb is cached paints its placeholder at once', async ({
    page,
  }) => {
    // no routes here: routing turns the browser's cache off; the thumbs are static files
    await open(page, '/loading.html?hold=1')
    // the rail has every thumb loaded
    await expect
      .poll(() =>
        page
          .locator('.gallerist-thumbs img')
          .evaluateAll((all) => all.every((i) => (i as HTMLImageElement).naturalWidth > 0)),
      )
      .toBe(true)
    // in the same frame as the step, the next item's placeholder has its pixels: no black flash
    const ready = await page.evaluate(() => {
      ;(window as unknown as { viewer: { nextItem(): void } }).viewer.nextItem()
      const s = document.querySelector('.gallerist-slide[data-gallerist-current]')
      const pv = s?.querySelector<HTMLImageElement>('.gallerist-media-placeholder img')
      return new Promise<boolean>((done) =>
        requestAnimationFrame(() => done(!!pv?.complete && pv.naturalWidth > 0)),
      )
    })
    expect(ready).toBe(true)
  })

  test('a failure keeps the placeholder, sharp, and Retry loads it again', async ({ page }) => {
    await serve(page, 'fail-once')
    await open(page, '/loading.html')
    await expect(pill(page).getByRole('status')).toHaveText('Couldn’t load full size')
    await expect(page.locator(`${current} .gallerist-media-error`)).toHaveCount(0)
    const pv = box(page).locator('img')
    await expect(pv).toBeVisible()
    await expect.poll(() => pv.evaluate((i) => getComputedStyle(i).filter)).toBe('none')
    expect(await pill(page).evaluate((p) => Number(getComputedStyle(p).opacity))).toBe(1)
    // a real button, reached from the keyboard; it never took focus by itself
    const retry = pill(page).getByRole('button', { name: 'Retry' })
    await expect(retry).toBeVisible()
    expect(await retry.evaluate((b) => b === document.activeElement)).toBe(false)
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect(full(page)).toHaveAttribute('data-gallerist-loaded', '')
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { viewer: { getState(): { loaded: Record<string, string> } } }
          ).viewer.getState().loaded.a,
      ),
    ).toBe('loaded')
    // focus went with the old media: it's on the viewer, so its keys still work
    expect(await page.evaluate(() => document.activeElement?.classList.contains('gallerist'))).toBe(
      true,
    )
  })

  test('the zoom tool waits for the image', async ({ page }) => {
    const media = await serve(page, 'hold')
    await open(page, '/loading.html')
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    await expect(zoomIn).toHaveAttribute('aria-disabled', 'true')
    media.release()
    await expect(full(page)).toHaveAttribute('data-gallerist-loaded', '')
    await expect(zoomIn).not.toHaveAttribute('aria-disabled', 'true')
  })
})

test.describe('loading: no image placeholder', () => {
  test('a skeleton in the naturalSize box, after 300ms; the error card on a failure', async ({
    page,
  }) => {
    const media = await serve(page, 'hold')
    await open(page, '/loading.html?ph=none&ns=1')
    await expect(box(page)).toHaveAttribute('data-gallerist-skeleton', '')
    const delay = await box(page).evaluate((b) => b.getAnimations()[0]?.effect?.getTiming().delay)
    expect(delay).toBe(300)
    expect(await settledOpacity(box(page))).toBe(1)
    const want = await containBox(page, 16, 9)
    const got = await box(page).boundingBox()
    if (!got) throw new Error('no skeleton')
    near(got.width, want.w)
    near(got.height, want.h)
    // the shimmer sweeps
    expect(await box(page).evaluate((b) => getComputedStyle(b, '::after').animationName)).toBe(
      'gallerist-shimmer',
    )
    await expect(pill(page)).toHaveCount(0) // no "full size" to wait for
    media.release()
    await expect(full(page)).toHaveAttribute('data-gallerist-loaded', '')
    // the hidden box's sweep stops with it
    expect(await box(page).evaluate((b) => getComputedStyle(b, '::after').animationName)).toBe(
      'none',
    )
  })

  test('a failure shows the error card', async ({ page }) => {
    await serve(page, 'fail')
    await open(page, '/loading.html?ph=none')
    await expect(page.locator(`${current} .gallerist-media-error`)).toBeVisible()
    await expect(box(page)).toHaveCount(0)
  })

  test('a colour placeholder fills the image box at once', async ({ page }) => {
    await serve(page, 'hold')
    await open(page, '/loading.html?ph=color&ns=1')
    await expect(box(page)).toBeVisible()
    expect(await box(page).evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(
      'rgb(58, 90, 122)',
    )
    const want = await containBox(page, 16, 9)
    const got = await box(page).boundingBox()
    if (!got) throw new Error('no box')
    near(got.width, want.w)
    near(got.height, want.h)
  })
})

test.describe('loading: reduced motion', () => {
  test('no blur, no shimmer, no spin; the image still crossfades, briefly', async ({ page }) => {
    const media = await serve(page, 'hold')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/loading.html')
    const pv = box(page).locator('img')
    await expect(pv).toBeVisible()
    expect(await pv.evaluate((i) => getComputedStyle(i).filter)).toBe('none')
    const unscanned = await pv.boundingBox()
    const b = await box(page).boundingBox()
    near(unscanned?.width ?? 0, b?.width ?? -9)
    // the spinner holds still
    expect(await pill(page).evaluate((p) => getComputedStyle(p, '::before').animationName)).toBe(
      'none',
    )
    expect(await full(page).evaluate((i) => getComputedStyle(i).transitionDuration)).toBe('0.15s')
    media.release()
    await expect(full(page)).toHaveAttribute('data-gallerist-loaded', '')
  })

  test('the skeleton holds still', async ({ page }) => {
    await serve(page, 'hold')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/loading.html?ph=none')
    await expect(box(page)).toHaveAttribute('data-gallerist-skeleton', '')
    expect(await box(page).evaluate((b) => getComputedStyle(b, '::after').animationName)).toBe(
      'none',
    )
  })
})
