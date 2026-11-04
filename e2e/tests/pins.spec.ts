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
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height }
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
  // a host's textarea is a scroll container of its own: a vertical pan, never a page pinch-zoom
  await page.setViewportSize({ width: 1280, height: 720 })
  await ready(page, 'card=note&presentation=comment')
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  expect(
    await page
      .locator('[data-pin="a"] .gallerist-pin-card')
      .getByLabel('Note')
      .evaluate((el) => getComputedStyle(el).touchAction),
  ).toBe('pan-y')
})

// A short card whose host textarea scrolls: a wheel over the textarea scrolls it (the stage, which
// cancels the wheel and zooms, doesn't get it); a pinch (ctrl+wheel) there still zooms the image.
// Also inside a web component's shadow root, where the card sees the wheel retargeted to the host.
for (const kind of ['note', 'shadow']) {
  test(`a wheel over a scrolling textarea in a short card scrolls it; a pinch zooms the image (${kind})`, async ({
    page,
  }) => {
    await ready(page, `card=${kind}&presentation=comment`)
    await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
    const card = page.locator('[data-pin="a"] .gallerist-pin-card')
    await expect(card).toHaveAttribute('tabindex', '-1') // the card fits: only the textarea scrolls
    const note = card.getByLabel('Note')
    const b = await note.boundingBox()
    if (!b) throw new Error('no textarea box')
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.wheel(0, 120)
    await expect.poll(() => note.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await page.waitForTimeout(300) // past the stage's wheel commit
    expect((await zoomState(page)).scale).toBe(1)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')
    await expect.poll(async () => (await zoomState(page)).scale).toBeGreaterThan(1)
  })
}

// A host card returned unwrapped (a DocumentFragment) lays out as it would on the page: inline
// siblings share a line, a button keeps its own width, a first paragraph keeps its top margin. The
// close button comes first (DOM, reading and tab order match what is drawn) and stays on top of a
// positioned host element under it.
test('a host fragment lays out as on the page; the close button is first and on top', async ({
  page,
}) => {
  await ready(page, 'card=frag&presentation=comment')
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  const card = page.locator('[data-pin="a"] .gallerist-pin-card')
  await expect(card).toBeVisible()
  const box = async (sel: string, n = 0) => {
    const r = await card.locator(sel).nth(n).boundingBox()
    if (!r) throw new Error(`no box for ${sel}`)
    return r
  }
  const [one, two, go] = [await box('.inline'), await box('.inline', 1), await box('button', 1)]
  // one line: the three overlap vertically, in order
  expect(Math.max(one.y, two.y, go.y)).toBeLessThan(
    Math.min(one.y + one.height, two.y + two.height, go.y + go.height),
  )
  expect(one.x < two.x && two.x < go.x).toBe(true)
  const inner = await card.evaluate((el) => {
    const s = getComputedStyle(el)
    return el.clientWidth - Number.parseFloat(s.paddingLeft) - Number.parseFloat(s.paddingRight)
  })
  expect(go.width).toBeLessThan(inner / 2) // not stretched to the card's width
  // the lead's top margin is its own (the close button's -20px cancels its own height)
  const lead = await card.locator('.lead').evaluate((el) => {
    const c = el.parentElement as HTMLElement
    const s = getComputedStyle(c)
    return {
      top: el.getBoundingClientRect().top - c.getBoundingClientRect().top,
      want:
        c.clientTop +
        Number.parseFloat(s.paddingTop) +
        Number.parseFloat(getComputedStyle(el).marginTop),
    }
  })
  expect(Math.abs(lead.top - lead.want)).toBeLessThan(0.5)
  expect(await card.evaluate((el) => el.firstElementChild?.className)).toBe('gallerist-pin-close')
  // the positioned lead runs under ×: × still paints on top and takes the click
  const close = await box('.gallerist-pin-close')
  const hit = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.gallerist-pin-close'),
    { x: close.x + close.width / 2, y: close.y + close.height / 2 },
  )
  expect(hit).toBe(true)
  await page.mouse.click(close.x + close.width / 2, close.y + close.height / 2)
  await expect(card).toBeHidden()
})

// No card scrolls sideways (the close button sat 4px past its content box): short and tall, a host
// fragment, LTR and RTL. A classic scrollbar would show, and the 4px could flip the card's tabindex.
for (const dir of ['ltr', 'rtl']) {
  test(`a card doesn't scroll sideways (${dir})`, async ({ page }) => {
    for (const [query, size] of [
      ['presentation=tag', { width: 1280, height: 720 }],
      ['card=frag&presentation=comment', { width: 1280, height: 720 }],
      ['card=note&presentation=comment', { width: 1280, height: 720 }],
      ['card=draft&presentation=comment', { width: 844, height: 390 }],
    ] as const) {
      await page.setViewportSize(size)
      await ready(page, `${query}&dir=${dir}`)
      for (const id of ['a', 'b']) {
        await page.locator(`[data-pin="${id}"] .gallerist-pin-marker`).click()
        const card = page.locator(`[data-pin="${id}"] .gallerist-pin-card`)
        await expect(card).toBeVisible()
        const [sw, cw] = await card.evaluate((el) => [el.scrollWidth, el.clientWidth])
        expect(sw, `${query} ${id}`).toBeLessThanOrEqual(cw as number)
        await page.keyboard.press('Escape') // a tall card can cover the next pin
      }
    }
  })
}

