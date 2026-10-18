import type { ZoomState } from '@gallerist/core'

/** The content layer's CSS transform for a zoom state (stage = content · scale + (x, y)). */
export function zoomTransform(zoom: ZoomState): string {
  return `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
}
