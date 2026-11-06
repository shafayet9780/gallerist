# @gallerist/plugin-thumbnails

## 0.4.0

### Minor Changes

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

## 0.3.2

### Patch Changes

- bd24083: Two fixes found in the reviewer layout on phones.

  - **An open pin card no longer sits under the zoom minimap (plugin-pins).** After zooming in with
    a card open (a pinch or ctrl+wheel), the minimap (`navigator: true`, on in the `reviewer` preset)
    could cover the start of the card, such as the note field of a draft comment. The card now keeps
    clear of the minimap, as it already did of the docked item navigator: when the minimap is in the
    card's columns, the card's room ends above or below it, whichever leaves more, and the card stays
    on its side of the pin (scrolling if it no longer fits). This works in every corner the minimap
    uses (the top one on a phone, the bottom one on wider screens, mirrored right to left). The card is
    placed again when the minimap shows or hides with the zoom.
  - **The thumbnails rail keeps the next card in view (plugin-thumbnails).** Stepping through the rail
    used to leave the current card flush against the rail's far edge, so the card that came next was
    out of view; on a phone, at item 14 of 15 the 15th was off screen. Now, while the current card and
    the cards on either side of it show whole, the rail stays put, so clicking a card in view doesn't
    move it. Once one of them would be cut off, the rail centres the current card. At either end the
    scroll stops at the first or last card. This applies to every rail that scrolls (`flat`, `stacked`,
    `index` rows and chips, side rails, right to left) and to the item column. The rail still scrolls
    instantly, with no animation.

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
