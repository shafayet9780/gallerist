import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

// A toolbar tool's focus ring shows whole. The tools sit in a strip that scrolls sideways on a
// narrow screen, and a scroll container clips at its padding box on both axes, so the strip keeps
// room for the ring (outline + offset) on every side, and a tool that keyboard focus brings into view
// (a browser leaves one 32px or more in view where it is) stops that far short of the strip's edge.
// Each tool is reached from the keyboard, on and then back (on a phone the strip scrolls under it
// both ways), in every skin, both schemes, on a desktop and 390px and 320px phones, with the most
// tools the fixture has (grid, rail toggle, fullscreen, save, View), and in RTL. A phone leaves
// fullscreen out of the bar by default; these runs keep it (--gallerist-phone-fullscreen), so the
// strip still has the most tools to scroll through.

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  narrow: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
} as const
const SKINS = ['gallery', 'console', 'editorial'] as const
const SCHEMES = ['dark', 'light'] as const
const LOOKS = {
  default: 'view=1',
  reviewer: 'preset=reviewer&view=1&captions=1',
  editorial: 'preset=editorial&view=1&captions=1',
  'reviewer rtl': 'preset=reviewer&view=1&captions=1&dir=rtl',
}

// the strip's keyboard-reachable tools, in order (a tool a plugin holds hidden is skipped)
const tools = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.gallerist-region-toolbar :is(button, [href], [tabindex]:not([tabindex="-1"]))',
      ),
    ]
      .filter((el) => el.checkVisibility())
      .map((el, k) => {
        el.dataset.ringProbe = String(k)
        return el.getAttribute('aria-label') ?? el.className
      }),
  )

// focus as a keyboard user does: Tab (Shift+Tab going back) from where focus is. Headless WebKit
// doesn't deliver Tab traversal (see a11y.spec), so there the tool is focused after a key press,
// which :focus-visible treats as keyboard focus all the same, and focus() scrolls it into view.
const keyboardFocus = async (page: Page, k: number, back: boolean, browserName: string) => {
  const sel = `[data-ring-probe="${k}"]`
  if (browserName === 'webkit') {
    await page.keyboard.press('Shift')
    await page.locator(sel).focus()
  } else {
    for (let n = 0; n < 40; n++) {
      if (await page.evaluate((s) => !!document.activeElement?.matches(s), sel)) break
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
    }
  }
  await expect(page.locator(sel)).toBeFocused()
  expect(await page.locator(sel).evaluate((el) => el.matches(':focus-visible'))).toBe(true)
}

// the focused tool's ring (its box grown by outline width + offset) and the room it has: every
// ancestor up to the viewer root that clips its overflow, at its padding box
const ring = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const cs = getComputedStyle(el)
    const grow = Number.parseFloat(cs.outlineWidth) + Number.parseFloat(cs.outlineOffset)
    const r = el.getBoundingClientRect()
    const box = { l: r.left - grow, t: r.top - grow, r: r.right + grow, b: r.bottom + grow }
    const clip = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 }
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect()
        const l = ar.left + a.clientLeft
        const t = ar.top + a.clientTop
        clip.l = Math.max(clip.l, l)
        clip.t = Math.max(clip.t, t)
        clip.r = Math.min(clip.r, l + a.clientWidth)
        clip.b = Math.min(clip.b, t + a.clientHeight)
      }
      if (a.classList.contains('gallerist')) break
    }
    return { style: cs.outlineStyle, width: Number.parseFloat(cs.outlineWidth), box, clip }
  })

const fmt = (b: { l: number; t: number; r: number; b: number }) =>
  [b.l, b.t, b.r, b.b].map((v) => Math.round(v * 10) / 10).join(',')

for (const [size, ctx] of Object.entries(VIEWPORTS)) {
  test.describe(size, () => {
    test.use(ctx)
    for (const skin of SKINS) {
      for (const scheme of SCHEMES) {
        test(`a focused toolbar tool's ring isn't clipped by the strip, ${skin} ${scheme}`, async ({
          page,
          browserName,
        }) => {
          const problems: string[] = []
          let scrolled = false
          for (const [look, query] of Object.entries(LOOKS)) {
            await page.goto(`/layout.html?skin=${skin}&scheme=${scheme}&${query}`)
            await page.addStyleTag({ content: '.gallerist { --gallerist-phone-fullscreen: grid }' })
            await viewerSettled(page)
            const labels = await tools(page)
            expect(labels.length, `${look}: tools in the strip`).toBeGreaterThanOrEqual(4)
            const strip = page.locator('.gallerist-region-toolbar')
            if (await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1)) scrolled = true
            const order = [...labels.keys()]
            for (const [pass, ks] of [
              ['on', order],
              ['back', [...order].reverse()],
            ] as const) {
              for (const k of ks) {
                await keyboardFocus(page, k, pass === 'back', browserName)
                const r = await ring(page)
                const at = `${look}, ${pass}: ${labels[k]}`
                if (r.style === 'none' || r.width < 1) problems.push(`${at}: no focus ring`)
                const inside =
                  r.box.l >= r.clip.l - 0.5 &&
                  r.box.t >= r.clip.t - 0.5 &&
                  r.box.r <= r.clip.r + 0.5 &&
                  r.box.b <= r.clip.b + 0.5
                if (!inside) problems.push(`${at}: ring ${fmt(r.box)} clipped to ${fmt(r.clip)}`)
              }
            }
          }
          // at 320px the strip scrolls, so its scroll edges are crossed on the way (at 390px it does
          // too, except where a skin's tools fit: editorial in WebKit)
          if (size === 'narrow') expect(scrolled, 'a strip that scrolls').toBe(true)
          expect(problems).toEqual([])
        })
      }
    }
  })
}
