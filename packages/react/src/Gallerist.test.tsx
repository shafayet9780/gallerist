// @vitest-environment happy-dom

import type { Collection, MediaAdapter, Plugin, RegionCtx, ViewerApi } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode, createRef, useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ThumbnailsInstance, thumbnails } from '../../plugin-thumbnails/src/index'
import { type ViewChange, type ViewState, view } from '../../plugin-view/src/index'
import { Gallerist } from './Gallerist'
import { useViewerContext } from './context'
import { useCurrentItem } from './useCurrentItem'
import { useGallerist } from './useGallerist'

const collection: Collection = {
  groups: [
    { id: 'g0', items: [{ id: 'a', type: 'image', source: 'a.jpg' }] },
    { id: 'g1', items: [{ id: 'b', type: 'image', source: 'b.jpg' }] },
  ],
}

afterEach(cleanup)

describe('<Gallerist>', () => {
  it('mounts and opens the viewer when open is true', () => {
    render(<Gallerist collection={collection} open />)
    expect(document.querySelector('.gallerist')).not.toBeNull()
    expect(document.querySelector('.gallerist-counter')?.textContent).toContain('1 / 2')
  })

  it('applies preset, appearance, and arrow layout to the root', () => {
    render(
      <Gallerist collection={collection} open preset="reviewer" skin="console" accent="cyan" />,
    )
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-preset')).toBe('reviewer')
    expect(root.getAttribute('data-gallerist-arrows')).toBe('docked') // reviewer default
    expect(root.getAttribute('data-gallerist-skin')).toBe('console')
    expect(root.getAttribute('data-gallerist-accent')).toBe('cyan')
    expect(root.hasAttribute('data-gallerist-scheme')).toBe(false) // the skin's own default
  })

  it('updates skin, accent and scheme in place when the props change', () => {
    const { rerender } = render(<Gallerist collection={collection} open accent="mint" />)
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-skin')).toBe('gallery')
    expect(root.getAttribute('data-gallerist-accent')).toBe('mint')
    rerender(<Gallerist collection={collection} open skin="console" scheme="light" />)
    expect(document.querySelector('.gallerist')).toBe(root) // no remount
    expect(root.getAttribute('data-gallerist-skin')).toBe('console')
    expect(root.getAttribute('data-gallerist-scheme')).toBe('light')
    expect(root.hasAttribute('data-gallerist-accent')).toBe(false)
  })

  it('hands the preset to plugin regions (thumbnails() reads its rail defaults there)', () => {
    const seen: RegionCtx['preset'][] = []
    const probe: Plugin = () => ({
      name: 'probe',
      regions: {
        footer: (ctx) => {
          seen.push(ctx.preset)
          return document.createElement('div')
        },
      },
    })
    render(<Gallerist collection={collection} open preset="reviewer" plugins={[probe]} />)
    expect(seen[0]?.thumbnails).toEqual({ itemAxis: 'vertical', timeline: true, numberItems: true })
  })

  it('linear: omitted, it follows the rail (on under a rail that asks); false and true fix it', () => {
    // a flat thumbnails rail marks its region data-gallerist-linear; this one does the same
    const flatRail: Plugin = () => ({
      name: 'flat-rail',
      regions: {
        thumbnails: () => {
          const node = document.createElement('div')
          node.setAttribute('data-gallerist-linear', '')
          return node
        },
      },
    })
    const twoItems: Collection = {
      groups: [
        {
          id: 'g0',
          items: [
            { id: 'a', type: 'image', source: 'a.jpg' },
            { id: 'a1', type: 'image', source: 'a1.jpg' },
          ],
        },
        { id: 'g1', items: [{ id: 'b', type: 'image', source: 'b.jpg' }] },
      ],
    }
    const linearOf = () =>
      document.querySelector('.gallerist')?.getAttribute('data-gallerist-linear')
    const counter = () => document.querySelector('.gallerist-counter')?.textContent
    const first = render(<Gallerist collection={twoItems} open plugins={[flatRail]} />)
    expect(linearOf()).toBe('true') // omitted: React passes nothing, so the rail decides
    expect(counter()).toContain('1 / 3') // item 1 of 3, not group 1 of 2
    first.unmount()
    const off = render(<Gallerist collection={twoItems} open plugins={[flatRail]} linear={false} />)
    expect(linearOf()).toBeNull()
    expect(counter()).toContain('1 / 2')
    off.unmount()
    render(<Gallerist collection={twoItems} open linear />)
    expect(linearOf()).toBe('true') // no rail at all
  })

  it('linear stays off when omitted and no rail asks for it', () => {
    render(<Gallerist collection={collection} open />)
    expect(document.querySelector('.gallerist')?.hasAttribute('data-gallerist-linear')).toBe(false)
  })

  it('passes navigator to the renderer, overriding the preset', () => {
    render(<Gallerist collection={collection} open preset="reviewer" navigator={false} />)
    expect(document.querySelector('.gallerist-navigator')).toBeNull()
  })

  it('passes groupAxis and arrowLabels to the renderer, overriding the preset', () => {
    render(
      <Gallerist
        collection={collection}
        open
        preset="tour"
        groupAxis="vertical"
        arrowLabels={false}
      />,
    )
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-axis')).toBe('vertical')
    expect(root.hasAttribute('data-gallerist-arrow-labels')).toBe(false)
  })

  it('passes frame to the renderer, overriding the preset', () => {
    render(<Gallerist collection={collection} open preset="editorial" frame={false} />)
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.hasAttribute('data-gallerist-frame')).toBe(false)
    expect(root.getAttribute('data-gallerist-indicator')).toBe('placard')
  })

  it('closes when open flips to false and fires onClose', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Gallerist collection={collection} open onClose={onClose} />)
    expect(document.querySelector('.gallerist')).not.toBeNull()
    rerender(<Gallerist collection={collection} open={false} onClose={onClose} />)
    expect(document.querySelector('.gallerist')).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('exposes the viewer via ref (imperative)', () => {
    const ref = createRef<ViewerApi>()
    render(<Gallerist collection={collection} open ref={ref} />)
    expect(ref.current).not.toBeNull()
    act(() => ref.current?.next())
    expect(ref.current?.getState().cursor.g).toBe(1)
  })

  it('survives StrictMode double-mount: one root, usable viewer, overlay renders', () => {
    const ref = createRef<ViewerApi>()
    render(
      <StrictMode>
        <Gallerist collection={collection} open ref={ref}>
          <Gallerist.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
            <span>Badge</span>
          </Gallerist.Overlay>
        </Gallerist>
      </StrictMode>,
    )
    expect(document.querySelectorAll('.gallerist').length).toBe(1)
    expect(document.querySelector('.gallerist-viewport-layer')?.textContent).toContain('Badge')
    act(() => ref.current?.next())
    expect(ref.current?.getState().cursor.g).toBe(1)
  })

  it('tears down on unmount', () => {
    const { unmount } = render(<Gallerist collection={collection} open />)
    expect(document.querySelector('.gallerist')).not.toBeNull()
    unmount()
    expect(document.querySelector('.gallerist')).toBeNull()
  })
})

