# Gallerist — Phase 2 TODO (one engine, six looks)

> Plan: `plans/phase-2-product.md`. Each milestone merges on its own with every gate green.

## Done before Phase 2
- [x] Step 1: correctness and API meaning (`fix/correctness-pass`, incl. independent review fixes)
- [x] Six design directions, 24 frames each (links in the plan)

## Release 0.3
- [x] **M15** Chrome architecture: top bar region, reserved space, item indicator variants, hidden axes, mobile layer, `strings`, caption bar, SVG plugin icons. The verification gate is a geometry lint (`e2e/tests/layout.spec.ts`) instead of screenshot baselines, which differ between macOS and Linux CI. An independent review followed: 25 findings, 22 fixed, 3 accepted as intended (idle tool fade, rail collapse not animated, caption overlay specs not rendered yet)
- [x] **M16** Skin system: base/skin split, `skin`/`accent`/`scheme`, Gallery default, `console` extracted with zero visual diff. Verified as a zero computed-style diff (26 configurations × 3 viewports) against M15. Console keeps `color-scheme: normal` to stay identical; M18 can move it to `dark`. Review: 10 findings fixed (token overrides via cascade layers, load order, partial `applyAppearance`, hover/focus states, axe per skin)
- [x] **M17** Contained-rect zoom bounds + `plugin-pins` (`comment`, `tag`, `feature`), hotspot demo (`examples/hotspots`)
- [ ] **M18** Console: skin polish, `reviewer` preset upgrade, zoom navigator, comment pins in the monitoring example
- [ ] **M19** Editorial: wall skin + Night scheme, framed media, placard caption with item controls, `editorial` preset
- [ ] **M20** Tour: thumbnails `groupDisplay: 'index'`, grid `layout: 'sections'` + `startOpen`, `arrowLabels`, `tour` preset
- [ ] **M21** Parity: `"use client"`, DOM-markup init, UMD build, strings audit
- [ ] Release 0.3: positioning, docs site with skin × preset playground, migration notes, publish

## Release 0.4
- [ ] **M22** Atlas: renderer `peek`, `plugin-atlas` (skyline minimap, map mode), first-run hint
- [ ] **M23** Review plugins: triage, compare, then slideshow, rotate, share, info, timeline, filter, redaction
- [ ] Vue adapter; release 0.4

## Later
- [ ] **M24** Stories mode (go/no-go first)

---

# Gallerist — Phase 1 TODO

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
- [x] **T7.3 — @gallerist/plugin-fullscreen** (real-fullscreen e2e deferred to M13 — headless flaky)
  - Acceptance: Fullscreen API toggle; `toolbar` button + keymap `f`; emits `fullscreenChange`; reflects
    `document.fullscreenElement`; no-op + guarded where API absent.
  - Verify: happy-dom unit (button calls requestFullscreen/exit, state reflects) + e2e (toggle + event).
  - Files: `packages/plugin-fullscreen/*`.
- [x] **Checkpoint M7** — full gates green; commit. (194 unit, lint, typecheck, build green)

## M8 — @gallerist/react adapter

- [x] **T8.1 — useGallerist hook** — `useSyncExternalStore` over `viewer.subscribe`/`getState`; returns
  `{ state, ...actions }`. Verify: @testing-library/react state sync on nav/zoom. Files: `packages/react/src/useGallerist.ts`.
- [x] **T8.2 — `<Gallerist>` component** — controlled `open`/`onClose` + imperative `ref`; mounts renderer;
  SSR placeholder + hydrate; cleanup on unmount. Verify: open/close, ref methods, unmount teardown.
- [x] **T8.3 — portal bridge** — `<Gallerist.Overlay anchor>` + `<Gallerist.Region name>` portal React children
  into engine host nodes; re-portal on host change (overlay repaint). Verify: JSX overlay/region renders,
  updates, unmounts cleanly. Files: `packages/react/src/overlay.tsx`, `region.tsx`.
- [x] **T8.4 — React example** (`examples/react`) + e2e smoke.
- [x] **Checkpoint M8** — gates green (+ react peer dev deps installed); commit.

## M9 — deep-link + download

- [x] **T9.1 — @gallerist/plugin-hash** — read/write `#g=<id>&i=<id>`, `hashchange` + back/forward, open on
  load if hash present, client-only (SSR guard), uses `goToId`/`getCollection`. Verify: unit (parse/format)
  + e2e (URL updates on nav, deep-link opens correct slide, back/forward).
- [x] **T9.2 — @gallerist/plugin-download** — `toolbar` button(s): single (`<a download>`), all-in-group
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

- [x] **T12.1 — @gallerist/plugin-video** — HTML5 `<video>` MediaAdapter; `activate/deactivate` → play/pause;
  advance-on-ended → `next()`/`nextItem()`; poster via `placeholder`. Verify: happy-dom (mount, activate plays,
  deactivate pauses) + e2e (play/pause on enter/leave, advance on ended).
- [x] **T12.2 — @gallerist/plugin-video-youtube** — IFrame API adapter (async script, guarded); `match` by URL;
  activate/deactivate. Verify: unit (mock IFrame API); e2e behind opt-in flag.
- [x] **Checkpoint M12** — gates green; commit.

## M13 — hardening + ship

