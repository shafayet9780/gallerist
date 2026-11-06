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
  Light). Choices, labels (`strings`), start values (`initial`) and `onChange(change)` are options.
  `onChange` reports the one setting picked (`{ rail: 'flat' }` or `{ scheme: 'light' }`) when it
  differs from the stored value, never a scheme resolved from the system or the skin: a rail choice
  on a viewer following the system keeps it following the system, and Dark picked there stores
  `dark`. By default the plugin applies a choice itself; a host that owns a setting (`controlled:
  true`, `['scheme']`, `['rail']`, or the viewer marked with `Symbol.for('gallerist.controlled')`)
  gets only the report, and the plugin never writes that setting. Unknown `initial` values (old
  storage) are ignored, and the user's choices are kept per viewer. With nothing to offer
  (`scheme: false` and no rail mounted) the tool is hidden. It follows the ARIA menu button pattern
  (`aria-haspopup`, `aria-expanded`, `role="menu"` with a `menuitemradio` group per section; ↑/↓,
  Home/End, a letter, Enter/Space, Escape and Tab; focus back on the tool; a press outside closes
  it, inside a shadow root too) and keeps the keys it handles from the viewer. It is not in the
  `@gallerist/cdn` bundle, which it would take past its size budget.
- **A rail switches its display at run time (plugin-thumbnails).** `setGroupDisplay(viewer,
  display)` switches a mounted rail between `stacked`, `flat` and `index` in place (the last
  thumbnails plugin registered, whose rail shows), and `getGroupDisplay(viewer)` reads it. The
  current item stays, the rail is drawn again around it, a zoomed image stays zoomed, and the preset
  rules hold (`timeline` carries into `flat`; `itemAxis` and `numberItems` belong to the preset's own
  display). Before the rail mounts it sets the display the rail mounts with. A rail now keeps its
  items toggle and its `aside` column for every display it can switch to, instead of leaving them
  out: on a flat rail the toolbar holds the toggle `hidden` and marked `data-gallerist-off`, and the
  aside region holds the column `hidden`. A flat rail still leaves `e` to other plugins, and so
  does a rail not built yet.
- **The renderer follows a switched rail (renderer-dom).** `viewer.refresh()` now also reads the
  rail's `data-gallerist-linear` and the plugins' keymaps again, so a rail switched to or from `flat`
  turns linear traversal on or off at once, with the counter, the item navigator and the arrows'
  names (unless `mount()` got `linear`), and hands `e` over. With `controls: false` the bar hides
  when every tool it holds is marked `data-gallerist-off` (a tool kept for a later layout); a tool
  that only sets `hidden` still shows it, as before.
- **React (react).** A reactive `groupDisplay` prop switches the mounted rail without a remount.
  While `scheme` or `groupDisplay` is passed, it owns that setting: a View menu only reports a choice
  for it, and its `initial` doesn't apply, so the two never resolve opposite ways (StrictMode, Fast
  Refresh). `skin`, `accent` and `scheme` are now each written only when they change, so a scheme set
  by the View menu stays when the accent changes.
- **The menu's look (theme-default).** The View menu takes each skin's panel, hairline, selection and
  focus colours, in both schemes, and fits a 390px phone. The item under the pointer takes the tool
  hover fill and the keyboard's item the focus ring, so they never look alike. A rail's hidden
  `aside` column takes no room.
