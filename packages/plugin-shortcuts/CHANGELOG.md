# @gallerist/plugin-shortcuts

## 0.5.1

## 0.5.0

### Minor Changes

- 25e58a2: **renderer-dom (changed):** a plugin's `keymap` is asked before the renderer's own keys, so a plugin
  can rebind one for a layout. A handler takes a key with `preventDefault()`, and the renderer then does
  nothing with it; otherwise the renderer's own key for it (an arrow, Home/End, `+`/`-`/`0`, `t`, 1–9,
  Escape) runs after. A plugin is not asked for a chord (Ctrl, ⌘, Alt; AltGr is fine), a key a handler
  took already, a key from a text field (shadow roots too; Escape there is the renderer's alone), an
  arrow key from inside a dialog, menu or slider in the viewer, a host's listbox, tab list, radio
  group, menu bar, tree or grid (not the viewer's own rail or grid), or from a menu button
  (`aria-haspopup`, not `"false"`; the overlay's root, a dialog, doesn't count), and a focused caption band that scrolls keeps ↑/↓ /
  Home / End for scrolling first. A host no longer needs a capture-phase listener to take an arrow key.
  A handler that throws doesn't stop the renderer's own key (Escape still closes); its error is
  reported (`reportError`, else `console.error`).

  **plugin-thumbnails (new):** `clusterKeys: true` gives a flat rail's ↑/↓ (a row rail walks with ←/→)
  to its clusters: ↓ steps to the next item of the current one's `cluster`, ↑ to the one before,
  announced as any step is; at the cluster's end they do what they did. Plain ↑/↓ only: Shift+↑/↓
  (and a chord) stay the renderer's. A stacked rail keeps ↑/↓ for its
  items; down a side rail, where ↑/↓ walk the rail, the cluster's next item is the walk's next, and
  a side rail with `mount(…, { linear: false })`, where ↑/↓ step by group, keeps them for that. A
  reviewer whose captures span monitors (`cluster: (item, g) => \`${g}:${capture}\``) switches monitors
  with ↑/↓ and no keyboard code of its own, and a keyboard user can still scroll a long caption band.

  **plugin-shortcuts (new):** lists ↑/↓ "Previous / next in the cluster" while plugin-thumbnails'
  `clusterKeys` holds them (`strings.prevNextCluster`).

  Upgrading: a plugin keymap entry for one of the renderer's keys used to be ignored (the renderer's
  key won); now it runs first, and the renderer's key runs too unless the handler calls
  `preventDefault()`. A plugin given a renderer key on purpose (`grid({ key: 't' })`) now toggles both.
  A host that took ↑/↓ with a capture-phase `keydown` listener and `preventDefault()` keeps working (the
  renderer still leaves a key a handler took); with plugin-thumbnails' `clusterKeys` it can delete it.
  A plugin's arrow keys no longer reach it from inside a dialog, menu or slider in the viewer, a host's
  listbox, tab list, radio group, menu bar, tree or grid, or from a menu button.

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
- 051f91d: **Keys from a field in a shadow root, and keys typed with AltGr.** A text field inside an open shadow
  root in the viewer (a host's web component) keeps its keys, as a field in the light DOM always did: the
  viewer reads the event's first target, not the shadow host. A plugin's key typed with AltGr (Ctrl + Alt
  on Windows, as `?` is on some layouts) reaches the plugin instead of being taken for a browser chord.
