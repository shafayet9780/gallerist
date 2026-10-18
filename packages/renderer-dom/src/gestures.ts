// Pointer/wheel/double-tap gesture wiring (spec §11). Resolves a single pointer-down to one
// intent via the core arbitration reducer, applies live pan/zoom imperatively (decision P0-E:
// no store writes during a gesture), and commits the result on release. The arbitration matrix
// itself is unit-tested in core; real multi-pointer flows are verified in Playwright (M3.5).

import type { ViewerApi, ZoomState } from '@gallerist/core'
import {
  type Intent,
  arbitrate,
  clampPan,
  clampPanToBox,
  clampScale,
  fitScale,
  focalZoom,
  getInternals,
  toggleZoom,
} from '@gallerist/core/internal'
import { zoomTransform } from './transform'

export interface Geometry {
  stageRect: { left: number; top: number; width: number; height: number }
  naturalSize: { w: number; h: number } | null
  /** The painted media inside the content layer at fit (e.g. a letterboxed image); pan bounds
   *  keep it covering the stage. Omitted: the whole content layer counts as media. */
  mediaBox?: { x: number; y: number; w: number; h: number }
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

  // The drag-to-dismiss progress var lives on the root (not the stage) so sibling layers like the
  // backdrop — which are not descendants of the stage — can consume it via inheritance (S-R1).
  const dismissEl = (stage.closest('.gallerist') as HTMLElement | null) ?? stage

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
  const fitOf = (g: Geometry) =>
    g.naturalSize ? fitScale({ w: g.stageRect.width, h: g.stageRect.height }, g.naturalSize) : 1
  const fit = () => fitOf(geom())
  const toStage = (p: Pt): Pt => {
    const r = geom().stageRect
    return { x: p.x - r.left, y: p.y - r.top }
  }
  // Every commit is settled first: scale into [fit, max], pan so the content covers the stage
  // (centred once it fits). Without this a pinch or double-tap back to fit kept its pan offset and
  // left the image off-centre. The renderer's zoom bounds re-check the same in the core.
  const settle = (z: ZoomState, g: Geometry = geom()): ZoomState => {
    const scaled = { scale: clampScale(z.scale, fitOf(g), maxScale), x: z.x, y: z.y }
    const stageSize = { w: g.stageRect.width, h: g.stageRect.height }
    if (g.mediaBox) return clampPanToBox(scaled, stageSize, g.mediaBox)
    return g.naturalSize ? clampPan(scaled, stageSize, g.naturalSize) : scaled
  }
  const internals = getInternals(viewer)
  // Commit, then show the committed transform: a commit identical to the stored zoom is skipped
  // (no store change, so the renderer won't repaint), which would leave the content at the live
  // gesture transform — e.g. a pan dragged past the edge and clamped back to where it started.
  const commit = (z: ZoomState) => {
    internals.setZoom(z)
    const content = getContent()
    if (content) content.style.transform = zoomTransform(viewer.getState().zoom)
  }

