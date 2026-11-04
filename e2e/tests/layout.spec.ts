import { type Page, expect, test } from '@playwright/test'

// Layout lint (plan P2-K): sweep chrome configurations × viewport × direction and assert that the
// chrome never collides or hides itself, nothing leaves the viewport, persistent chrome doesn't
// cover or crush the stage, every visible control is actually clickable, and touch targets are at
// least 44px. Geometry checks are deterministic across platforms (unlike screenshot baselines).
// LAYOUT_SHOTS=<dir> also saves a screenshot per configuration; LAYOUT_STYLES=<dir> saves a
// computed-style snapshot (a deterministic "did this CSS change anything visible" oracle).

const CONFIGS: Record<string, string> = {
  default: '',
  'preset-filmstrip': 'preset=filmstrip',
  'preset-reviewer': 'preset=reviewer',
  'preset-immersive': 'preset=immersive',
  'preset-contact': 'preset=contact',
  'arrows-corner-br': 'arrows=corner-br',
  'arrows-dpad': 'arrows=dpad',
  'arrows-split': 'arrows=split',
  'rail-left': 'rail=left',
  'rail-right': 'rail=right',
  'rail-hidden': 'rail=hidden',
  'linear-flat': 'linear=1&display=flat',
  captions: 'captions=1',
  'long-caption': 'captions=long',
  'single-item-group': 'g=0',
  'large-group': 'g=5',
  zoomed: 'zoom=2',
  'zoomed-navigator': 'preset=reviewer&zoom=2', // the zoom navigator, beside the corner cluster
  'controls-off': 'controls=0&plugins=0',
  'rtl-reviewer': 'preset=reviewer&dir=rtl&captions=1',
  'rtl-rail-left': 'rail=left&dir=rtl',
  'rtl-rail-right': 'rail=right&dir=rtl',
  'immersive-split': 'preset=immersive&arrows=split&railopen=1',
  'immersive-dpad': 'preset=immersive&arrows=dpad&railopen=1',
  'immersive-corner-br': 'preset=immersive&arrows=corner-br&railopen=1',
  'indicator-dots': 'indicator=dots',
  'indicator-counter': 'indicator=counter&arrows=corner-br',
  'scheme-light': 'scheme=light&captions=1&indicator=dots',
  'scheme-dark': 'scheme=dark&captions=1', // Editorial's Night; the others' default
  'preset-editorial': 'preset=editorial&captions=1',
  'editorial-long-caption': 'preset=editorial&captions=long&g=1',
  'editorial-zoomed': 'preset=editorial&captions=1&zoom=2',
  'placard-filmstrip': 'indicator=placard&captions=1', // a placard in the bottom caption band
  'editorial-rail-left': 'preset=editorial&rail=left&captions=1',
  'editorial-rail-right-rtl': 'preset=editorial&rail=right&dir=rtl&captions=1',
  'editorial-vertical-items': 'preset=editorial&captions=1&items=vertical',
  'preset-tour': 'preset=tour&captions=1',
  'tour-first-group': 'preset=tour&captions=1&g=0', // no previous arrow label
  'tour-large-group': 'preset=tour&captions=1&g=5',
  'tour-zoomed': 'preset=tour&captions=1&zoom=2',
  'tour-rtl': 'preset=tour&captions=1&dir=rtl',
  'tour-rail-right': 'preset=tour&captions=1&rail=right',
  'tour-rail-bottom': 'preset=tour&captions=1&rail=bottom',
  'tour-overview': 'preset=tour&captions=1&overview=1&g=0',
  'tour-long-caption': 'preset=tour&captions=long&g=1',
  'axis-vertical-bottom-rail': 'axis=vertical',
  'scheme-auto-light': 'scheme=auto&accent=mint&captions=1', // run with the system in light mode
  // a caption renderer (plugin-captions) owns the band: one line, and far more than 40vh of text
  'custom-caption': 'custom=short',
  'custom-caption-tall': 'custom=tall',
  'reviewer-custom-caption': 'preset=reviewer&custom=short',
  'reviewer-custom-caption-tall': 'preset=reviewer&custom=tall',
  'editorial-custom-caption': 'preset=editorial&custom=short',
  'editorial-custom-caption-tall': 'preset=editorial&custom=tall',
  // docked controls (the reviewer's layout): gutter arrows, the item navigator on the item column or
  // at the end of the caption row
  'arrows-docked': 'arrows=docked&captions=1',
  'docked-no-plugins': 'arrows=docked&plugins=0&captions=1', // no item column: the caption row
  'docked-rail-left': 'arrows=docked&rail=left',
  'docked-rail-hidden': 'arrows=docked&rail=hidden&captions=1',
  'reviewer-wide': 'preset=reviewer&wide=1&custom=short',
  'reviewer-large-group': 'preset=reviewer&g=5&captions=1',
  // docked where the caption isn't a row under the stage: immersive (the stage's corner) and
  // editorial without a placard (the end of the caption column); one group (no group arrows, no
  // gutters); linear (no navigator, no room kept for it)
  'docked-immersive': 'preset=immersive&arrows=docked&captions=1&railopen=1',
  'docked-editorial': 'preset=editorial&arrows=docked&indicator=pills&captions=1',
  'docked-one-group': 'arrows=docked&groups=1&g=0&captions=1',
  'docked-linear': 'preset=reviewer&linear=1&captions=1',
}

