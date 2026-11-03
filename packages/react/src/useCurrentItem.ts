import type { Cursor, Group, Item, ViewerApi } from '@gallerist/core'
import { useCallback, useContext, useRef, useSyncExternalStore } from 'react'
import { GalleristContext } from './context'

/** The viewer's current item, its group and its position. */
export interface CurrentItem<GM = unknown, IM = unknown> {
  /** undefined only for an empty collection */
  item: Item<IM> | undefined
  group: Group<GM, IM> | undefined
  cursor: Readonly<Cursor>
}

/**
 * The current item, group and cursor of the enclosing `<Gallerist>` (or of `viewer`). Re-renders
 * when the cursor or the collection changes, not on zoom or pan.
 */
export function useCurrentItem<GM = unknown, IM = unknown>(
  viewer?: ViewerApi,
): CurrentItem<GM, IM> {
  const fromContext = useContext(GalleristContext)
  const v = viewer ?? fromContext
  if (!v) throw new Error('useCurrentItem() must be used inside <Gallerist> or given a viewer')
  // useSyncExternalStore needs a stable snapshot: the same object until the item really changes
  const last = useRef<CurrentItem | null>(null)
  const subscribe = useCallback((cb: () => void) => v.subscribe(cb), [v])
  const getSnapshot = useCallback((): CurrentItem => {
    const { g, i } = v.getState().cursor
    const group = v.getCollection().groups[g]
    const item = group?.items[i]
    const prev = last.current
    if (
      prev &&
      prev.item === item &&
      prev.group === group &&
      prev.cursor.g === g &&
      prev.cursor.i === i
    )
      return prev
    last.current = { item, group, cursor: { g, i } }
    return last.current
  }, [v])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as CurrentItem<GM, IM>
}
