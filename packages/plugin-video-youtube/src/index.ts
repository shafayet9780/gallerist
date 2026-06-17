// @visora/plugin-video-youtube — YouTube IFrame API adapter (spec §12, decision D8/P1-G).
// A separate sub-plugin so the YouTube API loads only when used. Matches YouTube URLs; play/pause
// on slide enter/leave; advance on ended.

import type { AdapterCtx, Item, MediaAdapter, MediaSource, Plugin, ViewerApi } from '@visora/core'

export interface YouTubeOptions {
  /** advance to the next slide when a video ends (default true). */
  advanceOnEnded?: boolean
  /** which axis to advance on ended (default 'group'). */
  advanceAxis?: 'group' | 'item'
  /** use the privacy-friendly youtube-nocookie.com embed host. */
  nocookie?: boolean
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

// Minimal typing for the parts of the IFrame API we use (the global is otherwise untyped).
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  destroy(): void
}
interface YTPlayerConfig {
  videoId: string
  host?: string
  events: { onReady?: () => void; onStateChange?: (e: { data?: number }) => void }
}
interface YTNamespace {
  Player: new (el: HTMLElement, cfg: YTPlayerConfig) => YTPlayer
  PlayerState?: { ENDED?: number }
}
type YTWindow = { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }

let apiPromise: Promise<YTNamespace> | null = null

function loadYouTubeAPI(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const w = window as unknown as YTWindow
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    let settled = false
    // Don't memoize a forever-pending promise if the script is blocked (CSP/adblock) or never ready.
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      apiPromise = null // allow a retry on the next mount
      reject(new Error('YouTube IFrame API load timed out'))
    }, 15_000)
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(w.YT as YTNamespace)
    }
    if (!document.querySelector('script[data-visora-yt]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      s.dataset.visoraYt = ''
      s.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        apiPromise = null // allow a retry on the next mount
        reject(new Error('failed to load the YouTube IFrame API'))
      }
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
      let player: YTPlayer | null = null

      const ready = new Promise<void>((resolve, reject) => {
        if (ctx.signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
        loadYouTubeAPI()
          .then((YT) => {
            if (ctx.signal.aborted) return
            player = new YT.Player(host, {
              videoId: parseYouTubeId(srcOf(item.source) ?? ''),
              host: opts.nocookie ? 'https://www.youtube-nocookie.com' : undefined,
              events: {
                onReady: () => resolve(),
                onStateChange: (e) => {
                  if (opts.advanceOnEnded !== false && e?.data === YT.PlayerState?.ENDED) {
                    if (opts.advanceAxis === 'item') viewer.nextItem()
                    else viewer.next()
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
        activate: () => player?.playVideo(),
        deactivate: () => player?.pauseVideo(),
        destroy: () => {
          player?.destroy()
          host.remove()
        },
      }
    },
  }
}

export function videoYouTube(opts: YouTubeOptions = {}): Plugin {
  return (viewer) => ({ name: 'video-youtube', mediaAdapters: [youtubeAdapter(viewer, opts)] })
}
