// Plugin contract (spec §13). Types live in core (DOM-free); region *mounts* live in the renderer.
// A plugin is a factory bound by the user (e.g. `fullscreen()`) returning `(viewer) => instance`.

import type { EventHandlers, ViewerApi } from '../api'
import type { Group, Item, MediaAdapter, OverlaySpec } from '../types'

/**
 * Named UI slots the renderer exposes; plugins inject Nodes into them. `toolbar` sits in the top
 * bar, `aside` is a side column at the stage's inline end (item stack, info or filter panels),
 * `thumbnails` is the rail, `footer` a band above it; all of them take space rather than covering
 * the stage. `caption` replaces the caption bar's text with the plugin's node (one owner;
 * `@gallerist/plugin-captions`). `stage` and `backdrop` are layers over and under the media.
 */
export type RegionName =
  | 'toolbar'
  | 'aside'
  | 'footer'
  | 'caption'
  | 'stage'
  | 'thumbnails'
  | 'backdrop'
  | (string & {})

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
  /** Overlays for every slide, or a function returning the overlays for one slide (e.g. pins
   *  read from the item). The function runs when that slide's overlays are painted. */
  overlays?: OverlaySpec[] | ((slide: { group: Group; item: Item }) => OverlaySpec[])
  mediaAdapters?: MediaAdapter[]
  keymap?: Record<string, (e: KeyboardEvent) => void>
  transitions?: Record<string, TransitionStrategy>
}

export type Plugin = (viewer: ViewerApi) => PluginInstance
