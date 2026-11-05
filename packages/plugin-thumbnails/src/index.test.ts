// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { type PresetName, mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ThumbnailsInstance, getGroupDisplay, setGroupDisplay, thumbnails } from './index'
import { axisOf, keepPlace, measureRun, middleOf, spanAround } from './strip'

const item = (id: string): Item => ({ id, type: 'image', source: `${id}.jpg` })
const collection = (): Collection => ({
  groups: [
    { id: 'g0', items: [item('a0')] },
    { id: 'g1', items: [item('b0'), item('b1'), item('b2')] },
    { id: 'g2', items: [item('c0'), item('c1')] },
  ],
})

const open = (col = collection()) => {
  const v = createViewer({ collection: col, plugins: [thumbnails()] })
  mount(v)
  v.open()
  return v
}

const openFlat = (col = collection()) => {
  const v = createViewer({ collection: col, plugins: [thumbnails({ groupDisplay: 'flat' })] })
  mount(v)
  v.open()
  return v
}

// happy-dom reports `(hover: hover)` → true by default. Stub the capability for the touch path.
const realMatchMedia = window.matchMedia
function stubHover(hover: boolean): void {
  window.matchMedia = ((q: string) =>
    ({
      matches: q.includes('hover: none') ? !hover : hover,
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

const fire = (el: Element, type: string) =>
  el.dispatchEvent(new window.Event(type, { bubbles: true }))

afterEach(() => {
  window.matchMedia = realMatchMedia
  document.body.innerHTML = ''
})

describe('plugin-thumbnails', () => {
  it('renders one thumb per group in the thumbnails region', () => {
    open()
    const rail = document.querySelector('.gallerist-region-thumbnails .gallerist-thumbs')
    expect(rail).not.toBeNull()
    expect(rail?.querySelectorAll('.gallerist-thumb').length).toBe(3)
  })

  it('marks the active group and tracks the cursor', () => {
    const v = open()
    expect(
      document.querySelector('.gallerist-thumb[data-active]')?.getAttribute('data-group'),
    ).toBe('g0')
    v.next()
    expect(
      document.querySelector('.gallerist-thumb[data-active]')?.getAttribute('data-group'),
    ).toBe('g1')
  })

  it('clicking a group thumb navigates', () => {
    const v = open()
    const g2 = document.querySelector('.gallerist-thumb[data-group="g2"]') as HTMLButtonElement
    g2.click()
    expect(v.getState().cursor.g).toBe(2)
  })

  it('multi-item groups get a stacked card + count badge', () => {
    open()
    const g1 = document.querySelector('.gallerist-thumb[data-group="g1"]')
    expect(g1?.classList.contains('gallerist-thumb-stacked')).toBe(true)
    expect(g1?.querySelector('.gallerist-thumb-count')?.textContent).toBe('3')
  })

  it('shows the count badge only on grouped (multi-item) cards', () => {
    open()
    expect(
      document.querySelector('.gallerist-thumb[data-group="g0"] .gallerist-thumb-count'),
    ).toBeNull() // single item → no badge
    expect(
      document.querySelector('.gallerist-thumb[data-group="g2"] .gallerist-thumb-count')
        ?.textContent,
    ).toBe('2')
  })

  it('renders a group caption only when provided', () => {
    open({
      groups: [
        { id: 'g0', caption: 'Morning', items: [item('a0')] },
        { id: 'g1', items: [item('b0'), item('b1')] },
      ],
    })
    expect(
      document.querySelector('.gallerist-thumb[data-group="g0"] .gallerist-thumb-caption')
        ?.textContent,
    ).toBe('Morning')
    expect(
      document.querySelector('.gallerist-thumb[data-group="g1"] .gallerist-thumb-caption'),
    ).toBeNull()
  })

  it('renders item captions only when provided', () => {
    open({
      groups: [{ id: 'g1', items: [{ ...item('b0'), caption: 'First screen' }, item('b1')] }],
    })
    const items = document.querySelectorAll('.gallerist-thumb-item')
    expect(items[0]?.querySelector('.gallerist-thumb-caption')?.textContent).toBe('First screen')
    expect(items[1]?.querySelector('.gallerist-thumb-caption')).toBeNull()
  })

  it('expands the active multi-item group into item thumbs; clicking an item navigates', () => {
    const v = open()
    v.next() // g1 (3 items) active
    const items = document.querySelectorAll('.gallerist-thumb-items .gallerist-thumb-item')
    expect(items.length).toBe(3)
    ;(items[2] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('does no work on a non-cursor state change (zoom)', () => {
    const v = open()
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.zoomTo(2) // changes zoom state, not cursor/collection → render must early-return
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not tear down the rail (replaceChildren on root) for cursor moves', () => {
    const v = open()
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.next() // group move
    v.open({ g: 1 })
    v.nextItem() // item move
    expect(spy).not.toHaveBeenCalled() // reconciled in place, never wiped
  })

  it('reconciles item nav in place: stable node identity, active flips', () => {
    const v = open()
    v.next() // g1 (3 items) active
    const groupBefore = document.querySelector('.gallerist-thumb[data-group="g1"]')
    const itemsBefore = [...document.querySelectorAll('.gallerist-thumb-item')]

    v.nextItem() // i: 0 → 1, same group — must NOT rebuild

    const itemsAfter = [...document.querySelectorAll('.gallerist-thumb-item')]
    expect(itemsAfter[0]).toBe(itemsBefore[0]) // same nodes, no teardown
    expect(itemsAfter[1]).toBe(itemsBefore[1])
    expect(document.querySelector('.gallerist-thumb[data-group="g1"]')).toBe(groupBefore)
    expect(
      document.querySelector('.gallerist-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b1')
  })

  it('the expanded item row is its own listbox (host-mounted sibling of the rail)', () => {
    const v = open()
    v.next() // g1 active → item row appears
    expect(document.querySelector('.gallerist-thumb-items')?.getAttribute('role')).toBe('listbox')
  })

  it('lays the item column out vertically by default (matches ↑/↓ input)', () => {
    const v = open()
    v.next() // g1 active
    const col = document.querySelector('.gallerist-thumb-items')
    expect(col?.getAttribute('aria-orientation')).toBe('vertical')
    expect(col?.getAttribute('data-axis')).toBe('vertical')
  })

  it('honors itemAxis: "horizontal"', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ itemAxis: 'horizontal' })],
    })
    mount(v)
    v.open()
    v.next()
    const col = document.querySelector('.gallerist-thumb-items')
    expect(col?.getAttribute('data-axis')).toBe('horizontal')
    expect(col?.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('live-previews the current item on the active group card', () => {
    const v = open()
    v.next() // g1 active (b0,b1,b2)
    const img = document.querySelector(
      '.gallerist-thumb[data-group="g1"] .gallerist-thumb-img',
    ) as HTMLImageElement
    v.nextItem() // i → 1
    expect(img.src || img.dataset.src).toContain('b1.jpg')
    v.nextItem() // i → 2
    expect(img.src || img.dataset.src).toContain('b2.jpg')
  })

  it('restores the group cover when its group is no longer active', () => {
    const v = open()
    v.next() // g1
    v.nextItem() // shows b1 on g1's card
    v.prev() // back to g0 → g1 card should revert to its cover (items[0] = b0)
    const img = document.querySelector(
      '.gallerist-thumb[data-group="g1"] .gallerist-thumb-img',
    ) as HTMLImageElement
    expect(img.src || img.dataset.src).toContain('b0.jpg')
  })

  it('wires the thumb url for lazy loading', () => {
    open()
    const img = document.querySelector('.gallerist-thumb .gallerist-thumb-img') as HTMLImageElement
    expect(img.src || img.dataset.src).toContain('a0.jpg')
  })

  it('swaps to a disjoint collection cleanly (resetAll): rebuilt, no orphan nodes', () => {
    const v = open()
    v.setCollection({
      groups: [
        { id: 'x0', items: [item('x0a')] },
        { id: 'x1', items: [item('x1a'), item('x1b')] },
      ],
    })
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    expect(rail.querySelectorAll('.gallerist-thumb').length).toBe(2)
    expect(rail.querySelector('.gallerist-thumb[data-group="g0"]')).toBeNull() // old ids gone
    expect(rail.querySelector('.gallerist-thumb[data-active]')?.getAttribute('data-group')).toBe(
      'x0',
    )
  })

  it('keeps the rail bounded after a full traversal (no cover-cache leak)', () => {
    const big: Collection = {
      groups: Array.from({ length: 400 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    const v = open(big)
    for (let i = 0; i < 400; i++) v.goTo(i) // walk the whole collection
    // windowed rail stays bounded even though every group was visited once
    expect(document.querySelectorAll('.gallerist-thumb').length).toBeLessThanOrEqual(17)
  })

  it('windows the rail: a 10k-group collection stays bounded to the window', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    open(big)
    // no layout to measure (happy-dom) → 8 cards each side of the cursor; tight bound catches a regression
    expect(document.querySelectorAll('.gallerist-thumb').length).toBeLessThanOrEqual(17)
  })
})

describe('plugin-thumbnails — peek flyout (stacked)', () => {
  it("hovering a multi-item card opens a peek with that group's items, no cursor change", () => {
    const v = open() // cursor g0
    const g1 = document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement
    fire(g1, 'mouseenter')
    const peek = document.querySelector('.gallerist-thumb-peek')
    expect(peek?.getAttribute('role')).toBe('listbox')
    expect(peek?.querySelectorAll('.gallerist-thumb-item').length).toBe(3)
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 }) // hover never moves the cursor
  })

  it('clicking a peek item navigates and closes the peek', () => {
    const v = open() // cursor g0
    fire(document.querySelector('.gallerist-thumb[data-group="g2"]') as HTMLElement, 'mouseenter')
    const items = document.querySelectorAll('.gallerist-thumb-peek .gallerist-thumb-item')
    expect(items.length).toBe(2)
    ;(items[1] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 })
    expect(document.querySelector('.gallerist-thumb-peek')).toBeNull() // group now active → peek closed
  })

  it('does not open a peek for a single-item group', () => {
    open()
    fire(document.querySelector('.gallerist-thumb[data-group="g0"]') as HTMLElement, 'mouseenter')
    expect(document.querySelector('.gallerist-thumb-peek')).toBeNull()
  })

  it('does not double-render: hovering the active group shows no peek (its column is already up)', () => {
    const v = open()
    v.next() // g1 active → its item column is shown
    fire(document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement, 'mouseenter')
    expect(document.querySelector('.gallerist-thumb-peek')).toBeNull()
  })

  it('closes the peek on mouseleave (debounced)', () => {
    open()
    const g1 = document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement
    fire(g1, 'mouseenter')
    expect(document.querySelector('.gallerist-thumb-peek')).not.toBeNull()
    vi.useFakeTimers()
    fire(g1, 'mouseleave')
    vi.advanceTimersByTime(200)
    vi.useRealTimers()
    expect(document.querySelector('.gallerist-thumb-peek')).toBeNull()
  })

  it('opens the peek on keyboard focus (passive preview)', () => {
    open()
    fire(document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement, 'focusin')
    expect(
      document.querySelector('.gallerist-thumb-peek')?.querySelectorAll('.gallerist-thumb-item')
        .length,
    ).toBe(3)
  })

  it('touch (no hover): a multi-item card exposes an expand affordance and tap navigates without peek', () => {
    stubHover(false)
    const v = open() // cursor g0
    const expand = document.querySelector(
      '.gallerist-thumb[data-group="g1"] ~ .gallerist-thumb-expand, .gallerist-thumb-wrap[data-group="g1"] .gallerist-thumb-expand',
    )
    expect(expand).not.toBeNull() // caret affordance present on touch
    ;(document.querySelector('.gallerist-thumb[data-group="g2"]') as HTMLElement).click()
    expect(v.getState().cursor.g).toBe(2) // first tap still navigates
  })

  it('touch (no hover): tapping the expand affordance opens the peek for a non-active group', () => {
    stubHover(false)
    open() // g0 active
    const expand = document.querySelector(
      '.gallerist-thumb-wrap[data-group="g1"] .gallerist-thumb-expand',
    ) as HTMLButtonElement
    expand.click()
    expect(
      document.querySelector('.gallerist-thumb-peek')?.querySelectorAll('.gallerist-thumb-item')
        .length,
    ).toBe(3)
  })
})

describe('plugin-thumbnails — flat rail (groupDisplay: flat)', () => {
  it('renders one card per item, wrapped one bordered container per group', () => {
    openFlat()
    const wraps = document.querySelectorAll(
      '.gallerist-thumbs[data-display="flat"] .gallerist-thumb-group',
    )
    expect(wraps.length).toBe(3) // g0, g1, g2
    expect(document.querySelectorAll('.gallerist-thumb-item').length).toBe(6) // 1 + 3 + 2
    expect(wraps[0]?.getAttribute('role')).toBe('group')
  })

  it('heads a group with its caption only when provided; the label joins the group name', () => {
    openFlat({
      groups: [
        { id: 'g0', caption: 'Morning', items: [item('a0'), item('a1')] },
        { id: 'g1', items: [item('b0'), item('b1')] },
      ],
    })
    const g0 = document.querySelector('.gallerist-thumb-group[data-group="g0"]')
    const cap = g0?.querySelector('.gallerist-thumb-group-cap')
    expect(cap?.textContent).toBe('Morning')
    expect(cap?.getAttribute('aria-hidden')).toBe('true') // read once, in the group's name
    expect(g0?.getAttribute('aria-label')).toBe('Group 1, Morning')
    const g1 = document.querySelector('.gallerist-thumb-group[data-group="g1"]')
    expect(g1?.querySelector('.gallerist-thumb-group-cap')).toBeNull()
    expect(g1?.getAttribute('aria-label')).toBe('Group 2')
  })

  it('marks the group holding the current item, and moves the mark with navigation', () => {
    const v = openFlat()
    const current = () =>
      [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-group[data-active]')].map(
        (w) => w.dataset.group,
      )
    expect(current()).toEqual(['g0'])
    v.goTo(1, 0)
    expect(current()).toEqual(['g1'])
    v.goTo(1, 2) // another item of the same group: the mark stays
    expect(current()).toEqual(['g1'])
    v.goTo(2, 1)
    expect(current()).toEqual(['g2'])
    // the wrapper only takes data-active: role=group has no selected/current state of its own
    const g2 = document.querySelector('.gallerist-thumb-group[data-group="g2"]')
    expect(g2?.hasAttribute('aria-current')).toBe(false)
    expect(g2?.hasAttribute('aria-selected')).toBe(false)
  })

  it('a re-drawn group gets the mark back (the run follows the cursor)', () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const big: Collection = {
      groups: Array.from({ length: 300 }, (_, g) => ({
        id: `g${g}`,
        items: [item(`g${g}a`), item(`g${g}b`)],
      })),
    }
    const v = openFlat(big)
    v.goTo(250, 1) // outside the drawn run: it is drawn afresh around the cursor
    expect(document.querySelector('.gallerist-thumb-group[data-group="g0"]')).toBeNull()
    expect(
      [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-group[data-active]')].map(
        (w) => w.dataset.group,
      ),
    ).toEqual(['g250'])
  })

  it('marks its region so the renderer walks it linearly; stacked and index rails do not', () => {
    const v = openFlat()
    const region = document.querySelector('.gallerist-thumbs-region')
    expect(region?.hasAttribute('data-gallerist-linear')).toBe(true)
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-linear')).toBe('true')
    const root = document.querySelector('.gallerist') as HTMLElement
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 }) // a0 → b0 → b1, across the group boundary
    for (const groupDisplay of ['stacked', 'index'] as const) {
      document.body.innerHTML = ''
      const w = createViewer({ collection: collection(), plugins: [thumbnails({ groupDisplay })] })
      mount(w)
      w.open()
      expect(document.querySelector('[data-gallerist-linear]')).toBeNull()
    }
  })

  it('an explicit linear: false on the renderer keeps the two axes under a flat rail', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ groupDisplay: 'flat' })],
    })
    mount(v, { linear: false })
    v.open()
    expect(document.querySelector('.gallerist')?.hasAttribute('data-gallerist-linear')).toBe(false)
    const root = document.querySelector('.gallerist') as HTMLElement
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 }) // group by group
  })

  it('clicking an item card navigates', () => {
    const v = openFlat()
    const c1 = document.querySelector('.gallerist-thumb-item[data-item="b2"]') as HTMLButtonElement
    c1.click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('marks the active item and tracks the cursor', () => {
    const v = openFlat()
    expect(
      document.querySelector('.gallerist-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('a0')
    v.next() // g1, i0
    expect(
      document.querySelector('.gallerist-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b0')
    v.nextItem() // g1, i1
    expect(
      document.querySelector('.gallerist-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b1')
  })

  it('reconciles cursor moves in place (no replaceChildren, stable identity)', () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const v = openFlat()
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    const before = [...document.querySelectorAll('.gallerist-thumb-item')]
    v.next()
    v.nextItem()
    const after = [...document.querySelectorAll('.gallerist-thumb-item')]
    expect(after[0]).toBe(before[0]) // same nodes, never torn down
    expect(spy).not.toHaveBeenCalled()
  })

  it('does no work on a non-cursor change (zoom)', () => {
    const v = openFlat()
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.zoomTo(2)
    expect(spy).not.toHaveBeenCalled()
  })

  it('windows the flattened item sequence: 10k single-item groups stay bounded', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    openFlat(big)
    expect(document.querySelectorAll('.gallerist-thumb-item').length).toBeLessThanOrEqual(49)
  })

  it('windows a single giant group: one 10k-item group stays bounded (pathological case)', () => {
    const big: Collection = {
      groups: [{ id: 'g0', items: Array.from({ length: 10_000 }, (_, i) => item(`it${i}`)) }],
    }
    openFlat(big)
    expect(document.querySelectorAll('.gallerist-thumb-item').length).toBeLessThanOrEqual(49)
    const wrap = document.querySelector('.gallerist-thumb-group[data-group="g0"]')
    expect(wrap).not.toBeNull()
    expect(wrap?.hasAttribute('data-partial-end')).toBe(true) // tail of the group is out of the window
  })

  it('shows a group’s label only over its start: a run cut into the group hides it', () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const big: Collection = {
      groups: [
        { id: 'g0', caption: 'Long', items: Array.from({ length: 500 }, (_, i) => item(`it${i}`)) },
      ],
    }
    const v = openFlat(big)
    const wrap = () => document.querySelector('.gallerist-thumb-group[data-group="g0"]')
    const cap = () => wrap()?.querySelector<HTMLElement>('.gallerist-thumb-group-cap')
    expect(cap()?.hidden).toBe(false)
    v.goTo(0, 400) // the run is drawn around item 400: the group's start isn't in it
    expect(wrap()?.hasAttribute('data-partial-start')).toBe(true)
    expect(cap()?.hidden).toBe(true)
    expect(wrap()?.getAttribute('aria-label')).toBe('Group 1, Long') // still named
    v.goTo(0, 0)
    expect(wrap()?.hasAttribute('data-partial-start')).toBe(false)
    expect(cap()?.hidden).toBe(false)
  })

  it('stays bounded after a full flat traversal (no leak)', () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const big: Collection = {
      groups: Array.from({ length: 400 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    const v = openFlat(big)
    for (let i = 0; i < 400; i++) v.goTo(i)
    expect(document.querySelectorAll('.gallerist-thumb-item').length).toBeLessThanOrEqual(49)
  })

  it('swaps to a disjoint collection cleanly', () => {
    const v = openFlat()
    v.setCollection({
      groups: [
        { id: 'x0', items: [item('x0a')] },
        { id: 'x1', items: [item('x1a'), item('x1b')] },
      ],
    })
    expect(document.querySelectorAll('.gallerist-thumb-item').length).toBe(3)
    expect(document.querySelector('.gallerist-thumb-item[data-item="a0"]')).toBeNull() // old ids gone
    expect(
      document.querySelector('.gallerist-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('x0a')
  })
})

describe('plugin-thumbnails — active item panel (expandActive)', () => {
  it('default: active multi-item group auto-shows its vertical item stack in the aside column', () => {
    const v = open()
    v.next() // g1 (3 items)
    const panel = document.querySelector('.gallerist-thumb-items')
    expect(panel?.querySelectorAll('.gallerist-thumb-item').length).toBe(3)
    // beside the stage (takes space), not floating over it from the rail
    expect(panel?.closest('.gallerist-region-aside')).not.toBeNull()
    expect(panel?.closest('.gallerist-region-thumbnails')).toBeNull()
  })

  it('the vertical stack stays up on a one-item group, so the stage width does not jump', () => {
    const v = open() // g0: one item; other groups have several
    const panel = document.querySelector('.gallerist-thumb-items')
    expect(panel?.querySelectorAll('.gallerist-thumb-item').length).toBe(1)
    v.next()
    expect(document.querySelector('.gallerist-thumb-items')).toBe(panel) // same node, refilled
  })

  it('no stack when no group has more than one item', () => {
    const v = createViewer({
      items: [
        { id: 'a', type: 'image', source: 'a.jpg' },
        { id: 'b', type: 'image', source: 'b.jpg' },
      ],
      plugins: [thumbnails()],
    })
    mount(v)
    v.open()
    expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
  })

  it('falls back to the rail region under a renderer without an aside region', async () => {
    const v = createViewer({ collection: collection(), plugins: [thumbnails()] })
    // a minimal custom renderer that hosts only the thumbnails region
    const host = document.body.appendChild(document.createElement('div'))
    const inst = getInternals(v).getPlugins()[0]
    const node = inst?.regions?.thumbnails?.({ viewer: v })
    if (node) host.appendChild(node)
    v.open()
    v.next() // g1: three items
    await Promise.resolve()
    expect(
      document.querySelector('.gallerist-thumb-items')?.closest('.gallerist-thumbs-region'),
    ).not.toBeNull()
  })

  it('moves the stack into the aside column once the renderer mounts it', async () => {
    const v = open()
    v.next()
    await Promise.resolve()
    expect(
      document.querySelector('.gallerist-thumb-items')?.closest('.gallerist-region-aside'),
    ).not.toBeNull()
  })

  it('a horizontal item row stays inline in the rail region', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ itemAxis: 'horizontal' })],
    })
    mount(v)
    v.open()
    v.next()
    const panel = document.querySelector('.gallerist-thumb-items')
    expect(panel?.closest('.gallerist-thumbs-region')).not.toBeNull()
    expect(document.querySelector('.gallerist-region-aside')?.childElementCount).toBe(0)
  })

  it('keeps the item panel through a late viewer.use() (region remount replaceChildren)', () => {
    const v = open()
    v.next() // g1 active, panel shown
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
    v.use(() => ({ name: 'probe' })) // triggers onPluginsChanged → renderer re-mounts all regions
    expect(
      document.querySelector('.gallerist-thumb-items')?.querySelectorAll('.gallerist-thumb-item')
        .length,
    ).toBe(3)
  })

  it('tearing down the renderer removes the item panel (no orphan left on the region)', () => {
    const v = createViewer({ collection: collection(), plugins: [thumbnails()] })
    const handle = mount(v)
    v.open()
    v.next() // panel shown
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
    handle.destroy()
    expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
  })

  it('toolbar items-toggle hides and shows the panel; aria-pressed tracks it', () => {
    const v = open()
    v.next()
    const btn = document.querySelector('.gallerist-items-toggle') as HTMLButtonElement
    expect(btn?.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
    btn.click()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
    btn.click()
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
  })

  it('the `e` key toggles the panel through the renderer keymap', () => {
    const v = open()
    v.next()
    const rootEl = document.querySelector('.gallerist') as HTMLElement
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
    rootEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
    rootEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
  })

  it('expandActive: false keeps the panel hidden until toggled on', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ expandActive: false })],
    })
    mount(v)
    v.open()
    v.next() // g1
    expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
    ;(document.querySelector('.gallerist-items-toggle') as HTMLButtonElement).click()
    expect(document.querySelector('.gallerist-thumb-items')).not.toBeNull()
  })

  it('peeks the active card once its panel is hidden (point 1)', () => {
    const v = open()
    v.next() // g1 active, panel shown
    fire(document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement, 'mouseenter')
    expect(document.querySelector('.gallerist-thumb-peek')).toBeNull() // panel up → no double
    ;(document.querySelector('.gallerist-items-toggle') as HTMLButtonElement).click() // hide panel
    fire(document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement, 'mouseenter')
    expect(
      document.querySelector('.gallerist-thumb-peek')?.querySelectorAll('.gallerist-thumb-item')
        .length,
    ).toBe(3)
  })

  it('panel-hidden state persists across group navigation', () => {
    const v = open()
    v.next() // g1, panel shown
    ;(document.querySelector('.gallerist-items-toggle') as HTMLButtonElement).click() // hide
    v.next() // g2 (2 items)
    expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
  })

  it('flat mode shows no items-toggle button (it is kept, hidden, for a switch back)', () => {
    openFlat()
    expect(document.querySelector<HTMLElement>('.gallerist-items-toggle')?.hidden).toBe(true)
  })
})

