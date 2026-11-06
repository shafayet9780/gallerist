// @vitest-environment happy-dom

// The strings audit: with every label translated, no UI text may still be English. Each default is
// wrapped in ⟦…⟧ (they nest, as a label can hold a name); any word outside the marks is text that can't be translated. Relative imports, since
// this runs before the packages are built.
import { type Collection, type Plugin, createViewer } from '@gallerist/core'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_FULLSCREEN_STRINGS, fullscreen } from '../../plugin-fullscreen/src/index'
import { DEFAULT_GRID_STRINGS, grid } from '../../plugin-grid/src/index'
import { DEFAULT_PINS_STRINGS, type Pin, pins } from '../../plugin-pins/src/index'
import { DEFAULT_DOWNLOAD_STRINGS, download } from '../../plugin-save/src/index'
import { DEFAULT_SHORTCUTS_STRINGS, shortcuts } from '../../plugin-shortcuts/src/index'
import { DEFAULT_THUMBNAILS_STRINGS, thumbnails } from '../../plugin-thumbnails/src/index'
import { DEFAULT_VIEW_STRINGS, view } from '../../plugin-view/src/index'
import { DEFAULT_ZOOM_STRINGS, zoom } from '../../plugin-zoom/src/index'
import { DEFAULT_STRINGS, type MountOptions, mount } from '../../renderer-dom/src/index'

const mark = <T extends object>(defaults: T): T =>
  Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [
      k,
      typeof v === 'function'
        ? (...args: unknown[]) => `⟦${(v as (...a: unknown[]) => string)(...args)}⟧`
        : `⟦${v}⟧`,
    ]),
  ) as T

// no captions, alts or titles: anything on screen has to come from the strings
const collection = (): Collection => ({
  groups: Array.from({ length: 3 }, (_, g) => ({
    id: `g${g}`,
    meta: { time: '09:10' },
    items: Array.from({ length: g === 1 ? 12 : 2 }, (_, i) => ({
      id: `g${g}i${i}`,
      type: 'image' as const,
      source: `g${g}i${i}.jpg`,
      meta: { pins: [{ id: `p${g}${i}`, x: 0.5, y: 0.5 }] },
    })),
  })),
})

// once the marks are taken out, only punctuation and numbers may be left
const isTranslated = (value: string) => {
  let rest = value
  for (let last = ''; last !== rest; ) {
    last = rest
    rest = rest.replace(/⟦[^⟦⟧]*⟧/g, '')
  }
  return /^[\d\s/+.,:—-]*$/.test(rest)
}

const ATTRS = [
  'aria-label',
  'aria-roledescription',
  'aria-description',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
]

function untranslated(): string[] {
  const bad: string[] = []
  const root = document.querySelector('.gallerist')
  if (!root) throw new Error('nothing mounted')
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.closest('svg')) continue
    for (const name of ATTRS) {
      const value = el.getAttribute(name)
      if (value && !isTranslated(value)) bad.push(`${name}="${value}"`)
    }
    for (const node of el.childNodes) {
      const text = node.nodeType === 3 ? (node.textContent ?? '').trim() : ''
      if (text && !isTranslated(text)) bad.push(`text "${text}"`)
    }
  }
  return bad
}

const thumbStrings = mark(DEFAULT_THUMBNAILS_STRINGS)
const shared = (): Plugin[] => [
  grid({ strings: mark(DEFAULT_GRID_STRINGS) }),
  download({ strings: mark(DEFAULT_DOWNLOAD_STRINGS) }),
  fullscreen({ strings: mark(DEFAULT_FULLSCREEN_STRINGS) }),
  pins({ presentation: 'comment', onPlace: () => {}, strings: mark(DEFAULT_PINS_STRINGS) }),
]

