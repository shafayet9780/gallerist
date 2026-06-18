# @visora/plugin-thumbnails

Windowed thumbnail rail for [Visora](../../README.md). One card per group along the primary (←/→)
axis; the active multi-item group expands into its item thumbs along the secondary (↑/↓) axis.
Windowed + lazy, so 10k-item galleries stay bounded (≤ ~200 live nodes).

```ts
import { createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import { thumbnails } from '@visora/plugin-thumbnails'

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
- **Count badge** on grouped (multi-item) cards only; **captions** render only when a string
  `caption` is provided on the group/item (no `alt` fallback — `alt` stays accessibility text).

## Options

```ts
thumbnails({
  overscan: 24,         // group cards rendered each side of the active group (windowing bound)
  itemAxis: 'vertical', // 'vertical' (default) | 'horizontal' — layout of the active group's items
  ticks: false,         // render group `meta` as a time-ribbon label under each card (reviewer preset)
})
```

| Option     | Type                         | Default      | Notes |
|------------|------------------------------|--------------|-------|
| `overscan` | `number`                     | `24`         | Live group cards ≈ `2·overscan + 1`. |
| `itemAxis` | `'vertical' \| 'horizontal'` | `'vertical'` | `vertical` matches the ↑/↓ input direction; `horizontal` is the legacy inline row. |
| `ticks`    | `boolean`                    | `false`      | Time-ribbon: stacks each card's image over a monospace `group.meta` label. |

Presets configure these for you — see [layout presets](../../docs/PRESETS.md). `resolvePreset(name).thumbnails`
returns the `{ itemAxis, ticks }` a preset prefers.

## Data

- `group.caption?: string` / `item.caption?: string` — optional display caption on the card/thumb.
- `group.meta` — rendered as the time-ribbon tick label when `ticks` is on.
- `group.thumb` / `item.thumb` — preferred thumbnail source (falls back to the item `source`).
