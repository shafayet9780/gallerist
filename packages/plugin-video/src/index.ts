// @visora/plugin-video — HTML5 <video> media adapter (spec §12/§14). The renderer calls
// activate/deactivate on slide enter/leave (play/pause); "advance on ended" drives navigation.

import type { AdapterCtx, Item, MediaAdapter, MediaSource, Plugin, ViewerApi } from '@visora/core'

export interface VideoOptions {
  controls?: boolean
  muted?: boolean
  /** advance to the next slide when a video ends (default true). */
  advanceOnEnded?: boolean
  /** which axis to advance on ended (default 'group'). */
  advanceAxis?: 'group' | 'item'
}

function srcOf(source: MediaSource): string | null {
  if (typeof source === 'string') return source
  if ('src' in source) return source.src
  return null // loader handled async below; tiles unsupported
}

export function videoAdapter(viewer: ViewerApi, opts: VideoOptions = {}): MediaAdapter {
  return {
    type: 'video',
    match: (item) => item.type === 'video',
    mount(item: Item, slot: HTMLElement, ctx: AdapterCtx) {
      const video = document.createElement('video')
      video.className = 'visora-media visora-media-video'
      video.controls = opts.controls ?? true
      video.muted = opts.muted ?? false
      video.playsInline = true
      video.preload = 'metadata'
      if (item.placeholder) video.poster = item.placeholder

      const src = srcOf(item.source)
      if (src) video.src = src
      else if (typeof item.source === 'object' && 'loader' in item.source) {
        item.source.loader(ctx.signal).then((res) => {
          if (!ctx.signal.aborted && typeof res === 'string') video.src = res
        })
      }

      const onEnded = () => {
        if (opts.advanceOnEnded === false) return
        if (opts.advanceAxis === 'item') viewer.nextItem()
        else viewer.next()
      }
      video.addEventListener('ended', onEnded)
      slot.appendChild(video)

      const ready = new Promise<void>((resolve, reject) => {
        if (ctx.signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error(`video error: ${item.id}`)), {
          once: true,
        })
      })
      ready.catch(() => {})

      return {
        element: video,
        ready,
        supportsZoom: false,
        naturalSize: () =>
          video.videoWidth
            ? { w: video.videoWidth, h: video.videoHeight }
            : (item.naturalSize ?? null),
        activate: () => {
          void video.play().catch(() => {})
        },
        deactivate: () => video.pause(),
        destroy: () => {
          video.removeEventListener('ended', onEnded)
          video.pause()
          video.removeAttribute('src')
          video.load()
          video.remove()
        },
      }
    },
  }
}

export function video(opts: VideoOptions = {}): Plugin {
  return (viewer) => ({ name: 'video', mediaAdapters: [videoAdapter(viewer, opts)] })
}
