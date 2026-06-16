# Visora — Phase 1 TODO

Executable checklist for `tasks/plan.md`. Dependency-ordered. TDD per task (RED → GREEN → commit).
Each milestone ends with a checkpoint: `pnpm test && pnpm e2e && pnpm lint && pnpm typecheck && pnpm size`.

## M7 — Plugin foundation + fullscreen (proves the contract)

- [x] **T7.1 — core plugin contract + registry**
  - Acceptance: `Plugin`, `PluginInstance`, `RegionName`, `RegionCtx`, `TransitionStrategy` types;
    `createViewer` runs `init`, wires `on`/`keymap`, collects `overlays`/`mediaAdapters`/`regions`;
    `ViewerOptions.plugins`; `viewer.use(plugin)`; `viewer` exposes registered plugins for the renderer;
    `destroy()` runs each plugin's `destroy`.
  - Verify: `pnpm test` — registry init/destroy, hook wiring, late `use()`, collection of extensions.
  - Files: `packages/core/src/plugins/*`, `packages/core/src/api.ts`, `controller/createViewer.ts`, `index.ts`.
- [x] **T7.2 — renderer region hosts + plugin consumption**
  - Acceptance: region host els (`toolbar|footer|stage|thumbnails|backdrop`) in the scaffold; at mount,
    plugin `regions[name](ctx)` → Node mounted into the host; plugin `mediaAdapters`/`overlays`/`keymap`
    merged; region conflict = last-wins + `console.warn`; regions update on cursor/collection change.
  - Verify: `pnpm test` (happy-dom) — region node mounts, conflict warn, merge; existing mount tests green.
  - Files: `packages/renderer-dom/src/regions.ts`, `mount.ts`.
- [x] **T7.3 — @visora/plugin-fullscreen** (real-fullscreen e2e deferred to M13 — headless flaky)
  - Acceptance: Fullscreen API toggle; `toolbar` button + keymap `f`; emits `fullscreenChange`; reflects
    `document.fullscreenElement`; no-op + guarded where API absent.
  - Verify: happy-dom unit (button calls requestFullscreen/exit, state reflects) + e2e (toggle + event).
  - Files: `packages/plugin-fullscreen/*`.
- [x] **Checkpoint M7** — full gates green; commit. (194 unit, lint, typecheck, build green)

## M8 — @visora/react adapter

- [x] **T8.1 — useVisora hook** — `useSyncExternalStore` over `viewer.subscribe`/`getState`; returns
  `{ state, ...actions }`. Verify: @testing-library/react state sync on nav/zoom. Files: `packages/react/src/useVisora.ts`.
- [x] **T8.2 — `<Visora>` component** — controlled `open`/`onClose` + imperative `ref`; mounts renderer;
  SSR placeholder + hydrate; cleanup on unmount. Verify: open/close, ref methods, unmount teardown.
- [x] **T8.3 — portal bridge** — `<Visora.Overlay anchor>` + `<Visora.Region name>` portal React children
  into engine host nodes; re-portal on host change (overlay repaint). Verify: JSX overlay/region renders,
  updates, unmounts cleanly. Files: `packages/react/src/overlay.tsx`, `region.tsx`.
- [x] **T8.4 — React example** (`examples/react`) + e2e smoke.
- [x] **Checkpoint M8** — gates green (+ react peer dev deps installed); commit.

## M9 — deep-link + download

- [x] **T9.1 — @visora/plugin-hash** — read/write `#g=<id>&i=<id>`, `hashchange` + back/forward, open on
  load if hash present, client-only (SSR guard), uses `goToId`/`getCollection`. Verify: unit (parse/format)
  + e2e (URL updates on nav, deep-link opens correct slide, back/forward).
- [x] **T9.2 — @visora/plugin-download** — `toolbar` button(s): single (`<a download>`), all-in-group
  (sequential), bulk-range → `await import('client-zip')` → zip. Verify: unit (group/range selection,
  filename) + e2e (single download triggers).
- [x] **Checkpoint M9** — gates green; commit.

## M10 — plugin-thumbnails (grouped) — the differentiator

- [x] **T10.1 — windowed rail** in `thumbnails` region (reuse `windowIndices`/`reconcileKeys`); click → `goTo`;
  active indicator tracks cursor; keymap. Verify: happy-dom (windowed count, active tracking) + e2e (click navigates).
- [x] **T10.2 — grouped stacked cards + expand** — multi-item groups show a stacked card; expand → lazy item
  thumbs via IntersectionObserver. a11y: listbox/option for the secondary axis. Verify: happy-dom (card vs flat,
  expand) + e2e.
- [x] **T10.3 — perf** — 10k items → <200 live thumb nodes (§20). Verify: perf test/trace.
- [x] **Checkpoint M10** — gates + thumbnails size budget; commit.

## M11 — plugin-grid (in-viewer mode)

- [x] **T11.1 — grid region** over the stage: windowed contact sheet, grouped interval headers, lazy thumbs,
  toggle on/off, click cell → `goTo` + hide. Verify: happy-dom (cells + headers windowed) + e2e (toggle,
  click → stage at item) + perf (bounded nodes).
- [x] **Checkpoint M11** — gates green; commit.

## M12 — video (HTML5) + youtube

- [ ] **T12.1 — @visora/plugin-video** — HTML5 `<video>` MediaAdapter; `activate/deactivate` → play/pause;
  advance-on-ended → `next()`/`nextItem()`; poster via `placeholder`. Verify: happy-dom (mount, activate plays,
  deactivate pauses) + e2e (play/pause on enter/leave, advance on ended).
- [ ] **T12.2 — @visora/plugin-video-youtube** — IFrame API adapter (async script, guarded); `match` by URL;
  activate/deactivate. Verify: unit (mock IFrame API); e2e behind opt-in flag.
- [ ] **Checkpoint M12** — gates green; commit.

## M13 — hardening + ship

- [ ] **T13.1 — a11y** — axe on thumbnails (listbox), grid, toolbar (≥44px); manual SR pass.
- [ ] **T13.2 — perf** — traces for thumbnails/grid at 10k; per-package size-limit entries
  (core+thumbnails+image ≤24 KB gz, §20).
- [ ] **T13.3 — examples + docs** — update examples (React + plugins demo); plugin-authoring guide;
  per-plugin README; CHANGELOG.
- [ ] **T13.4 — release** — Changesets; tag `v0.1.0-phase1`.
- [ ] **Checkpoint M13** — full CI green; all budgets met; examples smoke-tested.
