# Visora — Phase 0 Implementation Plan

Source of truth: `docs/VISORA_SPEC.md` (v1.1). This plan covers **Phase 0** only:
engine MVP + `renderer-dom` + `theme-default` + core image adapter + vanilla API.
Out of scope: plugins, framework adapters, video, DZI (v2 seam only).

## Locked decisions (this session)

| # | Decision | Choice |
|---|---|---|
| A | Scope | Full Phase 0 |
| B | Bundler | tsup |
| C | Tests | vitest (node + happy-dom) + Playwright |
| D | Repo | in-place monorepo, spec → `docs/` |
| E | Zoom state | imperative during gesture; store commits on end; `ViewerState.zoom` = last committed |
| F | Region contract | abstract in core; renderer-dom implements |
| G | Overlay render | `(ctx) => HTMLElement\|string\|Node`, signature frozen |
| H | Motion | spring→keyframe sampler in core; tokens + bezier fallbacks in theme-default |
| I | Token prefix | `--visora-*` (classes `.visora-*`) |
| J | Placeholder | caller LQIP (`Item.placeholder`); BlurHash decoder = opt-in util, out of core |
| K | Phase 0 chrome | minimal: backdrop, close, group arrows, item affordance, counter, aria-live, zoom-reset |
| L | Lint/format | Biome |

## Architecture invariants

1. Core touches no DOM (SSR-safe; `typeof window` guards).
2. One internal representation: everything → `Collection → Group[] → Item[]` (flat = singleton groups).
3. Imperative transform during gesture; store never written per-frame.
4. Single shared transform matrix for media + content-overlay layer.
5. Region contract abstract in core; renderer-dom replaceable.
6. Stable `id` on every group/item (keying, deep-links, overlay persistence, diff).
7. `core + renderer-dom ≤ 16 KB gz` — size-limit gates CI.

## Milestones (ordered; each verifiable)

- [x] **M0 — Scaffold & CI.** pnpm workspace, tsconfig strict, Biome, tsup, vitest (node+happy-dom),
  Playwright, size-limit, Changesets, CI workflow, 3 package skeletons.
  *Verify:* `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm size` run green.

- [x] **M1 — Core spine (no DOM).** types; `normalize`; `setCollection` diff; ~40-line signal store;
  FSM reducer (phase + interaction, re-open cancel, nav coalescing); two-axis nav math
  (loop, itemMemory reset/preserve/clamp, goTo/goToId); typed event emitter (cancelable
  beforeSlide/beforeItem); vanilla `createViewer` wiring.
  *Verify:* vitest node green — normalize, FSM table, nav matrix, coalescing, store selectors.

- [x] **M2 — Zoom/pan + arbitration math (pure).** coordinate spaces screen→stage→content;
  focal zoom, fit/bounds clamp, rubber-band, inertia, double-tap step; bounds from naturalSize;
  arbitration reducer (§11.3 → navigate|pan|close|zoom|secondary), intent locked per gesture.
  *Verify:* vitest node — zoom round-trips + arbitration rules matrix.

- [x] **M3 — renderer-dom.** structural DOM; overlay-portal / inline modes; scroll-lock;
  slide windowing + node pool; load scheduling (AbortController, decode-before-reveal, srcset,
  fetchpriority); image adapter + LQIP placeholder cross-fade; ResizeObserver; Pointer Events →
  arbitration → pan/zoom/nav/close (imperative transform via RAF, commit on end); region mounts;
  minimal chrome; a11y baseline (dialog, focus trap+restore, aria-live, keymap, ≥44px).
  *Verify:* happy-dom units (windowing/pool/scheduler/srcset) + Playwright (gestures/keyboard/axe).

- [x] **M4 — Overlay engine.** viewport layer + content layer (shared matrix); region scale-with-image,
  point counter-scale; visibleAt, layer, interactive → overlayClick; non-visible slides render none.
  *Verify:* Playwright visual regression at multiple zoom levels.

- [ ] **M5 — Motion.** core spring→keyframe sampler (interruptible re-base) → Element.animate;
  theme-default `--visora-*` tokens + bezier fallbacks, chrome material, auto-hide, backdrop;
  shared-element FLIP open/close; depth-flip vs horizontal-slide axis distinction;
  prefers-reduced-motion → ≤140ms cross-fades.
  *Verify:* Playwright visual-regression (axis distinction) + reverse-mid-flight (no snap).

- [ ] **M6 — Hardening.** axe in CI; perf trace (60fps, no long task >50ms, memory bound);
  size-limit ≤16KB; examples/vanilla (flat) + examples/monitoring (grouped + preserve + overlays)
  smoke-tested.
  *Verify:* full CI pipeline green.

## Risks

1. 16KB budget → size-limit gate from M0; motion sampler demotes to `@visora/motion` if needed.
2. Arbitration correctness → pure reducer + exhaustive matrix + real-pointer Playwright.
3. Overlay precision → single shared matrix, RAF-coupled; visual regression.
4. Re-render storms → imperative zoom + store selector eq guards.
5. SSR safety → no DOM at import/construct; node-import smoke test.

## End-to-end verification

```
pnpm -r build && pnpm -r typecheck   # clean
pnpm test                            # vitest node + happy-dom green
pnpm e2e                             # Playwright: gestures, axe, visual, perf
pnpm size                            # core + renderer-dom ≤ 16 KB gz
```
Manual: open examples in browser — two-axis nav, zoom/pan, overlays, drag-to-dismiss, reduced-motion.
