// @visora/plugin-video-youtube — YouTube IFrame API adapter (spec §12, decision D8/P1-G).
// A separate sub-plugin so the YouTube API loads only when used. Matches YouTube URLs; play/pause
// on slide enter/leave; advance on ended.

import type { AdapterCtx, Item, MediaAdapter, MediaSource, Plugin, ViewerApi } from '@visora/core'

export interface YouTubeOptions {
  advanceOnEnded?: boolean
}

function srcOf(source: MediaSource): string | null {
  if (typeof source === 'string') return source
  if (typeof source === 'object' && 'src' in source) return source.src
  return null
}

// Anchor to the hostname so look-alikes (evil-youtube.com, youtube.com.attacker.test) don't match.
export function isYouTube(url: string): boolean {
  try {
    return /(?:^|\.)(?:youtube\.com|youtu\.be)$/.test(new URL(url).hostname)
  } catch {
    return false // not an absolute URL
  }
}

export function parseYouTubeId(url: string): string {
  const m = url.match(/(?:youtu\.be\/|shorts\/|live\/|embed\/|[?&]v=)([\w-]{11})/)
  return m?.[1] ?? ''
}

// The YouTube IFrame API is an untyped global.
type YTGlobal = any

let apiPromise: Promise<YTGlobal> | null = null

function loadYouTubeAPI(): Promise<YTGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as unknown as { YT?: YTGlobal; onYouTubeIframeAPIReady?: () => void }
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTGlobal>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(w.YT)
    }
    if (!document.querySelector('script[data-visora-yt]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      s.dataset.visoraYt = ''
      document.head.appendChild(s)
    }
  })
  return apiPromise
}

export function youtubeAdapter(viewer: ViewerApi, opts: YouTubeOptions = {}): MediaAdapter {
  return {
    type: 'video',
    match: (item) => {
      const u = srcOf(item.source)
      return !!u && isYouTube(u)
    },
    mount(item: Item, slot: HTMLElement, ctx: AdapterCtx) {
      const host = document.createElement('div')
      host.className = 'visora-media visora-media-youtube'
      slot.appendChild(host)
      let player: any = null // untyped YT.Player instance

      const ready = new Promise<void>((resolve, reject) => {
        if (ctx.signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
        loadYouTubeAPI()
          .then((YT: YTGlobal) => {
            if (ctx.signal.aborted) return
            player = new YT.Player(host, {
              videoId: parseYouTubeId(srcOf(item.source) ?? ''),
              events: {
                onReady: () => resolve(),
                onStateChange: (e: { data?: number }) => {
                  if (opts.advanceOnEnded !== false && e?.data === YT.PlayerState?.ENDED) {
                    viewer.next()
                  }
                },
              },
            })
          })
          .catch(reject)
      })
      ready.catch(() => {})

      return {
        element: host,
        ready,
        supportsZoom: false,
        naturalSize: () => null,
        activate: () => player?.playVideo?.(),
        deactivate: () => player?.pauseVideo?.(),
        destroy: () => {
          player?.destroy?.()
          host.remove()
        },
      }
    },
  }
}

export function videoYouTube(opts: YouTubeOptions = {}): Plugin {
  return (viewer) => ({ name: 'video-youtube', mediaAdapters: [youtubeAdapter(viewer, opts)] })
}
