import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('open viewer has no axe violations', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.visora')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .include('.visora')
    // include best-practice so the dialog-name rule is enforced (I-UX1)
    .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
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
  // background is inert (modal enforcement, C5) — verified on every engine
  await expect(page.locator('#open')).toHaveAttribute('inert', '')
})

test('dialog has an accessible name (I-UX1)', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.visora')).toHaveAttribute('aria-label', /\S/)
})

// Tab traversal and programmatic focus-restore aren't delivered reliably by headless WebKit;
// inert + initial focus (the modal enforcement) are checked above on all engines, and the Tab-cycle
// / restore logic is browser-agnostic JS exercised here on chromium.
test('traps Tab focus inside the dialog and inerts the page behind it (C5)', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'headless WebKit does not deliver Tab focus traversal',
  )
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.visora')).toBeVisible()
  // the trigger (and the rest of the page) is inert while the dialog is open
  await expect(page.locator('#open')).toHaveAttribute('inert', '')
  // tabbing many times never escapes the dialog
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab')
  const stillInside = await page.evaluate(
    () => document.querySelector('.visora')?.contains(document.activeElement) ?? false,
  )
  expect(stillInside).toBe(true)
})

test('restores focus to the trigger on close (S-UX4)', async ({ page }) => {
  test.skip(test.info().project.name === 'webkit', 'headless WebKit focus restore is unreliable')
  await page.goto('/')
  await page.locator('#open').focus()
  await page.click('#open')
  await expect(page.locator('.visora')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.visora')).toHaveCount(0)
  await expect(page.locator('#open')).toBeFocused()
})
