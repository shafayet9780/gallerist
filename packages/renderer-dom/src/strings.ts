// Every piece of UI text the DOM renderer produces (button labels and the screen-reader
// announcements), overridable per mount via `mount(viewer, { strings })` for translation. Positions
// are functions so a language can order the words and numbers itself. Wording stays generic: the
// renderer never assumes what a group or an item is ("screen", "product"); data captions carry that.

export interface Strings {
  /** accessible name of the overlay dialog (the `label` mount option still wins) */
  dialog: string
  /** role description announced for an inline viewer */
  carousel: string
  close: string
  previous: string
  next: string
  previousItem: string
  nextItem: string
  /** name of a labelled group arrow (`arrowLabels`), given the group it goes to */
  previousTo: (name: string) => string
  nextTo: (name: string) => string
  resetZoom: string
  showThumbnails: string
  hideThumbnails: string
  /** name of a caption renderer's band while it scrolls (it then takes focus, to scroll by keyboard) */
  caption: string
  /** label of an item pill in the position indicator */
  item: (n: number) => string
  /** announced on group navigation, e.g. "Group 2 of 12" */
  groupOf: (n: number, total: number) => string
  /** announced on item navigation (and for every item in linear mode), e.g. "Item 3 of 5" */
  itemOf: (n: number, total: number) => string
  /** a slow image's status over its placeholder, and its failure (with `retry`, a button) */
  loadingFull: string
  loadFailed: string
  retry: string
}

export const DEFAULT_STRINGS: Strings = {
  dialog: 'Media viewer',
  carousel: 'carousel',
  close: 'Close',
  previous: 'Previous',
  next: 'Next',
  previousItem: 'Previous item',
  nextItem: 'Next item',
  previousTo: (name) => `Previous: ${name}`,
  nextTo: (name) => `Next: ${name}`,
  resetZoom: 'Reset zoom',
  showThumbnails: 'Show thumbnails',
  hideThumbnails: 'Hide thumbnails',
  caption: 'Caption',
  item: (n) => `Item ${n}`,
  groupOf: (n, total) => `Group ${n} of ${total}`,
  itemOf: (n, total) => `Item ${n} of ${total}`,
  loadingFull: 'Loading full size…',
  loadFailed: 'Couldn’t load full size',
  retry: 'Retry',
}
