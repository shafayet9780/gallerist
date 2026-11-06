// @gallerist/plugin-zoom — a zoom tool in the viewer's toolbar: "− 100% +".
//
// Zoom out, the current zoom (pressing it fits the image again), zoom in. The steps are stops of
// the zoom range (fit, 150%, 200%, 300%, 400% by default; 100% is the image fitted to the stage), and
// every step pivots on the stage's centre (`viewer.zoomTo`, which keeps the view inside the image).
// While the viewer has focus, `+` / `=`, `-` and `0` take the same steps: the renderer's own zoom
// keys step by a fixed factor, so the tool takes those keys first and the two never disagree.
//
// The percentage follows every zoom: the committed one from the viewer's state, and the live
// transform while a pinch, a wheel or a double click is still moving (the renderer applies those to
// the current slide's content before it commits them, so the plugin reads that transform).
// `− +` are unavailable (aria-disabled, still focusable, so focus never drops) at either end of the
// range and while the current item can't zoom: a video or another non-image, one still loading, one
// that failed. The percentage is unavailable at fit, where there's nothing to reset.

import type { Item, Plugin, ViewerApi } from '@gallerist/core'

export interface ZoomStrings {
  /** the tool's group name */
  zoom: string
  zoomIn: string
  zoomOut: string
  /** the percentage button's name, with the zoom it shows (it fits the image again) */
  reset: (percent: string) => string
  /** how a zoom reads (`scale` 1 is the image fitted to the stage) */
  percent: (scale: number) => string
}

export const DEFAULT_ZOOM_STRINGS: ZoomStrings = {
  zoom: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: (percent) => `${percent}, fit to screen`,
  percent: (scale) => `${Math.round(scale * 100)}%`,
}

export interface ZoomOptions {
  /** The zoom levels − and + step through, as scales (1 = fit). Default `[1, 1.5, 2, 3, 4]`, the DOM
   *  renderer's range (fit to 400%); the first and last are the ends of the range. */
  stops?: readonly number[]
  /** Whether an item can zoom (when it has loaded). Default: images (`type: 'image'`). */
  zoomable?: (item: Item) => boolean
  /** `+` / `=`, `-` and `0` step through the stops while the viewer has focus. Default true; `false`
   *  leaves those keys to the renderer (which steps by its own factor). */
  keys?: boolean
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<ZoomStrings>
}

export const DEFAULT_STOPS: readonly number[] = [1, 1.5, 2, 3, 4]

