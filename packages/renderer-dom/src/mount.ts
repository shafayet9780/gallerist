// Default DOM renderer (spec §8.3, §10, §17). Subscribes to the headless viewer and
// projects state into DOM: portal/inline modes, windowed slides + node recycling, the
// image adapter, minimal chrome, dialog a11y, keyboard map, and the committed zoom transform.
// Live pan/zoom (imperative RAF) and motion land in M3.4 / M5.

import type { MediaAdapter, Phase, ViewerApi, ZoomState } from '@visora/core'
import { imageAdapter } from './adapters/image'
import { attachGestures } from './gestures'
import { reconcileKeys, windowIndices } from './windowing'

export interface MountOptions {
  /** null/undefined → overlay (portal to body); element → inline. */
  container?: HTMLElement | null
  controls?: boolean
  adapters?: MediaAdapter[]
  preload?: { ahead: number; behind: number }
}

export interface RendererHandle {
  root: HTMLElement
  destroy(): void
}

interface SlideRec {
  slide: HTMLElement
  content: HTMLElement
  itemId?: string
  media?: ReturnType<MediaAdapter['mount']>
  abort?: AbortController
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
  const adapters = opts.adapters ?? [imageAdapter()]
  const preload = opts.preload ?? { ahead: 2, behind: 1 }

  const pickAdapter = (type: string, item: Parameters<MediaAdapter['mount']>[0]) =>
    adapters.find((a) => (a.match ? a.match(item) : a.type === type))

  // ── DOM scaffold ───────────────────────────────────────────────────────────
  const root = el('div', 'visora')
  root.classList.add(overlay ? 'visora-overlay' : 'visora-inline')
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
  stage.appendChild(track)
  root.appendChild(stage)

  const live = el('div', 'visora-live', { 'aria-live': 'polite', role: 'status' })
  root.appendChild(live)

  let counter: HTMLElement | undefined
  if (controls) {
    const chrome = el('div', 'visora-chrome')
    const close = el('button', 'visora-close', { type: 'button', 'aria-label': 'Close' })
    close.addEventListener('click', () => viewer.close())
    const prev = el('button', 'visora-prev', { type: 'button', 'aria-label': 'Previous' })
    prev.addEventListener('click', () => viewer.prev())
    const next = el('button', 'visora-next', { type: 'button', 'aria-label': 'Next' })
    next.addEventListener('click', () => viewer.next())
    const prevItem = el('button', 'visora-item-prev', {
      type: 'button',
      'aria-label': 'Previous item',
    })
    prevItem.addEventListener('click', () => viewer.prevItem())
    const nextItem = el('button', 'visora-item-next', { type: 'button', 'aria-label': 'Next item' })
    nextItem.addEventListener('click', () => viewer.nextItem())
    const reset = el('button', 'visora-zoom-reset', { type: 'button', 'aria-label': 'Reset zoom' })
    reset.addEventListener('click', () => viewer.resetZoom())
    counter = el('div', 'visora-counter')
    chrome.append(close, prev, next, prevItem, nextItem, reset, counter)
    root.appendChild(chrome)
  }

  // ── slide window ─────────────────────────────────────────────────────────────
  const mounted = new Map<string, SlideRec>()

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
      slide.appendChild(content)
      track.appendChild(slide)
      mounted.set(k, { slide, content })
    }

    for (const [k, rec] of mounted) {
      const g = col.groups.findIndex((gr) => gr.id === k)
      if (g < 0) continue
      const isCurrent = g === cur.g
      const group = col.groups[g]
      if (!group) continue
      const itemIndex = isCurrent ? cur.i : 0
      const it = group.items[itemIndex]
      if (it && rec.itemId !== it.id) {
        rec.abort?.abort()
        rec.media?.destroy()
        rec.content.replaceChildren()
        const abort = new AbortController()
        rec.media = pickAdapter(it.type, it)?.mount(it, rec.content, {
          signal: abort.signal,
          priority: isCurrent ? 'high' : 'low',
        })
        rec.abort = abort
        rec.itemId = it.id
      }
      if (isCurrent) {
        rec.slide.setAttribute('data-visora-current', '')
        rec.content.setAttribute('data-visora-current', '')
        applyTransform(rec.content, state.zoom)
      } else {
        rec.slide.removeAttribute('data-visora-current')
        rec.content.removeAttribute('data-visora-current')
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
        viewer.zoomTo(viewer.getState().zoom.scale * 1.25)
        break
      case '-':
        viewer.zoomTo(viewer.getState().zoom.scale / 1.25)
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
        if (/^[1-9]$/.test(e.key)) viewer.goTo(viewer.getState().cursor.g, Number(e.key) - 1)
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
      return {
        stageRect: { left: r.left, top: r.top, width: r.width, height: r.height },
        naturalSize: currentRec()?.media?.naturalSize?.() ?? null,
      }
    },
  })

  const unsubscribe = viewer.subscribe(sync)
  sync()

  return {
    root,
    destroy() {
      unsubscribe()
      detachGestures()
      root.removeEventListener('keydown', onKey)
      for (const rec of mounted.values()) teardownSlide(rec)
      mounted.clear()
      detach()
      if (!overlay) root.remove()
    },
  }
}
