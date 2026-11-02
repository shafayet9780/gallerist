# @gallerist/plugin-grid

Gallerist plugin — in-viewer contact-sheet grid (grouped, windowed); click a cell to jump.

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
grid({ layout: 'sections', startOpen: true, startLabel: 'Start tour' })
```

- **`layout: 'sections'`** draws one card per group: `group.caption`, `group.meta.subtitle`, the item
  count, a large first item and thumbnails of the next ones (9 items at most; the rest are counted on
  the last one). `collection.meta.title` heads the screen, beside the start button. The stage's arrows
  and caption hide while it shows.
- **`startOpen`** shows the grid when the viewer opens on its first item, every time it opens. Opening
  at any other item (a tapped photo, a deep link) goes straight there.
- **`startLabel`** is the start button's text (default `Start`).
