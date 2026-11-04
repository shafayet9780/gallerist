# Gallerist

A **headless, framework-agnostic media viewer** for grouped / nested galleries, with image-space
overlays and virtualized rendering at scale. MIT licensed; zero runtime dependencies in the core.

Every other lightbox models a gallery as a flat 1-D strip. The real web is galleries-of-galleries
— product variants × angles, posts × images, moments × monitors, documents × pages. Gallerist makes
**nesting a first-class primitive**, lets you anchor interactive content to points *on the image*,
and holds 60fps across thousands of items.

> **Status:** Phase 1 in progress — engine MVP (Phase 0) + plugin architecture + React adapter +
> the first plugins (fullscreen, hash, download, thumbnails, grid, video). See
> `docs/IMPLEMENTATION.md` (as-built engine), `docs/PLUGIN-AUTHORING.md` (writing plugins), and
> `tasks/plan.md` / `tasks/todo.md` (Phase 1 tracker). `CHANGELOG.md` lists what shipped.

## Quick start

```bash
pnpm install
pnpm --filter @gallerist/example-monitoring dev   # grouped reviewer demo (nested, overlays)
pnpm --filter @gallerist/example-vanilla dev      # flat gallery demo
```

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

// flat gallery — items[] is normalized to singleton groups internally
const viewer = createViewer({ items: [{ id: 'a', type: 'image', source: 'a.jpg' }] })
mount(viewer)            // overlay/lightbox mode; pass { container } for inline
viewer.open()
```

Grouped (two-axis) — the reason Gallerist exists:

```ts
const viewer = createViewer({
  collection: {
    groups: [
      { id: 'moment-1', items: [screenA, screenB, screenC] }, // ← swipe ↑/↓ between screens
      { id: 'moment-2', items: [screenD] },                   // ← swipe ←/→ between moments
    ],
  },
  itemMemory: 'preserve', // stay on the same screen index across moments
})
mount(viewer)
```

## Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages (tsup → ESM + CJS + .d.ts) |
| `pnpm test` | Unit tests (vitest: node + happy-dom) |
| `pnpm e2e` | Browser tests (Playwright: gestures, a11y/axe, overlays) |
| `pnpm typecheck` | TypeScript strict typecheck, all packages |
| `pnpm lint` / `pnpm format` | Biome check / write |
| `pnpm size` | size-limit budget gate (core ≤ 12 KB, core+renderer ≤ 16 KB gz) |

## Packages

| Package | What it does |
|---|---|
| `@gallerist/core` | Headless engine: data model, signal store, FSM, two-axis nav, zoom/gesture math, events, spring sampler, `createViewer`. **No DOM, zero deps.** |
| `@gallerist/renderer-dom` | Default DOM renderer: windowed slides, image adapter, live gestures, image-space overlays, dialog a11y, chrome. The only ring that writes DOM. |
| `@gallerist/theme-default` | Pure CSS driven by `--gallerist-*` tokens: a shared base plus skins (`gallery` default, `console`), each with accents and dark/light/auto schemes; distinct axis motion; reduced-motion safe. |
| `@gallerist/react` | React adapter: `useGallerist()` hook, `<Gallerist>` component, `<Gallerist.Overlay>`/`<Gallerist.Region>` JSX portals. |
| `@gallerist/plugin-*` | Tree-shakeable plugins: `fullscreen`, `hash`, `download`, `thumbnails` (grouped), `grid`, `pins` (comments, product tags, feature notes anchored to the image), `video`, `video-youtube`. |

## Architecture

The **headless core** owns state and logic and touches no DOM. The **renderer** is the only ring
that writes to the DOM, and it is replaceable — that's what lets anyone build a fully custom UI on
the same engine. Design rationale, the coordinate model, the data flow, and known gotchas are in
[`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md). The full spec (with the 14 locked decisions) is
in [`docs/GALLERIST_SPEC.md`](docs/GALLERIST_SPEC.md).

```
theme-default (CSS) ─┐
renderer-dom ────────┼─► core   (zero runtime deps, DOM-free)
react/vue/svelte (P1)┘
```

## License

MIT, with a DCO for contributions (no CLA). Clean-room: no GPL lightbox source consulted.