// An empty card (a host's, filled later; a default card for a pin with nothing to show), or one with
// a few px of contents: × fits inside it, so it never scrolls. Before, × overflowed it, the fade's
// 12px then read as nothing to scroll, and each flip resized the card: the observer placed it again
// every frame, the fade flickered and the card dropped in and out of the tab order.
test('an empty card stays still: its tabindex and fade hold, it is not placed again', async ({
  page,
}) => {
  for (const h of [0, 6]) {
    await ready(page, `card=empty&h=${h}&presentation=comment`)
    await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
    const card = page.locator('[data-pin="a"] .gallerist-pin-card')
    await expect(card).toBeVisible()
    const seen = await card.evaluate(async (el) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r))
      for (let k = 0; k < 3; k++) await frame()
      // placeCard writes the card's style and tabindex: any write while nothing changes is a loop
      let writes = 0
      const watch = new MutationObserver((list) => {
        writes += list.length
      })
      watch.observe(el, { attributes: true, attributeFilter: ['style', 'tabindex'] })
      const states = new Set<string>()
      for (let k = 0; k < 12; k++) {
        await frame()
        states.add(`${el.getAttribute('tabindex')} ${getComputedStyle(el, '::after').content}`)
      }
      watch.disconnect()
      return { writes, states: [...states], over: el.scrollHeight - el.clientHeight }
    })
    expect(seen, `h=${h}`).toEqual({ writes: 0, states: ['-1 none'], over: 0 })
  }
})

// Forced colours (Windows High Contrast): the box-shadow bands are dropped, the ring's outline stays;
// a scrolling card's fade (a gradient) is not drawn.
test('forced colours: the pin keeps its focus outline; no fade on a scrolling card', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'forced-colors emulation is Chromium-only')
  await page.emulateMedia({ forcedColors: 'active' })
  await page.setViewportSize({ width: 844, height: 390 })
  await ready(page, 'card=draft&presentation=comment')
  const marker = page.locator('[data-pin="b"] .gallerist-pin-marker')
  await marker.focus()
  const ring = await marker
    .locator('.gallerist-pin-dot')
    .evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth])
  expect(ring).toEqual(['solid', '2px'])
  await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
  const card = page.locator('[data-pin="a"] .gallerist-pin-card')
  await expect(card).toHaveAttribute('tabindex', '0')
  expect(await card.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none')
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

// Screen pixels of a page area (CSS px), decoded in the page: rgb triples, row by row.
const pixels = async (
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
) => {
  const png = await page.screenshot({ clip, scale: 'css', animations: 'disabled' })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d') as CanvasRenderingContext2D
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const rows: Array<Array<[number, number, number]>> = []
    for (let y = 0; y < c.height; y++) {
      const row: Array<[number, number, number]> = []
      for (let x = 0; x < c.width; x++) {
        const k = (y * c.width + x) * 4
        row.push([d[k] as number, d[k + 1] as number, d[k + 2] as number])
      }
      rows.push(row)
    }
    return rows
  }, png.toString('base64'))
}
// WCAG relative luminance and contrast ratio
const luminance = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// A pin sits on the image, so its focus ring needs 3:1 against whatever is under it (WCAG 2.2 1.4.11
// Non-text Contrast; 2.4.13 Focus Appearance at AAA): the skin's focus colour alone vanishes on media
// of its own lightness (Console's #f5f6f7 ring on a light screenshot, Apploye). For white, black and
// mid-grey media and media of the skin's own focus colour, in every skin and scheme, for both
// presentations: the pixels focus changes (a screenshot before and after) hold a solid band at least
// 2px wide at 3:1 or more against the media, on each side of the dot (rays right, left, down and up,
// each sampled on 5 neighbouring lines, so a fractional position or an anti-aliased edge can't decide
// it). The dot's own static ring doesn't count: it doesn't change. Every case is checked and every
// failure listed.
const rgbOf = (page: Page, color: string) =>
  page.evaluate((c) => {
    const el = document.createElement('i')
    el.style.color = c
    document.body.append(el)
    const m = getComputedStyle(el).color.match(/\d+/g)?.map(Number) ?? []
    el.remove()
    return m.slice(0, 3) as [number, number, number]
  }, color)
