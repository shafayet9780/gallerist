// Pointer/wheel/double-tap gesture wiring (spec §11). Resolves a single pointer-down to one
// intent via the core arbitration reducer, applies live pan/zoom imperatively (decision P0-E:
// no store writes during a gesture), and commits the result on release. The arbitration matrix
// itself is unit-tested in core; real multi-pointer flows are verified in Playwright (M3.5).

import {
  type Intent,
  type ViewerApi,
  arbitrate,
  clampPan,
  clampScale,
  fitScale,
  focalZoom,
  toggleZoom,
} from '@visora/core'

export interface Geometry {
  stageRect: { left: number; top: number; width: number; height: number }
  naturalSize: { w: number; h: number } | null
}

export interface GestureNav {
  next(): void
  prev(): void
  nextItem(): void
  prevItem(): void
}

export interface GestureOptions {
  stage: HTMLElement
  viewer: ViewerApi
  getContent: () => HTMLElement | null
  getGeometry: () => Geometry
  threshold?: number
  commitNav?: number
  closeDismiss?: number
  maxScale?: number
  /** navigation seam — lets the renderer route swipes through linear/oriented nav (defaults to the
   *  viewer's group/item axes). */
  nav?: GestureNav
  raf?: (cb: () => void) => number
  caf?: (id: number) => void
}

interface Pt {
  x: number
  y: number
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function attachGestures(opts: GestureOptions): () => void {
  const {
    stage,
    viewer,
    getContent,
    getGeometry,
    threshold = 10,
    commitNav = 60,
    closeDismiss = 120,
    maxScale = 4,
    nav = {
      next: () => viewer.next(),
      prev: () => viewer.prev(),
      nextItem: () => viewer.nextItem(),
      prevItem: () => viewer.prevItem(),
    },
    raf = (cb) => requestAnimationFrame(cb),
    caf = (id) => cancelAnimationFrame(id),
  } = opts

  const pointers = new Map<number, Pt>()
  let start: Pt | null = null
  let startZoom = { scale: 1, x: 0, y: 0 }
  let pinchStartDist = 0
  let intent: Intent = 'none'
  let live = { scale: 1, x: 0, y: 0 }
  let frame = 0
  // Geometry snapshot for the active gesture — avoids a getBoundingClientRect (forced layout)
  // on every pointermove during pinch/pan, which would jeopardize the 60fps budget (§20).
  let gestureGeom: Geometry | null = null

  const geom = () => gestureGeom ?? getGeometry()
  const fit = () => {
    const g = geom()
    return g.naturalSize
      ? fitScale({ w: g.stageRect.width, h: g.stageRect.height }, g.naturalSize)
      : 1
  }
  const toStage = (p: Pt): Pt => {
    const r = geom().stageRect
    return { x: p.x - r.left, y: p.y - r.top }
  }

  const schedule = () => {
    if (frame) return
    frame = raf(() => {
      frame = 0
      const content = getContent()
      if (content) {
        content.style.transform = `translate(${live.x}px, ${live.y}px) scale(${live.scale})`
      }
    })
  }

  // Pointer capture keeps move/up/cancel flowing to the stage even when the pointer
  // leaves the stage bounds (panning a zoomed image past the edge, a fast swipe). Without
  // it an off-stage pointerup never reaches onUp, stranding the gesture and poisoning the
  // next one. Guard the calls: synthetic test events and inactive pointer ids throw (C3).
  const capture = (id: number) => {
    try {
      stage.setPointerCapture?.(id)
    } catch {}
  }
  const release = (id: number) => {
    try {
      stage.releasePointerCapture?.(id)
    } catch {}
  }

  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    capture(e.pointerId)
    startZoom = { ...viewer.getState().zoom }
    live = { ...startZoom }
    gestureGeom = getGeometry() // snapshot once; reused for the gesture (no per-move layout)
    if (pointers.size === 1) {
      start = { x: e.clientX, y: e.clientY }
      intent = 'none'
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      if (a && b) pinchStartDist = dist(a, b)
      intent = 'zoom'
    }
  }

  const resolveIntent = (dx: number, dy: number): Intent => {
    const g = geom()
    return arbitrate({
      pointerCount: pointers.size === 0 ? 1 : pointers.size,
      dx,
      dy,
      scale: startZoom.scale,
      fitScale: g.naturalSize ? fit() : startZoom.scale,
      grouped: currentGroupHasMultiple(viewer),
      threshold,
    })
  }

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (intent === 'zoom' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      if (!a || !b || pinchStartDist === 0) return
      const factor = dist(a, b) / pinchStartDist
      const newScale = clampScale(startZoom.scale * factor, fit(), maxScale)
      live = focalZoom(startZoom, toStage(mid(a, b)), newScale)
      schedule()
      return
    }

    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y

