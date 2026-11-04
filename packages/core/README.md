# @gallerist/core

Headless, framework-agnostic media viewer engine — nested galleries, image-space overlays, virtualization.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/core
```

## Usage

```ts
import { createViewer } from '@gallerist/core'

const viewer = createViewer({ items: [{ id: 'a', type: 'image', source: 'a.jpg' }] })
viewer.open()
```

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
