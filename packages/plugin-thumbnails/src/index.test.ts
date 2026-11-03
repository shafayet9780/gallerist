// @vitest-environment happy-dom

import { type Collection, type Item, createViewer } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { type PresetName, mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thumbnails } from './index'
import { keepPlace, measureRun, middleOf, spanAround } from './strip'

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

  it('shows a group caption header only when provided', () => {
    openFlat({
      groups: [
        { id: 'g0', caption: 'Morning', items: [item('a0'), item('a1')] },
        { id: 'g1', items: [item('b0'), item('b1')] },
      ],
    })
    expect(
      document.querySelector('.gallerist-thumb-group[data-group="g0"] .gallerist-thumb-group-cap')
        ?.textContent,
    ).toBe('Morning')
    expect(
      document.querySelector('.gallerist-thumb-group[data-group="g1"] .gallerist-thumb-group-cap'),
    ).toBeNull()
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

  it('flat mode contributes no items-toggle button', () => {
    openFlat()
    expect(document.querySelector('.gallerist-items-toggle')).toBeNull()
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

  it('no timeline row without the option, or in flat mode', () => {
    openWith({})
    expect(document.querySelector('.gallerist-thumb-time')).toBeNull()
    document.body.innerHTML = ''
    openWith({ timeline: true, groupDisplay: 'flat' })
    expect(document.querySelector('.gallerist-thumb-time')).toBeNull()
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
      expect(document.querySelector('.gallerist-region-aside')?.childElementCount).toBe(0)
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
  })

  describe('scrolling', () => {
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect

    it('brings the active item into view inside its panel', () => {
      const v = open()
      v.next()
      const panel = document.querySelector('.gallerist-thumb-items') as HTMLElement
      panel.style.overflowY = 'auto'
      panel.getBoundingClientRect = () => rect(0, 100)
      const second = panel.querySelector('[data-item="b1"]') as HTMLElement
      second.getBoundingClientRect = () => rect(150, 200)
      v.nextItem()
      expect(panel.scrollTop).toBe(100)
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
      expect(document.querySelector('.gallerist-thumbs-aside')).toBeNull()
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

  it('measureRun reads the axis and the smallest step', () => {
    expect(measureRun([at(0), at(60), at(200), at(260)])).toEqual({ axis: 'x', stride: 60 })
    expect(measureRun([at(0, 0), at(0, 70), at(0, 140)])).toEqual({ axis: 'y', stride: 70 })
    expect(measureRun([at(0), at(0)])).toBeNull() // no layout
    expect(measureRun([at(0)])).toBeNull()
  })

  it('middleOf finds the card under the middle of the scroller', () => {
    const scroller = at(0)
    scroller.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 50 }) as DOMRect
    expect(middleOf(scroller, [at(0), at(100), at(200)], 'x')).toBe(1) // 100..150 reaches the middle
    expect(middleOf(scroller, [at(-500)], 'x')).toBe(0)
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
