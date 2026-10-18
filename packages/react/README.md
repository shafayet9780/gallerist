# @gallerist/react

React adapter for Gallerist — <Gallerist> component, useGallerist() hook, JSX overlay/region portals.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/react
```

## Usage

```tsx
import { Gallerist } from '@gallerist/react'
import '@gallerist/theme-default/gallerist.css'

<Gallerist items={[{ id: 'a', type: 'image', source: 'a.jpg' }]} open={open} onClose={() => setOpen(false)} />
```

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
