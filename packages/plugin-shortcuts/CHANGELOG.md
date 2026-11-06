# @gallerist/plugin-shortcuts

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
