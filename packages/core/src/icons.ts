// The one icon family for the renderer's chrome and the official plugins' toolbar buttons (plan
// M15: no Unicode glyphs). Static SVG markup strings — no DOM here, so core stays DOM-free; callers
// set them via innerHTML on buttons they create (constant strings, no user data). Lucide-style
// paths (MIT), 24px grid, 2px stroke, currentColor.

const svg = (body: string): string =>
  `<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`

export const ICONS = {
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  itemPrev: svg('<path d="m6 15 6-6 6 6"/>'),
  itemNext: svg('<path d="m6 9 6 6 6-6"/>'),
  // magnifier with a minus: "back to fit" (corner brackets read as fullscreen — UX review)
  zoomReset: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>'),
  // rail collapse toggle (chevron; the theme rotates it when collapsed)
  collapse: svg('<path d="m6 9 6 6 6-6"/>'),
  // toolbar buttons of the official plugins
  fullscreen: svg(
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  ),
  grid: svg(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ),
  download: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  // a side panel of stacked items (the thumbnails item-stack toggle)
  itemStack: svg(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="M18 8h0M18 12h0M18 16h0"/>',
  ),
} as const

export type IconName = keyof typeof ICONS
