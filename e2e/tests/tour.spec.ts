import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The tour preset end to end: labelled arrows, ←/→ between sections beside a side rail, the section
// index, and the overview it can open on.

const cursor = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { viewer: { getState(): { cursor: { g: number; i: number } } } }
      ).viewer.getState().cursor,
  )

test('left/right moves between sections and up/down within one, beside the side rail', async ({
  page,
}) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=1')
  await expect(page.locator('.gallerist-thumb-row')).not.toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  expect(await cursor(page)).toEqual({ g: 1, i: 1 })
  await page.keyboard.press('ArrowRight')
  expect((await cursor(page)).g).toBe(2)
})

test('arrows name the sections they go to', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=1')
  await expect(page.locator('.gallerist-next .gallerist-arrow-label')).toHaveText('Group 3 title')
  await expect(page.locator('.gallerist-prev .gallerist-arrow-label')).toHaveText('Group 1 title')
  await page.locator('.gallerist-next').click()
  await expect(page.locator('.gallerist-next .gallerist-arrow-label')).toHaveText('Group 4 title')
})

test('the index expands the active section, and a row and an item navigate', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0')
  await page.locator('.gallerist-thumb-row').nth(2).click()
  const panel = page.locator('.gallerist-thumb-section[data-group="g2"] .gallerist-thumb-item')
  await expect(panel).toHaveCount(2)
  await panel.nth(1).click()
  expect(await cursor(page)).toEqual({ g: 2, i: 1 })
})

test('the overview opens first, hides the stage controls, and Start enters the tour', async ({
  page,
}) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0&overview=1')
  const start = page.locator('.gallerist-grid-start')
  await expect(start).toHaveText('Start tour')
  await expect(page.locator('.gallerist-controls')).toBeHidden()
  await start.click()
  await expect(start).toBeHidden()
  await expect(page.locator('.gallerist-controls')).toBeVisible()
  await page.keyboard.press('ArrowRight') // focus stayed in the viewer
  expect((await cursor(page)).g).toBe(1)
})

test('an overview cell opens that item', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0&overview=1')
  await page.locator('.gallerist-grid-cell[data-item="g1i2"]').click()
  expect(await cursor(page)).toEqual({ g: 1, i: 2 })
  await expect(page.locator('.gallerist-grid')).toBeHidden()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the index is a strip of chips along the bottom', async ({ page }) => {
    await page.goto('/layout.html?preset=tour&captions=1&g=1')
    const chip = page.locator('.gallerist-thumb-row').first()
    const stage = await page.locator('.gallerist-stage').boundingBox()
    const box = await chip.boundingBox()
    expect(box && stage && box.y >= stage.y + stage.height).toBe(true)
    await expect(page.locator('.gallerist-thumb-row .gallerist-thumb-img').first()).toBeHidden()
  })
})

for (const [name, query] of [
  ['tour', 'preset=tour&captions=1&g=1'],
  ['overview', 'preset=tour&captions=1&g=0&overview=1'],
]) {
  test(`no axe violations: ${name}`, async ({ page }) => {
    await page.goto(`/layout.html?${query}`)
    await expect(page.locator('.gallerist')).toBeVisible()
    const { violations } = await new AxeBuilder({ page })
      .include('.gallerist')
      .disableRules(['color-contrast'])
      .analyze()
    expect(violations.map((v) => v.id)).toEqual([])
  })
}
