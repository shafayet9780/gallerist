// @gallerist/core/internal — the engine surface for renderers and plugin authors: the viewer's
// internal half (getInternals) plus the pure model/nav/zoom/motion building blocks. Not covered
// by semver before 1.0; app code should only need the root entry (spec §8.4).

export { getInternals, type ViewerInternals } from './controller/internals'
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
export { createEmitter, type Emitter, makeCancelable } from './events/events'
