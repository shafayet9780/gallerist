import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

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

  for (const look of ['', 'preset=editorial&skin=editorial']) {
    test(`a pin sits on its image point and keeps its size and point under zoom ${look}`, async ({
      page,
    }) => {
      await ready(page, look)
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
  }

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

  for (const look of ['skin=console', 'skin=editorial&preset=editorial']) {
    test(`placing a comment reports the clicked image point and shows the new pin (${look})`, async ({
      page,
    }) => {
      await ready(page, `presentation=comment&${look}`)
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
  }

  for (const look of [
    'skin=gallery',
    'skin=gallery&scheme=light',
    'skin=console',
    'skin=editorial',
    'skin=editorial&scheme=dark',
  ]) {
    test(`an open card has no axe violations (${look})`, async ({ page }) => {
      await ready(page, `${look}&presentation=comment`)
      await page.locator('[data-pin="c"] .gallerist-pin-marker').click()
      await viewerSettled(page)
      const results = await new AxeBuilder({ page })
        .include('.gallerist-pin')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
})

// on every engine: WebKit doesn't focus a clicked button, so Escape arrives at the viewer root
test('Escape closes an open card, not the viewer, wherever focus is', async ({ page }) => {
  await ready(page)
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  await expect(page.locator('[data-pin="a"] .gallerist-pin-card')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-pin="a"] .gallerist-pin-card')).toBeHidden()
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
})

// a host card (renderCard): saving redraws it; focus lands on its pin, not <body>, so the next
// Escape closes the card and not the viewer; each node the host rendered is handed back once
test('a host card: save redraws, focus on its pin, Escape closes the card, not the viewer', async ({
  page,
}) => {
  await page.goto('/pins.html?card=form&presentation=comment')
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
  const marker = page.locator('[data-pin="a"] .gallerist-pin-marker')
  const card = page.locator('[data-pin="a"] .gallerist-pin-card')
  const removed = () => page.evaluate(() => (window as unknown as { removed: string[] }).removed)
  await marker.click()
  await card.getByLabel('Comment').fill('Looks good')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByLabel('Comment')).toHaveValue('Looks good') // redrawn from the new data
  await expect(marker).toBeFocused()
  await expect(card).toBeVisible()
  expect(await removed()).toEqual(['a'])
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(marker).toBeFocused()
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
  expect(await removed()).toEqual(['a', 'a'])
  // focus in a card when the item changes (its pin is gone from view) goes to the add-pin button
  await marker.click()
  await card.getByLabel('Comment').focus()
  await page.evaluate(() =>
    (window as unknown as { viewer: { nextItem(): void } }).viewer.nextItem(),
  )
  await expect(page.locator('.gallerist-pin-add')).toBeFocused()
  expect(await removed()).toEqual(['a', 'a', 'a'])
})

test('on a small screen a card opens toward the room and stays inside the stage', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'runs once (chromium)')
  await page.setViewportSize({ width: 375, height: 667 })
  await ready(page, 'presentation=comment')
  for (const id of ['a', 'b', 'c']) {
    await page.locator(`[data-pin="${id}"] .gallerist-pin-marker`).click()
    const card = await page.locator(`[data-pin="${id}"] .gallerist-pin-card`).boundingBox()
    const stage = await page.locator('.gallerist-stage').boundingBox()
    if (!card || !stage) throw new Error('missing box')
    expect(card.x, id).toBeGreaterThanOrEqual(stage.x - 1)
    expect(card.x + card.width, id).toBeLessThanOrEqual(stage.x + stage.width + 1)
  }
})

test('a double click inside an open card does not zoom the image', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'runs once (chromium)')
  await ready(page)
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  await page.locator('[data-pin="a"] .gallerist-pin-body').dblclick()
  expect((await zoomState(page)).scale).toBe(1)
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

// Apploye's landscape phone (844×390): a host card taller than the stage ran past its bottom, or
// opened up under the toolbar. It stays inside the stage and scrolls; its last button is reachable.
test('a tall host card on a landscape phone stays inside the stage; its last button works', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'runs once (chromium)')
  await page.setViewportSize({ width: 844, height: 390 })
  await ready(page, 'card=draft&presentation=comment')
  for (const id of ['a', 'b', 'c']) {
    await page.locator(`[data-pin="${id}"] .gallerist-pin-marker`).click()
    const card = page.locator(`[data-pin="${id}"] .gallerist-pin-card`)
    await expect(card).toBeVisible()
    const c = await card.boundingBox()
    const s = await page.locator('.gallerist-stage').boundingBox()
    if (!c || !s) throw new Error('missing box')
    expect(c.y, id).toBeGreaterThanOrEqual(s.y - 1)
    expect(c.y + c.height, id).toBeLessThanOrEqual(s.y + s.height + 1)
    expect(c.x, id).toBeGreaterThanOrEqual(s.x - 1)
    expect(c.x + c.width, id).toBeLessThanOrEqual(s.x + s.width + 1)
    // taller than the room: it scrolls, and is in the tab order so the keys can scroll it
    expect(await card.evaluate((el) => el.scrollHeight > el.clientHeight + 1), id).toBe(true)
    await expect(card).toHaveAttribute('tabindex', '0')
    // the last button: scrolled into view inside the card (not spilling out of it), and it takes
    // the click (nothing over it)
    const discard = card.getByRole('button', { name: 'Discard' })
    await discard.scrollIntoViewIfNeeded()
    const b = await discard.boundingBox()
    if (!b) throw new Error('no button box')
    expect(b.y, id).toBeGreaterThanOrEqual(c.y)
    expect(b.y + b.height, id).toBeLessThanOrEqual(c.y + c.height)
    await discard.click()
    await expect(card).toBeHidden()
  }
})

