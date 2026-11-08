---
"@gallerist/theme-default": patch
---

**theme-default (fixed):** the blurred loading placeholder fills the image's box on a page with a CSS
reset such as Tailwind's preflight. The reset's `img { max-width: 100% }` capped the placeholder image,
which is drawn 2 × the blur larger than its box on every side so the blur's fringe is clipped, so it
sat 12px up and to the left and left a soft 12px strip along the box's end and bottom edges while the
image loaded. The placeholder image now sets `max-width: none; max-height: none`. The rest of the
viewer's media (the stage image and video, rail and peek thumbs, grid cells, pins, the error icon and
the toolbar icons) already kept their size under such a reset.

**theme-default (fixed):** the chrome keeps its size on a page whose reset switches every element to
`box-sizing: border-box` (Tailwind's preflight). Five elements are a length plus padding or a border
and were drawn content-box by default, so the reset took that out of them: the toolbar was 12px
shorter (13px with Console's or Editorial's border) and the stage grew by as much; a side index
(the tour's cards) and a side rail were 24px narrower; the index and grid section counts lost 12px;
the zoom navigator lost its 2px border. `.gallerist-bar`, `.gallerist-thumbs`,
`.gallerist-thumb-row-count`, `.gallerist-grid-section-count` and `.gallerist-navigator` now set
`box-sizing: content-box`; the theme's rules are unlayered, so the class wins over the reset. With the
reset, every element of the viewer in all three skins (toolbar, tools, zoom group, caption, rail,
thumbs, chips, index cards, grid, shortcut list, View menu, pin cards, loading pill, Retry) is now
the size it is without one. The reset's `border: 0 solid` changes nothing: no element relied on a
browser default border.

**theme-default (new token):** the zoom navigator's frame takes `--gallerist-navigator-border`, the
accent unless a page sets it, so the default look is unchanged. A host whose accent is neutral (a
near-black accent on the light scheme) got a frame that all but vanished over a dark screenshot, on a
surround dimmed 45% (about 1.1:1). Set a light one there, such as `#fff`, which keeps 3.35:1 or more
against the dimmed surround over any image. The skins' own accents keep about 3:1, so no scheme
changes its default.
