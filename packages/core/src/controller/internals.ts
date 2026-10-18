// The renderer- and plugin-facing half of a viewer (spec §8.4), exposed via
// `@gallerist/core/internal`. Kept off the public ViewerApi so the surface frozen at 1.0 stays
// small and app code can't, say, forge a `loaded` event. Stored under a global-registry symbol
// so lookup works even when the root and /internal entries are bundled as separate copies.

import type { ViewerApi } from '../api'
import type { EventMap } from '../events/events'
import type { PluginInstance } from '../plugins/types'

const INTERNALS: unique symbol = Symbol.for('gallerist.internals')

export interface ViewerInternals {
  /** Emit a viewer event: the renderer surfaces load/overlay events, plugins their own. */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean
  /** Registered plugin instances, in registration order. */
  getPlugins(): readonly PluginInstance[]
  /** Called when the plugin set changes (a late use(), or a use() disposer). */
  onPluginsChanged(fn: () => void): () => void
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
