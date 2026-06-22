// Image media adapter (spec §12, decision P0-J). Lives in the renderer because it touches DOM.
// Responsive srcset, decode-before-reveal, LQIP placeholder, naturalSize hint, abortable load.

import type { AdapterCtx, Item, MediaAdapter, MountedMedia } from '@visora/core'

const COLOR_RE = /^(#|rgb|hsl|[a-z]+$)/i

// Chars that could escape the url("…") literal and inject extra CSS (e.g. a second url() that
// fires an attacker-controlled request). Quotes/backslash/newlines are rejected for the url path.
const CSS_URL_UNSAFE = /["\\\n\r]/

// Static broken-image glyph (lucide "image-off"); safe to inject as markup (no user data).
const BROKEN_ICON =
  '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.4 10.4a2 2 0 1 1-2.8-2.8"/><path d="M21 15.5V5a2 2 0 0 0-2-2H8.5"/><path d="M3.6 3.6A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.4-.6"/><path d="m5 21 7-7"/><path d="m2 2 20 20"/></svg>'

function applyPlaceholder(el: HTMLElement, placeholder: string): void {
  if (placeholder.startsWith('data:') || placeholder.includes('/')) {
    if (CSS_URL_UNSAFE.test(placeholder)) return // reject breakout attempts — paint nothing
    el.style.backgroundImage = `url("${placeholder}")`
    el.style.backgroundSize = 'cover'
    el.style.backgroundPosition = 'center'
  } else if (COLOR_RE.test(placeholder)) {
    el.style.backgroundColor = placeholder
  }
}

export function imageAdapter(): MediaAdapter {
  return {
    type: 'image',
    mount(item: Item, slot: HTMLElement, ctx: AdapterCtx): MountedMedia {
      const img = document.createElement('img')
      img.setAttribute('decoding', 'async')
      img.setAttribute('fetchpriority', ctx.priority ?? 'auto')
      img.className = 'visora-media visora-media-image'
      if (item.alt !== undefined) img.alt = item.alt
      if (item.placeholder) applyPlaceholder(img, item.placeholder)
      slot.appendChild(img)

      // A loader may resolve to a custom element instead of an <img>; track the live node.
      let element: HTMLElement = img

      // On load failure, show a centered error card (icon + the item's alt as a caption) instead
      // of the browser's default top-left broken-image glyph, which overlapped the chrome (I-UX3).
      let errorEl: HTMLElement | null = null
      const showError = () => {
        if (errorEl) return
        img.setAttribute('data-visora-error', '') // keeps the img hidden + excludes it from shimmer
        const card = document.createElement('div')
        card.className = 'visora-media-error'
        card.setAttribute('role', 'img')
        if (item.alt) card.setAttribute('aria-label', item.alt)
        const icon = document.createElement('div')
        icon.className = 'visora-media-error-icon'
        icon.setAttribute('aria-hidden', 'true')
        icon.innerHTML = BROKEN_ICON // static markup only
        card.appendChild(icon)
        if (item.alt) {
          const label = document.createElement('span')
          label.className = 'visora-media-error-label'
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
          img.setAttribute('data-visora-loaded', '')
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
                res.setAttribute('data-visora-loaded', '')
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
          errorEl?.remove() // the error card is a slot sibling, not `element`
        },
      }
    },
  }
}
