// @gallerist/renderer-dom — default DOM renderer (the only ring that touches the DOM).
declare const __GALLERIST_VERSION__: string | undefined
/** Package version, injected from package.json at build (tsup `define`). Guarded with `typeof` so
 *  importing the source without the define (e2e / example fixtures) yields a dev marker, not a crash. */
export const VERSION =
  typeof __GALLERIST_VERSION__ !== 'undefined' ? __GALLERIST_VERSION__ : '0.0.0-dev'

export { imageAdapter } from './adapters/image'
export {
  type ArrowLayout,
  type MountOptions,
  mount,
  type RailPlacement,
  type RendererHandle,
} from './mount'
export { type PresetName, type ResolvedPreset, resolvePreset } from './presets'
export { type KeyReconcile, reconcileKeys, windowIndices } from './windowing'
