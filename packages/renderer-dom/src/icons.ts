// Inline SVG chrome icons (M14 UX-D). Replaces the Unicode `::before` glyphs (which rendered
// inconsistently — the U+02C4/02C5 arrowheads looked broken). Static constant strings, set via
// innerHTML on buttons we create — no user data, no injection surface. Lucide-style paths (MIT).

const svg = (body: string): string =>
  `<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`

export const ICONS = {
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  itemPrev: svg('<path d="m6 15 6-6 6 6"/>'),
  itemNext: svg('<path d="m6 9 6 6 6-6"/>'),
  // fit-to-frame corner brackets — reads as "reset / fit view".
  zoomReset: svg(
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  ),
  // rail collapse toggle (chevron; theme rotates it when collapsed). Used by U5.
  collapse: svg('<path d="m6 9 6 6 6-6"/>'),
} as const

export type IconName = keyof typeof ICONS
