import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

// The shortcut list (plugin-shortcuts): ? opens a modal dialog of the keys that work in the viewer as
// it is laid out, the View menu's last row opens it too, and a touch screen gets the gestures. The
// fixture opens at group 2 (3 items) of 12; the reviewer preset stacks the rail. One host entry: N.
const REVIEWER = '/layout.html?preset=reviewer&skin=console&captions=1&view=1&shortcuts=1'

const open = async (page: Page, query = REVIEWER) => {
  await page.goto(query)
  await viewerSettled(page)
}
const root = (page: Page) => page.locator('.gallerist')
const list = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })
const counter = (page: Page) => page.locator('.gallerist-counter')
const viewTool = (page: Page) => page.locator('.gallerist-view-btn')
// the rows of a section, as "label: keys"
const rows = (page: Page, section: string) =>
  page
    .locator('.gallerist-shortcuts section', {
      has: page.getByRole('heading', { name: section, exact: true }),
    })
    .locator('.gallerist-shortcuts-row')
    .evaluateAll((els) =>
      els.map(
        (r) =>
          `${r.querySelector('dt')?.textContent}: ${[...r.querySelectorAll('kbd')]
            .map((k) => k.textContent)
            .join(' ')}`,
      ),
    )
const help = async (page: Page) => {
  await root(page).focus()
  await page.keyboard.press('Shift+Slash') // ?
  await expect(list(page)).toBeVisible()
}

test('? opens the list for this layout; Escape closes it, and only it', async ({ page }) => {
  await open(page)
  await help(page)
  await expect(list(page)).toBeFocused()
  await expect(list(page)).toHaveAttribute('aria-modal', 'true')
  expect(await rows(page, 'Move')).toEqual([
    'Previous / next group: ← →',
    'Previous / next in the group: ↑ ↓',
    'First / last group: Home End',
    'Item in the group: 1–9',
  ])
  expect(await rows(page, 'Zoom')).toEqual(['Zoom in: +', 'Zoom out: −', 'Fit to screen: 0'])
  const viewer = await rows(page, 'Viewer')
  expect(viewer).toContain('This list: ?')
  expect(viewer).toContain('Close: Esc')
  expect(viewer).toContain('Thumbnails: T')
  expect(viewer).toContain('Add a note: N') // the host's
  // the rest of the viewer is inert under it
  await expect(page.locator('.gallerist-bar')).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(list(page)).toBeHidden()
  await expect(root(page)).toHaveAttribute('data-gallerist-phase', 'open')
  await expect(root(page)).toBeFocused()
  await expect(page.locator('.gallerist-bar')).not.toHaveAttribute('inert', /.*/)
  // ? toggles
  await help(page)
  await page.keyboard.press('Shift+Slash')
  await expect(list(page)).toBeHidden()
})

test('keys pressed in it never reach the viewer', async ({ page }) => {
  await open(page, `${REVIEWER}&zoom-tool=1`)
  await help(page)
  for (const key of ['ArrowRight', 'ArrowDown', 'End', '+', 't', '3'])
    await page.keyboard.press(key)
  await expect(counter(page)).toHaveText('2 / 12')
  await expect(page.locator('.gallerist-zoom-level')).toHaveText('100%')
  await expect(root(page)).toHaveAttribute('data-gallerist-rail', 'expanded')
  await expect(list(page)).toBeVisible()
})

test('not while typing in a field in the viewer', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'field'
    input.setAttribute('aria-label', 'Note')
    document.querySelector('.gallerist-stage')?.appendChild(input)
  })
  await page.locator('#field').focus()
  await page.keyboard.type('?')
  await expect(page.locator('#field')).toHaveValue('?')
  await expect(list(page)).toBeHidden()
})

test('Tab stays in the dialog', async ({ page }) => {
  test.skip(
    test.info().project.name === 'webkit',
    'headless WebKit does not deliver Tab focus traversal',
  )
  await open(page)
  await help(page)
  const close = page.getByRole('button', { name: 'Esc to close' })
  const body = page.getByRole('region', { name: 'Keyboard shortcuts' })
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(body).toBeFocused() // the list, so the keys can scroll it
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(body).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(list(page)).toBeHidden()
  await expect(root(page)).toBeFocused()
})

test('a row rail walks every item: the list has no ↑/↓ and no group keys', async ({ page }) => {
  await open(page)
  await viewTool(page).click()
  await page.getByRole('radio', { name: 'Row', exact: true }).click()
  await page.keyboard.press('Escape')
  await help(page)
  expect(await rows(page, 'Move')).toEqual(['Previous / next: ← →', 'First / last: Home End'])
})

