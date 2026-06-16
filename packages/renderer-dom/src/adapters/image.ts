// Image media adapter (spec §12, decision P0-J). Lives in the renderer because it touches DOM.
// Responsive srcset, decode-before-reveal, LQIP placeholder, naturalSize hint, abortable load.

import type { AdapterCtx, Item, MediaAdapter, MountedMedia } from '@visora/core'

const COLOR_RE = /^(#|rgb|hsl|[a-z]+$)/i

function applyPlaceholder(el: HTMLElement, placeholder: string): void {
  if (placeholder.startsWith('data:') || placeholder.includes('/')) {
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
        },
      }
    },
  }
}
