// The zoom tool (plugin-zoom): − 100% + in the toolbar, the + / - / 0 keys, a live percentage while
// a wheel or a double click zooms, and its unavailable states. The fixture is the reviewer preset in
// Console, as Apploye has it.
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { viewerSettled } from './settled'

const REVIEWER = '/layout.html?preset=reviewer&skin=console&display=flat&custom=short&zoom-tool=1'

const open = async (page: Page, query = REVIEWER) => {
  await page.goto(query)
  await viewerSettled(page)
  // the image has loaded: + is available
  await expect(page.locator('.gallerist-zoom-in')).not.toHaveAttribute('aria-disabled', 'true')
}
const out = (page: Page) => page.locator('.gallerist-zoom-out')
const level = (page: Page) => page.locator('.gallerist-zoom-level')
const into = (page: Page) => page.locator('.gallerist-zoom-in')
const scale = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { viewer: { getState(): { zoom: { scale: number } } } }
      ).viewer.getState().zoom.scale,
  )

test('the buttons step through the stops and the percentage fits again', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('group', { name: 'Zoom' })).toBeVisible()
  await expect(level(page)).toHaveText('100%')
  await expect(out(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(level(page)).toHaveAttribute('aria-disabled', 'true')
  await into(page).click()
  await expect(level(page)).toHaveText('150%')
  await expect(level(page)).toHaveAccessibleName('150%, fit to screen')
  expect(await scale(page)).toBe(1.5)
  // the renderer's own reset button stays out of the bar: the percentage does its job
  await expect(page.locator('.gallerist-zoom-reset')).toBeHidden()
  for (const step of ['200%', '300%', '400%']) {
    await into(page).click()
    await expect(level(page)).toHaveText(step)
  }
  await expect(into(page)).toHaveAttribute('aria-disabled', 'true')
  await into(page).dispatchEvent('click') // still focusable and pressable: it does nothing
  expect(await scale(page)).toBe(4)
  await out(page).click()
  await expect(level(page)).toHaveText('300%')
  // Enter on the percentage fits the image; the focus stays on it
  await level(page).focus()
  await page.keyboard.press('Enter')
  await expect(level(page)).toHaveText('100%')
  expect(await scale(page)).toBe(1)
  await expect(level(page)).toBeFocused()
})

test('+ / = and - step the same stops, 0 fits; a key in a field is the field’s', async ({
  page,
}) => {
  await open(page)
  await page.locator('.gallerist').focus()
  await page.keyboard.press('+')
  await expect(level(page)).toHaveText('150%')
  await page.keyboard.press('=')
  await expect(level(page)).toHaveText('200%')
  await page.keyboard.press('-')
  await expect(level(page)).toHaveText('150%')
  expect(await scale(page)).toBe(1.5)
  await page.keyboard.press('0')
  await expect(level(page)).toHaveText('100%')
  // a text field in the viewer keeps its keys
  await page.evaluate(() => {
    const field = document.createElement('input')
    field.id = 'note'
    document.querySelector('.gallerist-caption')?.append(field)
  })
  await page.locator('#note').focus()
  await page.keyboard.type('+-0=')
  await expect(page.locator('#note')).toHaveValue('+-0=')
  expect(await scale(page)).toBe(1)
})

test('the percentage follows a wheel zoom while it moves, and a double click', async ({ page }) => {
  await open(page)
  const stage = await page.locator('.gallerist-stage').boundingBox()
  if (!stage) throw new Error('no stage')
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2)
  // a short burst: the renderer commits it only once the wheel rests
  const seen = await page.evaluate(async () => {
    const stageEl = document.querySelector('.gallerist-stage') as HTMLElement
    const r = stageEl.getBoundingClientRect()
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
    for (let k = 0; k < 4; k++)
      stageEl.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true, ...at }),
      )
    for (let k = 0; k < 3; k++) await new Promise((r) => requestAnimationFrame(r))
    const v = (window as unknown as { viewer: { getState(): { zoom: { scale: number } } } }).viewer
    return {
      shown: document.querySelector('.gallerist-zoom-level')?.textContent,
      committed: v.getState().zoom.scale,
    }
  })
  expect(seen.committed).toBe(1) // not committed yet…
  expect(seen.shown).toBe('175%') // …but shown: 1.15⁴ ≈ 1.75
  await expect.poll(() => scale(page)).toBeGreaterThan(1.7)
  await expect(level(page)).toHaveText('175%')
  await page.locator('.gallerist').focus()
  await page.keyboard.press('0')
  await expect(level(page)).toHaveText('100%')
  await page.mouse.dblclick(stage.x + stage.width / 2, stage.y + stage.height / 2)
  await expect.poll(() => scale(page)).toBeGreaterThan(1)
  await expect(level(page)).toHaveText(`${Math.round((await scale(page)) * 100)}%`)
})

test('another group shows its own zoom (an item of the same group keeps it)', async ({ page }) => {
  await open(page)
  await into(page).click()
  await expect(level(page)).toHaveText('150%')
  await page.locator('.gallerist').focus()
  await page.keyboard.press('ArrowRight') // the next item of the same group
  await expect(level(page)).toHaveText('150%')
  await page.keyboard.press('End') // the last group
  await expect(level(page)).toHaveText('100%')
})

