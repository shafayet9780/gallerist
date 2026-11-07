# @gallerist/plugin-shortcuts

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
