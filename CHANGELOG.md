# Changelog

## v0.5.2

A patch release: every package goes from 0.5.1 to 0.5.2 (one fixed version group). Two fixes to the
stacked (timeline) rail's labels from Apploye: their font on a page that sets one on `*`, and a track
line that struck through them; and one to the rail's step on a phone, which left the card ahead cut
by a px past the rail's edge where group widths are fractional. Peer ranges stay `>=0.3.0 <1`.

### Upgrading: what looks different
- **theme-default**: a host's meta in a stacked time label (`renderGroupMeta`, `place: 'label'`) sits
  right after the time, the track's leader after it, rather than at the label's far end. Where the
  label is as long as its text (the meta's usual case) nothing moves.

### Fixes
- **theme-default**: on a page with `* { font-family: …; font-weight: … }` (Apploye's Montserrat
  500), the viewer's text keeps its font. That rule matches every element, so one that set no font of
  its own took the page's: the stacked rail's time text went sans and the current label lost
  `--gallerist-label-current-weight`; the index rows, the item position count, the View menu, the
  shortcut list and the loading pill's text took the page's family. Every element of the viewer now
  inherits its parent's family and weight unless the theme sets its own (buttons keep the browser's
  font, as before); a host's own nodes still follow the page. Checked in all three skins against the
  same page without the rule.
- **theme-default**: the stacked rail's track line no longer strikes through the time labels (plain
  to see on the Light scheme). It is a leader from the end of the label's text (and a host's meta) to
  the next card's tick; a label as long as its text keeps its width, and shows its line only in the
  gap between the cards. A side rail still draws none.
- **plugin-thumbnails**: on a rail whose cards and groups have fractional widths (a host's group meta,
  Apploye's after its activity meter left the label line), a step no longer leaves the card ahead cut
  by more than 1px at the rail's edge (1.1px on a 390px phone at 2x: the next timeframe's first
  screen). The step's whole-px scroll and the re-window's after it each rounded, the re-window also
  making up a fraction left over from before the step; the step now hands its own fraction to the
  re-window, so the two land within half a px of the mark. Cards that overrun the rail by under a px
  share it between both ends (stepping back, the card ahead took all of it).

### Sizes
Unchanged: base.css 10.42 kB of 10.42 kB (a few rules merged or shortened to shorthands make room).

## v0.5.1

A patch release: every package goes from 0.5.0 to 0.5.1 (one fixed version group). Three fixes from
the Apploye reviewer's check of its viewer on 0.5.0: on a page with a CSS reset, the blurred loading
placeholder and the chrome's sizes; and a zoom navigator frame that a neutral accent all but hid. Peer
ranges stay `>=0.3.0 <1`.

