// Layout presets (M14 UX-E). A preset bundles a coherent set of layout choices — arrow placement,
// chrome auto-hide, and the thumbnail rail's secondary-axis layout / time-ribbon — behind a single
// name. Pure resolver (no DOM): the renderer applies `rootAttrs` + `arrows`/`autoHide`, and hands
// the preset to plugin regions (RegionCtx.preset), so thumbnails() takes `thumbnails` as defaults.

import type { ArrowLayout, GroupAxis, ItemIndicator, RailPlacement } from './mount'

export type PresetName = 'filmstrip' | 'immersive' | 'reviewer' | 'contact' | 'editorial' | 'tour'

// A type alias, not an interface, so it is a core `PresetDefaults` (the region context's `preset`).
export type ResolvedPreset = {
  /** data-* attributes the renderer sets on the root (drives the theme). */
  rootAttrs: Record<string, string>
  /** default arrow placement (overridable by an explicit mount option). */
  arrows: ArrowLayout
  /** default chrome auto-hide-on-idle (overridable). */
  autoHide: boolean
  /** default thumbnail rail placement (overridable). */
  rail: RailPlacement
  /** thumbnails() defaults: the plugin applies them to the options it wasn't given. */
  thumbnails: {
    itemAxis: 'vertical' | 'horizontal'
    groupDisplay?: 'stacked' | 'flat' | 'index'
    timeline?: boolean
    numberItems?: boolean
  }
  /** turn on the zoom navigator by default (overridable). */
  navigator?: boolean
  /** frame the media (overridable). */
  frame?: boolean
  /** default item indicator (overridable). */
  itemIndicator?: ItemIndicator
  /** which arrow keys and on-screen arrows move between groups, if not the rail's own (overridable). */
  groupAxis?: GroupAxis
  /** name the group arrows after the group they go to (overridable). */
  arrowLabels?: boolean
}

const PRESETS: Record<PresetName, ResolvedPreset> = {
  // classic lightbox: bottom rail, side arrows, persistent chrome.
  filmstrip: {
    rootAttrs: { 'data-gallerist-preset': 'filmstrip' },
    arrows: 'pill-right',
    autoHide: false,
    rail: 'bottom',
    thumbnails: { itemAxis: 'vertical' },
    navigator: false,
  },
  // full-bleed: rail hidden by default, chrome auto-hides on idle, minimal UI.
  immersive: {
    rootAttrs: { 'data-gallerist-preset': 'immersive' },
    arrows: 'pill-right',
    autoHide: true,
    rail: 'hidden',
    thumbnails: { itemAxis: 'vertical' },
    navigator: false,
  },
  // time-series reviewer: a bottom timeline rail (a time over each group, from group.meta.time),
  // numbered items, a corner arrow cluster and the zoom navigator.
  reviewer: {
    rootAttrs: { 'data-gallerist-preset': 'reviewer' },
    arrows: 'corner-br',
    autoHide: false,
    rail: 'bottom',
    thumbnails: { itemAxis: 'vertical', timeline: true, numberItems: true },
    navigator: true,
  },
  // a gallery wall: the work framed with room around it, a placard beside it (caption + item
  // navigator), numbered items inline in a bottom rail. Pairs with `skin: 'editorial'`.
  editorial: {
    rootAttrs: { 'data-gallerist-preset': 'editorial' },
    arrows: 'pill-right',
    autoHide: false,
    rail: 'bottom',
    thumbnails: { itemAxis: 'horizontal', numberItems: true },
    frame: true,
    itemIndicator: 'placard',
  },
  // a walkthrough of named sections: a section index down the side (names, counts, the active section
  // expanded), ←/→ between sections on labelled arrows, ↑/↓ within one, and framed media so nothing
  // covers the photo. Pairs with `grid({ layout: 'sections', startOpen: true })`.
  tour: {
    rootAttrs: { 'data-gallerist-preset': 'tour' },
    arrows: 'pill-right',
    autoHide: false,
    rail: 'left',
    thumbnails: { itemAxis: 'horizontal', groupDisplay: 'index', numberItems: true },
    frame: true,
    itemIndicator: 'dots',
    groupAxis: 'horizontal',
    arrowLabels: true,
  },
  // browse-heavy: a vertical rail down the right edge (pairs well with the grid plugin).
  contact: {
    rootAttrs: { 'data-gallerist-preset': 'contact' },
    arrows: 'pill-right',
    autoHide: false,
    rail: 'right',
    thumbnails: { itemAxis: 'vertical' },
    navigator: false,
  },
}

// The entries are shared by every mount and handed to plugins (RegionCtx.preset): freeze them, so a
// plugin writing to one can't change the preset for the next mount.
for (const p of Object.values(PRESETS))
  for (const o of [p.rootAttrs, p.thumbnails, p]) Object.freeze(o)

/** Resolve a preset name to its layout config; unknown names warn (dev) and fall back to `filmstrip`. */
export function resolvePreset(name: string): ResolvedPreset {
  const preset = PRESETS[name as PresetName]
  if (!preset && typeof console !== 'undefined') {
    console.warn(`[gallerist] unknown preset "${name}" — falling back to "filmstrip"`)
  }
  return preset ?? PRESETS.filmstrip
}
