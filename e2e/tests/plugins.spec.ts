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

  test('renders every item grouped and a card navigates', async ({ page }) => {
    const rail = page.locator('.gallerist-thumbs[data-display="flat"]')
    await expect(rail).toBeVisible()
    await expect(rail.locator('.gallerist-thumb-group')).toHaveCount(3)
    await expect(rail.locator('.gallerist-thumb-item')).toHaveCount(6) // 1 + 3 + 2
    await rail.locator('.gallerist-thumb-item[data-item="b2"]').click()
    // a flat rail makes the walk linear: the counter is the item's place among all 6
    await expect(page.locator('.gallerist-counter')).toHaveText(/4 \/ 6/)
    await expect(rail.locator('.gallerist-thumb-group[data-active]')).toHaveAttribute(
      'data-group',
      'g1',
    )
  })

  test('groups are split by a hairline, not boxed; only the current group is marked', async ({
    page,
  }) => {
    const groups = page.locator('.gallerist-thumb-group')
    const look = (k: number) =>
      groups.nth(k).evaluate((el) => {
        const s = getComputedStyle(el)
        return {
          start: s.borderInlineStartWidth,
          end: s.borderInlineEndWidth,
          top: s.borderTopWidth,
          bg: s.backgroundColor,
          radius: s.borderTopLeftRadius,
        }
      })
    const none = { end: '0px', top: '0px', bg: 'rgba(0, 0, 0, 0)', radius: '0px' }
    expect(await look(0)).toEqual({ start: '0px', ...none }) // the first group: nothing before it
    expect(await look(1)).toEqual({ start: '1px', ...none }) // a divider between groups
    expect(await look(2)).toEqual({ start: '1px', ...none })
    await expect(page.locator('.gallerist-thumb-group[data-active]')).toHaveCount(1)
    await expect(groups.first()).toHaveAttribute('data-active', '')
  })

  test('←/→ walk every item across group boundaries without passing linear', async ({ page }) => {
    const root = page.locator('.gallerist')
    await expect(root).toHaveAttribute('data-gallerist-linear', 'true')
    await expect(page.locator('.gallerist-itemnav')).toBeHidden()
    await root.focus()
    const current = page.locator('.gallerist-thumb-group[data-active]')
    await expect(page.locator('.gallerist-counter')).toHaveText(/1 \/ 6/) // a0
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 6/) // b0: into g1
    await expect(current).toHaveAttribute('data-group', 'g1')
    await expect(page.locator('.gallerist-thumb-item[data-item="b0"]')).toHaveAttribute(
      'data-active',
      '',
    )
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // b1, b2, then c0: into g2
    await expect(page.locator('.gallerist-counter')).toHaveText(/5 \/ 6/)
    await expect(current).toHaveAttribute('data-group', 'g2')
    await page.keyboard.press('ArrowDown') // the item axis retires
    await expect(page.locator('.gallerist-counter')).toHaveText(/5 \/ 6/)
    await page.keyboard.press('ArrowLeft') // back across the boundary, to g1's last item
    await expect(page.locator('.gallerist-counter')).toHaveText(/4 \/ 6/)
    await expect(current).toHaveAttribute('data-group', 'g1')
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

  test('flat rail + linear: false keeps the two axes', async ({ page }) => {
    await page.goto('/plugins.html?display=flat&linear=0')
    await page.click('#open')
    const root = page.locator('.gallerist')
    await expect(page.locator('.gallerist-thumbs[data-display="flat"]')).toBeVisible()
    await expect(root).not.toHaveAttribute('data-gallerist-linear')
    await root.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.gallerist-counter')).toHaveText(/2 \/ 3/) // group 2 of 3
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.gallerist-thumb-item[data-item="b1"]')).toHaveAttribute(
      'data-active',
      '',
    )
  })
})

// The reviewer's timeline on a flat rail: each group headed by its time, the current one in the
// accent, the rest muted; the times stay part of the groups' names.
test.describe('flat rail with timeline labels (reviewer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/layout.html?preset=reviewer&skin=console&display=flat&captions=1')
    await viewerSettled(page)
  })

  test('labels each group with its time and accents only the current one', async ({ page }) => {
    const caps = page.locator('.gallerist-thumb-group-cap')
    await expect(caps.first()).toHaveText('09:12')
    await expect(page.locator('.gallerist-thumb-group[data-group="g1"]')).toHaveAttribute(
      'aria-label',
      'Group 2, 09:19',
    )
    const colours = () =>
      page.evaluate(() => {
        const root = document.querySelector('.gallerist') as HTMLElement
        const probe = document.createElement('span')
        root.appendChild(probe)
        const resolve = (v: string) => {
          probe.style.color = `var(${v})`
          return getComputedStyle(probe).color
        }
        const tokens = {
          accent: resolve('--gallerist-accent'),
          muted: resolve('--gallerist-fg-muted'),
        }
        probe.remove()
        const caps = [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-group')]
          .filter((g) => g.querySelector('.gallerist-thumb-group-cap'))
          .map((g) => ({
            group: g.dataset.group,
            active: g.hasAttribute('data-active'),
            colour: getComputedStyle(g.querySelector('.gallerist-thumb-group-cap') as Element)
              .color,
          }))
        return { tokens, caps }
      })
    const check = async (current: string) => {
      const { tokens, caps } = await colours()
      expect(tokens.accent).not.toBe(tokens.muted)
      for (const cap of caps) {
        expect(cap.active).toBe(cap.group === current)
        expect(cap.colour).toBe(cap.active ? tokens.accent : tokens.muted)
      }
    }
    await check('g1') // the fixture opens on group 2
    const root = page.locator('.gallerist')
    await root.focus()
    for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowRight') // g1's 3 items, then g2
    await expect(page.locator('.gallerist-thumb-group[data-active]')).toHaveAttribute(
      'data-group',
      'g2',
    )
    await check('g2')
  })

  test('no axe violations with timeline labels on a flat rail', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('.gallerist')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
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
