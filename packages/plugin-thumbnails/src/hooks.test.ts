// @vitest-environment happy-dom

// The host hooks: group decorations (renderGroupMeta), item badges (renderItemBadge), clusters
// (cluster), markers between groups (markers) and refreshRail().
import { type Collection, type Item, createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type GroupMetaContext,
  type RailMarker,
  type ThumbnailsOptions,
  refreshRail,
  setGroupDisplay,
  thumbnails,
} from './index'

const item = (id: string, meta?: unknown): Item => ({
  id,
  type: 'image',
  source: `${id}.jpg`,
  meta,
})
// two monitors per capture: g1 holds captures 1 and 2, each on screens 1 and 2
const collection = (): Collection => ({
  groups: [
    { id: 'g0', meta: { time: '10:00', activity: 64 }, items: [item('a0', { cap: 1, screen: 1 })] },
    {
      id: 'g1',
      meta: { time: '10:10', activity: 23 },
      items: [
        item('b0', { cap: 1, screen: 1 }),
        item('b1', { cap: 1, screen: 2 }),
        item('b2', { cap: 2, screen: 1 }),
        item('b3', { cap: 2, screen: 2 }),
      ],
    },
    { id: 'g2', meta: { time: '10:40', activity: 81 }, items: [item('c0'), item('c1')] },
  ],
})
type M = { cap?: number; screen?: number }
const meta = (i: Item) => (i.meta ?? {}) as M

const open = (opts: ThumbnailsOptions, col = collection()) => {
  const v = createViewer({ collection: col, plugins: [thumbnails(opts)] })
  mount(v)
  v.open()
  return v
}
const rail = () => document.querySelector('.gallerist-thumbs') as HTMLElement
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]

// an activity meter as a host draws it: a node named by its aria-label
const meter = (pct: number) => {
  const el = document.createElement('span')
  el.className = 'meter'
  el.setAttribute('aria-label', `Activity ${pct}%`)
  el.textContent = `${pct}%`
  return el
}
const activity = (g: { meta?: unknown }) => (g.meta as { activity: number }).activity

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('renderGroupMeta', () => {
  it('flat: at the end of the label line, its name joining the group name', () => {
    const calls: GroupMetaContext[] = []
    open({
      groupDisplay: 'flat',
      timeline: true,
      renderGroupMeta: (g, _i, ctx) => {
        calls.push(ctx)
        return meter(activity(g))
      },
    })
    const g1 = $('.gallerist-thumb-group[data-group="g1"]')
    const head = g1.querySelector('.gallerist-thumb-group-head') as HTMLElement
    expect(head.parentElement).toBe(g1)
    expect([...head.children].map((c) => c.className)).toEqual([
      'gallerist-thumb-group-cap',
      'gallerist-thumb-meta',
    ])
    expect(head.querySelector('.gallerist-thumb-meta')?.getAttribute('aria-hidden')).toBe('true')
    expect(g1.getAttribute('aria-label')).toBe('Group 2, 10:10, Activity 23%')
    expect(calls.every((c) => c.display === 'flat' && c.place === 'label')).toBe(true)
  })

  it('flat: a string shows as text; null draws nothing; a group without a label keeps the line', () => {
    open({
      groupDisplay: 'flat',
      renderGroupMeta: (g) => (g.id === 'g0' ? null : `${activity(g)}%`),
    })
    expect($('.gallerist-thumb-group[data-group="g0"] .gallerist-thumb-meta')).toBeNull()
    const meta = $('[data-group="g1"] .gallerist-thumb-group-head .gallerist-thumb-meta')
    expect(meta.textContent).toBe('23%')
    expect($('.gallerist-thumb-group[data-group="g1"]').getAttribute('aria-label')).toBe(
      'Group 2, 23%',
    )
    expect($('.gallerist-thumb-group[data-group="g0"]').getAttribute('aria-label')).toBe('Group 1')
  })

  it('stacked: under the card, and with a timeline also at the end of its label', () => {
    const calls: Array<[string, GroupMetaContext['place']]> = []
    open({
      timeline: true,
      renderGroupMeta: (g, _i, { display, place }) => {
        calls.push([g.id, place])
        expect(display).toBe('stacked')
        return place === 'below' ? meter(activity(g)) : '✉ 2'
      },
    })
    const wrap = $('.gallerist-thumb-wrap[data-group="g1"]')
    const card = wrap.querySelector('.gallerist-thumb') as HTMLElement
    expect(card.nextElementSibling?.className).toBe('gallerist-thumb-meta')
    expect(wrap.querySelector('.gallerist-thumb-time .gallerist-thumb-meta')?.textContent).toBe(
      '✉ 2',
    )
    expect(card.getAttribute('aria-label')).toBe('Group 2, 10:10, ✉ 2, Activity 23%')
    expect(calls).toContainEqual(['g1', 'label'])
    expect(calls).toContainEqual(['g1', 'below'])
  })

  it('stacked without a timeline: every card is wrapped, the meta under it', () => {
    open({ renderGroupMeta: (g) => `${activity(g)}%` })
    expect($$('.gallerist-thumbs > .gallerist-thumb-wrap').length).toBe(3)
    expect($('[data-group="g0"] > .gallerist-thumb-meta')?.textContent).toBe('64%')
    expect($('.gallerist-thumb[data-group="g0"]').getAttribute('aria-label')).toBe('Group 1, 64%')
  })

  it('an index rail draws none', () => {
    const render = vi.fn(() => 'x')
    open({ groupDisplay: 'index', renderGroupMeta: render })
    expect(render).not.toHaveBeenCalled()
    expect($('.gallerist-thumb-meta')).toBeNull()
  })
})

