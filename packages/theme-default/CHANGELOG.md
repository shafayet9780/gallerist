# @gallerist/theme-default

## 0.4.0

### Minor Changes

- 0c322f5: **New: `@gallerist/plugin-shortcuts`.** `shortcuts()` lists the viewer's keyboard shortcuts in a modal
  dialog on `?` (with the viewer focused, not in a text field), from the View menu's last row, or from
  the host (`open()` / `close()` on the plugin). The list is built from what the viewer does as it is
  laid out: groups on ←/→ and items on ↑/↓ (or turned by a side rail; mirrored right to left), a row
  rail's ←/→ through every item, Home/End, 1–9, the zoom keys, and the plugins' keys while they hold
  them (F, T, E, G, P, C, D), with the host's own entries (`shortcuts: [{ keys, label, gesture?,
section? }]`). On a touch screen it lists the gestures instead (swipes, pinch or double-tap, drag,
  swipe down to close). `role="dialog"`, `aria-modal`, named by its title; the rest of the viewer is
  inert, Tab stays inside, focus goes back on close; Escape closes it and only it, and no other key
  reaches the viewer while it shows. A sheet from the bottom on a phone; both schemes, every skin, right
  to left, no motion under reduced motion. Not in the `@gallerist/cdn` bundle.
- 8ccd430: **New: `@gallerist/plugin-zoom`.** `zoom()` adds a "− 100% +" tool to the toolbar: zoom out, the
  current zoom (press it to fit the image again), zoom in, through stops of the zoom range (fit, 150%,
  200%, 300%, 400%), pivoting on the stage's centre. The percentage follows a pinch, a wheel or a double
  click as it moves. − and + are unavailable at the ends of the range and while the item can't zoom (a
  video, loading, an error); a zoom from the tool or its keys is announced. While the viewer has
  focus, `+` / `=`, `-` and `0` take the same steps, except where they are someone else's: a text field
  (in a shadow root too), a dialog or menu in the viewer (the View popover), a slider, spinbutton, tree
  or grid, or with a modifier. Stops outside the DOM renderer's range (fit to 400%) are brought into it.
  The renderer's own zoom-reset button stays out of a bar that shows the tool. A phone (600px or less)
  leaves the tool out of the bar (a pinch zooms, and the renderer's reset shows while zoomed);
  `--gallerist-phone-zoom: flex` keeps it, with − and + only. A `hidden` tool stays hidden. Not in the
  `@gallerist/cdn` bundle.
- 8ccd430: **The rail: glides open and shut, pulls instead of scrolling, clearer row dividers, whole group labels.**
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
- 4d371aa: **Host hooks in the rail.** Four new `thumbnails()` options let a host show its own data where it
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
