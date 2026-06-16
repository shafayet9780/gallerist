import type { ViewerApi } from '@visora/core'
import { createContext, useContext } from 'react'

export const VisoraContext = createContext<ViewerApi | null>(null)

export function useViewerContext(): ViewerApi {
  const viewer = useContext(VisoraContext)
  if (!viewer) throw new Error('Visora.Overlay / Visora.Region must be used inside <Visora>')
  return viewer
}
