// The flat ("Row") rail as the reviewer preset draws it: the dividers between its groups, in every
// skin and both schemes. The fixture opens at group 2 of 12 (37 items in all).
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

const ROW = '/layout.html?preset=reviewer&display=flat'

const open = async (page: Page, query: string) => {
  await page.goto(`${ROW}&${query}`)
  await viewerSettled(page)
  await expect(
    page.locator('.gallerist-thumb-group + .gallerist-thumb-group').first(),
  ).toBeVisible()
}

// The divider's colour against what is painted under it (the first opaque background up the tree,
// else the viewer's backdrop), as a WCAG contrast ratio, with the hairline's beside it.
const dividerContrast = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('i')
    document.body.append(probe)
    const rgba = (color: string) => {
      probe.style.color = ''
      probe.style.color = color
      const m = getComputedStyle(probe)
        .color.match(/[\d.]+/g)
        ?.map(Number) ?? [0, 0, 0]
      return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1] as const
    }
    const group = document.querySelector(
      '.gallerist-thumb-group + .gallerist-thumb-group',
    ) as HTMLElement
    const root = group.closest('.gallerist') as HTMLElement
    let under = rgba(getComputedStyle(root).getPropertyValue('--gallerist-backdrop'))
    for (let el = group.parentElement; el && el !== root; el = el.parentElement) {
      const bg = rgba(getComputedStyle(el).backgroundColor)
      if (bg[3] === 1) {
        under = bg
        break
      }
    }
    const over = (c: readonly number[]) =>
      [0, 1, 2].map((k) => (c[k] ?? 0) * (c[3] ?? 1) + (under[k] ?? 0) * (1 - (c[3] ?? 1)))
    const lum = (c: number[]) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, k) => s + v * ([0.2126, 0.7152, 0.0722][k] ?? 0), 0)
    const ratio = (c: readonly number[]) => {
      const [a, b] = [lum(over(c)), lum(over(under))].sort((x, y) => y - x)
      return ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05)
    }
    const divider = rgba(getComputedStyle(group).borderInlineStartColor)
    const hairline = rgba(getComputedStyle(root).getPropertyValue('--gallerist-hairline'))
    probe.remove()
    return {
      divider: ratio(divider),
      hairline: ratio(hairline),
      same: `${divider}` === `${hairline}`,
    }
  })

for (const skin of ['gallery', 'console', 'editorial']) {
  test(`${skin}: the row's group dividers read clearly in the dark scheme, as before in the light`, async ({
    page,
  }) => {
    const skinQuery = skin === 'gallery' ? '' : `&skin=${skin}`
    await open(page, `scheme=dark${skinQuery}`)
    const dark = await dividerContrast(page)
    // lifted above the hairline (1.3–1.4:1, barely there), short of a border that shouts
    expect(dark.divider).toBeGreaterThan(1.85)
    expect(dark.divider).toBeLessThan(2.3)
    expect(dark.divider).toBeGreaterThan(dark.hairline + 0.4)

    await open(page, `scheme=light${skinQuery}`)
    const light = await dividerContrast(page)
    expect(light.same).toBe(true) // the light scheme keeps its hairline
  })
}

// ── pulling the rail: no scrollbar; drag, wheel, end fades and page buttons ─────────────────────
const rail = (page: Page) => page.locator('.gallerist-thumbs')
const counter = (page: Page) => page.locator('.gallerist-counter')
// how far the rail has scrolled from its start (right to left: scrollLeft runs negative)
const scrolled = (page: Page) => rail(page).evaluate((el) => Math.abs(Math.round(el.scrollLeft)))
const frames = (page: Page, n = 3) =>
  page.evaluate(async (n) => {
    for (let k = 0; k < n; k++) await new Promise((r) => requestAnimationFrame(r))
  }, n)

