import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The docs site: its playground and sheet must keep up with the library's real options.
test.use({ baseURL: 'http://localhost:5174' })
test.skip(({ browserName }) => browserName !== 'chromium', 'runs once (chromium)')

const root = '#stage .gallerist'

test('the playground applies skin, preset, accent and scheme, and shows the code', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/index.html')
  await expect(page.locator(root)).toHaveAttribute('data-gallerist-preset', 'filmstrip')

  await page.locator('input[name="skin"][value="console"]').check()
  await expect(page.locator(root)).toHaveAttribute('data-gallerist-skin', 'console')
  await expect(page.locator('#snippet')).toContainText("skin: 'console'")
  await expect(page.locator('#snippet')).toContainText('theme-default/console.css')

  await page.locator('input[name="accent"][value="cyan"]').check()
  await expect(page.locator(root)).toHaveAttribute('data-gallerist-accent', 'cyan')

  await page.locator('input[name="preset"][value="tour"]').check()
  await expect(page.locator(`${root} .gallerist-thumb-row`)).toHaveCount(3)
  await page.locator('input[name="scheme"][value="light"]').check()
  await expect(page.locator(root)).toHaveAttribute('data-gallerist-scheme', 'light')
  expect(errors).toEqual([])
})

test('every skin × preset renders without an error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/index.html')
  for (const skin of ['gallery', 'console', 'editorial']) {
    await page.locator(`input[name="skin"][value="${skin}"]`).check()
    for (const preset of ['filmstrip', 'reviewer', 'immersive', 'contact', 'editorial', 'tour']) {
      await page.locator(`input[name="preset"][value="${preset}"]`).check()
      await expect(page.locator(root)).toHaveAttribute('data-gallerist-preset', preset)
      await expect(page.locator(root)).toHaveAttribute('data-gallerist-skin', skin)
    }
  }
  expect(errors).toEqual([])
})

test('a pairing sets all the controls; position survives a change', async ({ page }) => {
  await page.goto('/index.html')
  await page.locator('#stage .gallerist-next').click()
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.locator('input[name="preset"][value="reviewer"]')).toBeChecked()
  await expect(page.locator('input[name="skin"][value="console"]')).toBeChecked()
  await expect(page.locator(`${root} .gallerist-title`)).toHaveText('Afternoon')
})

test('closing the viewer offers the way back', async ({ page }) => {
  await page.goto('/index.html')
  await page.locator(`${root} .gallerist-close`).click()
  const reopen = page.getByRole('button', { name: 'Open the viewer again' })
  await reopen.click()
  await expect(reopen).toBeHidden()
  await page.keyboard.press('ArrowRight') // focus landed back in the viewer
  await expect(page.locator(`${root} .gallerist-title`)).toHaveText('Afternoon')
  await expect(page.locator(`${root} .gallerist-close`)).toBeVisible()
})

test('the sheet follows the core: next group, next item, and item memory', async ({ page }) => {
  await page.goto('/index.html')
  const current = page.locator('.sheet-cell[aria-current]')
  await expect(current).toHaveAttribute('aria-label', 'Morning, photo 1')
  await page.locator('#down').click()
  await expect(current).toHaveAttribute('aria-label', 'Morning, photo 2')
  await page.locator('#right').click()
  await expect(current).toHaveAttribute('aria-label', 'Afternoon, photo 1')
  await page.locator('#memory').selectOption('preserve')
  await page.locator('#down').click()
  await page.locator('#left').click()
  await expect(current).toHaveAttribute('aria-label', 'Morning, photo 2')
})

test('docs render, and links between pages stay on the site', async ({ page }) => {
  await page.goto('/docs.html')
  await expect(page.locator('#doc h1')).toHaveText('Getting started')
  await page.locator('#doc a', { hasText: 'Presets and layout' }).click()
  await expect(page).toHaveURL(/#presets$/)
  await expect(page.locator('#doc h1')).toContainText('Layout presets')
  await page.locator('#doc-nav a', { hasText: 'Writing a plugin' }).click()
  await expect(page.locator('#doc h1')).toBeVisible()
  await expect(page.locator('#doc-nav a[aria-current]')).toHaveText('Writing a plugin')
})

for (const path of ['/index.html', '/docs.html', '/docs.html#presets']) {
  test(`no axe violations outside the viewer: ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main').first()).toBeVisible()
    const { violations } = await new AxeBuilder({ page }).exclude('#stage').analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([])
  })
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const path of ['/index.html', '/docs.html#presets']) {
    test(`no sideways scroll: ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('main').first()).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})
