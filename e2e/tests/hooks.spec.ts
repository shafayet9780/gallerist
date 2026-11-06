// The host hooks as a time tracker's reviewer uses them (e2e/app/hooks.ts): group meta on the label
// line (flat) and under the card (stacked), monitor badges, capture clusters, a manual-time marker
// between groups, refreshRail() after a note, a notes popover from the caption that takes Escape
// first and rises over the stage, keys typed in it left alone, and the phone toolbar.
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

const open = async (page: Page, query = '') => {
  await page.goto(`/hooks.html?${query}`)
  await viewerSettled(page)
  await expect(page.locator('.gallerist-thumb-item').first()).toBeVisible()
}
const box = async (page: Page, sel: string) => {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`no box for ${sel}`)
  return b
}
const cursor = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { viewer: { getState(): { cursor: { g: number; i: number } } } }
      ).viewer.getState().cursor,
  )
const phase = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { viewer: { getState(): { phase: string } } }).viewer.getState().phase,
  )

for (const dir of ['ltr', 'rtl'] as const) {
  test(`flat: the meta ends the label line and the group fits both, ${dir}`, async ({ page }) => {
    await open(page, `dir=${dir}`)
    // the groups the drawn run doesn't cut
    const groups = await page
      .locator('.gallerist-thumb-group:not([data-partial-start], [data-partial-end])')
      .evaluateAll(
        (els, dir) =>
          els.map((g) => {
            const head = g.querySelector('.gallerist-thumb-group-head') as HTMLElement
            const cap = head.querySelector('.gallerist-thumb-group-cap') as HTMLElement
            const meta = head.querySelector('.gallerist-thumb-meta') as HTMLElement
            const row = g.querySelector('.gallerist-thumb-group-row') as HTMLElement
            const r = (el: Element) => el.getBoundingClientRect()
            // the items' extent (the row itself stretches to the group's width)
            const rs = [...row.children].map(r)
            const left = Math.min(...rs.map((q) => q.left))
            const right = Math.max(...rs.map((q) => q.right))
            const content = { left, right, width: right - left }
            return {
              cut: cap.scrollWidth > cap.clientWidth + 1,
              start: dir === 'rtl' ? r(cap).right - content.right : r(cap).left - content.left,
              end: dir === 'rtl' ? content.left - r(meta).left : r(meta).right - content.right,
              headFits: r(head).width <= r(g).width + 0.5,
              line: Math.abs(r(cap).top + r(cap).height / 2 - (r(meta).top + r(meta).height / 2)),
              apart: dir === 'rtl' ? r(cap).left - r(meta).right : r(meta).left - r(cap).right,
              widened: r(head).width > content.width + 0.5,
            }
          }),
        dir,
      )
    expect(groups.length).toBeGreaterThan(3)
    for (const g of groups) {
      expect(g.cut).toBe(false) // the label shows whole
      expect(g.headFits).toBe(true)
      expect(g.line).toBeLessThan(2) // one line
      expect(g.apart).toBeGreaterThanOrEqual(7) // the meta after the label, clear of it
      expect(Math.abs(g.start)).toBeLessThan(1) // the label at the group's start…
      // …the meta at its end: the row's end, or past it where the label line widens the group
      if (!g.widened) expect(Math.abs(g.end)).toBeLessThan(1)
    }
    expect(groups.some((g) => g.widened)).toBe(true) // a one-capture group grows for its line
    // its text joins the group's name
    await expect(
      page.getByRole('group', { name: 'Group 2, 11:00 – 11:10, 2 notes, Activity 64%' }),
    ).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Group 3, 11:10 – 11:20, Idle' })).toHaveCount(1)
  })
}

