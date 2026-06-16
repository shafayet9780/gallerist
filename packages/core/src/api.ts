// Public API contract (spec §8). Implemented by createViewer (M1.6).
// Defined as an interface first so overlay/plugin types can reference it without a cycle.

import type { EventMap, Handler } from './events/events'
export type { EventMap, Handler } from './events/events'
import type {
  Collection,
  CollectionInput,
  Cursor,
  ItemMemory,
  OverlaySpec,
  ViewerState,
  ZoomState,
} from './types'

export type EventHandlers = { [K in keyof EventMap]?: Handler<EventMap[K]> }

export interface ViewerOptions extends CollectionInput {
  startAt?: { g?: number; i?: number }
  /** default true. */
  loop?: boolean
  /** default 'reset' (spec §5, decision D4). */
  itemMemory?: ItemMemory
  /** default false. */
  keepZoomOnNav?: boolean
  overlays?: OverlaySpec[]
  on?: EventHandlers
}

export interface ViewerApi {
  open(at?: { g?: number; i?: number }): void
  close(): void
  next(): void
  prev(): void
  nextItem(): void
  prevItem(): void
  goTo(g: number, i?: number): void
  goToId(groupId: string, itemId?: string): void
  zoomTo(scale: number, focal?: { x: number; y: number }): void
  resetZoom(): void
  setCollection(next: Collection): void
  getCollection(): Readonly<Collection>
  refresh(): void
  getState(): Readonly<ViewerState>
  subscribe(fn: (s: Readonly<ViewerState>) => void): () => void
  /** Runtime event subscription (complements the `on` constructor option, spec §18). */
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void
  /** Emit an event — used by the renderer, adapters, and plugins to surface events. */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean
  destroy(): void
  // navigation/zoom accessors used by overlays & adapters:
  readonly cursor: Cursor
  readonly zoom: ZoomState
}