test('without the plugin, the renderer’s reset button works as before', async ({ page }) => {
  await page.goto('/layout.html?preset=reviewer&skin=console&display=flat&zoom=2')
  await viewerSettled(page)
  await expect(page.locator('.gallerist-zoom-tool')).toHaveCount(0)
  await expect(page.locator('.gallerist-zoom-reset')).toBeVisible()
  await page.locator('.gallerist-zoom-reset').click()
  expect(await scale(page)).toBe(1)
})

for (const scheme of ['dark', 'light']) {
  test(`no axe violations in the bar with the tool (${scheme})`, async ({ page }) => {
    await open(page, `${REVIEWER}&scheme=${scheme}`)
    await into(page).click()
    const results = await new AxeBuilder({ page })
      .include('.gallerist-bar')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
}

test('a hidden tool stays hidden: [hidden] wins over its display', async ({ page }) => {
  await open(page)
  const tool = page.locator('.gallerist-zoom-tool')
  await expect(tool).toBeVisible()
  await tool.evaluate((el) => {
    ;(el as HTMLElement).hidden = true
  })
  await expect(tool).toBeHidden()
  // a phone that keeps the tool keeps a hidden one hidden too
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addStyleTag({ content: '.gallerist { --gallerist-phone-zoom: flex }' })
  await expect(tool).toBeHidden()
  await tool.evaluate((el) => {
    ;(el as HTMLElement).hidden = false
  })
  await expect(tool).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the tool leaves the bar (a pinch zooms), and the page can keep it', async ({ page }) => {
    await open(page, `${REVIEWER}&view=1`)
    await expect(page.locator('.gallerist-zoom-tool')).toBeHidden()
  })

  test('kept: − and + stay (the percentage goes), and every tool can be reached', async ({
    page,
  }) => {
    await open(page, `${REVIEWER}&view=1`)
    await page.addStyleTag({ content: '.gallerist { --gallerist-phone-zoom: flex }' })
    await expect(level(page)).toBeHidden()
    await expect(out(page)).toBeVisible()
    await expect(into(page)).toBeVisible()
    await into(page).tap()
    expect(await scale(page)).toBe(1.5)
    // the strip scrolls sideways where the tools don't fit: each one scrolls into view whole
    for (const tool of await page.locator('.gallerist-region-toolbar button:visible').all()) {
      await tool.scrollIntoViewIfNeeded()
      await expect(tool).toBeInViewport({ ratio: 1 })
    }
  })
})

test('right to left: the group mirrors with the bar', async ({ page }) => {
  await open(page, `${REVIEWER}&dir=rtl`)
  const [a, b] = await Promise.all([out(page).boundingBox(), into(page).boundingBox()])
  expect((a?.x ?? 0) > (b?.x ?? 0)).toBe(true) // − at the inline start: the right
  await into(page).click()
  await expect(level(page)).toHaveText('150%')
})

test('the keys are the View popover’s while it is open: - and 0 don’t zoom behind it', async ({
  page,
}) => {
  await open(page, `${REVIEWER}&view=1`)
  await page.locator('.gallerist').focus()
  await page.keyboard.press('+')
  expect(await scale(page)).toBe(1.5)
  await page.locator('.gallerist-view-btn').click()
  const menu = page.getByRole('dialog', { name: 'View', exact: true })
  await expect(menu).toBeVisible()
  await page.getByRole('radio', { checked: true }).first().focus()
  for (const key of ['-', '0', '+']) await page.keyboard.press(key)
  expect(await scale(page)).toBe(1.5)
  await expect(menu).toBeVisible()
})

test('a host slider in the viewer keeps its own + and -', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    slider.tabIndex = 0
    slider.className = 'host-slider'
    slider.dataset.value = '5'
    slider.addEventListener('keydown', (e) => {
      if (e.key !== '+' && e.key !== '-') return
      slider.dataset.value = String(Number(slider.dataset.value) + (e.key === '+' ? 1 : -1))
      e.preventDefault()
    })
    document.querySelector('.gallerist')?.append(slider)
  })
  await page.locator('.host-slider').focus()
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect(page.locator('.host-slider')).toHaveAttribute('data-value', '7')
  expect(await scale(page)).toBe(1)
})

test('with the tool hidden, the renderer’s reset shows while zoomed', async ({ page }) => {
  await open(page)
  await page.locator('.gallerist-zoom-tool').evaluate((el) => {
    ;(el as HTMLElement).hidden = true
  })
  await page.locator('.gallerist').focus()
  await page.keyboard.press('+')
  await expect(page.locator('.gallerist-zoom-reset')).toBeVisible()
})

test.describe('on a phone, zoomed', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the renderer’s reset shows (the tool and its percentage are out of the bar)', async ({
    page,
  }) => {
    await open(page, `${REVIEWER}&zoom=2`)
    await expect(page.locator('.gallerist-zoom-tool')).toBeHidden()
    await expect(page.locator('.gallerist-zoom-reset')).toBeVisible()
  })
})