### Upgrading: what looks different
- **theme-default**: a page with a `box-sizing: border-box` reset (Tailwind's preflight) has had the
  chrome smaller than designed, and now gets the designed sizes: the toolbar grows by 12px (Console
  56 → 68px, Editorial 72 → 85px with its border), a side rail and a side index grow 24px wider, and
  the stage shrinks by as much. A page that tuned `--gallerist-toolbar-h`, `--gallerist-rail-w` or
  its own layout to make up for the smaller chrome should look at those values again. A page without
  such a reset sees no change.

### Fixes
- **theme-default**: on a page with a CSS reset such as Tailwind's preflight, the blurred placeholder
  fills the image's box while the image loads. The reset's `img { max-width: 100% }` capped the
  placeholder image, which is drawn 2 × `--gallerist-placeholder-blur` larger than its box on every
  side so the blur's fringe is clipped, so it sat 12px up and to the left and left a soft 12px strip
  along the box's end and bottom edges. It now sets `max-width: none; max-height: none`. The viewer's
  other media (the stage image and video, rail and peek thumbs, grid cells, pins, the error icon and
  the toolbar icons) already kept their size under such a reset.
- **theme-default**: on a page whose reset makes every element `box-sizing: border-box` (Tailwind's
  preflight), the chrome keeps its size. The toolbar was 12px shorter (13px with a skin's border),
  so the stage grew; a side index (the tour's cards) and a side rail were 24px narrower; the index
  and grid section counts lost their padding and the zoom navigator its border. Those five elements
  now set `box-sizing: content-box` (an unlayered class rule, so it wins over the reset). Measured in
  all three skins, every element of the viewer is the size it is without a reset.
- **theme-default**: the zoom navigator's frame takes a new token, `--gallerist-navigator-border`
  (unset: the accent, so nothing changes by default). A host whose accent is neutral (Apploye's
  near-black on the light scheme) had a frame of about 1.1:1 over a dark screenshot's dimmed
  surround; set a light one there, such as `#fff` (3.35:1 or more over any image). The skins' own
  accents keep about 3:1, so no scheme changes its default.

### Sizes
Unchanged: base.css 10.42 kB of 10.42 kB (a few rules merged or shortened to shorthands make room).

## v0.5.0

A minor release: every package goes from 0.4.1 to 0.5.0 (one fixed version group). Plugins can take
the renderer's keys, a flat rail's ↑/↓ can walk a cluster, the phone rail shows the card ahead whole,
an item badge can sit in the bottom corner, and `placeholder` finally shows while an image loads.
Peer ranges stay `>=0.3.0 <1`. Each package's CHANGELOG has the full notes.

### Upgrading: what behaves or looks different
- **renderer-dom**: a plugin's `keymap` is asked before the renderer's own keys (an arrow, Home/End,
  `+`/`-`/`0`, `t`, 1–9, Escape). An entry for one of them used to be ignored; now it runs first, and
  the renderer's key runs too unless the handler calls `preventDefault()`. A plugin given a renderer
  key on purpose (`grid({ key: 't' })`) now toggles both. A host's capture-phase `keydown` listener
  that took a key with `preventDefault()` keeps working. A plugin's arrow keys no longer come from
  inside a dialog, menu or slider in the viewer, a host's listbox, tab list, radio group, menu bar,
  tree or grid, or from a menu button.
- **renderer-dom**: an item's `placeholder` now shows (it was painted on the image while the image was
  still hidden): an image placeholder blurred in the image's box, a colour filling it. Make sure it is
  a thumbnail of the same picture, or drop it. The full-stage shimmer of a slow load is gone (a
  skeleton, the placeholder and a "Loading full size…" pill replace it). A bare string such as
  `thumb.jpg` or `thumb` is now an image URL, and `rgb(0 0 0 / 50%)` a colour. `Strings` has three new
  required members (`loadingFull`, `loadFailed`, `retry`): `mount(…, { strings })` fills them in, but
  a whole `Strings` object built by hand must add them.
- **theme-default**: on a phone (`(max-width: 600px) and (pointer: coarse)`) `--gallerist-rail-fade`
  and the rail's `scroll-padding` are 16px (were 40px); `--gallerist-rail-fade: 40px` on `.gallerist`
  brings 0.4.1's back. The image's fade-in is 150ms (was 180ms). The Console and Gallery dark skeleton
  shimmer is brighter. `.gallerist-content` is a size container.
- **theme-default**: an item thumb (`.gallerist-thumb-item`) is a one-column grid (was a flex column).
  A page that styled its children as flex items sets `display: flex; flex-direction: column` on it.
- **plugin-thumbnails**: wherever the current card and its neighbours can't all show, the current card
  and the one ahead are centred together where those two fit (0.4.1 centred the current card alone
  unless more lay ahead), so a narrow index-chip rail between evenly spaced cards moves a little.

### New
- **plugin-thumbnails**: `clusterKeys: true`: on a flat rail, plain ↑/↓ step to the next / previous
  item of the current one's `cluster` (a screenshot reviewer's other monitor), with no host keyboard
  code; a focused caption band still scrolls with ↑/↓. Not on a stacked rail, not with Shift or a
  chord, and not on a side rail with `linear: false`, where ↑/↓ step by group.
- **plugin-shortcuts**: lists "Previous / next in the cluster" while `clusterKeys` holds ↑/↓
  (`strings.prevNextCluster`).
- **renderer-dom**: the loading sequence: the placeholder at once (blurred by
  `--gallerist-placeholder-blur`, 6px), the image fading in over `--gallerist-dur-reveal` (150ms) as
  the blur clears, a quiet "Loading full size…" pill after `--gallerist-loading-delay` (400ms; its
  polite status line stays empty until then), a failure that keeps the placeholder with a Retry
  button (keyboard focus comes back to it if the retry fails too), and a skeleton after 300ms when
  there is no placeholder (`--gallerist-media-ratio`, 3/2, sizes it without `naturalSize`). Reduced
  motion: no blur, shimmer or spin. Adapters get `strings` and `retry()` in their context.
- **theme-default**: `--gallerist-thumb-badge-inset-block` places `renderItemBadge`'s badge from the
  thumb's image (`3px auto`, top end, as before; `auto 3px`, bottom end).
- **theme-default**: rail state tokens, each defaulting to today's look:
  `--gallerist-label-current` / `--gallerist-label-current-weight` (the current group's label),
  `--gallerist-thumb-focus-style` (`dashed` tells focus from a solid selection ring),
  `--gallerist-thumb-focus-offset-current`, and `--gallerist-thumb-focus-opacity`
  (`var(--gallerist-thumb-idle-opacity)` keeps a focused thumb that isn't current dimmed).

### Fixes
- **renderer-dom**: a plugin keymap handler that throws no longer stops the renderer's own key
  (Escape still closes); its error is reported.
- **plugin-thumbnails / theme-default**: on a 390px phone the next card past a marker or a wide group
  label shows whole (it was cut by up to 48px).

### Sizes
core + renderer-dom 17.11 kB (was 16.65), + plugin-thumbnails 26.13 kB (was 25.6), base.css
10.42 kB (was 10), plugin-shortcuts 2.86 kB (was 2.85); the CDN bundle is 38.9 kB of 40.

## v0.4.1

A patch release: every package goes from 0.4.0 to 0.4.1 (one fixed version group). Two fixes from the
Apploye reviewer's check of its viewer on 0.4.0, the Console skin's compact toolbar from the 0.3.4
mockup, and a wider gap before a flat rail's group meta. Peer ranges stay `>=0.3.0 <1`.

### Upgrading: what looks different
- **theme-default**: with a fine pointer (a mouse or trackpad) the Console skin's toolbar is compact:
  tools are 36px (were 44px) with 18px glyphs (were 22px; Close 20px), plugin-zoom's "− 100% +" is one
  bordered group 30px tall instead of three loose 44px tools, and a 1 × 20 hairline sits before Close
  (on touch too, 9px of room). A page that measured or restyled the Console bar's tools should check
  them; `--gallerist-tool-size: 44px`, `--gallerist-tool-icon: 22px`, `--gallerist-close-icon: 22px`,
  `--gallerist-zoom-group: 0` and `--gallerist-close-rule: 0px` on `.gallerist` bring 0.4.0's bar back.
  A touch keeps 44px targets; Gallery and Editorial are unchanged.
- **theme-default**: the rail (`.gallerist-thumbs`) has a `scroll-padding` of `--gallerist-rail-fade`
  (40px) at its ends (inline; block on a side rail), which plugin-thumbnails reads to keep the current
  card clear of the end fades. A card focused with Tab lands clear of them too. A page that set its own
  `scroll-padding` on the rail (a symmetric length) moves the current card's margin with it.
- **theme-default**: a flat rail's group label and its `renderGroupMeta` meta are 12px apart (were
  8px), so a group whose label line is wider than its cards is 4px wider.

### Fixes
- **plugin-thumbnails (fixed)**: the next card past a marker or a wide label shows whole. On a 390px
  phone the flat rail centred the current card wherever it and the cards either side of it couldn't
  all show, which is what happens when a `markers()` entry, or a group label widened by
  `renderGroupMeta`, lies between them; the next timeframe's first card was then cut off, though it
  would have shown whole beside the current one. Now, where the three can't show and more lies
  between the current card and the one ahead (the next one stepping forward, the previous one
  stepping back) than between it and the one behind, the rail shows the current card and the one
  ahead whole, centred together, and stays put while those two already show; where even the two
  can't fit, it centres the current card. Where the three fit, and where cards are evenly spaced
  (index chips on a phone, a short side rail), nothing changes. Flat, stacked, index, side and
  right-to-left rails, windowed too, and the stacked item column (its next item; the column doesn't
  track which way the cursor went). The current card shows clear of the rail's end fades (the
  theme's `scroll-padding`, 40px), so, where the card fits, it is not dimmed or under a ‹ › page button; where that leaves
  too little room for the two (the 390px phone), the card ahead runs into the far fade. The way the
  cursor went is the last step along the rail: a step between one group's items, the items toggle
  (`e`), reopening the viewer, a display switch or new data keep it. A step onto the last card the rail
  has drawn draws the card ahead first, so it counts. The rail's scrolls are whole pixels, so WebKit
  (which drops a scroll's fraction) no longer cuts up to 2px off a card meant to show whole; keeping
  its place while it draws and drops cards carries the fraction over, so cards of fractional width
  (84 × 16/9) don't drift half a pixel a time.
- **plugin-shortcuts (fixed)**: `?` opens the list as soon as the viewer has focus, during its opening
  fade too, as the other keys already did (it was ignored until the fade ended). It never opens over a
  viewer that is closing; `open()` from the host follows the same rule.

### The compact Console toolbar (from the 0.3.4 mockup, section 4)
- **theme-default (new)**: tokens for the bar: `--gallerist-tool-size` (a tool's box, default
  `--gallerist-target`, 44px), `--gallerist-tool-icon` (22px), `--gallerist-close-icon` (the tool
  glyph), `--gallerist-zoom-group` (0: three loose zoom tools; 1: one group in a hairline border, its
  parts 6px narrower and 8px shorter than a tool, the percentage between two hairlines, glyphs 3px
  smaller) and `--gallerist-close-rule` (room before Close with a 1 × 20 hairline centred in it; 0px:
  none; the room, not the line). `--gallerist-zoom-group` is a unitless 0 or 1. Console sets 36px /
  18px and Close's glyph 2px larger (it follows `--gallerist-tool-icon`) with the zoom group under
  `(pointer: fine)`, and the hairline (9px) everywhere, as the mockup's phone bar has it. The hairline
  is a border, so it shows in forced colours (Windows High Contrast). Gallery and Editorial keep 44px
  tools and no hairline: their round and editorial tools read as touch-sized chrome, and a patch release leaves
  their look alone. Focus rings show whole as before (the toolbar guard now runs with the zoom tool),
  the strip still lets pointers through its free space, and a phone still leaves out the zoom tool and
  an overlay's fullscreen.

### Sizes (gzipped; 0.4.0 → 0.4.1; one limit raised, owner-approved)
- core + renderer-dom 16,650 B (unchanged; limit 16,650).
- core + renderer-dom + thumbnails 25,484 → 25,599 B (limit 25.5 → **25.6 kB**: the current card clear
  of the end fades, the way the cursor went kept, the card ahead drawn before it counts, and the
  re-window's fraction carried).
- plugin-shortcuts 2,834 → 2,824 B (limit 2,850); plugin-zoom 1,645 B (unchanged; limit 1,650).
- theme-default base.css 9,390 → 9,733 B (limit 10 kB); console.css 1,298 → 1,367 B.
- `@gallerist/cdn` 38,244 → 38,387 B (limit 40 kB).

## v0.4.0

A minor release: every package goes from 0.3.3 to 0.4.0, and some things behave differently (the
Upgrading list below). Two new packages join the fixed version group at 0.4.0: `@gallerist/plugin-zoom`
(a "− 100% +" toolbar tool) and `@gallerist/plugin-shortcuts` (the keyboard shortcut list on `?`). The
rail gains host hooks (group meta, item badges, clusters, markers), the View menu becomes a segmented
popover, toolbar tools show their whole focus ring, and the rail glides, drags and fades. Four size
budgets go up (see the end). Peer ranges stay `>=0.3.0 <1`; keep every `@gallerist/*` package on one
version.

### Upgrading: what behaves differently
- **theme-default**: the rail's band (background, rule, blur) is painted on `.gallerist-thumbs-region`,
  not `.gallerist-thumbs`; a page that styled the strip's background or border should move that to the
  region.
- **theme-default**: the toolbar's strip takes the bar's free space and lets pointers through except on
  its tools, the 6px between two tools included: a drag or wheel that starts there is the bar's (under
  the `immersive` bar, the image's), and no longer scrolls the strip. A page that styled the strip's
  `margin`, `padding`, `flex`, `::before` or `::after` should check it.
- **theme-default**: on a phone (600px wide or less) the bar leaves out the zoom tool, and an overlay
  viewer's bar leaves out fullscreen (an inline viewer keeps it); `--gallerist-phone-zoom: flex` and
  `--gallerist-phone-fullscreen: grid` keep them. A phone bar whose only tools are those two, with
  `controls: false`, shows empty: leave the plugins out there or keep the tools.
- **theme-default**: a new token, `--gallerist-divider`, paints the lines between a flat rail's groups.
  It defaults to `--gallerist-hairline`, but each skin's dark scheme sets its own (about 2:1), so a page
  that darkened or lightened `--gallerist-hairline` to restyle those dividers should set
  `--gallerist-divider` too. The divider's selector keeps 0.3's specificity (two classes), so a page's
  rule for `.gallerist-thumb-group + .gallerist-thumb-group` still wins.
- **plugin-view**: the menu's DOM and roles changed. The popover is `role="dialog"` (was `menu`) and
  the tool `aria-haspopup="dialog"` (was `menu`); each choice is a `button` with `role="radio"` (was
  a `div` with `role="menuitemradio"`) in a `role="radiogroup"`; `.gallerist-view-group` and
  `.gallerist-view-heading` are gone (`.gallerist-view-label` and `.gallerist-view-seg` instead). A
  test or style that found the menu by those roles or classes needs updating.
- **renderer-dom**: the viewer ignores any key a handler before it already took with
  `preventDefault()` (until now only Escape), so a host handler that calls it on a key the viewer also
  uses (an arrow, Home, a digit, a plugin's letter) now keeps that key to itself.
- **plugin-zoom** (new): with it registered, `+` / `=`, `-` and `0` pressed in the viewer stop at the
  viewer's root (`keys: false` leaves them to the renderer, which lets them bubble), except in a field,
  a dialog or menu in the viewer, a slider, spinbutton, tree or grid. While the item can't zoom (a
  video) they go on to the page, marked taken (`preventDefault()`), so no plugin's `keymap` runs on
  them either.
- **renderer-dom**: a key from a text field inside an open shadow root in the viewer stays in the field
  (the viewer reads the event's first target), and a plugin's key typed with AltGr (Ctrl + Alt on
  Windows) reaches the plugin instead of counting as a browser chord.
- **plugin-view**: the menu is a popover that stays open on a choice (Enter chooses and closes); its
  letter keys and Home/End are gone; the default `rail` / `scheme` strings read "Layout" / "Theme".
- **plugin-thumbnails**: a stacked timeline label longer than its card widens its card's column instead
  of being cut; a flat group label and a stacked timeline label have a `title` only while cut. A marker
  whose `id` repeats an earlier one is not drawn. The rail cancels `dragstart` (no native drag of a
  card).

### Host hooks: the rail and the keys (owner-approved, for the Apploye reviewer)
- **plugin-thumbnails (new)**: `renderGroupMeta(group, index, { display, place })` draws a host's
  decoration per group: on a flat rail at the end of the group's label line (`place: 'label'`; the
  group widens to fit the label and the meta, the label still ending in an ellipsis past three card
  heights), on a stacked rail under the card at its width (`'below'`; every card is then wrapped) and,
  with a `timeline`, at the end of its time label (`'label'`). Not on an index rail.
- **plugin-thumbnails, theme-default (changed)**: a stacked timeline label longer than its card (a
  range, with a note count from `renderGroupMeta` at its end) was cut to the card's width
  ("11:00 – 1…"). The card's column now widens to fit it, so the label shows whole and ends a rail gap
  before the next card's (or marker's) label; past three card heights (the flat rail's cap) it ends in
  an ellipsis, with the whole label in its `title` while it is cut. Right to left mirrors it (a touch
  caret keeps to its card's corner), a phone's bottom rail does the same, and down a side rail the
  label keeps to the rail's width.
- **plugin-thumbnails (new)**: `renderItemBadge(item, g, i)` puts a host's badge in each item thumb's
  top end corner (a flat rail, the item column, the peek, an index section), clear of the
  `numberItems` number at the top start and of the focus ring.
- **plugin-thumbnails (new)**: `cluster(item, g, i)`: consecutive items with the same key sit 2px
  apart and 8px between clusters, in rows and columns, right to left too (`data-cluster="in"` /
  `"start"`; theme tokens `--gallerist-cluster-inner`, `--gallerist-cluster-gap`). Visual only.
- **plugin-thumbnails (new)**: `markers(collection)` returns `RailMarker`s (`id`, `after` or `before`
  a group id, `label`, `caption`, `render`, `tip`), drawn in order between groups on flat and stacked
  rails as a dashed box the height of the cards under a label line. They are not in the collection:
  never a stop for the arrows, Home/End or a click, not counted, not in the hash, and windowed with
  their group. Not focusable (information, not an action); a named `role="group"`, its label shown in
  the box. `tip` shows a host tooltip while a mouse or pen is over it and after a 500ms long press on
  touch (until the next press), in the rail's region, so the rail doesn't clip it; without one, the
  label is the `title`. A marker whose group isn't in the collection, or whose `id` an earlier one
  has, isn't drawn.
- **plugin-thumbnails (new)**: what a decoration or badge says joins the card's, group's or thumb's
  accessible name (a node's `aria-label`, else the text drawn: a fragment's or a number's too); the
  drawn node is hidden from assistive tech. `refreshRail(viewer)` (and the instance's `refresh()`)
  draws decorations and markers again in place after the host's data changed: the cards, the thumbs,
  the scroll and focus stay, and a marker's open tip shows again with the new data.
- **renderer-dom (changed)**: the viewer leaves any key a handler before it already took
  (`preventDefault()`), not only Escape, so a host popover in the caption can walk its own list with
  the arrows and close itself on Escape before the viewer. Keys typed in an `input`, `textarea`,
  `select` or contenteditable inside the viewer stay there (unchanged; Escape still closes from a
  field nobody handled it in).
- **plugin-captions (docs)**: a popover from the caption goes in the viewer root, not the caption:
  the caption band scrolls when tall, and a scroller clips it (checked: a popover kept in the band is
  cut off where it rises over the stage). In the root at `z-index` 10 it shows over the stage and the
  rail; Escape, typing and a key that opens it are covered in the README.
- **theme-default (changed)**: on a phone (600px wide or less) the bar leaves out the zoom tool (a
  pinch or a double tap zooms, and the renderer's reset shows while zoomed) and an overlay viewer's
  fullscreen (it fills the screen; an inline viewer keeps it). `--gallerist-phone-zoom: flex` and
  `--gallerist-phone-fullscreen: grid` keep them. The reviewer preset with View, save and Close then
  fits a 390px bar without scrolling.

### The toolbar's focus ring
- **theme-default (fixed)**: a toolbar tool with keyboard focus (fullscreen, save, View, the rail's
  items toggle, the grid, any plugin tool in the strip) shows its whole focus ring. The strip the
  tools sit in scrolls sideways on a narrow screen, and a scroller clips on both axes, so since 0.3.0
  the ring was cut to a bracket on each side, in every skin and both schemes; Close, outside the
  strip, had it whole. The strip keeps room for the ring on every side (4px; 5px at its ends, where
  Chromium rounds an RTL scroll range down), given back by a negative margin, so the counter, title,
  tools and Close keep their places. The exception is a shown title beside tools that scroll: the
  title can end up to half a pixel shorter or longer, the tools moving with it, and the strip's scroll
  range 1px longer. The strip takes the bar's free space itself (a shown title shares it), its tools
  still at the end, so its box is wider than its tools; it uses its own `::before` and `::after`. Like
  every region it lets pointer events through except on its tools, so that free space stays the
  bar's, and under the `immersive` bar the image's. A drag or a wheel that starts in the 6px between
  two tools no longer scrolls the strip; one that starts on a tool does.
- **renderer-dom (fixed)**: where the strip scrolls, a tool reached from the keyboard is brought
  fully into view with its ring, by scrolling the strip (not the page). Browsers leave a tool 32px or
  more in view where it is, cut by the strip's edge; a pointer's focus leaves the strip as it is.
- **plugin-view (fixed)**: opened by a pointer while the strip hides part of it, the View tool comes
  into view with the same room for its ring (the strip's `scroll-padding`), not flush with its edge.

### A zoom tool (owner-approved, for the Apploye reviewer)
- **plugin-zoom (new)**: `zoom()` adds a "− 100% +" group to the toolbar. − and + step through stops of
  the zoom range (`stops`, default fit, 150%, 200%, 300%, 400%: the DOM renderer's range, 100% being
  the image fitted to the stage), pivoting on the stage's centre (`viewer.zoomTo`). The percentage
  shows the current zoom and fits the image again when pressed. It follows every zoom as it happens: a
  pinch, a wheel or a double click shows its percentage while it moves (the plugin reads the transform
  the renderer gives the current slide before it commits), and another group shows its own. − and +
  are `aria-disabled` (still focusable) at either end of the range and while the current item can't
  zoom: not an image (`zoomable`), still loading, failed. The percentage is unavailable at fit. While
  the viewer has focus, `+` / `=`, `-` and `0` take the same stops in place of the renderer's own ×1.25
  steps, except where they are someone else's (a text field, one in an open shadow root too; a dialog
  or menu in the viewer, such as the View popover; a slider, spinbutton, tree or grid) and with Ctrl,
  ⌘ or Alt; a key it takes stops at the viewer's root (`keys: false` leaves them to the renderer).
  While the item can't zoom its keys do nothing and go on to the page. Stops outside the renderer's
  range (fit to 400%) are brought into it, so − and + never do nothing. A zoom from the tool or its
  keys is announced in the viewer's live region. Translated labels in `strings`. Not in the
  `@gallerist/cdn` bundle. No core change.
- **theme-default (new)**: the tool's look in every skin and scheme (a tabular percentage of one
  width); the renderer's zoom-reset button stays out of a bar that shows the tool (unchanged without
  it, with a `hidden` tool, and on a phone, which leaves the tool's percentage out).
  A phone (600px wide or less) leaves the tool out of the bar (see the phone bar under Host hooks);
  where a page keeps it (`--gallerist-phone-zoom: flex`) only − and + show. A tool given `hidden`
  stays hidden (its `display: flex` no longer beats the attribute).

### The View menu: a popover with segmented controls (owner-approved 1A, for the Apploye reviewer)
- **plugin-view (changed)**: the menu's radio list becomes a compact popover (about 280px wide, inside
  a 390px phone): two labelled segmented controls with icons, Layout [Stacked | Row] and Theme
  [Dark | Light] (Index and Auto when offered). The current value is raised on a recessed track, its
  text at full strength and its glyph in the skin's selection colour; the segment focused from the
  keyboard takes the neutral focus ring, so focus never reads as the selection. A choice applies at
  once and the popover stays open, so both settings change in one visit; it repaints when a host
  applies a controlled choice while it is open (the rail's `data-display` and the root's scheme are
  watched), so host-owned settings (`controlled`, `Symbol.for('gallerist.controlled')`, React's props)
  still show what the host applied, and `onChange` still reports only the setting changed. The API is
  unchanged; the default `rail` / `scheme` strings now read "Layout" / "Theme", as in the mockup.
- **plugin-view (changed, a11y)**: the tool is `aria-haspopup="dialog"`; the popover a non-modal
  `role="dialog"` named "View"; each setting a `radiogroup` named by its visible label, its segments
  `button`s with `role="radio"` and roving `tabindex` (APG radio group). Enter, Space or ↓ on the tool
  open it on the first group's checked segment, ↑ on the last stop; ←/→ (↑/↓) move and choose, wrapping,
  mirrored right to left; Space or a click chooses; Enter chooses and closes; Tab moves between the
  groups and the shortcut row, and past either end closes (forward on from the tool, back onto it);
  Escape closes with focus on the tool; `?` opens the shortcut list. Every key but Tab stays in the
  popover. The menu's letter keys and Home/End are gone (two choices a group).
- **plugin-view (new)**: with `@gallerist/plugin-shortcuts` registered, a last row, "Keyboard
  shortcuts ?" ("Gestures", without the key cap, on a coarse pointer), opens the list; focus comes
  back to the View tool when it closes.
- **theme-default (new)**: tokens `--gallerist-popover-bg`, `--gallerist-popover-shadow`,
  `--gallerist-seg-track`, `--gallerist-seg-on`, `--gallerist-seg-on-shadow`. Every skin derives them
  (panel, shadow, ground, surface and a hairline ring); Console sets the mockup's (dark #1b1d21 /
  #111215 / #2b2f35, light #fff / #eceef1 / #fff). Segments are 36px tall on a coarse pointer.

### A keyboard shortcut list on ? (owner-approved 3c, for the Apploye reviewer)
- **plugin-shortcuts (new)**: `shortcuts()` shows the viewer's keyboard shortcuts in a modal dialog:
  on `?` while the viewer has focus (not in a text field, not with Ctrl, ⌘ or Alt), from the View
  menu's last row, or from the host (`open(keys?)` / `close()` on the plugin; the instance, named
  `shortcuts`, has them too, with `isOpen` and `label`). No toolbar tool. The list is built each time
  it opens from what the viewer does then: Move (groups on ←/→ and items on ↑/↓, Home/End, 1–9 while
  items are grouped; a row rail or one item a group: ←/→ and Home/End through every item; a side rail
  turns the axes; right to left shows → ← for previous / next), Zoom (`+` `−` `0`, the renderer's or
  plugin-zoom's), Viewer (F with plugin-fullscreen where the browser can fullscreen an element, T with
  a rail, E with a stacked rail, G, P, C with `onPlace`, D or plugin-save's `key`, each only while its
  plugin holds the key; `?`; Esc on an overlay viewer), then the host's entries
  (`shortcuts: [{ keys, label, gesture?, section? }]`, into Viewer, a named built-in section or a new
  one). Opened by a touch (a coarse pointer, without `?`) it lists the gestures instead: swipe left or
  right, swipe up within a group, pinch or double-tap, drag while zoomed, swipe down to close (an
  overlay viewer), the host's, and a note that `?` lists the keys with a keyboard.
- **plugin-shortcuts (a11y)**: `role="dialog"`, `aria-modal="true"`, named by its title; it sits in
  the viewer's root over a scrim, the rest of the viewer `inert` while it shows; focus moves to it and
  Tab stays inside (the close button, then the list, a focus stop the keys scroll when the viewer is
  short; no role or name of its own, so the title is announced once); Escape (or `?`, AltGr's too, the close button, a click on the
  scrim) closes it, and only it, with focus back where it was. A `window` capture-phase listener takes
  every key pressed in the viewer while it shows, so nothing moves, zooms or closes under it; it goes
  with the next key or press if the renderer goes away with the list open. Zoom keys (and pinch and
  drag) are listed only while the collection has an item that can zoom: an image, or what
  plugin-zoom's `zoomable` accepts when it is registered (its instance exposes `zoomable`). Translated text in `strings` (key names
  included; `toClose` puts the Esc key cap at its `{key}`).
- **theme-default (new)**: the dialog in every skin and scheme: centred, up to 720px, the sections side
  by side (Move widest); key caps in the surface colour and monospace face; a sheet from the bottom
  edge, one column, at 600px wide or less; a fade in, none under reduced motion; right to left. The
  dialog keeps inside the viewer however short it is (an inline viewer included), its list scrolling.
- **theme-default (new, a11y)**: under `forced-colors: active` the View popover's chosen segment takes
  the system's selection colours (its raised surface and shadow are dropped there) and focus rings the
  text colour. A focused thumb in a cluster draws its ring over its neighbours.

### The rail (from the Apploye reviewer)
- **plugin-thumbnails (changed)**: collapsing the rail (the handle, `t`, fullscreen) and bringing it
  back glides its height (a side rail's width) between its size and none over `--gallerist-dur-panel`
  (220ms, new token; the handle's chevron turns over the same time), so the stage refits a little each
  frame instead of jumping, and a zoomed image keeps its view. A stacked rail's item column beside the
  stage does the same when the items toggle or `e` opens or closes it. One Web Animation per panel,
  clipped, its contents kept to the handle's side. On its way out a panel is `inert`, then
  `display: none` as before; a collapse that takes the focus with it (a card in the rail or in the item
  column) hands it to the viewer, while the handle keeps it; reversing midway turns back from where it
  got to. No motion under `prefers-reduced-motion`, with a `--gallerist-dur-panel` of 0 (`ms` or `s`),
  or without Web Animations.
- **plugin-thumbnails (changed)**: the rail shows no scrollbar, in every engine. A mouse or pen drags
  it: past 5px along it (10px with a pen) a press is a drag, which never clicks the card it started on;
  short of that, or across the rail, it is a click, which selects. A press released off the rail before
  it was a drag ends at the next move without a button, so a hover never drags. A grab cursor shows
  between cards while it can scroll; nothing in it is selected or dragged out as an image. Touch keeps
  the browser's own scrolling. A vertical wheel
  scrolls a sideways rail towards its end while it can; at that end, or when it can't scroll, the page
  gets the wheel, and a sideways wheel, a trackpad swipe or a pinch is left to the browser. Each end
  with more beyond it, scrolled away or not drawn yet, fades (`data-gallerist-more-start` / `-end`;
  `--gallerist-rail-fade`, 40px), a side rail's too, and follows the cards' sizes as fonts and a host's
  decorations arrive. On a sideways rail, ‹ › buttons at those ends (`.gallerist-rail-page`) show on hover
  with a fine pointer and page it by 80% of its width, gliding unless reduced motion; they are out of
  the tab order and hidden from assistive tech, as the keys already walk the rail and bring the current
  card into view. A page goes the whole way even when a frame comes late or runs into cards not drawn
  yet (it carries on once they are, at most 30 frames, and stops at the rail's true end), under reduced
  motion too; a press or the wheel on the rail stops it. The rail's scrolls land at once whatever the
  page's CSS says (`.gallerist-thumbs` gets an inline `scroll-behavior: auto`). Right to left throughout. The item column beside the stage drags too and keeps its
  scrollbar.
- **plugin-thumbnails (changed)**: a flat rail's group label, and a stacked timeline label, carry
  their whole text in a `title` while cut (see Host hooks).
- **theme-default (changed)**: the rail's band (background, rule, blur) is painted by
  `.gallerist-thumbs-region` rather than `.gallerist-thumbs`, so the strip can fade its ends without
  fading the band. A page that styled the strip's background or border should move that to the region.
- **theme-default (fixed)**: in a dark scheme the dividers between a flat ("Row") rail's groups all but
  vanished (the hairline, 1.3–1.4:1). A new token, `--gallerist-divider`, defaults to the hairline; each
  skin's dark scheme lifts it to about 2:1 (Console #464c54, 2.05:1; Gallery white at 22%, 1.93:1;
  Editorial Night #4d4840, 1.96:1). The light schemes keep their hairline.
- **theme-default (fixed)**: a flat rail's group label wider than its items (a time range such as
  "10:49 – 10:50 am" over a one-item group) was cut with an ellipsis. It now widens its group, so it
  shows whole and clear of the next group's divider, up to three card heights; past that it ends in an
  ellipsis. Down a side rail a group stays the rail's width.

### Sizes and budgets (gzipped; 0.3.3 → 0.4.0)
- core + renderer-dom 16,497 → 16,650 B; its budget goes from 16.5 to 16.65 kB (owner-approved, for the
  toolbar focus ring; the key a host took is 1 B more, a field in a shadow root and AltGr 34 B), and
  it is now at the limit.
- core + renderer-dom + thumbnails 21.99 → 25.48 kB (25,484 B); its budget goes from 24 to 25.5 kB
  (owner-approved, for the rail's motion, drag and the host hooks; the pre-release review's fixes fit
  in it after a trim).
- plugin-view 2,392 → 2,959 B; its budget goes from 2.4 to 3 kB (owner-approved: the segment glyphs,
  the radio-group keys, the live repaint and the shortcut row).
- `@gallerist/cdn` 34.62 → 38.24 kB (38,244 B); its budget goes from 35 to 40 kB (owner-approved). It
  bundles neither plugin-zoom nor plugin-shortcuts.
- New: plugin-zoom 1,645 B (budget 1.65 kB); plugin-shortcuts 2,834 B (budget 2.85 kB).
- theme-default base.css 7.60 → 9.39 kB (limit 10 kB); console.css 1.21 → 1.30 kB. Core unchanged
  (3.10 kB).

## v0.3.3

### A View menu: the rail's layout and the scheme, in the open viewer (from the Apploye reviewer)
- **plugin-view (new)**: `view()` adds one toolbar tool, "View", that opens a small menu with a
  **Rail** group (Stacked or Row, shown while a thumbnails rail is mounted) and a **Scheme** group
  (Dark or Light). The choices offered, their labels (`strings`), start values (`initial`) and
  `onChange(change)` are options. `onChange` reports the one setting picked, `{ rail: 'flat' }` or
  `{ scheme: 'light' }`, when it differs from the stored value, and never a scheme resolved from the
  system or the skin: a rail choice on a viewer following the system (`auto`, or no scheme set)
  leaves it following the system, and Dark picked there stores `dark`. Merge each change into what
  you keep (`{ ...saved, ...change }`), so a saved choice holds only what the user picked. By default
  the plugin applies a choice itself; a host that owns a setting gets only the report, and the plugin
  never writes that setting (`initial` and past choices included): `controlled` (`true`,
  `['scheme']`, `['rail']`), or a mark on the viewer, `Symbol.for('gallerist.controlled')`, which
  React's `scheme` and `groupDisplay` props set while they're passed. Unknown `initial` values (old
  or edited storage) are ignored; the user's choices are kept per viewer, so one `view()` can serve
  several viewers. With nothing to offer (`scheme: false` and no rail built) the tool is hidden, and
  it shows once a rail is built, whatever the plugin order. It follows the ARIA menu button pattern
  (`aria-haspopup`, `aria-expanded`, `role="menu"` with a named `menuitemradio` group per section;
  ↑/↓, Home/End, a letter, Enter/Space, Escape and Tab; focus back on the tool; a press outside
  closes it, also for a viewer in a shadow root) and keeps the keys it handles from the viewer. It
  hangs under its tool inside the viewer, follows it when the toolbar strip scrolls, fits a 390px
  phone, and takes each skin's look in both schemes. While open it listens on the document
  (`pointerdown`, `scroll`) and the window (`resize`); a renderer destroyed under an open menu drops
  them at the next such event. `view({ initial })` is read once per viewer, like other plugin
  options: in React, build the plugins once (`useState`). It isn't in the `@gallerist/cdn` bundle,
  which it would take past its size budget (its own budget is 2.4 kB; 2,392 B gzipped).
- **plugin-thumbnails (new)**: `setGroupDisplay(viewer, display)` switches a mounted rail between
  `stacked`, `flat` and `index` in place (with several thumbnails plugins, the last registered, whose
  rail shows), and `getGroupDisplay(viewer)` reads it. The current item stays, the rail is drawn
  again around it, a zoomed image stays zoomed, and the preset rules hold (`timeline` carries into
  `flat`; `itemAxis` and `numberItems` belong to the preset's own display). Called before the rail
  mounts, it sets the display the rail mounts with.
- **plugin-thumbnails (changed)**: a rail keeps its items toggle and its `aside` column for every
  display it can switch to, instead of leaving them out: on a flat rail the toolbar holds the toggle
  `hidden` and marked `data-gallerist-off`, and the aside region holds the column `hidden` (it takes
  no room). A flat rail still doesn't claim `e`, so another plugin's `e` works there; a rail
  switched to stacked or index takes it back. A rail not built yet (or never, under another
  renderer) doesn't claim `e` either.
- **renderer-dom (changed)**: `viewer.refresh()` also reads the rail's `data-gallerist-linear` and the
  plugins' keymaps again, so a rail switched to or from `flat` turns linear traversal on or off at
  once, with the counter, the item navigator and the arrows' names (an explicit `linear` still wins),
  and hands `e` over. With `controls: false` the bar hides when every tool it holds is marked
  `data-gallerist-off` (a tool its plugin keeps for a later layout); a tool that only sets `hidden`
  still shows the bar, as before.
- **react (new)**: a reactive `groupDisplay` prop switches the mounted rail without a remount. While
  `scheme` or `groupDisplay` is passed it owns that setting: a View menu only reports a choice for
  it, and doesn't apply its `initial` over it, so the prop and the menu never resolve opposite ways
  (StrictMode, Fast Refresh, `<Activity>`), and the rail is built once. `<Gallerist>` owns the
  `Symbol.for('gallerist.controlled')` mark and writes it on every commit, so a mark set by hand
  through `ref` is overwritten; use `view({ controlled })` instead.
- **react (fixed)**: `skin`, `accent` and `scheme` are each written only when they change; before,
  changing one wrote all three, so a scheme set another way (the View menu) was cleared by an accent
  change.
- **theme (new)**: the View menu's styles: the item under the pointer takes the tool hover fill and
  the keyboard's item the focus ring (3:1 or more on the panel in every skin and scheme), so the two
  never look alike; a rail's hidden `aside` column takes no room.

### Keyboard focus on touch, and zoom through a resize (from the Apploye reviewer)
- **theme (fixed)**: a docked arrow focused from a keyboard on a touch screen no longer covers the
  media. With `arrows: 'docked'` (the `reviewer` preset) the group arrows are visually hidden on
  touch and the stage takes the full width; a keyboard or switch user who tabbed to one got it back
  over the image (on a 390×844 phone, over the start of a full-width screenshot). Now the stage makes
  room only while a group arrow has keyboard focus, as much on each side, so letterboxed media holds
  still: on a landscape screen a gutter at each side, on a portrait one a band above and below the
  stage, with the arrows in the bottom band (↑ in the top one on a vertical group axis). Landscape or
  portrait is the screen's, not the viewer's. This holds on stacked and flat rails, left to right and
  right to left. A focused docked arrow also stays above the zoom minimap, which could cover it on a
  short stage, with a mouse too. In `immersive` held sideways, its navigator can still cover a
  focused →.
- **renderer-dom (fixed)**: zoomed in, a stage that shrinks and grows back returns to the same view.
  The pan was clamped to the smaller stage and stayed clamped: zoomed 2× at a panorama's right edge
  on a touch tablet, tabbing past a docked arrow left the view about 140px short of that edge, and a
  rotation there and back did the same. Now the part of the image at the stage's centre stays there
  through a resize, and the view comes back as it was. The view remembered through a resize belongs
  to the current item and to the box it was clamped against: moving to another item in between (the
  zoom carries over within a group, and across groups with `keepZoomOnNav`), a load that sizes the
  image, or a frame inset that changes at a breakpoint never pans to a view nobody saw. A load or
  `viewer.refresh()` re-clamps the view shown, not the remembered one. A stage with no size (a
  hidden container) commits nothing and fires no `zoom`/`zoomEnd`.
- **renderer-dom (known limitation)**: a resize in the middle of a pinch, or before a wheel zoom
  settles (~90 ms), shows the re-clamped view for a frame; the gesture then commits from where it
  began, in the old stage's pixels (clamped to the new stage), so the re-clamp's view is lost. This
  predates 0.3.3; deferring the re-clamp to the gesture's end doesn't fit the core + renderer-dom size
  budget (16,497 of 16,500 B gzipped).
- **theme (fixed)**: idle auto-hide no longer fades a control that has keyboard focus, nor the band
  (or `immersive` rail) it is in, so a keyboard user who pauses on one still sees where focus is.
  Browsers without `:has()` or `:focus-visible` (iOS Safari 15.0–15.3) fade all the chrome as in
  0.3.2. The exemption adds no specificity, so a page's own idle style still applies. A click or tap
  on the stage moves focus to the viewer, so the chrome fades again after keyboard use; a swipe or
  pinch moves no focus, as a page scroll doesn't.

### Index chips of different widths
- **plugin-thumbnails (fixed)**: with index chips of different widths (a chip is as wide as its
  group's name), the rail now shows the current chip's neighbours whenever the three fit. Before,
  centring the current chip could leave a wider neighbour cut off (from 0.3.2). Now the rail goes on
  from the centre only as far as shows all three, and still centres the chip where they don't fit.

## v0.3.2

### Pin cards and the rail on phones (from the Apploye reviewer)
- **plugin-pins (fixed)**: an open card no longer sits under the zoom minimap (`navigator: true`, on
  in the `reviewer` preset). On a 390×520 phone, zooming in with a draft card open (ctrl+wheel) put
  the minimap over the start of its note field. The card now keeps clear of the minimap as it already
  did of the docked item navigator: when the minimap is in the card's columns, the card's room ends
  above or below it, whichever leaves more, and the card stays on its side of the pin, scrolling if
  it no longer fits. This holds in every corner the minimap uses (the top one on a phone, the bottom
  one on wider screens, mirrored right to left), and the card is placed again when the minimap shows
  or hides with the zoom. The card avoids the minimap rather than covering it, because the minimap is
  the zoom tool and stays usable while the card is open. The plugin-pins size limit goes from 4 kB to
  4.03 kB for this (the bundle grows from 3,996 B to 4,025 B gzipped).
- **plugin-thumbnails (fixed)**: the rail keeps the next card in view. Stepping with → left the
  current card flush against the rail's far edge, so the card that came next was out of view; on a
  phone, at item 14 of 15 the 15th was off screen. Now, while the current card and the cards on
  either side of it show whole, the rail stays put, so a click on a card in view doesn't move it. Once
  one of them would be cut off, the rail centres the current card, so the next card shows along with
  about half a rail of what follows. At either end the scroll stops at the first or last card. This
  applies to every rail that scrolls (`flat`, `stacked`, `index` rows and chips, side rails, right to
  left) and to the item column. The rail still scrolls instantly, with no animation, as before.

## v0.3.1

### The flat rail, completed
- **theme (changed)**: the flat rail (`thumbnails({ groupDisplay: 'flat' })`) no longer draws each group
  as a bordered, tinted box with an accent stripe down its side. That spent the accent on every group,
  so it no longer said which one was current. Each group's items now sit under a small, muted label,
  with a 1px hairline between neighbouring groups and the same space on both sides of it. Only the
  current group's label takes the accent; the plugin marks that group `data-active`. A group that the
  windowed rail draws only in part has no divider on the cut side, shows its label only when its start
  is drawn, and its card at the cut is faded. The labels and dividers use each skin's existing tokens
  and keep their contrast in every skin and scheme.
- **theme (fixed)**: a flat rail in a side rail (`rail: 'left'` or `'right'`) runs its groups down the
  rail with each group's items in a column, and the divider runs across the rail. Before, a group's
  items stayed in a row wider than the rail and were cut off.
- **plugin-thumbnails**: `timeline` works on a flat rail. Each group is headed by its timeline label
  (`group.meta.time` with `timeline: true`, or what your function returns), and by its `caption` when
  it has no label. The label is part of the group's accessible name (`strings.groupAt`), as it is for a
  card in the stacked rail; a caption shown as a flat group's label now joins the name the same way.
- **plugin-thumbnails (changed)**: a preset's `timeline` carries into an explicit
  `groupDisplay: 'flat'`, so `thumbnails({ groupDisplay: 'flat' })` under the `reviewer` preset heads
  each group with its time. Pass `timeline: false` to drop it. A preset's `itemAxis` and `numberItems`
  still apply only to the preset's own group display.
- **renderer-dom, react (changed)**: a flat rail now implies linear traversal. While a flat thumbnails
  rail is mounted, ←/→ (↑/↓ beside a side rail) walk every item in rail order across groups, the
  counter reads `item N / total`, the ↑/↓ item navigator and the within-group pills hide, and the
  arrows walk the items, which is what `linear` already did. You no longer need to pass `linear`
  alongside a flat rail. If you relied on the group and item axes with a flat rail, pass
  `linear: false` to `mount()` or `linear={false}` to `<Gallerist>` to keep them. An explicit `linear`
  still wins either way, and stacked and index rails, or no rail, are unchanged. The `linear` option
  is now unset by default rather than `false`, and React passes nothing when the prop is omitted.
- **renderer-dom**: how the rail asks for it is documented for plugin authors: a `thumbnails` region
  node that carries (or holds an element with) `data-gallerist-linear` turns linear traversal on
  unless `mount()` got an explicit `linear`. The renderer reads it whenever the plugin set changes,
  so a rail added with `viewer.use()` after mount, or removed, updates the counter, the navigator and
  the keys.

## v0.3.0

### Package name
- **plugin-save**: the download plugin ships as `@gallerist/plugin-save`, not
  `@gallerist/plugin-download`, because npm doesn't allow the word "download" in package names.
  Only the name changed: import `download`, `downloadGroup` and the rest from
  `@gallerist/plugin-save`. The API is unchanged.

### Reviewer controls and pin cards (from the Apploye reviewer)
- **renderer-dom, theme (breaking for `reviewer`)**: a new arrow layout, `arrows: 'docked'`, puts no
  control over the media. The group arrows sit in gutters the stage leaves at its sides (none on
  touch, where swipes stand in for them), and the item navigator leaves the stage: the `n / N` count
  over ↑ ↓, as a header on the aside item column while that shows, otherwise at the end of the caption
  row, which makes room for it beside a text caption or a designed one. It keeps its room on a
  one-item group while any group has several items, so the stage holds still. The `reviewer` preset
  uses it instead of `corner-br`, whose cluster covered the screenshot's bottom-right corner (where a
  taskbar clock is) and, on a phone turned sideways, ~40% of the stage. On desktop the stage is
  narrower by the gutters; a panorama no longer runs under the arrows. Other presets are unchanged.
- **plugin-pins**: `onCardRemove(pin, node)` hands back each node `renderCard` returned once it has
  left its card (the card closed, moved to another item, was redrawn, its pin left the data, the
  plugin or viewer was destroyed), exactly once per node and never for default cards, so a host can
  unmount a React portal or root. The README has a portal example.
- **plugin-pins (changed)**: a card holds its contents only while open: `renderCard` runs when the
  card opens and again when an open card is redrawn, not for every pin of every painted slide.
- **plugin-pins**: `open(id, { focus: true })` moves focus into the card (once its pin is painted),
  `open(null, { focus: true })` to the pin. `onOpenChange(pin, ctx)` gets `ctx.previous`, the pin
  whose card was open until then (the one that closed); the context type is `PinOpenChange`.
- **plugin-pins (fixed)**: focus inside a card that closes or is redrawn goes to its pin when that is
  still on the current item, else the add-pin button, else the viewer, never `<body>` (the next Escape
  closed the whole viewer). Only the close button and Escape did this before.
- **plugin-pins (fixed)**: a pin opens on the current item only (a neighbour's slide can carry the
  same id), painting a neighbour's slide no longer closes the open card, and a closed overlay
  viewer's pins still open after it reopens.
- **plugin-pins (changed)**: `onCardRemove` and `onOpenChange` run once the change has settled, in
  order, also when one calls back into the plugin: `open(B)` from `onCardRemove` now reports B's
  opening after the change that led to it, so the last event names the open pin. A callback that
  throws is reported (`reportError`, else `console.error`, like core's event handlers) and the rest
  still run; before, it propagated to whatever opened or closed the card.
- **plugin-pins (fixed)**: a `renderCard` that throws gets the default card for that pin and the
  error is reported, instead of leaving the plugin half-switched (the old card's node never handed
  back, the new card open with only a close button, no `onOpenChange`). Returning the same node
  again (one cached per pin) is supported: a redraw that gets it back no longer hands the live node
  to `onCardRemove`.
- **plugin-pins (fixed)**: a repaint's deferred reopen no longer reopens a card closed in the same
  task, or adds listeners after the plugin was destroyed; `destroy()` forgets the viewer root, so the
  same instance in a new viewer listens on the new one. `open(id, { focus: true })` for a pin not
  painted yet leaves focus alone if the user moved it meanwhile. In an inline viewer, focus on
  `<body>` is no longer pulled into the viewer when the host changes the item while a card is open
  (only focus that was in the card, or anywhere in an open overlay viewer, is rescued). One `pins()`
  per viewer is documented.
- **plugin-pins (fixed)**: a card stays inside the stage on both axes. It was only sized across, so on
  a landscape phone (a 159px stage, a 194px host card) it ran past the stage's bottom or opened up
  under the toolbar, out of reach. It now opens level with its pin, slides along it to fit, is never
  taller than the room (the stage less any band floated over it), and scrolls past that, joining the
  tab order so the keys scroll it (↑ ↓ Home End Page Up/Down on the focused card don't navigate), with
  its close button held in view. Across, it is never wider than the room and slides along over its
  pin when the room beside it is narrow (with less than ~130px its close button was clipped), and it
  never opens under the docked item navigator (immersive floats that over the stage). It is placed
  again after a zoom or pan and, a frame later (no ResizeObserver loop error), as a host's contents
  resize. A wheel over a card that scrolls scrolls it; over a short card, or a pinch (ctrl+wheel)
  over any card, it zooms the image as elsewhere on the stage (a card swallowed every wheel, so a
  pinch over one zoomed the page in Chromium). A touch in a card no longer pans or pinch-zooms the
  page: a card is a scroll container, which the stage's `touch-action: none` doesn't reach into, so
  it sets its own (`none`; `pan-y` while it scrolls).
- **plugin-pins (fixed)**: when the host drops a pin as its card closes (an empty draft, removed in
  `onOpenChange` with `refresh()`), the repaint a frame later took the pin focus had gone to and left
  focus on `<body>`. A repaint that drops the focused pin now moves focus on to its marker if it is
  back, else the add-pin button, else the viewer.
- **plugin-pins**: focus the plugin moves shows the focus ring when the input that led to it was a key
  (Escape, Enter on ×) and not after a pointer (`focusVisible: true` / `false`, from the last
  keydown or pointerdown; it isn't inferred from the element focus leaves, as a text field always
  matches `:focus-visible`).
- **plugin-pins (fixed)**: `open()` from a callback run by `destroy()` (say `onCardRemove`) opens
  nothing. It left a document listener attached past destroy, and a plugin moved to a new viewer
  opened that card on the first paint. An `open(id)` before the plugin first joins a viewer still
  waits and opens that card on the first paint, and a click before then (say the one that creates
  the viewer, or reopens a closed overlay viewer) no longer cancels it.
- **theme (fixed)**: an open card with no contents (a pin with nothing to show, a host card filled
  later) or only a few pixels of them is tall enough for its close button (`min-height: 46px`), so it
  doesn't scroll. The button overflowed it, and the scroll fade then flipped the card in and out of
  scrolling every frame: the fade flickered and the card dropped in and out of the tab order.
- **plugin-pins, theme (fixed)**: a card lays out its contents in normal block flow again. As a flex
  column it stacked a host fragment's inline siblings, stretched its buttons, links and inputs to
  the card's width and stopped paragraph margins collapsing. The close button is now first in the
  card (so reading and tab order match what is drawn), sticky at its top inline-end corner, taking
  no room, and above positioned host contents (as is the scroll fade). No card scrolls sideways any
  more (Chromium counted the close button 4px past the content box: a classic scrollbar showed).
- **plugin-pins (fixed)**: a wheel over a host's textarea or list that scrolls, in a card that
  doesn't, zoomed the image instead of scrolling it (the stage cancels the wheel): a card keeps a
  wheel when anything from the target up to the card scrolls on the wheel's axis, also inside a web
  component's open shadow root (an `<sl-textarea>`: the walk follows the composed path). A pinch there
  still zooms the image. A host's textarea or select pans vertically on touch rather than letting a
  pinch zoom the page. A card that shrinks to within the fade's 12px of the room stops scrolling.
- **plugin-pins**: the focus ring's input tracking leaves keydowns with meta, ctrl or alt held (a
  shortcut, or ctrl held for a pinch) out of it, so a host shortcut (Ctrl+K → `open(id, { focus:
  true })`) rings after a key and not after a pointer, and counts a click without a pointer
  (assistive tech) as a key.
  No frame is scheduled for a zoom with no card open, and `destroy()` cancels a pending one; with no
  free width at all a card is 0px wide, not a negative `max-width`.
- **renderer-dom, theme (fixed, docked)**: review fixes for `arrows: 'docked'`: the caption comes
  before the navigator in DOM and tab order; placements for immersive and editorial; a box radius;
  aside header room only with several items and not linear; the overview (`grid({ layout:
  'sections' })`) hides the navigator too; and a new root attribute, `data-gallerist-one-group`,
  drops the group arrows and their gutters on a one-group collection (not in linear mode), handing a
  focused arrow's focus to the viewer.

### Performance (U17)
Measured with `e2e/tests/perf.spec.ts`, now part of the e2e suite as a count-based regression gate.
- **plugin-thumbnails**: a step writes the active state of the two thumbs that changed, not of every
  thumb (10,017 attribute writes per item step in a 10k-item group, now 17).
- **plugin-thumbnails**: the rail draws what fits in it plus 3 cards on each side and follows its own
  scroll, inserting only the cards that enter and removing the ones that leave; the scroll offset
  follows, so what's on screen doesn't move. Viewer elements at 2000 groups × 5: 283 → 179 (Console
  reviewer preset 470 → 274); nodes re-appended per group step 38 → 3.
- **plugin-grid**: the grid draws the cells or sections around the current item and more as you
  scroll toward either end, and drops them when hidden. The `tour` overview at 5000 groups held 50,435
  elements and blocked the main thread for 662 ms on open; now 221 and no long task. A move inside the
  open cells moves the selection instead of redrawing them (20,003 elements recreated per step at one
  10k-item group, now 1).
- **renderer-dom**: the images `preload.ahead` / `preload.behind` steps away within the current group
  (default 2 ahead, 1 behind) are fetched ahead, as the spec always said; the slide window already
  covered neighbouring groups. They start once the current item's media is ready, at low fetch
  priority, are cancelled when a move leaves them behind or the viewer is destroyed, and cover only
  items the built-in image adapter would mount (a custom adapter loads its own).
- **plugin-grid**: the drawn run starts on a row, and scrolling up draws whole rows above it, so the
  cells on screen keep their columns (a run of 40 into a grid of 3 or 7 columns shifted every
  visible cell sideways); the same in the `sections` overview.
- **theme**: each thumb in the vertical item stack contains its own layout and paint, so scrolling a
  long stack doesn't make WebKit revisit every item: an item step in a 10k-item group with the Console
  skin took ~660 ms there; now ~65 ms.

### Fixed
- **theme**: a focused pin's ring could vanish on the image under it (Console's near-white ring on a
  light screenshot measured 1.08:1). The ring over media is now banded whatever the skin, scheme or
  accent (technique C40): 3px of a new `--gallerist-focus-halo` token (black) and 3px of white around
  the pin, then the focus colour. Black and white are 21:1 apart, so one of them reaches 3:1 (at least
  4.58:1) against any media; measured on Chromium and WebKit, the weakest case is 5.32:1 on mid-grey
  (`#808080`), 21:1 on white and black. A first version banded the focus colour with the skin's
  ground, which left mid-grey media under 3:1 in Gallery light and Console light (about 5.9:1 apart).
  An override of `--gallerist-focus-halo` must be opaque and keep 9:1 against white. A scrolling pin
  card's ring, which also falls on the image, gets the same bands. In forced colours the ring keeps
  its outline (the bands are box-shadows, which forced colours drop). Chrome on the viewer's own
  background is unchanged. (WCAG 2.2: contrast is 1.4.11 Non-text Contrast, and 2.4.13 Focus
  Appearance at AAA; the 81b8d66 commit message cites 2.4.11, which is Focus Not Obscured.)
- **theme**: a pin card that scrolls now shows that there's more below (a touch screen has no
  scrollbar): its contents fade out at its bottom edge until the end of the scroll, where the fade
  rests below the last control (it never takes a tap). A control focused near the bottom scrolls
  clear of the fade (`scroll-padding`). Not drawn in forced colours.
- **renderer-dom**: a focused caption band that stops scrolling (a shorter caption after ←/→, a taller
  viewport, the captions plugin removed) hands focus back to the viewer instead of dropping it to
  `<body>`, and ↑/↓/Home/End aimed at a band that no longer scrolls navigate again. A sub-pixel overflow
  doesn't count as scrolling. The theme rings a focused band (`--gallerist-focus`, inset).
- **renderer-dom**: ↑/↓/Home/End on a focused caption band scroll it by the renderer's hand (a 40px
  line, or to the top or bottom) instead of being left to the browser: WebKit on Linux didn't scroll
  the editorial placard's band at all. The step is immediate, not smooth.
- **plugin-save**: whether a URL is cross-origin is judged the way the link resolves it (against
  `document.baseURI`, so a `<base href>` counts) and against the document's origin: in an
  `about:srcdoc` frame a relative URL no longer throws (no download, an unhandled rejection), and a
  relative URL that a `<base>` sends to another origin opens in a new tab instead of navigating the
  host page away.
- **renderer-dom, plugin-thumbnails, plugin-grid**: a group caption that isn't a string counts as
  none (the group title, arrow labels, index rows, overview sections), as item captions already did.
- **plugin-thumbnails**: in a `flat` rail, item thumbs give their place within their group
  (`aria-posinset` / `aria-setsize`), like the item column, not in the whole flattened list ("Item 2,
  57 of 10000" inside "Group 29"). A block or grid rail that scrolls both ways takes its axis from
  the way its content overflows (else its longer side).
- **plugin-grid**: a run drawn before the grid had a layout (its columns unknown) is realigned to a
  row on the first scroll check, so growing it upward no longer shifts every cell sideways once.
- **renderer-dom**: `ResolvedPreset` is typed read-only (and its `rootAttrs` / `thumbnails`), matching
  the frozen built-in presets.
- **plugin-thumbnails**: mounting a viewer again with another preset (`h = mount(v, { preset:
  'reviewer' }); h.destroy(); mount(v, { preset: 'editorial' })`, or none, then `tour`) kept the first
  mount's rail (its timeline and aside stack under the new layout); the rail is rebuilt for each mount.
- **plugin-thumbnails**: `thumbnails({ groupDisplay: 'stacked' })` under `tour` no longer inherits the
  index's horizontal item row and numbering: an explicit `groupDisplay` other than the preset's starts
  from the plugin's own `itemAxis`, `numberItems` and `timeline`. Unknown `groupDisplay` / `itemAxis`
  values (from a renderer's preset or untyped options) fall back to the defaults, and a preset that
  makes the rail `flat` leaves the claimed items toggle and `e` key inert.
- **renderer-dom**: the built-in presets are frozen, so a plugin writing to `ctx.preset` can't change
  the preset for the next mount; `RegionCtx` fields are `readonly`.
- **renderer-dom**: a caption renderer's band that overflows (a long `plugin-captions` /
  `<Gallerist.Caption>` caption, in the band or the editorial placard) can be scrolled by keyboard: while
  it overflows it is focusable (`tabindex="0"`), a `region` named by `strings.caption` ("Caption"), and
  ↑/↓/Home/End scroll it instead of moving the viewer. A band that fits stays out of the tab order.
- **plugin-grid**: each group's `listbox` in the `cells` layout is named after its header.
- **plugin-pins, plugin-save**: relative URLs are judged against a fixed http base rather than the
  page's own URL, so they keep their link / download on `file:`, app-scheme (`capacitor:`) and
  `about:srcdoc` pages (resolving against `about:srcdoc` threw). Pins also link `tel:` URLs. Both use
  one check (`safeUrl` in `@gallerist/core/internal`) with their own scheme lists.
- **plugin-thumbnails**: a right-to-left rail follows its scroll; it read the first card (the
  rightmost) as the one in the middle and folded the drawn run back to the start, leaving what showed
  empty. The rail reads which way it runs from its scroller rather than from two cards, so a `flat`
  rail on a side rail (cards side by side in a vertical rail) measures down the rail and no longer
  scrolls sideways; a line holding several cards counts them all.
- **plugin-thumbnails**: a numeric `overscan` below half the cards that fit is raised to that, so the
  rail never draws with gaps.
- **plugin-thumbnails, plugin-grid**: focus on a thumb or cell that a redraw takes away (new data via
  `setCollection`, a jump past the drawn run, the item column rebuilt for a new group) moves to the
  grid's new current cell or to the viewer, not to `<body>` where the keys don't reach.
- **plugin-thumbnails, plugin-grid**: the drawn cards, item thumbs and cells carry `aria-setsize` /
  `aria-posinset`, so a screen reader gives each its place in the whole list, not in the drawn part.
- **plugin-pins**: a form in a pin card can keep Escape with `preventDefault()`, as GETTING-STARTED
  says; the card used to close first. Otherwise Escape inside the card closes the card (focus back on
  its pin) and leaves the viewer open.
- **renderer-dom, plugin-captions, react**: a caption that isn't a string (an old `OverlaySpec`
  caption in untyped JSON or CDN data) counts as none: no "[object Object]" in the caption bar, no
  object handed to the host, no React error from `<Gallerist.Caption>`.
- **renderer-dom**: the viewer is described by its caption (`aria-describedby`) only while the caption
  bar shows, so hidden text isn't read out.
- **plugin-captions, react**: the item's text caption, shown when `render` / `<Gallerist.Caption>`
  returns nothing, sits in a `span.gallerist-caption-text`, so it keeps the theme's caption font.
  `<Gallerist.Caption>` treats `true` / `false` like `null`.
- **plugin-save**: a cross-origin `downloadUrl` opens in a new tab (`target="_blank"`,
  `rel="noopener"`; browsers ignore `download` there) instead of navigating the host page away, and
  `downloadUrl(item)` is called once per click.
- **build**: `pnpm check:dist` also fails when a packed package lacks a file its `package.json`
  points at (`main`, `types`, every `exports` target, the theme's CSS, the CDN build), skips folders in
  `packages/` without a `package.json`, and runs in the release workflow before publishing.
- **plugin-thumbnails, plugin-grid**: moving the cursor no longer scrolls the page around an inline
  viewer; only the viewer's own panels scroll.
- **plugin-thumbnails**: a viewer opening on a far group now scrolls the rail to it.
- **theme**: every skin's backdrop is opaque (Gallery and Console were 98%, Editorial 99%), so the
  host page no longer shows through on phones, in light and dark schemes. Drag-to-dismiss still fades
  it to show the page.
- **theme**: a caption renderer's content taller than a placard (editorial) scrolls inside the placard;
  it was cut off. The placard keeps its slot, so the stage still doesn't move.
- **theme**: a caption renderer's band stops growing where the stage would drop below 36% of the
  viewer (a tall rail and bar on a phone, or the reviewer's timeline), and scrolls from there; it
  used to take its full 40vh and leave the stage as little as 28%.
- **plugin-pins**: the default card links only to `http:`, `https:`, `mailto:`, `tel:` and relative URLs; a
  pin whose `href` is `javascript:`, `data:` or any other scheme gets no link (pin data can come from
  users).
- **plugin-save**: an item with nothing safe to save (no URL, or a `data:`, `javascript:` or
  `file:` one) marks the button unavailable (`aria-disabled`, dimmed; it stays focusable) instead of a
  click that does nothing, per item as you navigate. `client-zip` is a regular dependency (`^2.5.0`),
  so an install without optional dependencies can't break a bundler on zip mode's `import()`.
- **build**: source maps carry their sources (`sourcesContent`) in every package, since `src/` isn't
  published; they pointed nowhere before. `pnpm check:dist` packs every package and fails on a leftover `workspace:`
  range.

### Added
- **renderer-dom, plugin-thumbnails**: presets configure the rail. `thumbnails()` takes the mounted
  preset's `thumbnails` options for each option it wasn't given, and an explicit one wins, key by key:
  `preset: 'reviewer'` alone now gives the timeline and numbered items, `tour` the section index,
  `editorial` the numbered item row; React's `preset` prop too. No more
  `thumbnails(resolvePreset(name).thumbnails)`. The rail settles its options when its region mounts,
  so a `viewer.use(thumbnails())` after `mount()` follows the preset as well.
- **core**: `RegionCtx.preset` (`PresetDefaults`), the renderer's mounted preset as defaults for
  plugins, keyed by what they configure; core stays renderer-agnostic. The DOM renderer passes its
  `ResolvedPreset` (now a type alias, so it fits).
- **plugin-captions** (new): designed captions, one `render(item, group, ctx)` per viewer, drawn into
  the renderer's new `caption` region (the caption bar, the editorial placard, wherever the preset puts
  it). A string is set as text; `null` shows the item's text caption. Re-renders on navigation and
  collection changes, not on zoom; `refresh()`; cleans up on removal. In the CDN global as `captions`.
- **renderer-dom**: the caption is the viewer's accessible description (`aria-describedby`); the
  navigation announcement stays position + `alt`.
- **react**: `<Gallerist.Caption>{({ item, group, cursor }) => …}</Gallerist.Caption>` (a portal into
  the caption region), `useCurrentItem()` → `{ item, group, cursor }`, `open={{ g, i }}` to open at a
  position (a new position while open moves the cursor), and the mount options `label`,
  `returnFocus`, `preload` and `adapters`, which were dropped before.
- **plugin-pins**: `renderCard` returning `null` keeps the default card for that pin; the default card
  is exported as `defaultPinCard(pin, { presentation, strings })`.
- **plugin-save**: `downloadUrl(item)`, the file to save (e.g. the full-resolution original), or
  `null` for an item that can't be downloaded; zip mode honours it too.
- **renderer-dom**: Escape still closes from anywhere, including a text field, but not when a handler
  before the viewer's called `preventDefault()` on it, so a host form can keep Escape.
- **docs**: real READMEs for plugin-save and plugin-fullscreen; the React README documents the
  imperative ref, `open` positions, captions and hooks.
- **renderer-dom (M21)**: `bind()` and `collectionFromLinks()`: open a viewer from `data-gallerist`
  links, with groups, captions and thumbnails read from attributes; links added later join in.
- **cdn (M21)**: `@gallerist/cdn`, a one-file UMD build on a global `Gallerist`, for pages with no
  build step (`examples/cdn`).
- **react (M21)**: the build carries a `"use client"` banner, for React Server Components.
- **plugins (M21)**: `strings` on thumbnails, grid, download and fullscreen, with exported English
  defaults. An audit test fails on any UI text that can't be translated.
- **renderer-dom (M20)**: the `tour` preset: a section index beside the stage, ←/→ between sections on
  labelled arrows, ↑/↓ within one, framed media. Options: `groupAxis` (which arrows move between
  groups, independent of the rail) and `arrowLabels` (name the group arrows after their target), with
  `strings.previousTo` / `nextTo`. Both are React props too.
- **plugin-thumbnails (M20)**: `groupDisplay: 'index'`, a section index with names, subtitles and
  counts, the active section expanded; chips on a bottom rail or at 900px wide or less.
- **plugin-grid (M20)**: `layout: 'sections'` (an overview, one card per group), `startOpen`. Hiding the grid now hands focus to the viewer, so keys keep working after a cell click.
- **renderer-dom (M20)**: the overlay's Tab trap skips hidden controls, so Tab can't leave the dialog
  past one.
- **examples/tour**: a listing page using all of the above.

### Breaking
- **plugin-thumbnails**: under a preset, an option left unset follows the preset, so a bare
  `thumbnails()` changes with it: `preset: 'reviewer'` now draws the timeline and numbered items it
  used to need spelling out; `tour` turns the rail into the section index (`groupDisplay: 'index'`,
  numbered items); `editorial` moves the item stack out of the aside column into a numbered row in the
  rail (`itemAxis: 'horizontal'`, `numberItems: true`). Pass the option (e.g. `timeline: false`,
  `groupDisplay: 'stacked'`) to keep the old rail. An explicit `groupDisplay` other than the preset's
  also drops its `itemAxis`, `numberItems` and `timeline`, which belong to the preset's own display.
- **plugin-thumbnails**: the rail's DOM is no longer created in `init()`, only when its region mounts
  (`mount()`, or a `viewer.use()` after it), so a viewer that is never mounted creates none. A new
  mount after the previous one was destroyed builds the rail again, with that mount's preset.
- **core**: `Item.caption` is plain text (`string`); it no longer accepts an `OverlaySpec`, which the
  DOM renderer never drew. Designed captions come from `@gallerist/plugin-captions` or
  `<Gallerist.Caption>`, so item data stays JSON.
- **plugin-thumbnails**: `overscan` is unset by default (the rail measures itself; it was 24) and
  counts cards on each side of the card in the middle of the rail rather than of the cursor. A jump
  past the drawn run first draws around the new current card (wide enough for it to land at either
  edge of the rail), and the scroll that reveals it trims the run back to the middle. A number below
  half the cards that fit is raised to that.
- **plugin-grid**: `overscan` counts cells (default 40) or sections (default 4) on each side of the
  current one, drawn when the grid opens; it used to count groups (default 12) and, for `sections`,
  bound the overview, which otherwise drew every group.
- **renderer-dom (M19)**: without a `scheme` option the root no longer carries
  `data-gallerist-scheme="dark"`. Each skin applies its own default (Gallery and Console dark,
  Editorial light), so the look is unchanged; only CSS that selected `[data-gallerist-scheme="dark"]`
  by default needs `:not([data-gallerist-scheme])` too.
- **theme + renderer-dom + react (M16)**: the default look is now the **Gallery** skin: quiet
  near-black surfaces, round controls, sans numerals, and a periwinkle tint for focus only.
  The previous graphite + amber look is the **Console** skin. It is unchanged, verified as a zero
  computed-style diff across the layout lint's configurations. To keep it, load it and opt in:
  `import '@gallerist/theme-default/console.css'` after `gallerist.css`, then
  `mount(viewer, { skin: 'console' })` or `<Gallerist skin="console">`.
- **renderer-dom + react**: appearance is three options, `skin` (`gallery` | `console`), `accent`
  (named per skin) and `scheme` (`dark` | `light` | `auto`), reflected as `data-gallerist-skin`,
  `data-gallerist-accent` and `data-gallerist-scheme`. React's `theme` prop is replaced by `accent`,
  and the `data-gallerist-theme` attribute is gone. All three props are reactive in React, and
  `applyAppearance(root, …)` changes them on a mounted vanilla viewer (only the options given).
- **theme**: token declarations live in cascade layers, so a page's `--gallerist-*` override on
  `.gallerist` wins in every skin, scheme and accent, also on phones, and the skins apply in a
  fixed order whatever order the files load in. An existing override keeps working after
  switching to `skin: 'console'`. Component rules are not layered.
- **theme**: Console's vermilion accent puts dark ink on the accent (white was 3.1:1).
- **core**: renderer/plugin plumbing moved off the public `ViewerApi` to
  `@gallerist/core/internal`: `viewer.emit`, `getPlugins` and `onPluginsChanged` are now
  `getInternals(viewer).emit(…)` etc. The engine building blocks (normalize, store, FSM, nav,
  windowing, springs, arbitration, zoom math, emitter) moved there too, so the root entry is just
  the app-facing API (spec §8.4). Root bundle 3.5 → 2.7 KB gz.
- **core**: `normalize` (and so `createViewer` / `setCollection`) throws on a duplicate group id or
  item id.
- **core**: `zoomTo(scale, focal?)` now does what spec §8.2 says: `focal` is a stage point (px) whose
  content stays fixed, defaulting to the stage centre. It used to be treated as the pan offset. Set
  a full transform with `getInternals(viewer).setZoom({ scale, x, y })`.

### Added
- **theme (M19)**: the **Editorial** skin (`editorial.css`, `skin: 'editorial'`). A warm gallery
  wall, with a Night scheme, ink type, serif titles and captions, outlined round arrows, and
  `vermilion` / `cobalt` accents. Works fade in rather than slide: the slide animations are now
  tokens (`--gallerist-enter-group`, `--gallerist-enter-item`); items settle in (a fade with a
  slight scale) so the two axes never share a motion.
- **renderer-dom (M19)**: `frame` option. The work hangs inside the stage with room around it, and
  the media element is sized to the image, so a skin's mat and shadow hug it. Zoom bounds,
  overlays, pins and the navigator follow the framed box. `itemIndicator: 'placard'` moves the item
  navigator into the caption, as ticks and `n / N` under the item's caption.
- **renderer-dom (M19)**: the `editorial` preset: framed media, a placard caption beside the work,
  and numbered items inline in a bottom rail.
- **renderer-dom (M18)**: `navigator` option, a zoom navigator. While zoomed in, a minimap of the
  image with a box for the visible part; click or drag to move around. On in the `reviewer` preset.
- **plugin-thumbnails (M18)**: `timeline` (a time label and tick above each group card, joined
  into a track; `true` reads `group.meta.time`) and `numberItems` (numbered item thumbs). The
  `reviewer` preset turns both on.
- **plugin-pins (M17)**: new `@gallerist/plugin-pins`. Pins are points on an item that follow pan
  and zoom at a constant size and open a card. Three presentations: `comment` (numbered threads
  with replies and a resolved state, plus `onPlace` to drop a new one with a click or `c`), `tag`
  (a product hotspot with a card and link) and `feature` (numbered notes). Pins come from
  `item.meta.pins` or a `pins(item, group)` reader. A toolbar toggle and `p` show or hide them;
  Escape closes a card, not the viewer. `refresh()`, `setVisible()` and `open(id)` let the host
  drive them. Styles are in `theme-default/pins.css`, which `gallerist.css` includes, and are drawn
  from the skin's tokens. Demo: `examples/hotspots`.
- **core + renderer-dom**: a plugin's `overlays` may be a function of the slide
  (`({ group, item }) => OverlaySpec[]`). Overlays repaint when an item's data changes under the
  same id. An interactive overlay whose content has its own controls is no longer an extra tab
  stop, and double-clicking a control in the stage no longer zooms.

### Changed
- **theme (M18)**: the Console skin is polished to its design canvas. The bar and rail are opaque
  graphite bands with hairlines. Tools are flat until pressed, and a pressed toggle gets a raised
  surface with an accent glyph and underline instead of an accent fill. Focus is a neutral ring, so
  it never reads as selection. Idle thumbs recede a little, and the accents move to the canvas
  values (amber `#f2a93b`, cyan `#3cc8dc`, vermilion `#ff6b4a`). Console now uses
  `color-scheme: dark` (dark native scrollbars). New base tokens let any skin do the same:
  `--gallerist-bar-bg`, `--gallerist-bar-border`, `--gallerist-rail-border`, `--gallerist-tool-fg`,
  `--gallerist-pressed-shadow`. Gallery is unchanged.
- **theme (M18)**: plugin-grid's styles move from `base.css` to `grid.css` (like `pins.css`);
  `gallerist.css` includes both, so only a skin built on `base.css` alone needs to import them.
- **examples/monitoring (M18)**: Console + `reviewer` with timeline times, numbered monitors, the
  zoom navigator and comment pins (press C to add one).
- **theme (M16)**: `theme-default` splits into `base.css` (structure: layout areas, reserved space,
  the mobile layer, RTL, reduced motion, every component rule) and skins that only set tokens.
  `gallerist.css` stays the zero-config entry (base + Gallery). New tokens let a skin give bar
  tools, arrows and the item navigator their own treatment, and restyle selection rings, idle thumbs,
  dots, the counter, title and caption. Light schemes: Gallery's warm paper and Console's Paper.
  Accents: Gallery `periwinkle` / `mint` / `amber` / `vermilion`, Console `amber` / `cyan` /
  `vermilion`, each with a value per scheme. The layout lint now runs every configuration in both
  skins.
- **renderer-dom + theme (M15)**: the viewer is laid out as a grid of areas: top bar (counter →
  group title → plugin tools → zoom reset → close), stage, an `aside` column, caption bar, footer and
  rail. Persistent chrome now takes space instead of covering the image, and no two pieces of chrome
  can overlap in any preset, arrow layout, rail position or direction. A Playwright layout lint
  checks 16 configurations on desktop and phone for overlaps, off-screen chrome, a covered stage
  and touch targets under 44px.
- **renderer-dom**: ↑ · position · ↓ form one item navigator, hidden for one-item groups and in
  linear mode; zoom reset shows only while zoomed; group and item captions are shown (bar title and
  caption bar); the `dpad` layout is now a keyboard-arrow cluster.
- **plugin-thumbnails**: the vertical item stack moves into the new `aside` region beside the stage
  (it used to float over the stage), and stays up for one-item groups so the stage keeps its width.
- **theme**: a mobile layer (compact chrome under 600px, 44px touch targets, safe areas, swipes
  instead of on-image arrows on touch) and RTL arrow glyphs that point the reading direction.
- **renderer-dom**: generic wording: announcements and pill labels say "item", not "screen".
- **renderer-dom + react**: `itemIndicator` option: `pills` (default), `dots` (plain dots with the
  count) or `counter`.
- **renderer-dom + react**: `strings` option (`mount(viewer, { strings })`, `<Gallerist strings>`)
  for every label and announcement the renderer produces, with English defaults
  (`DEFAULT_STRINGS`); positions are functions so a language can order words and numbers.
- **plugins + renderer-dom**: one icon family. The shared SVG set moves to `@gallerist/core/internal`
  (`ICONS`) and the toolbar buttons of thumbnails, grid, fullscreen and download use it instead of
  Unicode glyphs. Zoom reset gets its own icon (it used to look like fullscreen). The fullscreen
  button exposes `aria-pressed`, and a pressed toggle (accent fill) looks different from focus (ring).
- **renderer-dom + theme (M15 review)**: the chrome contract was hardened after an independent
  review. Captions get a fixed two-line band, reserved per collection so the stage doesn't jump.
  Focus stays in the viewer when the focused zoom reset or item navigator hides. With
  `controls: false` an empty top bar is hidden. Immersive arrows are inset clear of the floating bar,
  caption and rail, and the floating chrome lets clicks through to the image. On touch the item
  navigator is always reachable, and group arrows reappear on keyboard focus. Phones drop the items
  toggle and let bar tools scroll instead of overflowing. Collapsing the rail hides the `aside` item
  stack. Side rails stay on their physical side in RTL, using the new `data-gallerist-dir`
  attribute instead of `:dir()`. The dialog name and carousel role description are translatable
  (`strings.dialog`, `strings.carousel`). The layout lint now also covers long captions, zoom,
  `controls: false`, RTL side rails, immersive arrow layouts and a 320px touch screen, and checks
  occlusion, stage size and item-axis reachability.

### Fixed
- **plugin-thumbnails**: the item stack went into the rail instead of the side column when an
  overlay viewer opened after mount (on a click, as pages do). The column is used whenever the
  renderer has mounted it, not only once it is in the document.
- **renderer-dom (M17)**: a repaint of the overlays keeps keyboard focus on the same overlay
  instead of dropping it to `<body>`; a double click inside an interactive overlay doesn't zoom.
- **core + renderer-dom (M17)**: zoom and pan are bounded by the painted image, not the stage. A
  zoomed portrait in a landscape stage (or a panorama in a tall one) stays centred until it is wider
  than the stage, and can no longer be dragged into the empty letterbox beside it. The bound updates
  when the image's natural size arrives. New `clampPanToBox` in `@gallerist/core/internal`.
- **core**: a throwing event handler no longer stops later handlers (it is reported via
  `reportError`); a destructured `preventDefault()` works; `zoomTo` ignores NaN/negative input.
- **core**: the `overlays` option of `createViewer` (and so `<Gallerist overlays>`) was declared but
  never read. Global overlays passed there now render.
- **react**: `items` / `groups` / `collection` are reactive. They were read once at construction,
  so data that arrived later (an API call) never showed. Changed content is applied with
  `setCollection`, keeping the cursor on the same item. Inline data rebuilt with the same content
  is ignored, and an invalid update is logged instead of crashing the tree.
- **react**: `on` handlers always call the latest props instead of the first render's closures.
- **core + renderer-dom + theme**: open/close are real transitions. `opened` / `closed` fire when
  the open fade (280ms) or close fade (180ms) ends, and the overlay stays mounted through its exit
  instead of vanishing. Renderers drive this via `getInternals(viewer).setLifecycleDriver`. The
  phase is exposed as `data-gallerist-phase`. No animation under reduced motion.
- **renderer-dom**: plugin region renderers run once per plugin instance, as PLUGIN-AUTHORING
  promises. Every plugin change (each React `<Gallerist.Overlay>` mount) used to re-run all of them
  and rebuild every region host. Hosts are now only touched when their nodes change.
- **core + renderer-dom**: `viewer.refresh()` re-measures (re-anchors overlays, re-clamps zoom).
  It was a no-op that no renderer could hook.
- **core**: `open({ g, i })` on a viewer that is already open now navigates like `goTo` (slide/item
  events, cancelable). It used to move the cursor silently. Reopening starts at fit instead of
  the previous session's zoom.
- **renderer-dom**: cancelled media loads are no longer reported as `loadError`.
- **core + renderer-dom**: zooming back out (keyboard, double-tap, pinch, `zoomTo`) no longer
  leaves the image off-centre or panned past its edge. The renderer lends the core its stage
  geometry, and every committed zoom is clamped against it.
- **renderer-dom**: `pointercancel` abandons the gesture instead of acting as a release (no stray
  navigate/dismiss); the item-axis swipe needs the same commit distance as the group axis.

## v0.2.0

> **Renamed before first publish:** the project was developed as *Visora* (`@visora/*`); the
> `@visora` npm scope belongs to an unrelated publisher, so every package ships as `@gallerist/*`.
> CSS tokens are `--gallerist-*`, attributes `data-gallerist-*`, and the React API is
> `<Gallerist>` / `useGallerist()`.

This version was tagged in git but never reached npm; 0.3.0 is the first npm release. Alongside the UX overhaul below, a multi-axis
publish-readiness review drove a hardening pass (all critical + important findings fixed):

- **Correctness**: a `ResizeObserver` now re-anchors image-space overlays and re-clamps zoom on
  resize/rotate; gestures use pointer capture (off-stage releases no longer strand a gesture) and
  hand off cleanly from pinch to pan; the slide window preloads the wrap neighbour when `loop` is
  on; overlays repaint once the image decodes; lifecycle events fire only on real transitions;
  `keepZoomOnNav` is implemented.
- **Accessibility**: the overlay is a real modal — focus trap + `inert` background, an accessible
  dialog name, no shortcut-hijacking while typing, a visible broken-image state, and richer live
  announcements. Logical-property chrome + flipped arrows give basic RTL support.
- **Plugins**: hash tolerates malformed URLs / `=` in ids and uses `replaceState` (no Back-button
  trap); fullscreen scopes to its own viewer and supports the WebKit-prefixed API; download defers
  its blob revoke; the YouTube adapter declines unparseable URLs and sets `playerVars.origin`.
- **Performance**: wheel/trackpad zoom is RAF-coalesced and committed once per burst; the renderer
  skips the window diff on zoom/pan-only commits; React no longer leaks plugins across remounts and
  `useGallerist` returns stable action identities.
- **Release**: every package ships at `0.2.0` with a `VERSION` derived from `package.json`, a
  LICENSE, a README, lean sourcemaps (no embedded source), correct ESM/CJS types (attw-clean), and
  full npm metadata; CI gains an attw gate and a changesets release workflow.

See `plans/phase-1-review-report.md` for the full review and `docs/IMPLEMENTATION.md` §10 for the
consciously-deferred items.

### UX/UI overhaul ("pristine")

A hands-on pass over the React example drove a focused UX milestone. The default look moves from a
generic dark-glass lightbox to a distinctive **pro-review console** identity, the within-group axis
gets a real fix, and layout becomes configurable via smart **presets**. API additions are
non-breaking; the **default theme appearance changes** (pre-1.0, so semver-minor — old look is
reproducible via token overrides).

### Added
- **core**: optional `caption?: string` on `Group` (Item already had `caption`); shown on rail
  cards, render-only-if-present (no `alt` fallback).
- **renderer-dom**: real inline **SVG chrome icons** (replacing Unicode glyphs); configurable
  **arrow placement** (`arrows`: `pill-right` default · `corner-br` · `dpad` · `split`) via
  `data-gallerist-arrows`; **rail placement** (`rail`: `bottom` default · `top` · `hidden`) via
  `data-gallerist-rail-pos`; **rail collapse** (`t` key + a top-right toggle button +
  collapsed-by-default in fullscreen, `data-gallerist-rail`); **idle auto-hide** of chrome (`autoHide`,
  `data-gallerist-idle`, inert under `prefers-reduced-motion`); **layout presets** (`resolvePreset`,
  `preset` option) that resolve a **visibly distinct** layout — `filmstrip` (bottom rail),
  `reviewer` (bottom timeline + corner arrows), `immersive` (rail hidden + auto-hide), `contact`
  (top rail); **segmented position indicator** (pills ≤8 items, mono `n / N` fallback).
- **plugin-thumbnails**: `itemAxis` (`vertical` default — the ↑/↓ axis reads top-to-bottom);
  optional **`caption`** rendered as a single label band **beneath each thumbnail** (group + item),
  shown only when provided.
- **theme-default**: graphite + signal-amber identity, mono tabular numerals, **accent variants**
  via `data-gallerist-theme` (`amber` default · `cyan` · `vermilion`).
- **react**: `preset`, `theme` (reactive), `arrows`, `rail`, `autoHide` props; re-exports
  `resolvePreset` and the preset/arrow/rail types.

### Fixed
- **plugin-thumbnails (bug #5)**: the active thumbnail no longer drifts horizontally when paging
  within a group with ↑/↓. The rail **reconciles in place** (keyed nodes, `data-active` flip,
  `scrollIntoView`) instead of rebuilding on every cursor move; the active group's card
  **live-previews** the current item.

### Review hardening (pre-release)
- thumbnails: cover-thumb cache is windowed (no unbounded growth on long traversals); live-preview
  src pinned via a `dataset.live` flag.
- renderer-dom: chrome counter/pills update only on cursor/collection change (skip zoom/pan);
  idle controller created before mount-attach and armed on show in inline mode too; a manual rail
  toggle during fullscreen survives exit; idle re-arm coalesced to avoid `pointermove` timer churn.

### UX follow-up (pre-release)
- The **caption is the single under-thumbnail label** — rendered as a band beneath the image, not an
  overlay. Removed the separate time-ribbon `ticks` concept (a timestamp is just a caption the host
  supplies).
- **Presets are now visibly distinct** via rail placement (bottom / top / hidden), not just arrow
  nuance. Added the `rail` option (renderer + React).
- Moved the rail-collapse toggle to the **top-right beside Close** so it's no longer hidden behind
  the footer/caption area.
- Example: removed the full-width footer caption strip; the timestamp is folded into the
  per-thumbnail caption; the preset switcher shows what each preset changes.

## v0.1.1 — Phase 1 review hardening

From an end-to-end five-axis review of Phase 1 (0 critical, 8 important + suggestions). No API breaks.

### Security
- **plugin-download**: allowlist download URL schemes (`http`/`https`/`blob` only — reject
  `javascript:`/`data:`/`file:`) before assigning `a.href` or fetching; sanitize filenames (strip
  path separators, traversal, and control chars) for the `download` attribute and the **zip entry
  name** (closes zip-slip + filename/header injection).
- **renderer-dom**: reject CSS `url()` breakout in an image `placeholder` (a quote injected a second
  `url()` → attacker-controlled image request).
- **plugin-video-youtube**: anchor YouTube host matching to the hostname so look-alike domains
  (`evil-youtube.com`) no longer match.

### Fixed
- **plugin-video-youtube**: parse `/shorts/` and `/live/` URLs (previously claimed but unplayable);
  reject the API script when it fails to load or times out (no forever-pending memo); `advanceAxis`
  parity and an optional `nocookie` embed host; typed the IFrame API surface.
- **renderer-dom**: resolve `mediaAdapters` live — a plugin added via `viewer.use()` after mount now
  contributes its adapter, matching overlays/regions.
- **react**: create the viewer with lazy `useState` and stop destroying it in the adapter — fixes
  `<Gallerist.Overlay>`/`<Gallerist.Region>` vanishing and nav no-op under StrictMode; deterministic
  overlay ids via `useId` (no SSR hydration mismatch).
- **plugin-thumbnails / plugin-grid**: rebuild only on cursor/collection change (skip unrelated
  commits); thumbnails item row uses `role=group` (valid nested ARIA).
- **plugin-hash**: value-compare guard instead of a boolean latch (robust to coalesced/async
  `hashchange`); ignore malformed hashes.
- **plugin-download**: degrade to per-file downloads when `client-zip` is absent; skip non-ok
  fetches and thread an `AbortSignal` through the zip path.
- **core**: `getPlugins()` returns a copy of the registry.

### Chore
- Pin `client-zip` exact (2.5.0) and add a non-blocking `pnpm audit` step to CI.

## v0.1.0-phase1 — Plugins + React adapter

### Added
- **Plugin architecture** (spec §13): `Plugin` / `PluginInstance` / `RegionName` / `RegionCtx`
  contract in `@gallerist/core`; named region hosts (toolbar/footer/thumbnails/stage/backdrop) in
  `@gallerist/renderer-dom`; `viewer.use()`, `getPlugins()`, `onPluginsChanged()`. See
  `docs/PLUGIN-AUTHORING.md`.
- **`@gallerist/react`** — `useGallerist()` hook (`useSyncExternalStore`), `<Gallerist>` component
  (controlled `open`/`onClose` + imperative ref, SSR-safe), and the JSX portal bridge
  `<Gallerist.Overlay>` / `<Gallerist.Region>`.
- **Plugins** (each its own tree-shakeable package): `plugin-fullscreen`, `plugin-hash`
  (deep-link `#g=&i=`), `plugin-download` (single/group/zip), `plugin-thumbnails` (grouped,
  windowed), `plugin-grid` (in-viewer contact sheet), `plugin-video` (HTML5),
  `plugin-video-youtube`.

### Changed
- `viewer.use()` now returns a disposer; the renderer recomputes plugin overlays live and
  repaints on plugin changes (enables React overlays/regions to mount/unmount dynamically).
- `windowIndices` / `reconcileKeys` moved to `@gallerist/core` (pure logic plugins reuse).
- The renderer calls `MountedMedia.activate()` / `deactivate()` on slide enter/leave (play/pause).

### Size (gz)
- core 3.46 KB / 12 KB · core+renderer 7.79 KB / 16 KB · core+renderer+thumbnails 8.45 KB / 24 KB
  · react 0.82 KB.

## v0.0.0-phase0 — Engine MVP

### Added
- Headless `@gallerist/core` (data model, store, FSM, two-axis nav, zoom/gesture math, events,
  spring sampler), `@gallerist/renderer-dom` (windowing, image adapter, gestures, overlays, a11y),
  `@gallerist/theme-default`, and the vanilla API. See `docs/IMPLEMENTATION.md`.
