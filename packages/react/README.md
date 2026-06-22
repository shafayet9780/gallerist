# @visora/react

React adapter for Visora — <Visora> component, useVisora() hook, JSX overlay/region portals.

Part of [Visora](https://github.com/shafayet9780/visora#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @visora/react
```

## Usage

```tsx
import { Visora } from '@visora/react'
import '@visora/theme-default/visora.css'

<Visora items={[{ id: 'a', type: 'image', source: 'a.jpg' }]} open={open} onClose={() => setOpen(false)} />
```

Full docs: the [monorepo README](https://github.com/shafayet9780/visora#readme) and [`docs/`](https://github.com/shafayet9780/visora/tree/main/docs).

## License

MIT © Shafayet Ahmmed