// every configuration runs in every skin: skins set tokens (sizes included), so each needs the sweep
const SKINS = ['gallery', 'console', 'editorial'] as const

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  narrow: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
  // a phone turned sideways: wide but short, so the bar, caption and rail compete for 390px of height
  landscape: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
} as const

// One entry per independently placed piece of chrome. Containers that merely group other atoms are
// left out so a parent never "overlaps" its own children.
const ATOMS = [
  '.gallerist-counter',
  '.gallerist-title',
  '.gallerist-close',
  '.gallerist-zoom-reset',
  '.gallerist-region-toolbar > *',
  '.gallerist-prev',
  '.gallerist-next',
  '.gallerist-item-prev',
  '.gallerist-item-next',
  '.gallerist-position',
  '.gallerist-caption-text', // the caption's text (a placard caption also holds the item navigator)
  '.gallerist-captions', // a caption renderer's node, in place of the text
  '.gallerist-rail-toggle',
  '.gallerist-thumbs',
  '.gallerist-thumb-items:not(.gallerist-thumb-section > *)', // a section index holds its own, inside
  '.gallerist-navigator',
]
// Persistent chrome the stage must not sit under (immersive overlays them by design).
const RESERVED = [
  '.gallerist-bar',
  '.gallerist-thumbs',
  '.gallerist-thumb-items',
  '.gallerist-caption',
]

interface Box {
  sel: string
  label: string
  x: number
  y: number
  w: number
  h: number
  /** the element's full size, unclipped by scrolling ancestors (what a touch target is judged on) */
  fw: number
  fh: number
  button: boolean
  inStage: boolean
}

// Visible boxes only: hidden, collapsed and screen-reader-only (≤ 1px) elements are skipped, and
// each box is clipped by its scrolling ancestors (a toolbar or item stack that scrolls) so the part
// scrolled out of view doesn't count.
async function measure(page: Page, selectors: string[]): Promise<Box[]> {
  return page.evaluate((sels) => {
    const out: Box[] = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const clipped = (
          window as unknown as { __galleristClip: (e: Element) => DOMRect | null }
        ).__galleristClip(el)
        if (!clipped) continue
        const r = clipped
        if (r.width < 2 || r.height < 2) continue
        const label = `${sel}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`
        out.push({
          sel,
          label,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          fw: el.getBoundingClientRect().width,
          fh: el.getBoundingClientRect().height,
          button: el.tagName === 'BUTTON',
          inStage: !!el.closest('.gallerist-stage'),
        })
      }
    }
    return out
  }, selectors)
}

// window.__galleristClip(el): the element's rect intersected with every ancestor that clips its
// overflow (up to the viewer root), or null when nothing of it is visible.
async function installClip(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __galleristClip: (e: Element) => DOMRect | null }).__galleristClip = (
      el,
    ) => {
      let r = el.getBoundingClientRect()
      let x0 = r.left
      let y0 = r.top
      let x1 = r.right
      let y1 = r.bottom
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect()
          x0 = Math.max(x0, ar.left)
          y0 = Math.max(y0, ar.top)
          x1 = Math.min(x1, ar.right)
          y1 = Math.min(y1, ar.bottom)
        }
        if (a.classList.contains('gallerist')) break
      }
      if (x1 - x0 < 1 || y1 - y0 < 1) return null
      r = new DOMRect(x0, y0, x1 - x0, y1 - y0)
      return r
    }
  })
}

// The rail has drawn its cards and the layout has held still for two frames (rail contents and
// scroll, stage and caption band size), rather than a fixed delay.
async function railSettled(page: Page) {
  await expect(page.locator('.gallerist-thumbs > *').first()).toBeAttached()
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done))
    const snap = () => {
      const rail = document.querySelector('.gallerist-thumbs')
      const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height
      return [
        rail?.childElementCount,
        rail?.scrollLeft,
        rail?.scrollTop,
        box('.gallerist-stage'),
        box('.gallerist-caption'),
      ].join()
    }
    let last = snap()
    let still = 0
    for (let n = 0; still < 2; n++) {
      if (n === 120) throw new Error(`rail did not settle in 120 frames (${last})`)
      await frame()
      const now = snap()
      still = now === last ? still + 1 : 0
      last = now
    }
  })
}

