// @visora/renderer-dom — default DOM renderer (the only ring that touches the DOM).
export const VERSION = '0.0.0'

export { imageAdapter } from './adapters/image'
export { type ArrowLayout, type MountOptions, mount, type RendererHandle } from './mount'
export { type PresetName, type ResolvedPreset, resolvePreset } from './presets'
export { type KeyReconcile, reconcileKeys, windowIndices } from './windowing'