test('stacked: the meta sits under each card at its width, the note count on its label', async ({
  page,
}) => {
  await open(page, 'display=stacked')
  const cards = await page.locator('.gallerist-thumb-wrap').evaluateAll((els) =>
    els.map((w) => {
      const card = w.querySelector('.gallerist-thumb') as HTMLElement
      const meta = w.querySelector(':scope > .gallerist-thumb-meta') as HTMLElement
      const c = card.getBoundingClientRect()
      const m = meta.getBoundingClientRect()
      return {
        width: Math.abs(m.width - c.width),
        below: m.top - c.bottom,
        left: Math.abs(m.left - c.left),
      }
    }),
  )
  expect(cards.length).toBeGreaterThan(3)
  for (const c of cards) {
    expect(c.width).toBeLessThan(1)
    expect(c.left).toBeLessThan(1)
    expect(c.below).toBeGreaterThanOrEqual(0)
    expect(c.below).toBeLessThan(10)
  }
  await expect(page.locator('[data-group="tf60"] .gallerist-thumb-time .hk-notes')).toHaveText(
    '✉ 2',
  )
  await expect(
    page.getByRole('option', { name: 'Group 2, 11:00 – 11:10, 2 notes, Activity 64%' }),
  ).toHaveCount(1)
})

// A stacked time label longer than its card (a range with the note count at its end) runs past the
// card: its column widens, so the label shows whole and ends a rail gap before the next card's (or
// the marker's) label; no title while it isn't cut. RTL mirrors it, a phone does the same, and a side
// rail keeps it to the rail's width (cut, the whole label in its title on hover).
const labels = (page: Page) =>
  page.evaluate(() => {
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const rtl = getComputedStyle(rail).direction === 'rtl'
    const W = document.documentElement.clientWidth
    const x = (el: Element): [number, number] => {
      const r = el.getBoundingClientRect()
      return rtl ? [W - r.right, W - r.left] : [r.left, r.right]
    }
    const hosts = [...rail.children].filter((el) =>
      el.matches('.gallerist-thumb-wrap, .gallerist-rail-marker'),
    )
    return {
      gap: Number.parseFloat(getComputedStyle(rail).columnGap),
      hosts: hosts.map((h) => {
        const label = h.querySelector(
          '.gallerist-thumb-time, .gallerist-rail-marker-cap',
        ) as Element
        const text = h.querySelector('.gallerist-thumb-time-text')
        return {
          id: (h as HTMLElement).dataset.group ?? 'marker',
          card: x(h.querySelector('.gallerist-thumb, .gallerist-rail-marker-body') as Element),
          label: x(label),
          cut: !!text && text.scrollWidth > text.clientWidth,
        }
      }),
    }
  })

