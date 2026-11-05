// The windowed thumbnails rail in a real layout: scrolling it, in either reading direction and down
// a side rail, keeps every card on screen drawn (U17 review: a right-to-left rail used to fold its
// run back to the start, leaving the visible part of the rail empty).
import { type Page, expect, test } from '@playwright/test'

const open = async (page: Page, query: string) => {
  await page.goto(`/perf.html?config=default&shape=2000x5&${query}`)
  await page.waitForFunction(() => 'viewer' in window)
  await page.locator('#open').click()
  await expect(page.locator('.gallerist[data-gallerist-phase="open"]')).toBeVisible({
    timeout: 30_000,
  })
}

// Scroll the rail by `by` px along its axis (negative scrollLeft runs toward the end in RTL), then
// let the run follow (a scroll event, a frame, the re-window).
const scrollRail = (page: Page, by: number) =>
  page.evaluate(async (by) => {
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const down = getComputedStyle(rail).flexDirection.startsWith('column')
    const rtl = getComputedStyle(rail).direction === 'rtl'
    if (down) rail.scrollTop += by
    else rail.scrollLeft += rtl ? -by : by
    for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 50))
  }, by)

// The drawn card at each end and the middle of the rail (a gap between cards counts as its
// neighbour's): null where the rail shows nothing drawn
const shown = (page: Page) =>
  page.evaluate(() => {
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const r = rail.getBoundingClientRect()
    const down = getComputedStyle(rail).flexDirection.startsWith('column')
    const [from, to] = down ? [r.top, r.bottom] : [r.left, r.right]
    const cards = [...rail.querySelectorAll<HTMLElement>(':scope > .gallerist-thumb')].map((c) => {
      const b = c.getBoundingClientRect()
      return { id: c.dataset.group ?? '', a: down ? b.top : b.left, z: down ? b.bottom : b.right }
    })
    return [0.05, 0.5, 0.95].map((f) => {
      const at = from + (to - from) * f
      return cards.find((c) => c.a - 10 <= at && c.z + 10 >= at)?.id ?? null
    })
  })

const drawnCount = (page: Page) => page.locator('.gallerist-thumbs > .gallerist-thumb').count()

for (const [name, query] of [
  ['left to right', 'dir=ltr'],
  ['right to left', 'dir=rtl'],
  ['a side rail', 'rail=left'],
] as const) {
  test(`rail scroll keeps what shows drawn: ${name}`, async ({ page }) => {
    await open(page, query)
    await page.evaluate(() =>
      (window as unknown as { viewer: { goTo(g: number): void } }).viewer.goTo(30),
    )
    await scrollRail(page, 0)
    const active = page.locator('.gallerist-thumbs .gallerist-thumb[data-active]')
    await expect(active).toHaveAttribute('data-group', 'g30')
    await expect(active).toBeInViewport()
    expect(await shown(page)).not.toContain(null)

    // a short scroll keeps the active card on screen, and drawn
    await scrollRail(page, 150)
    await expect(active).toHaveAttribute('data-group', 'g30')
    expect(await shown(page)).not.toContain(null)

    // a long way toward the end, then back: whatever shows is drawn, and the run stays bounded
    const seen = new Set<string>()
    for (let k = 0; k < 8; k++) {
      await scrollRail(page, 700)
      const now = await shown(page)
      expect(now, `after ${k + 1} scrolls`).not.toContain(null)
      for (const g of now) seen.add(g as string)
      expect(await drawnCount(page)).toBeLessThan(80)
    }
    expect(Math.max(...[...seen].map((g) => Number(g.slice(1))))).toBeGreaterThan(60)
    for (let k = 0; k < 8; k++) {
      await scrollRail(page, -700)
      expect(await shown(page), `back ${k + 1}`).not.toContain(null)
    }
    // the active card is drawn again, and still the only one marked
    await expect(active).toHaveAttribute('data-group', 'g30')
    await expect(page.locator('.gallerist-thumbs [data-active]')).toHaveCount(1)
  })
}

