// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { bind, collectionFromLinks } from './bind'

const page = (html: string) => {
  document.body.innerHTML = html
}
const link = (selector: string) => document.querySelector(selector) as HTMLElement
const click = (el: HTMLElement, init: MouseEventInit = {}) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(e)
  return e
}

let handle: ReturnType<typeof bind> | null = null
afterEach(() => {
  handle?.destroy()
  handle = null
  document.body.innerHTML = ''
})

describe('collectionFromLinks', () => {
  const links = () => [...document.querySelectorAll('a')]

  it('reads the source, thumb, alt, caption, type and size', () => {
    page(`<a href="big.jpg" data-gallerist-caption="Cap" data-gallerist-width="800" data-gallerist-height="600">
      <img src="small.jpg" alt="Alt"></a>`)
    const { collection } = collectionFromLinks(links())
    expect(collection.groups[0]?.items[0]).toMatchObject({
      type: 'image',
      source: 'big.jpg',
      thumb: 'small.jpg',
      alt: 'Alt',
      caption: 'Cap',
      naturalSize: { w: 800, h: 600 },
    })
  })

  it('explicit attributes win over the nested image', () => {
    page(`<a data-gallerist-src="v.mp4" data-gallerist-type="video" data-gallerist-id="x"
      data-gallerist-thumb="t.jpg" data-gallerist-alt="Own" href="ignored.jpg"><img src="s.jpg" alt="Img"></a>`)
    expect(collectionFromLinks(links()).collection.groups[0]?.items[0]).toMatchObject({
      id: 'x',
      type: 'video',
      source: 'v.mp4',
      thumb: 't.jpg',
      alt: 'Own',
    })
  })

  it('a bad size is ignored', () => {
    page('<a href="a.jpg" data-gallerist-width="wide" data-gallerist-height="0"></a>')
    expect(collectionFromLinks(links()).collection.groups[0]?.items[0]?.naturalSize).toBeUndefined()
  })

  it('groups by id in first-seen order; positions follow, even out of document order', () => {
    page(`<a id="a" href="a.jpg" data-gallerist-group="k" data-gallerist-group-caption="Kitchen"
        data-gallerist-group-subtitle="Ground"></a>
      <a id="b" href="b.jpg"></a>
      <a id="c" href="c.jpg" data-gallerist-group="k"></a>
      <a id="none"></a>
      <a id="d" href="d.jpg"></a>`)
    const { collection, positions } = collectionFromLinks(links())
    expect(collection.groups.map((g) => g.items.length)).toEqual([2, 1, 1])
    expect(collection.groups[0]).toMatchObject({
      id: 'k',
      caption: 'Kitchen',
      meta: { subtitle: 'Ground' },
    })
    expect(positions.get(link('#c'))).toEqual({ g: 0, i: 1 })
    expect(positions.get(link('#b'))).toEqual({ g: 1, i: 0 })
    expect(positions.get(link('#d'))).toEqual({ g: 2, i: 0 })
    expect(positions.has(link('#none'))).toBe(false)
  })

  it('ids are unique across links', () => {
    page('<a href="a.jpg"></a><a href="b.jpg"></a>')
    const ids = collectionFromLinks(links()).collection.groups.flatMap((g) =>
      g.items.map((i) => i.id),
    )
    expect(new Set(ids).size).toBe(2)
  })
})