describe('thumbnails — timeline and numbered items (M18)', () => {
  const timed = (): Collection => ({
    groups: [
      { id: 'g0', meta: { time: '09:00' }, items: [item('a0')] },
      { id: 'g1', meta: { time: '09:10' }, items: [item('b0'), item('b1')] },
      { id: 'g2', items: [item('c0')] }, // no time: an empty label keeps the row aligned
    ],
  })
  const openWith = (opts: Parameters<typeof thumbnails>[0], col = timed()) => {
    const v = createViewer({ collection: col, plugins: [thumbnails(opts)] })
    mount(v)
    v.open()
    return v
  }

  it('timeline: true labels each card from group.meta.time, inside the card name', () => {
    openWith({ timeline: true })
    const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    expect(rail.hasAttribute('data-timeline')).toBe(true)
    const labels = [...document.querySelectorAll('.gallerist-thumb-time')].map((l) => l.textContent)
    expect(labels).toEqual(['09:00', '09:10', ''])
    const card = document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement
    expect(card.getAttribute('aria-label')).toBe('Group 2, 09:10')
    expect(document.querySelector('.gallerist-thumb-time')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('a timeline function supplies the labels; the current group’s wrapper is marked', () => {
    const v = openWith({ timeline: (_g, i) => `T${i}` })
    expect(document.querySelector('.gallerist-thumb-time')?.textContent).toBe('T0')
    const active = () =>
      [...document.querySelectorAll('.gallerist-thumb-wrap[data-active]')].map(
        (w) => (w as HTMLElement).dataset.group,
      )
    expect(active()).toEqual(['g0'])
    v.next()
    expect(active()).toEqual(['g1'])
  })

  it('no timeline row without the option, or in flat mode (whose groups take the labels)', () => {
    openWith({})
    expect(document.querySelector('.gallerist-thumb-time')).toBeNull()
    document.body.innerHTML = ''
    openWith({ timeline: true, groupDisplay: 'flat' })
    expect(document.querySelector('.gallerist-thumb-time')).toBeNull()
    expect(document.querySelectorAll('.gallerist-thumb-group-cap').length).toBe(2)
  })

  describe('on a flat rail', () => {
    const caps = () =>
      [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-group')].map((w) => [
        w.dataset.group,
        w.querySelector('.gallerist-thumb-group-cap')?.textContent ?? null,
        w.getAttribute('aria-label'),
      ])
    // g0 has a time and a caption, g1 only a time, g2 only a caption, g3 neither
    const mixed = (): Collection => ({
      groups: [
        { id: 'g0', caption: 'Desk', meta: { time: '09:00' }, items: [item('a0')] },
        { id: 'g1', meta: { time: '09:10' }, items: [item('b0'), item('b1')] },
        { id: 'g2', caption: 'Lunch', items: [item('c0')] },
        { id: 'g3', items: [item('d0')] },
      ],
    })

    it('timeline: true heads each group with group.meta.time, else its caption', () => {
      openWith({ groupDisplay: 'flat', timeline: true }, mixed())
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
      expect(caps()).toEqual([
        ['g0', '09:00', 'Group 1, 09:00'], // the time wins over the caption
        ['g1', '09:10', 'Group 2, 09:10'],
        ['g2', 'Lunch', 'Group 3, Lunch'], // no time: the caption
        ['g3', null, 'Group 4'],
      ])
      for (const cap of document.querySelectorAll('.gallerist-thumb-group-cap'))
        expect(cap.getAttribute('aria-hidden')).toBe('true')
    })

    it('a timeline function supplies the labels; undefined falls back to the caption', () => {
      const seen: Array<[string, number]> = []
      openWith(
        {
          groupDisplay: 'flat',
          timeline: (group, index) => {
            seen.push([group.id, index])
            return index % 2 ? undefined : `T${index}`
          },
        },
        mixed(),
      )
      expect(caps()).toEqual([
        ['g0', 'T0', 'Group 1, T0'],
        ['g1', null, 'Group 2'], // undefined, and no caption
        ['g2', 'T2', 'Group 3, T2'],
        ['g3', null, 'Group 4'],
      ])
      expect(seen).toContainEqual(['g2', 2])
      document.body.innerHTML = ''
      openWith({ groupDisplay: 'flat', timeline: () => undefined }, mixed())
      expect(caps().map(([, cap]) => cap)).toEqual(['Desk', null, 'Lunch', null])
    })

    it('without a timeline the captions head the groups', () => {
      openWith({ groupDisplay: 'flat' }, mixed())
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
      expect(caps().map(([, cap]) => cap)).toEqual(['Desk', null, 'Lunch', null])
    })

    it('the current group’s label is the marked one, and follows the cursor', () => {
      const v = openWith({ groupDisplay: 'flat', timeline: true }, mixed())
      const current = () =>
        document.querySelector('.gallerist-thumb-group[data-active] > .gallerist-thumb-group-cap')
          ?.textContent
      expect(current()).toBe('09:00')
      v.goTo(1, 1)
      expect(current()).toBe('09:10')
      v.goTo(2)
      expect(current()).toBe('Lunch')
      expect(document.querySelectorAll('.gallerist-thumb-group[data-active]').length).toBe(1)
    })

    it('an index rail draws no timeline', () => {
      openWith({ groupDisplay: 'index', timeline: true }, mixed())
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
      expect(document.querySelector('.gallerist-thumb-time')).toBeNull()
    })
  })

  it('numberItems puts a 1-based number on each item thumb', () => {
    const v = openWith({ numberItems: true })
    v.next() // the two-item group
    const nums = [...document.querySelectorAll('.gallerist-thumb-items .gallerist-thumb-num')].map(
      (n) => n.textContent,
    )
    expect(nums).toEqual(['1', '2'])
  })

  describe('preset defaults (RegionCtx.preset)', () => {
    const openPreset = (
      preset: PresetName | undefined,
      opts?: Parameters<typeof thumbnails>[0],
      col = timed(),
    ) => {
      const v = createViewer({ collection: col, plugins: [thumbnails(opts)] })
      mount(v, { preset })
      v.open()
      return v
    }
    const nums = () =>
      [...document.querySelectorAll('.gallerist-thumb-items .gallerist-thumb-num')].map(
        (n) => n.textContent,
      )
    // what the aside column shows: a rail that isn't stacked keeps its column there, hidden
    const asideShown = () =>
      [...(document.querySelector('.gallerist-region-aside')?.children ?? [])].filter(
        (n) => !(n as HTMLElement).hidden,
      ).length

    it('thumbnails() takes the mounted preset’s rail: reviewer → timeline + numbered items', () => {
      const v = openPreset('reviewer')
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
      expect(document.querySelector('.gallerist-thumb-time')?.textContent).toBe('09:00')
      v.next()
      expect(nums()).toEqual(['1', '2'])
      // still a vertical stack in the aside column (the preset's itemAxis)
      expect(
        document
          .querySelector('.gallerist-region-aside .gallerist-thumb-items')
          ?.getAttribute('data-axis'),
      ).toBe('vertical')
    })

    it('an explicit option wins per key; an undefined one still takes the preset', () => {
      const v = openPreset('reviewer', { timeline: false, numberItems: undefined })
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
      v.next()
      expect(nums()).toEqual(['1', '2'])
    })

    it('editorial puts the items in a numbered row in the rail, not the aside column', () => {
      const v = openPreset('editorial')
      v.next()
      const row = document.querySelector('.gallerist-region-thumbnails .gallerist-thumb-items')
      expect(row?.getAttribute('data-axis')).toBe('horizontal')
      expect(nums()).toEqual(['1', '2'])
      expect(document.querySelector('.gallerist-region-aside')?.childElementCount).toBe(0)
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
    })

    it('tour makes the rail a section index', () => {
      openPreset('tour')
      expect(document.querySelector('.gallerist-thumbs')?.getAttribute('data-display')).toBe(
        'index',
      )
      expect(document.querySelectorAll('.gallerist-thumb-row').length).toBe(3)
      expect(asideShown()).toBe(0)
    })

    it('explicit options can undo the preset’s layout (tour as a stacked vertical rail)', () => {
      openPreset('tour', { groupDisplay: 'stacked', itemAxis: 'vertical' })
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-display')).toBe(false)
      expect(document.querySelectorAll('.gallerist-thumb-row').length).toBe(0)
    })

    it('without a preset, and with filmstrip, the rail keeps its own defaults', () => {
      for (const preset of [undefined, 'filmstrip'] as const) {
        const v = openPreset(preset)
        expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(
          false,
        )
        v.next()
        expect(nums()).toEqual([])
        expect(
          document.querySelector('.gallerist-region-aside .gallerist-thumb-items'),
        ).not.toBeNull()
        document.body.innerHTML = ''
      }
    })

    it('a plugin added after mount takes the preset too', () => {
      const v = createViewer({ collection: timed() })
      mount(v, { preset: 'reviewer' })
      v.use(thumbnails())
      v.open()
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
    })

    it('a new mount builds the rail again for its own preset (reviewer, then editorial)', () => {
      const v = createViewer({ collection: timed(), plugins: [thumbnails()] })
      const first = mount(v, { preset: 'reviewer' })
      v.open()
      v.next()
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
      expect(
        document.querySelector('.gallerist-region-aside .gallerist-thumb-items'),
      ).not.toBeNull()
      first.destroy()
      mount(v, { preset: 'editorial' })
      expect(document.querySelectorAll('.gallerist-thumbs').length).toBe(1)
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
      const row = document.querySelector('.gallerist-region-thumbnails .gallerist-thumb-items')
      expect(row?.getAttribute('data-axis')).toBe('horizontal')
      expect(nums()).toEqual(['1', '2'])
      expect(document.querySelector('.gallerist-region-aside')?.childElementCount).toBe(0)
      // the rail follows the viewer from the new mount
      v.goTo(2)
      expect(
        document.querySelector('.gallerist-thumb[data-active]')?.getAttribute('data-group'),
      ).toBe('g2')
    })

    it('a new mount builds the rail again for its own preset (none, then tour)', () => {
      const v = createViewer({ collection: timed(), plugins: [thumbnails()] })
      const first = mount(v)
      v.open()
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-display')).toBe(false)
      first.destroy()
      mount(v, { preset: 'tour' })
      expect(document.querySelectorAll('.gallerist-thumbs').length).toBe(1)
      expect(document.querySelector('.gallerist-thumbs')?.getAttribute('data-display')).toBe(
        'index',
      )
      expect(document.querySelectorAll('.gallerist-thumb-row').length).toBe(3)
      expect(asideShown()).toBe(0)
    })

    it('an explicit groupDisplay other than the preset’s drops its layout keys (tour, stacked)', () => {
      const v = openPreset('tour', { groupDisplay: 'stacked' })
      v.next()
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-display')).toBe(false)
      // the plugin's own item axis (a vertical stack in the aside column) and no numbers
      expect(
        document
          .querySelector('.gallerist-region-aside .gallerist-thumb-items')
          ?.getAttribute('data-axis'),
      ).toBe('vertical')
      expect(nums()).toEqual([])
    })

    it('the preset’s timeline carries into an explicit flat rail; its numbering does not', () => {
      openPreset('reviewer', { groupDisplay: 'flat' })
      const rail = document.querySelector('.gallerist-thumbs')
      expect(rail?.getAttribute('data-display')).toBe('flat')
      expect(rail?.hasAttribute('data-timeline')).toBe(true)
      expect(
        [...document.querySelectorAll('.gallerist-thumb-group-cap')].map((c) => c.textContent),
      ).toEqual(['09:00', '09:10']) // g2 has no time (and no caption): no label
      expect(document.querySelector('.gallerist-thumb-group')?.getAttribute('aria-label')).toBe(
        'Group 1, 09:00',
      )
      expect(document.querySelector('.gallerist-thumb-num')).toBeNull() // numberItems stays behind
      // a flat rail under the reviewer walks item by item
      expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-linear')).toBe(
        'true',
      )
    })

    it('the caller can still turn the preset’s timeline off on a flat rail', () => {
      openPreset(
        'reviewer',
        { groupDisplay: 'flat', timeline: false },
        {
          groups: [
            { id: 'g0', caption: 'Desk', meta: { time: '09:00' }, items: [item('a0')] },
            { id: 'g1', meta: { time: '09:10' }, items: [item('b0')] },
          ],
        },
      )
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
      expect(
        [...document.querySelectorAll('.gallerist-thumb-group-cap')].map((c) => c.textContent),
      ).toEqual(['Desk'])
    })

    it('an explicit groupDisplay equal to the preset’s keeps its layout keys (reviewer, stacked)', () => {
      const v = openPreset('reviewer', { groupDisplay: 'stacked' })
      expect(document.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
      v.next()
      expect(nums()).toEqual(['1', '2'])
    })

    // A renderer's preset is untyped data: values outside the known ones take the defaults.
    const regionsWith = (thumbs: unknown, opts?: Parameters<typeof thumbnails>[0]) => {
      const v = createViewer({ collection: timed() })
      const inst = thumbnails(opts)(v)
      inst.init?.()
      const ctx = { viewer: v, preset: { thumbnails: thumbs } }
      const regions = inst.regions ?? {}
      const rail = regions.thumbnails?.(ctx) as HTMLElement
      document.body.appendChild(rail)
      return { v, inst, ctx, rail, regions }
    }

    it('a preset that makes the rail flat carries its timeline too (untyped preset data)', () => {
      const { v, rail } = regionsWith({ groupDisplay: 'flat', timeline: true })
      v.open()
      expect(rail.querySelector('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
      expect(rail.querySelector('.gallerist-thumb-group-cap')?.textContent).toBe('09:00')
      expect(rail.hasAttribute('data-gallerist-linear')).toBe(true)
    })

    it('unknown groupDisplay / itemAxis values from a preset fall back to the defaults', () => {
      const { ctx, rail, regions } = regionsWith({ groupDisplay: 'grid', itemAxis: 'diagonal' })
      const strip = rail.querySelector('.gallerist-thumbs')
      expect(strip?.hasAttribute('data-display')).toBe(false)
      expect(strip?.getAttribute('role')).toBe('listbox')
      // a vertical stack, so the aside column gets its node
      const aside = regions.aside?.(ctx)
      expect(aside?.nodeType).toBe(Node.ELEMENT_NODE)
      expect((aside as HTMLElement).className).toBe('gallerist-thumbs-aside')
    })

    it('a preset that makes the rail flat leaves the claimed toggle and `e` key inert', () => {
      const { v, inst, ctx, rail, regions } = regionsWith({ groupDisplay: 'flat' })
      v.open()
      expect(rail.querySelector('.gallerist-thumbs')?.getAttribute('data-display')).toBe('flat')
      // the toolbar region was claimed (the explicit options allowed it): its button stays hidden
      expect((regions.toolbar?.(ctx) as HTMLElement).hidden).toBe(true)
      const before = rail.innerHTML
      inst.keymap?.e?.(new KeyboardEvent('keydown', { key: 'e' }))
      inst.keymap?.E?.(new KeyboardEvent('keydown', { key: 'E' }))
      expect(rail.innerHTML).toBe(before)
      expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
    })
  })

  describe('scrolling', () => {
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect

    it('brings the active item into view inside its panel, centred', () => {
      const v = open()
      v.next()
      const panel = document.querySelector('.gallerist-thumb-items') as HTMLElement
      panel.style.overflowY = 'auto'
      panel.getBoundingClientRect = () => rect(0, 100)
      const second = panel.querySelector('[data-item="b1"]') as HTMLElement
      second.getBoundingClientRect = () => rect(150, 200)
      v.nextItem()
      expect(panel.scrollTop).toBe(125) // its middle (175) on the panel's (50)
    })

    it('centres the active item once the item after it would be cut off', () => {
      const v = open()
      v.next()
      const panel = document.querySelector('.gallerist-thumb-items') as HTMLElement
      panel.style.overflowY = 'auto'
      panel.getBoundingClientRect = () => rect(0, 300)
      const at = (id: string, top: number) => {
        const el = panel.querySelector(`[data-item="${id}"]`) as HTMLElement
        el.getBoundingClientRect = () => rect(top, top + 90)
      }
      at('b0', 0)
      at('b1', 100)
      at('b2', 200) // 200..290: shows whole
      v.nextItem()
      expect(panel.scrollTop).toBe(0) // b1 and both its neighbours show: nothing moves
      at('b2', 250) // 250..340: cut by the panel's bottom
      v.prevItem()
      v.nextItem()
      expect(panel.scrollTop).toBe(145 - 150) // b1's middle (145) on the panel's (150)
    })

    it('leaves a panel alone when the active item already shows', () => {
      const v = open()
      v.next()
      const panel = document.querySelector('.gallerist-thumb-items') as HTMLElement
      panel.style.overflowY = 'auto'
      panel.getBoundingClientRect = () => rect(0, 300)
      const second = panel.querySelector('[data-item="b1"]') as HTMLElement
      second.getBoundingClientRect = () => rect(150, 200)
      v.nextItem()
      expect(panel.scrollTop).toBe(0)
    })

    it('a hidden button moves nothing, wherever the viewer sits on the page', () => {
      const v = open()
      v.next()
      const rail = document.querySelector('.gallerist-thumbs') as HTMLElement
      rail.style.overflowX = 'auto'
      rail.getBoundingClientRect = () =>
        ({ top: 0, bottom: 80, left: 250, right: 1150, width: 900, height: 80 }) as DOMRect
      v.nextItem() // happy-dom gives the buttons an all-zero box, as display: none does
      expect(rail.scrollLeft).toBe(0)
    })

    it('never asks the browser to scroll the page', () => {
      const real = Element.prototype.scrollIntoView
      const spy = vi.fn()
      Element.prototype.scrollIntoView = spy
      try {
        const v = open()
        v.next()
        v.next()
        expect(spy).not.toHaveBeenCalled()
      } finally {
        Element.prototype.scrollIntoView = real
      }
    })
  })

  describe('section index (groupDisplay: index)', () => {
    const named = (): Collection => ({
      groups: [
        { id: 'g0', caption: 'Exterior', meta: { subtitle: 'Outside' }, items: [item('a0')] },
        { id: 'g1', caption: 'Kitchen', items: [item('b0'), item('b1'), item('b2')] },
        { id: 'g2', items: [item('c0'), item('c1')] },
      ],
    })
    const openIndex = (col = named()) => {
      const v = createViewer({
        collection: col,
        plugins: [thumbnails({ groupDisplay: 'index', numberItems: true })],
      })
      mount(v, { rail: 'left' })
      v.open()
      return v
    }
    const rows = () => [...document.querySelectorAll<HTMLButtonElement>('.gallerist-thumb-row')]

    it('lists a row per group with name, subtitle and count', () => {
      openIndex()
      expect(rows().length).toBe(3)
      expect(rows()[0]?.querySelector('.gallerist-thumb-row-name')?.textContent).toBe('Exterior')
      expect(rows()[0]?.querySelector('.gallerist-thumb-row-sub')?.textContent).toBe('Outside')
      expect(rows()[1]?.querySelector('.gallerist-thumb-row-count')?.textContent).toBe('3')
      expect(rows()[2]?.querySelector('.gallerist-thumb-row-name')?.textContent).toBe('Group 3')
      expect(rows()[0]?.getAttribute('aria-label')).toBe('Exterior, Outside (1)')
    })

    it('rows are current, not selected options, so the item listbox can sit among them', () => {
      openIndex()
      expect(document.querySelector('.gallerist-thumbs')?.getAttribute('role')).toBe('group')
      expect(rows()[0]?.hasAttribute('role')).toBe(false)
      expect(rows()[0]?.hasAttribute('aria-selected')).toBe(false)
      expect(rows()[0]?.getAttribute('aria-current')).toBe('true')
      expect(rows()[1]?.hasAttribute('aria-current')).toBe(false)
    })

    it('expands the active multi-item group under its own row, as a row', () => {
      const v = openIndex()
      expect(document.querySelector('.gallerist-thumb-items')).toBeNull() // one item: nothing to expand
      v.next()
      const panel = document.querySelector(
        '.gallerist-thumb-section[data-group="g1"] .gallerist-thumb-items',
      )
      expect(panel?.querySelectorAll('.gallerist-thumb-item').length).toBe(3)
      expect(panel?.getAttribute('data-axis')).toBe('horizontal')
      expect(panel?.querySelector('.gallerist-thumb-num')?.textContent).toBe('1')
      v.next()
      expect(document.querySelectorAll('.gallerist-thumb-items').length).toBe(1)
      expect(
        document.querySelector('.gallerist-thumb-section[data-group="g2"] .gallerist-thumb-items'),
      ).not.toBeNull()
    })

    it('a row navigates to its group; an item button to its item', () => {
      const v = openIndex()
      rows()[1]?.click()
      expect(v.getState().cursor.g).toBe(1)
      ;(document.querySelectorAll('.gallerist-thumb-item')[2] as HTMLButtonElement).click()
      expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
    })

    it('the cover stays when moving through the items, and there is no peek', () => {
      const v = openIndex()
      v.goTo(1, 2)
      const img = rows()[1]?.querySelector('img') as HTMLImageElement
      expect(img.dataset.live).toBeUndefined()
      rows()[2]?.dispatchEvent(new MouseEvent('mouseenter'))
      expect(document.querySelector('.gallerist-thumb-peek')).toBeNull()
    })

    it('the e key hides the expanded items; nothing goes to the aside column', () => {
      const v = openIndex()
      v.next()
      document
        .querySelector('.gallerist')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
      expect(document.querySelector('.gallerist-thumb-items')).toBeNull()
      // the column a stacked rail would use stays hidden and empty
      expect(document.querySelector<HTMLElement>('.gallerist-thumbs-aside')?.hidden).toBe(true)
      expect(document.querySelector('.gallerist-thumbs-aside')?.childElementCount).toBe(0)
    })
  })
})

describe('plugin-thumbnails — windowing (U17)', () => {
  // A laid-out rail: 1000px wide, cards 90px wide every 100px in DOM order, scrolled by scrollLeft.
  const RAIL_W = 1000
  let rail: HTMLElement
  const layOut = () => {
    rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    Object.defineProperty(rail, 'clientWidth', { configurable: true, value: RAIL_W })
    const real = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const box = (left: number, width: number) =>
        ({ left, right: left + width, top: 0, bottom: 80, width, height: 80 }) as DOMRect
      if (this === rail) return box(0, RAIL_W)
      if (this.parentElement === rail) {
        return box([...rail.children].indexOf(this) * 100 - rail.scrollLeft, 90)
      }
      return real.call(this)
    })
  }
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
  const scrollTo = async (x: number) => {
    rail.scrollLeft = x
    rail.dispatchEvent(new Event('scroll'))
    await frame()
  }
  const drawn = () =>
    [...document.querySelectorAll<HTMLElement>('.gallerist-thumbs > .gallerist-thumb')].map((c) =>
      Number(c.dataset.group?.slice(1)),
    )
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k)
  const many = (n: number, per = 1): Collection => ({
    groups: Array.from({ length: n }, (_, g) => ({
      id: `g${g}`,
      items: Array.from({ length: per }, (_, i) => item(`g${g}i${i}`)),
    })),
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('draws what fits in the rail plus 3 cards each side, once it can measure', async () => {
    open(many(2000))
    expect(drawn()).toEqual(range(0, 16)) // no layout yet: 8 each side, kept full at the start
    layOut()
    await scrollTo(0)
    // 1000 / 100 → 10 cards, +1 part-shown: 11 fit; the middle one is g5 → 6 + 3 each side of it
    expect(drawn()).toEqual(range(0, 18))
  })

  it('follows the rail scroll, inserting and removing only the cards that cross the edges', async () => {
    open(many(2000))
    layOut()
    await scrollTo(0)
    const kept = document.querySelector('.gallerist-thumb[data-group="g10"]')
    const mo = new MutationObserver(() => {})
    mo.observe(rail, { childList: true })
    await scrollTo(1000) // g10..g20 now show: the middle is g15
    const recs = mo.takeRecords()
    mo.disconnect()
    expect(drawn()).toEqual(range(6, 24))
    expect(document.querySelector('.gallerist-thumb[data-group="g10"]')).toBe(kept)
    const removed = recs.flatMap((r) => [...r.removedNodes])
    const added = recs.flatMap((r) => [...r.addedNodes])
    expect(removed.length).toBe(6) // g0..g5, nothing taken out and put back
    expect(added.length).toBe(6) // g19..g24
    // six cards went before the ones on screen: the offset follows, so g10 stays where it was
    expect(rail.scrollLeft).toBe(400)
    expect(kept?.getBoundingClientRect().left).toBe(0)
  })

  it('a cursor outside the drawn run re-centres it there', () => {
    const v = open(many(2000))
    v.goTo(1500)
    const cards = drawn()
    expect(cards).toContain(1500)
    expect(cards.length).toBeLessThanOrEqual(17)
    expect(
      document.querySelector('.gallerist-thumb[data-active]')?.getAttribute('data-group'),
    ).toBe('g1500')
  })

  it('a re-drawn active card gets its active state back', async () => {
    open(many(2000))
    layOut()
    await scrollTo(0)
    await scrollTo(3000) // g0 leaves the run
    expect(drawn()).not.toContain(0)
    for (let k = 0; k < 4; k++) await scrollTo(0) // each pass draws more before, and the offset follows
    expect(drawn()).toEqual(range(0, 18))
    const g0 = document.querySelector('.gallerist-thumb[data-group="g0"]')
    expect(g0?.hasAttribute('data-active')).toBe(true)
    expect(g0?.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelectorAll('.gallerist-thumb[data-active]').length).toBe(1)
  })

  it('a focused card scrolled out of the run hands focus to the viewer', async () => {
    open(many(2000))
    layOut()
    await scrollTo(0)
    ;(document.querySelector('.gallerist-thumb[data-group="g1"]') as HTMLElement).focus()
    await scrollTo(3000)
    expect(document.activeElement).toBe(document.querySelector('.gallerist'))
  })

  it('an item step writes the active state of two thumbs, however long the group', () => {
    const v = open(many(1, 500))
    const writes: Element[] = []
    const mo = new MutationObserver(() => {})
    mo.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-active', 'aria-selected', 'aria-current'],
    })
    v.nextItem()
    for (const r of mo.takeRecords()) {
      if ((r.target as Element).closest('.gallerist-thumbs-region, .gallerist-thumbs-aside'))
        writes.push(r.target as Element)
    }
    mo.disconnect()
    const ids = [...new Set(writes)].map((el) => (el as HTMLElement).dataset.item)
    expect(ids).toEqual(['g0i0', 'g0i1'])
    expect(writes.length).toBe(4) // data-active + aria-selected on each
  })

  it('a group step moves the active state from one card to the other', () => {
    const v = open(many(2000))
    v.next()
    const active = document.querySelectorAll('.gallerist-thumbs [data-active]')
    expect([...active].map((el) => el.getAttribute('data-group'))).toEqual(['g1'])
    expect(
      document.querySelector('.gallerist-thumb[data-group="g0"]')?.getAttribute('aria-selected'),
    ).toBe('false')
  })

  it('index: a group caption that is not a string names the row by number', () => {
    const odd = { id: 'c', render: () => 'x' } as unknown as string
    const v = createViewer({
      collection: { groups: [{ id: 'g0', caption: odd, items: [item('a0'), item('a1')] }] },
      plugins: [thumbnails({ groupDisplay: 'index' })],
    })
    mount(v)
    v.open()
    const row = document.querySelector('.gallerist-thumb-row')
    expect(row?.getAttribute('aria-label')).toContain('Group 1')
    expect(document.querySelector('.gallerist-thumbs')?.innerHTML).not.toContain('object Object')
  })

  it('index: the active section keeps its items through a scroll, and gets them back', async () => {
    const v = createViewer({
      collection: many(2000, 3),
      plugins: [thumbnails({ groupDisplay: 'index' })],
    })
    mount(v)
    v.open({ g: 30, i: 0 })
    layOut()
    const sections = () =>
      [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-section')].map((c) =>
        Number(c.dataset.group?.slice(1)),
      )
    const row = document.querySelector('.gallerist-thumb-items') as HTMLElement
    const button = row.querySelector('button') as HTMLElement
    button.focus()
    await scrollTo(0) // the run moves, g30 stays in it: its items aren't touched, the focus stays
    expect(sections()).toEqual(range(18, 36))
    expect(document.activeElement).toBe(button)
    for (let k = 0; k < 6 && sections().includes(30); k++) await scrollTo(3000)
    expect(row.isConnected).toBe(false) // left with its section
    for (let k = 0; k < 10 && !sections().includes(30); k++) await scrollTo(0)
    const g30 = document.querySelector('.gallerist-thumb-section[data-group="g30"]')
    expect(row.parentNode).toBe(g30)
    expect(row.querySelectorAll('.gallerist-thumb-item').length).toBe(3)
  })

  it('flat: follows the rail scroll too, in item cards', async () => {
    const v = createViewer({
      collection: many(1, 3000),
      plugins: [thumbnails({ groupDisplay: 'flat' })],
    })
    mount(v)
    v.open()
    const items = () =>
      [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-item')].map((b) =>
        Number(b.dataset.item?.split('i')[1]),
      )
    expect(items()).toEqual(range(0, 16))
    v.goTo(0, 1000)
    expect(items()).toEqual(range(992, 1008))
  })

  it('cards carry their place in the whole list, though only a run is drawn', () => {
    const v = open(many(2000, 2))
    v.goTo(1500)
    const card = document.querySelector('.gallerist-thumb[data-group="g1500"]')
    expect(card?.getAttribute('aria-posinset')).toBe('1501')
    expect(card?.getAttribute('aria-setsize')).toBe('2000')
    const thumb = document.querySelector('.gallerist-thumb-item[data-item="g1500i1"]')
    expect(thumb?.getAttribute('aria-posinset')).toBe('2')
    expect(thumb?.getAttribute('aria-setsize')).toBe('2')
  })

  it('flat: item cards are placed within their group (the role=group they sit in)', () => {
    const v = createViewer({
      collection: many(3000, 3),
      plugins: [thumbnails({ groupDisplay: 'flat' })],
    })
    mount(v)
    v.open({ g: 1200, i: 1 })
    const thumb = document.querySelector('.gallerist-thumb-item[data-item="g1200i1"]')
    expect(thumb?.closest('[role="group"]')?.getAttribute('data-group')).toBe('g1200')
    expect(thumb?.getAttribute('aria-posinset')).toBe('2') // "Item 2, 2 of 3", not "…, 3602 of 9000"
    expect(thumb?.getAttribute('aria-setsize')).toBe('3')
  })

  it('a numeric overscan below what fits is raised to it, so the rail never shows gaps', async () => {
    const v = createViewer({ collection: many(2000), plugins: [thumbnails({ overscan: 1 })] })
    mount(v)
    v.open()
    layOut()
    await scrollTo(0)
    await scrollTo(0) // 11 fit: half of them (6) each side of the middle card, g5, kept full
    expect(drawn()).toEqual(range(0, 12))
    // a jump past the run walks there a pass at a time (each pass keeps the offset, so the
    // screen doesn't move), then holds what fits each side of the middle card, g15
    await scrollTo(1000)
    for (let k = 0; k < 4; k++) {
      rail.dispatchEvent(new Event('scroll'))
      await frame()
    }
    expect(drawn()).toEqual(range(9, 21))
  })

  it('setCollection while a thumb has focus hands focus to the viewer', () => {
    const v = open(many(20))
    ;(document.querySelector('.gallerist-thumb[data-group="g3"]') as HTMLElement).focus()
    v.setCollection(many(10))
    expect(document.activeElement).toBe(document.querySelector('.gallerist'))
  })
})

// The rail in other layouts. Each card is 90px along the axis, every 100px, in DOM order.
describe('plugin-thumbnails — windowing in every direction (U17 review)', () => {
  const EXTENT = 1000
  let rail: HTMLElement
  let scrollX = 0
  let scrollY = 0
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k)
  const many = (n: number, per = 1): Collection => ({
    groups: Array.from({ length: n }, (_, g) => ({
      id: `g${g}`,
      items: Array.from({ length: per }, (_, i) => item(`g${g}i${i}`)),
    })),
  })
  const box = (left: number, top: number, width: number, height: number) =>
    ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect
  // `place(el)` returns the box of a card, or null for anything else
  const layOut = (axis: 'x' | 'y', place: (el: HTMLElement) => DOMRect | null) => {
    rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    scrollX = 0
    scrollY = 0
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: axis === 'x' ? EXTENT : 200 },
      clientHeight: { configurable: true, value: axis === 'y' ? EXTENT : 100 },
      // negative in a right-to-left rail, as browsers report it
      scrollLeft: {
        configurable: true,
        get: () => scrollX,
        set: (v: number) => {
          scrollX = v
        },
      },
      scrollTop: {
        configurable: true,
        get: () => scrollY,
        set: (v: number) => {
          scrollY = v
        },
      },
    })
    if (axis === 'y') rail.style.flexDirection = 'column'
    const real = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === rail) return axis === 'x' ? box(0, 0, EXTENT, 100) : box(0, 0, 200, EXTENT)
      return place(this) ?? real.call(this)
    })
  }
  const scroll = async (x: number, y: number) => {
    rail.scrollLeft = x
    rail.scrollTop = y
    rail.dispatchEvent(new Event('scroll'))
    await frame()
  }
  const childIndex = (el: HTMLElement) =>
    el.parentElement === rail ? [...rail.children].indexOf(el) : -1
  const groupsDrawn = (sel = '.gallerist-thumb') =>
    [...document.querySelectorAll<HTMLElement>(`.gallerist-thumbs > ${sel}`)].map((c) =>
      Number(c.dataset.group?.slice(1)),
    )
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('dir')
  })

  it('right to left: follows the scroll toward the end, keeping what is on screen', async () => {
    document.documentElement.setAttribute('dir', 'rtl')
    const v = createViewer({ collection: many(2000), plugins: [thumbnails()] })
    mount(v)
    v.open()
    // card k runs from the right edge leftwards; scrolling toward the end makes scrollLeft negative
    layOut('x', (el) => {
      const k = childIndex(el)
      return k < 0 ? null : box(EXTENT - (k + 1) * 100 + 10 - scrollX, 0, 90, 80)
    })
    await scroll(0, 0)
    expect(groupsDrawn()).toEqual(range(0, 18)) // the middle is g5, as left to right
    await scroll(-1000, 0) // g10..g20 now show: the middle is g15
    expect(groupsDrawn()).toEqual(range(6, 24)) // not collapsed back to the start
    const g15 = document.querySelector('.gallerist-thumb[data-group="g15"]') as HTMLElement
    const r = g15.getBoundingClientRect()
    expect(r.left <= EXTENT / 2 && r.right >= EXTENT / 2).toBe(true) // still under the middle
    expect(rail.scrollTop).toBe(0)
    v.goTo(15)
    expect(document.querySelector('.gallerist-thumb[data-active]')).toBe(g15)
  })

  it('a side rail: runs down the column, scrolled by scrollTop', async () => {
    const v = createViewer({ collection: many(2000), plugins: [thumbnails()] })
    mount(v, { rail: 'left' })
    v.open()
    layOut('y', (el) => {
      const k = childIndex(el)
      return k < 0 ? null : box(10, k * 100 - scrollY, 180, 90)
    })
    await scroll(0, 0)
    expect(groupsDrawn()).toEqual(range(0, 18))
    await scroll(0, 1000)
    expect(groupsDrawn()).toEqual(range(6, 24))
    expect(rail.scrollTop).toBe(400) // six cards went above: the offset follows
    expect(rail.scrollLeft).toBe(0)
  })

  it('flat on a side rail: rows of item cards across a vertical rail, no sideways jump', async () => {
    const v = createViewer({
      collection: many(1, 3000),
      plugins: [thumbnails({ groupDisplay: 'flat' })],
    })
    mount(v, { rail: 'left' })
    v.open()
    // three item cards side by side per row, rows 100px apart, in drawn order
    layOut('y', (el) => {
      if (!el.classList.contains('gallerist-thumb-item')) return null
      const k = [...rail.querySelectorAll('.gallerist-thumb-item')].indexOf(el)
      return box((k % 3) * 60, Math.floor(k / 3) * 100 - scrollY, 56, 90)
    })
    const items = () =>
      [...document.querySelectorAll<HTMLElement>('.gallerist-thumb-item')].map((b) =>
        Number(b.dataset.item?.split('i')[1]),
      )
    await scroll(0, 0)
    // 11 rows of 3 fit: half of 33 (17) + 3 each side of the middle card, kept full at the start
    expect(items()).toEqual(range(0, 40))
    await scroll(0, 3000) // rows 30..40 show: the middle row starts at item 105
    for (let k = 0; k < 6; k++) {
      rail.dispatchEvent(new Event('scroll')) // the run walks there, keeping the offset
      await frame()
    }
    expect(items()).toContain(105)
    expect(items()[0]).toBeGreaterThan(0)
    expect(rail.scrollLeft).toBe(0) // the old axis-from-cards read 'x' here and scrolled sideways
    // the drawn cards cover the rail from edge to edge: nothing on screen is missing
    const boxes = [...rail.querySelectorAll('.gallerist-thumb-item')].map((b) =>
      b.getBoundingClientRect(),
    )
    expect(Math.min(...boxes.map((r) => r.top))).toBeLessThanOrEqual(0)
    expect(Math.max(...boxes.map((r) => r.bottom))).toBeGreaterThanOrEqual(EXTENT)
  })

  it('index chips on a bottom rail: run along the row and follow its scroll', async () => {
    const v = createViewer({
      collection: many(2000, 3),
      plugins: [thumbnails({ groupDisplay: 'index' })],
    })
    mount(v)
    v.open({ g: 12, i: 0 })
    layOut('x', (el) => {
      const k = childIndex(el)
      return k < 0 ? null : box(k * 100 - scrollX, 0, 90, 60)
    })
    await scroll(0, 0)
    const sections = () => groupsDrawn('.gallerist-thumb-section')
    expect(sections()).toEqual(range(0, 18))
    await scroll(1000, 0)
    expect(sections()).toEqual(range(6, 24))
    expect(rail.scrollLeft).toBe(400)
    // the active section is still drawn, with its items
    const g12 = document.querySelector('.gallerist-thumb-section[data-group="g12"]')
    expect(g12?.querySelector('.gallerist-thumb-items')).not.toBeNull()
  })
})

