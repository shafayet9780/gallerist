// @gallerist/core — headless engine entry point: the stable, app-facing surface.
declare const __GALLERIST_VERSION__: string | undefined
/** Package version, injected from package.json at build (tsup `define`). Guarded with `typeof` so
 *  importing the source directly without the define (e2e / example vite fixtures, or any consumer
 *  bundling from src) yields a dev marker instead of a ReferenceError crash. */
export const VERSION =
  typeof __GALLERIST_VERSION__ !== 'undefined' ? __GALLERIST_VERSION__ : '0.0.0-dev'

export type * from './types'
export type { EventHandlers, ViewerApi, ViewerOptions } from './api'
export { createViewer } from './controller/createViewer'
export type {
  Plugin,
  PluginInstance,
  RegionCtx,
  RegionName,
  TransitionStrategy,
} from './plugins/types'
export type {
  Cancelable,
  CancelableNavPayload,
  EventMap,
  Handler,
  ViewerEventPayload,
} from './events/events'
// Engine building blocks and the renderer/plugin plumbing live in `@gallerist/core/internal`.
