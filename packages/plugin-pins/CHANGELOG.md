# @gallerist/plugin-pins

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
