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
  reviewer: 'preset=reviewer&view=1&captions=1&zoom-tool=1',
  editorial: 'preset=editorial&view=1&captions=1',
  'reviewer rtl': 'preset=reviewer&view=1&captions=1&zoom-tool=1&dir=rtl',
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
// A phone leaves fullscreen out of the bar; the runs keep it (--gallerist-phone-fullscreen) for the
// most tools, but this variant, the phone's own bar, doesn't.
const PHONE_BAR = "the phone's own bar"
const GEOMETRY: Record<string, [string, string?][]> = {
  desktop: [
    ['view=1'],
    ['preset=reviewer&view=1&captions=1&dir=rtl'],
    ['preset=reviewer&view=1&captions=1', 'title hidden by the host'],
    ['preset=reviewer&view=1&captions=1', 'tools all hidden'],
    ['preset=reviewer&view=1&captions=1&zoom-tool=1&skin=console'],
    ['preset=reviewer&view=1&captions=1&zoom-tool=1&skin=console&dir=rtl'],
    ['preset=immersive&view=1'],
    ['preset=immersive&view=1&controls=0&dir=rtl'],
    ['preset=immersive&view=1&captions=1'],
  ],
  phone: [
    ['preset=immersive&view=1&captions=1&dir=rtl'],
    ['view=1&controls=0'],
    ['preset=reviewer&view=1&captions=1', PHONE_BAR],
  ],
  narrow: [
    ['preset=reviewer&view=1&captions=1'],
    ['preset=reviewer&view=1&captions=1&dir=rtl', PHONE_BAR],
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
      // (from its margin box: Console keeps room before Close for a hairline)
      after: ((a) =>
        a && [a[0] - Number.parseFloat(getComputedStyle(kids[at + 1]).marginInlineStart), a[1]])(
        span(kids[at + 1]),
      ),
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
        if (size !== 'desktop' && variant !== PHONE_BAR)
          await page.addStyleTag({ content: '.gallerist { --gallerist-phone-fullscreen: grid }' })
        const g = await barGeometry(page)
        const immersive = query.includes('immersive')
        const tools = g.tools
        expect(tools.length, `${at}: tools`).toBeGreaterThanOrEqual(variant === PHONE_BAR ? 3 : 4)
        if (variant === PHONE_BAR)
          expect(
            await page.locator('.gallerist-fullscreen-btn').isVisible(),
            `${at}: fullscreen`,
          ).toBe(false)
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
        if (
          variant === 'title hidden by the host' &&
          g.counter &&
          !g.overflows &&
          first - g.counter[1] < 100
        )
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

// A phone leaves fullscreen out of an overlay viewer's bar (it fills the screen already); an inline
// viewer on a narrow screen keeps it.
test.describe('fullscreen on a 390px screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('an overlay viewer leaves it out; an inline one keeps it', async ({ page }) => {
    await page.goto('/layout.html?preset=reviewer&skin=console')
    await expect(page.locator('.gallerist[data-gallerist-phase="open"]')).toBeVisible()
    await expect(page.locator('.gallerist-fullscreen-btn')).toHaveCount(1)
    await expect(page.locator('.gallerist-fullscreen-btn')).toBeHidden()
    await page.goto('/layout.html?preset=reviewer&skin=console&inline=600')
    await expect(page.locator('.gallerist[data-gallerist-mode="inline"]')).toBeVisible()
    await expect(page.locator('.gallerist-fullscreen-btn')).toBeVisible()
  })
})

// 0.4.1: the Console skin's bar is compact for a fine pointer (the mockup): 36px tools with 18px
// glyphs (Close 20px), the zoom tool one bordered group 30px tall (− and + 30 × 28 with 15px glyphs,
// the percentage 54px wide between two hairlines), and a 1 × 20 hairline before Close, 8px clear of
// what is either side of it (6px on a phone). A touch keeps 44px tools and 22px glyphs (the hairline
// stays); Gallery and Editorial keep 44px tools and no hairline.
const barSizes = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.gallerist-bar') as HTMLElement
    const rtl = getComputedStyle(bar).direction === 'rtl'
    const W = document.documentElement.clientWidth
    // a box along the inline axis (RTL mirrored)
    const box = (el: Element | null | undefined) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        s: rtl ? W - r.right : r.left,
        e: rtl ? W - r.left : r.right,
        w: r.width,
        h: r.height,
      }
    }
    const shown = (el: Element) => el.checkVisibility()
    const icon = (el: Element) => box(el.querySelector('.gallerist-icon'))
    const tools = [...bar.querySelectorAll('button')]
      .filter((b) => shown(b) && !b.closest('.gallerist-zoom-tool'))
      .map((b) => ({
        name: b.getAttribute('aria-label') ?? b.className,
        close: b.classList.contains('gallerist-close'),
        box: box(b),
        icon: icon(b),
      }))
    const group = bar.querySelector('.gallerist-zoom-tool')
    const zoom =
      group && shown(group)
        ? {
            box: box(group),
            border: getComputedStyle(group).borderTopWidth,
            parts: [...group.children].map((c) => ({
              box: box(c),
              icon: icon(c),
              start: getComputedStyle(c).borderInlineStartWidth,
            })),
          }
        : null
    const close = bar.querySelector('.gallerist-close') as HTMLElement
    const rule = getComputedStyle(close, '::before')
    const at = box(close) as { s: number; e: number }
    const off = Number.parseFloat(rtl ? rule.right : rule.left)
    // what is before Close: the last shown tool in the strip (none: the bar's start)
    const strip = bar.querySelector('.gallerist-region-toolbar') as HTMLElement
    const last = [...strip.children].filter(shown).at(-1)
    return {
      tools,
      zoom,
      rule: {
        // the line is its inline-start border (forced colours keep a border, 0.4.1)
        w: Number.parseFloat(rule.width) + Number.parseFloat(rule.borderInlineStartWidth),
        h: Number.parseFloat(rule.height),
        before: at.s + off - (box(last)?.e ?? 0),
        after: at.s - (at.s + off + Number.parseFloat(rule.borderInlineStartWidth)),
      },
    }
  })

