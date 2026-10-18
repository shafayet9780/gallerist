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
  await expect(page.locator('.gallerist')).toBeVisible()
})

test('opens and shows the first image with a counter', async ({ page }) => {
  await expect(page.locator('.gallerist-counter')).toHaveText(/1 \/ 3/)
  await expect(page.locator('.gallerist-slide[data-gallerist-current] img')).toBeVisible()
})

test('a failed image shows a centered error card with its alt (I-UX3)', async ({ page }) => {
  await page.evaluate(() =>
    (window as unknown as { viewer: { setCollection(c: unknown): void } }).viewer.setCollection({
      groups: [
        {
          id: 'g',
          items: [
            { id: 'x', type: 'image', source: '/does-not-exist-404.jpg', alt: 'Burndown chart' },
          ],
        },
      ],
    }),
  )
  const card = page.locator('.gallerist-media-error')
  await expect(card).toBeVisible()
  await expect(card.locator('.gallerist-media-error-label')).toHaveText('Burndown chart')
})

test('keyboard ArrowRight navigates groups; Escape closes', async ({ page }) => {
  await page.locator('.gallerist').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.gallerist')).toHaveCount(0)
})

test('next/prev chrome buttons drive the group axis', async ({ page }) => {
  await page.click('.gallerist-next')
  await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/)
  await page.click('.gallerist-prev')
  await expect(page.locator('.gallerist-counter')).toHaveText(/1 \/ 3/)
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
  const box = await page.locator('.gallerist-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  const cy = box.y + box.height / 2
  await drag(page, box.x + box.width * 0.75, cy, box.x + box.width * 0.2, cy)
  await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/)
})

test('drag downward dismisses the viewer (arbitration: close)', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'WebKit synthetic mouse drops drag pointer events',
  )
  const box = await page.locator('.gallerist-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  const cx = box.x + box.width / 2
  await drag(page, cx, box.y + box.height * 0.3, cx, box.y + box.height * 0.3 + 240)
  await expect(page.locator('.gallerist')).toHaveCount(0)
})

test('zooming back out after a pan returns to a centred fit (zoom bounds)', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'WebKit synthetic mouse drops drag pointer events',
  )
  const zoom = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            viewer: { getState(): { zoom: { scale: number; x: number; y: number } } }
          }
        ).viewer.getState().zoom,
    )
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect.poll(async () => (await zoom()).scale).toBeGreaterThan(1)
  const centred = (await zoom()).x
  const box = await page.locator('.gallerist-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  const cy = box.y + box.height / 2
  await drag(page, box.x + box.width * 0.6, cy, box.x + box.width * 0.4, cy) // pan off-centre
  await expect.poll(async () => (await zoom()).x).toBeLessThan(centred)
  for (let k = 0; k < 6; k++) await page.keyboard.press('-')
  await expect.poll(zoom).toEqual({ scale: 1, x: 0, y: 0 })
})

test('close fades out before unmounting; phases settle on the real animation', async ({ page }) => {
  const phase = () =>
    page.evaluate(
      () =>
        (window as unknown as { viewer: { getState(): { phase: string } } }).viewer.getState()
          .phase,
    )
  await expect.poll(phase).toBe('open') // the opening fade has settled
  await page.evaluate(() => {
    const w = window as unknown as {
      viewer: { subscribe(fn: (s: { phase: string }) => void): void; close(): void }
      __phases: string[]
    }
    w.__phases = []
    w.viewer.subscribe((s) => {
      if (w.__phases.at(-1) !== s.phase) w.__phases.push(s.phase)
    })
    w.viewer.close()
  })
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'closing')
  await expect(page.locator('.gallerist')).toHaveCount(0)
  const phases = await page.evaluate(() => (window as unknown as { __phases: string[] }).__phases)
  expect(phases).toEqual(['closing', 'closed'])
})

test('with reduced motion, open and close do not animate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const root = page.locator('.gallerist')
  await expect(root).toHaveAttribute('data-gallerist-phase', 'open')
  await page.evaluate(() => (window as unknown as { viewer: { close(): void } }).viewer.close())
  await expect(root).toHaveCount(0)
  await page.click('#open')
  const name = await root.evaluate((el) => {
    el.setAttribute('data-gallerist-phase', 'closing') // force the exit rule to apply
    return getComputedStyle(el).animationName
  })
  expect(name).toBe('none')
})

test('wheel zooms in past fit (arbitration: zoom)', async ({ page }) => {
  const box = await page.locator('.gallerist-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => scale(page)).toBeGreaterThan(1)
})
