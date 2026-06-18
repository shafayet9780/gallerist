// Default DOM renderer (spec §8.3, §10, §17). Subscribes to the headless viewer and
// projects state into DOM: portal/inline modes, windowed slides + node recycling, the
// image adapter, minimal chrome, dialog a11y, keyboard map, and the committed zoom transform.
// Live pan/zoom (imperative RAF) and motion land in M3.4 / M5.

import {
  type MediaAdapter,
  type OverlaySpec,
  type Phase,
  type ViewerApi,
  type ZoomState,
  clampScale,
  focalZoom,
} from '@visora/core'
import { imageAdapter } from './adapters/image'
import { attachGestures } from './gestures'
import { ICONS } from './icons'
import { type OverlayEntry, gatherOverlays, paintOverlays, updateOverlays } from './overlays/render'
import { type RegionHosts, aggregateKeymap, mountPluginRegions } from './regions'
import { reconcileKeys, windowIndices } from './windowing'

export interface MountOptions {
  /** null/undefined → overlay (portal to body); element → inline. */
  container?: HTMLElement | null
  controls?: boolean
  adapters?: MediaAdapter[]
  preload?: { ahead: number; behind: number }
  /** global overlays applied to every slide (spec §8.1, §9). */
  overlays?: OverlaySpec[]
  /**
   * Placement of the within-group ↑/↓ arrows, surfaced as `data-visora-arrows` for the theme
   * (UX-D). `pill-right` (default): ←/→ on the side edges, ↑/↓ as a stacked pill at right-center.
   * `corner-br`: ↑/↓ paired bottom-right. `dpad`: all four clustered as a d-pad. `split`: legacy
   * ↑/↓ top/bottom-center.
   */
  arrows?: ArrowLayout
}

export type ArrowLayout = 'pill-right' | 'corner-br' | 'dpad' | 'split'

export interface RendererHandle {
  root: HTMLElement
  destroy(): void
}

interface SlideRec {
  slide: HTMLElement
  content: HTMLElement
  overlayHost: HTMLElement
  itemId?: string
  media?: ReturnType<MediaAdapter['mount']>
  abort?: AbortController
  overlayEls?: OverlayEntry[]
  overlayItemId?: string
  activated?: boolean
}

function el(tag: string, className?: string, attrs?: Record<string, string>): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

