# @gallerist/renderer-dom

## 0.4.1

## 0.4.0

### Minor Changes

- 051f91d: **Keys from a field in a shadow root, and keys typed with AltGr.** A text field inside an open shadow
  root in the viewer (a host's web component) keeps its keys, as a field in the light DOM always did: the
  viewer reads the event's first target, not the shadow host. A plugin's key typed with AltGr (Ctrl + Alt
  on Windows, as `?` is on some layouts) reaches the plugin instead of being taken for a browser chord.
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
- 64ff779: **The viewer leaves a key a host already took.** Any key a handler inside the viewer already took
  with `preventDefault()` does nothing in the viewer (until now only Escape was checked), so a host
  popover in the caption can walk its own list with the arrows and close itself on Escape before the
  viewer closes. Keys typed in a text field inside the viewer stay there, as before.

## 0.3.3

### Patch Changes

- ad6de1f: **A docked arrow focused from a keyboard on a touch screen no longer covers the media.** With
  `arrows: 'docked'` (the `reviewer` preset) the group arrows are visually hidden on touch, where swipes
  navigate, and the stage takes the full width. A keyboard or switch user who tabbed to one (a tablet
  with a keyboard, say) got it back at the stage edge, over the image: on a 390×844 phone, over the
  start of a full-width screenshot. Now the stage makes room for it only while a group arrow has
  keyboard focus, as much on each side, so letterboxed media holds still: on a landscape screen a
  gutter at each side; on a portrait one a band above and below the stage, with the arrows in the
  bottom band (↑ in the top one on a vertical group axis). Landscape or portrait is the screen's, not
  the viewer's. This holds on a stacked rail (the arrows step groups) and a flat one (they step
  screens), left to right and right to left. A focused docked arrow also stays above the zoom minimap,
  which could cover it on a short stage, with a mouse too.

  **Zoomed in, a stage that shrinks and grows back returns to the same view.** The pan was clamped to
  the smaller stage and stayed clamped when it grew back: zoomed 2× at a panorama's right edge on a
  touch tablet, tabbing past a docked arrow left the view about 140px short of that edge, and a
  rotation there and back did the same. Now the part of the image at the stage's centre stays there
  through a resize, and the view comes back as it was. That memory is the current item's, against
  the box it was clamped to: moving to another item (the zoom carries over within a group) or a load
  in between never pans to a view nobody saw, and a stage with no size (hidden) commits nothing and
  fires no `zoom` event. Known limitation, as before: a resize in the middle of a pinch, or before a
  wheel zoom settles, shows the re-clamped view for a frame, and the gesture then commits from where it
  began, in the old stage's pixels (clamped to the new stage), not from the re-clamped view.

  **Idle auto-hide no longer fades a control that has keyboard focus**, nor the band (or `immersive`
  rail) it is in, so a keyboard user who pauses on one still sees where focus is. A press on the stage
  (a click, a tap) moves focus to the viewer, so the chrome fades again; a swipe or pinch moves no
  focus, as a page scroll doesn't. Where `:has()` and `:focus-visible` are unsupported (iOS Safari
  before 15.4) all of it fades, as before, and the idle rules keep their selectors' specificity, so a
  page's own idle style still applies.

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

## 0.3.2

## 0.3.1

### Patch Changes

- 7e6f446: Complete the flat thumbnails rail (`thumbnails({ groupDisplay: 'flat' })`).

  - **Look (theme-default).** Flat groups are no longer bordered boxes with an accent stripe. Each
    group's items sit under a small muted label, with a 1px hairline between neighbouring groups (a
    horizontal line on a side rail, where the groups now run down the rail with their items in a
    column instead of being cut off). Only the current group's label takes the accent; the plugin marks
    that group `data-active`.
  - **Timeline labels on a flat rail (plugin-thumbnails).** `timeline` now works in `flat` mode: each
    group is headed by its timeline label (`group.meta.time`, or your function's result), falling back
    to `group.caption`. The label is part of the group's accessible name. A preset's `timeline` (the
    `reviewer`'s) now carries into an explicit `groupDisplay: 'flat'`; pass `timeline: false` to drop it.
  - **A flat rail implies linear traversal (renderer-dom, react).** `linear` now defaults to following
    the rail: while a flat thumbnails rail is mounted, ←/→ walk every item in rail order across groups,
    the counter reads `item N / total`, and the ↑/↓ item navigator hides. This is a behaviour change for
    flat rails: pass `linear: false` to `mount()` (`linear={false}` in React) to keep the group and item
    axes. Stacked and index rails, and viewers without a rail, are unchanged.
