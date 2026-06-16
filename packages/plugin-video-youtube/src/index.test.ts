// @vitest-environment happy-dom

import type { Item, ViewerApi } from '@visora/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isYouTube, parseYouTubeId, youtubeAdapter } from './index'

const ytItem = (url: string): Item => ({ id: 'y', type: 'video', source: url })
const ctx = () => ({ signal: new AbortController().signal, priority: 'high' as const })

// minimal fake IFrame API
let lastPlayer: FakePlayer | null = null
class FakePlayer {
  play = 0
  pause = 0
  destroyed = false
  events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void }
  constructor(_el: unknown, cfg: { events: FakePlayer['events'] }) {
    this.events = cfg.events
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
})

describe('youtubeAdapter', () => {
  it('matches only YouTube items', () => {
    const a = youtubeAdapter({} as ViewerApi)
    expect(a.match?.(ytItem('https://youtu.be/dQw4w9WgXcQ'))).toBe(true)
    expect(a.match?.(ytItem('https://x/clip.mp4'))).toBe(false)
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
})
