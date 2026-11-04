// @vitest-environment happy-dom

import type { Collection, ViewerApi } from '@gallerist/core'
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

  it('applies preset, theme, and arrow layout to the root', () => {
    render(<Gallerist collection={collection} open preset="reviewer" theme="cyan" />)
    const root = document.querySelector('.gallerist') as HTMLElement
    expect(root.getAttribute('data-gallerist-preset')).toBe('reviewer')
    expect(root.getAttribute('data-gallerist-arrows')).toBe('corner-br') // reviewer default
    expect(root.getAttribute('data-gallerist-theme')).toBe('cyan')
  })

  it('updates the theme attribute when the theme prop changes', () => {
    const { rerender } = render(<Gallerist collection={collection} open theme="cyan" />)
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-theme')).toBe('cyan')
    rerender(<Gallerist collection={collection} open theme="vermilion" />)
    expect(document.querySelector('.gallerist')?.getAttribute('data-gallerist-theme')).toBe(
      'vermilion',
    )
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
