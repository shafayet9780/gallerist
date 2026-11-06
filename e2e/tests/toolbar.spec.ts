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

// The room the strip keeps for a ring moves nothing while no tool has focus, and the strip (which
// spans the bar's free space) catches no pointer where it has no tool. Positions are read along the
// inline axis (RTL mirrored), against invariants rather than numbers: the counter (or the bar's
// start) then the title, the tools right after them when they overflow, else ending one bar gap
// before Close (or at the bar's end); every tool hit where it is; the bar's free space the bar's
// own, and under an immersive bar the stage's (a swipe or wheel there reaches the image).
const GEOMETRY: Record<string, [string, string?][]> = {
  desktop: [
    ['view=1'],
    ['preset=reviewer&view=1&captions=1&dir=rtl'],
    ['preset=reviewer&view=1&captions=1', 'title hidden by the host'],
    ['preset=reviewer&view=1&captions=1', 'tools all hidden'],
    ['preset=immersive&view=1'],
    ['preset=immersive&view=1&controls=0&dir=rtl'],
    ['preset=immersive&view=1&captions=1'],
  ],
  phone: [['preset=immersive&view=1&captions=1&dir=rtl'], ['view=1&controls=0']],
  narrow: [
    ['preset=reviewer&view=1&captions=1'],
    ['preset=reviewer&view=1&captions=1&skin=console&dir=rtl'],
    ['preset=immersive&view=1&controls=0'],
  ],
}

const barGeometry = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.gallerist-bar') as HTMLElement
    const strip = bar.querySelector('.gallerist-region-toolbar') as HTMLElement
    const rtl = getComputedStyle(bar).direction === 'rtl'
    const W = document.documentElement.clientWidth
    // an inline span: [start, end] from the viewer's inline start
    const box = (el: Element): [number, number] => {
      const r = el.getBoundingClientRect()
      return rtl ? [W - r.right, W - r.left] : [r.left, r.right]
    }
    const span = (el?: Element | null) => (el?.checkVisibility() ? box(el) : null)
    const bs = getComputedStyle(bar)
    const br = bar.getBoundingClientRect()
    const pad = Number.parseFloat(rtl ? bs.paddingRight : bs.paddingLeft)
    const padEnd = Number.parseFloat(rtl ? bs.paddingLeft : bs.paddingRight)
    const kids = [...bar.children].filter((el) => el.checkVisibility())
    const at = kids.indexOf(strip)
    const tools = [...strip.children].filter((el) => el.checkVisibility())
    const y = br.top + br.height / 2
    // what a pointer at inline offset `x` (the bar's mid-height) lands on
    const hit = (x: number) => {
      const el = document.elementFromPoint(rtl ? W - x : x, y)
      if (!el) return 'nothing'
      if (el.closest('.gallerist-stage')) return 'stage'
      if (el === strip) return 'strip'
      const tool = tools.find((t) => t.contains(el))
      if (tool) return `tool ${tools.indexOf(tool)}`
      return el.closest('.gallerist-bar > *')?.className.split(' ').pop() ?? el.className
    }
    const first = tools[0] ? box(tools[0]) : null
    const before = span(kids[at - 1])
    return {
      gap: Number.parseFloat(bs.columnGap),
      toolGap: Number.parseFloat(getComputedStyle(strip).columnGap),
      bar: [box(bar)[0] + pad, box(bar)[1] - padEnd] as [number, number],
      counter: span(bar.querySelector('.gallerist-counter')),
      title: span(bar.querySelector('.gallerist-title')),
      before,
      after: span(kids[at + 1]),
      tools: tools.map(box),
      overflows: strip.scrollWidth > strip.clientWidth + 1,
      // (a tool the strip has scrolled partly out of view: where it shows)
      toolHits: tools.map((t, k) => {
        const [s, e] = box(t)
        const [ss, se] = box(strip)
        const x = Math.min(Math.max((s + e) / 2, ss + 2), se - 2)
        return x < e - 1 && x > s + 1 ? hit(x) : `tool ${k}`
      }),
      counterEdge: before ? hit(box(bar.querySelector('.gallerist-counter') ?? bar)[1] - 1) : null,
      // the middle of the free space before the tools, and the middle of the bar
      free: first && before && first[0] - before[1] > 16 ? hit((before[1] + first[0]) / 2) : null,
      middle: hit((box(bar)[0] + box(bar)[1]) / 2),
    }
  })

