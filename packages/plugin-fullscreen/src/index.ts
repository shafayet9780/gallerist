// @gallerist/plugin-fullscreen — native Fullscreen API toggle (spec §14).
// Adds a toolbar button + the `f` key, fullscreens the viewer root, and emits `fullscreenChange`.
// Plugins may touch the DOM (the headless invariant binds @gallerist/core only).

import type { Plugin } from '@gallerist/core'
import { ICONS, getInternals } from '@gallerist/core/internal'

export interface FullscreenStrings {
  /** the toolbar button's label */
  toggle: string
}

export const DEFAULT_FULLSCREEN_STRINGS: FullscreenStrings = { toggle: 'Toggle fullscreen' }

export interface FullscreenOptions {
  /** CSS selector for the element to fullscreen; defaults to the bound viewer's root. */
  target?: string
  /** UI text overrides, for translation; merged over English. */
  strings?: Partial<FullscreenStrings>
}

// WebKit (older Safari / iPadOS) ships the prefixed Fullscreen API. iPhone has no element
// fullscreen at all (only <video>), which the unprefixed-or-prefixed calls below no-op on.
type WebkitDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export function fullscreen(opts: FullscreenOptions = {}): Plugin {
  return (viewer) => {
    // The plugin is bound to one viewer, but the Fullscreen API and its change event are
    // document-global. Resolve and remember *this* viewer's root (captured from the mounted
    // toolbar button) so multi-viewer pages don't fullscreen / exit the wrong element (I-PL4).
    let boundRoot: HTMLElement | null = null
    const resolveRoot = (from?: HTMLElement | null): HTMLElement | null => {
      if (opts.target) return document.querySelector<HTMLElement>(opts.target)
      return (
        boundRoot ??
        from?.closest<HTMLElement>('.gallerist') ??
        document.querySelector('.gallerist')
      )
    }

    const fsElement = (): Element | null =>
      document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement ?? null
    // Base enter/exit on whether *our* root is the fullscreen element, not just "is anything
    // fullscreen" — otherwise an unrelated fullscreen <video> would make our button exit it (S-PL5).
    const isOurFullscreen = (el: HTMLElement | null): boolean => {
      const fe = fsElement()
      return !!fe && !!el && (fe === el || el.contains(fe))
    }
    const requestFs = (el: HTMLElement) =>
      (el.requestFullscreen ?? (el as WebkitEl).webkitRequestFullscreen)?.call(el)
    const exitFs = () =>
      (document.exitFullscreen ?? (document as WebkitDoc).webkitExitFullscreen)?.call(document)

    const toggle = async (from?: HTMLElement | null) => {
      const el = resolveRoot(from)
      if (!el) return
      boundRoot = el
      try {
        if (isOurFullscreen(el)) await exitFs()
        else await requestFs(el)
      } catch {
        // user-gesture / permission failures are non-fatal
      }
    }

    let btnEl: HTMLButtonElement | null = null
    // Look the internals up when emitting, not at construction, so building the plugin against a
    // wrapped viewer or a test double doesn't throw.
    const onChange = () => {
      const fullscreen = isOurFullscreen(resolveRoot())
      btnEl?.setAttribute('aria-pressed', String(fullscreen)) // a toggle: pressed while fullscreen
      getInternals(viewer).emit('fullscreenChange', { viewer, fullscreen })
    }

    const button = () => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'gallerist-fullscreen-btn'
      btn.setAttribute('aria-label', opts.strings?.toggle ?? DEFAULT_FULLSCREEN_STRINGS.toggle)
      btn.setAttribute('aria-pressed', 'false')
      btn.innerHTML = ICONS.fullscreen
      btnEl = btn
      btn.addEventListener('click', () => void toggle(btn))
      // Capture our root once the button is mounted (so onChange/`f` target the right viewer).
      queueMicrotask(() => {
        boundRoot = btn.closest<HTMLElement>('.gallerist') ?? boundRoot
      })
      return btn
    }

    return {
      name: 'fullscreen',
      init() {
        if (typeof document !== 'undefined') {
          document.addEventListener('fullscreenchange', onChange)
          document.addEventListener('webkitfullscreenchange', onChange)
        }
      },
      destroy() {
        btnEl = null
        if (typeof document !== 'undefined') {
          document.removeEventListener('fullscreenchange', onChange)
          document.removeEventListener('webkitfullscreenchange', onChange)
        }
      },
      keymap: {
        f: () => void toggle(),
      },
      regions: {
        toolbar: button,
      },
    }
  }
}