test.describe('pulling the row rail', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  const REVIEWER = 'skin=console&custom=short'

  test('no scrollbar; the band is still painted behind the strip', async ({ page }) => {
    await open(page, REVIEWER)
    const style = await rail(page).evaluate((el) => {
      const s = getComputedStyle(el)
      const region = getComputedStyle(el.parentElement as HTMLElement)
      return {
        scrollbar: 'scrollbarWidth' in s ? s.scrollbarWidth : 'none',
        gutter: el.offsetHeight - el.clientHeight,
        bg: s.backgroundColor,
        band: region.backgroundColor,
        rule: region.borderTopWidth,
      }
    })
    expect(style.scrollbar).toBe('none')
    expect(style.gutter).toBe(0)
    expect(style.bg).toBe('rgba(0, 0, 0, 0)')
    expect(style.band).not.toBe('rgba(0, 0, 0, 0)')
    expect(style.rule).toBe('1px')
  })

  test('a mouse drag scrolls it and never clicks; a click still selects', async ({ page }) => {
    await open(page, REVIEWER)
    await expect(counter(page)).toHaveText('2 / 37')
    const card = page.locator('.gallerist-thumb-item[data-item="g4i2"]')
    const box = await card.boundingBox()
    if (!box) throw new Error('no card')
    const before = await scrolled(page)
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + 20 - k * 25, box.y + 20)
    await expect(rail(page)).toHaveAttribute('data-gallerist-dragging', '')
    await page.mouse.up()
    await frames(page)
    expect((await scrolled(page)) - before).toBeGreaterThan(200)
    await expect(counter(page)).toHaveText('2 / 37') // the press on g4i2 didn't select it
    await expect(rail(page)).not.toHaveAttribute('data-gallerist-dragging', '')

    // a press that wobbles a pixel or two is still a click
    const other = page.locator('.gallerist-thumb-item[data-item="g5i1"]')
    const at = await other.boundingBox()
    if (!at) throw new Error('no card')
    await page.mouse.move(at.x + 20, at.y + 20)
    await page.mouse.down()
    await page.mouse.move(at.x + 22, at.y + 21)
    await page.mouse.up()
    await expect(page.locator('.gallerist-thumb-item[data-active]')).toHaveAttribute(
      'data-item',
      'g5i1',
    )
    await page.locator('.gallerist-thumb-item[data-item="g5i2"]').click()
    await expect(page.locator('.gallerist-thumb-item[data-active]')).toHaveAttribute(
      'data-item',
      'g5i2',
    )
  })

  test('a vertical wheel scrolls it sideways, and leaves the page alone at its start', async ({
    page,
  }) => {
    await open(page, `${REVIEWER}&g=0`)
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    expect(await scrolled(page)).toBe(0)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => scrolled(page)).toBeGreaterThan(250)
    await page.mouse.wheel(0, -1000)
    await expect.poll(() => scrolled(page)).toBe(0)
    await expect(counter(page)).toHaveText('1 / 37') // the wheel didn't navigate
  })

  test('its ends fade where there is more, and ‹ › page it on hover', async ({ page }) => {
    await open(page, `${REVIEWER}&g=0`)
    await expect(rail(page)).toHaveAttribute('data-gallerist-more-end', '')
    await expect(rail(page)).not.toHaveAttribute('data-gallerist-more-start', '')
    expect(await rail(page).evaluate((el) => getComputedStyle(el).maskImage)).toContain('gradient')
    const toEnd = page.locator('.gallerist-rail-page[data-dir="end"]')
    const toStart = page.locator('.gallerist-rail-page[data-dir="start"]')
    await expect(toStart).toBeHidden()
    await expect(toEnd).toHaveAttribute('aria-hidden', 'true')
    await expect(toEnd).toHaveAttribute('tabindex', '-1')
    await expect(toEnd).toHaveCSS('opacity', '0') // until the pointer is over the rail
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    await page.mouse.move(box.x + box.width / 2, box.y + 4)
    await expect(toEnd).toHaveCSS('opacity', '1')
    // at the rail's end (the right in this direction), level with it
    const b = await toEnd.boundingBox()
    expect((b?.x ?? 0) + (b?.width ?? 0)).toBeGreaterThan(box.x + box.width - 50)
    // a card near the end moves most of the rail's width towards the start (the rail re-windows as
    // it goes, so its scroll offset alone doesn't tell how far it moved)
    const width = await rail(page).evaluate((el) => el.clientWidth)
    const card = page.locator('.gallerist-thumb-item[data-item="g5i0"]')
    const x0 = (await card.boundingBox())?.x ?? 0
    await toEnd.click()
    await expect
      .poll(async () => Math.round(x0 - ((await card.boundingBox())?.x ?? 0)))
      .toBeGreaterThan(width * 0.8 - 6)
    expect(x0 - ((await card.boundingBox())?.x ?? 0)).toBeLessThan(width * 0.8 + 6)
    await expect(rail(page)).toHaveAttribute('data-gallerist-more-start', '')
    await expect(toStart).toBeVisible()
    await expect(page.locator('.gallerist')).toBeFocused() // the click took no focus
    await expect(page.locator('.gallerist-rail-page:focus')).toHaveCount(0)
    await toStart.click()
    // back where it started, give or take the subpixel the scroll lands on
    await expect
      .poll(async () => Math.abs(((await card.boundingBox())?.x ?? 0) - x0))
      .toBeLessThanOrEqual(1)
    await expect(toStart).toBeHidden()
    expect(await rail(page).evaluate((el) => Math.abs(el.scrollLeft))).toBeLessThanOrEqual(1)
  })

  test('‹ goes the whole page back to the start even when the next frame comes late', async ({
    page,
  }) => {
    await open(page, `${REVIEWER}&g=0`)
    // each click holds the page up 400ms, so the glide's first frame lands past its end: one step
    // the whole page, into the edge of the cards drawn so far
    await rail(page).evaluate(() => {
      for (const b of document.querySelectorAll('.gallerist-rail-page'))
        b.addEventListener('click', () => {
          const t = performance.now()
          while (performance.now() - t < 400) {}
        })
    })
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    await page.mouse.move(box.x + box.width / 2, box.y + 4)
    const toEnd = page.locator('.gallerist-rail-page[data-dir="end"]')
    const toStart = page.locator('.gallerist-rail-page[data-dir="start"]')
    await expect(toEnd).toHaveCSS('opacity', '1')
    const width = await rail(page).evaluate((el) => el.clientWidth)
    const card = page.locator('.gallerist-thumb-item[data-item="g5i0"]')
    const x0 = (await card.boundingBox())?.x ?? 0
    await toEnd.click()
    await expect
      .poll(async () => Math.round(x0 - ((await card.boundingBox())?.x ?? 0)))
      .toBeGreaterThan(width * 0.8 - 6)
    await toStart.click()
    await expect
      .poll(async () => Math.abs(((await card.boundingBox())?.x ?? 0) - x0))
      .toBeLessThanOrEqual(1)
    await expect(toStart).toBeHidden()
  })

  test('› and ‹ go the whole page and no further when the page’s CSS scrolls the rail smoothly', async ({
    page,
  }) => {
    await open(page, `${REVIEWER}&g=0`)
    // a host's stylesheet (a smooth scroll would still read its old offset right after each step)
    await page.addStyleTag({ content: '.gallerist .gallerist-thumbs { scroll-behavior: smooth }' })
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    await page.mouse.move(box.x + box.width / 2, box.y + 4)
    const toEnd = page.locator('.gallerist-rail-page[data-dir="end"]')
    const toStart = page.locator('.gallerist-rail-page[data-dir="start"]')
    await expect(toEnd).toHaveCSS('opacity', '1')
    const width = await rail(page).evaluate((el) => el.clientWidth)
    const card = page.locator('.gallerist-thumb-item[data-item="g5i0"]')
    const x0 = (await card.boundingBox())?.x ?? 0
    const moved = async () => x0 - ((await card.boundingBox())?.x ?? 0)
    await toEnd.click()
    await expect.poll(moved).toBeGreaterThan(width * 0.8 - 6)
    // past the glide and any frames it could carry on for: still where the page took it
    await page.waitForTimeout(1000)
    expect(await moved()).toBeLessThan(width * 0.8 + 6)
    await toStart.click()
    await expect.poll(async () => Math.abs(await moved())).toBeLessThanOrEqual(1)
    await expect(toStart).toBeHidden()
  })

  test('right to left: the drag, the wheel and the buttons run the other way', async ({ page }) => {
    await open(page, `${REVIEWER}&g=0&dir=rtl`)
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    const toEnd = page.locator('.gallerist-rail-page[data-dir="end"]')
    await page.mouse.move(box.x + box.width / 2, box.y + 4)
    const b = await toEnd.boundingBox()
    expect(b?.x ?? 999).toBeLessThan(box.x + 50) // the end is on the left
    const card = page.locator('.gallerist-thumb-item[data-item="g5i0"]')
    const x0 = (await card.boundingBox())?.x ?? 0
    await toEnd.click()
    await expect
      .poll(async () => Math.round(((await card.boundingBox())?.x ?? 0) - x0))
      .toBeGreaterThan(box.width * 0.8 - 30)
    // the wheel back up to the start (over a page button, the wheel is the rail's too)
    for (let k = 0; k < 4; k++) await page.mouse.wheel(0, -1000)
    await expect.poll(() => scrolled(page)).toBe(0)
    // dragging right pulls in what's to the left: towards the end
    await page.mouse.move(box.x + 300, box.y + box.height - 20)
    await page.mouse.down()
    for (let k = 1; k <= 8; k++)
      await page.mouse.move(box.x + 300 + k * 25, box.y + box.height - 20)
    await page.mouse.up()
    await frames(page)
    expect(await rail(page).evaluate((el) => el.scrollLeft)).toBeLessThan(-150)
    await expect(counter(page)).toHaveText('1 / 37')
  })

  test('the keys still bring the current card into view', async ({ page }) => {
    await open(page, `${REVIEWER}&g=0`)
    await page.locator('.gallerist').focus()
    for (let k = 0; k < 20; k++) await page.keyboard.press('ArrowRight')
    await expect(counter(page)).toHaveText('21 / 37')
    await expect(page.locator('.gallerist-thumb-item[data-active]')).toBeInViewport({ ratio: 1 })
    await expect(rail(page)).toHaveAttribute('data-gallerist-more-start', '')
  })

  test('a stacked rail pulls the same way', async ({ page }) => {
    await page.goto('/layout.html?skin=console&g=0')
    await viewerSettled(page)
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    await page.setViewportSize({ width: 600, height: 720 })
    await frames(page, 4)
    await expect(rail(page)).toHaveAttribute('data-gallerist-more-end', '')
    const again = await rail(page).boundingBox()
    if (!again) throw new Error('no rail')
    await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2)
    await page.mouse.wheel(0, 200)
    await expect.poll(() => scrolled(page)).toBeGreaterThan(150)
  })
})

