// Overlay rendering (spec §9). Paints viewport-layer and content-layer overlays for the current
// slide. Content overlays live inside the transformed content layer so they track pan/zoom for
// free; point overlays are counter-scaled to hold a constant screen size (decision per §9.1).

import type { Group, Item, OverlaySpec, ViewerApi, ZoomState } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import {
  type Size,
  contentAnchorBox,
  counterScaleTransform,
  orderByLayer,
  resolveScaleWithImage,
  viewportAnchorStyle,
} from './position'

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

export interface OverlayPaintCtx {
  group: Group
  item: Item
  viewer: ViewerApi
  zoom: ZoomState
  stage: Size
  natural: Size
}

/** A painted overlay, retained so zoom-only updates can adjust it without re-rendering. */
export interface OverlayEntry {
  el: HTMLElement
  spec: OverlaySpec
  counterScaled: boolean
}

export function gatherOverlays(group: Group, item: Item, globals: OverlaySpec[]): OverlaySpec[] {
  return [...globals, ...(group.overlays ?? []), ...(item.overlays ?? [])]
}

/**
 * Update retained overlays for a zoom change WITHOUT rebuilding (spec §9.2: no extra layout,
 * never re-invoke user render()). Refreshes visibleAt visibility and point counter-scale.
 */
export function updateOverlays(entries: OverlayEntry[], zoomScale: number): void {
  for (const { el, spec, counterScaled } of entries) {
    const visible =
      !spec.visibleAt || (zoomScale >= spec.visibleAt[0] && zoomScale <= spec.visibleAt[1])
    el.style.display = visible ? '' : 'none'
    if (counterScaled) el.style.transform = counterScaleTransform(zoomScale)
  }
}

export function paintOverlays(
  viewportHost: HTMLElement,
  contentHost: HTMLElement,
  specs: OverlaySpec[],
  ctx: OverlayPaintCtx,
): OverlayEntry[] {
  viewportHost.replaceChildren()
  contentHost.replaceChildren()
  const entries: OverlayEntry[] = []

  for (const spec of orderByLayer(specs)) {
    const host = document.createElement('div')
    host.className = spec.class ? `gallerist-overlay ${spec.class}` : 'gallerist-overlay'
    host.dataset.overlay = spec.id
    host.style.position = 'absolute'
    if (spec.layer !== undefined) host.style.zIndex = String(spec.layer)
    host.style.pointerEvents = spec.interactive ? 'auto' : 'none'

    const visible =
      !spec.visibleAt ||
      (ctx.zoom.scale >= spec.visibleAt[0] && ctx.zoom.scale <= spec.visibleAt[1])
    if (!visible) host.style.display = 'none'

    if (spec.interactive) {
      host.addEventListener('click', () =>
        getInternals(ctx.viewer).emit('overlayClick', {
          viewer: ctx.viewer,
          cursor: ctx.viewer.getState().cursor,
          group: ctx.group,
          item: ctx.item,
          id: spec.id,
        }),
      )
    } else {
      host.setAttribute('aria-hidden', 'true')
    }

    const out = spec.render({
      group: ctx.group,
      item: ctx.item,
      zoom: ctx.zoom,
      viewer: ctx.viewer,
    })
    if (typeof out === 'string') host.textContent = out
    else host.appendChild(out)
    // an interactive overlay is reachable by keyboard: through its own controls when it has any
    // (a pin's button), otherwise the host itself takes focus
    if (spec.interactive && !host.querySelector(FOCUSABLE)) host.tabIndex = 0

    let counterScaled = false
    if (spec.anchor.kind === 'viewport') {
      Object.assign(host.style, viewportAnchorStyle(spec.anchor.at, spec.anchor.offset))
      viewportHost.appendChild(host)
    } else {
      const box = contentAnchorBox(spec.anchor, ctx.stage, ctx.natural)
      host.style.left = `${box.left}px`
      host.style.top = `${box.top}px`
      if (box.width !== null) host.style.width = `${box.width}px`
      if (box.height !== null) host.style.height = `${box.height}px`
      counterScaled = !resolveScaleWithImage(spec.anchor, spec.scaleWithImage)
      if (counterScaled) host.style.transform = counterScaleTransform(ctx.zoom.scale)
      contentHost.appendChild(host)
    }
    entries.push({ el: host, spec, counterScaled })
  }
  return entries
}
