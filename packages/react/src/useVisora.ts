import type { ViewerApi, ViewerState } from '@visora/core'
import { useCallback, useSyncExternalStore } from 'react'

export interface UseVisora {
  state: Readonly<ViewerState>
  viewer: ViewerApi
  open: ViewerApi['open']
  close: ViewerApi['close']
  next: ViewerApi['next']
  prev: ViewerApi['prev']
  nextItem: ViewerApi['nextItem']
  prevItem: ViewerApi['prevItem']
  goTo: ViewerApi['goTo']
  goToId: ViewerApi['goToId']
  zoomTo: ViewerApi['zoomTo']
  resetZoom: ViewerApi['resetZoom']
}

/** Bind a React component to a viewer's state (useSyncExternalStore) + its actions. */
export function useVisora(viewer: ViewerApi): UseVisora {
  const subscribe = useCallback((cb: () => void) => viewer.subscribe(cb), [viewer])
  const getSnapshot = useCallback(() => viewer.getState(), [viewer])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    state,
    viewer,
    open: (at) => viewer.open(at),
    close: () => viewer.close(),
    next: () => viewer.next(),
    prev: () => viewer.prev(),
    nextItem: () => viewer.nextItem(),
    prevItem: () => viewer.prevItem(),
    goTo: (g, i) => viewer.goTo(g, i),
    goToId: (g, i) => viewer.goToId(g, i),
    zoomTo: (s, f) => viewer.zoomTo(s, f),
    resetZoom: () => viewer.resetZoom(),
  }
}