// The host drops an empty draft when its card closes (onOpenChange + refresh()); the repaint takes
// its pin a frame after the card's focus went there. Focus goes on to the add button, not <body>.
test('an empty draft the host drops: focus on the add button; Escape keeps the viewer', async ({
  page,
}) => {
  await ready(page, 'card=draft&presentation=comment')
  const add = page.locator('.gallerist-pin-add')
  const place = async () => {
    await add.click()
    const box = await imageBox(page)
    await page.mouse.click(box.x + box.w * 0.6, box.y + box.h * 0.4)
    await expect(page.locator('.gallerist-pin[data-open] textarea')).toBeVisible()
  }
  const settled = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await place()
  await page.locator('.gallerist-pin[data-open] .gallerist-pin-close').click()
  await expect(page.locator('[data-pin="n1"]')).toHaveCount(0)
  await settled()
  await expect(add).toBeFocused()
  // Escape from the draft's field: the card closes (the draft with it), not the viewer
  await place()
  await page.locator('.gallerist-pin[data-open] textarea').focus()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-pin="n2"]')).toHaveCount(0)
  await settled()
  await expect(add).toBeFocused()
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
})

// focus the plugin moves after a key shows the focus ring (focusVisible: true); after a click it
// doesn't (false). Both engines here honour the option (a wrong value fails on either; checked by
// flipping it), so this runs on both.
test('focus moved after a key shows the ring; after a click it does not', async ({ page }) => {
  await ready(page, 'card=draft&presentation=comment')
  const marker = page.locator('[data-pin="a"] .gallerist-pin-marker')
  const card = page.locator('[data-pin="a"] .gallerist-pin-card')
  const ring = () => marker.evaluate((el) => el.matches(':focus-visible'))
  await marker.click()
  await card.getByLabel('Comment').click()
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(marker).toBeFocused()
  expect(await ring()).toBe(true)
  await marker.click()
  await card.locator('.gallerist-pin-close').click()
  await expect(card).toBeHidden()
  await expect(marker).toBeFocused()
  expect(await ring()).toBe(false)
  // × clicked while the card's field has focus (a field always shows the ring): still a click
  await marker.click()
  await card.getByLabel('Comment').click()
  await card.locator('.gallerist-pin-close').click()
  await expect(card).toBeHidden()
  await expect(marker).toBeFocused()
  expect(await ring()).toBe(false)
  // Escape after a click on the card itself (no ring there): a key, so the pin shows the ring
  await marker.click()
  const at = await card.boundingBox()
  if (!at) throw new Error('no card box')
  await page.mouse.click(at.x + at.width - 6, at.y + at.height - 6)
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(marker).toBeFocused()
  expect(await ring()).toBe(true)
  // saved from the keyboard: the redraw puts focus on the pin, with the ring (Save focused by script:
  // WebKit's Tab skips buttons by default)
  await marker.click()
  await card.getByLabel('Comment').fill('Looks good')
  await card.getByRole('button', { name: 'Save' }).focus()
  await page.keyboard.press('Enter')
  await expect(card.getByLabel('Comment')).toHaveValue('Looks good')
  await expect(marker).toBeFocused()
  expect(await ring()).toBe(true)
})

