import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('open viewer has no axe violations', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.visora')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .include('.visora')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('dialog semantics and focus are correct on open', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  const root = page.locator('.visora')
  await expect(root).toHaveAttribute('role', 'dialog')
  await expect(root).toHaveAttribute('aria-modal', 'true')
  // focus moves into the dialog
  await expect(root).toBeFocused()
})
