# @gallerist/plugin-view

## 0.4.0

### Minor Changes

- 89fa587: **A toolbar tool with keyboard focus shows its whole focus ring.** The toolbar's tools (fullscreen,
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
- 0c322f5: **The View menu is a compact popover with segmented controls.** Layout [Stacked | Row] and Theme
  [Dark | Light] (Index and Auto when offered), each segment an icon and a name, the current one raised
  on a recessed track with its glyph in the selection colour; the keyboard's segment takes the neutral
  focus ring. A choice applies at once and the popover stays open; it follows a host that applies a
  controlled choice while it's open. With `@gallerist/plugin-shortcuts` registered, a last row,
  "Keyboard shortcuts ?" ("Gestures" on a touch screen), opens the shortcut list. Each setting is now a
  radio group (`role="radio"` segments, roving focus) in a non-modal `role="dialog"`, the tool's
  `aria-haspopup` is `dialog`: ←/→ (↑/↓) move and choose, mirrored right to left; Space or a click
  chooses; Enter chooses and closes; Tab moves between the groups and past either end closes; Escape
  closes; `?` opens the shortcut list. The API is unchanged; the default `rail` / `scheme` strings now
  read "Layout" / "Theme". New theme tokens: `--gallerist-popover-bg`, `--gallerist-popover-shadow`,
  `--gallerist-seg-track`, `--gallerist-seg-on`, `--gallerist-seg-on-shadow`. plugin-view's size budget
  goes from 2.4 to 3 kB (2.93 kB).

## 0.3.3

### Patch Changes

- d1ffac5: Switch the rail's layout and the colour scheme in an open viewer, from a new View menu.

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
  - **Index chips of different widths keep their neighbours in view (plugin-thumbnails).** A chip is
    as wide as its group's name, and centring the current chip could leave a wider chip beside it cut
    off though the three fit in the rail (from 0.3.2). Where they fit, the rail now goes on from the
    centre only as far as shows all three; where they don't, it centres the current chip, as before.
    While the three show whole the rail still doesn't move.
