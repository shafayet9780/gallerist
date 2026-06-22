# @visora/core

Headless, framework-agnostic media viewer engine — nested galleries, image-space overlays, virtualization.

Part of [Visora](https://github.com/shafayet9780/visora#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @visora/core
```

## Usage

```ts
import { createViewer } from '@visora/core'

const viewer = createViewer({ items: [{ id: 'a', type: 'image', source: 'a.jpg' }] })
viewer.open()
```

Full docs: the [monorepo README](https://github.com/shafayet9780/visora#readme) and [`docs/`](https://github.com/shafayet9780/visora/tree/main/docs).

## License

MIT © Shafayet Ahmmed
