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
import { type IdleController, createIdleController } from './idle'
import { type OverlayEntry, gatherOverlays, paintOverlays, updateOverlays } from './overlays/render'
import { type PresetName, resolvePreset } from './presets'
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
  /**
   * Auto-hide the chrome after a period of inactivity (UX-C), flagged as `data-visora-idle` for
   * the theme. Default true; inert under prefers-reduced-motion. The thumbnail rail collapses
   * separately (the `t` key / toggle button / fullscreen), tracked as `data-visora-rail`.
   */
  autoHide?: boolean
  /**
   * Named layout preset (UX-E) — sets `data-visora-preset` and supplies defaults for `arrows` and
   * `autoHide` (both still overridable by explicit options above). The preset's preferred
   * thumbnails() options are exposed via `resolvePreset(name).thumbnails` for the host to apply.
   */
  preset?: PresetName
  /**
   * Thumbnail rail placement (UX-E), surfaced as `data-visora-rail-pos`. `bottom` (default) keeps
   * the rail horizontal (group axis = ←/→); `left` / `right` run it vertically and remap the
   * keys/arrows (group axis = ↑/↓, items = ←/→ — touch swipes stay conventional); `hidden` starts
   * collapsed (reveal with the toggle / `t` / hover). Overridable; presets supply a default.
   */
  rail?: RailPlacement
  /**
   * Linear traversal (pairs with `thumbnails({ groupDisplay: 'flat' })`). When true, ←/→ walks the
   * flattened item sequence across groups (1a, 1b, 2a, 2b, 2c, 3a…), ↑/↓ retire, the counter shows
   * `item N / total`, and the within-group pills hide — surfaced as `data-visora-linear`.
   */
  linear?: boolean
  /**
   * Whether navigation wraps at the ends (mirror of the core `loop` option). Only consulted for
   * `linear` traversal, to wrap the flattened sequence at the global first/last item. Default false.
   */
  loop?: boolean
}

