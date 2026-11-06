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