    if (intent === 'none') intent = resolveIntent(dx, dy)

    if (intent === 'pan') {
      live = { scale: startZoom.scale, x: startZoom.x + dx, y: startZoom.y + dy }
      schedule()
    } else if (intent === 'close') {
      const k = Math.max(0.5, 1 - Math.abs(dy) / 1000)
      live = { scale: startZoom.scale * k, x: startZoom.x + dx, y: startZoom.y + dy }
      stage.style.setProperty('--visora-dismiss', String(Math.min(1, Math.abs(dy) / closeDismiss)))
      schedule()
    }
    // navigate / secondary are committed on release (track animation lands in M5)
  }

  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    release(e.pointerId)
    if (frame) {
      caf(frame)
      frame = 0
    }

    // Pinch → single-finger handoff: when the first of two fingers lifts, commit the pinch
    // zoom now and re-seat the gesture onto the remaining finger so it continues as a fresh
    // pan/swipe. Otherwise the lingering finger is dead until the second finger lifts (I-R2).
    if (intent === 'zoom' && pointers.size === 1) {
      viewer.zoomTo(live.scale, { x: live.x, y: live.y })
      const [remaining] = [...pointers.values()]
      startZoom = { ...live }
      start = remaining ? { x: remaining.x, y: remaining.y } : null
      intent = 'none'
      return
    }

    // Use the up event's own coordinates: coalesced input may have fired no pointermove,
    // leaving the stored position stale at the down point.
    const dx = start ? e.clientX - start.x : 0
    const dy = start ? e.clientY - start.y : 0

    // Resolve at release too: synthetic/coalesced input may deliver no pointermove
    // before pointerup, leaving intent unresolved otherwise.
    if (intent === 'none') intent = resolveIntent(dx, dy)

    switch (intent) {
      case 'pan': {
        const g = geom()
        const committed = g.naturalSize
          ? clampPan(live, { w: g.stageRect.width, h: g.stageRect.height }, g.naturalSize)
          : live
        viewer.zoomTo(committed.scale, { x: committed.x, y: committed.y })
        break
      }
      case 'zoom':
        if (pointers.size === 0) viewer.zoomTo(live.scale, { x: live.x, y: live.y })
        break
      case 'navigate':
        if (Math.abs(dx) >= commitNav) dx < 0 ? nav.next() : nav.prev()
        break
      case 'close':
        stage.style.removeProperty('--visora-dismiss')
        if (Math.abs(dy) >= closeDismiss) viewer.close()
        else viewer.zoomTo(startZoom.scale, { x: startZoom.x, y: startZoom.y })
        break
      case 'secondary':
        if (dy < 0) nav.nextItem()
        else nav.prevItem()
        break
    }

    if (pointers.size === 0) {
      start = null
      intent = 'none'
      gestureGeom = null
    }
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const z = viewer.getState().zoom
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newScale = clampScale(z.scale * factor, fit(), maxScale)
    const next = focalZoom(z, toStage({ x: e.clientX, y: e.clientY }), newScale)
    const g = geom()
    const committed = g.naturalSize
      ? clampPan(next, { w: g.stageRect.width, h: g.stageRect.height }, g.naturalSize)
      : next
    viewer.zoomTo(committed.scale, { x: committed.x, y: committed.y })
  }

  const onDblClick = (e: MouseEvent) => {
    const z = viewer.getState().zoom
    const target = toggleZoom(z.scale, fit(), maxScale)
    const next = focalZoom(z, toStage({ x: e.clientX, y: e.clientY }), target)
    viewer.zoomTo(next.scale, { x: next.x, y: next.y })
  }

  stage.addEventListener('pointerdown', onDown)
  stage.addEventListener('pointermove', onMove)
  stage.addEventListener('pointerup', onUp)
  stage.addEventListener('pointercancel', onUp)
  stage.addEventListener('wheel', onWheel, { passive: false })
  stage.addEventListener('dblclick', onDblClick)

  return () => {
    stage.removeEventListener('pointerdown', onDown)
    stage.removeEventListener('pointermove', onMove)
    stage.removeEventListener('pointerup', onUp)
    stage.removeEventListener('pointercancel', onUp)
    stage.removeEventListener('wheel', onWheel)
    stage.removeEventListener('dblclick', onDblClick)
    if (frame) caf(frame)
  }
}

function currentGroupHasMultiple(viewer: ViewerApi): boolean {
  const col = viewer.getCollection()
  const g = viewer.getState().cursor.g
  return (col.groups[g]?.items.length ?? 0) > 1
}
