---
"@gallerist/plugin-thumbnails": patch
"@gallerist/theme-default": patch
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
again in place after the host's data changed. On a phone (600px or less) the bar leaves out the zoom
tool and fullscreen (a pinch zooms; the viewer fills the screen); `--gallerist-phone-zoom` and
`--gallerist-phone-fullscreen` keep them.
