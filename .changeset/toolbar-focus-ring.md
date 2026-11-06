---
"@gallerist/theme-default": patch
"@gallerist/renderer-dom": patch
---

**A toolbar tool with keyboard focus shows its whole focus ring.** The toolbar's tools (fullscreen,
save, View, the rail's items toggle, the grid, any plugin tool) sit in a strip that scrolls sideways on
a narrow screen, and a scroller clips on both axes, so since 0.3.0 a focused tool's ring was cut to a
bracket on each side, in every skin and scheme; Close, outside the strip, had it whole. The strip now
keeps room for the ring on every side, given back by a negative margin, so nothing in the bar moves.
On a phone where the tools scroll, a tool reached from the keyboard is brought fully into view with
its ring: browsers leave a tool 32px or more in view where it is, cut by the strip's edge. The strip
now takes the bar's free space itself, its tools still at the end, so its box is wider than its
tools where no title shows, and it uses its own `::before` and `::after`; a page that styled the
strip's `margin`, `padding` or those pseudo-elements should check it.
