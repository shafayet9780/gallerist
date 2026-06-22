# @visora/plugin-grid

Visora plugin — in-viewer contact-sheet grid (grouped, windowed); click a cell to jump.

Part of [Visora](https://github.com/shafayet9780/visora#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @visora/plugin-grid
```

## Usage

Tree-shakeable Visora plugin. Register it when you create the viewer:

```ts
import { createViewer } from '@visora/core'
// import the plugin's factory from this package and pass it to `plugins`
const viewer = createViewer({ items, plugins: [/* plugin() */] })
```

See [Plugin authoring](https://github.com/shafayet9780/visora/blob/main/docs/PLUGIN-AUTHORING.md).

Full docs: the [monorepo README](https://github.com/shafayet9780/visora#readme) and [`docs/`](https://github.com/shafayet9780/visora/tree/main/docs).

## License

MIT © Shafayet Ahmmed