- [x] **T13.1 — a11y** — axe on thumbnails (listbox), grid, toolbar (≥44px); manual SR pass.
- [x] **T13.2 — perf** — traces for thumbnails/grid at 10k; per-package size-limit entries
  (core+thumbnails+image ≤24 KB gz, §20).
- [x] **T13.3 — examples + docs** — update examples (React + plugins demo); plugin-authoring guide;
  per-plugin README; CHANGELOG.
- [x] **T13.4 — release** — Changesets; tag `v0.1.0-phase1`.
- [x] **Checkpoint M13** — full CI green; all budgets met; examples smoke-tested.

---

# Gallerist — Phase 1 Review Fixes (`v0.1.1`)

From `/agent-skills:review` (0 Critical, 8 Important, ~13 Suggestions). Plan: `plans/phase-1-fixes.md`.
TDD per task (RED → GREEN → suite → build → commit). Security first (fail fast).

## F1 — Security
- [x] **T1 — download: URL scheme allowlist + filename/zip-name sanitization** (`plugin-download`)
- [x] **T2 — image placeholder: reject CSS `url()` breakout** (`renderer-dom/adapters/image`)
- [x] **Checkpoint F1** — test + lint + typecheck + size green.

## F2 — Correctness / contract
- [x] **T3 — youtube: `/shorts/`+`/live/` parse, anchored host match** (`plugin-video-youtube`)
- [x] **T4 — late `mediaAdapters` go live** (`renderer-dom/mount`)
- [x] **Checkpoint F2** — gates green; video/youtube e2e pass.

## F3 — Perf / a11y
- [x] **T5 — thumbnails: render-gating + in-place active + `role=group` + tighten 10k bound**
- [x] **T6 — grid: render-gating (mirror T5)**
- [x] **Checkpoint F3** — gates + e2e + size green.

## F4 — React lifecycle
- [x] **T7 — stable viewer (`useState`) + decoupled `destroy`** (`react/Gallerist`)
- [x] **T8 — deterministic overlay ids via `useId`** (`react/Gallerist`)
- [x] **Checkpoint F4** — gates green; StrictMode example smoke-tested.

## F5 — Robustness
- [x] **T9 — hash: `lastWritten` guard + malformed handling** (`plugin-hash`)
- [x] **T10 — youtube: load resilience + `advanceAxis` parity + typed global** (`plugin-video-youtube`)
- [x] **T11 — download: zip resilience (import fallback, `res.ok`, abort)** (`plugin-download`)
- [x] **T12 — core: `getPlugins()` returns a copy**
- [x] **T13 — supply chain: pin `client-zip` + CI `pnpm audit`**
- [x] **Checkpoint F5** — full gates + e2e green.

## Release
- [x] **T14 — CHANGELOG + PLUGIN-AUTHORING note + version bump + tag `v0.1.1`**

## Deferred → Phase 2
- [ ] region remount reconcile (`regions.ts`)
- [ ] React selector overload + inert SSR snapshot
- [ ] `@gallerist/renderer-dom` peer → dependency (decision)
- [ ] hash `replaceState` history mode (decision)

---

# Gallerist — M14 UX/UI Overhaul (`v0.2.0`)

From a hands-on run of the React example (behavioral bugs + generic look). Plan in
`~/.claude/plans/…snazzy-mountain.md` (M14 section). TDD per task (RED → GREEN → suite → build →
commit). Decisions driven by a UX interview (UX-A … UX-J).

## Phase A — foundations
- [x] **U1** core: optional `caption` on `Group` (Item already had it)
- [x] **U2** renderer `idle.ts`: idle timer → `data-gallerist-idle`; reduced-motion inert

## Phase B — renderer chrome
- [x] **U3** SVG icon set (`icons.ts`) replacing Unicode glyphs
- [x] **U4** configurable arrow placement → `data-gallerist-arrows` (default `pill-right`)
- [x] **U5** rail collapse (`t` + toggle + fullscreen) + idle auto-hide wired

## Phase C — thumbnails rewrite
- [x] **U6** reconcile-in-place — fixes #5 (active thumb drift); no teardown on cursor moves
- [x] **U7** vertical item column (`itemAxis`, default vertical)
- [x] **U8** live-preview active group card mirrors current item
- [x] **U9** count badge grouped-only + optional captions (render-if-present)
- [x] **U10** time-ribbon ticks from `group.meta` (opt-in)

## Phase D — presets + theme
- [x] **U11** `resolvePreset()` (filmstrip/immersive/reviewer/contact) + `mount({ preset })`
- [x] **U12** theme overhaul: graphite + signal-amber, cyan/vermilion variants, transitions, reduced-motion
- [x] **U13** segmented position pills (≤8) + mono `n / N` fallback

## Phase E — React + example + docs
- [x] **U14** React `<Gallerist preset theme arrows autoHide>` (theme reactive)
- [x] **U15** example rebuild (work-session reviewer + preset/accent switchers) + landing redesign
- [x] **U16** docs: CHANGELOG v0.2.0, thumbnails README, `docs/PRESETS.md`, ADR 0001, this checklist

## Phase F — hardening + ship
- [ ] **U17** axe + perf (zero rebuild on item nav, <200 nodes @10k) + size re-check + e2e; tag `v0.2.0`
