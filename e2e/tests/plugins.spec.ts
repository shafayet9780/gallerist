import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

test.beforeEach(async ({ page }) => {
  await page.goto('/plugins.html')
  await page.click('#open')
  await expect(page.locator('.gallerist')).toBeVisible()
})

test('thumbnail rail renders and a thumb navigates', async ({ page }) => {
  const rail = page.locator('.gallerist-region-thumbnails .gallerist-thumbs')
  await expect(rail).toBeVisible()
  await rail.locator('.gallerist-thumb[data-group="g2"]').click()
  await expect(page.locator('.gallerist-counter')).toHaveText(/3 \/ 3/)
})

test('grid toggles and a cell navigates back to the stage', async ({ page }) => {
  await page.locator('.gallerist').focus()
  await page.keyboard.press('g')
  const gridEl = page.locator('.gallerist-region-stage .gallerist-grid')
  await expect(gridEl).toBeVisible()
  await gridEl.locator('.gallerist-grid-cell[data-group="g1"][data-item="b2"]').click()
  await expect(gridEl).toBeHidden()
  // counter is group-only now; the within-group position lives in the segmented pills (UX-H)
  await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/)
  await expect(page.locator('.gallerist-position .gallerist-pill[data-active]')).toHaveText('3')
})

test("'t' collapses and expands the thumbnail rail", async ({ page }) => {
  const root = page.locator('.gallerist')
  await expect(root).toHaveAttribute('data-gallerist-rail', 'expanded')
  await root.focus()
  await page.keyboard.press('t')
  await expect(root).toHaveAttribute('data-gallerist-rail', 'collapsed')
  await expect(page.locator('.gallerist-thumbs')).not.toBeInViewport() // rail slid out of view
  await expect(page.locator('.gallerist-rail-toggle')).toBeVisible() // handle stays reachable
  await page.keyboard.press('t')
  await expect(root).toHaveAttribute('data-gallerist-rail', 'expanded')
  await expect(page.locator('.gallerist-thumbs')).toBeInViewport()
})

test('within-group ↑/↓ keeps the highlight in the vertical column (no horizontal drift)', async ({
  page,
}) => {
  const root = page.locator('.gallerist')
  await root.focus()
  await page.keyboard.press('ArrowRight') // g1 (3 items) active
  const col = page.locator('.gallerist-thumb-items')
  await expect(col).toHaveAttribute('data-axis', 'vertical')
  await page.keyboard.press('ArrowDown') // i → 1
  await expect(col.locator('.gallerist-thumb-item[data-active]')).toHaveAttribute('data-item', 'b1')
  await expect(page.locator('.gallerist-thumb[data-active]')).toHaveAttribute('data-group', 'g1')
})

test('item axis loops within a group when loop is set', async ({ page }) => {
  const root = page.locator('.gallerist')
  await root.focus()
  await page.keyboard.press('ArrowRight') // g1 (3 items), at item 1
  await page.keyboard.press('ArrowUp') // prevItem at first → wraps to last
  await expect(page.locator('.gallerist-position .gallerist-pill[data-active]')).toHaveText('3')
  await page.keyboard.press('ArrowDown') // nextItem at last → wraps to first
  await expect(page.locator('.gallerist-position .gallerist-pill[data-active]')).toHaveText('1')
})

test('segmented position pills reflect the current screen', async ({ page }) => {
  const root = page.locator('.gallerist')
  await root.focus()
  await page.keyboard.press('ArrowRight') // g1, 3 items
  const pos = page.locator('.gallerist-position')
  await expect(pos).toHaveAttribute('data-mode', 'pills')
  await expect(pos.locator('.gallerist-pill[data-active]')).toHaveText('1')
  await page.keyboard.press('ArrowDown')
  await expect(pos.locator('.gallerist-pill[data-active]')).toHaveText('2')
})

test('default arrow layout is the right-center pill', async ({ page }) => {
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-arrows', 'pill-right')
})

test('rail defaults to the bottom position', async ({ page }) => {
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-rail-pos', 'bottom')
})

test('the rail handle lives in the gallery and toggles it (slides, stays reachable)', async ({
  page,
}) => {
  const toggle = page.locator(
    '.gallerist-region-thumbnails .gallerist-rail-handle .gallerist-rail-toggle',
  )
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-rail', 'collapsed')
  await expect(page.locator('.gallerist-thumbs')).not.toBeInViewport() // rail slid away
  await expect(toggle).toBeVisible() // handle peeks so the rail can be reopened
})

test('peek flyout previews a group on hover and an item navigates', async ({ page }) => {
  const card = page.locator('.gallerist-thumb[data-group="g1"]')
  await card.hover()
  const peek = page.locator('.gallerist-thumb-peek')
  await expect(peek).toBeVisible()
  await expect(peek.locator('.gallerist-thumb-item')).toHaveCount(3)
  await expect(page.locator('.gallerist-counter')).toHaveText(/1 \/ 3/) // hover did not navigate
  await peek.locator('.gallerist-thumb-item').nth(2).click()
  await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/) // now on g1
  await expect(page.locator('.gallerist-thumb-peek')).toBeHidden() // closed once its group is active
})