for (const [name, query, width] of [
  ['ltr', 'display=stacked', 1280],
  ['rtl', 'display=stacked&dir=rtl', 1280],
  ['console', 'display=stacked&skin=console', 1280],
  ['phone', 'display=stacked', 390],
] as const) {
  test(`stacked: a long time label runs past its card, clear of the next label, ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    // (a phone shows no item column: the cards are what to wait for)
    await page.goto(`/hooks.html?${query}`)
    await viewerSettled(page)
    await expect(page.locator('.gallerist-thumb-wrap').first()).toBeVisible()
    const { gap, hosts } = await labels(page)
    expect(hosts.length).toBeGreaterThan(4)
    hosts.forEach((h, k) => {
      expect(h.cut, `${h.id}: cut`).toBe(false)
      expect(Math.abs(h.label[0] - h.card[0]), `${h.id}: starts with its card`).toBeLessThan(0.5)
      expect(h.label[1], `${h.id}: ends at or past its card`).toBeGreaterThan(h.card[1] - 0.5)
      const next = hosts[k + 1]
      if (next)
        expect(next.label[0] - h.label[1], `${h.id}: clear of the next`).toBeGreaterThan(gap - 0.5)
    })
    // the label with the note count is the one longer than its card
    const notes = hosts.find((h) => h.id === 'tf60')
    expect((notes?.label[1] ?? 0) - (notes?.card[1] ?? 0)).toBeGreaterThan(8)
    const label = page.locator('[data-group="tf60"] .gallerist-thumb-time')
    await label.hover()
    await expect(label).not.toHaveAttribute('title')
  })
}

test('stacked: past three card heights a time label ends in an ellipsis, whole in its title', async ({
  page,
}) => {
  await open(page, 'display=stacked')
  const long = await page.evaluate(() => {
    const label = document.querySelector('[data-group="tf60"] .gallerist-thumb-time') as HTMLElement
    const text = label.querySelector('.gallerist-thumb-time-text') as HTMLElement
    text.textContent = 'Monday 3 November, 11:00 am to 11:10 am'
    const h = Number.parseFloat(getComputedStyle(label).getPropertyValue('--gallerist-thumb-h'))
    return {
      width: label.getBoundingClientRect().width,
      cap: 3 * h,
      cut: text.scrollWidth > text.clientWidth,
    }
  })
  expect(long.cut).toBe(true)
  expect(Math.abs(long.width - long.cap)).toBeLessThan(0.5)
  const label = page.locator('[data-group="tf60"] .gallerist-thumb-time')
  await label.hover()
  await expect(label).toHaveAttribute('title', '11:00 – 11:10')
})

test('stacked down a side rail: a time label keeps to the rail, cut, whole in its title', async ({
  page,
}) => {
  await open(page, 'display=stacked&preset=contact')
  const { hosts } = await labels(page)
  const notes = hosts.find((h) => h.id === 'tf60')
  expect(notes).toBeTruthy()
  for (const h of hosts) if (h.id !== 'marker') expect(h.label[1]).toBeLessThan(h.card[1] + 0.5)
  expect(notes?.cut).toBe(true)
  const label = page.locator('[data-group="tf60"] .gallerist-thumb-time')
  await label.hover()
  await expect(label).toHaveAttribute('title', '11:00 – 11:10')
})

for (const display of ['flat', 'stacked'] as const) {
  test(`monitor badges: in the top end corner, named, clear of the number, ${display}`, async ({
    page,
  }) => {
    await open(page, `display=${display}`)
    const thumbs = await page.locator('.gallerist-thumb-item').evaluateAll((els) =>
      els.map((t) => {
        const b = (t.querySelector('.gallerist-thumb-badge') as HTMLElement).getBoundingClientRect()
        const r = t.getBoundingClientRect()
        const num = t.querySelector('.gallerist-thumb-num')?.getBoundingClientRect()
        return {
          inside: b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom,
          corner: r.right - b.right < 8 && b.top - r.top < 8,
          clear: !num || num.right <= b.left || num.bottom <= b.top,
        }
      }),
    )
    expect(thumbs.length).toBeGreaterThan(3)
    for (const t of thumbs) expect(t).toEqual({ inside: true, corner: true, clear: true })
    // the badge's name joins the thumb's
    await expect(page.locator('.gallerist-thumb-item[data-active]')).toHaveAccessibleName(
      'Item 2, Monitor 2',
    )
  })
}

test('clusters: the screens of one capture 2px apart, 8px between captures (row and column)', async ({
  page,
}) => {
  const gaps = (sel: string, vertical: boolean) =>
    page.locator(sel).evaluateAll(
      (els, v) =>
        els.slice(1).map((el, k) => {
          const a = (els[k] as HTMLElement).getBoundingClientRect()
          const b = el.getBoundingClientRect()
          const rtl = document.dir === 'rtl'
          return Math.round(v ? b.top - a.bottom : rtl ? a.left - b.right : b.left - a.right)
        }),
      vertical,
    )
  await open(page)
  expect(await gaps('[data-group="tf60"] .gallerist-thumb-item', false)).toEqual([2, 8, 2])
  await open(page, 'dir=rtl')
  expect(await gaps('[data-group="tf60"] .gallerist-thumb-item', false)).toEqual([2, 8, 2])
  await open(page, 'display=stacked')
  expect(await gaps('.gallerist-thumb-items .gallerist-thumb-item', true)).toEqual([2, 8, 2])
})

for (const display of ['flat', 'stacked'] as const) {
  test(`the manual marker: between its groups, never a stop, named, ${display}`, async ({
    page,
  }) => {
    await open(page, `display=${display}`)
    const marker = page.locator('.gallerist-rail-marker')
    await expect(marker).toHaveCount(1)
    await expect(marker).toHaveAttribute('aria-label', 'Manual time, 11:20 – 11:45, 25 minutes')
    await expect(marker.locator('.gallerist-rail-marker-body')).toHaveText('✎ 25m')
    const [before, m, after] = await Promise.all([
      box(page, '.gallerist-thumbs [data-group="tf70"]'),
      box(page, '.gallerist-rail-marker'),
      box(page, '.gallerist-thumbs [data-group="tf105"]'),
    ])
    expect(m.x).toBeGreaterThan(before.x + before.width - 1)
    expect(after.x).toBeGreaterThan(m.x + m.width - 1)
    // not focusable, not an option
    expect(
      await marker.evaluate(
        (el) => el.matches(':is(button, [tabindex])') || !!el.querySelector('button, [tabindex]'),
      ),
    ).toBe(false)
    await expect(page.getByRole('option', { name: /Manual/ })).toHaveCount(0)
    // the keys walk past it: the last screen before it, then the first after
    await page.evaluate(() =>
      (window as unknown as { viewer: { goTo(g: number, i: number): void } }).viewer.goTo(2, 1),
    )
    await page.locator('.gallerist').press('ArrowRight')
    expect(await cursor(page)).toEqual(display === 'flat' ? { g: 3, i: 0 } : { g: 3, i: 0 })
    await page.locator('.gallerist').press('ArrowLeft')
    expect(await cursor(page)).toEqual(display === 'flat' ? { g: 2, i: 1 } : { g: 2, i: 0 })
    await page.locator('.gallerist').press('End')
    expect((await cursor(page)).g).toBe(6)
    await page.locator('.gallerist').press('Home')
    expect(await cursor(page)).toEqual({ g: 0, i: 0 })
    // the count is of screenshots (flat) or timeframes (stacked) only
    await expect(page.locator('.gallerist-counter')).toHaveText(
      display === 'flat' ? '1 / 19' : '1 / 7',
    )
  })

  test(`the rail with every hook passes axe, ${display}`, async ({ page }) => {
    await open(page, `display=${display}`)
    const results = await new AxeBuilder({ page })
      .include('.gallerist-thumbs-region')
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze()
    expect(results.violations).toEqual([])
  })
}

test('a mouse over the marker shows its tip above it, inside the viewer, over the rest', async ({
  page,
}) => {
  await open(page)
  await page.locator('.gallerist-rail-marker').scrollIntoViewIfNeeded()
  await page.locator('.gallerist-rail-marker').hover()
  const tip = page.locator('.gallerist-rail-tip')
  await expect(tip).toHaveRole('tooltip')
  await expect(tip).toContainText('Client call: Q4 keyword review')
  const [t, m] = await Promise.all([
    box(page, '.gallerist-rail-tip'),
    box(page, '.gallerist-rail-marker'),
  ])
  expect(t.y + t.height).toBeLessThanOrEqual(m.y)
  expect(t.x).toBeGreaterThanOrEqual(0)
  expect(t.x + t.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0)
  // painted on top: the middle of the tip is the tip (hit-tested as if it took the pointer)
  expect(
    await page.evaluate(
      ({ x, y }) => {
        const tip = document.querySelector('.gallerist-rail-tip') as HTMLElement
        tip.style.pointerEvents = 'auto'
        const on = !!document.elementFromPoint(x, y)?.closest('.gallerist-rail-tip')
        tip.style.pointerEvents = ''
        return on
      },
      {
        x: t.x + t.width / 2,
        y: t.y + t.height / 2,
      },
    ),
  ).toBe(true)
  await page.mouse.move(5, 5)
  await expect(tip).toHaveCount(0)
})

test('refreshRail: a note added in the popover shows in the rail and the caption at once', async ({
  page,
}) => {
  await open(page)
  const thumb = await page.locator('[data-item="s62-1"]').elementHandle()
  await page.locator('.hk-note-btn').click()
  await page.locator('.hk-note-box').fill('Third note')
  await page.locator('.hk-add').click()
  await expect(page.locator('[data-group="tf60"] .hk-notes')).toHaveText('✉ 3')
  await expect(page.locator('.hk-note-btn')).toHaveText('✉ 3')
  await expect(page.getByRole('group', { name: /^Group 2, 11:00 – 11:10, 3 notes/ })).toHaveCount(1)
  // the thumbs stayed (drawn in place, not again)
  expect(await thumb?.evaluate((el) => el.isConnected)).toBe(true)
})

test('the notes popover: Escape closes it before the viewer, keys typed in it stay in it', async ({
  page,
}) => {
  await open(page)
  const before = await cursor(page)
  await page.locator('.gallerist').press('n') // the host's N, through a plugin keymap
  const box2 = page.locator('.hk-note-box')
  await expect(box2).toBeFocused()
  await page.keyboard.type('t0n+')
  for (const k of ['ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowDown'])
    await page.keyboard.press(k)
  await expect(box2).toHaveValue('t0n+')
  expect(await cursor(page)).toEqual(before)
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-rail', 'expanded')
  // Escape: the popover first, focus back on its button; the viewer stays
  await page.keyboard.press('Escape')
  await expect(page.locator('.hk-popover')).toHaveCount(0)
  await expect(page.locator('.hk-note-btn')).toBeFocused()
  expect(await phase(page)).toBe('open')
  // then the viewer
  await page.keyboard.press('Escape')
  await expect.poll(() => phase(page)).toBe('closed')
})

// With zoom, View and the shortcut list on the same viewer: ? lists the host's N with the viewer's
// keys, a ? typed in the notes stays there, a ? on the notes button (taken by no one) still opens the
// list, and the View popover's last row opens it.
test('the shortcut list: the host entries, around the notes popover and from View', async ({
  page,
}) => {
  await open(page)
  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })
  const rows = () =>
    list
      .locator('.gallerist-shortcuts-row')
      .evaluateAll((els) =>
        els.map(
          (r) =>
            `${r.querySelector('dt')?.textContent}: ${[...r.querySelectorAll('kbd')].map((k) => k.textContent).join(' ')}`,
        ),
      )
  await page.locator('.gallerist').press('Shift+Slash')
  await expect(list).toBeVisible()
  expect(await rows()).toEqual(
    expect.arrayContaining(['Zoom in: +', 'Fit to screen: 0', 'Notes: N', 'This list: ?']),
  )
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  expect(await phase(page)).toBe('open')
  // a ? typed in the note box is the note's
  await page.locator('.gallerist').press('n')
  await expect(page.locator('.hk-note-box')).toBeFocused()
  await page.keyboard.press('Shift+Slash')
  await expect(page.locator('.hk-note-box')).toHaveValue('?')
  await expect(list).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.hk-note-btn')).toBeFocused()
  // on the notes button nobody takes ?: the list opens, and Escape closes it, not the viewer
  await page.keyboard.press('Shift+Slash')
  await expect(list).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  expect(await phase(page)).toBe('open')
  // the View popover's last row
  await page.locator('.gallerist-view-btn').click()
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(list).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await phase(page)).toBe('open')
})

test('the notes popover rises over the stage from the caption bar, unclipped and on top', async ({
  page,
}) => {
  await open(page)
  await page.locator('.hk-note-btn').click()
  const [pop, stage, cap] = await Promise.all([
    box(page, '.hk-popover'),
    box(page, '.gallerist-main'),
    box(page, '.gallerist-caption'),
  ])
  expect(pop.y).toBeLessThan(cap.y) // above the caption band…
  expect(pop.y).toBeGreaterThan(stage.y) // …over the stage
  for (const [fx, fy] of [
    [0.5, 0.1],
    [0.5, 0.5],
    [0.1, 0.9],
    [0.9, 0.9],
  ] as const) {
    const on = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.hk-popover'),
      { x: pop.x + pop.width * fx, y: pop.y + pop.height * fy },
    )
    expect(on, `popover at ${fx},${fy}`).toBe(true)
  }
  // a press outside it is the host's to handle; the viewer keeps working under it
  expect(await phase(page)).toBe('open')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('zoom and fullscreen leave the bar; view, save and close fit without scrolling', async ({
    page,
  }) => {
    await open(page)
    await expect(page.locator('.gallerist-zoom-tool')).toBeHidden()
    await expect(page.locator('.gallerist-fullscreen-btn')).toBeHidden()
    await expect(page.locator('.gallerist-view-btn')).toBeVisible()
    await expect(page.locator('.gallerist-close')).toBeVisible()
    const strip = page.locator('.gallerist-region-toolbar')
    expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    for (const tool of await page.locator('.gallerist-bar button:visible').all())
      await expect(tool).toBeInViewport({ ratio: 1 })
  })

  test('a page keeps them with the phone tokens', async ({ page }) => {
    await open(page)
    await page.addStyleTag({
      content: '.gallerist { --gallerist-phone-zoom: flex; --gallerist-phone-fullscreen: grid }',
    })
    await expect(page.locator('.gallerist-zoom-out')).toBeVisible()
    await expect(page.locator('.gallerist-fullscreen-btn')).toBeVisible()
    await expect(page.locator('.gallerist-zoom-level')).toBeHidden() // as before: − and + only
  })

  test("the gesture list has the host's long press", async ({ page }) => {
    await page.goto('/hooks.html')
    await viewerSettled(page)
    await page.locator('.gallerist-view-btn').tap()
    await page.getByRole('button', { name: 'Gestures' }).tap()
    const list = page.getByRole('dialog', { name: 'Gestures', exact: true })
    await expect(list).toBeVisible()
    await expect(list.getByText('Long press the marker')).toBeVisible()
    await expect(list.getByText('Notes', { exact: true })).toHaveCount(0) // keys only
  })

  test('a long press on the marker shows its tip until the next press', async ({ page }) => {
    await open(page)
    const marker = page.locator('.gallerist-rail-marker')
    await marker.scrollIntoViewIfNeeded()
    await marker.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true })
    await page.waitForTimeout(650)
    await marker.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true })
    const tip = page.locator('.gallerist-rail-tip')
    await expect(tip).toBeVisible()
    await expect(tip).toBeInViewport({ ratio: 1 })
    await page.locator('.gallerist-main').dispatchEvent('pointerdown', { pointerType: 'touch' })
    await expect(tip).toHaveCount(0)
  })

  test('the rail and the notes sheet at 390px', async ({ page }) => {
    await open(page)
    await expect(page.locator('.gallerist-rail-marker')).toHaveCount(1)
    await page.locator('.hk-note-btn').tap()
    const sheet = await box(page, '.hk-popover')
    expect(Math.round(sheet.y + sheet.height)).toBe(844) // a bottom sheet
    expect(Math.round(sheet.width)).toBe(390)
    await expect(page.locator('.hk-note-box')).toBeFocused()
  })
})

test('the phone toolbar of the reviewer preset with view, save, the zoom tool and close fits 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const skin of ['gallery', 'console']) {
    await page.goto(`/layout.html?preset=reviewer&skin=${skin}&view=1&zoom-tool=1`)
    await viewerSettled(page)
    const strip = page.locator('.gallerist-region-toolbar')
    expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), skin).toBe(true)
    await expect(page.locator('.gallerist-zoom-tool')).toBeHidden()
  }
})
