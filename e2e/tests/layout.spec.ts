import { type Page, expect, test } from '@playwright/test'

// Layout lint (plan P2-K): sweep chrome configurations × viewport × direction and assert that no two
// pieces of chrome overlap, nothing leaves the viewport, the stage is not covered by persistent
// chrome, and touch targets are at least 44px on a phone. Geometry checks are deterministic across
// platforms (unlike screenshot baselines). Set LAYOUT_SHOTS=<dir> to also save a screenshot of every
// configuration for visual review.

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
  'single-item-group': 'g=0',
  'large-group': 'g=5',
  'rtl-reviewer': 'preset=reviewer&dir=rtl&captions=1',
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
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
  '.gallerist-caption',
  '.gallerist-rail-toggle',
  '.gallerist-thumbs',
  '.gallerist-thumb-items',
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
  button: boolean
}

async function measure(page: Page, selectors: string[]): Promise<Box[]> {
  return page.evaluate((sels) => {
    const out: Box[] = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue // collapsed or visually hidden (screen-reader only)
        const label = `${sel}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`
        out.push({
          sel,
          label,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          button: el.tagName === 'BUTTON',
        })
      }
    }
    return out
  }, selectors)
}

const overlap = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1

test.describe('layout lint', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'geometry lint runs once (chromium)')

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    test.describe(vpName, () => {
      test.use(vp)
      for (const [name, query] of Object.entries(CONFIGS)) {
        test(name, async ({ page }, info) => {
          await page.goto(`/layout.html?${query}`)
          await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-phase', 'open')
          await page.waitForTimeout(150) // let images decode and the rail settle
          if (process.env.LAYOUT_SHOTS) {
            await page.screenshot({ path: `${process.env.LAYOUT_SHOTS}/${vpName}-${name}.png` })
          }

          const atoms = await measure(page, ATOMS)
          const vw = vp.viewport.width
          const vh = vp.viewport.height
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
          // 3. the stage is not covered by persistent chrome (immersive overlays by design)
          if (!query.includes('preset=immersive')) {
            const [stage] = await measure(page, ['.gallerist-stage'])
            for (const r of await measure(page, RESERVED)) {
              if (stage && overlap(stage, r)) problems.push(`covers the stage: ${r.label}`)
            }
          }
          // 4. touch targets on a phone
          if (vpName === 'phone') {
            for (const a of atoms) {
              if (a.button && (a.w < 43.5 || a.h < 43.5)) {
                problems.push(
                  `touch target < 44px: ${a.label} (${Math.round(a.w)}×${Math.round(a.h)})`,
                )
              }
            }
          }
          info.annotations.push({ type: 'atoms', description: String(atoms.length) })
          expect(problems, problems.join('\n')).toEqual([])
        })
      }
    })
  }
})

test('RTL: the group arrows point the reading direction', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'geometry lint runs once (chromium)')
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