for (const [size, configs] of Object.entries(GEOMETRY)) {
  test.describe(size, () => {
    test.use(VIEWPORTS[size as keyof typeof VIEWPORTS])
    test('the strip moves nothing and takes no pointer outside its tools', async ({ page }) => {
      const problems: string[] = []
      for (const [query, variant] of configs) {
        await page.goto(`/layout.html?scheme=dark&${query}`)
        await viewerSettled(page)
        const at = `${query}${variant ? ` (${variant})` : ''}`
        const near = (a: number, b: number, what: string) => {
          if (Math.abs(a - b) > 0.5)
            problems.push(`${at}: ${what} ${a.toFixed(2)}, not ${b.toFixed(2)}`)
        }
        if (variant === 'tools all hidden') {
          // a strip holding only hidden tools gives the title what an empty strip does
          const widths = await page.evaluate(() => {
            const strip = document.querySelector('.gallerist-region-toolbar') as HTMLElement
            const title = document.querySelector('.gallerist-title') as HTMLElement
            const kids = [...strip.children] as HTMLElement[]
            for (const k of kids) k.hidden = true
            const hidden = title.getBoundingClientRect().width
            for (const k of kids) k.remove()
            return { hidden, empty: title.getBoundingClientRect().width }
          })
          near(widths.hidden, widths.empty, 'the title beside a strip of hidden tools is')
          continue
        }
        if (variant === 'title hidden by the host')
          await page.addStyleTag({ content: '.gallerist-title { display: none }' })
        const g = await barGeometry(page)
        const immersive = query.includes('immersive')
        const tools = g.tools
        expect(tools.length, `${at}: tools`).toBeGreaterThanOrEqual(4)
        // the chrome before the strip, from the bar's start
        if (g.counter) near(g.counter[0], g.bar[0], 'the counter starts at')
        if (g.title && g.counter) near(g.title[0], g.counter[1] + g.gap, 'the title starts at')
        // the tools, one strip gap apart
        tools.forEach(([s], k) => {
          const prev = tools[k - 1]
          if (prev) near(s, prev[1] + g.toolGap, `tool ${k} starts at`)
        })
        const first = Math.min(...tools.map(([s]) => s))
        const last = Math.max(...tools.map(([, e]) => e))
        const start = g.before ? g.before[1] + g.gap : g.bar[0]
        if (g.overflows) near(first, start, 'the first (overflowing) tool starts at')
        else {
          if (first < start - 0.5) problems.push(`${at}: the first tool overlaps what's before it`)
          near(last, g.after ? g.after[0] - g.gap : g.bar[1], 'the last tool ends at')
        }
        // a host hiding the title leaves the tools at the end, far from the counter
        if (variant && g.counter && !g.overflows && first - g.counter[1] < 100)
          problems.push(`${at}: the tools moved next to the counter`)
        g.toolHits.forEach((h, k) => {
          if (h !== `tool ${k}`) problems.push(`${at}: a pointer on tool ${k} lands on ${h}`)
        })
        if (g.counterEdge && g.counterEdge !== 'gallerist-counter')
          problems.push(`${at}: the counter's end lands on ${g.counterEdge}`)
        // the free space: the bar's, or under an immersive bar the image's; never the strip's
        const pass = immersive ? 'stage' : 'gallerist-bar'
        if (g.free && g.free !== pass) problems.push(`${at}: the free space lands on ${g.free}`)
        if (g.middle === 'strip') problems.push(`${at}: the bar's middle lands on the strip`)
        if (immersive && !g.title && size === 'desktop' && g.middle !== 'stage')
          problems.push(`${at}: the immersive bar's middle lands on ${g.middle}, not the stage`)
      }
      expect(problems).toEqual([])
    })
  })
}
