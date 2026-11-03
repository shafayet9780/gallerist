# @gallerist/plugin-thumbnails

Windowed thumbnail rail for [Gallerist](https://github.com/shafayet9780/gallerist#readme). One card per group along the primary (←/→)
axis; the active multi-item group expands into its item thumbs along the secondary (↑/↓) axis.
Windowed + lazy: the rail draws what fits in it plus 3 cards on each side and follows its own scroll,
so a 10k-group gallery keeps about 20 cards in the document. One group's item stack draws all its
items; for a single huge group use `flat`, which is windowed by item.

Three display modes via `groupDisplay`: **`stacked`** (default — collapsed group cards, with a peek
flyout to preview a group without navigating in) and **`flat`** (every image side-by-side, each
group bracketed), and **`index`** (a section index with names and counts). All stay windowed + lazy.

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { thumbnails } from '@gallerist/plugin-thumbnails'

const viewer = createViewer({ collection, plugins: [thumbnails()] })
mount(viewer)
```

## Behaviour

- **Reconciles in place.** Cursor moves flip `data-active` and scroll the active node into view (inside the viewer's panels only, never the page) —
  the rail is never torn down on navigation (rebuilt only when the collection or visible window
  changes). This keeps node identity stable and the scroll position steady.
- **Live-preview card.** The active multi-item group's card mirrors the currently-viewed item's
  image; it reverts to the group cover once the group is no longer active.
- **Vertical item column (default).** The active group's items stack in a column floating above the
  rail, so ↑/↓ moves the highlight up/down — input direction matches visual direction.
- **Count badge** on grouped (multi-item) cards only; **captions** render as a single label band
  **beneath the thumbnail**, only when a string `caption` is provided on the group/item (no `alt`
  fallback — `alt` stays accessibility text). A timestamp is just a caption the host supplies.
- **Active item panel** (`stacked` mode). The active multi-item group auto-expands a panel of its
  item thumbs (`expandActive`, default on). With the default vertical item axis it is a stack in
  the viewer's `aside` column beside the stage (a renderer without that region gets it on the rail
  instead). Hide/show it with the toolbar items-toggle button or the **`e`** key; the state
  persists as you navigate. Phones drop the column and the toggle; the viewer's ↑ · position · ↓
  navigator moves between items there.
- **Peek flyout** (`stacked` mode). Hovering or keyboard-focusing a multi-item card opens a
  transient flyout of its item thumbs — preview a group **without** navigating into it; click a
  thumb to jump straight to it. Hover never moves the cursor. Touch screens have no hover, so a tap
  just navigates and the card shows no peek caret. Inert in `flat` mode
  (every item is already visible); for the active group it defers to the panel unless that panel is
  hidden, in which case hovering the active card peeks too.
- **Flat mode** (`groupDisplay: 'flat'`). Every item of every group renders side-by-side as its own
  card, each group's run wrapped in a bordered container (left accent rule + optional caption
  header) so it reads as one group. **Item-windowed**, so it stays bounded for huge galleries *and*
  for a single giant group; the bracket fades at the window edges (`data-partial-start` /
  `data-partial-end`). `itemAxis` is ignored here.

## Options

```ts
thumbnails({
  overscan: 8,             // optional: a fixed number of cards each side (default: measured)
  itemAxis: 'vertical',    // 'vertical' (default) | 'horizontal' — layout of the active group's items
  groupDisplay: 'stacked', // 'stacked' (default) | 'flat' | 'index'
  expandActive: true,      // auto-expand the active group's item panel (stacked); toggle with `e`
})
```

| Option         | Type                         | Default     | Notes |
|----------------|------------------------------|-------------|-------|
| `overscan`     | `number`                     | measured    | Cards drawn each side of the card in the middle of the rail; scrolling draws the ones it reaches. A jump past the drawn run first draws around the new current card, then the scroll that reveals it trims the run back to the middle. By default what fits plus 3 each side (8 each side before the rail has a layout); a number below half of what fits is raised to it. Group cards in `stacked`/`index`, item cards in `flat`. |
| `itemAxis`     | `'vertical' \| 'horizontal'` | `'vertical'`| `vertical` matches the ↑/↓ input direction; `horizontal` is the legacy inline row. Ignored in `flat`. |
| `groupDisplay` | `'stacked' \| 'flat' \| 'index'` | `'stacked'` | `stacked` collapses each group to one card (peek to preview); `flat` lays every item out side-by-side, bracketed per group. |
| `expandActive` | `boolean`                    | `true`      | `stacked` and `index`. Auto-show the active multi-item group's item panel; hide/show via the toolbar items-toggle or `e`. Ignored in `flat`. |
| `timeline`     | `boolean \| (group, index) => string` | off | `stacked` only. A label with a tick above each card, joined into a track, the current one in the accent. `true` reads `group.meta.time`. The label joins the card's accessible name. |
| `groupDisplay: 'index'` | | | A section index: a row per group with its cover, `group.caption`, `group.meta.subtitle` and item count; the active group's items expand under its row (always as a row, so `itemAxis` doesn't apply, and there's no peek). A bottom rail, or any rail at 900px wide or less, shows chips instead; chips don't expand items. Used by the `tour` preset. |
| `numberItems`  | `boolean`                    | `false`     | Number the item thumbs (1, 2, 3…) so they can be referred to, e.g. "monitor 2". |

Presets configure these for you: with `mount(viewer, { preset })` (or React's `preset` prop) every
option you leave unset takes the preset's value, so `thumbnails()` under `preset: 'reviewer'` gets the
timeline and numbered items; an option you pass wins, key by key (`undefined` counts as unset). The
options settle when the rail mounts. See [layout presets](https://github.com/shafayet9780/gallerist/blob/main/docs/PRESETS.md)
for each preset's values. The rail's **position** (bottom/top/hidden) is a renderer option (`rail`),
not a thumbnails option.

## Data

- `group.caption?: string` / `item.caption?: string` — optional label shown beneath the card/thumb.
- `group.thumb` / `item.thumb` — preferred thumbnail source (falls back to the item `source`).
