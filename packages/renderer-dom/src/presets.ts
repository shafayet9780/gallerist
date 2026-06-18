// Layout presets (M14 UX-E). A preset bundles a coherent set of layout choices — arrow placement,
// chrome auto-hide, and the thumbnail rail's secondary-axis layout / time-ribbon — behind a single
// name. Pure resolver (no DOM): the renderer applies `rootAttrs` + `arrows`/`autoHide`, and a host
// (or the React adapter) spreads `thumbnails` into the thumbnails() plugin.

import type { ArrowLayout } from './mount'

export type PresetName = 'filmstrip' | 'immersive' | 'reviewer' | 'contact'

export interface ResolvedPreset {
  /** data-* attributes the renderer sets on the root (drives the theme). */
  rootAttrs: Record<string, string>
  /** default arrow placement (overridable by an explicit mount option). */
  arrows: ArrowLayout
  /** default chrome auto-hide-on-idle (overridable). */
  autoHide: boolean
  /** preferred thumbnails() options for this preset. */
  thumbnails: { itemAxis: 'vertical' | 'horizontal'; ticks: boolean }
}

const PRESETS: Record<PresetName, ResolvedPreset> = {
  // classic lightbox: side arrows, persistent chrome, vertical item column.
  filmstrip: {
    rootAttrs: { 'data-visora-preset': 'filmstrip' },
    arrows: 'pill-right',
    autoHide: false,
    thumbnails: { itemAxis: 'vertical', ticks: false },
  },
  // full-bleed: chrome auto-hides on idle, minimal UI.
  immersive: {
    rootAttrs: { 'data-visora-preset': 'immersive' },
    arrows: 'pill-right',
    autoHide: true,
    thumbnails: { itemAxis: 'vertical', ticks: false },
  },
  // time-series reviewer: corner arrow cluster, persistent chrome, time-ribbon ticks.
  reviewer: {
    rootAttrs: { 'data-visora-preset': 'reviewer' },
    arrows: 'corner-br',
    autoHide: false,
    thumbnails: { itemAxis: 'vertical', ticks: true },
  },
  // browse-heavy / grid-first (the host opens the grid plugin); rail stays available.
  contact: {
    rootAttrs: { 'data-visora-preset': 'contact' },
    arrows: 'pill-right',
    autoHide: false,
    thumbnails: { itemAxis: 'vertical', ticks: false },
  },
}

/** Resolve a preset name to its layout config; unknown names warn (dev) and fall back to `filmstrip`. */
export function resolvePreset(name: string): ResolvedPreset {
  const preset = PRESETS[name as PresetName]
  if (!preset && typeof console !== 'undefined') {
    console.warn(`[visora] unknown preset "${name}" — falling back to "filmstrip"`)
  }
  return preset ?? PRESETS.filmstrip
}