function applyTransform(content: HTMLElement, zoom: ZoomState): void {
  content.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`
}

export function mount(viewer: ViewerApi, opts: MountOptions = {}): RendererHandle {
  const overlay = !opts.container
  const container = opts.container ?? null
  const controls = opts.controls ?? true
  const preload = opts.preload ?? { ahead: 2, behind: 1 }
  const arrows: ArrowLayout = opts.arrows ?? 'pill-right'

  // Aggregate plugin extensions (adapters/overlays captured at mount; regions + keymap re-applied
  // live on plugin changes, see below). Plugins register on the viewer (decision P1-C).
  const plugins = viewer.getPlugins()
  const baseAdapters = opts.adapters ?? [imageAdapter()]
  // Adapters, overlays, and keymap are recomputed live so a plugin added via use() after mount
  // contributes all of its extensions, not just regions (review T4 / Important #5).
  const currentAdapters = () => [
    ...baseAdapters,
    ...viewer.getPlugins().flatMap((p) => p.mediaAdapters ?? []),
  ]
  const currentGlobalOverlays = () => [
    ...(opts.overlays ?? []),
    ...viewer.getPlugins().flatMap((p) => p.overlays ?? []),
  ]
  let pluginKeymap = aggregateKeymap(plugins)

  const pickAdapter = (type: string, item: Parameters<MediaAdapter['mount']>[0]) =>
    currentAdapters().find((a) => (a.match ? a.match(item) : a.type === type))

  // ── DOM scaffold ───────────────────────────────────────────────────────────
  const root = el('div', 'visora')
  root.setAttribute('data-visora-mode', overlay ? 'overlay' : 'inline')
  root.setAttribute('data-visora-arrows', arrows)
  if (overlay) {
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.tabIndex = -1
  } else {
    root.setAttribute('role', 'group')
    root.setAttribute('aria-roledescription', 'carousel')
  }

  if (overlay) root.appendChild(el('div', 'visora-backdrop'))
  const stage = el('div', 'visora-stage')
  const track = el('div', 'visora-track')
  const viewportLayer = el('div', 'visora-viewport-layer')
  const stageRegion = el('div', 'visora-region visora-region-stage')
  stage.append(track, viewportLayer, stageRegion)
  root.appendChild(stage)

  // Named region hosts for plugins (spec §13).
  const regionHosts: RegionHosts = {
    backdrop: el('div', 'visora-region visora-region-backdrop'),
    stage: stageRegion,
    toolbar: el('div', 'visora-region visora-region-toolbar'),
    thumbnails: el('div', 'visora-region visora-region-thumbnails'),
    footer: el('div', 'visora-region visora-region-footer'),
  }
  root.prepend(regionHosts.backdrop)
  root.append(regionHosts.toolbar, regionHosts.thumbnails, regionHosts.footer)

  const live = el('div', 'visora-live', { 'aria-live': 'polite', role: 'status' })
  root.appendChild(live)

  let counter: HTMLElement | undefined
  if (controls) {
    const chrome = el('div', 'visora-chrome')
    const close = el('button', 'visora-close', { type: 'button', 'aria-label': 'Close' })
    close.innerHTML = ICONS.close
    close.addEventListener('click', () => viewer.close())
    const prev = el('button', 'visora-prev', { type: 'button', 'aria-label': 'Previous' })
    prev.innerHTML = ICONS.prev
    prev.addEventListener('click', () => viewer.prev())
    const next = el('button', 'visora-next', { type: 'button', 'aria-label': 'Next' })
    next.innerHTML = ICONS.next
    next.addEventListener('click', () => viewer.next())
    const prevItem = el('button', 'visora-item-prev', {
      type: 'button',
      'aria-label': 'Previous item',
    })
    prevItem.innerHTML = ICONS.itemPrev
    prevItem.addEventListener('click', () => viewer.prevItem())
    const nextItem = el('button', 'visora-item-next', { type: 'button', 'aria-label': 'Next item' })
    nextItem.innerHTML = ICONS.itemNext
    nextItem.addEventListener('click', () => viewer.nextItem())
    const reset = el('button', 'visora-zoom-reset', { type: 'button', 'aria-label': 'Reset zoom' })
    reset.innerHTML = ICONS.zoomReset
    reset.addEventListener('click', () => viewer.resetZoom())
    counter = el('div', 'visora-counter')
    chrome.append(close, prev, next, prevItem, nextItem, reset, counter)
    root.appendChild(chrome)
  }

  // ── slide window ─────────────────────────────────────────────────────────────
  const mounted = new Map<string, SlideRec>()
  let lastCursor: { g: number; i: number } | null = null

  // groupId → index, rebuilt only when the collection reference changes (setCollection).
  // Avoids an O(groups) findIndex per mounted slide on every render (matters at 10k groups).
  let indexCol: unknown = null
  let idIndex = new Map<string, number>()
  const groupIndex = (id: string): number => {
    const col = viewer.getCollection()
    if (col !== indexCol) {
      indexCol = col
      idIndex = new Map(col.groups.map((g, i) => [g.id, i]))
    }
    return idIndex.get(id) ?? -1
  }

  // Tag the current slide with the axis of motion so the theme can use visibly distinct
  // transitions (spec §27.5): group axis = horizontal time slide, item axis = depth pop.
  const tagAxis = (currentSlide: HTMLElement, cur: { g: number; i: number }) => {
    if (lastCursor && (lastCursor.g !== cur.g || lastCursor.i !== cur.i)) {
      const axis = lastCursor.g !== cur.g ? 'group' : 'item'
      currentSlide.removeAttribute('data-visora-enter')
      void currentSlide.offsetWidth // reflow to restart the CSS animation
      currentSlide.setAttribute('data-visora-enter', axis)
    }
    lastCursor = { g: cur.g, i: cur.i }
  }

  const teardownSlide = (rec: SlideRec) => {
    rec.abort?.abort()
    rec.media?.destroy()
    rec.slide.remove()
  }

  const renderWindow = () => {
    const state = viewer.getState()
    const col = viewer.getCollection()
    const groupCount = col.groups.length
    if (groupCount === 0) return
    const cur = state.cursor

    const idxs = windowIndices(cur.g, groupCount, preload.ahead, preload.behind, false)
    const wantKeys = idxs.map((g) => col.groups[g]?.id ?? '')
    const { enter, exit } = reconcileKeys([...mounted.keys()], wantKeys)

    for (const k of exit) {
      const rec = mounted.get(k)
      if (rec) teardownSlide(rec)
      mounted.delete(k)
    }
    for (const k of enter) {
      const slide = el('div', 'visora-slide', { 'data-group': k })
      const content = el('div', 'visora-content')
      const overlayHost = el('div', 'visora-overlays-content')
      content.appendChild(overlayHost)
      slide.appendChild(content)
      track.appendChild(slide)
      mounted.set(k, { slide, content, overlayHost })
    }

    for (const [k, rec] of mounted) {
      const g = groupIndex(k)
      if (g < 0) continue
      const isCurrent = g === cur.g
      const group = col.groups[g]
      if (!group) continue
      const itemIndex = isCurrent ? cur.i : 0
      const it = group.items[itemIndex]
      if (it && rec.itemId !== it.id) {
        rec.abort?.abort()
        rec.media?.destroy()
        const abort = new AbortController()
        rec.media = pickAdapter(it.type, it)?.mount(it, rec.content, {
          signal: abort.signal,
          priority: isCurrent ? 'high' : 'low',
        })
        rec.abort = abort
        rec.itemId = it.id
        rec.activated = false
        rec.content.appendChild(rec.overlayHost) // keep overlays above the media
      }
      // activate/deactivate media on slide enter/leave (spec §12 — play/pause for video)
      if (isCurrent && !rec.activated) {
        rec.media?.activate?.()
        rec.activated = true
      } else if (!isCurrent && rec.activated) {
        rec.media?.deactivate?.()
        rec.activated = false
      }
      if (isCurrent) {
        tagAxis(rec.slide, cur)
        rec.slide.setAttribute('data-visora-current', '')
        rec.content.setAttribute('data-visora-current', '')
        applyTransform(rec.content, state.zoom)
        if (it) {
          // Repaint (re-invokes user render() + rebuilds DOM) only when the item changes.
          // On a zoom-only change, update retained overlays in place (spec §9.2: no rebuild).
          if (rec.overlayItemId !== it.id) {
            const r = stage.getBoundingClientRect()
            const stageSize = { w: r.width, h: r.height }
            rec.overlayEls = paintOverlays(
              viewportLayer,
              rec.overlayHost,
              gatherOverlays(group, it, currentGlobalOverlays()),
              {
                group,
                item: it,
                viewer,
                zoom: state.zoom,
                stage: stageSize,
                natural: rec.media?.naturalSize?.() ?? stageSize,
              },
            )
            rec.overlayItemId = it.id
          } else if (rec.overlayEls) {
            updateOverlays(rec.overlayEls, state.zoom.scale)
          }
        }
      } else {
        rec.slide.removeAttribute('data-visora-current')
        rec.content.removeAttribute('data-visora-current')
        rec.overlayHost.replaceChildren()
        rec.overlayEls = undefined
        rec.overlayItemId = undefined
      }
    }
  }

  const updateChrome = () => {
    const state = viewer.getState()
    const col = viewer.getCollection()
    const G = col.groups.length
    const cur = state.cursor
    const group = col.groups[cur.g]
    const M = group?.items.length ?? 0
    if (counter) {
      counter.textContent =
        M > 1 ? `${cur.g + 1} / ${G} · ${cur.i + 1}/${M}` : `${cur.g + 1} / ${G}`
    }
    live.textContent =
      M > 1
        ? `Group ${cur.g + 1} of ${G}, screen ${cur.i + 1} of ${M}`
        : `Group ${cur.g + 1} of ${G}`
  }

  // ── attach / detach ──────────────────────────────────────────────────────────
  let attached = false
  let prevOverflow = ''
  let restoreFocus: HTMLElement | null = null

  const attach = () => {
    if (attached) return
    attached = true
    if (overlay) {
      restoreFocus = document.activeElement as HTMLElement | null
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.body.appendChild(root)
      root.focus()
    }
  }
  const detach = () => {
    if (!attached) return
    attached = false
    if (overlay) {
      document.body.style.overflow = prevOverflow
      root.remove()
      restoreFocus?.focus?.()
    }
  }

  // inline mode is always present in its container
  if (!overlay && container) {
    container.appendChild(root)
    attached = true
  }

  const sync = () => {
    const phase: Phase = viewer.getState().phase
    if (overlay) {
      if (phase !== 'closed') attach()
      else detach()
    }
    if (attached) {
      renderWindow()
      updateChrome()
    }
  }

  // Keyboard zoom pivots on the stage centre (not the transform origin), spec §5.
  const zoomAroundCenter = (factor: number) => {
    const r = stage.getBoundingClientRect()
    const z = viewer.getState().zoom
    const newScale = clampScale(z.scale * factor, 1, 4) // fit == 1 in the contained model
    const next = focalZoom(z, { x: r.width / 2, y: r.height / 2 }, newScale)
    viewer.zoomTo(next.scale, { x: next.x, y: next.y })
  }

  // ── keyboard (spec §5) ───────────────────────────────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
        viewer.next()
        break
      case 'ArrowLeft':
        viewer.prev()
        break
      case 'ArrowDown':
        viewer.nextItem()
        break
      case 'ArrowUp':
        viewer.prevItem()
        break
      case 'Escape':
        viewer.close()
        break
      case '+':
      case '=':
        zoomAroundCenter(1.25)
        break
      case '-':
        zoomAroundCenter(1 / 1.25)
        break
      case '0':
        viewer.resetZoom()
        break
      case 'Home':
        viewer.goTo(0)
        break
      case 'End':
        viewer.goTo(viewer.getCollection().groups.length - 1)
        break
      default:
        if (/^[1-9]$/.test(e.key)) {
          viewer.goTo(viewer.getState().cursor.g, Number(e.key) - 1)
        } else if (pluginKeymap[e.key]) {
          pluginKeymap[e.key]?.(e)
        }
        return
    }
    e.preventDefault()
  }
  root.addEventListener('keydown', onKey)

  // ── live gestures (spec §11; imperative during gesture, decision P0-E) ─────────
  const currentRec = () => {
    const key = viewer.getCollection().groups[viewer.getState().cursor.g]?.id
    return key ? mounted.get(key) : undefined
  }
  const detachGestures = attachGestures({
    stage,
    viewer,
    getContent: () => currentRec()?.content ?? null,
    getGeometry: () => {
      const r = stage.getBoundingClientRect()
      // Phase 0 coordinate model: the media is CSS-contained (object-fit) so the content
      // layer fills the stage and scale 1 == fit. Pan bounds therefore use the stage size;
      // the media's true pixel size drives only the CSS layout. (Natural-coordinate overlays
      // map through the contained rect in M4.)
      return {
        stageRect: { left: r.left, top: r.top, width: r.width, height: r.height },
        naturalSize: { w: r.width, h: r.height },
      }
    },
  })

  // ── plugin regions (spec §13) ──────────────────────────────────────────────
  const mountRegions = () => {
    pluginKeymap = aggregateKeymap(viewer.getPlugins())
    mountPluginRegions(regionHosts, viewer.getPlugins(), { viewer })
    // plugin overlays may have changed (e.g. React <Visora.Overlay> mount/unmount) → force repaint
    const cur = currentRec()
    if (cur) cur.overlayItemId = undefined
    if (attached) renderWindow()
  }
  mountRegions()
  const offPlugins = viewer.onPluginsChanged(mountRegions)

  const unsubscribe = viewer.subscribe(sync)
  sync()

  return {
    root,
    destroy() {
      unsubscribe()
      offPlugins()
      detachGestures()
      root.removeEventListener('keydown', onKey)
      for (const rec of mounted.values()) teardownSlide(rec)
      mounted.clear()
      detach()
      if (!overlay) root.remove()
    },
  }
}
