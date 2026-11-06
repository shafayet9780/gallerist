---
"@gallerist/theme-default": patch
"@gallerist/renderer-dom": patch
"@gallerist/plugin-view": patch
---

**A toolbar tool with keyboard focus shows its whole focus ring.** The toolbar's tools (fullscreen,
save, View, the rail's items toggle, the grid, any plugin tool) sit in a strip that scrolls sideways on
a narrow screen, and a scroller clips on both axes, so since 0.3.0 a focused tool's ring was cut to a
bracket on each side, in every skin and scheme; Close, outside the strip, had it whole. The strip now
keeps room for the ring on every side, given back by a negative margin, so the bar's contents keep
their places (where a title shows and the tools scroll, the title can end up to half a pixel shorter
or longer, the tools moving with it, and the scroll range 1px longer).
On a phone where the tools scroll, a tool reached from the keyboard is brought fully into view with
its ring: browsers leave a tool 32px or more in view where it is, cut by the strip's edge. The strip
now takes the bar's free space itself (a shown title shares it), its tools still at the end, so its
box is wider than its tools, and it uses its own `::before` and `::after`; a page that styled the
strip's `margin`, `padding`, `flex` or those pseudo-elements should check it. Like every region it
lets pointer events through except on its tools, so the free space stays the bar's (under the
`immersive` bar, the image's); a drag or wheel starting in the 6px between two tools no longer
scrolls the strip, one starting on a tool does. The View tool,
opened by a pointer while the strip hides part of it, comes into view with the same room (plugin-view
reads the strip's `scroll-padding`).
