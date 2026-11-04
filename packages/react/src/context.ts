import type { ViewerApi } from '@gallerist/core'
import { createContext, useContext } from 'react'

export const GalleristContext = createContext<ViewerApi | null>(null)

export function useViewerContext(): ViewerApi {
  const viewer = useContext(GalleristContext)
  if (!viewer)
    throw new Error('Gallerist.Overlay / Gallerist.Region must be used inside <Gallerist>')
  return viewer
}
