# Changelog

## v0.1.0-phase1 — Plugins + React adapter

### Added
- **Plugin architecture** (spec §13): `Plugin` / `PluginInstance` / `RegionName` / `RegionCtx`
  contract in `@visora/core`; named region hosts (toolbar/footer/thumbnails/stage/backdrop) in
  `@visora/renderer-dom`; `viewer.use()`, `getPlugins()`, `onPluginsChanged()`. See
  `docs/PLUGIN-AUTHORING.md`.
- **`@visora/react`** — `useVisora()` hook (`useSyncExternalStore`), `<Visora>` component
  (controlled `open`/`onClose` + imperative ref, SSR-safe), and the JSX portal bridge
  `<Visora.Overlay>` / `<Visora.Region>`.
- **Plugins** (each its own tree-shakeable package): `plugin-fullscreen`, `plugin-hash`
  (deep-link `#g=&i=`), `plugin-download` (single/group/zip), `plugin-thumbnails` (grouped,
  windowed), `plugin-grid` (in-viewer contact sheet), `plugin-video` (HTML5),
  `plugin-video-youtube`.

### Changed
- `viewer.use()` now returns a disposer; the renderer recomputes plugin overlays live and
  repaints on plugin changes (enables React overlays/regions to mount/unmount dynamically).
- `windowIndices` / `reconcileKeys` moved to `@visora/core` (pure logic plugins reuse).
- The renderer calls `MountedMedia.activate()` / `deactivate()` on slide enter/leave (play/pause).

### Size (gz)
- core 3.46 KB / 12 KB · core+renderer 7.79 KB / 16 KB · core+renderer+thumbnails 8.45 KB / 24 KB
  · react 0.82 KB.

## v0.0.0-phase0 — Engine MVP

### Added
- Headless `@visora/core` (data model, store, FSM, two-axis nav, zoom/gesture math, events,
  spring sampler), `@visora/renderer-dom` (windowing, image adapter, gestures, overlays, a11y),
  `@visora/theme-default`, and the vanilla API. See `docs/IMPLEMENTATION.md`.