const near = (a: number | undefined, b: number, slack = 0.5) => Math.abs((a ?? -1e9) - b) <= slack

test.describe('the compact console bar', () => {
  for (const [what, ctx] of [
    ['a mouse', VIEWPORTS.desktop],
    ['a touch', VIEWPORTS.phone],
  ] as const) {
    test.describe(what, () => {
      test.use(ctx)
      const fine = what === 'a mouse'
      for (const skin of SKINS)
        for (const scheme of SCHEMES)
          for (const dir of fine && skin === 'console' ? ['ltr', 'rtl'] : ['ltr']) {
            test(`${skin} ${scheme} ${dir}`, async ({ page }) => {
              const compact = fine && skin === 'console'
              await page.goto(
                `/layout.html?preset=reviewer&view=1&captions=1&zoom-tool=1&skin=${skin}&scheme=${scheme}&dir=${dir}`,
              )
              await viewerSettled(page)
              const b = await barSizes(page)
              const problems: string[] = []
              const tool = compact ? 36 : 44
              expect(b.tools.length).toBeGreaterThanOrEqual(fine ? 5 : 3) // fullscreen, save, View, close
              for (const t of b.tools) {
                const glyph = compact ? (t.close ? 20 : 18) : 22
                if (!near(t.box?.w, tool) || !near(t.box?.h, tool))
                  problems.push(`${t.name}: ${t.box?.w} × ${t.box?.h}, not ${tool}`)
                if (t.icon && (!near(t.icon.w, glyph) || !near(t.icon.h, glyph)))
                  problems.push(`${t.name}'s glyph: ${t.icon.w} × ${t.icon.h}, not ${glyph}`)
              }
              if (fine) {
                const z = b.zoom
                expect(z, 'the zoom tool').not.toBeNull()
                const [out, level, into] = z?.parts ?? []
                if (compact) {
                  expect(z?.border).toBe('1px')
                  expect(z?.box?.h).toBeCloseTo(30, 0)
                  for (const p of [out, into]) {
                    expect(p?.box?.w).toBeCloseTo(30, 0)
                    expect(p?.box?.h).toBeCloseTo(28, 0)
                    expect(p?.icon?.w).toBeCloseTo(15, 0)
                  }
                  expect(level?.box?.w).toBeCloseTo(54, 0) // a tabular width, whatever the face
                  expect(level?.box?.h).toBeCloseTo(28, 0)
                  expect(level?.start).toBe('1px') // the hairlines either side of it
                  // one group: the parts touch
                  expect(Math.abs((level?.box?.s ?? 0) - (out?.box?.e ?? 0))).toBeLessThan(0.5)
                  expect(Math.abs((into?.box?.s ?? 0) - (level?.box?.e ?? 0))).toBeLessThan(0.5)
                } else {
                  // three loose tools, as in 0.4.0
                  expect(z?.border).toBe('0px')
                  for (const p of [out, into]) expect(p?.box?.w).toBeCloseTo(44, 0)
                  expect(Math.round((level?.box?.s ?? 0) - (out?.box?.e ?? 0))).toBe(2)
                }
              } else expect(b.zoom, 'a phone leaves the zoom tool out').toBeNull()
              if (skin === 'console') {
                expect(b.rule.w).toBe(1)
                expect(b.rule.h).toBe(20)
                // centred in the room before Close: 8px either side (6px on a phone, its gap 4px)
                const clear = fine ? 8 : 6
                if (!near(b.rule.before, clear, 1) || !near(b.rule.after, clear, 1))
                  problems.push(`the hairline: ${b.rule.before} | 1 | ${b.rule.after}`)
              } else expect(b.rule.w).toBe(0)
              expect(problems).toEqual([])
            })
          }
    })
  }
})

// 0.4.1 review: forced colours paint a background over in the canvas colour, so the hairline before
// Close, drawn as one, went with them; drawn as a border, it keeps a line in the system's text colour
test('forced colours: the hairline before Close still shows', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'forced colours are emulated in Chromium only')
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/layout.html?preset=reviewer&view=1&captions=1&zoom-tool=1&skin=console')
  await viewerSettled(page)
  const r = await page.evaluate(() => {
    const rule = getComputedStyle(
      document.querySelector('.gallerist-bar .gallerist-close') as Element,
      '::before',
    )
    const border = Number.parseFloat(rule.borderInlineStartWidth)
    return {
      // the line's colour: its border's, else its background's
      line: border ? rule.borderInlineStartColor : rule.backgroundColor,
      wide: border || Number.parseFloat(rule.width),
      bar: getComputedStyle(document.querySelector('.gallerist-bar') as Element).backgroundColor,
    }
  })
  expect(r.wide).toBe(1)
  expect(r.line).not.toMatch(/^rgba\(.*, 0\)$/) // not transparent
  expect(r.line, 'not the bar’s canvas colour').not.toBe(r.bar)
})
