import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

test('open viewer has no axe violations', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  await expect(page.locator('.gallerist')).toBeVisible()

  await viewerSettled(page)

  const results = await new AxeBuilder({ page })
    .include('.gallerist')
    // include best-practice so the dialog-name rule is enforced (I-UX1)
    .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
    .analyze()

  expect(results.violations).toEqual([])
})

test('dialog semantics and focus are correct on open', async ({ page }) => {
  await page.goto('/')
  await page.click('#open')
  const root = page.locator('.gallerist')
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
  await expect(page.locator('.gallerist')).toHaveAttribute('aria-label', /\S/)
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
  await expect(page.locator('.gallerist')).toBeVisible()
  // the trigger (and the rest of the page) is inert while the dialog is open
  await expect(page.locator('#open')).toHaveAttribute('inert', '')
  // tabbing many times never escapes the dialog
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab')
  const stillInside = await page.evaluate(
    () => document.querySelector('.gallerist')?.contains(document.activeElement) ?? false,
  )
  expect(stillInside).toBe(true)
})

test('restores focus to the trigger on close (S-UX4)', async ({ page }) => {
  test.skip(test.info().project.name === 'webkit', 'headless WebKit focus restore is unreliable')
  await page.goto('/')
  await page.locator('#open').focus()
  await page.click('#open')
  await expect(page.locator('.gallerist')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.gallerist')).toHaveCount(0)
  await expect(page.locator('#open')).toBeFocused()
})

// every skin × scheme (and a non-default accent each): contrast and semantics hold in all of them
const LOOKS = [
  'skin=gallery',
  'skin=gallery&scheme=light',
  'skin=gallery&accent=amber',
  'skin=console',
  'skin=console&scheme=light',
  'skin=console&accent=vermilion',
  'skin=editorial&preset=editorial',
  'skin=editorial&preset=editorial&scheme=dark',
  'skin=editorial&accent=cobalt',
]
for (const look of LOOKS) {
  test(`no axe violations in ${look}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'axe runs once (chromium)')
    await page.goto(`/layout.html?${look}&captions=1&indicator=pills`)
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await viewerSettled(page)
    const results = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
}

// A caption renderer's band taller than its room scrolls: it then takes focus and a name, so a
// keyboard can scroll it (axe scrollable-region-focusable), and ↑/↓/End scroll it rather than move
// the viewer. A band that fits stays out of the tab order. Default band, and the editorial placard
// (where the region in the placard's slot is what scrolls).
for (const [look, scroller] of [
  ['skin=gallery', '.gallerist-caption'],
  ['skin=editorial&preset=editorial', '.gallerist-region-caption'],
] as const) {
  test(`a tall custom caption band is keyboard-scrollable (${look})`, async ({ page }) => {
    await page.goto(`/layout.html?${look}&custom=tall&g=1`)
    await viewerSettled(page)
    const band = page.locator(scroller)
    await expect(band).toHaveAttribute('tabindex', '0')
    await expect(band).toHaveAttribute('role', 'region')
    await expect(band).toHaveAccessibleName('Caption')
    const results = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    // the viewer is still described by the caption's text, not by the band's name
    const described = await page.evaluate(() =>
      (document.querySelector('.gallerist')?.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(''),
    )
    expect(described).toContain('Activity line 60')
    // the caption's first line names the item: it stays put while the band scrolls
    const head = page.locator('.fixture-caption strong')
    const item = await head.textContent()
    await band.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await expect.poll(() => band.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await expect(head).toHaveText(item ?? '')
  })

  test(`a custom caption band that fits stays out of the tab order (${look})`, async ({ page }) => {
    await page.goto(`/layout.html?${look}&custom=short&g=1`)
    await viewerSettled(page)
    await expect(page.locator('.gallerist-caption .fixture-caption')).toBeVisible()
    const band = page.locator(scroller)
    // the band's ResizeObserver has run (it runs within the frame after layout), and the band fits:
    // otherwise the checks below would pass before the band was ever judged
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    )
    expect(await band.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await expect(band).not.toHaveAttribute('tabindex', /.*/)
    await expect(band).not.toHaveAttribute('role', /.*/)
  })
}