// the shared icon family's look (core's ICONS)
const icon = (body: string) =>
  `<svg class="gallerist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
const MINUS = icon('<path d="M5 12h14"/>')
const PLUS = icon('<path d="M5 12h14"/><path d="M12 5v14"/>')

/** Within a hair of a stop counts as on it (zooms are floats; a pinch rarely lands exactly). */
const EPS = 0.01

/** The stop after `scale` going `dir` (+1 in, −1 out), or `scale` itself at that end. */
export function nextStop(stops: readonly number[], scale: number, dir: 1 | -1): number {
  const sorted = [...stops].sort((a, b) => a - b)
  if (dir > 0) return sorted.find((s) => s > scale + EPS) ?? scale
  return [...sorted].reverse().find((s) => s < scale - EPS) ?? scale
}

const SCALE = /scale\(\s*([\d.]+)/
const editable = (target: EventTarget | null) => {
  const node = target as HTMLElement | null
  return !!node && (node.isContentEditable || /^(input|textarea|select)$/i.test(node.tagName ?? ''))
}

export function zoom(opts: ZoomOptions = {}): Plugin {
  const t: ZoomStrings = { ...DEFAULT_ZOOM_STRINGS, ...opts.strings }
  const stops = (opts.stops?.length ? [...opts.stops] : [...DEFAULT_STOPS]).sort((a, b) => a - b)
  const min = stops[0] ?? 1
  const max = stops[stops.length - 1] ?? 1
  const zoomable = opts.zoomable ?? ((item: Item) => item.type === 'image')

  return (viewer: ViewerApi) => {
    let group: HTMLElement | null = null
    let out: HTMLButtonElement | null = null
    let level: HTMLButtonElement | null = null
    let into: HTMLButtonElement | null = null
    let root: HTMLElement | null = null
    let unsub: (() => void) | null = null
    let watch: MutationObserver | null = null
    let live: number | null = null // the transform a gesture shows before it commits

    // whether the current item can zoom now: an image (by default) that has loaded
    const canZoom = () => {
      const { cursor, loaded } = viewer.getState()
      const item = viewer.getCollection().groups[cursor.g]?.items[cursor.i]
      return !!item && zoomable(item) && loaded[item.id] === 'loaded'
    }
    const scale = () => live ?? viewer.getState().zoom.scale

    const off = (btn: HTMLButtonElement | null, disabled: boolean) => {
      if (!btn) return
      if (disabled) btn.setAttribute('aria-disabled', 'true')
      else btn.removeAttribute('aria-disabled')
    }
    const paint = () => {
      if (!level) return
      const s = Math.max(min, scale())
      const percent = t.percent(s)
      const ok = canZoom()
      if (level.textContent !== percent) level.textContent = percent
      level.setAttribute('aria-label', t.reset(percent))
      off(out, !ok || s <= min + EPS)
      off(into, !ok || s >= max - EPS)
      off(level, s <= 1 + EPS)
    }

    const step = (dir: 1 | -1) => {
      if (!canZoom()) return
      const s = scale()
      const to = nextStop(stops, s, dir)
      if (to !== s) viewer.zoomTo(to)
    }
    const fit = () => {
      if (viewer.getState().zoom.scale > 1 + EPS) viewer.resetZoom()
    }

    // the renderer's zoom keys step by its own factor: take them first (capture on the viewer's
    // root), unless typing (a field in the viewer keeps them) or a chord (the browser's zoom)
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return
      const dir = e.key === '+' || e.key === '=' ? 1 : e.key === '-' ? -1 : e.key === '0' ? 0 : null
      if (dir === null) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (dir === 0) fit()
      else step(dir)
    }

    // A gesture's live transform on the current slide's content (the renderer commits it at the
    // end): show it while it moves. A drag to dismiss shrinks the content too; that isn't a zoom.
    const onMutate = (records: MutationRecord[]) => {
      let seen = false
      for (const r of records) {
        const el = r.target as HTMLElement
        if (!el.classList?.contains('gallerist-content')) continue
        if (!el.hasAttribute('data-gallerist-current')) continue
        const m = SCALE.exec(el.style.transform)
        const s = m ? Number(m[1]) : Number.NaN
        if (!Number.isFinite(s)) continue
        live = Math.abs(s - viewer.getState().zoom.scale) > EPS && s >= min ? s : null
        seen = true
      }
      if (seen) paint()
    }

    const attach = () => {
      const found = group?.closest<HTMLElement>('.gallerist') ?? null
      if (!found || found === root) return
      detach()
      root = found
      if (opts.keys !== false) root.addEventListener('keydown', onKey, true)
      if (typeof MutationObserver !== 'undefined') {
        watch = new MutationObserver(onMutate)
        watch.observe(root, { subtree: true, attributeFilter: ['style'] })
      }
    }
    const detach = () => {
      root?.removeEventListener('keydown', onKey, true)
      watch?.disconnect()
      watch = null
      root = null
    }

    const button = (className: string, label: string, html: string, onClick: () => void) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = className
      btn.setAttribute('aria-label', label)
      btn.innerHTML = html
      // aria-disabled, not disabled: focus stays on a tool that reaches the end of the range
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-disabled') !== 'true') onClick()
      })
      return btn
    }

    const build = () => {
      group = document.createElement('div')
      group.className = 'gallerist-zoom-tool'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', t.zoom)
      out = button('gallerist-zoom-out', t.zoomOut, MINUS, () => step(-1))
      level = button('gallerist-zoom-level', '', '', fit)
      into = button('gallerist-zoom-in', t.zoomIn, PLUS, () => step(1))
      group.append(out, level, into)
      paint()
      queueMicrotask(attach) // once the renderer has put the tool in the viewer
      return group
    }

    return {
      name: 'zoom',
      init() {
        unsub = viewer.subscribe(() => {
          live = null // a commit (or a new item) settles the live transform
          if (!root) attach()
          paint()
        })
      },
      destroy() {
        unsub?.()
        unsub = null
        detach()
        group = out = level = into = null
      },
      regions: { toolbar: build },
    }
  }
}
