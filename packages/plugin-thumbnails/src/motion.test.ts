// @vitest-environment happy-dom

import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thumbnails } from './index'
import { GLIDE, createGlides, toMs } from './motion'

// A stand-in for Web Animations: records each call, finishes when told to.
type Fake = { keyframes: Record<string, string[]>; options: KeyframeAnimationOptions }
const animations: Array<Fake & { finish(): void; cancelled: boolean }> = []
const fakeAnimate = function (
  this: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options?: number | KeyframeAnimationOptions,
) {
  const anim = {
    keyframes: keyframes as Record<string, string[]>,
    options: options as KeyframeAnimationOptions,
    cancelled: false,
    onfinish: null as null | (() => void),
    cancel() {
      this.cancelled = true
    },
    finish() {
      this.onfinish?.()
    },
  }
  animations.push(anim)
  return anim as unknown as Animation
}

const realMatchMedia = window.matchMedia
const reduceMotion = (reduce: boolean) => {
  window.matchMedia = ((q: string) =>
    ({
      matches: q.includes('reduced-motion') ? reduce : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  animations.length = 0
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('glides', () => {
  it('animates the border-box size, clipped, marked and inert while it closes; then lets go', () => {
    reduceMotion(false)
    const el = document.createElement('div')
    el.animate = fakeAnimate
    const end = vi.fn()
    const { glide, moving } = createGlides(() => 220)
    glide(el, 'height', 94, 0, end)
    expect(animations).toHaveLength(1)
    expect(animations[0]?.keyframes).toEqual({
      height: ['94px', '0px'],
      boxSizing: ['border-box', 'border-box'],
      overflow: ['hidden', 'hidden'],
    })
    expect(animations[0]?.options.duration).toBe(220)
    expect(el.hasAttribute(GLIDE)).toBe(true)
    expect(el.inert).toBe(true)
    expect(moving(el)).toBe(true)
    expect(end).not.toHaveBeenCalled()
    animations[0]?.finish()
    expect(el.hasAttribute(GLIDE)).toBe(false)
    expect(el.inert).toBe(false)
    expect(moving(el)).toBe(false)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('an opening panel stays usable while it grows', () => {
    reduceMotion(false)
    const el = document.createElement('div')
    el.animate = fakeAnimate
    createGlides(() => 220).glide(el, 'width', 0, 120)
    expect(el.inert).toBe(false)
    expect(animations[0]?.keyframes.width).toEqual(['0px', '120px'])
  })

  it('a second glide ends the first where it is (its end runs once)', () => {
    reduceMotion(false)
    const el = document.createElement('div')
    el.animate = fakeAnimate
    const first = vi.fn()
    const { glide } = createGlides(() => 220)
    glide(el, 'height', 94, 0, first)
    glide(el, 'height', 40, 94)
    expect(first).toHaveBeenCalledTimes(1)
    expect(animations[0]?.cancelled).toBe(true)
    animations[0]?.finish() // a stale finish does nothing
    expect(first).toHaveBeenCalledTimes(1)
    expect(el.hasAttribute(GLIDE)).toBe(true) // the second is still running
  })

  it('reduced motion, no Web Animations or nothing to move: done at once', () => {
    const el = document.createElement('div')
    el.animate = fakeAnimate
    const end = vi.fn()
    const { glide } = createGlides(() => 220)
    reduceMotion(true)
    glide(el, 'height', 94, 0, end)
    reduceMotion(false)
    glide(el, 'height', 94, 94, end)
    const bare = document.createElement('div')
    Object.defineProperty(bare, 'animate', { value: undefined })
    glide(bare, 'height', 94, 0, end)
    expect(animations).toHaveLength(0)
    expect(end).toHaveBeenCalledTimes(3)
    expect(el.hasAttribute(GLIDE)).toBe(false)
  })
})

describe('the duration token', () => {
  it('reads ms and s; 220 when unset or not a time', () => {
    expect(toMs('220ms')).toBe(220)
    expect(toMs(' 0.3s')).toBe(300)
    expect(toMs('1s ')).toBe(1000)
    expect(toMs('0ms')).toBe(0)
    expect(toMs('0')).toBe(0)
    expect(toMs('')).toBe(220)
    expect(toMs('fast')).toBe(220)
  })

  it('a duration of 0 is no glide: done at once', () => {
    reduceMotion(false)
    const el = document.createElement('div')
    el.animate = fakeAnimate
    const end = vi.fn()
    createGlides(() => toMs('0ms')).glide(el, 'height', 94, 0, end)
    expect(animations).toHaveLength(0)
    expect(end).toHaveBeenCalledTimes(1)
    expect(el.inert).toBe(false)
  })
})

describe('plugin-thumbnails — the rail glides as it collapses', () => {
  const setup = () => {
    reduceMotion(false)
    Object.assign(HTMLElement.prototype, { animate: fakeAnimate })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 0, 400, 94),
    )
    const v = createViewer({
      collection: {
        groups: [{ id: 'g0', items: [{ id: 'a', type: 'image', source: 'a.jpg' }] }],
      },
      plugins: [thumbnails({ groupDisplay: 'flat' })],
    })
    mount(v)
    v.open()
    const root = document.querySelector('.gallerist') as HTMLElement
    const region = document.querySelector('.gallerist-thumbs-region') as HTMLElement
    const toggle = document.querySelector('.gallerist-rail-toggle') as HTMLElement
    return { v, root, region, toggle }
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('collapsing: the rail shrinks to nothing, inert, then the theme hides it', async () => {
    const { region, toggle } = setup()
    await settle()
    toggle.click()
    await settle() // the attribute change reaches the plugin
    expect(animations).toHaveLength(1)
    expect(animations[0]?.keyframes.height).toEqual(['94px', '0px'])
    expect(region.hasAttribute(GLIDE)).toBe(true)
    expect(region.inert).toBe(true)
    animations[0]?.finish()
    expect(region.hasAttribute(GLIDE)).toBe(false)
    expect(region.inert).toBe(false)
  })

  it('coming back: it grows from nothing; reversed midway, from where it got to', async () => {
    const { region, toggle } = setup()
    // mid-glide (a running animation) the rail measures 40px; at rest, 94px
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement,
    ) {
      const mid = animations.some((a) => !a.cancelled) && this.hasAttribute(GLIDE)
      return new DOMRect(0, 0, 400, mid ? 40 : 94)
    })
    await settle()
    toggle.click()
    await settle()
    toggle.click() // reversed before it finished
    await settle()
    expect(animations).toHaveLength(2)
    expect(animations[0]?.cancelled).toBe(true)
    expect(animations[1]?.keyframes.height).toEqual(['40px', '94px'])
    expect(region.inert).toBe(false)
    animations[1]?.finish()
    toggle.click()
    await settle()
    animations[2]?.finish()
    toggle.click() // collapsed at rest, then opened: from nothing
    await settle()
    expect(animations[3]?.keyframes.height).toEqual(['0px', '94px'])
  })

  it('a side rail glides its width', async () => {
    reduceMotion(false)
    Object.assign(HTMLElement.prototype, { animate: fakeAnimate })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 0, 130, 600),
    )
    const v = createViewer({
      collection: { groups: [{ id: 'g0', items: [{ id: 'a', type: 'image', source: 'a.jpg' }] }] },
      plugins: [thumbnails()],
    })
    mount(v, { rail: 'left' })
    v.open()
    await settle()
    ;(document.querySelector('.gallerist-rail-toggle') as HTMLElement).click()
    await settle()
    expect(animations[0]?.keyframes.width).toEqual(['130px', '0px'])
  })

  it('no glide after the viewer is destroyed', async () => {
    const { v, root } = setup()
    await settle()
    v.destroy()
    root.setAttribute('data-gallerist-rail', 'collapsed')
    await settle()
    expect(animations).toHaveLength(0)
  })
})
