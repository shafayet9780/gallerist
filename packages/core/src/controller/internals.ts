// The renderer- and plugin-facing half of a viewer (spec §8.4), exposed via
// `@gallerist/core/internal`. Kept off the public ViewerApi so the surface frozen at 1.0 stays
// small and app code can't, say, forge a `loaded` event. Stored under a global-registry symbol
// so lookup works even when the root and /internal entries are bundled as separate copies.

import type { ViewerApi } from '../api'
import type { EventMap } from '../events/events'
import type { PluginInstance } from '../plugins/types'
import type { ZoomState } from '../types'
import type { Vec2 } from '../zoom/zoom'

const INTERNALS: unique symbol = Symbol.for('gallerist.internals')

/** Stage geometry a renderer lends the headless core so committed zoom stays valid. */
export interface ZoomBounds {
  /** Stage-space point that `zoomTo()` pivots on when no focal point is given (its centre). */
  center(): Vec2
  /** Clamp a candidate committed transform: scale into [fit, max], pan so content covers the stage. */
  constrain(zoom: ZoomState): ZoomState
}

/**
 * Lets a renderer stretch open/close over a real transition: `opened` / `closed` fire when it calls
 * `done()`. Without a driver (or a missing hook) the phase settles synchronously.
 */
export interface LifecycleDriver {
  opening?(done: () => void): void
  closing?(done: () => void): void
}

export interface ViewerInternals {
  /** Emit a viewer event: the renderer surfaces load/overlay events, plugins their own. */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean
  /** Registered plugin instances, in registration order. */
  getPlugins(): readonly PluginInstance[]
  /** Called when the plugin set changes (a late use(), or a use() disposer). */
  onPluginsChanged(fn: () => void): () => void
  /** Commit a full transform (gesture end, resize re-clamp). Passes through the zoom bounds. */
  setZoom(zoom: ZoomState): void
  /** Lend the core the stage geometry; returns a disposer. Without bounds, zoom is unclamped. */
  setZoomBounds(bounds: ZoomBounds): () => void
  /** Drive open/close transitions; returns a disposer that also settles one in flight. */
  setLifecycleDriver(driver: LifecycleDriver): () => void
  /** Called by `viewer.refresh()`: the renderer re-measures (e.g. after a container resize). */
  onRefresh(fn: () => void): () => void
  /** The renderer abandoned this item's load (torn down mid-load): 'loading' returns to 'idle'. */
  cancelLoad(id: string): void
}

export function attachInternals(viewer: ViewerApi, internals: ViewerInternals): void {
  Object.defineProperty(viewer, INTERNALS, { value: internals })
}

/** The internal surface of a viewer made by createViewer. Unstable before 1.0. */
export function getInternals(viewer: ViewerApi): ViewerInternals {
  const internals = (viewer as { [INTERNALS]?: ViewerInternals })[INTERNALS]
  if (!internals) throw new TypeError('getInternals: not a viewer created by createViewer()')
  return internals
}