test('the View menu’s last row opens it; closing brings focus back to View', async ({ page }) => {
  await open(page)
  await viewTool(page).click()
  const row = page.getByRole('button', { name: 'Keyboard shortcuts', exact: true })
  await expect(row).toBeVisible()
  await expect(row.locator('kbd')).toHaveText('?')
  await row.click()
  await expect(page.getByRole('dialog', { name: 'View', exact: true })).toBeHidden()
  await expect(list(page)).toBeVisible()
  await page.getByRole('button', { name: 'Esc to close' }).click()
  await expect(list(page)).toBeHidden()
  await expect(viewTool(page)).toBeFocused()
  // ? from inside the popover, and a press on the scrim closes it
  await viewTool(page).click()
  await page.keyboard.press('Shift+Slash')
  await expect(list(page)).toBeVisible()
  await page.locator('.gallerist-shortcuts-scrim').click({ position: { x: 5, y: 5 } })
  await expect(list(page)).toBeHidden()
  await expect(viewTool(page)).toBeFocused()
})

test('right to left: ←/→ swap places for previous / next, and the dialog runs right to left', async ({
  page,
}) => {
  await open(page, `${REVIEWER}&dir=rtl`)
  await help(page)
  expect((await rows(page, 'Move'))[0]).toBe('Previous / next group: → ←')
  const title = await page.locator('.gallerist-shortcuts-head h2').boundingBox()
  const close = await page.locator('.gallerist-shortcuts-close').boundingBox()
  expect((close?.x ?? 0) < (title?.x ?? 0)).toBe(true)
})

for (const scheme of ['dark', 'light'] as const) {
  test(`no axe violations with the list open (${scheme})`, async ({ page }) => {
    await open(page, `${REVIEWER}&scheme=${scheme}`)
    await help(page)
    const axe = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze()
    expect(axe.violations).toEqual([])
  })
}

test('a desktop list: centred, three columns, inside the viewer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  await help(page)
  const box = await list(page).boundingBox()
  if (!box) throw new Error('no layout')
  expect(box.width).toBeLessThanOrEqual(720)
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2)
  expect(box.y).toBeGreaterThan(0)
  expect(box.y + box.height).toBeLessThan(800)
  const tops = await page
    .locator('.gallerist-shortcuts section')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops.slice(0, 3)).size).toBe(1) // Move, Zoom, Viewer side by side
})

test('under reduced motion it appears without animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await help(page)
  const anim = await page
    .locator('.gallerist-shortcuts-scrim')
    .evaluate((el) => getComputedStyle(el).animationName)
  expect(anim).toBe('none')
})

test.describe('on a 390px phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test.skip(({ browserName }) => browserName === 'webkit', 'isMobile is Chromium-only')

  test('the View menu’s row reads Gestures and opens them in a sheet', async ({ page }) => {
    await open(page)
    await viewTool(page).tap()
    const row = page.getByRole('button', { name: 'Gestures', exact: true })
    await expect(row.locator('kbd')).toBeHidden() // no key to press
    await row.tap()
    const sheet = page.getByRole('dialog', { name: 'Gestures', exact: true })
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    if (!box) throw new Error('no layout')
    expect(box.x).toBeGreaterThanOrEqual(-0.5)
    expect(box.x + box.width).toBeLessThanOrEqual(390.5)
    expect(Math.abs(box.y + box.height - 844)).toBeLessThan(2) // from the bottom edge
    const gestures = await page
      .locator('.gallerist-shortcuts-row')
      .evaluateAll((els) => els.map((r) => r.querySelector('dt')?.textContent))
    expect(gestures).toEqual([
      'Previous / next group',
      'Next in the group',
      'Zoom',
      'Move while zoomed',
      'Close',
      'Add a note',
    ])
    const axe = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze()
    expect(axe.violations).toEqual([])
    await page.locator('.gallerist-shortcuts-close').tap()
    await expect(sheet).toBeHidden()
    await expect(root(page)).toHaveAttribute('data-gallerist-phase', 'open')
  })
})

// A viewer too short for the list: the dialog keeps inside it and its list scrolls (by the wheel,
// and by the keys once Tab has focused it), the last row reachable.
const scrollsToTheEnd = async (page: Page, overflows = true) => {
  const dialog = page.locator('.gallerist-shortcuts')
  const viewer = await root(page).boundingBox()
  const box = await dialog.boundingBox()
  if (!viewer || !box) throw new Error('no box')
  expect(box.y).toBeGreaterThanOrEqual(viewer.y - 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewer.y + viewer.height + 1)
  const body = page.locator('.gallerist-shortcuts-body')
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight + 10)).toBe(overflows)
  await body.focus()
  await page.keyboard.press('End')
  await expect
    .poll(() => body.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight))
    .toBe(true)
  await expect(page.locator('.gallerist-shortcuts-row').last()).toBeInViewport()
}

test('a 360px inline viewer: the list stays inside it and scrolls to its end', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, `${REVIEWER}&inline=360`)
  await expect(root(page)).toHaveAttribute('data-gallerist-mode', 'inline')
  await help(page)
  await scrollsToTheEnd(page)
})

test('a 390×667 phone opened from the host: the sheet fits inside the viewer, its end in view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await open(page)
  const opened = await page.evaluate(() =>
    (
      window as unknown as { shortcutsPlugin: { open(keys?: boolean): boolean } }
    ).shortcutsPlugin.open(true),
  )
  expect(opened).toBe(true)
  await scrollsToTheEnd(page, false)
})
