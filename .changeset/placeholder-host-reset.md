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