// ── long group labels: a time range over a one-item group ─────────────────────────────────────
// Every label shown whole (or, past the cap, cut with an ellipsis and whole in its title), inside its
// own group, clear of the next group's divider.
const labels = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-group')].flatMap((group) => {
      const cap = group.querySelector<HTMLElement>('.gallerist-thumb-group-cap')
      if (!cap || cap.hidden) return []
      const next = group.nextElementSibling
      const c = cap.getBoundingClientRect()
      const g = group.getBoundingClientRect()
      return [
        {
          text: cap.textContent ?? '',
          title: cap.title,
          cut: cap.scrollWidth > cap.clientWidth + 1,
          inGroup: c.left >= g.left - 0.5 && c.right <= g.right + 0.5,
          // the next group's divider is its inline-start border
          clear: !next || c.right <= next.getBoundingClientRect().left + 0.5,
          ltr: getComputedStyle(group).direction === 'ltr',
        },
      ]
    }),
  )

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`${name}: a time range over a one-item group shows whole, clear of the next divider`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await open(page, 'skin=console&one=1&time=range&g=0')
    const seen = await labels(page)
    expect(seen.length).toBeGreaterThan(1)
    for (const l of seen) {
      expect(l.text).toMatch(/^\d\d:\d\d – \d\d:\d\d am$/)
      expect(l, l.text).toMatchObject({ cut: false, inGroup: true, clear: true })
      expect(l.title).toBe('') // whole: no title to repeat it
    }
  })
}