test('active group auto-expands a clickable item panel (host-mounted, un-clipped)', async ({
  page,
}) => {
  await page.locator('.gallerist').focus()
  await page.keyboard.press('ArrowRight') // g1 (3 items) active
  const panel = page.locator('.gallerist-thumb-items')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.gallerist-thumb-item')).toHaveCount(3)
  await panel.locator('.gallerist-thumb-item').nth(2).click() // clickable ⇒ not clipped by the stage
  await expect(page.locator('.gallerist-position .gallerist-pill[data-active]')).toHaveText('3')
})

test('items-toggle button and the `e` key hide/show the active item panel', async ({ page }) => {
  await page.locator('.gallerist').focus()
  await page.keyboard.press('ArrowRight') // g1 active
  const btn = page.locator('.gallerist-items-toggle')
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.gallerist-thumb-items')).toBeVisible()
  await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.gallerist-thumb-items')).toBeHidden()
  await page.locator('.gallerist').focus()
  await page.keyboard.press('e')
  await expect(page.locator('.gallerist-thumb-items')).toBeVisible()
})

test('hovering the active card peeks once its panel is hidden', async ({ page }) => {
  await page.locator('.gallerist').focus()
  await page.keyboard.press('ArrowRight') // g1 active, panel shown
  await page.locator('.gallerist-items-toggle').click() // hide it
  await page.locator('.gallerist-thumb[data-group="g1"]').hover()
  await expect(page.locator('.gallerist-thumb-peek .gallerist-thumb-item')).toHaveCount(3)
})

test('no axe violations with the full plugin set', async ({ page }) => {
  await viewerSettled(page)
  const results = await new AxeBuilder({ page })
    .include('.gallerist')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test.describe('flat rail (groupDisplay: flat)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugins.html?display=flat')
    await page.click('#open')
    await expect(page.locator('.gallerist')).toBeVisible()
  })

  test('renders every item bracketed per group and a card navigates', async ({ page }) => {
    const rail = page.locator('.gallerist-thumbs[data-display="flat"]')
    await expect(rail).toBeVisible()
    await expect(rail.locator('.gallerist-thumb-group')).toHaveCount(3)
    await expect(rail.locator('.gallerist-thumb-item')).toHaveCount(6) // 1 + 3 + 2
    await rail.locator('.gallerist-thumb-item[data-item="b2"]').click()
    await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/)
  })

  test('no axe violations in flat mode', async ({ page }) => {
    await viewerSettled(page)
    const results = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('linear flat traversal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugins.html?linear=1')
    await page.click('#open')
    await expect(page.locator('.gallerist')).toBeVisible()
  })

  test('marks linear and hides the up/down arrows + within-group pills', async ({ page }) => {
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-linear', 'true')
    await expect(page.locator('.gallerist-item-prev')).toBeHidden()
    await expect(page.locator('.gallerist-item-next')).toBeHidden()
    await expect(page.locator('.gallerist-position')).toBeHidden()
  })

  test('ArrowRight walks the whole flattened sequence; counter shows item N / total', async ({
    page,
  }) => {
    await page.locator('.gallerist').focus()
    await expect(page.locator('.gallerist-counter')).toHaveText(/1 \/ 6/) // a0
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 6/) // b0 — into the next group
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.gallerist-counter')).toHaveText(/3 \/ 6/) // b1 — next item, same group
    await page.keyboard.press('ArrowDown') // item axis retired → inert
    await expect(page.locator('.gallerist-counter')).toHaveText(/3 \/ 6/)
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 6/) // back across the boundary
  })

  test('no axe violations in linear mode', async ({ page }) => {
    await viewerSettled(page)
    const results = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('flat rail + linear: clicking a flat item navigates; counter is item N / total', async ({
    page,
  }) => {
    await page.goto('/plugins.html?display=flat&linear=1')
    await page.click('#open')
    await expect(page.locator('.gallerist-thumbs[data-display="flat"]')).toBeVisible()
    await page.locator('.gallerist-thumb-item[data-item="b2"]').click() // b2 = 4th item overall
    await expect(page.locator('.gallerist-counter')).toHaveText(/4 \/ 6/)
  })
})

test.describe('vertical rail (right)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugins.html?rail=right')
    await page.click('#open')
    await expect(page.locator('.gallerist')).toBeVisible()
  })

  test('runs vertical and remaps the axes (↑/↓ groups, ←/→ items)', async ({ page }) => {
    const root = page.locator('.gallerist')
    await expect(root).toHaveAttribute('data-gallerist-rail-pos', 'right')
    await expect(root).toHaveAttribute('data-gallerist-orientation', 'vertical')
    await root.focus()
    await page.keyboard.press('ArrowDown') // group axis → g1
    await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/)
    await page.keyboard.press('ArrowRight') // item axis within g1
    await expect(page.locator('.gallerist-position .gallerist-pill[data-active]')).toHaveText('2')
  })

  test('the active item panel opens toward the stage and a click navigates', async ({ page }) => {
    await page.locator('.gallerist').focus()
    await page.keyboard.press('ArrowDown') // g1 active (multi) → panel shows
    const panel = page.locator('.gallerist-thumb-items')
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport()
    await panel.locator('.gallerist-thumb-item').nth(2).click()
    await expect(page.locator('.gallerist-position .gallerist-pill[data-active]')).toHaveText('3')
  })

  test('no axe violations (vertical rail)', async ({ page }) => {
    await viewerSettled(page)
    const results = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