describe('renderItemBadge', () => {
  const badge = (i: Item) => {
    const el = document.createElement('span')
    el.setAttribute('aria-label', `Monitor ${meta(i).screen}`)
    el.textContent = String(meta(i).screen)
    return el
  }

  it('flat: in each item thumb, its name joining the thumb name', () => {
    open({ groupDisplay: 'flat', renderItemBadge: (i) => (meta(i).screen ? badge(i) : null) })
    const b1 = $('.gallerist-thumb-item[data-item="b1"]')
    const el = b1.querySelector('.gallerist-thumb-badge') as HTMLElement
    expect(el.textContent).toBe('2')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(b1.getAttribute('aria-label')).toBe('Item 2, Monitor 2')
    // none for an item the host gives none
    expect($('[data-item="c0"] .gallerist-thumb-badge')).toBeNull()
    expect($('[data-item="c0"]').getAttribute('aria-label')).toBe('Item 1')
  })

  it('stacked: in the item column and the peek, beside a number', () => {
    const v = open({ numberItems: true, renderItemBadge: (i) => `S${meta(i).screen ?? 0}` })
    v.goTo(1, 0)
    const col = $$('.gallerist-thumb-items .gallerist-thumb-item')
    expect(col.map((b) => b.querySelector('.gallerist-thumb-badge')?.textContent)).toEqual([
      'S1',
      'S2',
      'S1',
      'S2',
    ])
    expect(col[0]?.querySelector('.gallerist-thumb-num')).not.toBeNull()
    expect(col[0]?.getAttribute('aria-label')).toBe('Item 1, S1')
    $('.gallerist-thumb[data-group="g2"]').dispatchEvent(new window.Event('mouseenter'))
    expect($$('.gallerist-thumb-peek .gallerist-thumb-badge').map((b) => b.textContent)).toEqual([
      'S0',
      'S0',
    ])
  })
})

describe('cluster', () => {
  it('marks where a cluster goes on (in) and where a new one starts (start)', () => {
    open({ groupDisplay: 'flat', cluster: (i) => meta(i).cap })
    const at = (id: string) => $(`[data-item="${id}"]`).dataset.cluster
    expect(['b0', 'b1', 'b2', 'b3'].map(at)).toEqual([undefined, 'in', 'start', 'in'])
    // no keys: no cluster marks (the items keep the plain gap)
    expect(['c0', 'c1'].map(at)).toEqual([undefined, undefined])
  })

  it('applies in the item column too, and changes nothing about traversal', () => {
    const v = open({ cluster: (i) => meta(i).cap })
    v.goTo(1, 1)
    expect(
      $$('.gallerist-thumb-items .gallerist-thumb-item').map((b) => b.dataset.cluster),
    ).toEqual([undefined, 'in', 'start', 'in'])
    // ↓ walks the group's items one by one, across the cluster's edge
    const root = $('.gallerist')
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
    expect($('[data-item="b2"]').getAttribute('aria-posinset')).toBe('3')
  })
})

