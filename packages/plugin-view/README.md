# @gallerist/plugin-view

Gallerist plugin — a **View** menu in the toolbar: switch the thumbnails rail between its stacked
layout and one flat row, and the colour scheme between dark and light, on an open viewer.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-view
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { view } from '@gallerist/plugin-view'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({ groups, plugins: [thumbnails(), view()] })
mount(viewer, { preset: 'reviewer' })
```

One tool joins the toolbar (a sliders icon, named "View"). It opens a small menu under itself with
two groups of choices:

- **Rail**: *Stacked* (one card per group) or *Row* (every item side by side, `groupDisplay: 'flat'`).
  Shown only while a thumbnails rail is mounted. The switch keeps the current item, and the viewer's
  keys follow the rail: a row walks every item in order with ←/→ (linear traversal, unless `mount()`
  was given `linear`), a stacked rail moves between groups with ←/→ and within one with ↑/↓.
- **Scheme**: *Dark* or *Light*, the viewer's `data-gallerist-scheme`, in whatever skin is loaded.

The menu shows what the viewer shows each time it opens (the rail's display, the scheme in effect),
so it always agrees with the viewer, however the setting was last changed.

## Options

| Option | Default | |
|---|---|---|
| `rail` | `['stacked', 'flat']` | the rail layouts offered, in order (`'index'` is a third); `false` leaves the section out |
| `scheme` | `['dark', 'light']` | the schemes offered, in order (`'auto'` follows the system); `false` leaves the section out |
| `initial` | — | `{ rail?, scheme? }` the plugin applies when the viewer mounts, e.g. restored from storage; over the rail's and the renderer's own values |
| `controlled` | `false` | settings the host applies itself: `true` for both, or `['scheme']`, `['rail']` |
| `onChange(state)` | — | called on every choice that changes something, with the state it asks for: `{ rail, scheme }` (`rail` is `undefined` without a rail) |
| `strings` | English | every label, for translation; defaults in `DEFAULT_VIEW_STRINGS` (`menu`, `rail`, `scheme`, `stacked`, `flat`, `index`, `dark`, `light`, `auto`) |

## Who applies a choice

Each setting has one owner:

- **The plugin (uncontrolled, the default).** A choice is applied at once: the rail switches
  (`setGroupDisplay` from `@gallerist/plugin-thumbnails`) and the root's `data-gallerist-scheme` is
  set (the attribute the renderer's `scheme` option writes). `onChange` reports it, so the app can
  remember it; pass it back as `initial` next time. The plugin also keeps the user's choices for a
  later mount of the same viewer.
- **The host (`controlled`).** The menu only calls `onChange` with the requested state, and the host
  applies it its own way, or doesn't: `setGroupDisplay(viewer, rail)` and
  `applyAppearance(root, { scheme })` in plain JS, the `groupDisplay` and `scheme` props in React.
  `initial` is ignored for a controlled setting. The menu shows what the host applied.

Mixing is fine: `controlled: ['scheme']` lets the plugin switch the rail while the host owns the
scheme.

```ts
// plain JS, uncontrolled, remembered per browser
const saved = JSON.parse(localStorage.getItem('viewer-view') ?? '{}')
const viewer = createViewer({
  groups,
  plugins: [
    thumbnails(),
    view({ initial: saved, onChange: (s) => localStorage.setItem('viewer-view', JSON.stringify(s)) }),
  ],
})
mount(viewer, { preset: 'reviewer', skin: 'console' })
```

In React, see [the React adapter](../react/README.md#a-view-menu): both ways work without a remount.

## Keyboard, pointer and screen readers

The [menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/): the tool is a
`button` with `aria-haspopup="menu"` and `aria-expanded`, and `aria-controls` while the menu is open.
The menu is `role="menu"` with a `role="group"` per section (named "Rail", "Scheme"; the visible
headings are those names, hidden from screen readers so they aren't read twice) of `menuitemradio`
items with `aria-checked`.

- **Enter**, **Space** or a click on the tool opens the menu on its first item; **↓** opens it on
  the first, **↑** on the last.
- In the menu, **↑ / ↓** move through every item (wrapping), **Home / End** go to the first / last,
  and a letter moves to the next item starting with it.
- **Enter**, **Space** or a click chooses an item and closes the menu; focus goes back to the tool.
- **Escape** closes the menu without closing the viewer; focus goes back to the tool. **Tab** closes
  it and moves on from the tool.
- A press anywhere outside the menu closes it, and leaves focus where it lands. The menu also closes
  when the viewer closes.
- The keys the menu handles stay in it: the viewer doesn't navigate, zoom or close underneath. There
  is no shortcut key for the menu itself.

On a touch screen it works with taps: tap the tool, tap a choice, tap outside to dismiss. Items are
44px tall there.

## Look

The tool is a bar button like the others, so it takes each skin's tool style (and the hover look
while its menu is open). The menu (`.gallerist-view-menu`) is a small panel in the skin's panel
colour with a hairline border, hung under its tool with its inline end on the tool's (start, right
to left) and kept 8px inside the viewer, so it fits a 390px phone and covers only the top edge of
the stage. The checked choice has a filled mark in the skin's selection colour. The styles ship in
`@gallerist/theme-default` (`base.css`); every skin and scheme gets them.

## Not in the CDN bundle

`@gallerist/cdn` (the one-`<script>` build) doesn't include this plugin: it would take that bundle
past its size budget. Install it from npm alongside the packages above.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