test('right to left: the same, mirrored', async ({ page }) => {
  await open(page, 'skin=console&one=1&time=range&g=0&dir=rtl')
  const seen = await labels(page)
  for (const l of seen) {
    expect(l.ltr).toBe(false)
    // in RTL the next group sits to the left: check against its right edge instead
    expect(l, l.text).toMatchObject({ cut: false, inGroup: true })
  }
  const clear = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-group')].every((group) => {
      const cap = group.querySelector<HTMLElement>('.gallerist-thumb-group-cap')
      const next = group.nextElementSibling
      if (!cap || cap.hidden || !next) return true
      return cap.getBoundingClientRect().left >= next.getBoundingClientRect().right - 0.5
    }),
  )
  expect(clear).toBe(true)
})

test('a label longer than the cap ends in an ellipsis, whole in its title', async ({ page }) => {
  await open(page, 'skin=console&time=long&g=0')
  const seen = await labels(page)
  expect(seen.length).toBeGreaterThan(1)
  for (const l of seen) expect(l, l.text).toMatchObject({ cut: true, inGroup: true, clear: true })
  // its title is set as the pointer comes over it, while it is cut
  const cap = page.locator('.gallerist-thumb-group-cap:visible').first()
  await cap.hover()
  await expect(cap).toHaveAttribute('title', /Weekly review of the dashboard/)
})