for (const look of [
  'skin=gallery',
  'skin=gallery&scheme=light',
  'skin=console',
  'skin=console&scheme=light',
  'skin=editorial',
  'skin=editorial&scheme=dark',
]) {
  test(`a focused pin's ring stands out on any media (${look})`, async ({ page }) => {
    await ready(page, look)
    const focus = await page
      .locator('.gallerist')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--gallerist-focus').trim())
    const failures: string[] = []
    for (const bg of ['white', 'black', '#808080', '#a0a0a0', focus]) {
      for (const presentation of ['tag', 'comment']) {
        const at = `${bg === focus ? `focus ${focus}` : bg} ${presentation}`
        await ready(page, `${look}&bg=${encodeURIComponent(bg)}&presentation=${presentation}`)
        const marker = page.locator('[data-pin="b"] .gallerist-pin-marker')
        const dot = await dotOf(page, 'b')
        const pad = 20
        const clip = {
          x: Math.floor(dot.cx - dot.w / 2 - pad),
          y: Math.floor(dot.cy - dot.h / 2 - pad),
          width: Math.ceil(dot.w + 2 * pad),
          height: Math.ceil(dot.h + 2 * pad),
        }
        const off = await pixels(page, clip)
        await marker.focus()
        if (!(await marker.evaluate((el) => el.matches(':focus-visible'))))
          failures.push(`${at}: no :focus-visible`)
        const on = await pixels(page, clip)
        // the media: the clip's corner, 20px out from the dot's box (past its drop shadow)
        const media = off[0]?.[0] as [number, number, number]
        const expected = await rgbOf(page, bg)
        if (contrast(media, expected) >= 1.1) failures.push(`${at}: media is ${media}`)
        const cx = dot.cx - clip.x
        const cy = dot.cy - clip.y
        for (const [dx, dy, half] of [
          [1, 0, dot.w / 2],
          [-1, 0, dot.w / 2],
          [0, 1, dot.h / 2],
          [0, -1, dot.h / 2],
        ] as const) {
          // the longest solid run on any of the 5 lines: changed by focus and at 3:1 against the media
          let best = 0
          for (let o = -2; o <= 2; o++) {
            let run = 0
            for (let t = Math.floor(half) - 2; t <= Math.ceil(half) + 14; t++) {
              const x = Math.floor(cx + dx * t + dy * o)
              const y = Math.floor(cy + dy * t + dx * o)
              const p = on[y]?.[x]
              const q = off[y]?.[x]
              const solid =
                !!p &&
                !!q &&
                Math.max(...p.map((v, k) => Math.abs(v - (q[k] as number)))) > 16 &&
                contrast(p, media) >= 3
              run = solid ? run + 1 : 0
              best = Math.max(best, run)
            }
          }
          if (best < 2) failures.push(`${at}: ${dx},${dy} band ${best}px`)
        }
      }
    }
    expect(failures).toEqual([])
  })
}

// A card that scrolls says there's more below (touch screens show no scrollbar): at the top of its
// scroll its contents fade out at its bottom edge; at the end the fade covers nothing (the last
// button looks as it does without the fade, and takes the click). In every skin, in LTR and RTL.
for (const look of ['skin=gallery', 'skin=console', 'skin=editorial&scheme=light']) {
  for (const dir of ['ltr', 'rtl']) {
    test(`a scrolling card fades at its bottom edge until its end (${look}, ${dir})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 844, height: 390 })
      await ready(page, `card=draft&presentation=comment&${look}&dir=${dir}`)
      await page.locator('[data-pin="a"] .gallerist-pin-marker').click()
      const card = page.locator('[data-pin="a"] .gallerist-pin-card')
      await expect(card).toHaveAttribute('tabindex', '0')
      // runs a measure with the fade hidden
      const unfaded = async <T>(measure: () => Promise<T>) => {
        const style = await page.addStyleTag({
          content: '.gallerist-pin-card::after { visibility: hidden !important }',
        })
        const value = await measure()
        await style.evaluate((el) => el.remove())
        return value
      }
      // the fade spans the card without widening what it scrolls
      const wide = () => card.evaluate((el) => el.scrollWidth)
      expect(await wide()).toBe(await unfaded(wide))
      const c = await card.boundingBox()
      if (!c) throw new Error('no card box')
      // the painted difference the fade makes in an area (max channel delta)
      const fadeIn = async (clip: { x: number; y: number; width: number; height: number }) => {
        const on = await pixels(page, clip)
        const off = await unfaded(() => pixels(page, clip))
        let max = 0
        on.forEach((row, y) =>
          row.forEach((px, x) => {
            const q = off[y]?.[x] ?? px
            max = Math.max(max, ...px.map((v, k) => Math.abs(v - (q[k] as number))))
          }),
        )
        return max
      }
      const bottom = { x: c.x + 2, y: c.y + c.height - 8, width: c.width - 4, height: 6 }
      expect(await fadeIn(bottom)).toBeGreaterThanOrEqual(8)
      await card.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect
        .poll(() => card.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1))
        .toBe(true)
      const discard = card.getByRole('button', { name: 'Discard' })
      const b = await discard.boundingBox()
      if (!b) throw new Error('no button box')
      expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height)
      expect(await fadeIn(b)).toBeLessThanOrEqual(1)
      // nothing over the button: its bottom edge hits it
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent, {
        x: b.x + b.width / 2,
        y: b.y + b.height - 1,
      })
      expect(hit).toBe('Discard')
      await discard.click()
      await expect(card).toBeHidden()
    })
  }
}
