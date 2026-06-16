// Plugin contract (spec §13). Types live in core (DOM-free); region *mounts* live in the renderer.
// A plugin is a factory bound by the user (e.g. `fullscreen()`) returning `(viewer) => instance`.

import type { EventHandlers, ViewerApi } from '../api'
import type { MediaAdapter, OverlaySpec } from '../types'

/** Named UI slots the renderer exposes; plugins inject Nodes into them. */
export type RegionName = 'toolbar' | 'footer' | 'stage' | 'thumbnails' | 'backdrop' | (string & {})

/** Passed to a region renderer; the viewer is the handle for state/actions/subscription. */
export interface RegionCtx {
  viewer: ViewerApi
}

/** Pluggable transition seam (spec §10.4) — minimal in Phase 1; full API is future work. */
export interface TransitionStrategy {
  name: string
  enter?(el: HTMLElement): void
  leave?(el: HTMLElement): void
}

export interface PluginInstance {
  name: string
  init?(): void
  destroy?(): void
  on?: EventHandlers
  /** UI region injection — the renderer mounts the returned Node into the named region. */
  regions?: Partial<Record<RegionName, (ctx: RegionCtx) => Node>>
  overlays?: OverlaySpec[]
  mediaAdapters?: MediaAdapter[]
  keymap?: Record<string, (e: KeyboardEvent) => void>
  transitions?: Record<string, TransitionStrategy>
}

export type Plugin = (viewer: ViewerApi) => PluginInstance
