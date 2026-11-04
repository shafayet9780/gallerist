import { expect, test } from '@playwright/test'

test('group nav and item nav use visibly distinct motion axes (spec §27.5)', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await page.locator('.gallerist').focus()

  await page.keyboard.press('ArrowRight') // g0 → g1 = time axis
  await expect(page.locator('.gallerist-slide[data-gallerist-current]')).toHaveAttribute(
    'data-gallerist-enter',
    'group',
  )

  await page.keyboard.press('ArrowDown') // within g1 (3 items) = screen axis
  await expect(page.locator('.gallerist-slide[data-gallerist-current]')).toHaveAttribute(
    'data-gallerist-enter',
    'item',
  )
})
