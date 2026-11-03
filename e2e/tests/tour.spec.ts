import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

// The tour preset end to end: labelled arrows, ←/→ between sections beside a side rail, the section
// index, and the overview it can open on.

const cursor = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { viewer: { getState(): { cursor: { g: number; i: number } } } }
      ).viewer.getState().cursor,
  )

test('left/right moves between sections and up/down within one, beside the side rail', async ({
  page,
}) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=1')
  await expect(page.locator('.gallerist-thumb-row')).not.toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  expect(await cursor(page)).toEqual({ g: 1, i: 1 })
  await page.keyboard.press('ArrowRight')
  expect((await cursor(page)).g).toBe(2)
})

test('arrows name the sections they go to', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=1')
  await expect(page.locator('.gallerist-next .gallerist-arrow-label')).toHaveText('Group 3 title')
  await expect(page.locator('.gallerist-prev .gallerist-arrow-label')).toHaveText('Group 1 title')
  await page.locator('.gallerist-next').click()
  await expect(page.locator('.gallerist-next .gallerist-arrow-label')).toHaveText('Group 4 title')
})

test('the index expands the active section, and a row and an item navigate', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0')
  await page.locator('.gallerist-thumb-row').nth(2).click()
  const panel = page.locator('.gallerist-thumb-section[data-group="g2"] .gallerist-thumb-item')
  await expect(panel).toHaveCount(2)
  await panel.nth(1).click()
  expect(await cursor(page)).toEqual({ g: 2, i: 1 })
})

test('the overview opens first, hides the stage controls, and Start enters the tour', async ({
  page,
}) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0&overview=1')
  const start = page.locator('.gallerist-grid-start')
  await expect(start).toHaveText('Start tour')
  await expect(page.locator('.gallerist-controls')).toBeHidden()
  await start.click()
  await expect(start).toBeHidden()
  await expect(page.locator('.gallerist-controls')).toBeVisible()
  await page.keyboard.press('ArrowRight') // focus stayed in the viewer
  expect((await cursor(page)).g).toBe(1)
})

// docked arrows (reviewer): the item navigator is a root grid item, outside the stage's controls,
// so the overview hides it as well; focus on it stays in the viewer
test('the overview hides a docked item navigator, and focus on it stays in the viewer', async ({
  page,
}) => {
  await page.goto('/layout.html?preset=reviewer&g=1&overview=1')
  const nav = page.locator('.gallerist > .gallerist-itemnav')
  await expect(nav).toBeVisible()
  await nav.locator('.gallerist-item-next').focus()
  await page.keyboard.press('g')
  await expect(page.locator('.gallerist-grid-start')).toBeVisible()
  await expect(nav).toBeHidden()
  expect(await page.evaluate(() => !!document.activeElement?.closest('.gallerist'))).toBe(true)
  await page.keyboard.press('g')
  await expect(nav).toBeVisible()
})

test('an overview cell opens that item', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0&overview=1')
  await page.locator('.gallerist-grid-cell[data-item="g1i2"]').click()
  expect(await cursor(page)).toEqual({ g: 1, i: 2 })
  await expect(page.locator('.gallerist-grid')).toBeHidden()
})

test('a cell click leaves the keys working; an index row leaves the overview', async ({ page }) => {
  await page.goto('/layout.html?preset=tour&captions=1&g=0&overview=1')
  await page.locator('.gallerist-grid-cell[data-item="g1i0"]').click()
  await page.keyboard.press('ArrowRight')
  expect((await cursor(page)).g).toBe(2)

  await page.goto('/layout.html?preset=tour&captions=1&g=0&overview=1')
  await page.locator('.gallerist-thumb-row').nth(3).click()
  await expect(page.locator('.gallerist-grid')).toBeHidden()
  expect((await cursor(page)).g).toBe(3)
})

for (const width of [768, 920, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('the arrows and item navigator keep clear of the photo', async ({ page }) => {
      await page.goto('/layout.html?preset=tour&captions=1&g=1')
      await expect(page.locator('.gallerist-next .gallerist-arrow-label')).toBeVisible()
      // the slide on show: neighbours are mounted too, off to the sides
      const media = await page.evaluate(() => {
        const stage = document.querySelector('.gallerist-stage')?.getBoundingClientRect()
        if (!stage) return null
        const cx = stage.x + stage.width / 2
        for (const node of document.querySelectorAll('.gallerist-media')) {
          const r = node.getBoundingClientRect()
          if (r.left <= cx && r.right >= cx) return { x: r.x, width: r.width }
        }
        return null
      })
      expect(media).not.toBeNull()
      for (const sel of ['.gallerist-prev', '.gallerist-next', '.gallerist-itemnav']) {
        const box = await page.locator(sel).boundingBox()
        const clear =
          !!box &&
          !!media &&
          (box.x + box.width <= media.x + 1 || box.x >= media.x + media.width - 1)
        expect(clear, sel).toBe(true)
      }
    })
  })
}

test('an inline viewer below the fold does not scroll its host page', async ({ page }) => {
  await page.goto('http://localhost:5174/index.html')
  await expect(page.locator('#stage .gallerist-thumb').first()).toBeVisible()
  await page.locator('input[name="preset"][value="tour"]').evaluate((el) => {
    window.scrollTo(0, 0)
    ;(el as HTMLInputElement).click()
  })
  await expect(page.locator('#stage .gallerist-thumb-row').first()).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the index is a strip of chips along the bottom', async ({ page }) => {
    await page.goto('/layout.html?preset=tour&captions=1&g=1')
    const chip = page.locator('.gallerist-thumb-row').first()
    const stage = await page.locator('.gallerist-stage').boundingBox()
    const box = await chip.boundingBox()
    expect(box && stage && box.y >= stage.y + stage.height).toBe(true)
    await expect(page.locator('.gallerist-thumb-row .gallerist-thumb-img').first()).toBeHidden()
  })

  test('the rail still scrolls: the active chip of a far section shows', async ({ page }) => {
    await page.goto('/layout.html?preset=tour&captions=1&g=11')
    const chip = page.locator('.gallerist-thumb-row[aria-current]')
    await expect(chip).toBeInViewport({ ratio: 0.95 }) // scroll offsets round to whole pixels
  })

  test('Tab wraps past the hidden items of a last section, staying in the dialog', async ({
    page,
  }) => {
    await page.goto('/layout.html?preset=tour&captions=1&g=11') // the last group, with two items
    await page.locator('.gallerist-thumb-row').last().focus()
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() =>
      document.querySelector('.gallerist')?.contains(document.activeElement),
    )
    expect(inside).toBe(true)
  })
})

for (const [name, query] of [
  ['tour', 'preset=tour&captions=1&g=1'],
  ['overview', 'preset=tour&captions=1&g=0&overview=1'],
]) {
  test(`no axe violations: ${name}`, async ({ page }) => {
    await page.goto(`/layout.html?${query}`)
    await expect(page.locator('.gallerist')).toBeVisible()
    await viewerSettled(page)
    const { violations } = await new AxeBuilder({ page })
      .include('.gallerist')
      .disableRules(['color-contrast'])
      .analyze()
    expect(violations.map((v) => v.id)).toEqual([])
  })
}
