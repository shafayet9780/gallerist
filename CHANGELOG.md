# Changelog

## Unreleased

### Breaking
- **core**: renderer/plugin plumbing moved off the public `ViewerApi` to
  `@gallerist/core/internal`: `viewer.emit`, `getPlugins` and `onPluginsChanged` are now
  `getInternals(viewer).emit(…)` etc. The engine building blocks (normalize, store, FSM, nav,
  windowing, springs, arbitration, zoom math, emitter) moved there too, so the root entry is just
  the app-facing API (spec §8.4). Root bundle 3.5 → 2.7 KB gz.
- **core**: `normalize` (and so `createViewer` / `setCollection`) throws on a duplicate group id or
  item id.

### Fixed
- **core**: a throwing event handler no longer stops later handlers (it is reported via
  `reportError`); a destructured `preventDefault()` works; `zoomTo` ignores NaN/negative input.
- **renderer-dom**: cancelled media loads are no longer reported as `loadError`.
- **renderer-dom**: `pointercancel` abandons the gesture instead of acting as a release (no stray
  navigate/dismiss); the item-axis swipe needs the same commit distance as the group axis.

## v0.2.0 — first public release

> **Renamed before first publish:** the project was developed as *Visora* (`@visora/*`); the
> `@visora` npm scope belongs to an unrelated publisher, so every package ships as `@gallerist/*`.
> CSS tokens are `--gallerist-*`, attributes `data-gallerist-*`, and the React API is
> `<Gallerist>` / `useGallerist()`.

This is the first version published to npm. Alongside the UX overhaul below, a multi-axis
publish-readiness review drove a hardening pass (all critical + important findings fixed):

- **Correctness**: a `ResizeObserver` now re-anchors image-space overlays and re-clamps zoom on
  resize/rotate; gestures use pointer capture (off-stage releases no longer strand a gesture) and
  hand off cleanly from pinch to pan; the slide window preloads the wrap neighbour when `loop` is
  on; overlays repaint once the image decodes; lifecycle events fire only on real transitions;
  `keepZoomOnNav` is implemented.
- **Accessibility**: the overlay is a real modal — focus trap + `inert` background, an accessible
  dialog name, no shortcut-hijacking while typing, a visible broken-image state, and richer live
  announcements. Logical-property chrome + flipped arrows give basic RTL support.
- **Plugins**: hash tolerates malformed URLs / `=` in ids and uses `replaceState` (no Back-button
  trap); fullscreen scopes to its own viewer and supports the WebKit-prefixed API; download defers
  its blob revoke; the YouTube adapter declines unparseable URLs and sets `playerVars.origin`.
- **Performance**: wheel/trackpad zoom is RAF-coalesced and committed once per burst; the renderer
  skips the window diff on zoom/pan-only commits; React no longer leaks plugins across remounts and
  `useGallerist` returns stable action identities.
- **Release**: every package ships at `0.2.0` with a `VERSION` derived from `package.json`, a
  LICENSE, a README, lean sourcemaps (no embedded source), correct ESM/CJS types (attw-clean), and
  full npm metadata; CI gains an attw gate and a changesets release workflow.

See `plans/phase-1-review-report.md` for the full review and `docs/IMPLEMENTATION.md` §10 for the
consciously-deferred items.

### UX/UI overhaul ("pristine")

A hands-on pass over the React example drove a focused UX milestone. The default look moves from a
generic dark-glass lightbox to a distinctive **pro-review console** identity, the within-group axis
gets a real fix, and layout becomes configurable via smart **presets**. API additions are
non-breaking; the **default theme appearance changes** (pre-1.0, so semver-minor — old look is
reproducible via token overrides).

### Added
- **core**: optional `caption?: string` on `Group` (Item already had `caption`); shown on rail
  cards, render-only-if-present (no `alt` fallback).
- **renderer-dom**: real inline **SVG chrome icons** (replacing Unicode glyphs); configurable
  **arrow placement** (`arrows`: `pill-right` default · `corner-br` · `dpad` · `split`) via
  `data-gallerist-arrows`; **rail placement** (`rail`: `bottom` default · `top` · `hidden`) via
  `data-gallerist-rail-pos`; **rail collapse** (`t` key + a top-right toggle button +
  collapsed-by-default in fullscreen, `data-gallerist-rail`); **idle auto-hide** of chrome (`autoHide`,
  `data-gallerist-idle`, inert under `prefers-reduced-motion`); **layout presets** (`resolvePreset`,
  `preset` option) that resolve a **visibly distinct** layout — `filmstrip` (bottom rail),
  `reviewer` (bottom timeline + corner arrows), `immersive` (rail hidden + auto-hide), `contact`
  (top rail); **segmented position indicator** (pills ≤8 items, mono `n / N` fallback).
- **plugin-thumbnails**: `itemAxis` (`vertical` default — the ↑/↓ axis reads top-to-bottom);
  optional **`caption`** rendered as a single label band **beneath each thumbnail** (group + item),
  shown only when provided.
- **theme-default**: graphite + signal-amber identity, mono tabular numerals, **accent variants**
  via `data-gallerist-theme` (`amber` default · `cyan` · `vermilion`).
- **react**: `preset`, `theme` (reactive), `arrows`, `rail`, `autoHide` props; re-exports
  `resolvePreset` and the preset/arrow/rail types.

