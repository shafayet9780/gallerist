# @gallerist/theme-default

## 0.5.1

### Patch Changes

- f6d5ef2: **theme-default (fixed):** the blurred loading placeholder fills the image's box on a page with a CSS
  reset such as Tailwind's preflight. The reset's `img { max-width: 100% }` capped the placeholder image,
  which is drawn 2 × the blur larger than its box on every side so the blur's fringe is clipped, so it
  sat 12px up and to the left and left a soft 12px strip along the box's end and bottom edges while the
  image loaded. The placeholder image now sets `max-width: none; max-height: none`. The rest of the
  viewer's media (the stage image and video, rail and peek thumbs, grid cells, pins, the error icon and
  the toolbar icons) already kept their size under such a reset.

  **theme-default (fixed):** the chrome keeps its size on a page whose reset switches every element to
  `box-sizing: border-box` (Tailwind's preflight). Five elements are a length plus padding or a border
  and were drawn content-box by default, so the reset took that out of them: the toolbar was 12px
  shorter (13px with Console's or Editorial's border) and the stage grew by as much; a side index
  (the tour's cards) and a side rail were 24px narrower; the index and grid section counts lost 12px;
  the zoom navigator lost its 2px border. `.gallerist-bar`, `.gallerist-thumbs`,
  `.gallerist-thumb-row-count`, `.gallerist-grid-section-count` and `.gallerist-navigator` now set
  `box-sizing: content-box`; the theme's rules are unlayered, so the class wins over the reset. With the
  reset, every element of the viewer in all three skins (toolbar, tools, zoom group, caption, rail,
  thumbs, chips, index cards, grid, shortcut list, View menu, pin cards, loading pill, Retry) is now
  the size it is without one. The reset's `border: 0 solid` changes nothing: no element relied on a
  browser default border.

  **theme-default (new token):** the zoom navigator's frame takes `--gallerist-navigator-border`, the
  accent unless a page sets it, so the default look is unchanged. A host whose accent is neutral (a
  near-black accent on the light scheme) got a frame that all but vanished over a dark screenshot, on a
  surround dimmed 45% (about 1.1:1). Set a light one there, such as `#fff`, which keeps 3.35:1 or more
  against the dimmed surround over any image. The skins' own accents keep about 3:1, so no scheme
  changes its default.

  Upgrading: a page with a `box-sizing: border-box` reset gets the designed sizes now: the toolbar is
  12px taller (Console 56 → 68px, Editorial 72 → 85px), a side rail and a side index are 24px wider, and
  the stage is smaller by as much. A page that tuned `--gallerist-toolbar-h`, `--gallerist-rail-w` or
  its own layout to make up for the smaller chrome should check those values. Without such a reset,
  nothing changes.

## 0.5.0

### Minor Changes

- 1490006: **renderer-dom (changed):** an item's `placeholder` now shows. It is drawn at once in the box the
  image will paint in (from `naturalSize`, else the placeholder image's own shape, else
  `--gallerist-media-ratio`): an image URL or data URI blurred and clipped to that box, a colour as a
  flat fill. The image fades in over it and the blur clears. A load still running after 400ms shows a
  quiet pill in the box's bottom end corner, "Loading full size…" (a polite `role="status"` line, empty
  until that delay, so a fast load neither shows nor says it). A failed load keeps the image placeholder, sharp, and the pill says
  "Couldn't load full size" with a Retry button that loads the item afresh (focus on it goes to the
  viewer, and back to the new Retry if the load fails again while focus is still there). A colour
  placeholder gets no pill. With no placeholder, a skeleton fills the box after 300ms, gone at once
  when the image is in (a failure still shows the error card). New strings:
  `loadingFull`, `loadFailed`, `retry`. Adapters get `strings` and `retry()` in their context
  (`DomAdapterCtx`). Pass the thumbnail URL the page already loaded as `placeholder`: it is cached, so
  moving between items never flashes an empty stage. With reduced motion the placeholder isn't
  blurred, nothing shimmers or spins, and the image still fades in (it no longer cuts in).

  **theme-default (new):** `--gallerist-placeholder-blur` (6px), `--gallerist-dur-reveal` (150ms, the
  image's fade-in; was 180ms), `--gallerist-media-ratio` (`3 / 2`), `--gallerist-loading-delay` (400ms).
  The Console and Gallery dark skeleton shimmer is brighter (`--gallerist-shimmer` 9% / 8%, was 5% /
  6%). `.gallerist-content` is a size container (`container-type: size`).

  **core (docs):** `Item.placeholder` documents what it takes and how it shows.

  Upgrading: a `placeholder` that never showed (it was painted on the image while the image was still
  hidden) now shows while the image loads: an image placeholder blurred in the image's box, a colour
  filling that box. Check that it is the same picture as the image (a thumbnail of it), or drop it.
  The full-stage shimmer that started 600ms into a slow load is gone: the skeleton, the placeholder
  and the pill take its place. A string placeholder is a colour when it reads as one (`#…`, a name,
  `rgb(…)` and other functions) and the browser parses it as one (`CSS.supports('color', …)`),
  otherwise an image URL (a bare `thumb.jpg` or `thumb` is now a URL; `rgb(0 0 0 / 50%)` is now a
  colour). `Strings` has three new required members, `loadingFull`, `loadFailed` and `retry`:
  `mount(viewer, { strings })` takes a partial set and fills them in, but code that builds a whole
  `Strings` object itself (a typed translation table) must add them.

- 1b121a3: **theme-default (new):** five tokens for the rail's current and focused states, each defaulting to
  today's look. `--gallerist-label-current` (the accent) and `--gallerist-label-current-weight` (500)
  style the current group's label on a flat rail and the current time label on a timeline (its tick
  too), so a page whose accent means something else (a Save button) can keep the label neutral.
  `--gallerist-thumb-focus-style` (`solid`) is a focused thumb's outline style: `dashed` tells keyboard
  focus apart from a solid selection ring. `--gallerist-thumb-focus-offset-current` (2px) moves the
  focus ring further out on the current thumb, whose ring sits outside it.
  `--gallerist-thumb-focus-opacity` (1) is the opacity of a focused thumb that isn't current: today it
  brightens as on hover; `var(--gallerist-thumb-idle-opacity)` keeps it dimmed, so the bright thumb is
  always the current one (hover still brightens). A screenshot reviewer's
  neutral selection, in a page's CSS:

  ```css
  .gallerist {
    --gallerist-selection: #f5f6f7;
    --gallerist-thumb-active-border: var(
      --gallerist-rail-bg
    ); /* the 2px dark gap */
    --gallerist-item-ring: 0 0 0 2px var(--gallerist-selection);
    --gallerist-label-current: #f5f6f7;
    --gallerist-label-current-weight: 600;
    --gallerist-focus: #f5f6f7;
    --gallerist-thumb-focus-style: dashed;
    --gallerist-thumb-focus-offset-current: 6px;
    --gallerist-thumb-focus-opacity: var(--gallerist-thumb-idle-opacity);
  }
  ```

- 39a85f6: **plugin-thumbnails (changed):** wherever the current card and the cards either side of it can't all
  show, the rail shows the current card and the next one the way the cursor goes whole, centred
  together, wherever those two fit, whatever lies behind. 0.4.1 did so only where more lay between the
  current card and the one ahead than behind it, and otherwise centred the current card, which cut the
  next one off: on a 390px phone, stepping into a one-screen timeframe whose label line is wider than
  its card (44–48px cut in the e2e fixture), or between evenly spaced cards too wide for three. Where the
  two don't fit either, the current card is still centred; where the three fit, nothing changes.

  **theme-default (changed):** on a phone (`(max-width: 600px) and (pointer: coarse)`, where the rail's
  ‹ › page buttons never show) `--gallerist-rail-fade` is 16px (was 40px), and so is the rail's
  `scroll-padding`. The current card, kept clear of the fade, now leaves room for the card ahead past a
  marker or a wide label (0.4.1 left it cut by what the 40px fade took: 6px in the e2e fixture, 16px in
  Apploye's). A desktop, and a narrow window with a mouse, keep 40px.

  Upgrading: a page that relied on 0.4.1's centring between evenly spaced cards (a narrow index-chip
  rail) sees the current card and the next one centred together instead. A page that wants 0.4.1's
  phone fade sets `--gallerist-rail-fade: 40px` on `.gallerist` (a page's tokens win over the theme's).

- 69193d3: **theme-default (new):** `--gallerist-thumb-badge-inset-block` places an item thumb's badge
  (plugin-thumbnails `renderItemBadge`): its `inset-block` from the thumb's image, `3px auto` (the top
  end corner, as before). `.gallerist { --gallerist-thumb-badge-inset-block: auto 3px; }` puts it in the
  image's bottom end corner, for a screenshot reviewer whose thumbs' tops hold the window titles. It is
  measured from the image, not the thumb, so a caption band under the image stays clear, in every skin,
  right to left, on flat and stacked rails, in the peek and on a phone. Nothing else sits in that corner.

  **plugin-thumbnails (docs):** `renderItemBadge` documents the token.

  Upgrading: an item thumb (`.gallerist-thumb-item`) is a one-column grid (was a flex column), so the
  badge can be placed in its image's row; its image and caption band lay out as before. A page that
  styled an item thumb's children as flex items (`order`, `flex-grow`) sets `display: flex;