const openWith = (rail: Plugin, options: MountOptions = {}) => {
  const v = createViewer({
    collection: collection(),
    plugins: [rail, ...shared()],
    startAt: { g: 1 },
  })
  mount(v, { strings: mark(DEFAULT_STRINGS), arrowLabels: (_g, i) => `⟦${i}⟧`, ...options })
  v.open()
  return v
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('strings audit', () => {
  const toggleGrid = () =>
    (document.querySelector('.gallerist-grid-toggle') as HTMLButtonElement).click()

  it.each([
    ['stacked', { strings: thumbStrings }, {}],
    ['stacked with a timeline', { strings: thumbStrings, timeline: true }, {}],
    ['flat', { strings: thumbStrings, groupDisplay: 'flat' as const }, {}],
    ['index', { strings: thumbStrings, groupDisplay: 'index' as const }, { rail: 'left' as const }],
    [
      'tour',
      { strings: thumbStrings, groupDisplay: 'index' as const },
      { preset: 'tour' as const },
    ],
  ])('%s rail, with the grid open', (_name, railOptions, mountOptions) => {
    openWith(thumbnails(railOptions), mountOptions)
    expect(untranslated()).toEqual([])
    toggleGrid()
    expect(untranslated()).toEqual([])
  })

  it('the zoom tool (plugin-zoom, not in this bundle)', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [zoom({ strings: mark(DEFAULT_ZOOM_STRINGS) })],
    })
    mount(v, { strings: mark(DEFAULT_STRINGS) })
    v.open()
    expect(document.querySelectorAll('.gallerist-zoom-tool button').length).toBe(3)
    expect(untranslated()).toEqual([])
  })

  it('the View popover, open, with every choice (plugin-view, not in this bundle)', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [
        thumbnails({ strings: thumbStrings }),
        view({
          rail: ['stacked', 'flat', 'index'],
          scheme: ['dark', 'light', 'auto'],
          strings: mark(DEFAULT_VIEW_STRINGS),
        }),
      ],
    })
    mount(v, { strings: mark(DEFAULT_STRINGS) })
    v.open()
    ;(document.querySelector('.gallerist-view-btn') as HTMLButtonElement).click()
    expect(document.querySelectorAll('[role="radio"]').length).toBe(6)
    expect(untranslated()).toEqual([])
  })

  it('the shortcut list, keys and gestures, and its View row (plugin-shortcuts, not in this bundle)', () => {
    const list = shortcuts({ strings: mark(DEFAULT_SHORTCUTS_STRINGS) })
    const v = createViewer({
      collection: collection(),
      plugins: [
        thumbnails({ strings: thumbStrings }),
        ...shared(),
        view({ strings: mark(DEFAULT_VIEW_STRINGS) }),
        list,
      ],
    })
    mount(v, { strings: mark(DEFAULT_STRINGS) })
    v.open()
    // key caps are keys, not words: a single character (←, ?, F, −) or a digit range is left alone
    const words = () => untranslated().filter((t) => !/^text "(.|1–9)"$/u.test(t))
    ;(document.querySelector('.gallerist-view-btn') as HTMLButtonElement).click()
    expect(document.querySelector('.gallerist-view-foot')).not.toBeNull()
    expect(words()).toEqual([])
    list.open(true)
    expect(document.querySelectorAll('.gallerist-shortcuts-row').length).toBeGreaterThan(8)
    expect(words()).toEqual([])
    list.close()
    list.open(false)
    expect(document.querySelector('.gallerist-shortcuts-note')).not.toBeNull()
    expect(words()).toEqual([])
  })

  it('peek flyout and its touch button', () => {
    const real = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as typeof window.matchMedia
    try {
      openWith(thumbnails({ strings: thumbStrings }))
      ;(document.querySelector('.gallerist-thumb-expand') as HTMLButtonElement).click()
      expect(document.querySelector('.gallerist-thumb-peek')).not.toBeNull()
      expect(untranslated()).toEqual([])
    } finally {
      window.matchMedia = real
    }
  })

  it('overview, including a capped card', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [
        thumbnails({ strings: thumbStrings }),
        grid({ layout: 'sections', startOpen: true, strings: mark(DEFAULT_GRID_STRINGS) }),
      ],
    })
    mount(v, { strings: mark(DEFAULT_STRINGS) })
    v.open()
    expect(document.querySelector('.gallerist-grid-more')).not.toBeNull()
    expect(untranslated()).toEqual([])
  })

  describe('pins', () => {
    const openPins = (presentation: 'comment' | 'tag', pin: Pin, onPlace?: () => void) => {
      const v = createViewer({
        collection: collection(),
        plugins: [
          pins({
            presentation,
            pins: () => [pin],
            onPlace,
            strings: mark(DEFAULT_PINS_STRINGS),
          }),
        ],
      })
      mount(v, { strings: mark(DEFAULT_STRINGS) })
      v.open()
      ;(document.querySelector('.gallerist-pin-marker') as HTMLButtonElement).click()
      expect(document.querySelector('.gallerist-pin-card')).not.toBeNull()
    }

    it('a card with its default link', () => {
      openPins('tag', { id: 'p', x: 0.5, y: 0.5, href: 'https://example.com/' })
      expect(document.querySelector('.gallerist-pin-card a')).not.toBeNull()
      expect(untranslated()).toEqual([])
    })

    it('a resolved thread with replies, and placing a comment', () => {
      openPins(
        'comment',
        {
          id: 'p',
          x: 0.5,
          y: 0.5,
          label: '⟦host⟧',
          body: '⟦host⟧',
          resolved: true,
          replies: [{ author: '⟦host⟧', body: '⟦host⟧' }],
        },
        () => {},
      )
      expect(untranslated()).toEqual([])
      ;(document.querySelector('.gallerist-pin-add') as HTMLButtonElement).click()
      expect(document.querySelector('[data-gallerist-placing]')).not.toBeNull()
      expect(untranslated()).toEqual([])
    })
  })

  it('text outside the marks fails, even beside a marked word', () => {
    expect(isTranslated('⟦Group 1⟧')).toBe(true)
    expect(isTranslated('⟦Group 2⟧, ⟦Item 3⟧')).toBe(true)
    expect(isTranslated('⟦Group ⟦Kitchen⟧, item 2⟧')).toBe(true)
    expect(isTranslated('3 / 12')).toBe(true)
    expect(isTranslated('⟦Group 1⟧ photos')).toBe(false)
    expect(isTranslated('Group 1')).toBe(false)
  })

  it('the audit can fail: an untranslated plugin is caught', () => {
    const v = createViewer({ collection: collection(), plugins: [download()] })
    mount(v, { strings: mark(DEFAULT_STRINGS) })
    v.open()
    expect(untranslated()).toContain('aria-label="Download"')
  })

  it('a partial override keeps the English for the rest', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ strings: { rail: 'Vignetten' } })],
    })
    mount(v)
    v.open()
    const rail = document.querySelector('.gallerist-thumbs')
    expect(rail?.getAttribute('aria-label')).toBe('Vignetten')
    expect(document.querySelector('.gallerist-items-toggle')?.getAttribute('aria-label')).toBe(
      'Toggle group items',
    )
  })
})
