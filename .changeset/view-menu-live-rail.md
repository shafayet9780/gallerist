---
"@gallerist/plugin-view": patch
"@gallerist/plugin-thumbnails": patch
"@gallerist/renderer-dom": patch
"@gallerist/react": patch
"@gallerist/theme-default": patch
---

Switch the rail's layout and the colour scheme in an open viewer, from a new View menu.

- **New: `@gallerist/plugin-view`.** `view()` adds one toolbar tool, "View", that opens a small
  menu: **Rail** (Stacked or Row, shown while a thumbnails rail is mounted) and **Scheme** (Dark or
  Light). Choices, labels (`strings`), start values (`initial`) and `onChange(state)` are options.
  By default the plugin applies a choice itself; `controlled: true` (or `['scheme']`, `['rail']`)
  only reports it, for the host to apply. It follows the ARIA menu button pattern (`aria-haspopup`,
  `aria-expanded`, `role="menu"` with a `menuitemradio` group per section; ↑/↓, Home/End, a letter,
  Enter/Space, Escape and Tab; focus back on the tool; a press outside closes it) and keeps the keys
  it handles from the viewer. It is not in the `@gallerist/cdn` bundle, which it would take past its
  size budget.
- **A rail switches its display at run time (plugin-thumbnails).** `setGroupDisplay(viewer,
  display)` switches a mounted rail between `stacked`, `flat` and `index` in place, and
  `getGroupDisplay(viewer)` reads it. The current item stays, the rail is drawn again around it, a
  zoomed image stays zoomed, and the preset rules hold (`timeline` carries into `flat`; `itemAxis`
  and `numberItems` belong to the preset's own display). Before the rail mounts it sets the display
  the rail mounts with. A rail now keeps its items toggle and its `aside` column for every display
  it can switch to: hidden on a flat rail (where `e` does nothing), instead of left out.
- **The renderer follows a switched rail (renderer-dom).** `viewer.refresh()` now also reads the
  rail's `data-gallerist-linear` again, so a rail switched to or from `flat` turns linear traversal
  on or off at once, with the counter, the item navigator and the arrows' names (unless `mount()`
  got `linear`). With `controls: false` the bar shows while it holds a tool that isn't hidden.
- **React (react).** A reactive `groupDisplay` prop switches the mounted rail without a remount.
  `skin`, `accent` and `scheme` are now each written only when they change, so a scheme set by the
  View menu stays when the accent changes.
- **The menu's look (theme-default).** The View menu takes each skin's panel, hairline, selection and
  focus colours, in both schemes, and fits a 390px phone. A rail's hidden `aside` column takes no
  room.
