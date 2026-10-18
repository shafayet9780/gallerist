// Overlay positioning math (spec §9.1). Pure — maps content/viewport anchors to box geometry
// within the content layer (which is CSS-contained, so natural coords map through the contain rect).

import type { ContentAnchor, OverlaySpec, ViewportAnchor } from '@gallerist/core'

export interface Size {
  w: number
  h: number
}
export interface ContainRect {
  x: number
  y: number
  w: number
  h: number
}
export interface OverlayBox {
  left: number
  top: number
  width: number | null
  height: number | null
}

/** Contain rect of `natural` centered within `container` (object-fit: contain). */
export function containRect(container: Size, natural: Size): ContainRect {
  const s = Math.min(container.w / natural.w, container.h / natural.h)
  const w = natural.w * s
  const h = natural.h * s
  return { x: (container.w - w) / 2, y: (container.h - h) / 2, w, h }
}

/** `rect` is the painted media box when the renderer knows it (framed media); otherwise the media
 *  is assumed contained in the whole stage. */
export function contentAnchorBox(
  anchor: ContentAnchor,
  stage: Size,
  natural: Size,
  rect: ContainRect = containRect(stage, natural),
): OverlayBox {
  const s = rect.w / natural.w
  const space = anchor.space ?? 'normalized'

  const mapX = (x: number) => (space === 'natural' ? rect.x + x * s : rect.x + x * rect.w)
  const mapY = (y: number) => (space === 'natural' ? rect.y + y * s : rect.y + y * rect.h)
  const mapW = (w: number) => (space === 'natural' ? w * s : w * rect.w)
  const mapH = (h: number) => (space === 'natural' ? h * s : h * rect.h)

  if (anchor.kind === 'point') {
    return { left: mapX(anchor.x), top: mapY(anchor.y), width: null, height: null }
  }
  return {
    left: mapX(anchor.x),
    top: mapY(anchor.y),
    width: mapW(anchor.w),
    height: mapH(anchor.h),
  }
}

/** region → scales with the image by default; point → counter-scaled (constant screen size). */
export function resolveScaleWithImage(anchor: ContentAnchor, override?: boolean): boolean {
  if (override !== undefined) return override
  return anchor.kind === 'region'
}

/** Counter-scale transform that keeps a point overlay a constant screen size under zoom. */
export function counterScaleTransform(zoomScale: number): string {
  return `translate(-50%, -50%) scale(${1 / zoomScale})`
}

export function viewportAnchorStyle(
  at: ViewportAnchor['at'],
  offset: [number, number] = [0, 0],
): Record<string, string> {
  const [ox, oy] = offset
  const style: Record<string, string> = { position: 'absolute' }

  if (at.startsWith('top')) style.top = `${oy}px`
  else if (at.startsWith('bottom')) style.bottom = `${oy}px`
  else style.top = '50%'

  if (at.endsWith('left')) style.left = `${ox}px`
  else if (at.endsWith('right')) style.right = `${ox}px`
  else style.left = '50%'

  const tx = at === 'top' || at === 'bottom' || at === 'center' ? '-50%' : '0'
  const ty = at === 'left' || at === 'right' || at === 'center' ? '-50%' : '0'
  if (tx !== '0' || ty !== '0') style.transform = `translate(${tx}, ${ty})`

  return style
}

/** Resolve the overlay sources for a slide (group + item), ordered by layer (spec §9). */
export function orderByLayer<T extends OverlaySpec>(specs: T[]): T[] {
  return [...specs].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))
}
