import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/plugins.html')
  await page.click('#open')
  await expect(page.locator('.visora')).toBeVisible()
})

test('thumbnail rail renders and a thumb navigates', async ({ page }) => {
  const rail = page.locator('.visora-region-thumbnails .visora-thumbs')
  await expect(rail).toBeVisible()
  await rail.locator('.visora-thumb[data-group="g2"]').click()
  await expect(page.locator('.visora-counter')).toHaveText(/3 \/ 3/)
})

test('grid toggles and a cell navigates back to the stage', async ({ page }) => {
  await page.locator('.visora').focus()
  await page.keyboard.press('g')
  const gridEl = page.locator('.visora-region-stage .visora-grid')
  await expect(gridEl).toBeVisible()
  await gridEl.locator('.visora-grid-cell[data-group="g1"][data-item="b2"]').click()
  await expect(gridEl).toBeHidden()
  await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3 · 3\/3/)
})

test('no axe violations with the full plugin set', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include('.visora')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