### Fixed
- **plugin-thumbnails (bug #5)**: the active thumbnail no longer drifts horizontally when paging
  within a group with ↑/↓. The rail **reconciles in place** (keyed nodes, `data-active` flip,
  `scrollIntoView`) instead of rebuilding on every cursor move; the active group's card
  **live-previews** the current item.

### Review hardening (pre-release)
- thumbnails: cover-thumb cache is windowed (no unbounded growth on long traversals); live-preview
  src pinned via a `dataset.live` flag.
- renderer-dom: chrome counter/pills update only on cursor/collection change (skip zoom/pan);
  idle controller created before mount-attach and armed on show in inline mode too; a manual rail
  toggle during fullscreen survives exit; idle re-arm coalesced to avoid `pointermove` timer churn.

### UX follow-up (pre-release)
- The **caption is the single under-thumbnail label** — rendered as a band beneath the image, not an
  overlay. Removed the separate time-ribbon `ticks` concept (a timestamp is just a caption the host
  supplies).
- **Presets are now visibly distinct** via rail placement (bottom / top / hidden), not just arrow
  nuance. Added the `rail` option (renderer + React).
- Moved the rail-collapse toggle to the **top-right beside Close** so it's no longer hidden behind
  the footer/caption area.
- Example: removed the full-width footer caption strip; the timestamp is folded into the
  per-thumbnail caption; the preset switcher shows what each preset changes.

## v0.1.1 — Phase 1 review hardening

From an end-to-end five-axis review of Phase 1 (0 critical, 8 important + suggestions). No API breaks.

### Security
- **plugin-download**: allowlist download URL schemes (`http`/`https`/`blob` only — reject
  `javascript:`/`data:`/`file:`) before assigning `a.href` or fetching; sanitize filenames (strip
  path separators, traversal, and control chars) for the `download` attribute and the **zip entry
  name** (closes zip-slip + filename/header injection).
- **renderer-dom**: reject CSS `url()` breakout in an image `placeholder` (a quote injected a second
  `url()` → attacker-controlled image request).
- **plugin-video-youtube**: anchor YouTube host matching to the hostname so look-alike domains
  (`evil-youtube.com`) no longer match.

### Fixed
- **plugin-video-youtube**: parse `/shorts/` and `/live/` URLs (previously claimed but unplayable);
  reject the API script when it fails to load or times out (no forever-pending memo); `advanceAxis`
  parity and an optional `nocookie` embed host; typed the IFrame API surface.
- **renderer-dom**: resolve `mediaAdapters` live — a plugin added via `viewer.use()` after mount now
  contributes its adapter, matching overlays/regions.
- **react**: create the viewer with lazy `useState` and stop destroying it in the adapter — fixes
  `<Gallerist.Overlay>`/`<Gallerist.Region>` vanishing and nav no-op under StrictMode; deterministic
  overlay ids via `useId` (no SSR hydration mismatch).
- **plugin-thumbnails / plugin-grid**: rebuild only on cursor/collection change (skip unrelated
  commits); thumbnails item row uses `role=group` (valid nested ARIA).
- **plugin-hash**: value-compare guard instead of a boolean latch (robust to coalesced/async
  `hashchange`); ignore malformed hashes.
- **plugin-download**: degrade to per-file downloads when `client-zip` is absent; skip non-ok
  fetches and thread an `AbortSignal` through the zip path.
- **core**: `getPlugins()` returns a copy of the registry.

### Chore
- Pin `client-zip` exact (2.5.0) and add a non-blocking `pnpm audit` step to CI.

## v0.1.0-phase1 — Plugins + React adapter

### Added
- **Plugin architecture** (spec §13): `Plugin` / `PluginInstance` / `RegionName` / `RegionCtx`
  contract in `@gallerist/core`; named region hosts (toolbar/footer/thumbnails/stage/backdrop) in
  `@gallerist/renderer-dom`; `viewer.use()`, `getPlugins()`, `onPluginsChanged()`. See
  `docs/PLUGIN-AUTHORING.md`.
- **`@gallerist/react`** — `useGallerist()` hook (`useSyncExternalStore`), `<Gallerist>` component
  (controlled `open`/`onClose` + imperative ref, SSR-safe), and the JSX portal bridge
  `<Gallerist.Overlay>` / `<Gallerist.Region>`.
- **Plugins** (each its own tree-shakeable package): `plugin-fullscreen`, `plugin-hash`
  (deep-link `#g=&i=`), `plugin-download` (single/group/zip), `plugin-thumbnails` (grouped,
  windowed), `plugin-grid` (in-viewer contact sheet), `plugin-video` (HTML5),
  `plugin-video-youtube`.

### Changed
- `viewer.use()` now returns a disposer; the renderer recomputes plugin overlays live and
  repaints on plugin changes (enables React overlays/regions to mount/unmount dynamically).
- `windowIndices` / `reconcileKeys` moved to `@gallerist/core` (pure logic plugins reuse).
- The renderer calls `MountedMedia.activate()` / `deactivate()` on slide enter/leave (play/pause).

### Size (gz)
- core 3.46 KB / 12 KB · core+renderer 7.79 KB / 16 KB · core+renderer+thumbnails 8.45 KB / 24 KB
  · react 0.82 KB.

## v0.0.0-phase0 — Engine MVP

### Added
- Headless `@gallerist/core` (data model, store, FSM, two-axis nav, zoom/gesture math, events,
  spring sampler), `@gallerist/renderer-dom` (windowing, image adapter, gestures, overlays, a11y),
  `@gallerist/theme-default`, and the vanilla API. See `docs/IMPLEMENTATION.md`.
