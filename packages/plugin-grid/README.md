# @gallerist/plugin-grid

Gallerist plugin — in-viewer contact-sheet grid (grouped, windowed); click a cell to jump.

The grid draws the cells (or sections) around the current item and more as you scroll toward either
end (`overscan`: 40 cells, or 4 sections, on each side to start), so opening it costs the same at 10
items or 10k. Moving while it's open moves the selection without redrawing, and hiding it drops what
it drew.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-grid
```

## Usage

Tree-shakeable Gallerist plugin. Register it when you create the viewer:

```ts
import { createViewer } from '@gallerist/core'
// import the plugin's factory from this package and pass it to `plugins`
const viewer = createViewer({ items, plugins: [/* plugin() */] })
```

See [Plugin authoring](https://github.com/shafayet9780/gallerist/blob/main/docs/PLUGIN-AUTHORING.md).

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed

## Overview (`layout: 'sections'`)

```ts
grid({ layout: 'sections', startOpen: true, strings: { start: 'Start tour' } })
```

- **`layout: 'sections'`** draws one card per group: `group.caption`, `group.meta.subtitle`, the item
  count, a large first item and thumbnails of the next ones (9 items at most; the rest are counted on
  the last one). `collection.meta.title` heads the screen, beside the start button. The stage's arrows
  and caption hide while it shows, and moving anywhere (a cell, an index row, the keys) leaves it. Like
  the cells, it draws the sections near the current one and more as you scroll, so the whole
  collection stays reachable while only what you've scrolled to is in the document.
- **`startOpen`** shows the grid whenever the viewer opens on its first item. Opening at any other
  item (a tapped photo, a deep link) goes straight there. `viewer.open()` resumes at the last item, so
  call `viewer.open({ g: 0, i: 0 })` to come back to the overview.
- **`strings`** overrides every label for translation, the start button's included (`strings.start`,
  default `Start`). The defaults are exported as `DEFAULT_GRID_STRINGS`.
