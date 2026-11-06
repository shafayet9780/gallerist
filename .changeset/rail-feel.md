---
"@gallerist/plugin-thumbnails": minor
"@gallerist/theme-default": minor
---

**The rail: glides open and shut, pulls instead of scrolling, clearer row dividers, whole group labels.**
Collapsing the rail (its handle, `t`, fullscreen) and bringing it back now animates its height (a side
rail's width) over `--gallerist-dur-panel` (220ms), so the stage refits smoothly and a zoomed image
keeps its view; a stacked rail's item column does the same as it opens and closes. Nothing moves under
reduced motion or with a `--gallerist-dur-panel` of 0; a closing panel is inert, then hidden as
before. The rail shows no scrollbar: a mouse or pen drags it along its length (a drag never clicks a
card; a click, even one that wobbles across the rail, still selects), a vertical wheel scrolls a
sideways rail, each end with more beyond it (cards not drawn yet count) fades, and ‹ › buttons at
those ends page it on hover
(out of the tab order; the keys already walk the rail). Touch keeps native scrolling; right to left
throughout. In a dark scheme the dividers between a row rail's groups are lifted to about 2:1 (new
token `--gallerist-divider`; light keeps its hairline). A group label wider than its items (a time
range over a one-item group) widens its group to show whole, up to three card heights, then ends in an
ellipsis, with the whole label in its `title` while it is cut. The theme now paints the rail's band on
`.gallerist-thumbs-region` instead of `.gallerist-thumbs`: a page that styled the strip's background
or border should move that to the region.
