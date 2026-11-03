// @gallerist/cdn — everything a page without a build step needs, on a global `Gallerist`. Named
// exports, so nothing collides (each package has its own VERSION) and the surface stays deliberate.
export { createViewer, VERSION } from '@gallerist/core'
export {
  DEFAULT_STRINGS,
  applyAppearance,
  bind,
  collectionFromLinks,
  imageAdapter,
  mount,
  resolvePreset,
} from '@gallerist/renderer-dom'
export { captions } from '@gallerist/plugin-captions'
export { DEFAULT_DOWNLOAD_STRINGS, download, downloadGroup } from '@gallerist/plugin-download'
export { DEFAULT_FULLSCREEN_STRINGS, fullscreen } from '@gallerist/plugin-fullscreen'
export { DEFAULT_GRID_STRINGS, grid } from '@gallerist/plugin-grid'
export { hash } from '@gallerist/plugin-hash'
export { DEFAULT_PINS_STRINGS, pins } from '@gallerist/plugin-pins'
export { DEFAULT_THUMBNAILS_STRINGS, thumbnails } from '@gallerist/plugin-thumbnails'
export { video } from '@gallerist/plugin-video'
export { videoYouTube } from '@gallerist/plugin-video-youtube'
