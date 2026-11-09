---
"@gallerist/theme-default": patch
---

**theme-default (fixed):** the viewer's text keeps its font on a page whose stylesheet sets
`* { font-family: …; font-weight: … }` (Apploye's Montserrat 500). That rule matches every element, so
an element that set no font of its own took the page's instead of its parent's: the stacked rail's
time text went sans (the label is drawn in `--gallerist-mono`) and the current label lost
`--gallerist-label-current-weight`, and the index rows, the item position count ("1 / 3"), the View
menu's labels and choices, the shortcut list and the loading pill's text took the page's family (and,
for some, its weight). Every element of the viewer now inherits its parent's family and weight unless
the theme sets its own; a class beats the page's unlayered `*`. Buttons keep the browser's font, as
before. A host's own nodes (a group's meta, a badge, a caption) still follow the page's rules.

**theme-default (fixed):** the stacked rail's track line no longer strikes through the time labels.
It ran behind the whole label, and nothing hid it under the text (plain to see on the Light scheme).
It is now a leader from the end of the label's text (and of a host's meta in the label) to the next
card's tick: `● 10:49 – 10:50 ──── ● 10:50 – 11:00`. A label as long as its text keeps the same width;
its line then shows only in the gap between the cards. A host's meta in a time label now sits after
the time, the leader after it, rather than at the label's far end. A side rail still draws no line.
