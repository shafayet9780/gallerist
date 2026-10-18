import type { ContentAnchor, ViewportAnchor } from '@gallerist/core'
import { describe, expect, it } from 'vitest'
import {
  containRect,
  contentAnchorBox,
  resolveScaleWithImage,
  viewportAnchorStyle,
} from './position'

const stage = { w: 1000, h: 800 }
const natural = { w: 2000, h: 1000 } // contain scale 0.5 → 1000x500, offset (0,150)

describe('containRect', () => {
  it('computes the contain rect (centered)', () => {
    expect(containRect(stage, natural)).toEqual({ x: 0, y: 150, w: 1000, h: 500 })
  })
})

describe('contentAnchorBox — point', () => {
  it('maps a normalized point to the contained image', () => {
    const a: ContentAnchor = { kind: 'point', x: 0.5, y: 0.5, space: 'normalized' }
    expect(contentAnchorBox(a, stage, natural)).toEqual({
      left: 500,
      top: 400,
      width: null,
      height: null,
    })
  })
  it('maps a natural-pixel point to the same place', () => {
    const a: ContentAnchor = { kind: 'point', x: 1000, y: 500, space: 'natural' }
    expect(contentAnchorBox(a, stage, natural)).toMatchObject({ left: 500, top: 400 })
  })
  it('defaults to normalized space', () => {
    const a: ContentAnchor = { kind: 'point', x: 0, y: 0 }
    expect(contentAnchorBox(a, stage, natural)).toMatchObject({ left: 0, top: 150 })
  })
})

describe('contentAnchorBox — region', () => {
  it('maps a full-image natural region to the contained rect', () => {
    const a: ContentAnchor = { kind: 'region', x: 0, y: 0, w: 2000, h: 1000, space: 'natural' }
    expect(contentAnchorBox(a, stage, natural)).toEqual({
      left: 0,
      top: 150,
      width: 1000,
      height: 500,
    })
  })
  it('maps a normalized region', () => {
    const a: ContentAnchor = { kind: 'region', x: 0.5, y: 0, w: 0.5, h: 1 }
    expect(contentAnchorBox(a, stage, natural)).toEqual({
      left: 500,
      top: 150,
      width: 500,
      height: 500,
    })
  })
})

describe('resolveScaleWithImage', () => {
  it('defaults: region scales with image, point counter-scales', () => {
    expect(resolveScaleWithImage({ kind: 'region', x: 0, y: 0, w: 1, h: 1 })).toBe(true)
    expect(resolveScaleWithImage({ kind: 'point', x: 0, y: 0 })).toBe(false)
  })
  it('honors an explicit override', () => {
    expect(resolveScaleWithImage({ kind: 'point', x: 0, y: 0 }, true)).toBe(true)
  })
})

describe('viewportAnchorStyle', () => {
  const at = (a: ViewportAnchor['at'], offset?: [number, number]) => viewportAnchorStyle(a, offset)
  it('top-left pins to both edges with offsets', () => {
    expect(at('top-left', [10, 20])).toMatchObject({ top: '20px', left: '10px' })
  })
  it('center positions at 50% with a translate', () => {
    expect(at('center')).toMatchObject({
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    })
  })
  it('top centers horizontally only', () => {
    expect(at('top')).toMatchObject({ top: '0px', left: '50%', transform: 'translate(-50%, 0)' })
  })
  it('bottom-right pins to the far edges', () => {
    expect(at('bottom-right', [8, 8])).toMatchObject({ bottom: '8px', right: '8px' })
  })
})
