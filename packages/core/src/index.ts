// @visora/core — headless engine entry point.
// Phase 0 build order (see plans/phase-0.md): M1 model/store/FSM/nav, M2 zoom/arbitration math.
export const VERSION = '0.0.0'

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
export { normalize } from './model/normalize'
export { createStore, type Store } from './store/store'
export {
  applyItemMemory,
  goTo,
  type NavCtx,
  nextGroup,
  nextItem,
  prevGroup,
  prevItem,
  resolveId,
} from './nav/nav'
export { type FsmEvent, type FsmState, initialFsm, reduceFsm } from './fsm/fsm'
export { sampleSpring, type SpringParams, type SpringSample, SPRINGS } from './motion/spring'
export { type KeyReconcile, reconcileKeys, windowIndices } from './windowing'
export { type ArbitrationInput, arbitrate, type Intent } from './zoom/arbitration'
export {
  clampPan,
  clampScale,
  contentToStage,
  fitScale,
  fitTransform,
  focalZoom,
  type Size,
  stageToContent,
  toggleZoom,
  type Vec2,
} from './zoom/zoom'
export {
  type Cancelable,
  type CancelableNavPayload,
  createEmitter,
  type Emitter,
  type EventMap,
  type Handler,
  makeCancelable,
  type ViewerEventPayload,
} from './events/events'
