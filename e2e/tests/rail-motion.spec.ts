// The rail collapsing to its handle and coming back, and a stacked rail's item column opening and
// closing: the panel glides to its new size (plugin-thumbnails), so the stage beside it grows or
// shrinks a little each frame instead of jumping; under reduced motion it changes at once. Either
// way the hidden panel ends out of the tab order and the accessibility tree.
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

const REVIEWER = '/layout.html?preset=reviewer&skin=console&display=flat&custom=short'

// The glides run over 1s here (the token the panels read), so a slow, loaded frame rate still shows
// steps of the ones `frames` records.
const open = async (page: Page, query: string, duration = '1000ms') => {
  await page.goto(query)
  await viewerSettled(page)
  await expect(page.locator('.gallerist-thumb-item').first()).toBeVisible()
  await page.evaluate((d) => {
    ;(document.querySelector('.gallerist') as HTMLElement).style.setProperty(
      '--gallerist-dur-panel',
      d,
    )
  }, duration)
}

type Frame = { stage: number; panel: number; display: string; inert: boolean }

const ACTS = {
  toggle: '.gallerist-rail-toggle',
  items: '.gallerist-items-toggle',
} as const
type Act = keyof typeof ACTS

// Run `act` in the page, then record the stage's size along `dim` and the panel's, frame by frame,
// for `ms`.
const frames = (page: Page, act: Act, panel: string, dim: 'width' | 'height', ms = 1200) =>
  page.evaluate(
    async ({ toggle, panel, dim, ms }) => {
      const stage = document.querySelector('.gallerist-main') as HTMLElement
      const el = document.querySelector(panel) as HTMLElement
      const out: Frame[] = []
      const read = () =>
        out.push({
          stage: stage.getBoundingClientRect()[dim],
          panel: el.getBoundingClientRect()[dim],
          display: getComputedStyle(el).display,
          inert: el.inert,
        })
      read()
      ;(document.querySelector(toggle) as HTMLElement).click()
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r))
        read()
      }
      return out
    },
    { toggle: ACTS[act], panel, dim, ms },
  )

type Glide = {
  before: Frame
  after: Frame
  // the panel's animations of its size: their timing and their first and last keyframe, in px
  anims: Array<{
    duration: number
    delay: number
    rate: number
    easing: string
    from: number
    to: number
  }>
  // the page held at points along the glide (a fraction of its duration)
  samples: Array<Frame & { at: number }>
}

// Run `act` in the page and catch the panel's glide: the Web Animation on its size, then the stage
// and the panel held at points along it (the animation paused and scrubbed, so what is seen doesn't
// depend on how many frames a loaded browser draws), then finished and settled.
const glide = (page: Page, act: Act, panel: string, dim: 'width' | 'height') =>
  page.evaluate(
    async ({ toggle, panel, dim }): Promise<Glide> => {
      const stage = document.querySelector('.gallerist-main') as HTMLElement
      const el = document.querySelector(panel) as HTMLElement
      const read = (): Frame => ({
        stage: stage.getBoundingClientRect()[dim],
        panel: el.getBoundingClientRect()[dim],
        display: getComputedStyle(el).display,
        inert: el.inert,
      })
      const before = read()
      ;(document.querySelector(toggle) as HTMLElement).click()
      // the rail's glide starts once the viewer marks it collapsed (an observer, so a microtask on)
      const sized = () =>
        el
          .getAnimations()
          .filter((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => dim in k))
      let anims = sized()
      for (let k = 0; !anims.length && k < 10; k++) {
        await (k < 5 ? Promise.resolve() : new Promise((r) => requestAnimationFrame(r)))
        anims = sized()
      }
      const info = anims.map((a) => {
        const effect = a.effect as KeyframeEffect
        const kf = effect.getKeyframes()
        const timing = effect.getTiming()
        return {
          duration: Number(timing.duration),
          delay: Number(timing.delay),
          rate: a.playbackRate,
          easing: String(timing.easing),
          from: Number.parseFloat(String(kf[0]?.[dim])),
          to: Number.parseFloat(String(kf[kf.length - 1]?.[dim])),
        }
      })
      const samples: Glide['samples'] = []
      const anim = anims[0]
      if (anim) {
        anim.pause()
        const d = Number(anim.effect?.getTiming().duration)
        for (const at of [0, 0.25, 0.5, 0.75]) {
          anim.currentTime = at * d
          samples.push({ at, ...read() })
        }
        anim.finish()
      }
      // settled: the glide's end has run (the panel drops its mark), and a frame drawn after it
      const t0 = performance.now()
      while (el.hasAttribute('data-gallerist-glide') && performance.now() - t0 < 5000)
        await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))
      return { before, after: read(), anims: info, samples }
    },
    { toggle: ACTS[act], panel, dim },
  )

// The panel's size glided from where it was to where it ends, over the token's duration with the
// designed easing, and the stage beside it followed: at each point along the way it sits strictly
// between its first and last sizes, one way only, so nothing jumped.
const glided = (g: Glide) => {
  expect(g.anims, 'one animation on the panel size').toHaveLength(1)
  const [a] = g.anims
  expect(a?.duration).toBe(1000)
  expect(a?.delay, 'starts at once').toBe(0)
  expect(a?.rate, 'at its own pace').toBe(1)
  expect(a?.easing).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  expect(Math.abs((a?.from ?? -9) - g.before.panel), 'starts at its size').toBeLessThan(1)
  expect(Math.abs((a?.to ?? -9) - g.after.panel), 'ends at its new size').toBeLessThan(1)
  const first = g.before.stage
  const last = g.after.stage
  expect(Math.abs(last - first)).toBeGreaterThan(30)
  const dir = Math.sign(last - first)
  expect(g.samples.map((s) => s.at)).toEqual([0, 0.25, 0.5, 0.75])
  // held at 0: as it was, but for the 1px border a skin's rail keeps even at no size as it opens
  expect(Math.abs((g.samples[0]?.stage ?? -9) - first), 'held at 0: as it was').toBeLessThan(1.5)
  let prev = first
  for (const s of g.samples.slice(1)) {
    expect((s.stage - prev) * dir, `at ${s.at}: further on`).toBeGreaterThan(1)
    expect((last - s.stage) * dir, `at ${s.at}: not there yet`).toBeGreaterThan(1)
    prev = s.stage
  }
}

