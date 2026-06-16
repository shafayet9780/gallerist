// @visora/plugin-fullscreen — native Fullscreen API toggle (spec §14).
// Adds a toolbar button + the `f` key, fullscreens the viewer root, and emits `fullscreenChange`.
// Plugins may touch the DOM (the headless invariant binds @visora/core only).

import type { Plugin } from '@visora/core'

export interface FullscreenOptions {
  /** CSS selector for the element to fullscreen; defaults to the viewer root. */
  target?: string
}

export function fullscreen(opts: FullscreenOptions = {}): Plugin {
  return (viewer) => {
    const root = () =>
      (opts.target
        ? document.querySelector(opts.target)
        : document.querySelector('.visora')) as HTMLElement | null
    const isFs = () => typeof document !== 'undefined' && !!document.fullscreenElement

    const toggle = async () => {
      const el = root()
      if (!el) return
      try {
        if (isFs()) await document.exitFullscreen?.()
        else await el.requestFullscreen?.()
      } catch {
        // user-gesture / permission failures are non-fatal
      }
    }

    const onChange = () => viewer.emit('fullscreenChange', { viewer, fullscreen: isFs() })

    const button = () => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'visora-fullscreen-btn'
      btn.setAttribute('aria-label', 'Toggle fullscreen')
      btn.textContent = '⛶'
      btn.addEventListener('click', () => {
        void toggle()
      })
      return btn
    }

    return {
      name: 'fullscreen',
      init() {
        if (typeof document !== 'undefined') {
          document.addEventListener('fullscreenchange', onChange)
        }
      },
      destroy() {
        if (typeof document !== 'undefined') {
          document.removeEventListener('fullscreenchange', onChange)
        }
      },
      keymap: {
        f: () => {
          void toggle()
        },
      },
      regions: {
        toolbar: button,
      },
    }
  }
}
