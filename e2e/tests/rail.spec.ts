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
