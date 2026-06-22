import { type Page, expect, test } from '@playwright/test'

const scale = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { viewer: { getState(): { zoom: { scale: number } } } }
      ).viewer.getState().zoom.scale,
  )

// Discrete pointer moves (not {steps}) — Playwright's step-interpolation coalesces moves and
// can drop the pointerup; explicit moves dispatch reliable Pointer Events for the engine.
async function drag(page: Page, x0: number, y0: number, x1: number, y1: number, steps = 12) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)
  }
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.visora')).toBeVisible()
})

test('opens and shows the first image with a counter', async ({ page }) => {
  await expect(page.locator('.visora-counter')).toHaveText(/1 \/ 3/)
  await expect(page.locator('.visora-slide[data-visora-current] img')).toBeVisible()
})

test('keyboard ArrowRight navigates groups; Escape closes', async ({ page }) => {
  await page.locator('.visora').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.visora')).toHaveCount(0)
})

test('next/prev chrome buttons drive the group axis', async ({ page }) => {
  await page.click('.visora-next')
  await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3/)
  await page.click('.visora-prev')
  await expect(page.locator('.visora-counter')).toHaveText(/1 \/ 3/)
})

// Playwright/WebKit's synthetic mouse coalesces/drops pointermove+up during a capture-based drag
// (verified: 2 of 12 moves, 0 ups delivered), so these drag-driven gesture assertions can't run
// there. The gesture engine is browser-agnostic and is fully exercised on chromium; real Safari
// uses real pointer input, which capture handles normally.
test('horizontal swipe navigates to the next group (arbitration: navigate)', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'WebKit synthetic mouse drops drag pointer events',
  )
  const box = await page.locator('.visora-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  const cy = box.y + box.height / 2
  await drag(page, box.x + box.width * 0.75, cy, box.x + box.width * 0.2, cy)
  await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3/)
})

test('drag downward dismisses the viewer (arbitration: close)', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'WebKit synthetic mouse drops drag pointer events',
  )
  const box = await page.locator('.visora-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  const cx = box.x + box.width / 2
  await drag(page, cx, box.y + box.height * 0.3, cx, box.y + box.height * 0.3 + 240)
  await expect(page.locator('.visora')).toHaveCount(0)
})

test('wheel zooms in past fit (arbitration: zoom)', async ({ page }) => {
  const box = await page.locator('.visora-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => scale(page)).toBeGreaterThan(1)
})