function Counter() {
  const { state } = useGallerist(useViewerContext())
  return <div data-testid="cnt">{state.cursor.g}</div>
}

describe('<Gallerist> reactive props', () => {
  const img = (id: string) => ({ id, type: 'image' as const, source: `${id}.jpg` })

  it('applies a new collection reference in place, keeping the cursor on the same item', () => {
    const ref = createRef<ViewerApi>()
    const { rerender } = render(<Gallerist ref={ref} collection={collection} open />)
    act(() => ref.current?.next()) // on g1 / b
    const next: Collection = {
      groups: [{ id: 'g9', items: [img('z')] }, ...collection.groups],
    }
    rerender(<Gallerist ref={ref} collection={next} open />)
    expect(ref.current?.getCollection().groups).toHaveLength(3)
    expect(ref.current?.getState().cursor).toEqual({ g: 2, i: 0 }) // still on b, now at index 2
    expect(document.querySelector('.gallerist-counter')?.textContent).toContain('3 / 3')
  })

  it('applies a new flat items array', () => {
    const ref = createRef<ViewerApi>()
    const { rerender } = render(<Gallerist ref={ref} items={[img('a')]} open />)
    rerender(<Gallerist ref={ref} items={[img('a'), img('b'), img('c')]} open />)
    expect(ref.current?.getCollection().groups.map((g) => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not re-apply the same data reference on re-render, or the initial data on mount', () => {
    const collectionChange = vi.fn()
    const { rerender } = render(
      <StrictMode>
        <Gallerist collection={collection} on={{ collectionChange }} open />
      </StrictMode>,
    )
    rerender(
      <StrictMode>
        <Gallerist collection={collection} on={{ collectionChange }} open accent="mint" />
      </StrictMode>,
    )
    expect(collectionChange).not.toHaveBeenCalled()
  })

  it('re-rendering with rebuilt-but-identical inline data does not swap the collection', () => {
    const ref = createRef<ViewerApi>()
    const collectionChange = vi.fn()
    const photos = ['a', 'b', 'c']
    const view = (accent: 'mint' | 'amber') => (
      <Gallerist
        ref={ref}
        items={photos.map((id) => ({ id, type: 'image' as const, source: { src: `${id}.jpg` } }))}
        on={{ collectionChange }}
        accent={accent}
        open
      />
    )
    const { rerender } = render(view('mint'))
    act(() => {
      getInternals(ref.current as ViewerApi).emit('loaded', {
        viewer: ref.current as ViewerApi,
        cursor: { g: 0, i: 0 },
        id: 'a',
      })
    })
    rerender(view('amber')) // fresh item objects, same content
    expect(collectionChange).not.toHaveBeenCalled()
    expect(ref.current?.getState().loaded.a).toBe('loaded') // load status survives
  })

  it('an invalid data update is reported and the current collection kept (no crash)', () => {
    const ref = createRef<ViewerApi>()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { rerender } = render(<Gallerist ref={ref} items={[img('a'), img('b')]} open />)
      rerender(<Gallerist ref={ref} items={[img('a'), img('a')]} open />)
      expect(error).toHaveBeenCalledWith(
        '[gallerist] ignored an invalid collection update:',
        expect.any(Error),
      )
      expect(ref.current?.getCollection().groups.map((g) => g.id)).toEqual(['a', 'b'])
    } finally {
      error.mockRestore()
    }
  })

  it('calls the latest on handler, not the one from the first render', () => {
    const ref = createRef<ViewerApi>()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <Gallerist ref={ref} collection={collection} on={{ slide: first }} open />,
    )
    rerender(<Gallerist ref={ref} collection={collection} on={{ slide: second }} open />)
    act(() => ref.current?.next())
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('a handler added after mount fires, and a returned false still cancels', () => {
    const ref = createRef<ViewerApi>()
    const { rerender } = render(<Gallerist ref={ref} collection={collection} open />)
    rerender(<Gallerist ref={ref} collection={collection} on={{ beforeSlide: () => false }} open />)
    act(() => ref.current?.next())
    expect(ref.current?.getState().cursor).toEqual({ g: 0, i: 0 })
  })

  it('still fires init from the constructor-time on handlers', () => {
    const init = vi.fn()
    render(<Gallerist collection={collection} on={{ init }} />)
    expect(init).toHaveBeenCalledTimes(1)
  })
})

describe('useGallerist', () => {
  it('reflects state changes via useSyncExternalStore', () => {
    const ref = createRef<ViewerApi>()
    render(
      <Gallerist collection={collection} open ref={ref}>
        <Counter />
      </Gallerist>,
    )
    expect(screen.getByTestId('cnt').textContent).toBe('0')
    act(() => ref.current?.next())
    expect(screen.getByTestId('cnt').textContent).toBe('1')
  })
})

describe('portal bridge', () => {
  it('Gallerist.Region portals JSX into a named region', () => {
    render(
      <Gallerist collection={collection} open>
        <Gallerist.Region name="toolbar">
          <button type="button">Hi</button>
        </Gallerist.Region>
      </Gallerist>,
    )
    expect(document.querySelector('.gallerist-region-toolbar')?.textContent).toContain('Hi')
  })

  it('Gallerist.Overlay portals JSX into the overlay layer', () => {
    render(
      <Gallerist collection={collection} open>
        <Gallerist.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
          <span>Badge</span>
        </Gallerist.Overlay>
      </Gallerist>,
    )
    expect(document.querySelector('.gallerist-viewport-layer')?.textContent).toContain('Badge')
  })

  it('auto-generates a stable overlay id without a module counter', () => {
    const tree = (
      <Gallerist collection={collection} open>
        <Gallerist.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
          <span>X</span>
        </Gallerist.Overlay>
      </Gallerist>
    )
    const { rerender } = render(tree)
    const idOf = () =>
      document
        .querySelector('.gallerist-viewport-layer [data-overlay]')
        ?.getAttribute('data-overlay')
    const id1 = idOf()
    expect(id1).toBeTruthy()
    expect(id1).not.toMatch(/^react-overlay-\d+$/) // no SSR-unsafe module counter
    rerender(tree)
    expect(idOf()).toBe(id1) // stable across re-render
  })

  it('removes the overlay when the React node unmounts', () => {
    const { rerender } = render(
      <Gallerist collection={collection} open>
        <Gallerist.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
          <span>Badge</span>
        </Gallerist.Overlay>
      </Gallerist>,
    )
    expect(document.querySelector('.gallerist-viewport-layer')?.textContent).toContain('Badge')
    rerender(<Gallerist collection={collection} open />)
    expect(document.querySelector('.gallerist-viewport-layer')?.textContent ?? '').not.toContain(
      'Badge',
    )
  })

  it('disposes plugins when the component unmounts (I-X2)', () => {
    const destroy = vi.fn()
    const plugin = () => ({ name: 'leaky', init() {}, destroy })
    const { unmount } = render(<Gallerist collection={collection} open plugins={[plugin]} />)
    expect(document.querySelector('.gallerist')).not.toBeNull()
    unmount()
    expect(destroy).toHaveBeenCalled()
  })

  it('fires onClose exactly once on a controlled close (I-X1)', () => {
    const onClose = vi.fn()
    function Controlled() {
      const [open, setOpen] = useState(true)
      return (
        <Gallerist
          collection={collection}
          open={open}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        />
      )
    }
    render(<Controlled />)
    act(() => {
      const root = document.querySelector('.gallerist') as HTMLElement
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('0.3 API', () => {
    const three: Collection = {
      groups: [
        {
          id: 'g0',
          items: [
            { id: 'a', type: 'image', source: 'a.jpg', caption: 'Text a' },
            { id: 'a2', type: 'image', source: 'a2.jpg' },
          ],
        },
        { id: 'g1', items: [{ id: 'b', type: 'image', source: 'b.jpg', caption: 'Text b' }] },
        { id: 'g2', items: [{ id: 'c', type: 'image', source: 'c.jpg' }] },
      ],
    }
    const counter = () => document.querySelector('.gallerist-counter')?.textContent

    it('open={{ g, i }} opens at a position, and a new position while open moves the cursor', () => {
      const ref = createRef<ViewerApi>()
      const { rerender } = render(<Gallerist ref={ref} collection={three} open={{ g: 1 }} />)
      expect(ref.current?.getState().phase).not.toBe('closed')
      expect(ref.current?.getState().cursor).toEqual({ g: 1, i: 0 })
      rerender(<Gallerist ref={ref} collection={three} open={{ g: 0, i: 1 }} />)
      expect(ref.current?.getState().cursor).toEqual({ g: 0, i: 1 })
      // the user navigates; an inline object with the same value doesn't snap back
      act(() => ref.current?.next())
      rerender(<Gallerist ref={ref} collection={three} open={{ g: 0, i: 1 }} />)
      expect(ref.current?.getState().cursor.g).toBe(1)
      rerender(<Gallerist ref={ref} collection={three} open={false} />)
      expect(['closing', 'closed']).toContain(ref.current?.getState().phase)
    })

    it('forwards label, preload, adapters and returnFocus to the renderer', () => {
      const back = document.createElement('button')
      document.body.appendChild(back)
      const returnFocus = vi.fn(() => back)
      const mountMedia = vi.fn((_item: unknown, slot: HTMLElement) => {
        const element = document.createElement('div')
        element.className = 'custom-media'
        slot.appendChild(element)
        return {
          element,
          ready: Promise.resolve(),
          supportsZoom: false,
          destroy: () => element.remove(),
        }
      })
      const adapter: MediaAdapter = { type: 'image', mount: mountMedia }
      const { rerender } = render(
        <Gallerist
          collection={three}
          open
          label="Screenshots"
          preload={{ ahead: 0, behind: 0 }}
          adapters={[adapter]}
          returnFocus={returnFocus}
        />,
      )
      const root = document.querySelector('.gallerist') as HTMLElement
      expect(root.getAttribute('aria-label')).toBe('Screenshots')
      expect(document.querySelectorAll('.gallerist-slide')).toHaveLength(1)
      expect(document.querySelector('.custom-media')).not.toBeNull()
      expect(mountMedia).toHaveBeenCalled()
      rerender(
        <Gallerist
          collection={three}
          open={false}
          label="Screenshots"
          preload={{ ahead: 0, behind: 0 }}
          adapters={[adapter]}
          returnFocus={returnFocus}
        />,
      )
      expect(document.querySelector('.gallerist')).toBeNull()
      expect(returnFocus).toHaveBeenCalled()
      expect(document.activeElement).toBe(back)
      back.remove()
    })

    it('Gallerist.Caption renders the current item into the caption region', () => {
      const ref = createRef<ViewerApi>()
      render(
        <Gallerist ref={ref} collection={three} open>
          <Gallerist.Caption>
            {({ item, group, cursor }) =>
              item.id === 'b' ? null : (
                <b>
                  {group.id}:{item.id}@{cursor.i}
                </b>
              )
            }
          </Gallerist.Caption>
        </Gallerist>,
      )
      const region = () => document.querySelector('.gallerist-region-caption') as HTMLElement
      expect(region().textContent).toBe('g0:a@0')
      expect(document.querySelector('.gallerist-caption-text')?.textContent).toBe('')
      act(() => ref.current?.nextItem())
      expect(region().textContent).toBe('g0:a2@1')
      act(() => ref.current?.next())
      expect(region().textContent).toBe('Text b') // null → the text caption
      act(() => ref.current?.next())
      expect(region().textContent).toBe('g2:c@0')
    })

    it('open goes { g: 1 } → true → false → { g: 1 }: opens there, stays put, closes, reopens there', () => {
      const ref = createRef<ViewerApi>()
      const { rerender } = render(<Gallerist ref={ref} collection={three} open={{ g: 1 }} />)
      expect(ref.current?.getState().cursor).toEqual({ g: 1, i: 0 })
      act(() => ref.current?.next())
      rerender(<Gallerist ref={ref} collection={three} open />)
      expect(ref.current?.getState().phase).not.toMatch(/clos/)
      expect(ref.current?.getState().cursor).toEqual({ g: 2, i: 0 }) // true keeps the position
      rerender(<Gallerist ref={ref} collection={three} open={false} />)
      expect(ref.current?.getState().phase).toBe('closed')
      rerender(<Gallerist ref={ref} collection={three} open={{ g: 1 }} />)
      expect(ref.current?.getState().phase).not.toMatch(/clos/)
      expect(ref.current?.getState().cursor).toEqual({ g: 1, i: 0 })
    })

    it('Gallerist.Caption under StrictMode mounts once and follows navigation', () => {
      const ref = createRef<ViewerApi>()
      render(
        <StrictMode>
          <Gallerist ref={ref} collection={three} open>
            <Gallerist.Caption>{({ item }) => <b className="cap">{item.id}</b>}</Gallerist.Caption>
          </Gallerist>
        </StrictMode>,
      )
      const region = () => document.querySelector('.gallerist-region-caption') as HTMLElement
      expect(document.querySelectorAll('.gallerist-region-caption')).toHaveLength(1)
      expect(region().children).toHaveLength(1) // one portal host after the double effects
      expect(document.querySelectorAll('.cap')).toHaveLength(1)
      expect(region().textContent).toBe('a')
      act(() => ref.current?.next())
      expect(region().children).toHaveLength(1)
      expect(document.querySelectorAll('.cap')).toHaveLength(1)
      expect(region().textContent).toBe('b')
    })

    it('Gallerist.Caption shows the text caption in the theme span for false; an object caption is none', () => {
      const ref = createRef<ViewerApi>()
      const legacy: Collection = {
        groups: [
          {
            id: 'g0',
            items: [
              { id: 'a', type: 'image', source: 'a.jpg', caption: 'Text a' },
              // untyped data still carrying an old object-shaped caption
              {
                id: 'o',
                type: 'image',
                source: 'o.jpg',
                caption: { text: 'x' } as unknown as string,
              },
            ],
          },
        ],
      }
      render(
        <Gallerist ref={ref} collection={legacy} open>
          <Gallerist.Caption>{({ item }) => item.id === 'zzz'}</Gallerist.Caption>
        </Gallerist>,
      )
      const region = () => document.querySelector('.gallerist-region-caption') as HTMLElement
      expect(region().querySelector('span.gallerist-caption-text')?.textContent).toBe('Text a')
      expect(() => act(() => ref.current?.nextItem())).not.toThrow()
      expect(ref.current?.getState().cursor.i).toBe(1)
      expect(region().textContent).toBe('')
      expect(region().querySelector('.gallerist-caption-text')).toBeNull()
    })

    it('removing Gallerist.Caption brings the text caption back', () => {
      const { rerender } = render(
        <Gallerist collection={three} open>
          <Gallerist.Caption>{() => <i>custom</i>}</Gallerist.Caption>
        </Gallerist>,
      )
      expect(document.querySelector('.gallerist-region-caption')?.textContent).toBe('custom')
      rerender(<Gallerist collection={three} open />)
      expect(document.querySelector('.gallerist-region-caption')?.childNodes).toHaveLength(0)
      expect(document.querySelector('.gallerist-caption-text')?.textContent).toBe('Text a')
    })

    it('useCurrentItem() follows the cursor and ignores zoom', () => {
      const ref = createRef<ViewerApi>()
      let renders = 0
      function Current() {
        const { item, cursor } = useCurrentItem()
        renders++
        return (
          <output data-testid="current">
            {item?.id}:{cursor.g}.{cursor.i}
          </output>
        )
      }
      render(
        <Gallerist ref={ref} collection={three} open>
          <Current />
        </Gallerist>,
      )
      expect(screen.getByTestId('current').textContent).toBe('a:0.0')
      act(() => ref.current?.next())
      expect(screen.getByTestId('current').textContent).toBe('b:1.0')
      const before = renders
      act(() => ref.current?.zoomTo(2))
      expect(renders).toBe(before)
    })

    it('ref.current.open({ g, i }) opens at a position', () => {
      const ref = createRef<ViewerApi>()
      render(<Gallerist ref={ref} collection={three} />)
      act(() => ref.current?.open({ g: 2 }))
      expect(counter()).toContain('3 / 3')
    })
  })
})

describe('<Gallerist> — a live rail layout and scheme (plugin-view)', () => {
  const threeGroups: Collection = {
    groups: [
      { id: 'g0', items: [{ id: 'a0', type: 'image', source: 'a0.jpg' }] },
      {
        id: 'g1',
        items: [
          { id: 'b0', type: 'image', source: 'b0.jpg' },
          { id: 'b1', type: 'image', source: 'b1.jpg' },
        ],
      },
      { id: 'g2', items: [{ id: 'c0', type: 'image', source: 'c0.jpg' }] },
    ],
  }
  const root = () => document.querySelector('.gallerist') as HTMLElement
  const display = () => document.querySelector('.gallerist-thumbs')?.getAttribute('data-display')
  const railOf = (v: ViewerApi) =>
    getInternals(v)
      .getPlugins()
      .find((p) => p.name === 'thumbnails') as ThumbnailsInstance
  const choose = (label: string) => {
    act(() => (document.querySelector('.gallerist-view-btn') as HTMLButtonElement).click())
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (i) => i.textContent === label,
    )
    act(() => item?.click())
  }

  it('groupDisplay switches the mounted rail in place: no remount, the item kept', () => {
    const ref = createRef<ViewerApi>()
    const plugins = [thumbnails()]
    const { rerender } = render(
      <Gallerist ref={ref} collection={threeGroups} open plugins={plugins} groupDisplay="flat" />,
    )
    const first = root()
    const rail = document.querySelector('.gallerist-thumbs')
    expect(display()).toBe('flat') // built flat, not switched after mount
    expect(first.getAttribute('data-gallerist-linear')).toBe('true')
    act(() => ref.current?.goTo(1, 1))
    rerender(
      <Gallerist
        ref={ref}
        collection={threeGroups}
        open
        plugins={plugins}
        groupDisplay="stacked"
      />,
    )
    expect(root()).toBe(first)
    expect(document.querySelector('.gallerist-thumbs')).toBe(rail)
    expect(display()).toBeNull()
    expect(first.hasAttribute('data-gallerist-linear')).toBe(false)
    expect(ref.current?.getState().cursor).toMatchObject({ g: 1, i: 1 })
    // omitted: the rail keeps what it shows
    rerender(<Gallerist ref={ref} collection={threeGroups} open plugins={plugins} />)
    expect(railOf(ref.current as ViewerApi).display).toBe('stacked')
  })

  it('groupDisplay under StrictMode: the rail of the second mount gets it', () => {
    render(
      <StrictMode>
        <Gallerist collection={threeGroups} open plugins={[thumbnails()]} groupDisplay="flat" />
      </StrictMode>,
    )
    expect(document.querySelectorAll('.gallerist-thumbs').length).toBe(1)
    expect(display()).toBe('flat')
  })

  it('a scheme set on the root another way stays when the accent changes', () => {
    const { rerender } = render(<Gallerist collection={threeGroups} open accent="mint" />)
    root().setAttribute('data-gallerist-scheme', 'light') // e.g. an uncontrolled View menu
    rerender(<Gallerist collection={threeGroups} open accent="amber" />)
    expect(root().getAttribute('data-gallerist-accent')).toBe('amber')
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    rerender(<Gallerist collection={threeGroups} open accent="amber" scheme="dark" />)
    expect(root().getAttribute('data-gallerist-scheme')).toBe('dark') // a changed prop is written
  })

  it('uncontrolled: the menu applies the choice, React leaves it alone', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Gallerist
        collection={threeGroups}
        open
        accent="mint"
        plugins={[thumbnails(), view({ initial: { scheme: 'light' }, onChange })]}
      />,
    )
    await act(async () => {}) // the initial scheme lands once the button is in the viewer
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    choose('Row')
    expect(display()).toBe('flat')
    choose('Dark')
    expect(onChange).toHaveBeenLastCalledWith({ scheme: 'dark' })
    rerender(
      <Gallerist
        collection={threeGroups}
        open
        accent="amber"
        plugins={[thumbnails(), view({ onChange })]}
      />,
    )
    expect(root().getAttribute('data-gallerist-scheme')).toBe('dark')
    expect(display()).toBe('flat')
  })

  it('controlled: the host owns scheme and groupDisplay; the menu reports and follows', () => {
    const changes: ViewChange[] = []
    function Host() {
      const [prefs, setPrefs] = useState<ViewState>({ rail: 'stacked', scheme: 'dark' })
      const [plugins] = useState(() => [
        thumbnails(),
        view({
          controlled: true,
          onChange: (change) => {
            changes.push(change)
            setPrefs((p) => ({ ...p, ...change }))
          },
        }),
      ])
      return (
        <Gallerist
          collection={threeGroups}
          open
          plugins={plugins}
          scheme={prefs.scheme}
          groupDisplay={prefs.rail}
        />
      )
    }
    render(<Host />)
    const first = root()
    choose('Row')
    expect(changes.at(-1)).toEqual({ rail: 'flat' })
    expect(display()).toBe('flat') // applied by the host's prop
    choose('Light')
    expect(root()).toBe(first) // never remounted
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    act(() => (document.querySelector('.gallerist-view-btn') as HTMLButtonElement).click())
    const checked = [...document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')]
    expect(checked.map((i) => i.textContent)).toEqual(['Row', 'Light'])
  })

  // a thumbnails plugin that counts the switches of a built rail (each one draws the rail again)
  const counted = (count: { switches: number }): Plugin => {
    const make = thumbnails()
    return (v) => {
      const inst = make(v) as ThumbnailsInstance
      const set = inst.setDisplay
      inst.setDisplay = (d) => {
        if (inst.display && inst.display !== d) count.switches++
        set(d)
      }
      return inst
    }
  }

  for (const strict of [false, true]) {
    it(`props own their settings over the menu’s initial values, one build and no switch${strict ? ' (StrictMode)' : ''}`, async () => {
      const count = { switches: 0 }
      const onChange = vi.fn()
      const plugins = [
        counted(count),
        view({ initial: { rail: 'flat', scheme: 'light' }, onChange }),
      ]
      const tree = (
        <Gallerist
          collection={threeGroups}
          open
          groupDisplay="stacked"
          scheme="dark"
          plugins={plugins}
        />
      )
      render(strict ? <StrictMode>{tree}</StrictMode> : tree)
      await act(async () => {})
      expect(display()).toBeNull() // stacked, the prop's
      expect(root().getAttribute('data-gallerist-scheme')).toBe('dark') // the prop's
      expect(count.switches).toBe(0)
      // the menu only reports a choice for them; the props stay
      choose('Row')
      expect(onChange).toHaveBeenLastCalledWith({ rail: 'flat' })
      choose('Light')
      expect(onChange).toHaveBeenLastCalledWith({ scheme: 'light' })
      await act(async () => {})
      expect(display()).toBeNull()
      expect(root().getAttribute('data-gallerist-scheme')).toBe('dark')
      expect(count.switches).toBe(0)
    })
  }

  it('a prop owns only its own setting: the menu applies the other', async () => {
    const count = { switches: 0 }
    render(
      <StrictMode>
        <Gallerist
          collection={threeGroups}
          open
          scheme="dark"
          plugins={[counted(count), view({ initial: { rail: 'flat', scheme: 'light' } })]}
        />
      </StrictMode>,
    )
    await act(async () => {})
    expect(display()).toBe('flat') // the menu's
    expect(count.switches).toBe(0) // built flat
    expect(root().getAttribute('data-gallerist-scheme')).toBe('dark') // the prop's
    choose('Stacked')
    expect(display()).toBeNull()
  })

  it('a remembered choice: the menu owns a setting until the host has a value for it', async () => {
    const KEY = 'gallerist-view-test'
    localStorage.removeItem(KEY)
    function Host() {
      const [prefs, setPrefs] = useState<ViewState>(() =>
        JSON.parse(localStorage.getItem(KEY) ?? '{}'),
      )
      useEffect(() => localStorage.setItem(KEY, JSON.stringify(prefs)), [prefs])
      const [plugins] = useState(() => [
        thumbnails(),
        view({ onChange: (change) => setPrefs((p) => ({ ...p, ...change })) }),
      ])
      return (
        <Gallerist
          collection={threeGroups}
          open
          plugins={plugins}
          scheme={prefs.scheme}
          groupDisplay={prefs.rail}
        />
      )
    }
    const { unmount } = render(<Host />)
    choose('Light')
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ scheme: 'light' })
    unmount()
    render(<Host />)
    await act(async () => {})
    expect(root().getAttribute('data-gallerist-scheme')).toBe('light')
    expect(display()).toBeNull() // the rail was never picked: its own
    choose('Row')
    expect(display()).toBe('flat')
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ scheme: 'light', rail: 'flat' })
    localStorage.removeItem(KEY)
  })
})
