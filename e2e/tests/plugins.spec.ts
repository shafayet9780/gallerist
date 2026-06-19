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
  await expect(page.locator('.visora-thumbs')).not.toBeInViewport() // rail slid out of view
  await expect(page.locator('.visora-rail-toggle')).toBeVisible() // handle stays reachable
  await page.keyboard.press('t')
  await expect(root).toHaveAttribute('data-visora-rail', 'expanded')
  await expect(page.locator('.visora-thumbs')).toBeInViewport()
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

test('item axis loops within a group when loop is set', async ({ page }) => {
  const root = page.locator('.visora')
  await root.focus()
  await page.keyboard.press('ArrowRight') // g1 (3 items), at item 1
  await page.keyboard.press('ArrowUp') // prevItem at first → wraps to last
  await expect(page.locator('.visora-position .visora-pill[data-active]')).toHaveText('3')
  await page.keyboard.press('ArrowDown') // nextItem at last → wraps to first
  await expect(page.locator('.visora-position .visora-pill[data-active]')).toHaveText('1')
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

test('rail defaults to the bottom position', async ({ page }) => {
  await expect(page.locator('.visora')).toHaveAttribute('data-visora-rail-pos', 'bottom')
})

test('the rail handle lives in the gallery and toggles it (slides, stays reachable)', async ({
  page,
}) => {
  const toggle = page.locator('.visora-region-thumbnails .visora-rail-handle .visora-rail-toggle')
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page.locator('.visora')).toHaveAttribute('data-visora-rail', 'collapsed')
  await expect(page.locator('.visora-thumbs')).not.toBeInViewport() // rail slid away
  await expect(toggle).toBeVisible() // handle peeks so the rail can be reopened
})

test('peek flyout previews a group on hover and an item navigates', async ({ page }) => {
  const card = page.locator('.visora-thumb[data-group="g1"]')
  await card.hover()
  const peek = page.locator('.visora-thumb-peek')
  await expect(peek).toBeVisible()
  await expect(peek.locator('.visora-thumb-item')).toHaveCount(3)
  await expect(page.locator('.visora-counter')).toHaveText(/1 \/ 3/) // hover did not navigate
  await peek.locator('.visora-thumb-item').nth(2).click()
  await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3/) // now on g1
  await expect(page.locator('.visora-thumb-peek')).toBeHidden() // closed once its group is active
})

test('active group auto-expands a clickable item panel (host-mounted, un-clipped)', async ({
  page,
}) => {
  await page.locator('.visora').focus()
  await page.keyboard.press('ArrowRight') // g1 (3 items) active
  const panel = page.locator('.visora-thumb-items')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.visora-thumb-item')).toHaveCount(3)
  await panel.locator('.visora-thumb-item').nth(2).click() // clickable ⇒ not clipped by the stage
  await expect(page.locator('.visora-position .visora-pill[data-active]')).toHaveText('3')
})

test('items-toggle button and the `e` key hide/show the active item panel', async ({ page }) => {
  await page.locator('.visora').focus()
  await page.keyboard.press('ArrowRight') // g1 active
  const btn = page.locator('.visora-items-toggle')
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.visora-thumb-items')).toBeVisible()
  await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.visora-thumb-items')).toBeHidden()
  await page.locator('.visora').focus()
  await page.keyboard.press('e')
  await expect(page.locator('.visora-thumb-items')).toBeVisible()
})

test('hovering the active card peeks once its panel is hidden', async ({ page }) => {
  await page.locator('.visora').focus()
  await page.keyboard.press('ArrowRight') // g1 active, panel shown
  await page.locator('.visora-items-toggle').click() // hide it
  await page.locator('.visora-thumb[data-group="g1"]').hover()
  await expect(page.locator('.visora-thumb-peek .visora-thumb-item')).toHaveCount(3)
})

test('no axe violations with the full plugin set', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include('.visora')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test.describe('flat rail (groupDisplay: flat)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugins.html?display=flat')
    await page.click('#open')
    await expect(page.locator('.visora')).toBeVisible()
  })

  test('renders every item bracketed per group and a card navigates', async ({ page }) => {
    const rail = page.locator('.visora-thumbs[data-display="flat"]')
    await expect(rail).toBeVisible()
    await expect(rail.locator('.visora-thumb-group')).toHaveCount(3)
    await expect(rail.locator('.visora-thumb-item')).toHaveCount(6) // 1 + 3 + 2
    await rail.locator('.visora-thumb-item[data-item="b2"]').click()
    await expect(page.locator('.visora-counter')).toHaveText(/2 \/ 3/)
  })

  test('no axe violations in flat mode', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('.visora')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('top rail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plugins.html?rail=top')
    await page.click('#open')
    await expect(page.locator('.visora')).toBeVisible()
  })

  test('rail sits at the top and the active item panel opens below it, clickable', async ({
    page,
  }) => {
    await expect(page.locator('.visora')).toHaveAttribute('data-visora-rail-pos', 'top')
    await page.locator('.visora').focus()
    await page.keyboard.press('ArrowRight') // g1 (3 items)
    const panel = page.locator('.visora-thumb-items')
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport() // opens downward into the stage, not off-screen
    await panel.locator('.visora-thumb-item').nth(1).click() // clickable ⇒ not clipped
    await expect(page.locator('.visora-position .visora-pill[data-active]')).toHaveText('2')
  })

  test('no axe violations (top rail + item panel)', async ({ page }) => {
    await page.locator('.visora').focus()
    await page.keyboard.press('ArrowRight')
    const results = await new AxeBuilder({ page })
      .include('.visora')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