// Context around the current card (0.3.2): a step, a click or a jump leaves the rail alone while the
// current card and the cards either side of it show whole; once one of them would be cut, the rail
// centres the current card, which the browser clamps at either end of the rail. Cards are 90px
// every 100px in a 1000px rail, as above; scrolling clamps as a browser's does.
describe('plugin-thumbnails — context around the current card', () => {
  const EXTENT = 1000
  let rail: HTMLElement
  let scroll = 0
  const box = (start: number, axis: 'x' | 'y') =>
    (axis === 'x'
      ? { left: start, right: start + 90, top: 0, bottom: 80, width: 90, height: 80 }
      : { top: start, bottom: start + 90, left: 0, right: 80, width: 80, height: 90 }) as DOMRect
  // `at(k)`: where the k-th card starts at scroll 0; cards are `sel` in rail order
  const layOut = (
    axis: 'x' | 'y',
    sel: string,
    at: (k: number) => number,
    { rtl = false } = {},
  ) => {
    rail = document.querySelector('.gallerist-thumbs') as HTMLElement
    scroll = 0
    if (axis === 'x') rail.style.overflowX = 'auto'
    else rail.style.overflowY = 'auto'
    const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop'
    const cards = () => [...rail.querySelectorAll<HTMLElement>(sel)]
    // as far as the drawn cards reach (toward negative scrollLeft in a right-to-left rail)
    const max = () => {
      const n = cards().length
      return n ? Math.max(0, (n - 1) * 100 + 90 - EXTENT) : 0
    }
    Object.defineProperty(rail, prop, {
      configurable: true,
      get: () => scroll,
      set: (v: number) => {
        scroll = rtl ? Math.min(0, Math.max(-max(), v)) : Math.max(0, Math.min(max(), v))
      },
    })
    const real = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === rail)
        return (
          axis === 'x'
            ? { left: 0, right: EXTENT, top: 0, bottom: 100, width: EXTENT, height: 100 }
            : { top: 0, bottom: EXTENT, left: 0, right: 100, width: 100, height: EXTENT }
        ) as DOMRect
      const k = cards().indexOf(this)
      return k < 0 ? real.call(this) : box(at(k) - scroll, axis)
    })
  }
  const many = (n: number, per = 1): Collection => ({
    groups: Array.from({ length: n }, (_, g) => ({
      id: `g${g}`,
      items: Array.from({ length: per }, (_, i) => item(`g${g}i${i}`)),
    })),
  })
  // the card's extent along the rail
  const span = (el: Element | null, axis: 'x' | 'y' = 'x') => {
    const r = el?.getBoundingClientRect()
    if (!r) return null
    return axis === 'x' ? [r.left, r.right] : [r.top, r.bottom]
  }
  const whole = (el: Element | null, axis: 'x' | 'y' = 'x') => {
    const s = span(el, axis)
    return !!s && (s[0] as number) >= 0 && (s[1] as number) <= EXTENT
  }
  const group = (g: number) => document.querySelector(`.gallerist-thumb[data-group="g${g}"]`)
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('dir')
  })

  it('a step keeps the next card in view: the rail centres the current one before it is cut', () => {
    // every card drawn: the walk below measures against fixed positions
    const v = createViewer({ collection: many(30), plugins: [thumbnails({ overscan: 50 })] })
    mount(v)
    v.open()
    layOut('x', '.gallerist-thumb', (k) => k * 100)
    v.goTo(8) // 800..890; g9 900..990 shows whole
    expect(scroll).toBe(0)
    v.next() // g9: g10 (1000..1090) would be cut
    expect(scroll).toBe(445) // g9's middle (945) on the rail's (500)
    expect(whole(group(10))).toBe(true)
    v.next() // g10 at 555..645, its neighbours show: nothing moves
    expect(scroll).toBe(445)
    for (let g = 11; g < 30; g++) {
      v.next()
      expect(whole(group(g)), `g${g}`).toBe(true)
      if (g < 29) expect(whole(group(g + 1)), `after g${g}`).toBe(true)
      expect(whole(group(g - 1)), `before g${g}`).toBe(true)
    }
    // the end: the browser clamps the centring, the last card sits at the rail's end
    expect(scroll).toBe(29 * 100 + 90 - EXTENT)
    expect(span(group(29))?.[1]).toBe(EXTENT)
    // and back to the start: the card before it stays in view, clamped at the first card
    for (let g = 28; g >= 0; g--) {
      v.prev()
      if (g > 0) expect(whole(group(g - 1)), `before g${g}`).toBe(true)
    }
    expect(scroll).toBe(0)
  })

  it('a click on a card whose neighbours show moves nothing; one at the edge centres it', () => {
    open(many(30))
    layOut('x', '.gallerist-thumb', (k) => k * 100)
    ;(group(5) as HTMLElement).click()
    expect(document.querySelector('.gallerist-thumb[data-active]')).toBe(group(5))
    expect(scroll).toBe(0)
    ;(group(8) as HTMLElement).click()
    expect(scroll).toBe(0)
    ;(group(9) as HTMLElement).click() // the last card that shows whole: g10 is cut
    expect(scroll).toBe(445)
  })

  it('right to left: the same, toward negative scrollLeft', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    const v = open(many(30))
    // card k runs from the right edge leftwards
    layOut('x', '.gallerist-thumb', (k) => EXTENT - (k + 1) * 100 + 10, { rtl: true })
    v.goTo(8) // 110..200; g9 at 10..100 shows whole
    expect(scroll).toBe(0)
    v.next()
    expect(scroll).toBe(-445) // g9's middle (55) on the rail's (500)
    expect(whole(group(10))).toBe(true)
  })

  it('a side rail: down the column, by scrollTop', () => {
    const v = createViewer({ collection: many(30), plugins: [thumbnails()] })
    mount(v, { rail: 'left' })
    v.open()
    layOut('y', '.gallerist-thumb', (k) => k * 100)
    v.goTo(8)
    expect(scroll).toBe(0)
    v.next()
    expect(scroll).toBe(445)
    expect(whole(group(10), 'y')).toBe(true)
  })

  it('flat: the cards beside the current one are its neighbours in rail order, across groups', () => {
    const v = openFlat(many(10, 3))
    layOut('x', '.gallerist-thumb-item', (k) => k * 100)
    const card = (id: string) => document.querySelector(`.gallerist-thumb-item[data-item="${id}"]`)
    v.goTo(2, 2) // the 9th card (800..890): g3i0 after it shows whole
    expect(scroll).toBe(0)
    v.goTo(3, 0) // the 10th (900..990): g3i1 after it would be cut
    expect(scroll).toBe(445)
    expect(whole(card('g3i1'))).toBe(true)
    expect(whole(card('g2i2'))).toBe(true) // the card before it, in the group before
  })

  it('index chips: the same along the strip', () => {
    const v = createViewer({
      collection: many(30, 3),
      plugins: [thumbnails({ groupDisplay: 'index' })],
    })
    mount(v)
    v.open()
    layOut('x', '.gallerist-thumb-row', (k) => k * 100)
    v.goTo(8)
    expect(scroll).toBe(0)
    v.goTo(9)
    expect(scroll).toBe(445)
  })
})