describe('bind', () => {
  const two = `<a id="one" href="a.jpg" data-gallerist="trip"><img src="a-t.jpg" alt="A"></a>
    <a id="two" href="b.jpg" data-gallerist="trip"></a>
    <a id="other" href="c.jpg" data-gallerist="work"></a>
    <a id="plain" href="d.jpg"></a>`

  it('a click opens the viewer at that link instead of following it', () => {
    page(two)
    handle = bind()
    const e = click(link('#two'))
    expect(e.defaultPrevented).toBe(true)
    const v = handle.viewer('trip')
    expect(v?.getState().phase).not.toBe('closed')
    expect(v?.getState().cursor).toEqual({ g: 1, i: 0 })
    expect(document.querySelector('.gallerist')).not.toBeNull()
  })

  it('a click on the image inside a link counts', () => {
    page(two)
    handle = bind()
    expect(click(link('#one img')).defaultPrevented).toBe(true)
    expect(handle.viewer('trip')?.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('each gallery value is its own viewer, holding only its links', () => {
    page(two)
    handle = bind()
    click(link('#other'))
    expect(handle.viewer('work')?.getCollection().groups.length).toBe(1)
    expect(handle.viewer('trip')).toBeUndefined()
  })

  it('leaves modified clicks, other links and already-handled clicks to the browser', () => {
    page(two)
    handle = bind()
    expect(click(link('#one'), { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(click(link('#one'), { metaKey: true }).defaultPrevented).toBe(false)
    expect(click(link('#one'), { button: 1 }).defaultPrevented).toBe(false)
    expect(click(link('#plain')).defaultPrevented).toBe(false)
    expect(handle.viewer('trip')).toBeUndefined()
  })

  it('a link with no source does nothing', () => {
    page('<button id="b" data-gallerist="x">Open</button>')
    handle = bind()
    expect(click(link('#b')).defaultPrevented).toBe(false)
    expect(handle.viewer('x')).toBeUndefined()
  })

  it('links added later join on the next click, in the same viewer', () => {
    page(two)
    handle = bind()
    click(link('#one'))
    const v = handle.viewer('trip')
    v?.close()
    link('#two').insertAdjacentHTML(
      'afterend',
      '<a id="new" href="n.jpg" data-gallerist="trip"></a>',
    )
    click(link('#new'))
    expect(handle.viewer('trip')).toBe(v)
    expect(v?.getCollection().groups.length).toBe(3)
    expect(v?.getState().cursor).toEqual({ g: 2, i: 0 })
  })

  it('takes viewer and mount options, also per gallery', () => {
    page(two)
    handle = bind({
      viewer: { loop: true },
      mount: (gallery) => ({ preset: gallery === 'trip' ? 'tour' : 'contact' }),
    })
    click(link('#one'))
    expect(handle.viewer('trip')?.loop).toBe(true)
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-preset')).toBe('tour')
  })

  it('open() works from code; an unknown gallery is a no-op', () => {
    page(two)
    handle = bind()
    handle.open('trip', { g: 1 })
    expect(handle.viewer('trip')?.getState().cursor.g).toBe(1)
    handle.open('nope')
    expect(handle.viewer('nope')).toBeUndefined()
  })

  it('a custom selector and root are honoured; a bare attribute is the default gallery', () => {
    page(`<div id="box"><a id="in" href="a.jpg" class="g"></a></div><a id="out" href="b.jpg" class="g"></a>
      <a id="bare" href="c.jpg" data-gallerist></a>`)
    handle = bind({ selector: 'a.g', root: link('#box') })
    expect(click(link('#out')).defaultPrevented).toBe(false)
    expect(click(link('#in')).defaultPrevented).toBe(true)
    expect(handle.viewer()?.getCollection().groups.length).toBe(1)
    handle.destroy()
    handle = bind()
    expect(click(link('#bare')).defaultPrevented).toBe(true)
  })

  it('returns focus to the link that opened it', async () => {
    page(two)
    handle = bind()
    const a = link('#two')
    a.focus()
    click(a)
    handle.viewer('trip')?.close()
    await new Promise((r) => setTimeout(r, 400))
    expect(document.activeElement).toBe(a)
  })

  it('destroy stops listening and removes the viewers', () => {
    page(two)
    handle = bind()
    click(link('#one'))
    handle.destroy()
    expect(document.querySelector('.gallerist')).toBeNull()
    expect(click(link('#one')).defaultPrevented).toBe(false)
    handle = null
  })
})
