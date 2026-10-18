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

Props that update live: `items` / `groups` / `collection` (a new reference is applied in place and
keeps the cursor on the same item, so memoize data you build inline), `on`, `open`, `onClose` and
`theme`. Everything else (`loop`, `startAt`, `plugins`, `overlays`, `preset`, `container`, …) is
read once; change the component's `key` to apply new values.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
