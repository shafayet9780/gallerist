# @gallerist/plugin-pins

## 0.5.2

## 0.5.1

## 0.5.0

### Minor Changes

- 39a85f6: **plugin-thumbnails (changed):** wherever the current card and the cards either side of it can't all
  show, the rail shows the current card and the next one the way the cursor goes whole, centred
  together, wherever those two fit, whatever lies behind. 0.4.1 did so only where more lay between the
  current card and the one ahead than behind it, and otherwise centred the current card, which cut the
  next one off: on a 390px phone, stepping into a one-screen timeframe whose label line is wider than
  its card (44–48px cut in the e2e fixture), or between evenly spaced cards too wide for three. Where the
  two don't fit either, the current card is still centred; where the three fit, nothing changes.

  **theme-default (changed):** on a phone (`(max-width: 600px) and (pointer: coarse)`, where the rail's
  ‹ › page buttons never show) `--gallerist-rail-fade` is 16px (was 40px), and so is the rail's
  `scroll-padding`. The current card, kept clear of the fade, now leaves room for the card ahead past a
  marker or a wide label (0.4.1 left it cut by what the 40px fade took: 6px in the e2e fixture, 16px in
  Apploye's). A desktop, and a narrow window with a mouse, keep 40px.

  Upgrading: a page that relied on 0.4.1's centring between evenly spaced cards (a narrow index-chip
  rail) sees the current card and the next one centred together instead. A page that wants 0.4.1's
  phone fade sets `--gallerist-rail-fade: 40px` on `.gallerist` (a page's tokens win over the theme's).

## 0.4.1

## 0.4.0

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