test('down a side rail, a long label stays within the rail', async ({ page }) => {
  await open(page, 'skin=console&one=1&time=range&g=0&rail=left')
  const fits = await page.evaluate(() => {
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    return rail.scrollWidth <= rail.clientWidth + 1
  })
  expect(fits).toBe(true)
  for (const l of await labels(page)) expect(l.inGroup).toBe(true)
})

// A press that ends off the strip before it was a drag (no pointer capture yet, so its pointerup
// lands elsewhere): the next hover must not drag the rail, and a click must still select.
test.describe('a press released off the row rail', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  const REVIEWER = 'skin=console&custom=short'
  const active = (page: Page) =>
    page.locator('.gallerist-thumb-item[data-active]').getAttribute('data-item')

  const hoverAndClick = async (page: Page) => {
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    const before = await scrolled(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
    await page.mouse.move(box.x + box.width / 2 - 250, box.y + box.height / 2, { steps: 10 })
    await frames(page)
    expect(await scrolled(page)).toBe(before) // a hover doesn't drag
    await expect(rail(page)).not.toHaveAttribute('data-gallerist-dragging', '')
    for (const n of [2, 1]) {
      const card = page.locator('.gallerist-thumb-item:not([data-active])').nth(n)
      const id = await card.getAttribute('data-item')
      await card.click()
      await expect.poll(() => active(page)).toBe(id)
    }
  }

  test('above the rail: the hover after it does not drag, and clicks still select', async ({
    page,
  }) => {
    await open(page, REVIEWER)
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    const x = box.x + box.width / 2
    await page.mouse.move(x, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(x, box.y - 60) // one step out, past the slop but across the rail
    await page.mouse.up()
    await hoverAndClick(page)
  })

  test('above the rail, then a press on the stage dragged along it: no drag', async ({ page }) => {
    await open(page, REVIEWER)
    const box = await page.locator('.gallerist-thumb-item:not([data-active])').nth(3).boundingBox()
    if (!box) throw new Error('no card')
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 2, y - 2) // short of a drag
    await page.mouse.move(x + 2, box.y - 200) // straight up off the rail (across it), onto the stage
    await page.mouse.up()
    await page.mouse.down() // a new press, on the stage
    const before = await scrolled(page)
    await page.mouse.move(x + 2, y) // down onto the rail, then along it
    for (let k = 1; k <= 6; k++) await page.mouse.move(x + 2 - k * 30, y)
    await frames(page)
    expect(await scrolled(page)).toBe(before)
    await expect(rail(page)).not.toHaveAttribute('data-gallerist-dragging', '')
    await page.mouse.up()
    await hoverAndClick(page)
  })

  test('on a page button beside the card it started on: the same', async ({ page }) => {
    await open(page, `${REVIEWER}&g=0`)
    const box = await rail(page).boundingBox()
    if (!box) throw new Error('no rail')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const btn = page.locator('.gallerist-rail-page[data-dir="end"]')
    await expect(btn).toHaveCSS('opacity', '1')
    const b = await btn.boundingBox()
    if (!b) throw new Error('no button')
    const y = b.y + b.height / 2
    await page.mouse.move(b.x - 2, y) // on a card, just beside the button
    await page.mouse.down()
    await page.mouse.move(b.x + 2, y) // 4px: onto the button
    await page.mouse.up()
    await hoverAndClick(page)
  })
})

test('a focused thumb in a cluster shows its whole ring over its neighbours', async ({ page }) => {
  await page.goto('/hooks.html')
  await expect(page.locator('.gallerist[data-gallerist-phase="open"]')).toBeVisible()
  const thumb = page.locator('.gallerist-thumb-item[data-cluster="in"]').first()
  await thumb.focus()
  await page.keyboard.press('Shift') // keyboard modality: :focus-visible
  await thumb.focus()
  expect(await thumb.evaluate((el) => getComputedStyle(el).zIndex)).toBe('1')
})
