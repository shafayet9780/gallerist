# @gallerist/plugin-download

Gallerist plugin — download the current item, a whole group, or a bulk zip.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-download
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
