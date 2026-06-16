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

function clampAxis(t: number, scaled: number, stage: number): number {
  if (scaled <= stage) return (stage - scaled) / 2 // centered
  return Math.min(0, Math.max(stage - scaled, t)) // edges cover the stage
}

/** Clamp the pan so the content always covers the stage (centered when smaller). */
export function clampPan(zoom: ZoomState, stage: Size, natural: Size): ZoomState {
  return {
    scale: zoom.scale,
    x: clampAxis(zoom.x, natural.w * zoom.scale, stage.w),
    y: clampAxis(zoom.y, natural.h * zoom.scale, stage.h),
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