// 0.5 (Apploye): a flat rail walks with ←/→, so ↑/↓ were free; `clusterKeys` gives them the other
// screens of the same capture, with no host keyboard code
describe('clusterKeys', () => {
  const press = (k: string, at: Element = $('.gallerist')) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
    at.dispatchEvent(e)
    return e.defaultPrevented
  }
  const flat = (opts: ThumbnailsOptions = {}) =>
    open({ groupDisplay: 'flat', cluster: (i) => meta(i).cap, clusterKeys: true, ...opts })

  it('↑/↓ step to the item before / after the current one in its cluster, and no further', () => {
    const v = flat()
    v.goTo(1, 0) // b0: capture 1, screen 1
    expect(press('ArrowDown')).toBe(true)
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    // b1 ends capture 1: ↓ isn't taken (the renderer's ↓ on a flat row rail does nothing)
    expect(press('ArrowDown')).toBe(true) // the renderer's own, a no-op here
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    expect(press('ArrowUp')).toBe(true)
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    press('ArrowUp') // b0 starts it
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    v.goTo(1, 3)
    press('ArrowUp')
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
    // items with no key are no cluster: c0, c1
    v.goTo(2, 0)
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    // ←/→ still walk every item
    v.goTo(1, 0)
    press('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })

  it('takes plain ↑/↓ only: Shift+↑/↓ stay the renderer’s', () => {
    const v = flat()
    v.goTo(1, 0)
    for (const key of ['ArrowDown', 'ArrowUp']) {
      const e = new KeyboardEvent('keydown', {
        key,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      $('.gallerist').dispatchEvent(e)
      expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    }
    expect(press('ArrowDown')).toBe(true)
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
  })

  it('announces the step as any other: the live region names the new item', () => {
    const v = flat()
    v.goTo(1, 0)
    const live = $('.gallerist-live')
    const before = live.textContent
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    const said = live.textContent
    expect(said).not.toBe(before)
    v.goTo(1, 0)
    press('ArrowRight') // what a step there by → says
    expect(live.textContent).toBe(said)
  })

  it('off by default: ↑/↓ on a flat rail do what they did (nothing)', () => {
    const v = open({ groupDisplay: 'flat', cluster: (i) => meta(i).cap })
    v.goTo(1, 0)
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
  })

  it('a stacked rail keeps ↑/↓ for its items; down a side rail they still walk it', () => {
    const stacked = flat({ groupDisplay: 'stacked' })
    stacked.goTo(1, 1)
    press('ArrowDown') // the item axis: to b2, across the cluster's edge
    expect(stacked.getState().cursor).toEqual({ g: 1, i: 2 })
    document.body.innerHTML = ''
    const v = createViewer({
      collection: collection(),
      plugins: [
        thumbnails({ groupDisplay: 'flat', cluster: (i) => meta(i).cap, clusterKeys: true }),
      ],
    })
    mount(v, { rail: 'left' }) // ↑/↓ walk the rail
    v.open()
    v.goTo(1, 0)
    for (const at of [1, 2, 3]) {
      press('ArrowDown') // in the cluster, then across its edge: every item, as without the option
      expect(v.getState().cursor).toEqual({ g: 1, i: at })
    }
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    press('ArrowUp')
    press('ArrowUp')
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it('down a side rail with linear: false, ↑/↓ keep stepping by group', () => {
    const v = createViewer({
      collection: collection(),
      plugins: [
        thumbnails({ groupDisplay: 'flat', cluster: (i) => meta(i).cap, clusterKeys: true }),
      ],
    })
    mount(v, { rail: 'left', linear: false })
    v.open()
    v.goTo(1, 0) // b0, with b1 in its cluster
    press('ArrowDown') // the next group there, not b1
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    press('ArrowUp')
    expect(v.getState().cursor.g).toBe(1)
  })

  it('follows a display switch: taken on flat, given back on stacked', () => {
    const v = flat({ groupDisplay: 'stacked' })
    v.goTo(1, 1)
    setGroupDisplay(v, 'flat')
    press('ArrowDown') // b1 ends capture 1
    expect(v.getState().cursor).toEqual({ g: 1, i: 1 })
    press('ArrowUp')
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
    setGroupDisplay(v, 'stacked')
    press('ArrowDown')
    press('ArrowDown')
    expect(v.getState().cursor).toEqual({ g: 1, i: 2 })
  })

  it("not from a field, a dialog or a menu button in the viewer, and not over a caption band's", () => {
    const v = flat()
    v.goTo(1, 0)
    const root = $('.gallerist')
    const host = root.appendChild(document.createElement('div'))
    host.innerHTML =
      '<input><div role="dialog"><button class="in">x</button></div><button aria-haspopup="menu">m</button>'
    for (const sel of ['input', '.in', '[aria-haspopup]']) press('ArrowDown', $(sel))
    expect(v.getState().cursor).toEqual({ g: 1, i: 0 })
  })
})

describe('markers', () => {
  const manual: RailMarker = {
    id: 'm1',
    after: 'g1',
    caption: 'Manual',
    label: 'Manual time, 10:20 – 10:40, 20 minutes',
    render: () => '✎ 20m',
  }

  it('flat: drawn after its group, before the next, as a named group with no option', () => {
    open({
      groupDisplay: 'flat',
      markers: () => [manual, { id: 'm0', before: 'g0', label: 'Start' }],
    })
    const kids = [...rail().children].map(
      (c) => (c as HTMLElement).dataset.group ?? `marker:${(c as HTMLElement).dataset.marker}`,
    )
    expect(kids).toEqual(['marker:m0', 'g0', 'g1', 'marker:m1', 'g2'])
    const m = $('.gallerist-rail-marker[data-marker="m1"]')
    expect(m.getAttribute('role')).toBe('group')
    expect(m.getAttribute('aria-label')).toBe(manual.label)
    expect(m.title).toBe(manual.label) // no tip: the label is its title
    expect(m.querySelector('.gallerist-rail-marker-cap')?.textContent).toBe('Manual')
    expect(m.querySelector('.gallerist-rail-marker-body')?.textContent).toBe('✎ 20m')
    expect(m.querySelector('button, [tabindex]')).toBeNull()
    // the default body is the label
    expect($('[data-marker="m0"] .gallerist-rail-marker-body').textContent).toBe('Start')
  })

  it('is no stop: the keys, Home/End and the count walk the items only', () => {
    const v = open({ groupDisplay: 'flat', markers: () => [manual] })
    const root = $('.gallerist')
    const key = (k: string) =>
      root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    v.goTo(1, 3) // the last item before the marker
    key('ArrowRight')
    expect(v.getState().cursor).toEqual({ g: 2, i: 0 })
    key('ArrowLeft')
    expect(v.getState().cursor).toEqual({ g: 1, i: 3 })
    key('End')
    expect(v.getState().cursor).toEqual({ g: 2, i: 1 })
    key('Home')
    expect(v.getState().cursor).toEqual({ g: 0, i: 0 })
    expect($('.gallerist-counter')?.textContent ?? '').not.toMatch(/8/)
    expect($$('.gallerist-thumbs [role="option"]').length).toBe(7)
  })

  it('stacked: between the cards; a marker for a missing group, or on an index rail, is not drawn', () => {
    open({ markers: () => [manual, { id: 'x', after: 'nope', label: 'Lost' }] })
    const kids = [...rail().children].map(
      (c) => (c as HTMLElement).dataset.group ?? (c as HTMLElement).dataset.marker,
    )
    expect(kids).toEqual(['g0', 'g1', 'm1', 'g2'])
    document.body.innerHTML = ''
    open({ groupDisplay: 'index', markers: () => [manual] })
    expect($('.gallerist-rail-marker')).toBeNull()
  })

  it('a stacked timeline gives every marker a label line, so its box lines up with the cards', () => {
    open({ timeline: true, markers: () => [{ id: 'm', after: 'g0', label: 'Break' }] })
    expect($('[data-marker="m"] .gallerist-rail-marker-cap')?.textContent).toBe('')
  })

  it('is drawn with its group: windowed out with it, back when the run reaches it', () => {
    const groups = Array.from({ length: 2000 }, (_, g) => ({ id: `g${g}`, items: [item(`i${g}`)] }))
    const v = open({ markers: () => [{ id: 'far', after: 'g1500', label: 'Far' }] }, { groups })
    expect($('[data-marker="far"]')).toBeNull()
    v.goTo(1500)
    const m = $('[data-marker="far"]')
    expect(m?.previousElementSibling?.getAttribute('data-group')).toBe('g1500')
    v.goTo(0)
    expect($('[data-marker="far"]')).toBeNull()
  })

  it('a flat group cut by the run shows its markers only at the end that is drawn', () => {
    const groups = [{ id: 'big', items: Array.from({ length: 300 }, (_, i) => item(`i${i}`)) }]
    const v = open(
      {
        groupDisplay: 'flat',
        markers: () => [
          { id: 'pre', before: 'big', label: 'Before' },
          { id: 'post', after: 'big', label: 'After' },
        ],
      },
      { groups },
    )
    expect($('[data-marker="pre"]')).not.toBeNull()
    expect($('[data-marker="post"]')).toBeNull()
    v.goTo(0, 299)
    expect($('[data-marker="pre"]')).toBeNull()
    expect($('[data-marker="post"]')?.previousElementSibling?.getAttribute('data-group')).toBe(
      'big',
    )
  })

  it('a tip shows for a mouse over it and on a long press, in the region, never clipped by the rail', () => {
    vi.useFakeTimers()
    const tip = (m: RailMarker) => {
      const el = document.createElement('div')
      el.textContent = `${m.label}. Added by Sam.`
      return el
    }
    open({ groupDisplay: 'flat', markers: () => [{ ...manual, tip }] })
    const m = $('[data-marker="m1"]')
    expect(m.hasAttribute('title')).toBe(false) // the tip says it instead
    const region = $('.gallerist-thumbs-region')
    const ptr = (type: string, pointerType: string) =>
      m.dispatchEvent(new window.PointerEvent(type, { pointerType, bubbles: true }))
    ptr('pointerenter', 'mouse')
    const shown = region.querySelector('.gallerist-rail-tip') as HTMLElement
    expect(shown.getAttribute('role')).toBe('tooltip')
    expect(shown.textContent).toContain('Added by Sam')
    ptr('pointerleave', 'mouse')
    expect($('.gallerist-rail-tip')).toBeNull()
    // touch: a long press, kept after the finger lifts, gone at the next press anywhere
    ptr('pointerdown', 'touch')
    vi.advanceTimersByTime(300)
    expect($('.gallerist-rail-tip')).toBeNull()
    vi.advanceTimersByTime(300)
    ptr('pointerup', 'touch')
    expect($('.gallerist-rail-tip')).not.toBeNull()
    document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    expect($('.gallerist-rail-tip')).toBeNull()
    // a press that lifts early shows nothing
    ptr('pointerdown', 'touch')
    ptr('pointerup', 'touch')
    vi.advanceTimersByTime(600)
    expect($('.gallerist-rail-tip')).toBeNull()
  })
})

describe('what a decoration says', () => {
  it('a fragment, or a number, joins the name with its text (read from what is drawn)', () => {
    open({
      groupDisplay: 'flat',
      renderGroupMeta: (g) => {
        if (g.id === 'g1') return 7 as unknown as string // a host's plain JS number
        const frag = document.createDocumentFragment()
        const b = document.createElement('b')
        b.textContent = '3'
        frag.append('✉ ', b)
        return frag
      },
    })
    expect($('.gallerist-thumb-group[data-group="g0"]').getAttribute('aria-label')).toBe(
      'Group 1, ✉ 3',
    )
    expect($('.gallerist-thumb-group[data-group="g1"]').getAttribute('aria-label')).toBe(
      'Group 2, 7',
    )
  })

  it('a marker id used twice is drawn once', () => {
    open({
      groupDisplay: 'flat',
      markers: () => [
        { id: 'm', after: 'g0', label: 'One' },
        { id: 'm', after: 'g1', label: 'Two' },
      ],
    })
    expect($$('.gallerist-rail-marker').map((m) => m.getAttribute('aria-label'))).toEqual(['One'])
  })
})

describe('refreshRail', () => {
  it('a tip that is open shows again on its marker, drawn anew with the new data', () => {
    let by = 'Sam'
    const tip = (m: RailMarker) => {
      const el = document.createElement('div')
      el.textContent = `${m.label}. Added by ${by}.`
      return el
    }
    const v = open({
      groupDisplay: 'flat',
      markers: () => [{ id: 'm1', after: 'g0', label: 'Manual time', tip }],
    })
    $('[data-marker="m1"]').dispatchEvent(
      new window.PointerEvent('pointerenter', { pointerType: 'mouse', bubbles: true }),
    )
    expect($('.gallerist-rail-tip')?.textContent).toContain('Sam')
    by = 'Ana'
    refreshRail(v)
    expect($$('.gallerist-rail-tip')).toHaveLength(1)
    expect($('.gallerist-rail-tip')?.textContent).toContain('Ana')
    document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    expect($('.gallerist-rail-tip')).toBeNull()
  })

  it('draws the decorations and markers again in place; the thumbs stay', () => {
    const notes: Record<string, number> = {}
    const marks: RailMarker[] = []
    const v = open({
      groupDisplay: 'flat',
      renderGroupMeta: (g) => (notes[g.id] ? `✉ ${notes[g.id]}` : null),
      renderItemBadge: (i) => (notes[i.id] ? '!' : null),
      markers: () => marks,
    })
    const thumb = $('[data-item="b0"]')
    expect($('[data-group="g1"] .gallerist-thumb-meta')).toBeNull()
    notes.g1 = 2
    notes.b0 = 1
    marks.push({ id: 'm', after: 'g0', label: 'Manual' })
    expect(refreshRail(v)).toBe(true)
    expect($('[data-group="g1"] .gallerist-thumb-meta')?.textContent).toBe('✉ 2')
    expect($('.gallerist-thumb-group[data-group="g1"]').getAttribute('aria-label')).toBe(
      'Group 2, ✉ 2',
    )
    expect($('[data-item="b0"]')).toBe(thumb)
    expect(thumb.querySelector('.gallerist-thumb-badge')?.textContent).toBe('!')
    expect(thumb.getAttribute('aria-label')).toBe('Item 1, !')
    expect($('[data-marker="m"]')?.previousElementSibling?.getAttribute('data-group')).toBe('g0')
    // and back
    notes.g1 = 0
    notes.b0 = 0
    marks.length = 0
    refreshRail(v)
    expect($('.gallerist-thumb-meta')).toBeNull()
    expect($('.gallerist-thumb-badge')).toBeNull()
    expect($('.gallerist-rail-marker')).toBeNull()
  })

  it('stacked: cards keep their identity, the meta and names follow', () => {
    let pct = 10
    const v = open({ renderGroupMeta: () => `${pct}%` })
    const card = $('.gallerist-thumb[data-group="g2"]')
    pct = 90
    refreshRail(v)
    expect($('.gallerist-thumb[data-group="g2"]')).toBe(card)
    expect($$('.gallerist-thumb-meta').map((m) => m.textContent)).toEqual(['90%', '90%', '90%'])
    expect(card.getAttribute('aria-label')).toBe('Group 3, 90%')
  })

  it('keeps focus on a focused thumb', () => {
    let on = false
    const v = open({ groupDisplay: 'flat', renderItemBadge: () => (on ? '1' : null) })
    const thumb = $<HTMLButtonElement>('[data-item="a0"]')
    thumb.focus()
    on = true
    refreshRail(v)
    expect(document.activeElement).toBe(thumb)
  })

  it('a new collection reads the markers again; a switch of display draws them for it', () => {
    const v = open({ markers: (c) => [{ id: 'm', after: c.groups[0]?.id ?? '', label: 'M' }] })
    v.setCollection({
      groups: [
        { id: 'n0', items: [item('x')] },
        { id: 'n1', items: [item('y')] },
      ],
    })
    expect($('[data-marker="m"]')?.previousElementSibling?.getAttribute('data-group')).toBe('n0')
    setGroupDisplay(v, 'flat')
    expect($('[data-marker="m"]')?.previousElementSibling?.getAttribute('data-group')).toBe('n0')
  })

  it('is false for a viewer without a rail', () => {
    expect(refreshRail(createViewer({ collection: collection() }))).toBe(false)
  })
})
