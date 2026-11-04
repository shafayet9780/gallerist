import { expect, test } from '@playwright/test'

// The global build as a page without a bundler uses it: a script tag and data-gallerist links.
// Needs `pnpm build` first (CI builds before e2e).

test('a script tag and data-gallerist links open a working viewer', async ({ page }) => {
  await page.setContent(`
    <a id="one" href="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-gallerist="trip" data-gallerist-group="r"
       data-gallerist-group-caption="Room"><img alt="First" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>
    <a id="two" href="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-gallerist="trip" data-gallerist-group="r"
       data-gallerist-alt="Second">two</a>
    <a id="three" href="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-gallerist="trip">three</a>`)
  await page.addStyleTag({ path: 'packages/theme-default/src/base.css' })
  await page.addScriptTag({ path: 'packages/cdn/dist/gallerist.umd.js' })
  await page.evaluate(() => {
    const G = (window as unknown as { Gallerist: Record<string, (...a: unknown[]) => unknown> })
      .Gallerist
    ;(window as unknown as { bound: unknown }).bound = G.bind?.({
      viewer: { plugins: [G.thumbnails?.({ groupDisplay: 'index' })] },
      mount: { preset: 'tour' },
    })
  })
  await page.locator('#two').click()
  await expect(page.locator('.gallerist')).toBeVisible()
  await expect(page).toHaveURL('about:blank') // the link didn't navigate
  await expect(page.locator('.gallerist-title')).toHaveText('Room')
  await expect(page.locator('.gallerist-thumb-item')).toHaveCount(2)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.gallerist-counter')).toHaveText('2 / 2')
  await page.keyboard.press('Escape')
  await expect(page.locator('.gallerist')).toBeHidden()
  await expect(page.locator('#two')).toBeFocused()
})
