# @gallerist/renderer-dom

Default DOM renderer for Gallerist — the only ring that touches the DOM.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/renderer-dom
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({ items: [{ id: 'a', type: 'image', source: 'a.jpg' }] })
mount(viewer) // overlay/lightbox mode; pass { container } for inline
viewer.open()
```

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
