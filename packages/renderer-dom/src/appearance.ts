// Skin, accent and colour scheme (plan P2-A/D). The renderer only reflects them as data attributes
// on the root; the theme's skin files do the rest, so switching any of them never rebuilds the DOM.

/** Visual skin. `gallery` ships in gallerist.css; `console` needs console.css loaded after it. */
export type Skin = 'gallery' | 'console' | (string & {})
/** Accents are named per skin. Gallery: periwinkle (default), mint, amber, vermilion. Console:
 *  amber (default), cyan, vermilion. A name the skin doesn't know falls back to its default. */
export type Accent = 'periwinkle' | 'mint' | 'amber' | 'cyan' | 'vermilion' | (string & {})
/** `auto` follows the system's `prefers-color-scheme`. */
export type ColorScheme = 'dark' | 'light' | 'auto'

export interface Appearance {
  skin?: Skin
  accent?: Accent
  scheme?: ColorScheme
}

/**
 * Write an appearance onto a viewer root (`data-gallerist-skin|accent|scheme`). Only the options
 * present in `appearance` change, so `applyAppearance(root, { accent: 'cyan' })` keeps the skin and
 * scheme; an option present but `undefined` goes back to its default (`gallery`, `dark`, the skin's
 * own accent).
 */
export function applyAppearance(root: HTMLElement, appearance: Appearance): void {
  if ('skin' in appearance) root.setAttribute('data-gallerist-skin', appearance.skin ?? 'gallery')
  if ('scheme' in appearance)
    root.setAttribute('data-gallerist-scheme', appearance.scheme ?? 'dark')
  if ('accent' in appearance) {
    if (appearance.accent) root.setAttribute('data-gallerist-accent', appearance.accent)
    else root.removeAttribute('data-gallerist-accent')
  }
}