// A wheel over a card: a card that scrolls takes it (its contents scroll, the image doesn't zoom);
// a short card, or a pinch (ctrl+wheel) over any card, zooms the image as over the stage, and the
// stage keeps the page from zooming (the event is cancelled).
test('a wheel over a card: a scrolling card scrolls, a short card or a pinch zooms the image', async ({
  page,
}) => {
  const over = async (sel: string) => {
    const b = await page.locator(sel).boundingBox()
    if (!b) throw new Error(`no box for ${sel}`)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  }
  // the last wheel event's defaultPrevented once dispatched (seen in capture: a scrolling card stops
  // it from bubbling)
  const cancelled = () =>
    page.evaluate(() => (window as unknown as { lastWheel?: boolean }).lastWheel)
  const watch = () =>
    page.evaluate(() =>
      window.addEventListener(
        'wheel',
        (e) =>
          setTimeout(() => {
            ;(window as unknown as { lastWheel?: boolean }).lastWheel = e.defaultPrevented
          }),
        true,
      ),
    )
  // short (the default tag card): the wheel zooms the image
  await ready(page)
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  const short = page.locator('[data-pin="a"] .gallerist-pin-card')
  await expect(short).toHaveAttribute('tabindex', '-1')
  await over('[data-pin="a"] .gallerist-pin-card')
  await page.mouse.wheel(0, -200)
  await expect.poll(async () => (await zoomState(page)).scale).toBeGreaterThan(1)
  // tall (a host card taller than a landscape phone's stage): the wheel scrolls it
  await page.setViewportSize({ width: 844, height: 390 })
  await ready(page, 'card=draft&presentation=comment')
  await watch()
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  const tall = page.locator('[data-pin="a"] .gallerist-pin-card')
  await expect(tall).toHaveAttribute('tabindex', '0')
  await over('[data-pin="a"] .gallerist-pin-card')
  await page.mouse.wheel(0, 120)
  await expect.poll(() => tall.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect.poll(cancelled).toBe(false)
  await page.waitForTimeout(300) // past the stage's wheel commit
  expect((await zoomState(page)).scale).toBe(1)
  // a pinch (ctrl+wheel) over it zooms the image, not the page
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -120)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await zoomState(page)).scale).toBeGreaterThan(1)
  await expect.poll(cancelled).toBe(true)
})

// A card is a scroll container, so the stage's touch-action: none stops at it: the card sets its own
// (none; a vertical pan while it scrolls), so a touch in it never pans or pinch-zooms the page.
test('a card keeps touches from panning or zooming the page (touch-action)', async ({ page }) => {
  const touch = (id: string) =>
    page
      .locator(`[data-pin="${id}"] .gallerist-pin-card`)
      .evaluate((el) => getComputedStyle(el).touchAction)
  await ready(page)
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  expect(await touch('a')).toBe('none')
  await page.setViewportSize({ width: 844, height: 390 })
  await ready(page, 'card=draft&presentation=comment')
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  await expect(page.locator('[data-pin="a"] .gallerist-pin-card')).toHaveAttribute('tabindex', '0')
  expect(await touch('a')).toBe('pan-y')
})

// The close button stays at the card's top inline-end corner as a tall card scrolls, and works there.
test('a scrolled card keeps its close button in view', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await ready(page, 'card=draft&presentation=comment')
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  const card = page.locator('[data-pin="a"] .gallerist-pin-card')
  const close = card.locator('.gallerist-pin-close')
  const at = async () => {
    const [c, b] = [await card.boundingBox(), await close.boundingBox()]
    if (!c || !b) throw new Error('missing box')
    return { top: b.y - c.y, end: c.x + c.width - (b.x + b.width) }
  }
  const before = await at()
  expect(before.top).toBeGreaterThanOrEqual(2)
  expect(before.top).toBeLessThanOrEqual(8)
  expect(before.end).toBeLessThanOrEqual(8)
  await card.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeGreaterThan(20)
  expect(await at()).toEqual(before)
  await close.click()
  await expect(card).toBeHidden()
})