const overlap = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1

test.describe('layout lint', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'geometry lint runs once (chromium)')

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    test.describe(vpName, () => {
      test.use(vp)
      for (const skin of SKINS)
        for (const [name, query] of Object.entries(CONFIGS)) {
          test(`${skin} ${name}`, async ({ page }) => {
            if (query.includes('scheme=auto')) await page.emulateMedia({ colorScheme: 'light' })
            await page.goto(`/layout.html?skin=${skin}&${query}`)
            await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
            await installClip(page)
            await page.waitForTimeout(150) // let images decode and the rail settle
            if (process.env.LAYOUT_SHOTS) {
              await page.waitForTimeout(700) // Chrome repaints scaled images at high quality after a beat
              await page.screenshot({
                path: `${process.env.LAYOUT_SHOTS}/${skin}-${vpName}-${name}.png`,
                animations: 'disabled', // settle transitions so shots are pixel-stable
              })
            }
            if (process.env.LAYOUT_STYLES) {
              const dump = await page.evaluate(() => {
                const props = [
                  'color',
                  'background-color',
                  'background-image',
                  'border-top-color',
                  'border-top-width',
                  'border-top-style',
                  'border-radius',
                  'box-shadow',
                  'outline-color',
                  'font-family',
                  'font-size',
                  'font-weight',
                  'line-height',
                  'letter-spacing',
                  'opacity',
                  'backdrop-filter',
                  'transform',
                  'display',
                  'visibility',
                  'padding',
                  'gap',
                  'text-align',
                  'z-index',
                ]
                const out: Record<string, Record<string, string>> = {}
                const els = [
                  document.querySelector('.gallerist'),
                  ...document.querySelectorAll('.gallerist *'),
                ]
                els.forEach((el, k) => {
                  if (!(el instanceof Element)) return
                  if (el.closest('svg') !== null && el.tagName.toLowerCase() !== 'svg') return
                  const cs = getComputedStyle(el)
                  const r = el.getBoundingClientRect()
                  const key = `${k}:${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`
                  const v: Record<string, string> = {
                    rect: [r.x, r.y, r.width, r.height].map(Math.round).join(','),
                  }
                  for (const prop of props) v[prop] = cs.getPropertyValue(prop)
                  out[key] = v
                })
                return out
              })
              const fs = await import('node:fs')
              fs.writeFileSync(
                `${process.env.LAYOUT_STYLES}/${skin}-${vpName}-${name}.json`,
                JSON.stringify(dump),
              )
            }

            const atoms = await measure(page, ATOMS)
            const vw = vp.viewport.width
            const vh = vp.viewport.height
            const touch = vpName !== 'desktop'
            const problems: string[] = []

            // 1. no two pieces of chrome overlap (ancestors are not atoms, see ATOMS)
            for (let i = 0; i < atoms.length; i++) {
              for (let j = i + 1; j < atoms.length; j++) {
                const a = atoms[i] as Box
                const b = atoms[j] as Box
                if (overlap(a, b)) problems.push(`overlap: ${a.label} × ${b.label}`)
              }
            }
            // 2. everything stays inside the viewport
            for (const a of atoms) {
              if (a.x < -1 || a.y < -1 || a.x + a.w > vw + 1 || a.y + a.h > vh + 1) {
                problems.push(`outside viewport: ${a.label}`)
              }
            }
            // 3. persistent chrome doesn't cover the stage (immersive overlays by design) and leaves it
            //    a usable size
            const [stage] = await measure(page, ['.gallerist-stage'])
            if (!query.includes('preset=immersive')) {
              for (const r of await measure(page, RESERVED)) {
                if (stage && overlap(stage, r)) problems.push(`covers the stage: ${r.label}`)
              }
            }
            if (!stage || stage.h < vh * 0.35 || stage.w < vw * 0.5) {
              problems.push(
                `stage too small: ${stage ? `${Math.round(stage.w)}×${Math.round(stage.h)}` : 'none'}`,
              )
            }
            // 4. every visible chrome button is the topmost element at its centre (nothing sits on it)
            const covered = await page.evaluate(() =>
              [...document.querySelectorAll<HTMLElement>('.gallerist button')]
                .filter((b) =>
                  b.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
                )
                .filter((b) => !b.closest('.gallerist-stage'))
                .filter((b) => {
                  const r = (
                    window as unknown as { __galleristClip: (e: Element) => DOMRect | null }
                  ).__galleristClip(b)
                  return !!r && r.width >= 2 && r.height >= 2 && r.x >= 0 && r.y >= 0
                })
                .flatMap((b) => {
                  const r = (
                    window as unknown as { __galleristClip: (e: Element) => DOMRect | null }
                  ).__galleristClip(b) as DOMRect
                  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                  if (!top || b === top || b.contains(top)) return []
                  return [
                    `${b.className || b.tagName}[${b.getAttribute('aria-label') ?? ''}] under ${top.className || top.tagName}`,
                  ]
                }),
            )
            for (const c of covered) problems.push(`covered: ${c}`)
            // 5. touch targets: every visible chrome button (user overlays in the stage are left out)
            if (touch) {
              for (const a of await measure(page, ['.gallerist button'])) {
                if (a.inStage || !a.button) continue
                if (a.fw < 43.5 || a.fh < 43.5) {
                  problems.push(
                    `touch target < 44px: ${a.label} (${Math.round(a.fw)}×${Math.round(a.fh)})`,
                  )
                }
              }
              // the item axis must be operable both ways without a keyboard
              const nav = await measure(page, ['.gallerist-itemnav'])
              if (nav.length) {
                const both = await measure(page, ['.gallerist-item-prev', '.gallerist-item-next'])
                if (both.length < 2)
                  problems.push('item axis: previous/next item not reachable on touch')
              }
            }
            // 6. one icon family: toolbar buttons carry the shared SVG icon, not a text glyph
            const glyphButtons = await page.evaluate(() =>
              [...document.querySelectorAll('.gallerist-region-toolbar > button')]
                .filter((b) => !b.querySelector('svg.gallerist-icon'))
                .map((b) => b.className),
            )
            for (const g of glyphButtons)
              problems.push(`toolbar button without the shared icon: ${g}`)
            // 7. no toggle for something that can't show: the item-stack toggle needs a visible aside
            // (a horizontal item row lives in the rail instead)
            const deadToggle = await page.evaluate(() => {
              const btn = document.querySelector<HTMLElement>('.gallerist-items-toggle')
              const aside = document.querySelector<HTMLElement>('.gallerist-region-aside')
              if (!btn || !aside || !btn.checkVisibility()) return false
              if (document.querySelector('.gallerist-thumb-items[data-axis="horizontal"]'))
                return false
              return getComputedStyle(aside).display === 'none'
            })
            if (deadToggle) problems.push('items toggle visible but the aside column cannot show')
            // 8. a collapsed rail also puts away its side stack
            const collapsedStack = await page.evaluate(
              () =>
                document.querySelector('.gallerist')?.getAttribute('data-gallerist-rail') ===
                  'collapsed' &&
                !!document.querySelector<HTMLElement>('.gallerist-thumb-items')?.checkVisibility(),
            )
            if (collapsedStack) problems.push('rail collapsed but its item stack is still showing')
            // 9. side rails stay on the physical side they're named after, in either direction
            for (const side of ['left', 'right'] as const) {
              if (!query.includes(`rail=${side}`)) continue
              const [rail] = await measure(page, ['.gallerist-thumbs'])
              if (rail && stage && (side === 'left' ? rail.x > stage.x : rail.x < stage.x)) {
                problems.push(`rail=${side} renders on the other side`)
              }
            }
            // 10. an empty bar takes no space
            if (
              query.includes('controls=0') &&
              query.includes('plugins=0') &&
              stage &&
              stage.y > 1
            ) {
              problems.push(`empty bar takes ${Math.round(stage.y)}px above the stage`)
            }
            expect(problems, problems.join('\n')).toEqual([])
          })
        }
    })
  }
})

