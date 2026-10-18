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

/** Write an appearance onto a viewer root (`data-gallerist-skin|accent|scheme`). Skin and scheme
 *  always carry a value (default `gallery` / `dark`); no accent means the skin's default. */
export function applyAppearance(root: HTMLElement, { skin, accent, scheme }: Appearance): void {
  root.setAttribute('data-gallerist-skin', skin ?? 'gallery')
  root.setAttribute('data-gallerist-scheme', scheme ?? 'dark')
  if (accent) root.setAttribute('data-gallerist-accent', accent)
  else root.removeAttribute('data-gallerist-accent')
}
