// Pure zoom/pan math (spec §11.1–§11.2). Coordinate spaces: screen → stage → content(natural).
// State {scale, x, y} is the content layer transform: stage = content * scale + (x, y).

import type { ZoomState } from '../types'

export interface Vec2 {
  x: number
  y: number
}
export interface Size {
  w: number
  h: number
}
/** An axis-aligned box: origin + size. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const EPS = 1e-3

export function contentToStage(p: Vec2, zoom: ZoomState): Vec2 {
  return { x: p.x * zoom.scale + zoom.x, y: p.y * zoom.scale + zoom.y }
}

export function stageToContent(p: Vec2, zoom: ZoomState): Vec2 {
  return { x: (p.x - zoom.x) / zoom.scale, y: (p.y - zoom.y) / zoom.scale }
}

/** Zoom to newScale while keeping the focal stage-point pinned to its content pixel. */
export function focalZoom(zoom: ZoomState, focal: Vec2, newScale: number): ZoomState {
  const c = stageToContent(focal, zoom)
  return { scale: newScale, x: focal.x - c.x * newScale, y: focal.y - c.y * newScale }
}

/** Contain ratio: the largest scale at which natural fits entirely inside stage. */
export function fitScale(stage: Size, natural: Size): number {
  return Math.min(stage.w / natural.w, stage.h / natural.h)
}

/** Fit + center the content within the stage. */
export function fitTransform(stage: Size, natural: Size): ZoomState {
  const scale = fitScale(stage, natural)
  return {
    scale,
    x: (stage.w - natural.w * scale) / 2,
    y: (stage.h - natural.h * scale) / 2,
  }
}

// One axis of the pan: `start`/`size` locate the box in content space, so the box's stage edge is
// t + start * scale. Smaller than the stage → centred; larger → its edges may not come inside.
function clampAxis(t: number, scale: number, start: number, size: number, stage: number): number {
  const scaled = size * scale
  const offset = start * scale
  if (scaled <= stage) return (stage - scaled) / 2 - offset // centered
  return Math.min(0 - offset, Math.max(stage - scaled - offset, t)) // edges cover the stage (0 - offset: no -0)
}

/** Clamp the pan so the content always covers the stage (centered when smaller). */
export function clampPan(zoom: ZoomState, stage: Size, natural: Size): ZoomState {
  return clampPanToBox(zoom, stage, { x: 0, y: 0, w: natural.w, h: natural.h })
}

/**
 * Clamp the pan against a box inside the content layer: the painted media, e.g. the letterboxed
 * image of an object-fit: contain layer. Along an axis where the scaled box is smaller than the
 * stage it stays centred; where it is larger its edges never come inside the stage, so a zoomed
 * portrait can't be panned into the empty bars beside it.
 */
export function clampPanToBox(zoom: ZoomState, stage: Size, box: Rect): ZoomState {
  return {
    scale: zoom.scale,
    x: clampAxis(zoom.x, zoom.scale, box.x, box.w, stage.w),
    y: clampAxis(zoom.y, zoom.scale, box.y, box.h, stage.h),
  }
}

export function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale))
}

/**
 * Double-tap target (spec §11.2). Zoomed in → back to fit; at fit → step in:
 * to actual 1× when the image is larger than the stage, else straight to max.
 */
export function toggleZoom(scale: number, fit: number, max: number, eps = EPS): number {
  if (scale > fit + eps) return fit
  const actual = clampScale(Math.max(1, fit), fit, max)
  return actual > fit + eps ? actual : max
}

export { EPS }
