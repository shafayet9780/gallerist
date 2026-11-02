import { type Page, expect } from '@playwright/test'

// `toBeVisible` passes as soon as the overlay exists, while it is still fading in over the page. Contrast
// measured then blends the backdrop with whatever is behind it, so wait for the settled phase.
export const viewerSettled = (page: Page) =>
  expect(page.locator('.gallerist[data-gallerist-phase="open"]').first()).toBeVisible()
