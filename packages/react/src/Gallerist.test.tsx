// @vitest-environment happy-dom

import type { Collection, ViewerApi } from '@gallerist/core'
import { getInternals } from '@gallerist/core/internal'
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode, createRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Gallerist } from './Gallerist'
import { useViewerContext } from './context'
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
    expect(root.getAttribute('data-gallerist-arrows')).toBe('corner-br') // reviewer default
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

  it('passes navigator to the renderer, overriding the preset', () => {
    render(<Gallerist collection={collection} open preset="reviewer" navigator={false} />)
    expect(document.querySelector('.gallerist-navigator')).toBeNull()
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
})
