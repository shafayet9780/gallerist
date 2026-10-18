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
  resetZoom: string
  showThumbnails: string
  hideThumbnails: string
  /** label of an item pill in the position indicator */
  item: (n: number) => string
  /** announced on group navigation, e.g. "Group 2 of 12" */
  groupOf: (n: number, total: number) => string
  /** announced on item navigation (and for every item in linear mode), e.g. "Item 3 of 5" */
  itemOf: (n: number, total: number) => string
}

export const DEFAULT_STRINGS: Strings = {
  dialog: 'Media viewer',
  carousel: 'carousel',
  close: 'Close',
  previous: 'Previous',
  next: 'Next',
  previousItem: 'Previous item',
  nextItem: 'Next item',
  resetZoom: 'Reset zoom',
  showThumbnails: 'Show thumbnails',
  hideThumbnails: 'Hide thumbnails',
  item: (n) => `Item ${n}`,
  groupOf: (n, total) => `Group ${n} of ${total}`,
  itemOf: (n, total) => `Item ${n} of ${total}`,
}