describe('strip helpers', () => {
  const at = (left: number, top = 0) =>
    ({
      getBoundingClientRect: () =>
        ({ left, top, right: left + 50, bottom: top + 50, width: 50, height: 50 }) as DOMRect,
    }) as Element

  it('spanAround keeps the window full at either end', () => {
    expect(spanAround(50, 100, 3, 3)).toEqual([47, 53])
    expect(spanAround(1, 100, 3, 3)).toEqual([0, 6])
    expect(spanAround(99, 100, 3, 3)).toEqual([93, 99])
    expect(spanAround(2, 4, 3, 3)).toEqual([0, 3])
  })

  it('measureRun reads the smallest step along the axis, and how many cards share a step', () => {
    expect(measureRun([at(0), at(60), at(200), at(260)], 'x')).toEqual({ stride: 60, perLine: 1 })
    expect(measureRun([at(0, 0), at(0, 70), at(0, 140)], 'y')).toEqual({ stride: 70, perLine: 1 })
    // a flat rail down the side: rows of three across the axis
    const rows = [0, 1, 2, 3, 4, 5].map((k) => at((k % 3) * 60, Math.floor(k / 3) * 90))
    expect(measureRun(rows, 'y')).toEqual({ stride: 90, perLine: 3 })
    expect(measureRun([at(0), at(0)], 'x')).toBeNull() // no layout
    expect(measureRun([at(0)], 'x')).toBeNull()
  })

  it('axisOf reads the way the scroller runs, not the cards', () => {
    const rail = document.createElement('div')
    document.body.appendChild(rail)
    expect(axisOf(rail)).toBe('x')
    rail.style.flexDirection = 'column'
    expect(axisOf(rail)).toBe('y')
    rail.style.flexDirection = ''
    rail.style.overflowX = 'hidden'
    rail.style.overflowY = 'auto'
    expect(axisOf(rail)).toBe('y')
    // a block / grid box that scrolls both ways: the way its content overflows, else its longer side
    rail.style.overflowX = 'auto'
    const box = (sw: number, cw: number, sh: number, ch: number) => {
      for (const [k, v] of Object.entries({
        scrollWidth: sw,
        clientWidth: cw,
        scrollHeight: sh,
        clientHeight: ch,
      }))
        Object.defineProperty(rail, k, { get: () => v, configurable: true })
    }
    box(120, 100, 900, 300)
    expect(axisOf(rail)).toBe('y')
    box(900, 300, 120, 100)
    expect(axisOf(rail)).toBe('x')
    box(400, 400, 400, 400)
    expect(axisOf(rail)).toBe('x') // fits, as wide as tall: a row
    box(80, 80, 400, 400)
    expect(axisOf(rail)).toBe('y') // fits, taller than wide
    // a flex row (the theme's bottom rail: overflow-x auto, which makes overflow-y auto too) runs
    // along x whatever its box
    rail.style.display = 'flex'
    box(80, 80, 900, 400)
    expect(axisOf(rail)).toBe('x')
  })

  it('middleOf finds the card under the middle of the scroller, in any order', () => {
    const scroller = at(0)
    scroller.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 50 }) as DOMRect
    expect(middleOf(scroller, [at(0), at(100), at(200)], 'x')).toBe(1) // 100..150 holds the middle
    // right to left: the first card is the rightmost
    expect(middleOf(scroller, [at(250), at(200), at(150), at(100), at(50)], 'x')).toBe(2)
    // nothing under the middle (a gap, or every card off one side): the nearest centre
    expect(middleOf(scroller, [at(-500)], 'x')).toBe(0)
    expect(middleOf(scroller, [at(0), at(170), at(400)], 'x')).toBe(1)
  })

  it('keepPlace scrolls by however far the reference moved', () => {
    const scroller = document.createElement('div')
    let left = 100
    const ref = document.createElement('span')
    scroller.appendChild(ref)
    document.body.appendChild(scroller)
    ref.getBoundingClientRect = () => ({ left, top: 0 }) as DOMRect
    keepPlace(scroller, ref, 'x', () => {
      left = 340
    })
    expect(scroller.scrollLeft).toBe(240)
    keepPlace(scroller, ref, null, () => {}) // no axis measured yet: nothing to correct
    expect(scroller.scrollLeft).toBe(240)
  })
})

