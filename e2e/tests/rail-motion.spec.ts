// The rail collapsing to its handle and coming back, and a stacked rail's item column opening and
// closing: the panel glides to its new size (plugin-thumbnails), so the stage beside it grows or
// shrinks a little each frame instead of jumping; under reduced motion it changes at once. Either
// way the hidden panel ends out of the tab order and the accessibility tree.
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

const REVIEWER = '/layout.html?preset=reviewer&skin=console&display=flat&custom=short'

const open = async (page: Page, query: string) => {
  await page.goto(query)
  await viewerSettled(page)
  await expect(page.locator('.gallerist-thumb-item').first()).toBeVisible()
}

type Frame = { stage: number; panel: number; display: string; inert: boolean }

// Run `act` in the page, then record the stage's size along `dim` and the panel's, frame by frame,
// for `ms`.
const frames = (page: Page, act: string, panel: string, dim: 'width' | 'height', ms = 450) =>
  page.evaluate(
    async ({ act, panel, dim, ms }) => {
      const stage = document.querySelector('.gallerist-main') as HTMLElement
      const el = document.querySelector(panel) as HTMLElement
      const out: Frame[] = []
      const read = () =>
        out.push({
          stage: stage.getBoundingClientRect()[dim],
          panel: el.getBoundingClientRect()[dim],
          display: getComputedStyle(el).display,
          inert: el.inert,
        })
      read()
      if (act === 'toggle')
        (document.querySelector('.gallerist-rail-toggle') as HTMLElement).click()
      if (act === 'items')
        (document.querySelector('.gallerist-items-toggle') as HTMLElement).click()
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r))
        read()
      }
      return out
    },
    { act, panel, dim, ms },
  )

// The stage moved through several sizes between its first and last, one way only, no step more
// than half the way.
const glided = (seen: Frame[]) => {
  const sizes = seen.map((f) => Math.round(f.stage))
  const first = sizes[0] ?? 0
  const last = sizes[sizes.length - 1] ?? 0
  const between = new Set(sizes.filter((s) => (s - first) * (s - last) < 0))
  expect(Math.abs(last - first)).toBeGreaterThan(30)
  expect(between.size).toBeGreaterThanOrEqual(3)
  const dir = Math.sign(last - first)
  for (let k = 1; k < sizes.length; k++) {
    const step = ((sizes[k] ?? 0) - (sizes[k - 1] ?? 0)) * dir
    expect(step).toBeGreaterThanOrEqual(-1) // never back
    expect(step).toBeLessThan(Math.abs(last - first) / 2)
  }
}

test('the handle collapses the row rail with a glide, and brings it back the same way', async ({
  page,
}) => {
  await open(page, REVIEWER)
  const region = page.locator('.gallerist-thumbs-region')
  const shut = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height')
  glided(shut)
  // on its way out the rail takes no focus; then it is gone (display: none)
  expect(shut.some((f) => f.display !== 'none' && f.inert)).toBe(true)
  await expect(region).toBeHidden()
  await expect(region).not.toHaveAttribute('data-gallerist-glide')
  expect(await region.evaluate((el) => (el as HTMLElement).inert)).toBe(false)
  await expect(page.locator('.gallerist-rail-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.gallerist-thumb-item').first()).not.toBeInViewport()

  const back = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height')
  glided(back)
  expect(back.every((f) => !f.inert)).toBe(true)
  await expect(region).toBeVisible()
  // back where it started
  expect(Math.round(back[back.length - 1]?.stage ?? 0)).toBe(Math.round(shut[0]?.stage ?? 0))
})

test('reduced motion: the rail collapses and comes back at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, REVIEWER)
  const shut = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height', 120)
  expect(shut[1]?.display).toBe('none')
  expect(new Set(shut.slice(1).map((f) => Math.round(f.stage))).size).toBe(1)
  const back = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height', 120)
  expect(back[1]?.display).not.toBe('none')
  expect(new Set(back.slice(1).map((f) => Math.round(f.stage))).size).toBe(1)
})

test('a zoomed image stays zoomed, on the same spot, while the rail glides away and back', async ({
  page,
}) => {
  await open(page, `${REVIEWER}&zoom=2`)
  const zoom = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { viewer: { getState(): { zoom: { scale: number } } } }
        ).viewer.getState().zoom.scale,
    )
  expect(await zoom()).toBe(2)
  await frames(page, 'toggle', '.gallerist-thumbs-region', 'height')
  expect(await zoom()).toBe(2)
  await frames(page, 'toggle', '.gallerist-thumbs-region', 'height')
  expect(await zoom()).toBe(2)
})

test('`t` with focus on a thumbnail: focus goes to the viewer, not the page', async ({ page }) => {
  await open(page, REVIEWER)
  await page.locator('.gallerist-thumb-item[data-active]').focus()
  await page.keyboard.press('t')
  await expect(page.locator('.gallerist')).toBeFocused()
  await expect(page.locator('.gallerist-thumbs-region')).toBeHidden()
})

test('a side rail glides sideways', async ({ page }) => {
  await open(page, '/layout.html?rail=left&skin=console')
  const shut = await frames(page, 'toggle', '.gallerist-thumbs-region', 'width')
  glided(shut)
  await expect(page.locator('.gallerist-thumbs-region')).toBeHidden()
})

test("a stacked rail's item column glides shut and open beside the stage", async ({ page }) => {
  await open(page, '/layout.html?g=1')
  const column = page.locator('.gallerist-thumbs-aside .gallerist-thumb-items')
  await expect(column).toBeVisible()
  const shut = await frames(page, 'items', '.gallerist-thumbs-aside', 'width')
  glided(shut)
  await expect(column).toHaveCount(0)
  const back = await frames(page, 'items', '.gallerist-thumbs-aside', 'width')
  glided(back)
  await expect(column).toBeVisible()
  expect(Math.round(back[back.length - 1]?.stage ?? 0)).toBe(Math.round(shut[0]?.stage ?? 0))
})
