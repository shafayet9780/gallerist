---
"@gallerist/theme-default": patch
---

**theme-default (fixed):** the viewer's text keeps its font on a page whose stylesheet sets
`* { font-family: …; font-weight: … }` (Apploye's Montserrat 500). That rule matches every element, so
an element that set no font of its own took the page's instead of its parent's: the stacked rail's
time text went sans (the label is drawn in `--gallerist-mono`) and the current label lost
`--gallerist-label-current-weight`, and the index rows, the item position count ("1 / 3"), the View
menu's labels and choices, the shortcut list and the loading pill's text took the page's family (and,
for some, its weight). Each of the viewer's elements now inherits its parent's family and weight
unless the theme sets its own; a class beats the page's unlayered `*`. Buttons keep the browser's
font, as before. The root, which sets a family but no weight, still takes the page's weight, as it
takes a body's; the caption text, which inherited it, is now drawn at 400, its designed weight. A
host's own nodes (a group's meta, a badge, a caption) still follow the page's rules.

**theme-default (upgrading):** that reset (`font: inherit` on a class, unlayered) also beats a host's
font rule aimed at a Gallerist class from a cascade layer (Tailwind v4 layers everything), whatever
its specificity, and an unlayered one of a single class that loads before the theme:
`@layer host { .gallerist-thumb-time-text { font-weight: 700 } }` worked on 0.5.1 and no longer does.
Such a rule must now be unlayered and load after the theme, or be more specific than one class
(`.gallerist .gallerist-thumb-time-text`). No rule can beat an unlayered `*` and still lose to a layer.

**theme-default (fixed):** the stacked rail's track line no longer strikes through the time labels.
It ran behind the whole label, and nothing hid it under the text (plain to see on the Light scheme).
It is now a leader from the end of the label's text (and of a host's meta in the label) to the next
card's tick: `● 10:49 – 10:50 ──── ● 10:50 – 11:00`. A label as long as its text keeps the same width;
its line then shows only in the gap between the cards. A host's meta in a time label now sits after
the time, the leader after it, rather than at the label's far end. A side rail still draws no line.
The card's wrapper no longer isolates its stacking, nor is the time label positioned: a host's
z-indexed content in a group's meta stacks with the rail's, and absolutely positioned content in a
label's meta anchors to the wrapper.