// The reviewer preset (`arrows: 'docked'`): review needs every pixel, so no chrome control sits
// over the painted image, at any size, with or without a caption band, in every skin, both engines.
test.describe('reviewer: nothing over the media', () => {
  const SHOTS = {
    desktop: VIEWPORTS.desktop,
    phone: VIEWPORTS.phone,
    landscape: VIEWPORTS.landscape,
  }
  // the painted image (object-fit: contain inside the media element), in viewport px
  const paintedMedia = (page: Page) =>
    page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>(
        '.gallerist-content[data-gallerist-current] .gallerist-media-image',
      )
      if (!img?.naturalWidth) return null
      const r = img.getBoundingClientRect()
      const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, w, h }
    })
  const CHROME = [
    '.gallerist-bar',
    '.gallerist-region-toolbar > *',
    '.gallerist-prev',
    '.gallerist-next',
    '.gallerist-itemnav',
    '.gallerist-item-prev',
    '.gallerist-item-next',
    '.gallerist-position',
    '.gallerist-caption',
    '.gallerist-thumbs',
    '.gallerist-thumb-items',
    '.gallerist-rail-handle',
  ]
  for (const [vpName, vp] of Object.entries(SHOTS)) {
    test.describe(vpName, () => {
      test.use(vp)
      for (const skin of SKINS)
        for (const look of [
          'g=1',
          'g=1&custom=short',
          'g=1&custom=tall',
          'g=1&captions=1',
          'g=1&custom=short&wide=1', // a panorama fills the stage's width: the arrows' gutters
          'g=5&captions=1&dir=rtl',
          'g=1&custom=short&rail=hidden', // no item column: the navigator ends the caption row
          'g=1&captions=1&rail=left', // a side rail: a vertical group axis, both arrows at the end
          'g=1&custom=short&rail=right',
        ]) {
          test(`${skin} ${look}`, async ({ page }) => {
            await page.goto(`/layout.html?preset=reviewer&skin=${skin}&${look}`)
            await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
            await expect(page.locator('.gallerist-itemnav')).toBeVisible()
            await installClip(page)
            const problems: string[] = []
            // the first item, then the next one by its own ↓ (the item column and stage stay put)
            for (const step of ['first', 'next']) {
              if (step === 'next') await page.locator('.gallerist-item-next').click()
              await expect(
                page.locator('.gallerist-content[data-gallerist-current] .gallerist-media-image'),
              ).toHaveAttribute('data-gallerist-loaded', '')
              if (!look.includes('rail=hidden')) await railSettled(page)
              // the item's own entrance (a skin's slide or fade) has ended; an endless animation (a
              // loading shimmer, say) never finishes, so it isn't waited for
              await page.evaluate(() =>
                Promise.all(
                  document
                    .getAnimations()
                    .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
                    .map((a) => a.finished.catch(() => null)),
                ),
              )
              const media = await paintedMedia(page)
              if (!media) {
                problems.push(`${step}: no painted media`)
                continue
              }
              const box = { sel: 'media', label: 'media', ...media, fw: 0, fh: 0 }
              for (const c of await measure(page, CHROME)) {
                if (overlap(c, { ...box, button: false, inStage: true }))
                  problems.push(`${step}: ${c.label} over the media`)
              }
            }
            expect(problems, problems.join('\n')).toEqual([])
          })
        }
    })
  }

  test('the stage keeps its size between one-item and several-item groups', async ({ page }) => {
    for (const vp of [VIEWPORTS.desktop.viewport, VIEWPORTS.phone.viewport]) {
      await page.setViewportSize(vp)
      const sizes: string[] = []
      for (const g of [0, 1, 5]) {
        await page.goto(`/layout.html?preset=reviewer&skin=console&g=${g}`)
        await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
        await railSettled(page)
        const box = await page.locator('.gallerist-stage').boundingBox()
        sizes.push(`${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`)
      }
      expect(new Set(sizes).size, `${vp.width}px: ${sizes.join(' / ')}`).toBe(1)
    }
  })

  test('the item navigator heads the item column, and moves to the caption row without it', async ({
    page,
  }) => {
    await page.goto('/layout.html?preset=reviewer&skin=console&g=1&custom=short')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await railSettled(page)
    const where = () =>
      page.evaluate(() => {
        const box = (sel: string) =>
          document.querySelector(sel)?.getBoundingClientRect() ?? new DOMRect()
        const nav = box('.gallerist-itemnav')
        const items = box('.gallerist-region-aside .gallerist-thumb-items')
        const caption = box('.gallerist-caption')
        const stage = box('.gallerist-stage')
        return {
          aboveItems: nav.bottom <= items.top + 0.5 && nav.left >= items.left - 12,
          inCaptionRow:
            nav.top >= stage.bottom - 0.5 &&
            nav.top < caption.bottom &&
            nav.left >= caption.right - 0.5,
        }
      })
    expect(await where()).toEqual({ aboveItems: true, inCaptionRow: false })
    await page.keyboard.press('t') // collapse the rail: the item column goes with it
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-rail', 'collapsed')
    await expect.poll(async () => (await where()).inCaptionRow).toBe(true)
  })

  test('Tab reads the caption band, then the navigator that ends its row', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Tab order is DOM order; runs once (chromium)')
    // a tall caption renderer's band scrolls, so it takes focus
    await page.goto('/layout.html?preset=reviewer&skin=console&g=1&custom=tall&rail=hidden')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    const band = page.locator('.gallerist-caption[tabindex="0"]')
    await band.focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('.gallerist-item-prev')).toBeFocused()
  })

  test('one group: no group arrows, and the stage takes their gutters', async ({ page }) => {
    await page.goto('/layout.html?preset=reviewer&skin=console&groups=1&g=0&captions=1')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await expect(page.locator('.gallerist-prev')).toBeHidden()
    await expect(page.locator('.gallerist-next')).toBeHidden()
    const [stage, main] = await Promise.all(
      ['.gallerist-stage', '.gallerist-main'].map((s) => page.locator(s).boundingBox()),
    )
    expect(stage?.width).toBe(main?.width)
  })

  test('linear: the item column keeps no room for a navigator that never shows', async ({
    page,
  }) => {
    await page.goto('/layout.html?preset=reviewer&skin=console&linear=1&captions=1')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await railSettled(page)
    await expect(page.locator('.gallerist-region-aside .gallerist-thumb-items')).toBeVisible()
    await expect(page.locator('.gallerist-itemnav')).toBeHidden()
    await expect(page.locator('.gallerist-region-aside')).toHaveCSS('padding-top', '0px')
  })

  test('the docked navigator is a box in every skin, never a pill', async ({ page }) => {
    for (const skin of SKINS) {
      await page.goto(`/layout.html?preset=reviewer&skin=${skin}&g=1&captions=1&rail=hidden`)
      const nav = page.locator('.gallerist-itemnav')
      await expect(nav).toBeVisible()
      const { radius, h } = await nav.evaluate((n) => ({
        radius: Number.parseFloat(getComputedStyle(n).borderTopLeftRadius),
        h: n.getBoundingClientRect().height,
      }))
      expect(radius, skin).toBeLessThanOrEqual(h / 4)
    }
  })

  test('docked in other presets: editorial without a placard, immersive', async ({ page }) => {
    const box = (sel: string) =>
      page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON(), sel)
    // editorial: the navigator ends the caption column beside the work, under the caption
    await page.goto('/layout.html?preset=editorial&arrows=docked&indicator=pills&g=1&captions=1')
    await expect(page.locator('.gallerist-itemnav')).toBeVisible()
    await railSettled(page)
    let nav = await box('.gallerist-itemnav')
    const stage = await box('.gallerist-stage')
    const caption = await box('.gallerist-caption')
    expect(nav.left).toBeGreaterThanOrEqual(stage.right)
    expect(nav.top).toBeGreaterThanOrEqual(caption.bottom)
    expect(nav.bottom).toBeLessThanOrEqual(stage.bottom + 0.5)
    // immersive: the stage runs under every band; the navigator takes its bottom inline-end corner,
    // clear of the bar and the caption band, which keeps its full width
    await page.goto('/layout.html?preset=immersive&arrows=docked&g=1&captions=1&railopen=1')
    await expect(page.locator('.gallerist-itemnav')).toBeVisible()
    await railSettled(page)
    nav = await box('.gallerist-itemnav')
    const [bar, band, main] = await Promise.all(
      ['.gallerist-bar', '.gallerist-caption', '.gallerist-main'].map(box),
    )
    expect(nav.top).toBeGreaterThanOrEqual(bar.bottom)
    expect(nav.bottom).toBeLessThanOrEqual(band.top + 0.5)
    expect(nav.right).toBeLessThanOrEqual(main.right)
    expect(band.width).toBeCloseTo(main.width, 0)
  })
})

