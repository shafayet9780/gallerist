// @visora/react — React adapter (spec §16). Thin binding over the headless store.
export {
  type ArrowLayout,
  type PresetName,
  type RailPlacement,
  type ResolvedPreset,
  resolvePreset,
} from '@visora/renderer-dom'
export { useViewerContext, VisoraContext } from './context'
export { type UseVisora, useVisora } from './useVisora'
export {
  Visora,
  type VisoraOverlayProps,
  type VisoraProps,
  type VisoraRegionProps,
} from './Visora'
