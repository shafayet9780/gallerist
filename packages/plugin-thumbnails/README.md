# @gallerist/plugin-thumbnails

Windowed thumbnail rail for [Gallerist](https://github.com/shafayet9780/gallerist#readme). One card per group along the primary (←/→)
axis; the active multi-item group expands into its item thumbs along the secondary (↑/↓) axis.
Windowed + lazy, so 10k-item galleries stay bounded (≤ ~200 live nodes).

Two display modes via `groupDisplay`: **`stacked`** (default — collapsed group cards, with a peek
flyout to preview a group without navigating in) and **`flat`** (every image side-by-side, each
group bracketed). Both stay windowed + lazy.

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { thumbnails } from '@gallerist/plugin-thumbnails'

const viewer = createViewer({ collection, plugins: [thumbnails()] })
mount(viewer)
```

## Behaviour

- **Reconciles in place.** Cursor moves flip `data-active` and `scrollIntoView` the active node —
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
  item thumbs (`expandActive`, default on). It mounts on the rail's region host, so it's visible +
  clickable in every rail position and opens in the right direction (up for a bottom rail, down for
  a top rail). Hide/show it with the toolbar items-toggle button or the **`e`** key; the state
  persists as you navigate.
- **Peek flyout** (`stacked` mode). Hovering or keyboard-focusing a multi-item card opens a
  transient flyout of its item thumbs — preview a group **without** navigating into it; click a
  thumb to jump straight to it. Hover never moves the cursor. On touch devices (no hover) the card
  shows an explicit expand affordance, while a first tap still navigates. Inert in `flat` mode
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
  overscan: 24,            // cards rendered each side of the cursor (windowing bound)
  itemAxis: 'vertical',    // 'vertical' (default) | 'horizontal' — layout of the active group's items
  groupDisplay: 'stacked', // 'stacked' (default) | 'flat'
  expandActive: true,      // auto-expand the active group's item panel (stacked); toggle with `e`
})
```

| Option         | Type                         | Default     | Notes |
|----------------|------------------------------|-------------|-------|
| `overscan`     | `number`                     | `24`        | Live cards ≈ `2·overscan + 1` (group cards in `stacked`, item cards in `flat`). |
| `itemAxis`     | `'vertical' \| 'horizontal'` | `'vertical'`| `vertical` matches the ↑/↓ input direction; `horizontal` is the legacy inline row. Ignored in `flat`. |
| `groupDisplay` | `'stacked' \| 'flat'`        | `'stacked'` | `stacked` collapses each group to one card (peek to preview); `flat` lays every item out side-by-side, bracketed per group. |
| `expandActive` | `boolean`                    | `true`      | `stacked` only. Auto-show the active multi-item group's item panel; hide/show via the toolbar items-toggle or `e`. Ignored in `flat`. |

Presets configure these for you — see [layout presets](https://github.com/shafayet9780/gallerist/blob/main/docs/PRESETS.md). The rail's **position**
(bottom/top/hidden) is a renderer option (`rail`), not a thumbnails option.

## Data

- `group.caption?: string` / `item.caption?: string` — optional label shown beneath the card/thumb.
- `group.thumb` / `item.thumb` — preferred thumbnail source (falls back to the item `source`).
