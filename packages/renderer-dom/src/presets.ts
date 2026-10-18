// Layout presets (M14 UX-E). A preset bundles a coherent set of layout choices — arrow placement,
// chrome auto-hide, and the thumbnail rail's secondary-axis layout / time-ribbon — behind a single
// name. Pure resolver (no DOM): the renderer applies `rootAttrs` + `arrows`/`autoHide`, and a host
// (or the React adapter) spreads `thumbnails` into the thumbnails() plugin.

import type { ArrowLayout, RailPlacement } from './mount'

export type PresetName = 'filmstrip' | 'immersive' | 'reviewer' | 'contact'

export interface ResolvedPreset {
  /** data-* attributes the renderer sets on the root (drives the theme). */
  rootAttrs: Record<string, string>
  /** default arrow placement (overridable by an explicit mount option). */
  arrows: ArrowLayout
  /** default chrome auto-hide-on-idle (overridable). */
  autoHide: boolean
  /** default thumbnail rail placement (overridable). */
  rail: RailPlacement
  /** preferred thumbnails() options for this preset. */
  thumbnails: { itemAxis: 'vertical' | 'horizontal'; groupDisplay?: 'stacked' | 'flat' }
}

const PRESETS: Record<PresetName, ResolvedPreset> = {
  // classic lightbox: bottom rail, side arrows, persistent chrome.
  filmstrip: {
    rootAttrs: { 'data-gallerist-preset': 'filmstrip' },
    arrows: 'pill-right',
    autoHide: false,
    rail: 'bottom',
    thumbnails: { itemAxis: 'vertical' },
  },
  // full-bleed: rail hidden by default, chrome auto-hides on idle, minimal UI.
  immersive: {
    rootAttrs: { 'data-gallerist-preset': 'immersive' },
    arrows: 'pill-right',
    autoHide: true,
    rail: 'hidden',
    thumbnails: { itemAxis: 'vertical' },
  },
  // time-series reviewer: bottom timeline rail with labels, corner arrow cluster.
  reviewer: {
    rootAttrs: { 'data-gallerist-preset': 'reviewer' },
    arrows: 'corner-br',
    autoHide: false,
    rail: 'bottom',
    thumbnails: { itemAxis: 'vertical' },
  },
  // browse-heavy: a vertical rail down the right edge (pairs well with the grid plugin).
  contact: {
    rootAttrs: { 'data-gallerist-preset': 'contact' },
    arrows: 'pill-right',
    autoHide: false,
    rail: 'right',
    thumbnails: { itemAxis: 'vertical' },
  },
}

/** Resolve a preset name to its layout config; unknown names warn (dev) and fall back to `filmstrip`. */
export function resolvePreset(name: string): ResolvedPreset {
  const preset = PRESETS[name as PresetName]
  if (!preset && typeof console !== 'undefined') {
    console.warn(`[gallerist] unknown preset "${name}" — falling back to "filmstrip"`)
  }
  return preset ?? PRESETS.filmstrip
}
