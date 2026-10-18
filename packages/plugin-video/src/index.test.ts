// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { video, videoAdapter } from './index'

const vid = (id: string): Item => ({ id, type: 'video', source: `${id}.mp4` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [vid('v0')] },
    { id: 'g1', items: [vid('v1')] },
  ],
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('videoAdapter', () => {
  const ctx = () => ({ signal: new AbortController().signal, priority: 'high' as const })

  it('mounts a <video> with the source and matches video items', () => {
    const a = videoAdapter({} as never)
    expect(a.type).toBe('video')
    expect(a.match?.(vid('v0'))).toBe(true)
    const m = a.mount(vid('v0'), document.createElement('div'), ctx())
    expect((m.element as HTMLVideoElement).tagName).toBe('VIDEO')
    expect((m.element as HTMLVideoElement).getAttribute('src')).toContain('v0.mp4')
    expect(m.supportsZoom).toBe(false)
  })

  it('activate plays and deactivate pauses', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const m = videoAdapter({} as never).mount(vid('v0'), document.createElement('div'), ctx())
    m.activate?.()
    expect(play).toHaveBeenCalled()
    m.deactivate?.()
    expect(pause).toHaveBeenCalled()
  })

  it('advances on ended', () => {
    const next = vi.fn()
    const viewer = { next } as never
    const m = videoAdapter(viewer).mount(vid('v0'), document.createElement('div'), ctx())
    m.element.dispatchEvent(new Event('ended'))
    expect(next).toHaveBeenCalled()
  })
})

describe('plugin-video integration', () => {
  it('the renderer uses the video adapter and plays the current slide on open', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never)
    const v = createViewer({ collection: collection(), plugins: [video()] })
    mount(v)
    v.open()
    expect(document.querySelector('video')).not.toBeNull()
    expect(play).toHaveBeenCalled() // activated on slide enter
  })
})