  const schedule = () => {
    if (frame) return
    frame = raf(() => {
      frame = 0
      const content = getContent()
      if (content) {
        content.style.transform = zoomTransform(live)
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

  // Wheel/trackpad zoom: snapshot geometry once per burst (no forced layout per tick), accumulate
  // the target locally and apply it imperatively via the RAF schedule, then commit to the store
  // ONCE when the burst settles — instead of a full store commit + render + subscriber fan-out on
  // every tick (the one continuous interaction that was routed through the store) (I-PERF1).
  const WHEEL_COMMIT_MS = 90
  let wheelGeom: Geometry | null = null
  let wheelZoom: { scale: number; x: number; y: number } | null = null
  let wheelTimer: ReturnType<typeof setTimeout> | undefined

  const commitWheel = () => {
    wheelTimer = undefined
    wheelGeom = null
    if (wheelZoom) {
      commit(wheelZoom) // already clamped per tick
      wheelZoom = null
    }
  }
  // Force any settle-pending wheel zoom into the store NOW. Called before a competing interaction
  // (pointer down, double-click) snapshots its zoom base, and on teardown, so the wheel result is
  // never clobbered by a stale base nor silently dropped (review #1/#4).
  const flushWheel = () => {
    if (wheelTimer) {
      clearTimeout(wheelTimer)
      commitWheel()
    }
  }

  const onDown = (e: PointerEvent) => {
    flushWheel() // commit a pending wheel zoom before snapshotting startZoom from the store
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // NB: do NOT capture the pointer here. The stage hosts interactive overlay/plugin UI (e.g. the
    // grid cells, which live inside .gallerist-stage); capturing on every pointerdown would redirect
    // the pointerup and swallow their click. Capture only once a real drag/pinch is recognized
    // (in onMove, and the pinch branch below), so a tap still delivers its click to the target (C3).
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
      for (const id of pointers.keys()) capture(id) // a pinch is unambiguously a gesture
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

    if (intent === 'none') {
      intent = resolveIntent(dx, dy)
      // Now that this is a real drag (not a tap), capture so move/up keep flowing even off-stage
      // — without stealing the click from a tap that never moved (C3).
      if (intent !== 'none') capture(e.pointerId)
    }

    if (intent === 'pan') {
      live = { scale: startZoom.scale, x: startZoom.x + dx, y: startZoom.y + dy }
      schedule()
    } else if (intent === 'close') {
      const k = Math.max(0.5, 1 - Math.abs(dy) / 1000)
      live = { scale: startZoom.scale * k, x: startZoom.x + dx, y: startZoom.y + dy }
      dismissEl.style.setProperty(
        '--gallerist-dismiss',
        String(Math.min(1, Math.abs(dy) / closeDismiss)),
      )
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
      live = settle(live)
      commit(live)
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
      case 'pan':
        commit(settle(live))
        break
      case 'zoom':
        if (pointers.size === 0) commit(settle(live))
        break
      case 'navigate':
        if (Math.abs(dx) >= commitNav) dx < 0 ? nav.next() : nav.prev()
        break
      case 'close':
        dismissEl.style.removeProperty('--gallerist-dismiss')
        if (Math.abs(dy) >= closeDismiss) viewer.close()
        else commit(startZoom) // snap back from the drag-to-dismiss shrink
        break
      case 'secondary':
        // Arbitration only yields 'secondary' for an upward drag (downward is dismiss), and like
        // the group axis it needs a real commit distance — not just the 10px intent threshold.
        if (-dy >= commitNav) nav.nextItem()
        break
    }

    if (pointers.size === 0) {
      start = null
      intent = 'none'
      gestureGeom = null
    }
  }

  // pointercancel means the browser took the pointer away (a system gesture, palm rejection, a
  // scroll takeover): abandon the whole gesture rather than treating it as a release, which could
  // navigate or dismiss from a drag the user never finished. Snap back to the committed transform.
  const onCancel = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    for (const id of pointers.keys()) release(id)
    pointers.clear()
    if (frame) {
      caf(frame)
      frame = 0
    }
    dismissEl.style.removeProperty('--gallerist-dismiss')
    const content = getContent()
    if (content) content.style.transform = zoomTransform(viewer.getState().zoom)
    start = null
    intent = 'none'
    gestureGeom = null
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (!wheelGeom) wheelGeom = getGeometry()
    const g = wheelGeom
    const base = wheelZoom ?? viewer.getState().zoom
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    // clamp the scale before pivoting (so the cursor point stays put), then settle the pan; uses
    // the burst's geometry snapshot, never a fresh measure per tick
    const newScale = clampScale(base.scale * factor, fitOf(g), maxScale)
    const focal = { x: e.clientX - g.stageRect.left, y: e.clientY - g.stageRect.top }
    wheelZoom = settle(focalZoom(base, focal, newScale), g)
    live = { ...wheelZoom }
    schedule()
    if (wheelTimer) clearTimeout(wheelTimer)
    wheelTimer = setTimeout(commitWheel, WHEEL_COMMIT_MS)
  }

  const onDblClick = (e: MouseEvent) => {
    flushWheel() // commit a pending wheel zoom before reading the base for the toggle
    const z = viewer.getState().zoom
    const target = toggleZoom(z.scale, fit(), maxScale)
    commit(settle(focalZoom(z, toStage({ x: e.clientX, y: e.clientY }), target)))
  }

  // A mouse drag over the media starts the browser's native image drag-and-drop, which fires
  // pointercancel and steals the gesture. Block it on the media only: overlays and plugin UI in the
  // stage keep their own drag-and-drop.
  const onDragStart = (e: Event) => {
    const target = e.target as Element | null
    const content = getContent()
    if (!target || !content?.contains(target)) return
    if (target.closest?.('.gallerist-overlays-content')) return
    e.preventDefault()
  }

  stage.addEventListener('dragstart', onDragStart)
  stage.addEventListener('pointerdown', onDown)
  stage.addEventListener('pointermove', onMove)
  stage.addEventListener('pointerup', onUp)
  stage.addEventListener('pointercancel', onCancel)
  stage.addEventListener('wheel', onWheel, { passive: false })
  stage.addEventListener('dblclick', onDblClick)

  return () => {
    stage.removeEventListener('dragstart', onDragStart)
    stage.removeEventListener('pointerdown', onDown)
    stage.removeEventListener('pointermove', onMove)
    stage.removeEventListener('pointerup', onUp)
    stage.removeEventListener('pointercancel', onCancel)
    stage.removeEventListener('wheel', onWheel)
    stage.removeEventListener('dblclick', onDblClick)
    if (frame) caf(frame)
    flushWheel() // commit a settle-pending wheel zoom rather than dropping it on teardown
  }
}

function currentGroupHasMultiple(viewer: ViewerApi): boolean {
  const col = viewer.getCollection()
  const g = viewer.getState().cursor.g
  return (col.groups[g]?.items.length ?? 0) > 1
}