describe('plugin-thumbnails — live display switch (setDisplay)', () => {
  const timed = (): Collection => ({
    groups: [
      { id: 'g0', meta: { time: '09:00' }, items: [item('a0')] },
      { id: 'g1', meta: { time: '09:10' }, items: [item('b0'), item('b1'), item('b2')] },
      { id: 'g2', meta: { time: '09:20' }, items: [item('c0'), item('c1')] },
    ],
  })
  const railOf = (v: ReturnType<typeof createViewer>) =>
    getInternals(v)
      .getPlugins()
      .find((p) => p.name === 'thumbnails') as ThumbnailsInstance
  const setup = (
    opts?: Parameters<typeof thumbnails>[0],
    mountOpts: Parameters<typeof mount>[1] = {},
  ) => {
    const v = createViewer({ collection: timed(), plugins: [thumbnails(opts)] })
    mount(v, mountOpts)
    v.open()
    return { v, rail: railOf(v) }
  }
  const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
  const root = () => q('.gallerist') as HTMLElement
  const counter = () => q('.gallerist-counter')?.textContent
  const itemNavHidden = () => (q('.gallerist-itemnav') as HTMLElement).hidden
  const nums = () =>
    [...document.querySelectorAll('.gallerist-thumb-num')].map((n) => n.textContent)
  const press = (key: string) =>
    root().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

  it('stacked → flat: the current item stays, the rail lays every item out, traversal turns linear', () => {
    const { v, rail } = setup()
    v.goTo(1, 1)
    expect(rail.display).toBe('stacked')
    expect(counter()).toBe('2 / 3')
    rail.setDisplay('flat')
    expect(rail.display).toBe('flat')
    expect(v.getState().cursor).toMatchObject({ g: 1, i: 1 })
    expect(q('.gallerist-thumbs')?.getAttribute('data-display')).toBe('flat')
    expect(document.querySelectorAll('.gallerist-thumb').length).toBe(0) // no group cards left
    expect(document.querySelectorAll('.gallerist-thumbs .gallerist-thumb-item').length).toBe(6)
    expect(q('.gallerist-thumb-item[data-active]')?.getAttribute('data-item')).toBe('b1')
    expect(q('.gallerist-thumb-group[data-active]')?.getAttribute('data-group')).toBe('g1')
    // the renderer read the marker again: linear, the counter counts items, no item navigator
    expect(q('.gallerist-thumbs-region')?.hasAttribute('data-gallerist-linear')).toBe(true)
    expect(root().getAttribute('data-gallerist-linear')).toBe('true')
    expect(counter()).toBe('3 / 6')
    expect(itemNavHidden()).toBe(true)
    // no item panel or toggle on a flat rail; the aside column is put away
    expect(q('.gallerist-thumb-items')).toBeNull()
    expect(q('.gallerist-items-toggle')?.hidden).toBe(true)
    expect(q('.gallerist-thumbs-aside')?.hidden).toBe(true)
    // ←/→ walk the items across the group boundary
    press('ArrowRight')
    press('ArrowRight')
    expect(v.getState().cursor).toMatchObject({ g: 2, i: 0 })
    expect(q('.gallerist-thumb-item[data-active]')?.getAttribute('data-item')).toBe('c0')
  })

  it('flat → stacked: group cards, the item stack in the aside column, the two axes back', () => {
    const { v, rail } = setup()
    rail.setDisplay('flat')
    v.goTo(2, 1)
    rail.setDisplay('stacked')
    expect(v.getState().cursor).toMatchObject({ g: 2, i: 1 })
    expect(q('.gallerist-thumbs')?.hasAttribute('data-display')).toBe(false)
    expect(document.querySelectorAll('.gallerist-thumb').length).toBe(3)
    expect(q('.gallerist-thumb[data-active]')?.getAttribute('data-group')).toBe('g2')
    expect(q('.gallerist-region-aside .gallerist-thumb-items')).not.toBeNull()
    expect(q('.gallerist-thumb-item[data-active]')?.getAttribute('data-item')).toBe('c1')
    expect(q('.gallerist-thumbs-aside')?.hidden).toBe(false)
    expect(q('.gallerist-items-toggle')?.hidden).toBe(false)
    expect(q('.gallerist-thumbs-region')?.hasAttribute('data-gallerist-linear')).toBe(false)
    expect(root().hasAttribute('data-gallerist-linear')).toBe(false)
    expect(counter()).toBe('3 / 3')
    expect(itemNavHidden()).toBe(false)
    press('ArrowUp') // the item axis is back
    expect(v.getState().cursor).toMatchObject({ g: 2, i: 0 })
  })

  it('back and forth many times leaves one rail and no stray nodes', () => {
    const { v, rail } = setup()
    v.goTo(1, 2)
    for (let k = 0; k < 5; k++) {
      rail.setDisplay('flat')
      rail.setDisplay('stacked')
    }
    expect(document.querySelectorAll('.gallerist-thumbs').length).toBe(1)
    expect(document.querySelectorAll('.gallerist-thumbs-region').length).toBe(1)
    expect(document.querySelectorAll('.gallerist-thumb-items').length).toBe(1)
    expect(document.querySelectorAll('.gallerist-thumb-group').length).toBe(0)
    expect(document.querySelectorAll('.gallerist-items-toggle').length).toBe(1)
    expect(document.querySelectorAll('.gallerist-thumb[data-active]').length).toBe(1)
    expect(q('.gallerist-thumb-item[data-active]')?.getAttribute('data-item')).toBe('b2')
  })

  it('keeps the preset rules: the reviewer’s timeline carries into flat, its numbering does not', () => {
    const { v, rail } = setup(undefined, { preset: 'reviewer' })
    v.goTo(1, 0)
    expect(nums()).toEqual(['1', '2', '3'])
    rail.setDisplay('flat')
    expect(q('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
    expect(
      [...document.querySelectorAll('.gallerist-thumb-group-cap')].map((c) => c.textContent),
    ).toEqual(['09:00', '09:10', '09:20'])
    expect(nums()).toEqual([]) // numberItems belongs to the reviewer's stacked rail
    rail.setDisplay('stacked')
    expect(q('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(true)
    expect(nums()).toEqual(['1', '2', '3']) // its own display again: the numbers come back
  })

  it('an option the host passed still wins after a switch', () => {
    const { rail } = setup({ numberItems: true, timeline: false }, { preset: 'reviewer' })
    rail.setDisplay('flat')
    expect(q('.gallerist-thumbs')?.hasAttribute('data-timeline')).toBe(false)
    expect(nums().length).toBe(6) // explicit numbering stays on the flat rail
  })

  it('an explicit mount({ linear: false }) keeps the two axes under a switched-in flat rail', () => {
    const { v, rail } = setup(undefined, { linear: false })
    v.goTo(1, 0)
    rail.setDisplay('flat')
    expect(root().hasAttribute('data-gallerist-linear')).toBe(false)
    expect(counter()).toBe('2 / 3')
    expect(itemNavHidden()).toBe(false)
  })

  it('while zoomed: the zoom and the item stay', () => {
    const { v, rail } = setup()
    v.goTo(1, 1)
    v.zoomTo(2)
    const zoom = { ...v.getState().zoom }
    rail.setDisplay('flat')
    expect(v.getState().zoom).toEqual(zoom)
    expect(v.getState().cursor).toMatchObject({ g: 1, i: 1 })
    rail.setDisplay('stacked')
    expect(v.getState().zoom).toEqual(zoom)
  })

  it('a rail that starts flat can switch to stacked, with the aside column and the toggle', () => {
    const { v, rail } = setup({ groupDisplay: 'flat' })
    expect(rail.display).toBe('flat')
    v.goTo(1, 0)
    rail.setDisplay('stacked')
    expect(q('.gallerist-region-aside .gallerist-thumb-items')?.getAttribute('data-axis')).toBe(
      'vertical',
    )
    expect(q('.gallerist-items-toggle')?.hidden).toBe(false)
    press('e') // the toggle's key works on the switched-in panel
    expect(q('.gallerist-thumb-items')).toBeNull()
  })

  it('switches to and from a section index', () => {
    const { v, rail } = setup()
    v.goTo(2, 0)
    rail.setDisplay('index')
    expect(q('.gallerist-thumbs')?.getAttribute('data-display')).toBe('index')
    expect(q('.gallerist-thumbs')?.getAttribute('role')).toBe('group')
    expect(document.querySelectorAll('.gallerist-thumb-row').length).toBe(3)
    expect(q('.gallerist-thumb-section[data-group="g2"] .gallerist-thumb-items')).not.toBeNull()
    expect(q('.gallerist-thumbs-aside')?.hidden).toBe(true)
    rail.setDisplay('stacked')
    expect(q('.gallerist-thumbs')?.getAttribute('role')).toBe('listbox')
    expect(document.querySelectorAll('.gallerist-thumb-row').length).toBe(0)
    expect(q('.gallerist-region-aside .gallerist-thumb-items')).not.toBeNull()
  })

  it('a focused thumb the switch takes out hands focus to the viewer; so does the hidden toggle', () => {
    const { rail } = setup()
    ;(q('.gallerist-thumb[data-group="g1"]') as HTMLElement).focus()
    rail.setDisplay('flat')
    expect(document.activeElement).toBe(root())
    rail.setDisplay('stacked')
    ;(q('.gallerist-items-toggle') as HTMLElement).focus()
    rail.setDisplay('flat')
    expect(document.activeElement).toBe(root())
  })

  it('the same display, or an unknown one, changes nothing', () => {
    const { rail } = setup()
    const before = q('.gallerist-thumb[data-group="g0"]')
    rail.setDisplay('stacked')
    rail.setDisplay('grid' as never)
    expect(rail.display).toBe('stacked')
    expect(q('.gallerist-thumb[data-group="g0"]')).toBe(before) // not drawn again
  })

  it('before the rail mounts, setDisplay sets the display it mounts with', () => {
    const v = createViewer({ collection: timed(), plugins: [thumbnails()] })
    const rail = railOf(v)
    expect(rail.display).toBeUndefined()
    rail.setDisplay('flat')
    expect(rail.display).toBeUndefined()
    mount(v)
    v.open()
    expect(rail.display).toBe('flat')
    expect(q('.gallerist-thumbs')?.getAttribute('data-display')).toBe('flat')
    expect(root().getAttribute('data-gallerist-linear')).toBe('true')
  })

  it('setGroupDisplay / getGroupDisplay: the viewer’s rail, kept for a later mount', () => {
    const v = createViewer({ collection: timed(), plugins: [thumbnails()] })
    expect(getGroupDisplay(v)).toBeUndefined() // not mounted
    const first = mount(v)
    v.open()
    expect(getGroupDisplay(v)).toBe('stacked')
    expect(setGroupDisplay(v, 'flat')).toBe(true)
    expect(getGroupDisplay(v)).toBe('flat')
    expect(root().getAttribute('data-gallerist-linear')).toBe('true')
    first.destroy()
    mount(v)
    expect(getGroupDisplay(v)).toBe('flat')
    expect(q('.gallerist-thumbs')?.getAttribute('data-display')).toBe('flat')
  })

  it('setGroupDisplay on a viewer without a rail does nothing and says so', () => {
    const v = createViewer({ collection: timed() })
    mount(v)
    const dispose = v.use(thumbnails())
    v.open()
    dispose()
    expect(setGroupDisplay(v, 'flat')).toBe(false)
    expect(getGroupDisplay(v)).toBeUndefined()
    expect(q('.gallerist-thumbs')).toBeNull()
  })

  it('setGroupDisplay switches only the rail that shows (the last registered)', () => {
    const v = createViewer({ collection: timed(), plugins: [thumbnails(), thumbnails()] })
    mount(v)
    v.open()
    const [hidden, shown] = getInternals(v)
      .getPlugins()
      .filter((p) => p.name === 'thumbnails') as ThumbnailsInstance[]
    const switched = vi.spyOn(hidden as ThumbnailsInstance, 'setDisplay')
    expect(setGroupDisplay(v, 'flat')).toBe(true)
    expect(shown?.display).toBe('flat')
    expect(switched).not.toHaveBeenCalled()
    expect(hidden?.display).toBe('stacked')
  })

  it('a flat rail leaves `e` to another plugin; a switched-in stacked rail takes it back', () => {
    const e = vi.fn()
    // listed before the rail: on a key both map, the later plugin wins
    const v = createViewer({
      collection: timed(),
      plugins: [() => ({ name: 'other', keymap: { e } }), thumbnails({ groupDisplay: 'flat' })],
    })
    mount(v)
    v.open()
    press('e')
    expect(e).toHaveBeenCalledTimes(1)
    setGroupDisplay(v, 'stacked')
    const toggle = q('.gallerist-items-toggle') as HTMLElement
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    press('e') // the rail's again: its item panel
    expect(e).toHaveBeenCalledTimes(1)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    setGroupDisplay(v, 'flat')
    press('e')
    expect(e).toHaveBeenCalledTimes(2)
  })

  it('a flat rail’s kept toggle is marked off (the bar doesn’t show for it alone); stacked, it isn’t', () => {
    const { rail } = setup({ groupDisplay: 'flat' }, { controls: false })
    const toggle = q('.gallerist-items-toggle') as HTMLElement
    const bar = q('.gallerist-bar') as HTMLElement
    expect(toggle.hasAttribute('data-gallerist-off')).toBe(true)
    expect(bar.hidden).toBe(true)
    rail.setDisplay('stacked')
    expect(toggle.hasAttribute('data-gallerist-off')).toBe(false)
    expect(toggle.hidden).toBe(false)
    expect(bar.hidden).toBe(false)
  })
})