export type ArrowLayout = 'pill-right' | 'corner-br' | 'dpad' | 'split'
export type RailPlacement = 'bottom' | 'hidden' | 'left' | 'right'

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
  const preset = opts.preset ? resolvePreset(opts.preset) : null
  const arrows: ArrowLayout = opts.arrows ?? preset?.arrows ?? 'pill-right'
  const autoHide = opts.autoHide ?? preset?.autoHide ?? true
  const rail: RailPlacement = opts.rail ?? preset?.rail ?? 'bottom'
  const railHidden = rail === 'hidden'
  const railPos = rail === 'hidden' ? 'bottom' : rail // bottom | left | right
  // left/right rails run vertically, so the group axis becomes ↑/↓ and items ←/→ (point 5). Touch
  // swipes stay conventional (horizontal = group, swipe-down = dismiss) — only keys/arrows/layout flip.
  const orientation: 'horizontal' | 'vertical' =
    rail === 'left' || rail === 'right' ? 'vertical' : 'horizontal'
  const vertical = orientation === 'vertical'
  const linear = opts.linear ?? false
  const loop = opts.loop ?? false

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

  // ── navigation routing (linear flat traversal, point 3) ──────────────────────
  // In linear mode ←/→ walks the flattened (g,i) sequence across groups (1a,1b,2a,2b,2c,3a…) and
  // ↑/↓ retire; the flat list is cached and rebuilt only when the collection changes. `nav.*` is the
  // single seam the keymap, arrow buttons, and gestures route through, so behavior follows the mode.
  let flatSeq: Array<{ g: number; i: number }> = []
  let flatIdx = new Map<string, number>()
  let flatCol: unknown = null
  const ensureFlat = () => {
    const col = viewer.getCollection()
    if (col === flatCol) return
    flatCol = col
    flatSeq = []
    flatIdx = new Map()
    col.groups.forEach((grp, g) =>
      grp.items.forEach((_, i) => {
        flatIdx.set(`${g}:${i}`, flatSeq.length)
        flatSeq.push({ g, i })
      }),
    )
  }
  const flatPosition = (g: number, i: number): number => {
    ensureFlat()
    return flatIdx.get(`${g}:${i}`) ?? 0
  }
  const linearStep = (dir: 1 | -1) => {
    ensureFlat()
    if (flatSeq.length === 0) return
    const { g, i } = viewer.getState().cursor
    let n = (flatIdx.get(`${g}:${i}`) ?? 0) + dir
    if (n >= flatSeq.length) n = loop ? 0 : flatSeq.length - 1
    if (n < 0) n = loop ? flatSeq.length - 1 : 0
    const t = flatSeq[n]
    if (t) viewer.goTo(t.g, t.i)
  }
  const nav = {
    next: () => (linear ? linearStep(1) : viewer.next()),
    prev: () => (linear ? linearStep(-1) : viewer.prev()),
    nextItem: () => {
      if (!linear) viewer.nextItem() // the item axis retires in linear mode
    },
    prevItem: () => {
      if (!linear) viewer.prevItem()
    },
  }

  // ── DOM scaffold ───────────────────────────────────────────────────────────
  const root = el('div', 'visora')
  root.setAttribute('data-visora-mode', overlay ? 'overlay' : 'inline')
  root.setAttribute('data-visora-arrows', arrows)
  root.setAttribute('data-visora-rail-pos', railPos)
  root.setAttribute('data-visora-orientation', orientation)
  root.setAttribute('data-visora-rail', railHidden ? 'collapsed' : 'expanded')
  if (linear) root.setAttribute('data-visora-linear', 'true')
  if (preset) for (const [k, val] of Object.entries(preset.rootAttrs)) root.setAttribute(k, val)
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

  // Rail collapse (UX-C): a pull-handle attached to the rail's edge + `t` key + fullscreen →
  // data-visora-rail. The handle lives inside the thumbnails region so it reads as part of the
  // gallery and slides with it; it's (re)attached in mountRegions since the host is replaceChildren'd.
  let railCollapsed = railHidden
  let preFsCollapsed: boolean | null = null
  const railHandle = el('div', 'visora-rail-handle')
  const railToggle = el('button', 'visora-rail-toggle', {
    type: 'button',
    'aria-label': railHidden ? 'Show thumbnails' : 'Hide thumbnails',
    'aria-pressed': String(railHidden),
  })
  railToggle.innerHTML = ICONS.collapse
  railHandle.appendChild(railToggle)
  const setRailCollapsed = (v: boolean, manual = false) => {
    railCollapsed = v
    root.setAttribute('data-visora-rail', v ? 'collapsed' : 'expanded')
    railToggle.setAttribute('aria-pressed', String(v))
    railToggle.setAttribute('aria-label', v ? 'Show thumbnails' : 'Hide thumbnails')
    // a manual toggle while fullscreen wins over the on-exit restore
    if (manual) preFsCollapsed = null
  }
  railToggle.addEventListener('click', () => setRailCollapsed(!railCollapsed, true))

  let counter: HTMLElement | undefined
  let position: HTMLElement | undefined
  // segmented pills are rebuilt only when the active group / its size changes (UX-H)
  let posG = -1
  let posM = -1
  if (controls) {
    const chrome = el('div', 'visora-chrome')
    const close = el('button', 'visora-close', { type: 'button', 'aria-label': 'Close' })
    close.innerHTML = ICONS.close
    close.addEventListener('click', () => viewer.close())
    // Icons follow the orientation: horizontal → group ←/→, item ↑/↓; vertical → group ↑/↓, item ←/→.
    // (Positions are the CSS counterpart in `[data-visora-orientation="vertical"]`; keep the two in sync.)
    const prev = el('button', 'visora-prev', { type: 'button', 'aria-label': 'Previous' })
    prev.innerHTML = vertical ? ICONS.itemPrev : ICONS.prev
    prev.addEventListener('click', () => nav.prev())
    const next = el('button', 'visora-next', { type: 'button', 'aria-label': 'Next' })
    next.innerHTML = vertical ? ICONS.itemNext : ICONS.next
    next.addEventListener('click', () => nav.next())
    const prevItem = el('button', 'visora-item-prev', {
      type: 'button',
      'aria-label': 'Previous item',
    })
    prevItem.innerHTML = vertical ? ICONS.prev : ICONS.itemPrev
    prevItem.addEventListener('click', () => nav.prevItem())
    const nextItem = el('button', 'visora-item-next', { type: 'button', 'aria-label': 'Next item' })
    nextItem.innerHTML = vertical ? ICONS.next : ICONS.itemNext
    nextItem.addEventListener('click', () => nav.nextItem())
    const reset = el('button', 'visora-zoom-reset', { type: 'button', 'aria-label': 'Reset zoom' })
    reset.innerHTML = ICONS.zoomReset
    reset.addEventListener('click', () => viewer.resetZoom())
    counter = el('div', 'visora-counter')
    position = el('div', 'visora-position')
    position.hidden = true
    chrome.append(close, prev, next, prevItem, nextItem, reset, counter, position)
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

    const idxs = windowIndices(cur.g, groupCount, preload.ahead, preload.behind, viewer.loop)
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

  // within-group position: segmented pills for small groups, a mono counter for large ones (UX-H)
  const PILL_MAX = 8
  const updatePosition = (g: number, i: number, itemCount: number) => {
    if (!position) return
    if (itemCount <= 1) {
      if (posM !== 0) {
        position.replaceChildren()
        position.removeAttribute('data-mode')
        posG = -1
        posM = 0
      }
      position.hidden = true
      return
    }
    position.hidden = false
    if (itemCount > PILL_MAX) {
      position.dataset.mode = 'counter'
      position.textContent = `${i + 1} / ${itemCount}`
      posG = g
      posM = itemCount
      return
    }
    if (g !== posG || itemCount !== posM || position.dataset.mode !== 'pills') {
      position.dataset.mode = 'pills'
      position.replaceChildren()
      const label = el('span', 'visora-position-label')
      label.textContent = 'screen'
      position.appendChild(label)
      for (let k = 0; k < itemCount; k++) {
        const pill = el('button', 'visora-pill', {
          type: 'button',
          'aria-label': `Screen ${k + 1}`,
        })
        pill.textContent = String(k + 1)
        pill.addEventListener('click', () => viewer.goTo(g, k))
        position.appendChild(pill)
      }
      posG = g
      posM = itemCount
    }
    for (const [k, pill] of position.querySelectorAll('.visora-pill').entries()) {
      if (k === i) pill.setAttribute('data-active', '')
      else pill.removeAttribute('data-active')
    }
  }

  // gate chrome updates to cursor/collection changes — skip zoom/pan commits (mirrors the rail)
  let chromeG = -1
  let chromeI = -1
  let chromeCol: unknown = null
  const updateChrome = () => {
    const col = viewer.getCollection()
    const cur = viewer.getState().cursor
    if (col === chromeCol && cur.g === chromeG && cur.i === chromeI) return
    chromeCol = col
    chromeG = cur.g
    chromeI = cur.i
    const G = col.groups.length
    const itemCount = col.groups[cur.g]?.items.length ?? 0
    if (linear) {
      // flat linear: one running position across all items; the within-group pills retire.
      const pos = flatPosition(cur.g, cur.i) + 1 // flatPosition() also rebuilds flatSeq if needed
      const total = flatSeq.length
      if (counter) counter.textContent = `${pos} / ${total}`
      if (position) position.hidden = true
      live.textContent = `Item ${pos} of ${total}`
    } else {
      if (counter) counter.textContent = `${cur.g + 1} / ${G}`
      updatePosition(cur.g, cur.i, itemCount)
      live.textContent =
        itemCount > 1
          ? `Group ${cur.g + 1} of ${G}, screen ${cur.i + 1} of ${itemCount}`
          : `Group ${cur.g + 1} of ${G}`
    }
  }

  // ── attach / detach ──────────────────────────────────────────────────────────
  let attached = false
  let prevOverflow = ''
  let restoreFocus: HTMLElement | null = null

  // Auto-hide chrome on idle (UX-C); inert under reduced motion. Rail collapse is independent.
  // Created before attach() so the (TDZ-safe) poke on show works in both overlay and inline modes.
  const idle: IdleController | null = autoHide ? createIdleController(root) : null

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
    idle?.poke() // start the idle countdown from when the viewer is shown
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
    idle?.poke()
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
  // Which physical arrow drives which axis depends on orientation (point 5): a vertical (left/right)
  // rail makes ↑/↓ the group axis and ←/→ the item axis; horizontal keeps the classic mapping.
  const arrowNav: Record<string, () => void> = vertical
    ? {
        ArrowDown: nav.next,
        ArrowUp: nav.prev,
        ArrowRight: nav.nextItem,
        ArrowLeft: nav.prevItem,
      }
    : {
        ArrowRight: nav.next,
        ArrowLeft: nav.prev,
        ArrowDown: nav.nextItem,
        ArrowUp: nav.prevItem,
      }
  const onKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowDown':
        arrowNav[e.key]?.()
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
      case 't':
      case 'T':
        setRailCollapsed(!railCollapsed, true)
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

  // Collapse the rail by default while our element is fullscreen; restore the prior state on exit.
  const isOurFullscreen = () => {
    const fe = document.fullscreenElement
    return !!fe && (fe === root || root.contains(fe))
  }
  const onFsChange = () => {
    if (isOurFullscreen()) {
      if (preFsCollapsed === null) preFsCollapsed = railCollapsed
      setRailCollapsed(true)
    } else if (preFsCollapsed !== null) {
      setRailCollapsed(preFsCollapsed)
      preFsCollapsed = null
    }
  }
  document.addEventListener('fullscreenchange', onFsChange)

  // ── live gestures (spec §11; imperative during gesture, decision P0-E) ─────────
  const currentRec = () => {
    const key = viewer.getCollection().groups[viewer.getState().cursor.g]?.id
    return key ? mounted.get(key) : undefined
  }
  const detachGestures = attachGestures({
    stage,
    viewer,
    nav, // route swipes through the linear/oriented nav seam
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
    // attach the pull-handle into the rail region (only when a rail is mounted); mountPluginRegions
    // replaceChildren'd the host, so prepend it fresh each time.
    if (regionHosts.thumbnails.childElementCount > 0) {
      regionHosts.thumbnails.prepend(railHandle)
    }
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
      idle?.destroy()
      document.removeEventListener('fullscreenchange', onFsChange)
      root.removeEventListener('keydown', onKey)
      for (const rec of mounted.values()) teardownSlide(rec)
      mounted.clear()
      detach()
      if (!overlay) root.remove()
    },
  }
}
