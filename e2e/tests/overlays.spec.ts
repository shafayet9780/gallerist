import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.gallerist')).toBeVisible()
})

test('renders a viewport overlay in the viewport layer', async ({ page }) => {
  await expect(page.locator('.gallerist-viewport-layer [data-overlay="badge"]')).toHaveText('95%')
})

test('renders a content point overlay that counter-scales as zoom changes', async ({ page }) => {
  const pin = page.locator('.gallerist-overlays-content [data-overlay="pin"]')
  await expect(pin).toBeVisible()
  const before = await pin.evaluate((el) => getComputedStyle(el).transform)

  const box = await page.locator('.gallerist-stage').boundingBox()
  if (!box) throw new Error('no stage box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400) // zoom in → counter-scale must change

  await expect.poll(() => pin.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before)
})
