# @visora/renderer-dom

Default DOM renderer for Visora — the only ring that touches the DOM.

Part of [Visora](https://github.com/shafayet9780/visora#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @visora/renderer-dom
```

## Usage

```ts
import { createViewer } from '@visora/core'
import { mount } from '@visora/renderer-dom'
import '@visora/theme-default/visora.css'

const viewer = createViewer({ items: [{ id: 'a', type: 'image', source: 'a.jpg' }] })
mount(viewer) // overlay/lightbox mode; pass { container } for inline
viewer.open()
```

Full docs: the [monorepo README](https://github.com/shafayet9780/visora#readme) and [`docs/`](https://github.com/shafayet9780/visora/tree/main/docs).

## License

MIT © Shafayet Ahmmed
