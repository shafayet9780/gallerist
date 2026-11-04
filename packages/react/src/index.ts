// @gallerist/react — React adapter (spec §16). Thin binding over the headless store.
export {
  type Accent,
  type ArrowLayout,
  type ColorScheme,
  type GroupAxis,
  type ItemIndicator,
  type PresetName,
  type RailPlacement,
  type ResolvedPreset,
  type Skin,
  type Strings,
  DEFAULT_STRINGS,
  resolvePreset,
} from '@gallerist/renderer-dom'
export { useViewerContext, GalleristContext } from './context'
export { type UseGallerist, useGallerist } from './useGallerist'
export { type CurrentItem, useCurrentItem } from './useCurrentItem'
export {
  Gallerist,
  type GalleristCaptionProps,
  type GalleristOpenAt,
  type GalleristOverlayProps,
  type GalleristProps,
  type GalleristRegionProps,
} from './Gallerist'
