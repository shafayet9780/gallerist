// @vitest-environment happy-dom

import { act, cleanup, render, screen } from '@testing-library/react'
import type { Collection, ViewerApi } from '@visora/core'
import { StrictMode, createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Visora } from './Visora'
import { useViewerContext } from './context'
import { useVisora } from './useVisora'

const collection: Collection = {
  groups: [
    { id: 'g0', items: [{ id: 'a', type: 'image', source: 'a.jpg' }] },
    { id: 'g1', items: [{ id: 'b', type: 'image', source: 'b.jpg' }] },
  ],
}

afterEach(cleanup)

describe('<Visora>', () => {
  it('mounts and opens the viewer when open is true', () => {
    render(<Visora collection={collection} open />)
    expect(document.querySelector('.visora')).not.toBeNull()
    expect(document.querySelector('.visora-counter')?.textContent).toContain('1 / 2')
  })

  it('closes when open flips to false and fires onClose', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Visora collection={collection} open onClose={onClose} />)
    expect(document.querySelector('.visora')).not.toBeNull()
    rerender(<Visora collection={collection} open={false} onClose={onClose} />)
    expect(document.querySelector('.visora')).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('exposes the viewer via ref (imperative)', () => {
    const ref = createRef<ViewerApi>()
    render(<Visora collection={collection} open ref={ref} />)
    expect(ref.current).not.toBeNull()
    act(() => ref.current?.next())
    expect(ref.current?.getState().cursor.g).toBe(1)
  })

  it('survives StrictMode double-mount: one root, usable viewer, overlay renders', () => {
    const ref = createRef<ViewerApi>()
    render(
      <StrictMode>
        <Visora collection={collection} open ref={ref}>
          <Visora.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
            <span>Badge</span>
          </Visora.Overlay>
        </Visora>
      </StrictMode>,
    )
    expect(document.querySelectorAll('.visora').length).toBe(1)
    expect(document.querySelector('.visora-viewport-layer')?.textContent).toContain('Badge')
    act(() => ref.current?.next())
    expect(ref.current?.getState().cursor.g).toBe(1)
  })

  it('tears down on unmount', () => {
    const { unmount } = render(<Visora collection={collection} open />)
    expect(document.querySelector('.visora')).not.toBeNull()
    unmount()
    expect(document.querySelector('.visora')).toBeNull()
  })
})

function Counter() {
  const { state } = useVisora(useViewerContext())
  return <div data-testid="cnt">{state.cursor.g}</div>
}

describe('useVisora', () => {
  it('reflects state changes via useSyncExternalStore', () => {
    const ref = createRef<ViewerApi>()
    render(
      <Visora collection={collection} open ref={ref}>
        <Counter />
      </Visora>,
    )
    expect(screen.getByTestId('cnt').textContent).toBe('0')
    act(() => ref.current?.next())
    expect(screen.getByTestId('cnt').textContent).toBe('1')
  })
})

describe('portal bridge', () => {
  it('Visora.Region portals JSX into a named region', () => {
    render(
      <Visora collection={collection} open>
        <Visora.Region name="toolbar">
          <button type="button">Hi</button>
        </Visora.Region>
      </Visora>,
    )
    expect(document.querySelector('.visora-region-toolbar')?.textContent).toContain('Hi')
  })

  it('Visora.Overlay portals JSX into the overlay layer', () => {
    render(
      <Visora collection={collection} open>
        <Visora.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
          <span>Badge</span>
        </Visora.Overlay>
      </Visora>,
    )
    expect(document.querySelector('.visora-viewport-layer')?.textContent).toContain('Badge')
  })

  it('removes the overlay when the React node unmounts', () => {
    const { rerender } = render(
      <Visora collection={collection} open>
        <Visora.Overlay anchor={{ kind: 'viewport', at: 'top-right' }}>
          <span>Badge</span>
        </Visora.Overlay>
      </Visora>,
    )
    expect(document.querySelector('.visora-viewport-layer')?.textContent).toContain('Badge')
    rerender(<Visora collection={collection} open />)
    expect(document.querySelector('.visora-viewport-layer')?.textContent ?? '').not.toContain(
      'Badge',
    )
  })
})
