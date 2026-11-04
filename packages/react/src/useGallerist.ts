import type { ViewerApi, ViewerState } from '@gallerist/core'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

export interface UseGallerist {
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
export function useGallerist(viewer: ViewerApi): UseGallerist {
  const subscribe = useCallback((cb: () => void) => viewer.subscribe(cb), [viewer])
  const getSnapshot = useCallback(() => viewer.getState(), [viewer])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Stabilize the action closures so they keep a constant identity across re-renders (this hook
  // re-renders on every store commit). Otherwise each commit handed consumers fresh function
  // references, defeating React.memo / dependency-array memoization downstream (S-PERF4).
  const actions = useMemo(
    () => ({
      open: (at?: Parameters<ViewerApi['open']>[0]) => viewer.open(at),
      close: () => viewer.close(),
      next: () => viewer.next(),
      prev: () => viewer.prev(),
      nextItem: () => viewer.nextItem(),
      prevItem: () => viewer.prevItem(),
      goTo: (g: number, i?: number) => viewer.goTo(g, i),
      goToId: (g: string, i?: string) => viewer.goToId(g, i),
      zoomTo: (s: number, f?: Parameters<ViewerApi['zoomTo']>[1]) => viewer.zoomTo(s, f),
      resetZoom: () => viewer.resetZoom(),
    }),
    [viewer],
  )

  return { state, viewer, ...actions }
}
