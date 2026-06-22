// @visora/renderer-dom — default DOM renderer (the only ring that touches the DOM).
declare const __VISORA_VERSION__: string
/** Package version, injected from package.json at build time (tsup `define`). */
export const VERSION = __VISORA_VERSION__

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
