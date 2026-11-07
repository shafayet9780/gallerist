// Image media adapter (spec §12, decision P0-J). Lives in the renderer because it touches DOM.
// Responsive srcset, decode-before-reveal, a placeholder in the image's box, naturalSize hint,
// abortable load.

import type { AdapterCtx, Item, MediaAdapter, MountedMedia } from '@gallerist/core'
import { DEFAULT_STRINGS, type Strings } from '../strings'

/** What the DOM renderer adds to an adapter's context. */
export interface DomAdapterCtx extends AdapterCtx {
  /** the renderer's UI text */
  strings?: Strings
  /** mount the item again: a fresh, abortable load (a Retry control's action) */
  retry?: () => void
}

// a colour (`#123`, `red`, `rgb(0 0 0 / 50%)`, `oklch(…)`); anything else is an image URL
const COLOR_RE = /^(#[\da-f]{3,8}|[a-z-]+(\(.*\))?)$/i

// Static broken-image glyph (lucide "image-off"); safe to inject as markup (no user data).
const BROKEN_ICON =
  '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.4 10.4a2 2 0 1 1-2.8-2.8"/><path d="M21 15.5V5a2 2 0 0 0-2-2H8.5"/><path d="M3.6 3.6A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.4-.6"/><path d="m5 21 7-7"/><path d="m2 2 20 20"/></svg>'

export function imageAdapter(): MediaAdapter {
  return { type: 'image', mount: mountImage }
}

/** The built-in image adapter's mount; the renderer preloads only items it would mount. */
export function mountImage(item: Item, slot: HTMLElement, ctx: DomAdapterCtx): MountedMedia {
  const t = ctx.strings ?? DEFAULT_STRINGS
  const img = document.createElement('img')
  img.setAttribute('decoding', 'async')
  img.setAttribute('fetchpriority', ctx.priority ?? 'auto')
  img.className = 'gallerist-media gallerist-media-image'
  if (item.alt !== undefined) img.alt = item.alt

  // The placeholder, in the box the image will paint in (the theme sizes it from the ratio): an
  // image URL (best the thumb the rail already loaded) blurred until the image is in, a colour as a
  // flat fill, or nothing: a skeleton. A slow load says so in a pill in the box's corner.
  const box = document.createElement('div')
  box.className = 'gallerist-media-placeholder'
  const ratio = (w: number, h: number) => {
    if (w && h) box.style.setProperty('--gallerist-media-ratio', `${w} / ${h}`)
  }
  const ph = item.placeholder
  const size = item.naturalSize
  if (size) ratio(size.w, size.h)
  let status: Element | null = null // the pill's live line
  if (ph && COLOR_RE.test(ph)) box.style.backgroundColor = ph
  else if (ph) {
    const pv = document.createElement('img')
    pv.alt = ''
    // its shape stands in for the image's until that's known (a cached thumb has it at once)
    const fit = () => size || ratio(pv.naturalWidth, pv.naturalHeight)
    pv.onload = fit
    pv.src = ph
    fit()
    // shown after a delay (the theme's; it draws the spinner); the live line's text changes once,
    // on a failure
    const pill = document.createElement('div')
    pill.className = 'gallerist-media-pill'
    status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.textContent = t.loadingFull
    pill.appendChild(status)
    box.append(pv, pill)
  } else box.setAttribute('data-gallerist-skeleton', '')
  slot.append(box, img)
  const settle = (state: string) => {
    img.setAttribute(state, '')
    box.setAttribute(state, '')
  }

  // A loader may resolve to a custom element instead of an <img>; track the live node.
  let element: HTMLElement = img

  // On load failure with an image placeholder, it stays, sharp, and the pill offers Retry. With
  // none, a centered error card (icon + the item's alt as a caption) instead of the browser's
  // default top-left broken-image glyph, which overlapped the chrome (I-UX3).
  let errorEl: HTMLElement | null = null
  const showError = () => {
    settle('data-gallerist-error') // keeps the img hidden
    if (status) {
      status.textContent = t.loadFailed
      if (ctx.retry) {
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.textContent = t.retry
        retry.onclick = ctx.retry
        status.after(retry)
      }
      return
    }
    if (errorEl) return
    box.remove()
    const card = document.createElement('div')
    card.className = 'gallerist-media-error'
    card.setAttribute('role', 'img')
    if (item.alt) card.setAttribute('aria-label', item.alt)
    const icon = document.createElement('div')
    icon.className = 'gallerist-media-error-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.innerHTML = BROKEN_ICON // static markup only
    card.appendChild(icon)
    if (item.alt) {
      const label = document.createElement('span')
      label.className = 'gallerist-media-error-label'
      label.textContent = item.alt // host-supplied → textContent, never innerHTML
      card.appendChild(label)
    }
    slot.appendChild(card)
    errorEl = card
  }

  const ready = new Promise<void>((resolve, reject) => {
    const abortErr = () => new DOMException('Image load aborted', 'AbortError')
    if (ctx.signal.aborted) {
      reject(abortErr())
      return
    }
    const cleanup = () => {
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
      ctx.signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(abortErr())
    }
    const onLoad = async () => {
      try {
        if (typeof img.decode === 'function') await img.decode()
      } catch {
        // decode can reject on detached/aborted nodes — fall through and reveal anyway.
      }
      cleanup()
      settle('data-gallerist-loaded')
      status?.parentElement?.remove() // the pill
      resolve()
    }
    const onError = () => {
      cleanup()
      showError()
      reject(new Error(`image load error: ${item.id}`))
    }
    img.addEventListener('load', onLoad)
    img.addEventListener('error', onError)
    ctx.signal.addEventListener('abort', onAbort)

    const src = item.source
    if (typeof src === 'string') {
      img.src = src
    } else if ('src' in src) {
      img.src = src.src
      if (src.srcset) img.setAttribute('srcset', src.srcset)
      if (src.sizes) img.setAttribute('sizes', src.sizes)
    } else if ('loader' in src) {
      src
        .loader(ctx.signal)
        .then((res) => {
          if (ctx.signal.aborted) return
          if (typeof res === 'string') {
            img.src = res // load/error handlers settle ready
          } else {
            // a custom element: swap it in, it is its own ready signal
            cleanup()
            img.remove()
            slot.appendChild(res)
            res.setAttribute('data-gallerist-loaded', '')
            box.remove()
            element = res
            resolve()
          }
        })
        .catch((err) => {
          cleanup()
          showError()
          reject(err instanceof Error ? err : new Error(String(err)))
        })
    }
    // tiles (DZI) is a v2 seam — not handled here.
  })
  // Avoid unhandled-rejection noise if no one awaits ready on a canceled load.
  ready.catch(() => {})

  return {
    get element() {
      return element
    },
    ready,
    supportsZoom: true,
    naturalSize() {
      if (item.naturalSize) return item.naturalSize
      return img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null
    },
    destroy() {
      img.removeAttribute('src')
      element.remove()
      box.remove()
      errorEl?.remove() // the error card is a slot sibling, not `element`
    },
  }
}