// 0.3.2 (Apploye, a 390px phone): stepping with → left the current thumb flush against the rail's far
// edge, so what came next was out of view (at 14 of 15 the 15th was off screen). While the current
// card and the cards either side of it show whole the rail stays put; once one of them would be cut,
// it centres the current card, which the browser clamps at either end of the rail. The layout
// fixture: 37 items in 12 groups of mixed sizes.
type Span = { id: string; a: number; z: number }
type RailNow = { id: string; cards: Span[]; lo: number; hi: number; at: number; max: number }
// the rail's cards in rail order (a flat rail's items, else its group cards or chips; DOM order, so
// a right-to-left rail's first card is its rightmost), the current one, the rail's extent and how far
// it is scrolled toward its end (0 at the start)
const railNow = (page: Page, flat: boolean) =>
  page.evaluate(async (flat) => {
    for (let k = 0; k < 2; k++) await new Promise((r) => requestAnimationFrame(r)) // the re-window
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const down = getComputedStyle(rail).flexDirection.startsWith('column')
    const r = rail.getBoundingClientRect()
    const sel = flat
      ? 'button[data-item]'
      : 'button[data-group]:not([data-item]):not(.gallerist-thumb-expand)'
    const cards = [...rail.querySelectorAll<HTMLElement>(sel)]
      .map((c) => ({ c, b: c.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0)
      .map(({ c, b }) => ({
        id: c.dataset.item ?? c.dataset.group ?? '',
        a: down ? b.top : b.left,
        z: down ? b.bottom : b.right,
        on: c.hasAttribute('data-active'),
      }))
    return {
      id: cards.find((c) => c.on)?.id ?? '',
      cards: cards.map(({ id, a, z }) => ({ id, a, z })),
      lo: down ? r.top : r.left,
      hi: down ? r.bottom : r.right,
      at: Math.abs(down ? rail.scrollTop : rail.scrollLeft),
      max: down ? rail.scrollHeight - rail.clientHeight : rail.scrollWidth - rail.clientWidth,
    }
  }, flat) as Promise<RailNow>

// shows whole along the rail (no card: the run's end, nothing to show)
const whole = (n: RailNow, c: Span | undefined) => !c || (c.a >= n.lo - 1 && c.z <= n.hi + 1)
// the card `id` and the ones either side of it, in rail order
const around = (n: RailNow, id: string) => {
  const k = n.cards.findIndex((c) => c.id === id)
  return [n.cards[k - 1], n.cards[k], n.cards[k + 1]]
}
const spanOf = (n: RailNow, id: string) => n.cards.find((c) => c.id === id)

// Step `steps` times with `key`. After each step the current card and its neighbours show whole (or,
// where the rail is too short for three cards, the current one shows whole, centred); the rail moved
// only if one of them didn't show whole before the step; and a move centres the current card unless
// the rail stopped at an end.
const walk = async (page: Page, flat: boolean, key: string, steps: number) => {
  let before = await railNow(page, flat)
  for (let s = 0; s < steps; s++) {
    await page.keyboard.press(key)
    const now = await railNow(page, flat)
    expect(now.id, `step ${s + 1}`).not.toBe(before.id)
    const [prev, cur, next] = around(now, now.id) as [Span | undefined, Span, Span | undefined]
    expect(cur, `${now.id} drawn`).toBeDefined()
    const ends = (prev ?? cur).a < (next ?? cur).a ? [prev, next] : [next, prev]
    const room = (ends[1] ?? cur).z - (ends[0] ?? cur).a <= now.hi - now.lo + 0.5
    for (const c of room ? [prev, cur, next] : [cur])
      expect(whole(now, c), `${now.id}: ${c?.id} shows`).toBe(true)
    const centred = Math.abs((cur.a + cur.z) / 2 - (now.lo + now.hi) / 2) < 2
    const atEnd = now.at <= 1 || now.at >= now.max - 1
    // did the rail move? (the cards that stay keep their place through a re-window otherwise)
    const ref = spanOf(before, before.id) as Span
    const moved = Math.abs((spanOf(now, ref.id)?.a ?? Number.NaN) - ref.a) > 1
    const needed = around(before, now.id).some((c) => !whole(before, c))
    if (!needed) expect(moved, `${now.id}: the rail stayed put`).toBe(false)
    else if (!moved) expect(centred || atEnd, `${now.id}: already in place`).toBe(true)
    if (moved && !atEnd) expect(centred, `${now.id} centred`).toBe(true)
    before = now
  }
  return before
}

for (const { name, size, query, flat, fwd, back, total } of [
  {
    name: 'flat, phone',
    size: { width: 390, height: 520 },
    query: 'preset=reviewer&skin=console&display=flat',
    flat: true,
    fwd: 'ArrowRight',
    back: 'ArrowLeft',
    total: 37,
  },
  {
    name: 'flat, desktop',
    size: { width: 1280, height: 720 },
    query: 'preset=reviewer&skin=console&display=flat',
    flat: true,
    fwd: 'ArrowRight',
    back: 'ArrowLeft',
    total: 37,
  },
  {
    name: 'flat, phone, right to left',
    size: { width: 390, height: 520 },
    query: 'preset=reviewer&skin=console&display=flat&dir=rtl',
    flat: true,
    fwd: 'ArrowLeft', // the arrows mirror: ← advances
    back: 'ArrowRight',
    total: 37,
  },
  {
    name: 'flat, side rail',
    size: { width: 1280, height: 720 },
    query: 'display=flat&rail=left',
    flat: true,
    fwd: 'ArrowDown',
    back: 'ArrowUp',
    total: 37,
  },
  {
    name: 'stacked, phone',
    size: { width: 390, height: 520 },
    query: 'preset=reviewer&skin=console',
    flat: false,
    fwd: 'ArrowRight',
    back: 'ArrowLeft',
    total: 12,
  },
  {
    name: 'stacked, desktop',
    size: { width: 1024, height: 720 },
    query: '',
    flat: false,
    fwd: 'ArrowRight',
    back: 'ArrowLeft',
    total: 12,
  },
  {
    name: 'stacked, side rail',
    size: { width: 1280, height: 520 },
    query: 'rail=right',
    flat: false,
    fwd: 'ArrowDown',
    back: 'ArrowUp',
    total: 12,
  },
  {
    name: 'index chips, phone',
    size: { width: 390, height: 520 },
    query: 'display=index',
    flat: false,
    fwd: 'ArrowRight',
    back: 'ArrowLeft',
    total: 12,
  },
] as const) {
  test(`the rail keeps the cards beside the current one in view (${name})`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto(`/layout.html?g=0&${query}`)
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    const start = await railNow(page, flat)
    expect(start.at).toBe(0)
    expect(start.max, 'the rail scrolls').toBeGreaterThan(0)
    // to the end: centring the cards before the last stops at the rail's end (clamped)
    const end = await walk(page, flat, fwd, total - 1)
    expect(end.id).toBe(end.cards.at(-1)?.id)
    expect(end.at).toBeGreaterThanOrEqual(end.max - 1)
    // and back to the start (a move there that isn't a centring stopped at the rail's start)
    const home = await walk(page, flat, back, total - 1)
    expect(home.id).toBe(home.cards[0]?.id)
    expect(whole(home, home.cards[0])).toBe(true)
  })
}

test('a click on a card in view moves the rail only to keep its neighbours in view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/layout.html?g=0&preset=reviewer&skin=console&display=flat')
  await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
  await walk(page, true, 'ArrowRight', 12) // into the middle of the collection
  const before = await railNow(page, true)
  const shows = before.cards.filter((c) => whole(before, c))
  // a card next to the current one, with a card that shows whole on its other side too: it and both
  // its neighbours show, so nothing moves
  const k = shows.findIndex((c) => c.id === before.id)
  const near = shows[shows[k + 2] ? k + 1 : k - 1] as Span
  expect(shows.indexOf(near)).toBeGreaterThan(0)
  await page.locator(`.gallerist-thumbs [data-item="${near.id}"]`).click()
  const after = await railNow(page, true)
  expect(after.id).toBe(near.id)
  expect(Math.abs((spanOf(after, near.id) as Span).a - near.a)).toBeLessThan(1)
  // the last card that shows whole: the one after it is cut, so the rail centres it
  const last = shows.at(-1) as Span
  await page.locator(`.gallerist-thumbs [data-item="${last.id}"]`).click()
  const centred = await railNow(page, true)
  const c = spanOf(centred, last.id) as Span
  expect(Math.abs((c.a + c.z) / 2 - (centred.lo + centred.hi) / 2)).toBeLessThan(2)
  for (const n of around(centred, last.id)) expect(whole(centred, n)).toBe(true)
})
