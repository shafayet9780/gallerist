// @gallerist/react — React adapter (spec §16). Thin binding over the headless store.
export {
  type ArrowLayout,
  type ItemIndicator,
  type PresetName,
  type RailPlacement,
  type ResolvedPreset,
  type Strings,
  DEFAULT_STRINGS,
  resolvePreset,
} from '@gallerist/renderer-dom'
export { useViewerContext, GalleristContext } from './context'
export { type UseGallerist, useGallerist } from './useGallerist'
export {
  Gallerist,
  type GalleristOverlayProps,
  type GalleristProps,
  type GalleristRegionProps,
} from './Gallerist'
