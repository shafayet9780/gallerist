import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

// The View menu (plugin-view): switch the thumbnails rail (stacked ↔ row) and the scheme (dark ↔
// light) in the open viewer, by keyboard, pointer and touch. The fixture opens at group 2 (3 items) of
// 12 groups, 37 items in all; the reviewer preset gives the rail its timeline and numbered items.
const REVIEWER = '/layout.html?preset=reviewer&skin=console&captions=1&view=1'

const open = async (page: Page, query = REVIEWER) => {
  await page.goto(query)
  await viewerSettled(page)
}
const root = (page: Page) => page.locator('.gallerist')
const tool = (page: Page) => page.locator('.gallerist-view-btn')
const menu = (page: Page) => page.getByRole('dialog', { name: 'View', exact: true })
const choice = (page: Page, name: string) => page.getByRole('radio', { name, exact: true })
const counter = (page: Page) => page.locator('.gallerist-counter')
const rail = (page: Page) => page.locator('.gallerist-thumbs')
// keys for the viewer itself (focus on its root, as after opening)
const viewerKey = async (page: Page, key: string) => {
  await root(page).focus()
  await page.keyboard.press(key)
}

test('the keyboard switches Stacked → Row → Stacked; the item stays and the keys follow', async ({
  page,
}) => {
  await open(page)
  await viewerKey(page, 'ArrowDown') // group 2, item 2
  await expect(counter(page)).toHaveText('2 / 12')

  await tool(page).focus()
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeVisible()
  await expect(tool(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('radiogroup', { name: 'Layout' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
  await expect(choice(page, 'Stacked')).toBeFocused()
  await expect(choice(page, 'Stacked')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowRight') // moves and chooses, as radio buttons do
  await expect(choice(page, 'Row')).toBeFocused()
  await expect(choice(page, 'Row')).toHaveAttribute('aria-checked', 'true')
  await expect(rail(page)).toHaveAttribute('data-display', 'flat')
  await expect(menu(page)).toBeVisible() // still open
  await page.keyboard.press('Enter') // done: closes

  await expect(menu(page)).toBeHidden()
  await expect(tool(page)).toBeFocused()
  await expect(tool(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(root(page)).toHaveAttribute('data-gallerist-linear', 'true')
  await expect(counter(page)).toHaveText('3 / 37') // the same item, counted among all
  await expect(page.locator('.gallerist-thumb-item[data-active]')).toHaveAttribute(
    'data-item',
    'g1i1',
  )
  await expect(page.locator('.gallerist-thumb-item[data-active]')).toBeInViewport()
  // a row walks every item in order, across the group boundary
  await viewerKey(page, 'ArrowRight')
  await viewerKey(page, 'ArrowRight')
  await expect(counter(page)).toHaveText('5 / 37')
  await expect(page.locator('.gallerist-thumb-item[data-active]')).toHaveAttribute(
    'data-item',
    'g2i0',
  )

  await tool(page).focus()
  await page.keyboard.press('ArrowDown') // opens on the checked segment
  await expect(choice(page, 'Row')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(choice(page, 'Stacked')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await expect(tool(page)).toBeFocused()
  await expect(rail(page)).not.toHaveAttribute('data-display', /./)
  await expect(root(page)).not.toHaveAttribute('data-gallerist-linear', /./)
  await expect(counter(page)).toHaveText('3 / 12')
  await expect(page.locator('.gallerist-thumb[data-active]')).toHaveAttribute('data-group', 'g2')
  // the item axis is back, with the reviewer's numbered stack beside the stage
  await viewerKey(page, 'ArrowDown')
  await expect(
    page.locator('.gallerist-region-aside .gallerist-thumb-item[data-active]'),
  ).toHaveAttribute('data-item', 'g2i1')
  await expect(page.locator('.gallerist-region-aside .gallerist-thumb-num')).toHaveCount(2)
})

test('clicks switch Stacked → Row → Stacked, and the cards navigate in each', async ({ page }) => {
  await open(page)
  await tool(page).click()
  await choice(page, 'Row').click()
  await expect(menu(page)).toBeVisible() // a segmented control: it stays open, showing the choice
  await expect(choice(page, 'Row')).toHaveAttribute('aria-checked', 'true')
  await expect(rail(page)).toHaveAttribute('data-display', 'flat')
  await expect(counter(page)).toHaveText('2 / 37') // group 2, item 1
  // a press on a card closes the popover and the click goes on to the card
  await page.locator('.gallerist-thumb-item[data-item="g4i3"]').click()
  await expect(menu(page)).toBeHidden()
  await expect(counter(page)).toHaveText('11 / 37')
  await tool(page).click()
  await choice(page, 'Stacked').click()
  await expect(rail(page)).not.toHaveAttribute('data-display', /./)
  await expect(page.locator('.gallerist-thumb[data-active]')).toHaveAttribute('data-group', 'g4')
  await expect(
    page.locator('.gallerist-region-aside .gallerist-thumb-item[data-active]'),
  ).toHaveAttribute('data-item', 'g4i3')
  await page.locator('.gallerist-thumb[data-group="g7"]').click()
  await expect(counter(page)).toHaveText('8 / 12')
  const changes = await page.evaluate(
    () => (window as unknown as { viewChanges: unknown[] }).viewChanges,
  )
  expect(changes).toEqual([{ rail: 'flat' }, { rail: 'stacked' }]) // the rail only: no scheme picked
})

test('Dark ↔ Light switches the scheme of the open viewer', async ({ page }) => {
  await open(page)
  const scheme = () => root(page).evaluate((el) => getComputedStyle(el).colorScheme)
  const bar = () =>
    page.locator('.gallerist-bar').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await scheme()).toBe('dark')
  const darkBar = await bar()
  await tool(page).click()
  await expect(choice(page, 'Dark')).toHaveAttribute('aria-checked', 'true')
  await choice(page, 'Light').click()
  await expect(root(page)).toHaveAttribute('data-gallerist-scheme', 'light')
  expect(await scheme()).toBe('light')
  expect(await bar()).not.toBe(darkBar)
  await expect(choice(page, 'Light')).toHaveAttribute('aria-checked', 'true')
  await choice(page, 'Dark').click()
  await expect(root(page)).toHaveAttribute('data-gallerist-scheme', 'dark')
  expect(await bar()).toBe(darkBar)
})

test.describe('on a viewer following a dark system (auto)', () => {
  test.use({ colorScheme: 'dark' })

  test('a rail choice reports the rail only; Dark picked stores dark', async ({ page }) => {
    await open(page, `${REVIEWER}&scheme=auto`)
    const changes = () =>
      page.evaluate(() => (window as unknown as { viewChanges: unknown[] }).viewChanges)
    await tool(page).click()
    await expect(choice(page, 'Dark')).toHaveAttribute('aria-checked', 'true') // the one in effect
    await choice(page, 'Row').click()
    await expect(rail(page)).toHaveAttribute('data-display', 'flat')
    await expect(root(page)).toHaveAttribute('data-gallerist-scheme', 'auto') // still the system's
    expect(await changes()).toEqual([{ rail: 'flat' }])
    await choice(page, 'Dark').click()
    await expect(root(page)).toHaveAttribute('data-gallerist-scheme', 'dark')
    expect(await changes()).toEqual([{ rail: 'flat' }, { scheme: 'dark' }])
  })
})

test('focus, hover and the checked segment each look different; focus is not the accent', async ({
  page,
}) => {
  await open(page)
  await tool(page).focus()
  await page.keyboard.press('Enter') // opens on Stacked, focused from the keyboard
  await expect(choice(page, 'Stacked')).toBeFocused()
  await page.keyboard.press('Tab') // to the Theme group: Dark, checked
  await expect(choice(page, 'Dark')).toBeFocused()
  await choice(page, 'Light').hover()
  const look = (name: string) =>
    choice(page, name).evaluate((el) => {
      const s = getComputedStyle(el)
      const glyph = el.querySelector('svg') as SVGElement
      return {
        bg: s.backgroundColor,
        ring: s.outlineStyle,
        ringColor: s.outlineColor,
        glyph: getComputedStyle(glyph).color,
      }
    })
  const focused = await look('Dark') // focused and checked
  const checked = await look('Stacked') // checked, not focused
  const hovered = await look('Light')
  expect(focused.ring).toBe('solid')
  expect(checked.ring).toBe('none')
  expect(hovered.ring).toBe('none')
  expect(checked.bg).not.toBe(hovered.bg) // the checked segment is raised
  // the ring is the neutral focus colour, never the accent the checked glyph takes
  expect(focused.ringColor).not.toBe(checked.glyph)
  expect(checked.glyph).not.toBe(hovered.glyph)
})

test('Escape and a press outside close the popover, not the viewer', async ({ page }) => {
  await open(page)
  await tool(page).click()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await expect(tool(page)).toBeFocused()
  await expect(root(page)).toHaveAttribute('data-gallerist-phase', 'open')
  await tool(page).click()
  await page.locator('.gallerist-stage').click({ position: { x: 200, y: 300 } })
  await expect(menu(page)).toBeHidden()
  await expect(root(page)).toHaveAttribute('data-gallerist-phase', 'open')
  // the viewer's keys don't act under an open popover
  await tool(page).click()
  for (const key of ['End', 'Home', 't', '3', 'f']) await page.keyboard.press(key)
  await expect(counter(page)).toHaveText('2 / 12')
  await expect(root(page)).toHaveAttribute('data-gallerist-rail', 'expanded')
  await expect(choice(page, 'Stacked')).toBeFocused()
  await expect(menu(page)).toBeVisible()
})

test('Enter closes and its release doesn’t open it again; Space chooses and stays', async ({
  page,
}) => {
  await open(page)
  await tool(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(choice(page, 'Stacked')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(rail(page)).toHaveAttribute('data-display', 'flat')
  await page.waitForTimeout(100)
  await expect(menu(page)).toBeHidden()
  await expect(tool(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(tool(page)).toBeFocused()
  await page.keyboard.press(' ') // the tool: opens
  await expect(choice(page, 'Row')).toBeFocused()
  await page.keyboard.press(' ')
  await page.waitForTimeout(100)
  await expect(menu(page)).toBeVisible()
  await expect(choice(page, 'Row')).toHaveAttribute('aria-checked', 'true')
})

test('Tab moves between the groups, then closes the popover and moves on from the tool', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'webkit',
    'headless WebKit does not deliver Tab focus traversal',
  )
  await open(page)
  await tool(page).click()
  await expect(choice(page, 'Stacked')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(choice(page, 'Dark')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(choice(page, 'Stacked')).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(menu(page)).toBeHidden()
  const next = await page.evaluate(() => {
    const tools = [...document.querySelectorAll('.gallerist-bar button')].filter((b) =>
      (b as HTMLElement).checkVisibility(),
    )
    const at = tools.indexOf(document.querySelector('.gallerist-view-btn') as Element)
    return tools[at + 1] === document.activeElement
  })
  expect(next).toBe(true)
})

for (const scheme of ['dark', 'light'] as const) {
  test(`no axe violations with the popover closed and open (${scheme})`, async ({ page }) => {
    await open(page, `${REVIEWER}&scheme=${scheme}`)
    const axe = () =>
      new AxeBuilder({ page })
        .include('.gallerist')
        .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
        .analyze()
    expect((await axe()).violations).toEqual([])
    await tool(page).click()
    await expect(menu(page)).toBeVisible()
    expect((await axe()).violations).toEqual([])
    // and on a row, with the popover open over it
    await choice(page, 'Row').click()
    await expect(rail(page)).toHaveAttribute('data-display', 'flat')
    expect((await axe()).violations).toEqual([])
  })
}

test('under its tool, under 300px wide, and inside the viewer on a wide screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page)
  await tool(page).click()
  const m = await menu(page).boundingBox()
  const b = await tool(page).boundingBox()
  const bar = await page.locator('.gallerist-bar').boundingBox()
  if (!m || !b || !bar) throw new Error('no layout')
  expect(m.y).toBeGreaterThanOrEqual(b.y + b.height)
  expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThan(1) // end on the tool's end
  expect(m.width).toBeLessThan(300)
  expect(m.height).toBeLessThan(160)
  expect(m.y).toBeLessThan(bar.y + bar.height + 12) // hung from the bar, over the stage's top edge
  // the two controls line up: the same start, the same width
  const seg = await page.getByRole('radiogroup').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return [r.left, r.width]
    }),
  )
  expect(seg[0]).toEqual(seg[1])
})

test('right to left, the popover starts at its tool and ← chooses the next segment', async ({
  page,
}) => {
  await open(page, `${REVIEWER}&dir=rtl`)
  await tool(page).click()
  const m = await menu(page).boundingBox()
  const b = await tool(page).boundingBox()
  if (!m || !b) throw new Error('no layout')
  expect(Math.abs(m.x - b.x)).toBeLessThan(1)
  const stacked = await choice(page, 'Stacked').boundingBox()
  const row = await choice(page, 'Row').boundingBox()
  expect((row?.x ?? 0) < (stacked?.x ?? 0)).toBe(true) // the segments run right to left
  await page.keyboard.press('ArrowLeft')
  await expect(choice(page, 'Row')).toBeFocused()
  await expect(rail(page)).toHaveAttribute('data-display', 'flat')
})

test.describe('on a 390px phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('taps open it, choose, and dismiss; it fits the screen', async ({ page }) => {
    await open(page)
    await tool(page).tap()
    await expect(menu(page)).toBeVisible()
    const m = await menu(page).boundingBox()
    const b = await tool(page).boundingBox()
    if (!m || !b) throw new Error('no layout')
    expect(m.x).toBeGreaterThanOrEqual(8 - 0.5)
    expect(m.x + m.width).toBeLessThanOrEqual(390 - 8 + 0.5)
    expect(m.y).toBeGreaterThanOrEqual(b.y + b.height)
    expect(m.y + m.height).toBeLessThan(844 / 3) // the top of the stage only
    // the toolbar's strip scrolls sideways on a phone: the tool shows whole under its popover
    const strip = await page.locator('.gallerist-region-toolbar').boundingBox()
    if (!strip) throw new Error('no layout')
    expect(b.x).toBeGreaterThanOrEqual(strip.x - 0.5)
    expect(b.x + b.width).toBeLessThanOrEqual(strip.x + strip.width + 0.5)
    for (const item of await page.getByRole('radio').all()) {
      const box = await item.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(36)
    }
    await choice(page, 'Row').tap()
    await expect(menu(page)).toBeVisible()
    await expect(rail(page)).toHaveAttribute('data-display', 'flat')
    await expect(counter(page)).toHaveText('2 / 37')
    await choice(page, 'Light').tap()
    await expect(root(page)).toHaveAttribute('data-gallerist-scheme', 'light')
    await counter(page).tap() // somewhere that does nothing itself
    await expect(menu(page)).toBeHidden()
    await tool(page).tap()
    await choice(page, 'Stacked').tap()
    await expect(rail(page)).not.toHaveAttribute('data-display', /./)
    await expect(counter(page)).toHaveText('2 / 12')
  })
})
