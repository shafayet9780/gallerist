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

**theme-default (new token):** the zoom navigator's frame takes `--gallerist-navigator-border`, the
accent unless a page sets it, so the default look is unchanged. A host whose accent is neutral (a
near-black accent on the light scheme) got a frame that all but vanished over a dark screenshot, on a
surround dimmed 45% (about 1.1:1). Set a light one there, such as `#fff`, which keeps 3.35:1 or more
against the dimmed surround over any image. The skins' own accents keep about 3:1, so no scheme
changes its default.
