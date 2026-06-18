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
  // counter is group-only now; the within-group position lives in the segmented pills (UX-H)
  await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3/)
  await expect(page.locator('.visora-position .visora-pill[data-active]')).toHaveText('3')
})

test("'t' collapses and expands the thumbnail rail", async ({ page }) => {
  const root = page.locator('.visora')
  await expect(root).toHaveAttribute('data-visora-rail', 'expanded')
  await root.focus()
  await page.keyboard.press('t')
  await expect(root).toHaveAttribute('data-visora-rail', 'collapsed')
  await expect(page.locator('.visora-region-thumbnails')).toBeHidden()
  await page.keyboard.press('t')
  await expect(root).toHaveAttribute('data-visora-rail', 'expanded')
})

test('within-group ↑/↓ keeps the highlight in the vertical column (no horizontal drift)', async ({
  page,
}) => {
  const root = page.locator('.visora')
  await root.focus()
  await page.keyboard.press('ArrowRight') // g1 (3 items) active
  const col = page.locator('.visora-thumb-items')
  await expect(col).toHaveAttribute('data-axis', 'vertical')
  await page.keyboard.press('ArrowDown') // i → 1
  await expect(col.locator('.visora-thumb-item[data-active]')).toHaveAttribute('data-item', 'b1')
  await expect(page.locator('.visora-thumb[data-active]')).toHaveAttribute('data-group', 'g1')
})

test('segmented position pills reflect the current screen', async ({ page }) => {
  const root = page.locator('.visora')
  await root.focus()
  await page.keyboard.press('ArrowRight') // g1, 3 items
  const pos = page.locator('.visora-position')
  await expect(pos).toHaveAttribute('data-mode', 'pills')
  await expect(pos.locator('.visora-pill[data-active]')).toHaveText('1')
  await page.keyboard.press('ArrowDown')
  await expect(pos.locator('.visora-pill[data-active]')).toHaveText('2')
})

test('default arrow layout is the right-center pill', async ({ page }) => {
  await expect(page.locator('.visora')).toHaveAttribute('data-visora-arrows', 'pill-right')
})

test('no axe violations with the full plugin set', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include('.visora')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
