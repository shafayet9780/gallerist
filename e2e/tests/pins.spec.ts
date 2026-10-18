import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

// plugin-pins in a real browser: pins hold their image point and screen size under zoom, cards open
// and close by mouse and keyboard, placing reports the clicked point, and (M17) a zoomed portrait
// can't be panned into the letterbox beside it.

const ready = async (page: Page, query = '') => {
  await page.goto(`/pins.html?${query}`)
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
  await expect(page.locator('.gallerist-content[data-gallerist-current] img')).toHaveAttribute(
    'data-gallerist-loaded',
    '',
  )
}
// the painted image box (object-fit: contain) in screen px
const imageBox = (page: Page) =>
  page.evaluate(() => {
    const img = document.querySelector(
      '.gallerist-content[data-gallerist-current] img',
    ) as HTMLImageElement
    const r = img.getBoundingClientRect()
    const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
    const w = img.naturalWidth * s
    const h = img.naturalHeight * s
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h }
  })
const dotOf = async (page: Page, id: string) => {
  const r = await page.locator(`[data-pin="${id}"] .gallerist-pin-dot`).boundingBox()
  if (!r) throw new Error(`pin ${id} not visible`)
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width }
}
const zoomState = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { viewer: { getState(): { zoom: { scale: number; x: number } } } }
      ).viewer.getState().zoom,
  )

test.describe('pins', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'pins run once (chromium)')

  test('a pin sits on its image point and keeps its size and point under zoom', async ({
    page,
  }) => {
    await ready(page)
    const check = async () => {
      const box = await imageBox(page)
      const dot = await dotOf(page, 'a')
      expect(Math.abs(dot.cx - (box.x + 0.25 * box.w))).toBeLessThan(1.5)
      expect(Math.abs(dot.cy - (box.y + 0.25 * box.h))).toBeLessThan(1.5)
      return dot.w
    }
    const before = await check()
    await page.keyboard.press('+')
    await page.keyboard.press('+')
    await expect.poll(async () => (await zoomState(page)).scale).toBeGreaterThan(1.5)
    await page.waitForTimeout(400) // let the zoom transition settle
    const after = await check()
    expect(Math.abs(after - before)).toBeLessThan(1) // counter-scaled: same screen size
  })

  test('a card opens beside its pin, Escape closes it and keeps the viewer open', async ({
    page,
  }) => {
    await ready(page)
    const marker = page.locator('[data-pin="a"] .gallerist-pin-marker')
    await marker.click()
    const card = page.locator('[data-pin="a"] .gallerist-pin-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Quarter')
    await expect(card.locator('a')).toHaveAttribute('href', '#a')
    // the near-edge pin (0.8, 0.8) opens up and to the left, inside the stage
    await page.locator('[data-pin="b"] .gallerist-pin-marker').click()
    await expect(card).toBeHidden()
    const other = await page.locator('[data-pin="b"] .gallerist-pin-card').boundingBox()
    const stage = await page.locator('.gallerist-stage').boundingBox()
    expect(other && stage && other.x + other.width <= stage.x + stage.width).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-pin="b"] .gallerist-pin-card')).toBeHidden()
    await expect(page.locator('[data-pin="b"] .gallerist-pin-marker')).toBeFocused()
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
  })

  test('a pin is a 44px target and reachable with Tab', async ({ page }) => {
    await ready(page)
    const box = await page.locator('[data-pin="a"] .gallerist-pin-marker').boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(43.5)
    expect(box?.height).toBeGreaterThanOrEqual(43.5)
    let reached = false
    for (let k = 0; k < 30 && !reached; k++) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(
        () => !!document.activeElement?.closest('[data-pin="a"] .gallerist-pin-marker'),
      )
    }
    expect(reached).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-pin="a"] .gallerist-pin-card')).toBeVisible()
  })

  test('p hides and shows every pin', async ({ page }) => {
    await ready(page)
    await page.locator('.gallerist').press('p')
    await expect(page.locator('.gallerist-pin').first()).toBeHidden()
    await page.locator('.gallerist').press('p')
    await expect(page.locator('.gallerist-pin').first()).toBeVisible()
  })

  test('placing a comment reports the clicked image point and shows the new pin', async ({
    page,
  }) => {
    await ready(page, 'presentation=comment&skin=console')
    await page.locator('.gallerist-pin-add').click()
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-placing', '')
    const box = await imageBox(page)
    await page.mouse.click(box.x + box.w * 0.6, box.y + box.h * 0.4)
    const placed = await page.evaluate(
      () => (window as unknown as { placed: Array<{ x: number; y: number }> }).placed,
    )
    expect(placed).toHaveLength(1)
    expect(placed[0]?.x).toBeCloseTo(0.6, 2)
    expect(placed[0]?.y).toBeCloseTo(0.4, 2)
    await expect(page.locator('[data-pin="n1"]')).toBeVisible()
    await expect(page.locator('[data-pin="n1"] .gallerist-pin-dot')).toHaveText('4')
  })

  for (const look of ['skin=gallery', 'skin=gallery&scheme=light', 'skin=console']) {
    test(`an open card has no axe violations (${look})`, async ({ page }) => {
      await ready(page, `${look}&presentation=comment`)
      await page.locator('[data-pin="c"] .gallerist-pin-marker').click()
      const results = await new AxeBuilder({ page })
        .include('.gallerist-pin')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
})

test('a zoomed portrait pans only to its own edges, never into the letterbox (M17)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'runs once (chromium)')
  await page.setViewportSize({ width: 800, height: 900 }) // a tall stage: the zoomed portrait outgrows its width
  await ready(page, 'i=1')
  const stage = await page.locator('.gallerist-stage').boundingBox()
  if (!stage) throw new Error('no stage')
  // zoom in until the portrait is wider than the stage, then drag hard to the right
  for (let k = 0; k < 8; k++) await page.keyboard.press('+')
  await page.waitForTimeout(400)
  const cx = stage.x + stage.width / 2
  const cy = stage.y + stage.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 2000, cy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const box = await imageBox(page)
  expect(box.w).toBeGreaterThan(stage.width)
  expect(Math.abs(box.x - stage.x)).toBeLessThan(1.5) // the image's left edge stops at the stage's
})
