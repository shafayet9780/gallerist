import { expect, test } from '@playwright/test'

// C2: a single debounced ResizeObserver re-measures the stage on resize, repainting image-space
// overlays and re-clamping zoom. The pin overlay is anchored to the image centre (point 0.5,0.5),
// so it must follow the resized stage rather than stay frozen at its old pixel position.
test('re-anchors image-space overlays after a viewport resize (C2)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.click('#open')

  // stable selector (emoji text matching is unreliable on WebKit); the pin is anchored at the
  // image centre (point 0.5,0.5). Measure via in-page getBoundingClientRect — Playwright's
  // boundingBox() returns null for the transformed content-overlay host on WebKit.
  const pin = page.locator('.gallerist-overlays-content [data-overlay="pin"]')
  await expect(pin).toBeVisible()
  const left = () => pin.evaluate((el) => Math.round(el.getBoundingClientRect().left))
  const before = await left()

  await page.setViewportSize({ width: 700, height: 1000 })

  // the anchored overlay must follow the resized stage centre (would be frozen without the
  // ResizeObserver re-measure); poll to absorb the debounced RAF re-anchor.
  await expect.poll(left).not.toBe(before)
})

// C3: a drag that ends outside the stage must still settle (pointer capture). After a swipe whose
// release lands off-stage, the next swipe must behave as a normal single-finger swipe.
test('a swipe released off-stage does not strand the next gesture (C3)', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'WebKit synthetic mouse drops drag pointer events',
  )
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto('/')
  await page.click('#open')
  const stage = page.locator('.gallerist-stage')
  const box = await stage.boundingBox()
  if (!box) throw new Error('no stage')

  const cy = box.y + box.height / 2
  // swipe left, releasing beyond the left edge of the stage
  await page.mouse.move(box.x + box.width * 0.7, cy)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, cy, { steps: 8 })
  await page.mouse.move(box.x - 80, cy, { steps: 4 }) // off-stage release point
  await page.mouse.up()

  // the next swipe should navigate normally (proving the prior gesture didn't strand state)
  const g1 = await page.evaluate(
    () =>
      (window as unknown as { viewer: { getState(): { cursor: { g: number } } } }).viewer.getState()
        .cursor.g,
  )
  await page.mouse.move(box.x + box.width * 0.7, cy)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, cy, { steps: 8 })
  await page.mouse.up()
  const g2 = await page.evaluate(
    () =>
      (window as unknown as { viewer: { getState(): { cursor: { g: number } } } }).viewer.getState()
        .cursor.g,
  )
  expect(g2).not.toBe(g1) // a clean second swipe advanced the group axis
})
