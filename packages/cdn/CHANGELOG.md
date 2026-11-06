# @gallerist/cdn

## 0.3.3

## 0.3.2

### Patch Changes

- bd24083: Two fixes found in the reviewer layout on phones.

  - **An open pin card no longer sits under the zoom minimap (plugin-pins).** After zooming in with
    a card open (a pinch or ctrl+wheel), the minimap (`navigator: true`, on in the `reviewer` preset)
    could cover the start of the card, such as the note field of a draft comment. The card now keeps
    clear of the minimap, as it already did of the docked item navigator: when the minimap is in the
    card's columns, the card's room ends above or below it, whichever leaves more, and the card stays
    on its side of the pin (scrolling if it no longer fits). This works in every corner the minimap
    uses (the top one on a phone, the bottom one on wider screens, mirrored right to left). The card is
    placed again when the minimap shows or hides with the zoom.
  - **The thumbnails rail keeps the next card in view (plugin-thumbnails).** Stepping through the rail
    used to leave the current card flush against the rail's far edge, so the card that came next was
    out of view; on a phone, at item 14 of 15 the 15th was off screen. Now, while the current card and
    the cards on either side of it show whole, the rail stays put, so clicking a card in view doesn't
    move it. Once one of them would be cut off, the rail centres the current card. At either end the
    scroll stops at the first or last card. This applies to every rail that scrolls (`flat`, `stacked`,
    `index` rows and chips, side rails, right to left) and to the item column. The rail still scrolls
    instantly, with no animation.

## 0.3.1

### Patch Changes

- 7e6f446: Complete the flat thumbnails rail (`thumbnails({ groupDisplay: 'flat' })`).

  - **Look (theme-default).** Flat groups are no longer bordered boxes with an accent stripe. Each
    group's items sit under a small muted label, with a 1px hairline between neighbouring groups (a
    horizontal line on a side rail, where the groups now run down the rail with their items in a
    column instead of being cut off). Only the current group's label takes the accent; the plugin marks
    that group `data-active`.
  - **Timeline labels on a flat rail (plugin-thumbnails).** `timeline` now works in `flat` mode: each
    group is headed by its timeline label (`group.meta.time`, or your function's result), falling back
    to `group.caption`. The label is part of the group's accessible name. A preset's `timeline` (the
    `reviewer`'s) now carries into an explicit `groupDisplay: 'flat'`; pass `timeline: false` to drop it.
  - **A flat rail implies linear traversal (renderer-dom, react).** `linear` now defaults to following
    the rail: while a flat thumbnails rail is mounted, ←/→ walk every item in rail order across groups,
    the counter reads `item N / total`, and the ↑/↓ item navigator hides. This is a behaviour change for
    flat rails: pass `linear: false` to `mount()` (`linear={false}` in React) to keep the group and item
    axes. Stacked and index rails, and viewers without a rail, are unchanged.