test.describe('layout behaviour', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'runs once (chromium)')

  test('a page override of a token wins in every skin, accent and on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // the compact layer is active
    for (const look of ['skin=console', 'skin=gallery&accent=mint', 'skin=console&scheme=light']) {
      await page.goto(`/layout.html?${look}`)
      await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
      await page.addStyleTag({
        content:
          '.gallerist { --gallerist-accent-dark: rgb(255, 0, 0); --gallerist-accent-light: rgb(255, 0, 0); --gallerist-thumb-h: 100px; }',
      })
      const got = await page.evaluate(() => {
        const root = document.querySelector('.gallerist') as HTMLElement
        const img = document.querySelector('.gallerist-thumbs .gallerist-thumb-img') as HTMLElement
        return [
          getComputedStyle(root).getPropertyValue('--gallerist-accent').trim(),
          Math.round(img.getBoundingClientRect().height),
        ]
      })
      expect(got, look).toEqual(['rgb(255, 0, 0)', 100])
    }
  })

  test('the item stack is in the side column when the viewer opens after mount', async ({
    page,
  }) => {
    await page.goto('/layout.html?late=1')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await expect(page.locator('.gallerist-region-aside .gallerist-thumb-items')).toBeVisible()
    await expect(page.locator('.gallerist-region-thumbnails .gallerist-thumb-items')).toHaveCount(0)
  })

  test('the zoom navigator appears when zoomed and pans where it is clicked', async ({ page }) => {
    await page.goto('/layout.html?preset=reviewer&skin=console')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    const navigator = page.locator('.gallerist-navigator')
    await expect(navigator).toBeHidden()
    await page.keyboard.press('+')
    await page.keyboard.press('+')
    await expect(navigator).toBeVisible()
    const box = await navigator.boundingBox()
    if (!box) throw new Error('no navigator')
    // the painted image's left/right edges relative to the stage's (the image is letterboxed in the stage)
    const imageEdgeGaps = () =>
      page.evaluate(() => {
        const img = document.querySelector(
          '.gallerist-content[data-gallerist-current] img',
        ) as HTMLImageElement
        const stage = document.querySelector('.gallerist-stage') as HTMLElement
        const r = img.getBoundingClientRect()
        const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
        const st = stage.getBoundingClientRect()
        const left = r.left + (r.width - img.naturalWidth * s) / 2
        return [left - st.left, st.right - (left + img.naturalWidth * s)]
      })
    await page.mouse.click(box.x + 2, box.y + box.height / 2) // the minimap's left edge
    await expect.poll(async () => Math.abs((await imageEdgeGaps())[0] ?? 99)).toBeLessThan(1.5)
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2) // its right edge
    await expect.poll(async () => Math.abs((await imageEdgeGaps())[1] ?? 99)).toBeLessThan(1.5)
    await page.keyboard.press('0')
    await expect(navigator).toBeHidden()
  })

  for (const [look, size] of [
    ['indicator=placard&captions=mixed', { width: 1280, height: 800 }],
    ['preset=editorial&skin=editorial&captions=mixed', { width: 560, height: 800 }],
    ['preset=editorial&skin=editorial&captions=mixed', { width: 1280, height: 800 }],
  ] as const) {
    test(`a placard keeps the stage's size across groups (${look}, ${size.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size)
      const heights: number[] = []
      for (const g of [0, 1, 5]) {
        await page.goto(`/layout.html?${look}&g=${g}`)
        await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
        const box = await page.locator('.gallerist-stage').boundingBox()
        heights.push(Math.round(box?.height ?? 0))
      }
      expect(new Set(heights).size, heights.join(' / ')).toBe(1)
    })
  }

  // plugin-captions owns the caption band: from the two-line minimum it grows with its content up to
  // 40vh (or until the stage is down to 36% of the viewer), then scrolls, and the stage gives up the
  // room. Stage, caption band, rail and toolbar never overlap, in each preset with its paired skin,
  // on a desktop and a phone.
  for (const [preset, skin] of [
    ['', 'gallery'],
    ['preset=reviewer', 'console'],
    ['preset=editorial', 'editorial'],
  ] as const) {
    for (const vp of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 844, height: 390 }, // a phone turned sideways
    ]) {
      test(`a custom caption band grows, then scrolls (${preset || 'default'}, ${skin}, ${vp.width}×${vp.height})`, async ({
        page,
      }) => {
        await page.setViewportSize(vp)
        const look = async (size: 'short' | 'tall') => {
          await page.goto(`/layout.html?skin=${skin}&${preset}&custom=${size}&g=1`)
          await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
          await expect(page.locator('.gallerist-caption .fixture-caption')).toBeVisible()
          await railSettled(page)
          return page.evaluate(() => {
            const box = (sel: string) => {
              const el = document.querySelector<HTMLElement>(sel)
              if (!el?.checkVisibility()) return null
              const r = el.getBoundingClientRect()
              return r.width < 1 || r.height < 1
                ? null
                : { sel, x: r.x, y: r.y, w: r.width, h: r.height }
            }
            const caption = document.querySelector('.gallerist-caption') as HTMLElement
            // the band, or the caption region inside a placard, is what scrolls
            const scroller = [caption, ...caption.querySelectorAll<HTMLElement>('*')].find((el) =>
              /auto|scroll/.test(getComputedStyle(el).overflowY),
            )
            let scrolled = 0
            if (scroller) {
              scroller.scrollTop = 100_000
              scrolled = scroller.scrollTop
              scroller.scrollTop = 0
            }
            return {
              boxes: [
                box('.gallerist-stage'),
                box('.gallerist-caption'),
                box('.gallerist-region-thumbnails'),
                box('.gallerist-bar'),
              ],
              placard:
                document.querySelector('.gallerist')?.getAttribute('data-gallerist-indicator') ===
                'placard',
              lineHeight: Number.parseFloat(getComputedStyle(caption).lineHeight),
              fontSize: Number.parseFloat(getComputedStyle(caption).fontSize),
              overflows: scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false,
              scrolled,
              vh: innerHeight,
            }
          })
        }
        const problems: string[] = []
        const stageH: Record<string, number> = {}
        for (const size of ['short', 'tall'] as const) {
          const got = await look(size)
          const [stage, caption, rail, bar] = got.boxes
          if (!stage || !caption) {
            problems.push(`${size}: no ${stage ? 'caption band' : 'stage'}`)
            continue
          }
          stageH[size] = stage.h
          const present = got.boxes.filter((b) => b !== null)
          for (let a = 0; a < present.length; a++)
            for (let b = a + 1; b < present.length; b++) {
              const p = present[a] as NonNullable<(typeof present)[number]>
              const q = present[b] as NonNullable<(typeof present)[number]>
              const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)
              const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y)
              if (ox > 1 && oy > 1) problems.push(`${size}: ${p.sel} overlaps ${q.sel}`)
            }
          if (!rail) problems.push(`${size}: no rail`)
          if (!bar) problems.push(`${size}: no toolbar`)
          if (stage.h < 120) problems.push(`${size}: stage crushed to ${Math.round(stage.h)}px`)
          if (got.placard) {
            // a placard keeps its slot: tall content scrolls inside it
            if (size === 'tall' && !(got.overflows && got.scrolled > 0))
              problems.push('tall: the placard does not scroll its caption')
            continue
          }
          if (size === 'short') {
            // the band keeps the two-line minimum and has nothing to scroll
            if (caption.h < 2 * got.lineHeight)
              problems.push(`short: band ${caption.h}px < 2 lines`)
            if (got.overflows) problems.push('short: band scrolls')
          } else {
            if (caption.h > got.vh * 0.4 + 1)
              problems.push(`tall: band ${Math.round(caption.h)}px > 40vh (${got.vh * 0.4}px)`)
            // it grows to 40vh, unless the stage reached its floor (36% of the viewer) first
            if (caption.h < got.vh * 0.4 - 1 && stage.h > got.vh * 0.36 + 2)
              problems.push(`tall: band ${Math.round(caption.h)}px stopped short of 40vh`)
            if (!(got.overflows && got.scrolled > 0)) problems.push('tall: band does not scroll')
          }
        }
        // the stage gives up the room a growing band takes (a placard keeps its size)
        const placard = (await look('short')).placard
        if (!placard && !((stageH.tall ?? 0) < (stageH.short ?? 0) - 10))
          problems.push(`stage did not shrink: ${stageH.short} -> ${stageH.tall}`)
        expect(problems, problems.join('\n')).toEqual([])
      })
    }
  }

  test('editorial with a side rail keeps a stage', async ({ page }) => {
    for (const rail of ['left', 'right']) {
      await page.goto(`/layout.html?preset=editorial&skin=editorial&rail=${rail}&captions=1`)
      await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
      const box = await page.locator('.gallerist-stage').boundingBox()
      expect(box?.height ?? 0, rail).toBeGreaterThan(300)
    }
  })

  test('RTL: the group arrows point the reading direction', async ({ page }) => {
    const flipped = async () =>
      page.evaluate(() =>
        ['.gallerist-prev', '.gallerist-next'].map(
          (sel) =>
            getComputedStyle(document.querySelector(`${sel} .gallerist-icon`) as Element).transform,
        ),
      )
    await page.goto('/layout.html?dir=rtl')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    expect(await flipped()).toEqual(['matrix(-1, 0, 0, 1, 0, 0)', 'matrix(-1, 0, 0, 1, 0, 0)'])
    await page.goto('/layout.html')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    expect(await flipped()).toEqual(['none', 'none'])
  })

  test('the stage keeps its size moving between captioned and uncaptioned items', async ({
    page,
  }) => {
    await page.goto('/layout.html?captions=mixed&g=4')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    const stageBox = () => page.locator('.gallerist-stage').boundingBox()
    const first = await stageBox()
    await page.keyboard.press('ArrowDown') // item 2 has no caption
    expect(await stageBox()).toEqual(first)
  })

  test('activating Reset zoom keeps keyboard focus in the viewer', async ({ page }) => {
    await page.goto('/layout.html')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await page.keyboard.press('+')
    await page.locator('.gallerist-zoom-reset').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.gallerist-zoom-reset')).toBeHidden()
    expect(await page.evaluate(() => !!document.activeElement?.closest('.gallerist'))).toBe(true)
    const before = await page.evaluate(
      () =>
        (
          window as unknown as { viewer: { getState(): { cursor: { g: number } } } }
        ).viewer.getState().cursor.g,
    )
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { viewer: { getState(): { cursor: { g: number } } } }
            ).viewer.getState().cursor.g,
        ),
      )
      .toBe(before + 1)
  })

  test('focus stays in the viewer when the item navigator hides under it', async ({ page }) => {
    await page.goto('/layout.html?g=2') // g2 has 2 items, g3 has 1
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
    await page.locator('.gallerist-item-next').focus()
    await page.keyboard.press('ArrowRight') // → single-item group: the navigator hides
    await expect(page.locator('.gallerist-itemnav')).toBeHidden()
    expect(await page.evaluate(() => !!document.activeElement?.closest('.gallerist'))).toBe(true)
  })
})
