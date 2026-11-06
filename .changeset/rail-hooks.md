---
"@gallerist/plugin-thumbnails": minor
"@gallerist/theme-default": minor
---

**Host hooks in the rail.** Four new `thumbnails()` options let a host show its own data where it
belongs: `renderGroupMeta(group, index, { display, place })` draws a decoration per group (an activity
meter, a note count) at the end of a flat group's label line, under a stacked card, and at the end of a
stacked timeline label; `renderItemBadge(item, g, i)` puts a badge in each item thumb's top end corner
(a monitor number); `cluster(item, g, i)` sets consecutive items with the same key 2px apart and 8px
between clusters (`--gallerist-cluster-inner`, `--gallerist-cluster-gap`); `markers(collection)` draws
`RailMarker`s between groups (time logged without screenshots), which are never a stop for the keys,
not counted, not focusable, named for assistive tech, with a host tooltip on hover or a long press.
What a decoration says joins the card's or thumb's accessible name. `refreshRail(viewer)` draws them
again in place after the host's data changed. A stacked timeline label longer than its card (a range
with a note count) now widens its card's column to show whole, clear of the next card's label, up to
three card heights, then ends in an ellipsis with the whole label in its `title` (down a side rail it
keeps the rail's width). On a phone (600px or less) the bar leaves out the zoom
tool (a pinch zooms; the renderer's reset shows while zoomed) and an overlay viewer's fullscreen (it
fills the screen; an inline viewer keeps it); `--gallerist-phone-zoom` and
`--gallerist-phone-fullscreen` keep them. Markers whose group isn't in the collection, or whose id
repeats an earlier one, aren't drawn.