flex-direction: column` on `.gallerist-thumb-item` to keep them.

## 0.4.1

### Patch Changes

- 4d52beb: **plugin-thumbnails (fixed):** where a `markers()` entry, or a group label widened by
  `renderGroupMeta`, lies between the current card and the next one the way the cursor goes, and the
  current card and the cards either side of it can't all show (a 390px phone), the rail shows the current
  card and that next one whole, centred together, instead of centring the current card and cutting the
  next one off. Evenly spaced cards are unchanged: where the three can't show there, the current card is
  still centred. Flat, stacked, index, side and right-to-left rails, windowed too, and the stacked item
  column (its next item). The current card shows clear of the rail's end fades (the theme's
  `scroll-padding`), never dimmed or under a ‹ › button; the card ahead may run into the far fade. The way
  the cursor went survives a step between one group's items, the items toggle, a reopen, a display switch
  and new data; a step onto the last card drawn draws the card ahead before deciding. The rail's scrolls
  are whole pixels (WebKit could cut up to 2px off a card meant to show), and re-windowing carries the
  fraction over instead of drifting.

  **plugin-shortcuts (fixed):** `?` opens the list as soon as the viewer has focus, during its opening
  fade too, as the other keys do; never over a viewer that is closing. `open()` from the host follows the
  same rule.

  **theme-default (changed):** with a fine pointer the Console skin's bar is compact, as in the mockup:
  36px tools with 18px glyphs (Close 20px), plugin-zoom's "− 100% +" one bordered group 30px tall (− and

  - 30 × 28, the percentage 54px wide between two hairlines), and a 1 × 20 hairline before Close. A touch
    keeps 44px targets; Gallery and Editorial keep 44px tools. New tokens `--gallerist-tool-size`,
    `--gallerist-tool-icon`, `--gallerist-close-icon`, `--gallerist-zoom-group`, `--gallerist-close-rule`.
    The hairline is a border, so it shows in forced colours. A flat rail's group label and its
    `renderGroupMeta` meta are 12px apart (were 8px). The rail has a `scroll-padding` of
    `--gallerist-rail-fade` at its ends.

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
