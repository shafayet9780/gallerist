---
"@gallerist/plugin-thumbnails": patch
"@gallerist/plugin-shortcuts": patch
"@gallerist/theme-default": patch
---

**plugin-thumbnails (fixed):** where a `markers()` entry, or a group label widened by
`renderGroupMeta`, lies between the current card and the next one the way the cursor goes, and the
current card and the cards either side of it can't all show (a 390px phone), the rail shows the current
card and that next one whole, centred together, instead of centring the current card and cutting the
next one off. Evenly spaced cards are unchanged: where the three can't show there, the current card is
still centred. Flat, stacked, index, side and right-to-left rails, windowed too, and the stacked item
column. The rail's scrolls are whole pixels (WebKit could cut up to 2px off a card meant to show).

**plugin-shortcuts (fixed):** `?` opens the list as soon as the viewer has focus, during its opening
fade too, as the other keys do; never over a viewer that is closing. `open()` from the host follows the
same rule.

**theme-default (changed):** with a fine pointer the Console skin's bar is compact, as in the mockup:
36px tools with 18px glyphs (Close 20px), plugin-zoom's "− 100% +" one bordered group 30px tall (− and
+ 30 × 28, the percentage 54px wide between two hairlines), and a 1 × 20 hairline before Close. A touch
keeps 44px targets; Gallery and Editorial keep 44px tools. New tokens `--gallerist-tool-size`,
`--gallerist-tool-icon`, `--gallerist-close-icon`, `--gallerist-zoom-group`, `--gallerist-close-rule`.
A flat rail's group label and its `renderGroupMeta` meta are 12px apart (were 8px).
