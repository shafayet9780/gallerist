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

One tool joins the toolbar (a sliders icon, named "View"). It opens a small popover under itself
with a segmented control per setting, each segment an icon and a name, the current one raised:

- **Layout** (the rail): *Stacked* (one card per group) or *Row* (every item side by side, `groupDisplay: 'flat'`).
  Shown only while a thumbnails rail is mounted. The switch keeps the current item, and the viewer's
  keys follow the rail: a row walks every item in order with ←/→ (linear traversal, unless `mount()`
  was given `linear`), a stacked rail moves between groups with ←/→ and within one with ↑/↓.
- **Theme** (the scheme): *Dark* or *Light*, the viewer's `data-gallerist-scheme`, in whatever skin is loaded.
- With [`@gallerist/plugin-shortcuts`](../plugin-shortcuts/README.md) registered, a last row,
  **Keyboard shortcuts `?`**, opens the shortcut list (on a touch screen it reads **Gestures** and
  opens the gestures).

A choice applies at once and the popover stays open, so both settings can be changed in one visit.
It shows what the viewer shows when it opens (the rail's display, the scheme in effect) and whenever
either changes while it is open, so it always agrees with the viewer, however the setting was last
changed (a host applying a controlled choice a render later included). With nothing to offer
(`scheme: false` and no thumbnails rail mounted; one registered on a viewer no renderer has built
counts as none) the tool is hidden; it shows when a rail is added.

## Options

| Option | Default | |
|---|---|---|
| `rail` | `['stacked', 'flat']` | the rail layouts offered, in order (`'index'` is a third); `false` leaves the section out |
| `scheme` | `['dark', 'light']` | the schemes offered, in order (`'auto'` follows the system); `false` leaves the section out |
| `initial` | — | `{ rail?, scheme? }` the plugin applies when the viewer mounts, e.g. restored from storage; over the rail's and the renderer's own values. An unknown value is ignored, and so is one for a setting the host controls |
| `controlled` | `false` | settings the host applies itself: `true` for both, or `['scheme']`, `['rail']` (or mark them on the viewer, below) |
| `onChange(change)` | — | called on every choice that changes the stored value, with that one setting: `{ rail: 'flat' }` or `{ scheme: 'light' }` (`ViewChange`) |
| `strings` | English | every label, for translation; defaults in `DEFAULT_VIEW_STRINGS` (`menu`: "View", `rail`: "Layout", `scheme`: "Theme", `stacked`, `flat`: "Row", `index`, `dark`, `light`, `auto`). The shortcut row's text is plugin-shortcuts' own (its `title`, or `gestures`) |

## What `onChange` reports

The value picked, for the one setting it changes, compared with the value **stored**, not the one
shown: the rail's display, and the viewer's `data-gallerist-scheme` (unset, the skin's default). So:

- a viewer following the system (`scheme: 'auto'`, or no scheme set) shows the scheme in effect as
  checked, but a rail choice reports `{ rail: 'flat' }` alone, and the viewer keeps following the
  system;
- picking *Dark* there stores and reports `{ scheme: 'dark' }`, even though Dark was already shown;
- picking the stored value again reports nothing.

Merge each change into what you keep: `{ ...saved, ...change }`. What you keep then holds only what
the user picked.

## Who applies a choice

Each setting has one owner:

- **The plugin (uncontrolled, the default).** A choice is applied at once: the rail switches
  (`setGroupDisplay` from `@gallerist/plugin-thumbnails`) and the root's `data-gallerist-scheme` is
  set (the attribute the renderer's `scheme` option writes). `onChange` reports it, so the app can
  remember it; pass it back as `initial` next time. The plugin keeps the user's choices per viewer
  (one `view()` can serve several viewers; each starts from `initial`), for a later mount of the
  viewer and when the plugin is registered on it again.
- **The host.** The menu only calls `onChange`, and the host applies the choice its own way, or
  doesn't: `setGroupDisplay(viewer, rail)` and `applyAppearance(root, { scheme })` in plain JS, the
  `groupDisplay` and `scheme` props in React. The plugin never writes a setting the host owns:
  `initial` and past choices are ignored for it. The menu shows what the host applied. A host takes a
  setting with `controlled`, or by marking it on the viewer, which suits an adapter that owns a
  setting only while a prop is passed:

  ```ts
  Object.assign(viewer, { [Symbol.for('gallerist.controlled')]: ['scheme'] }) // or ['rail', 'scheme'], true
  ```

  The React adapter sets this mark while its `scheme` or `groupDisplay` prop is passed (and clears
  it when the prop is left out), so a prop and the menu never pull opposite ways. It owns the mark:
  under `<Gallerist>` one set by hand is written over on the next commit; use `controlled` there.

Mixing is fine: `controlled: ['scheme']` lets the plugin switch the rail while the host owns the
scheme.

```ts
// plain JS, uncontrolled, remembered per browser: only what the user picked is saved
import { type ViewState, view } from '@gallerist/plugin-view'

const KEY = 'viewer-view'
const saved: ViewState = JSON.parse(localStorage.getItem(KEY) ?? '{}')
const viewer = createViewer({
  groups,
  plugins: [
    thumbnails(),
    view({
      initial: saved, // unknown values are ignored
      onChange: (change) => localStorage.setItem(KEY, JSON.stringify(Object.assign(saved, change))),
    }),
  ],
})
mount(viewer, { preset: 'reviewer', skin: 'console', scheme: 'auto' })
```

In React, see [the React adapter](../react/README.md#a-view-menu): the props restore the saved
choices, and neither way remounts. `view({ initial })` is read once per viewer, like every plugin
option (`<Gallerist>` registers its `plugins` once): build the plugins once, e.g.
`useState(() => [thumbnails(), view({ initial: saved, onChange })])`; an `initial` passed on a later
render is ignored.

## Keyboard, pointer and screen readers

The tool is a `button` with `aria-haspopup="dialog"` and `aria-expanded` (`aria-controls` while
open). The popover is a non-modal `role="dialog"` named "View": the viewer stays usable around it.
Each setting is a [radio group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) named by its
visible label ("Layout", "Theme"), its segments `button`s with `role="radio"` and `aria-checked`,
one tab stop per group (the checked segment, roving `tabindex`).

- **Enter**, **Space** or a click on the tool opens the popover with focus on the first group's
  checked segment; **↓** opens it there too, **↑** on the last stop (the shortcut row, if shown).
- **← / →** (and **↑ / ↓**) move through a group's segments, wrapping, and choose the one they reach,
  as radio buttons do; right to left, ← moves to the next segment. **Space** or a click chooses the
  segment. The popover stays open.
- **Enter** chooses the focused segment and closes the popover; focus goes back to the tool.
- **Tab** / **Shift+Tab** move between the groups and the shortcut row. Tab past the last stop closes
  the popover and moves on from the tool; Shift+Tab before the first closes it, on the tool.
- **Escape** closes it without closing the viewer; focus goes back to the tool. **?** opens the
  shortcut list (with plugin-shortcuts), as the row does.
- A press anywhere outside closes it, and leaves focus where it lands (the press's path is checked,
  so a viewer inside a shadow root works). It also closes when the viewer closes.
- Every key but Tab stays in the popover: the viewer doesn't navigate, zoom or close underneath.
  There is no shortcut key for the popover itself.

On a touch screen it works with taps: tap the tool, tap a segment, tap outside to dismiss. Segments
are 36px tall there, and the shortcut row has no key cap.

While the popover is open the plugin listens on the document (`pointerdown` and `scroll`, both in
the capture phase) and on the window (`resize`), to close it on a press outside and to keep it under
its tool, and watches the viewer's root for the rail's display and the scheme. Closing the popover,
closing the viewer or disposing the plugin removes them. If the renderer is destroyed under an open
popover (`handle.destroy()` with the viewer still open), the popover goes with the viewer's root, and
the listeners go at the next press, scroll or resize.

## Look

The tool is a bar button like the others, so it takes each skin's tool style (and the hover look
while its popover is open). The popover (`.gallerist-view-menu`) is a small panel in
`--gallerist-popover-bg` with a hairline border and `--gallerist-popover-shadow`, hung under its tool
with its inline end on the tool's (start, right to left) and kept 8px inside the viewer, about 300px
wide, so it fits a 390px phone and covers only the top edge of the stage; it follows the tool when
the toolbar's strip scrolls. Each segmented control is a recessed track (`--gallerist-seg-track`)
with the checked segment raised on it (`--gallerist-seg-on`, `--gallerist-seg-on-shadow`), its text
at full strength and its glyph in the skin's selection colour. The segment focused from the keyboard
takes the skin's focus ring, never the selection colour, so focus and the checked value never look
alike. Every skin and scheme gets the styles (`@gallerist/theme-default`, `base.css`); Console sets
its own popover and segment colours, the others derive them from their panel, ground and surface.

## Not in the CDN bundle

`@gallerist/cdn` (the one-`<script>` build) doesn't include this plugin: it would take that bundle
past its size budget. Install it from npm alongside the packages above.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
