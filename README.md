# Gallerist

A media viewer for galleries that have galleries in them: product colours with their angles, review
moments with their screens, listings with their rooms. Each group is a place you move between (←/→),
each item a place inside it (↑/↓), and you can pin content to a point on the image.

MIT licensed. The core has no runtime dependencies and doesn't touch the DOM. **Pre-1.0:** the API can
still change between minor versions.

## Is it the right tool?

**A good fit if** your media is really two-level, or people review it: comments pinned to a screenshot, a
timeline of captures, rooms in a listing. Rendering is windowed, so the DOM stays bounded with thousands
of groups (a single group draws all its item thumbs unless you use the `flat` rail), and it ships keyboard, touch, RTL and screen-reader support.

**Look elsewhere if** you have one flat strip of photos and already have a lightbox you like, if you need
Vue or Svelte today (React and plain DOM only; Vue is planned for 0.4), or if you want a stories player.
Bundle size is also a real cost: core + renderer is about 16 KB gzipped, more than the smallest flat
lightboxes.

## Quick start

```bash
npm i @gallerist/core @gallerist/renderer-dom @gallerist/theme-default
```

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({
  collection: {
    groups: [
      { id: 'moment-1', items: [screenA, screenB, screenC] }, // ↑/↓ between screens
      { id: 'moment-2', items: [screenD] },                   // ←/→ between moments
    ],
  },
  itemMemory: 'preserve', // stay on the same screen across moments
})
mount(viewer)
viewer.open()
```

No bundler? One script tag and `data-gallerist` links: see [`@gallerist/cdn`](packages/cdn/README.md).
Using React: [`@gallerist/react`](packages/react/README.md). More in
[Getting started](docs/GETTING-STARTED.md).

## One engine, several looks

Three layers that combine freely: a **skin** sets colour, type and motion, a **preset** sets the layout,
and **plugins** add behaviour.

| Pairing | For |
|---|---|
| `gallery` + `filmstrip` | The default: a quiet lightbox for photos and products |
| `console` + `reviewer` | Reviewing captures: timeline rail, numbered items, zoom navigator, comment pins |
| `editorial` + `editorial` | Art and portfolios: framed work on a wall, with a placard |
| `gallery` (light) + `tour` | Listings: a section index, labelled arrows, an overview to start from |

Try every combination on the docs site's playground (`pnpm --filter @gallerist/site dev`), or run
`pnpm --filter @gallerist/example-tour dev` (also `monitoring`, `hotspots`, `react`, `vanilla`).

## Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages (tsup → ESM + CJS + .d.ts) |
| `pnpm test` | Unit tests (vitest: node + happy-dom) |
| `pnpm e2e` | Browser tests (Playwright: gestures, a11y/axe, overlays) |
| `pnpm typecheck` | TypeScript strict typecheck, all packages |
| `pnpm lint` / `pnpm format` | Biome check / write |
| `pnpm size` | size-limit budget gate (core ≤ 12 KB, core+renderer ≤ 16.65 KB gz) |
| `pnpm check:dist` | Checks on built output: the `"use client"` banner, the global build |

## Packages

| Package | What it does |
|---|---|
| `@gallerist/core` | Headless engine: data model, signal store, FSM, two-axis nav, zoom/gesture math, events, spring sampler, `createViewer`. **No DOM, zero deps.** |
| `@gallerist/renderer-dom` | Default DOM renderer: windowed slides, image adapter, live gestures, image-space overlays, dialog a11y, chrome. The only ring that writes DOM. |
| `@gallerist/theme-default` | Pure CSS driven by `--gallerist-*` tokens: a shared base plus skins (`gallery` default, `console`, `editorial`), each with accents and dark/light/auto schemes; distinct axis motion; reduced-motion safe. |
| `@gallerist/react` | React adapter: `useGallerist()` hook, `<Gallerist>` component, `<Gallerist.Overlay>`/`<Gallerist.Region>` JSX portals. |
| `@gallerist/plugin-*` | Tree-shakeable plugins: `fullscreen`, `hash`, `save` (the download button), `thumbnails` (grouped), `grid`, `pins` (comments, product tags, feature notes anchored to the image), `captions` (designed captions, one render function per viewer), `video`, `video-youtube`, `view` (a View menu: the rail's layout and the scheme, switched in the open viewer), `zoom` (a − 100% + zoom tool with the + / - / 0 keys), `shortcuts` (the keys on `?`, the gestures on a touch screen, in a modal dialog). |

## Architecture

The **headless core** owns state and logic and touches no DOM. The **renderer** is the only ring
that writes to the DOM, and it is replaceable — that's what lets anyone build a fully custom UI on
the same engine. Design rationale, the coordinate model, the data flow, and known gotchas are in
[`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md). The full spec (with the 14 locked decisions) is
in [`docs/GALLERIST_SPEC.md`](docs/GALLERIST_SPEC.md).

```
theme-default (CSS) ─┐
renderer-dom ────────┼─► core   (zero runtime deps, DOM-free)
react ───────────────┘
```

## License

MIT, with a DCO for contributions (no CLA). Clean-room: no GPL lightbox source consulted.
