// Core data model & state types (spec §4, §5, §7, §9).
// These types are headless: DOM types referenced here are *type-only* (no runtime DOM access).

import type { ViewerApi } from './api'

// ── Media ───────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'iframe' | 'audio' | 'html' | (string & {})

/** Deep-zoom descriptor — v1 seam only; full tiling lands in v2 (spec §11.4, D9). */
export interface DZIDescriptor {
  url: string
  tileSize: number
  overlap: number
  format: string
  width: number
  height: number
}

export type MediaSource =
  | string
  | { src: string; srcset?: string; sizes?: string }
  | { loader: (signal: AbortSignal) => Promise<string | HTMLElement> }
  | { tiles: DZIDescriptor }

// ── Media adapters (spec §12) ────────────────────────────────────────────────
// Interfaces only; DOM types are type-only so core stays DOM-free. Concrete adapters
// (e.g. the image adapter) ship with the renderer, which is the ring that touches the DOM.

export interface AdapterCtx {
  signal: AbortSignal
  priority?: 'high' | 'low' | 'auto'
  stageSize?: () => { w: number; h: number }
}

export interface MountedMedia {
  element: HTMLElement
  /** resolves when displayable (decoded). */
  ready: Promise<void>
  naturalSize?(): { w: number; h: number } | null
  supportsZoom: boolean
  activate?(): void
  deactivate?(): void
  destroy(): void
}

export interface MediaAdapter {
  type: string
  match?(item: Item): boolean
  mount(item: Item, slot: HTMLElement, ctx: AdapterCtx): MountedMedia
}

// ── Overlays (spec §9; render signature frozen per decision P0-G) ─────────────

export type OverlaySpace = 'natural' | 'normalized'

export type ViewportAnchor = {
  kind: 'viewport'
  at:
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'left'
    | 'center'
    | 'right'
    | 'bottom-left'
    | 'bottom'
    | 'bottom-right'
  offset?: [x: number, y: number]
}

export type ContentAnchor =
  | { kind: 'point'; x: number; y: number; space?: OverlaySpace }
  | { kind: 'region'; x: number; y: number; w: number; h: number; space?: OverlaySpace }

export interface OverlayCtx {
  group: Group
  item: Item
  zoom: ZoomState
  viewer: ViewerApi
}

export interface OverlaySpec {
  id: string
  anchor: ViewportAnchor | ContentAnchor
  render: (ctx: OverlayCtx) => HTMLElement | string | Node
  /** z-order within the overlay stack. */
  layer?: number
  /** default false → pointer-events:none (won't block gestures). */
  interactive?: boolean
  /** show only within [minScale, maxScale]. */
  visibleAt?: [minScale: number, maxScale: number]
  /** default depends on anchor: region→true, point→false (counter-scaled). */
  scaleWithImage?: boolean
  class?: string
}

// ── Collection / Group / Item (spec §4.1) ────────────────────────────────────

export interface Item<IM = unknown> {
  id: string
  type: MediaType
  source: MediaSource
  thumb?: MediaSource
  alt?: string
  caption?: string | OverlaySpec
  /** enables zoom-from-origin & bounds without a load. */
  naturalSize?: { w: number; h: number }
  /** LQIP: data-URI or dominant color, painted instantly (decision P0-J, spec §27.7). */
  placeholder?: string
  meta?: IM
  overlays?: OverlaySpec[]
}

export interface Group<GM = unknown, IM = unknown> {
  id: string
  items: Item<IM>[]
  meta?: GM
  thumb?: MediaSource
  /** display caption for the group (e.g. shown under its rail card); render only if present. */
  caption?: string
  overlays?: OverlaySpec[]
}

export interface Collection<GM = unknown, IM = unknown> {
  groups: Group<GM, IM>[]
  meta?: Record<string, unknown>
}

/** The three ergonomic front doors normalize into one internal Collection (spec §4.2). */
export interface CollectionInput<GM = unknown, IM = unknown> {
  items?: Item<IM>[]
  groups?: Group<GM, IM>[]
  collection?: Collection<GM, IM>
}

// ── Navigation & state (spec §5, §7) ─────────────────────────────────────────

export type ItemMemory = 'reset' | 'preserve' | 'clamp'

export interface Cursor {
  g: number
  i: number
}

export interface ZoomState {
  scale: number
  x: number
  y: number
}

export type Phase = 'closed' | 'opening' | 'open' | 'closing'

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface ViewerState {
  phase: Phase
  cursor: Cursor
  /** last *committed* transform — live pan/zoom is applied imperatively (decision P0-E). */
  zoom: ZoomState
  /** per-item load status, keyed by item id; driven by the load/loaded/loadError events. */
  loaded: Record<string, LoadStatus>
}