test('the handle collapses the row rail with a glide, and brings it back the same way', async ({
  page,
}) => {
  await open(page, REVIEWER)
  const region = page.locator('.gallerist-thumbs-region')
  const shut = await glide(page, 'toggle', '.gallerist-thumbs-region', 'height')
  glided(shut)
  // on its way out the rail is displayed but takes no focus; then it is gone (display: none)
  expect(shut.samples.every((f) => f.display !== 'none' && f.inert)).toBe(true)
  expect(shut.after.display).toBe('none')
  await expect(region).toBeHidden()
  await expect(region).not.toHaveAttribute('data-gallerist-glide')
  expect(await region.evaluate((el) => (el as HTMLElement).inert)).toBe(false)
  await expect(page.locator('.gallerist-rail-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.gallerist-thumb-item').first()).not.toBeInViewport()

  const back = await glide(page, 'toggle', '.gallerist-thumbs-region', 'height')
  glided(back)
  expect([...back.samples, back.after].every((f) => !f.inert)).toBe(true)
  await expect(region).toBeVisible()
  // back where it started
  expect(Math.abs(back.after.stage - shut.before.stage)).toBeLessThan(1)
})

test('reduced motion: the rail collapses and comes back at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, REVIEWER)
  const shut = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height', 120)
  expect(shut[1]?.display).toBe('none')
  expect(new Set(shut.slice(1).map((f) => Math.round(f.stage))).size).toBe(1)
  const back = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height', 120)
  expect(back[1]?.display).not.toBe('none')
  expect(new Set(back.slice(1).map((f) => Math.round(f.stage))).size).toBe(1)
})

test('a zoomed image stays zoomed, on the same spot, while the rail glides away and back', async ({
  page,
}) => {
  await open(page, `${REVIEWER}&zoom=2`)
  const zoom = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { viewer: { getState(): { zoom: { scale: number } } } }
        ).viewer.getState().zoom.scale,
    )
  expect(await zoom()).toBe(2)
  await frames(page, 'toggle', '.gallerist-thumbs-region', 'height')
  expect(await zoom()).toBe(2)
  await frames(page, 'toggle', '.gallerist-thumbs-region', 'height')
  expect(await zoom()).toBe(2)
})

test('`t` with focus on a thumbnail: focus goes to the viewer, not the page', async ({ page }) => {
  await open(page, REVIEWER)
  await page.locator('.gallerist-thumb-item[data-active]').focus()
  await page.keyboard.press('t')
  await expect(page.locator('.gallerist')).toBeFocused()
  await expect(page.locator('.gallerist-thumbs-region')).toBeHidden()
})

test('a side rail glides sideways', async ({ page }) => {
  await open(page, '/layout.html?rail=left&skin=console')
  const shut = await glide(page, 'toggle', '.gallerist-thumbs-region', 'width')
  glided(shut)
  await expect(page.locator('.gallerist-thumbs-region')).toBeHidden()
})

test("a stacked rail's item column glides shut and open beside the stage", async ({ page }) => {
  await open(page, '/layout.html?g=1')
  const column = page.locator('.gallerist-thumbs-aside .gallerist-thumb-items')
  await expect(column).toBeVisible()
  const shut = await glide(page, 'items', '.gallerist-thumbs-aside', 'width')
  glided(shut)
  // the stack stays (inert) while the column narrows, then goes
  expect(shut.samples.every((f) => f.inert)).toBe(true)
  await expect(column).toHaveCount(0)
  const back = await glide(page, 'items', '.gallerist-thumbs-aside', 'width')
  glided(back)
  await expect(column).toBeVisible()
  expect(Math.abs(back.after.stage - shut.before.stage)).toBeLessThan(1)
})

test('Enter on the focused handle collapses the rail and Enter again brings it back', async ({
  page,
}) => {
  for (const query of [REVIEWER, '/layout.html?g=1']) {
    await open(page, query)
    const handle = page.locator('.gallerist-rail-toggle')
    await handle.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-rail', 'collapsed')
    await expect(handle).toBeFocused() // the handle stays; so does focus on it
    await page.keyboard.press('Enter')
    await expect(page.locator('.gallerist')).toHaveAttribute('data-gallerist-rail', 'expanded')
  }
})

for (const reduced of [false, true]) {
  test(`\`t\` with focus in a stacked rail's item column: focus goes to the viewer, the keys work${
    reduced ? ' (reduced motion)' : ''
  }`, async ({ page }) => {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/layout.html?g=1')
    await page.locator('.gallerist-thumbs-aside .gallerist-thumb-item').nth(1).focus()
    await expect(page.locator('.gallerist-counter')).toHaveText('2 / 12')
    await page.keyboard.press('t')
    await expect(page.locator('.gallerist')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.gallerist-counter')).toHaveText('3 / 12')
  })
}

test('a --gallerist-dur-panel of 0 collapses the rail at once', async ({ page }) => {
  await open(page, REVIEWER, '0ms')
  const shut = await frames(page, 'toggle', '.gallerist-thumbs-region', 'height', 120)
  expect(shut[1]?.display).toBe('none')
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
})
