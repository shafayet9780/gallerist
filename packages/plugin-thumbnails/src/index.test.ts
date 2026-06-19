// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thumbnails } from './index'

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
    const rail = document.querySelector('.visora-region-thumbnails .visora-thumbs')
    expect(rail).not.toBeNull()
    expect(rail?.querySelectorAll('.visora-thumb').length).toBe(3)
  })

  it('marks the active group and tracks the cursor', () => {
    const v = open()
    expect(document.querySelector('.visora-thumb[data-active]')?.getAttribute('data-group')).toBe(
      'g0',
    )
    v.next()
    expect(document.querySelector('.visora-thumb[data-active]')?.getAttribute('data-group')).toBe(
      'g1',
    )
  })

  it('clicking a group thumb navigates', () => {
    const v = open()
    const g2 = document.querySelector('.visora-thumb[data-group="g2"]') as HTMLButtonElement
    g2.click()
    expect(v.getState().cursor.g).toBe(2)
  })

  it('multi-item groups get a stacked card + count badge', () => {
    open()
    const g1 = document.querySelector('.visora-thumb[data-group="g1"]')
    expect(g1?.classList.contains('visora-thumb-stacked')).toBe(true)
    expect(g1?.querySelector('.visora-thumb-count')?.textContent).toBe('3')
  })

  it('shows the count badge only on grouped (multi-item) cards', () => {
    open()
    expect(document.querySelector('.visora-thumb[data-group="g0"] .visora-thumb-count')).toBeNull() // single item → no badge
    expect(
      document.querySelector('.visora-thumb[data-group="g2"] .visora-thumb-count')?.textContent,
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
      document.querySelector('.visora-thumb[data-group="g0"] .visora-thumb-caption')?.textContent,
    ).toBe('Morning')
    expect(
      document.querySelector('.visora-thumb[data-group="g1"] .visora-thumb-caption'),
    ).toBeNull()
  })

  it('renders item captions only when provided', () => {
    open({
      groups: [{ id: 'g1', items: [{ ...item('b0'), caption: 'First screen' }, item('b1')] }],
    })
    const items = document.querySelectorAll('.visora-thumb-item')
    expect(items[0]?.querySelector('.visora-thumb-caption')?.textContent).toBe('First screen')
    expect(items[1]?.querySelector('.visora-thumb-caption')).toBeNull()
  })

  it('expands the active multi-item group into item thumbs; clicking an item navigates', () => {
    const v = open()
    v.next() // g1 (3 items) active
    const items = document.querySelectorAll('.visora-thumb-items .visora-thumb-item')
    expect(items.length).toBe(3)
    ;(items[2] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('does no work on a non-cursor state change (zoom)', () => {
    const v = open()
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.zoomTo(2) // changes zoom state, not cursor/collection → render must early-return
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not tear down the rail (replaceChildren on root) for cursor moves', () => {
    const v = open()
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.next() // group move
    v.open({ g: 1 })
    v.nextItem() // item move
    expect(spy).not.toHaveBeenCalled() // reconciled in place, never wiped
  })

  it('reconciles item nav in place: stable node identity, active flips, scrolls into view', () => {
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {}
    }
    const v = open()
    v.next() // g1 (3 items) active
    const groupBefore = document.querySelector('.visora-thumb[data-group="g1"]')
    const itemsBefore = [...document.querySelectorAll('.visora-thumb-item')]
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')

    v.nextItem() // i: 0 → 1, same group — must NOT rebuild

    const itemsAfter = [...document.querySelectorAll('.visora-thumb-item')]
    expect(itemsAfter[0]).toBe(itemsBefore[0]) // same nodes, no teardown
    expect(itemsAfter[1]).toBe(itemsBefore[1])
    expect(document.querySelector('.visora-thumb[data-group="g1"]')).toBe(groupBefore)
    expect(
      document.querySelector('.visora-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b1')
    expect(scrollSpy).toHaveBeenCalled()
    scrollSpy.mockRestore()
  })

  it('the expanded item row is its own listbox (host-mounted sibling of the rail)', () => {
    const v = open()
    v.next() // g1 active → item row appears
    expect(document.querySelector('.visora-thumb-items')?.getAttribute('role')).toBe('listbox')
  })

  it('lays the item column out vertically by default (matches ↑/↓ input)', () => {
    const v = open()
    v.next() // g1 active
    const col = document.querySelector('.visora-thumb-items')
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
    const col = document.querySelector('.visora-thumb-items')
    expect(col?.getAttribute('data-axis')).toBe('horizontal')
    expect(col?.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('live-previews the current item on the active group card', () => {
    const v = open()
    v.next() // g1 active (b0,b1,b2)
    const img = document.querySelector(
      '.visora-thumb[data-group="g1"] .visora-thumb-img',
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
      '.visora-thumb[data-group="g1"] .visora-thumb-img',
    ) as HTMLImageElement
    expect(img.src || img.dataset.src).toContain('b0.jpg')
  })

  it('wires the thumb url for lazy loading', () => {
    open()
    const img = document.querySelector('.visora-thumb .visora-thumb-img') as HTMLImageElement
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
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    expect(rail.querySelectorAll('.visora-thumb').length).toBe(2)
    expect(rail.querySelector('.visora-thumb[data-group="g0"]')).toBeNull() // old ids gone
    expect(rail.querySelector('.visora-thumb[data-active]')?.getAttribute('data-group')).toBe('x0')
  })

  it('keeps the rail bounded after a full traversal (no cover-cache leak)', () => {
    const big: Collection = {
      groups: Array.from({ length: 400 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    const v = open(big)
    for (let i = 0; i < 400; i++) v.goTo(i) // walk the whole collection
    // windowed rail stays bounded even though every group was visited once
    expect(document.querySelectorAll('.visora-thumb').length).toBeLessThanOrEqual(49)
  })

  it('windows the rail: a 10k-group collection stays bounded to the window', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    open(big)
    // default overscan 24 → at most 2*24+1 group thumbs live; tight bound catches a windowing regression
    expect(document.querySelectorAll('.visora-thumb').length).toBeLessThanOrEqual(49)
  })
})

describe('plugin-thumbnails — peek flyout (stacked)', () => {
  it("hovering a multi-item card opens a peek with that group's items, no cursor change", () => {
    const v = open() // cursor g0
    const g1 = document.querySelector('.visora-thumb[data-group="g1"]') as HTMLElement
    fire(g1, 'mouseenter')
    const peek = document.querySelector('.visora-thumb-peek')
    expect(peek?.getAttribute('role')).toBe('listbox')
    expect(peek?.querySelectorAll('.visora-thumb-item').length).toBe(3)
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 }) // hover never moves the cursor
  })

  it('clicking a peek item navigates and closes the peek', () => {
    const v = open() // cursor g0
    fire(document.querySelector('.visora-thumb[data-group="g2"]') as HTMLElement, 'mouseenter')
    const items = document.querySelectorAll('.visora-thumb-peek .visora-thumb-item')
    expect(items.length).toBe(2)
    ;(items[1] as HTMLButtonElement).click()
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 })
    expect(document.querySelector('.visora-thumb-peek')).toBeNull() // group now active → peek closed
  })

  it('does not open a peek for a single-item group', () => {
    open()
    fire(document.querySelector('.visora-thumb[data-group="g0"]') as HTMLElement, 'mouseenter')
    expect(document.querySelector('.visora-thumb-peek')).toBeNull()
  })

  it('does not double-render: hovering the active group shows no peek (its column is already up)', () => {
    const v = open()
    v.next() // g1 active → its item column is shown
    fire(document.querySelector('.visora-thumb[data-group="g1"]') as HTMLElement, 'mouseenter')
    expect(document.querySelector('.visora-thumb-peek')).toBeNull()
  })

  it('closes the peek on mouseleave (debounced)', () => {
    open()
    const g1 = document.querySelector('.visora-thumb[data-group="g1"]') as HTMLElement
    fire(g1, 'mouseenter')
    expect(document.querySelector('.visora-thumb-peek')).not.toBeNull()
    vi.useFakeTimers()
    fire(g1, 'mouseleave')
    vi.advanceTimersByTime(200)
    vi.useRealTimers()
    expect(document.querySelector('.visora-thumb-peek')).toBeNull()
  })

  it('opens the peek on keyboard focus (passive preview)', () => {
    open()
    fire(document.querySelector('.visora-thumb[data-group="g1"]') as HTMLElement, 'focusin')
    expect(
      document.querySelector('.visora-thumb-peek')?.querySelectorAll('.visora-thumb-item').length,
    ).toBe(3)
  })

  it('touch (no hover): a multi-item card exposes an expand affordance and tap navigates without peek', () => {
    stubHover(false)
    const v = open() // cursor g0
    const expand = document.querySelector(
      '.visora-thumb[data-group="g1"] ~ .visora-thumb-expand, .visora-thumb-wrap[data-group="g1"] .visora-thumb-expand',
    )
    expect(expand).not.toBeNull() // caret affordance present on touch
    ;(document.querySelector('.visora-thumb[data-group="g2"]') as HTMLElement).click()
    expect(v.getState().cursor.g).toBe(2) // first tap still navigates
  })

  it('touch (no hover): tapping the expand affordance opens the peek for a non-active group', () => {
    stubHover(false)
    open() // g0 active
    const expand = document.querySelector(
      '.visora-thumb-wrap[data-group="g1"] .visora-thumb-expand',
    ) as HTMLButtonElement
    expand.click()
    expect(
      document.querySelector('.visora-thumb-peek')?.querySelectorAll('.visora-thumb-item').length,
    ).toBe(3)
  })
})

describe('plugin-thumbnails — flat rail (groupDisplay: flat)', () => {
  it('renders one card per item, wrapped one bordered container per group', () => {
    openFlat()
    const wraps = document.querySelectorAll(
      '.visora-thumbs[data-display="flat"] .visora-thumb-group',
    )
    expect(wraps.length).toBe(3) // g0, g1, g2
    expect(document.querySelectorAll('.visora-thumb-item').length).toBe(6) // 1 + 3 + 2
    expect(wraps[0]?.getAttribute('role')).toBe('group')
  })

  it('shows a group caption header only when provided', () => {
    openFlat({
      groups: [
        { id: 'g0', caption: 'Morning', items: [item('a0'), item('a1')] },
        { id: 'g1', items: [item('b0'), item('b1')] },
      ],
    })
    expect(
      document.querySelector('.visora-thumb-group[data-group="g0"] .visora-thumb-group-cap')
        ?.textContent,
    ).toBe('Morning')
    expect(
      document.querySelector('.visora-thumb-group[data-group="g1"] .visora-thumb-group-cap'),
    ).toBeNull()
  })

  it('clicking an item card navigates', () => {
    const v = openFlat()
    const c1 = document.querySelector('.visora-thumb-item[data-item="b2"]') as HTMLButtonElement
    c1.click()
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('marks the active item and tracks the cursor', () => {
    const v = openFlat()
    expect(
      document.querySelector('.visora-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('a0')
    v.next() // g1, i0
    expect(
      document.querySelector('.visora-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b0')
    v.nextItem() // g1, i1
    expect(
      document.querySelector('.visora-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('b1')
  })

  it('reconciles cursor moves in place (no replaceChildren, stable identity)', () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const v = openFlat()
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    const before = [...document.querySelectorAll('.visora-thumb-item')]
    v.next()
    v.nextItem()
    const after = [...document.querySelectorAll('.visora-thumb-item')]
    expect(after[0]).toBe(before[0]) // same nodes, never torn down
    expect(spy).not.toHaveBeenCalled()
  })

  it('does no work on a non-cursor change (zoom)', () => {
    const v = openFlat()
    const rail = document.querySelector('.visora-thumbs') as HTMLElement
    const spy = vi.spyOn(rail, 'replaceChildren')
    v.zoomTo(2)
    expect(spy).not.toHaveBeenCalled()
  })

  it('windows the flattened item sequence: 10k single-item groups stay bounded', () => {
    const big: Collection = {
      groups: Array.from({ length: 10_000 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    openFlat(big)
    expect(document.querySelectorAll('.visora-thumb-item').length).toBeLessThanOrEqual(49)
  })

  it('windows a single giant group: one 10k-item group stays bounded (pathological case)', () => {
    const big: Collection = {
      groups: [{ id: 'g0', items: Array.from({ length: 10_000 }, (_, i) => item(`it${i}`)) }],
    }
    openFlat(big)
    expect(document.querySelectorAll('.visora-thumb-item').length).toBeLessThanOrEqual(49)
    const wrap = document.querySelector('.visora-thumb-group[data-group="g0"]')
    expect(wrap).not.toBeNull()
    expect(wrap?.hasAttribute('data-partial-end')).toBe(true) // tail of the group is out of the window
  })

  it('stays bounded after a full flat traversal (no leak)', () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const big: Collection = {
      groups: Array.from({ length: 400 }, (_, i) => ({ id: `g${i}`, items: [item(`it${i}`)] })),
    }
    const v = openFlat(big)
    for (let i = 0; i < 400; i++) v.goTo(i)
    expect(document.querySelectorAll('.visora-thumb-item').length).toBeLessThanOrEqual(49)
  })

  it('swaps to a disjoint collection cleanly', () => {
    const v = openFlat()
    v.setCollection({
      groups: [
        { id: 'x0', items: [item('x0a')] },
        { id: 'x1', items: [item('x1a'), item('x1b')] },
      ],
    })
    expect(document.querySelectorAll('.visora-thumb-item').length).toBe(3)
    expect(document.querySelector('.visora-thumb-item[data-item="a0"]')).toBeNull() // old ids gone
    expect(
      document.querySelector('.visora-thumb-item[data-active]')?.getAttribute('data-item'),
    ).toBe('x0a')
  })
})

describe('plugin-thumbnails — active item panel (expandActive)', () => {
  it('default: active multi-item group auto-shows its item panel (un-clipped, in the region wrapper)', () => {
    const v = open()
    v.next() // g1 (3 items)
    const panel = document.querySelector('.visora-thumb-items')
    expect(panel?.querySelectorAll('.visora-thumb-item').length).toBe(3)
    // a sibling of the rail inside the region wrapper, NOT inside the clipping `.visora-thumbs` rail
    expect(panel?.closest('.visora-thumbs')).toBeNull()
    expect(panel?.closest('.visora-thumbs-region')).not.toBeNull()
  })

  it('keeps the item panel through a late viewer.use() (region remount replaceChildren)', () => {
    const v = open()
    v.next() // g1 active, panel shown
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
    v.use(() => ({ name: 'probe' })) // triggers onPluginsChanged → renderer re-mounts all regions
    expect(
      document.querySelector('.visora-thumb-items')?.querySelectorAll('.visora-thumb-item').length,
    ).toBe(3)
  })

  it('tearing down the renderer removes the item panel (no orphan left on the region)', () => {
    const v = createViewer({ collection: collection(), plugins: [thumbnails()] })
    const handle = mount(v)
    v.open()
    v.next() // panel shown
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
    handle.destroy()
    expect(document.querySelector('.visora-thumb-items')).toBeNull()
  })

  it('toolbar items-toggle hides and shows the panel; aria-pressed tracks it', () => {
    const v = open()
    v.next()
    const btn = document.querySelector('.visora-items-toggle') as HTMLButtonElement
    expect(btn?.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
    btn.click()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('.visora-thumb-items')).toBeNull()
    btn.click()
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
  })

  it('the `e` key toggles the panel through the renderer keymap', () => {
    const v = open()
    v.next()
    const rootEl = document.querySelector('.visora') as HTMLElement
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
    rootEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect(document.querySelector('.visora-thumb-items')).toBeNull()
    rootEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
  })

  it('expandActive: false keeps the panel hidden until toggled on', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [thumbnails({ expandActive: false })],
    })
    mount(v)
    v.open()
    v.next() // g1
    expect(document.querySelector('.visora-thumb-items')).toBeNull()
    ;(document.querySelector('.visora-items-toggle') as HTMLButtonElement).click()
    expect(document.querySelector('.visora-thumb-items')).not.toBeNull()
  })

  it('peeks the active card once its panel is hidden (point 1)', () => {
    const v = open()
    v.next() // g1 active, panel shown
    fire(document.querySelector('.visora-thumb[data-group="g1"]') as HTMLElement, 'mouseenter')
    expect(document.querySelector('.visora-thumb-peek')).toBeNull() // panel up → no double
    ;(document.querySelector('.visora-items-toggle') as HTMLButtonElement).click() // hide panel
    fire(document.querySelector('.visora-thumb[data-group="g1"]') as HTMLElement, 'mouseenter')
    expect(
      document.querySelector('.visora-thumb-peek')?.querySelectorAll('.visora-thumb-item').length,
    ).toBe(3)
  })

  it('panel-hidden state persists across group navigation', () => {
    const v = open()
    v.next() // g1, panel shown
    ;(document.querySelector('.visora-items-toggle') as HTMLButtonElement).click() // hide
    v.next() // g2 (2 items)
    expect(document.querySelector('.visora-thumb-items')).toBeNull()
  })

  it('flat mode contributes no items-toggle button', () => {
    openFlat()
    expect(document.querySelector('.visora-items-toggle')).toBeNull()
  })
})
