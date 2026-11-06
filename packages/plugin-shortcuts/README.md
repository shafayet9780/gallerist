# @gallerist/plugin-shortcuts

Gallerist plugin — the viewer's **keyboard shortcuts** in a modal dialog, on **`?`**. It lists the
keys that work in the viewer as it is laid out right now, and on a touch screen the gestures instead.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-shortcuts
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { shortcuts } from '@gallerist/plugin-shortcuts'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { view } from '@gallerist/plugin-view'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({
  groups,
  plugins: [
    thumbnails(),
    view(), // its popover gets a last row, "Keyboard shortcuts ?"
    shortcuts({ shortcuts: [{ keys: ['N'], label: 'Add a note', gesture: 'Long press' }] }),
  ],
})
mount(viewer, { preset: 'reviewer' })
```

Nothing joins the toolbar (it is crowded enough). The list opens:

- on **`?`** while the viewer has focus (not while typing in a field in it, not with Ctrl, ⌘ or Alt);
- from the [View menu](../plugin-view/README.md)'s last row, when both plugins are registered;
- from the host: `shortcuts()` returns the plugin with `open(keys?)` and `close()`, for a help button
  of your own (`open()` returns `false` when no viewer it is registered on is open). The instance
  (named `shortcuts`, `ShortcutsInstance`) has the same `open()` / `close()`, `isOpen`, and `label`.

`open()` with no argument shows the gestures on a coarse pointer (a phone, a tablet) and the keys
otherwise; `open(true)` the keys, `open(false)` the gestures. `?` always shows the keys (a keyboard
pressed it).

## What it lists

The list is built each time it opens, from what the viewer does then, so it never lists a key that
does nothing:

- **Move.** With items grouped (a stacked or index rail, or none): ←/→ move between groups, ↑/↓
  within one, Home/End to the first / last group, 1–9 to an item in the group. A row rail
  (`groupDisplay: 'flat'`, or `linear`) walks every item in order: ←/→ and Home/End only. So does a
  collection where every group holds one item. A side rail (`groupAxis: 'vertical'`) turns the axes
  (↑/↓ between groups). Right to left, ← moves forward, and the list shows → ← for previous / next.
- **Zoom.** `+`, `−`, `0`: the renderer's keys, or [plugin-zoom](../plugin-zoom/README.md)'s stops
  when it is registered. Only while the collection has an item that can zoom: an image, or with
  plugin-zoom what its `zoomable` option accepts; the gestures leave out pinch and drag the same
  way.
- **Viewer.** F for fullscreen ([plugin-fullscreen](../plugin-fullscreen/README.md), where the
  browser can fullscreen an element), T to show or hide the thumbnails (with a rail), E for the
  group's items (a stacked rail), G for the grid, P and C for pins (C with `onPlace`), D (or its
  `key`) to download, `?` for this list, Esc to close (an overlay viewer). A plugin's key shows only
  while that plugin holds it: a later plugin that took the key hides it. The renderer reads its own
  keys first (the arrows, Home/End, `+` `=` `-` `0`, `t`, and 1–9 while items are grouped), so a
  plugin given one of them (`grid({ key: 't' })`) never gets it and shouldn't be: the list would
  show it. `?` typed with AltGr (Ctrl + Alt on Windows) counts as `?`.
- **Your own**, from `shortcuts`: `{ label, keys?, gesture?, section? }`. `keys` are drawn as key
  caps; `section` names a built-in section (its title: `strings.move`, `zoom`, `viewer`) or a new one
  after them; without it the entry joins Viewer. An entry with a `gesture` is listed with the
  gestures; one without `keys` only there.

**Gestures** (one list): swipe left or right for previous / next; swipe up for the next item in a
group (grouped items only); pinch or double-tap to zoom; drag to move while zoomed; swipe down to
close (an overlay viewer); then yours. A note under them says `?` lists the keys with a keyboard.

## Options

| Option | Default | |
|---|---|---|
| `shortcuts` | — | your own entries, as above |
| `strings` | English | every label, for translation; defaults in `DEFAULT_SHORTCUTS_STRINGS`, key names (`home`, `end`, `esc`) included. `toClose` is the close button's text, with `{key}` where the Esc key cap goes (`'{key} to close'`; `'Fermer avec {key}'`) |

## Keyboard, pointer and screen readers

The dialog is `role="dialog"` with `aria-modal="true"`, named by its title ("Keyboard shortcuts", or
"Gestures"). It sits in the viewer's root over a scrim that covers the viewer, and the rest of the
viewer is `inert` while it shows (what was inert already stays so). Focus moves to the dialog, so a
screen reader reads it, and **Tab** stays inside it: its close button, then the list, which takes
focus so the arrow keys, Page Up/Down and Home/End scroll it when the viewer is too short to show it
whole (it has no role or name of its own: the dialog's title is announced once) (the dialog keeps inside the viewer, an inline one included).
Each section is a heading
over a description list: what it does, then its keys.

- **Escape** closes the list, and only the list: the viewer stays open. **`?`** closes it too.
- The close button ("Esc to close"; an × named "Close" with the gestures), or a click or tap on the
  scrim, closes it. Focus goes back where it was before it opened (the View tool, when opened from
  its row). A press on the page outside the viewer closes it and leaves focus there.
- No other key acts while it is open: a `window` listener in the capture phase takes every key
  pressed in the viewer first, so the viewer doesn't move, zoom or close under it, and plugin-zoom's
  keys don't reach the image.
- It closes when the viewer closes, and when the plugin is disposed; if the renderer goes away with
  it open, its listeners go at the next key or press.

## Look

A panel in `--gallerist-popover-bg` with a hairline border and `--gallerist-popover-shadow`, centred
over the viewer on `--gallerist-scrim`, up to 720px wide: a header (keyboard glyph, title, Esc to
close), then the sections side by side, Move widest, wrapping when there are more. Keys are key caps
in the skin's surface and monospace face. At 600px wide or less it is a sheet from the bottom edge,
one column. It fades in over `--gallerist-dur-exit`, and not at all under reduced motion; right to
left it mirrors. Every skin and scheme gets the styles (`@gallerist/theme-default`, `base.css`).

## Not in the CDN bundle

`@gallerist/cdn` (the one-`<script>` build) doesn't include this plugin: it would take that bundle
past its size budget. Install it from npm alongside the packages above.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
