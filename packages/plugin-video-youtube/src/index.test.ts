// @vitest-environment happy-dom

import type { Item, ViewerApi } from '@gallerist/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isYouTube, parseYouTubeId, youtubeAdapter } from './index'

const ytItem = (url: string): Item => ({ id: 'y', type: 'video', source: url })
const ctx = () => ({ signal: new AbortController().signal, priority: 'high' as const })

// minimal fake IFrame API
let lastPlayer: FakePlayer | null = null
let lastConfig: { videoId?: string; playerVars?: { origin?: string } } | null = null
class FakePlayer {
  play = 0
  pause = 0
  destroyed = false
  events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void }
  constructor(
    _el: unknown,
    cfg: {
      videoId?: string
      playerVars?: { origin?: string }
      events: FakePlayer['events']
    },
  ) {
    this.events = cfg.events
    lastConfig = cfg
    lastPlayer = this
    cfg.events.onReady?.()
  }
  playVideo() {
    this.play++
  }
  pauseVideo() {
    this.pause++
  }
  destroy() {
    this.destroyed = true
  }
}

beforeEach(() => {
  lastPlayer = null
  lastConfig = null
  ;(window as unknown as { YT: unknown }).YT = { Player: FakePlayer, PlayerState: { ENDED: 0 } }
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('url helpers', () => {
  it('detects YouTube urls', () => {
    expect(isYouTube('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(isYouTube('https://example.com/a.mp4')).toBe(false)
  })
  it('parses the video id from common url shapes', () => {
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('parses shorts and live urls', () => {
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('anchors host matching (rejects look-alike domains)', () => {
    expect(isYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(isYouTube('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(isYouTube('https://evil-youtube.com/x')).toBe(false)
    expect(isYouTube('https://youtube.com.attacker.test/x')).toBe(false)
    expect(isYouTube('not a url')).toBe(false)
  })
})

describe('youtubeAdapter', () => {
  it('matches only YouTube items', () => {
    const a = youtubeAdapter({} as ViewerApi)
    expect(a.match?.(ytItem('https://youtu.be/dQw4w9WgXcQ'))).toBe(true)
    expect(a.match?.(ytItem('https://x/clip.mp4'))).toBe(false)
  })

  it('declines an unparseable YouTube URL and rejects rather than hanging (S-PL2)', async () => {
    const a = youtubeAdapter({} as ViewerApi)
    const playlist = ytItem('https://www.youtube.com/playlist?list=PLxyz')
    expect(a.match?.(playlist)).toBe(false) // no id → decline the match
    const m = a.mount(playlist, document.createElement('div'), ctx())
    await expect(m.ready).rejects.toThrow() // mounting anyway rejects instead of hanging
  })

  it('passes playerVars.origin for postMessage validation (S-PL3)', async () => {
    const m = youtubeAdapter({} as ViewerApi).mount(
      ytItem('https://youtu.be/dQw4w9WgXcQ'),
      document.createElement('div'),
      ctx(),
    )
    await m.ready
    expect(lastConfig?.videoId).toBe('dQw4w9WgXcQ')
    expect(lastConfig?.playerVars?.origin).toBe(window.location.origin)
  })

  it('creates a player; ready resolves; activate/deactivate drive it', async () => {
    const m = youtubeAdapter({} as ViewerApi).mount(
      ytItem('https://youtu.be/dQw4w9WgXcQ'),
      document.createElement('div'),
      ctx(),
    )
    await expect(m.ready).resolves.toBeUndefined()
    m.activate?.()
    m.deactivate?.()
    expect(lastPlayer?.play).toBe(1)
    expect(lastPlayer?.pause).toBe(1)
  })

  it('advances on the ENDED state', async () => {
    const next = vi.fn()
    const m = youtubeAdapter({ next } as unknown as ViewerApi).mount(
      ytItem('https://youtu.be/dQw4w9WgXcQ'),
      document.createElement('div'),
      ctx(),
    )
    await m.ready
    lastPlayer?.events.onStateChange?.({ data: 0 }) // ENDED
    expect(next).toHaveBeenCalled()
  })

  it('advances on the item axis when configured', async () => {
    const nextItem = vi.fn()
    const m = youtubeAdapter({ nextItem } as unknown as ViewerApi, { advanceAxis: 'item' }).mount(
      ytItem('https://youtu.be/dQw4w9WgXcQ'),
      document.createElement('div'),
      ctx(),
    )
    await m.ready
    lastPlayer?.events.onStateChange?.({ data: 0 }) // ENDED
    expect(nextItem).toHaveBeenCalled()
  })

  it('rejects and clears the memo when the API script fails to load', async () => {
    // biome-ignore lint/performance/noDelete: test needs the global truly absent
    delete (window as unknown as { YT?: unknown }).YT
    const m = youtubeAdapter({} as ViewerApi).mount(
      ytItem('https://youtu.be/dQw4w9WgXcQ'),
      document.createElement('div'),
      ctx(),
    )
    const script = document.querySelector('script[data-gallerist-yt]') as HTMLScriptElement
    expect(script).not.toBeNull()
    script.onerror?.(new Event('error'))
    await expect(m.ready).rejects.toThrow()
  })
})
