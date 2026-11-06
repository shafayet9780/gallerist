# Gallerist — Phase 0 Implementation (as-built)

> Companion to `docs/GALLERIST_SPEC.md` (the design source of truth) and `plans/phase-0.md`
> (the milestone tracker). This document explains **how Phase 0 is actually built and why** —
> the decisions, the coordinate model, the data flow, the gotchas, and the extension seams.
> Status: Phase 0 complete (M0–M6). 173 unit tests + 11 Playwright e2e, all gates green.

---

## 1. Architecture at a glance

Four concentric rings (spec §3); Phase 0 ships the inner three:

```
theme-default (CSS only) ─┐
renderer-dom ─────────────┼─► core   (zero runtime deps, DOM-free)
react/vue/svelte (P1) ────┘
```

| Package | Role | Touches DOM? | Bundle (gz) |
|---|---|---|---|
| `@gallerist/core` | Headless engine: model, store, FSM, nav, zoom/arbitration math, events, spring sampler, `createViewer` | **No** | 3.07 KB |
| `@gallerist/renderer-dom` | The only DOM ring: windowing, image adapter, gestures, overlays, a11y, chrome | Yes | core+renderer 6.75 KB / 16 KB budget (16.5 KB since 0.3, plan P2-R) |
| `@gallerist/theme-default` | Pure-CSS skin, `--gallerist-*` tokens, motion | n/a (CSS) | shipped separately |

**Dependency direction:** `renderer-dom → core` (type-only, plus the runtime spring/zoom math).
`theme-default` has no JS dependency. `core` depends on nothing.

### The headless invariant (load-bearing)

`@gallerist/core` never touches the DOM — not at import, not at construction, not ever. DOM types
(`HTMLElement`, `Node`, `AbortSignal`) appear in core **only as type annotations** (e.g.
`OverlaySpec.render: (ctx) => Node`); core never calls them. This is what lets a consumer build a
fully custom UI on the same engine, and it's verified structurally: core has zero DOM access and
its tests run in the node vitest environment with no DOM shim.

Consequence worth noting: the **image adapter lives in `renderer-dom`**, not core, even though
spec §12 lists "image (core)." Creating an `<img>` is DOM work; the headless invariant wins. The
`MediaAdapter`/`MountedMedia`/`AdapterCtx` *interfaces* live in core (types only).

---

## 2. Data flow

```
createViewer(options)            // core — headless
  ├─ normalize(options)          // → internal Collection (groups[])
  ├─ createStore<ViewerState>()  // signal store (phase, interaction, cursor, zoom, loaded)
  ├─ reduceFsm / nav math / emitter
  └─ returns ViewerApi

mount(viewer, opts)              // renderer-dom
  ├─ builds structural DOM (stage, track, viewport layer, chrome, live region)
  ├─ attachGestures(...)         // Pointer/wheel → arbitration → imperative transform
  └─ viewer.subscribe(sync)      // re-projects state → DOM on every change
```

The renderer is a **pure subscriber**: every state change runs `sync()` → `renderWindow()` +
`updateChrome()`. The controller owns all state; the renderer owns all DOM. They communicate only
through `ViewerApi` (`getState`, `getCollection`, `subscribe`, the action methods, `on`/`emit`).

`createViewer` reference: `packages/core/src/controller/createViewer.ts`.
`mount` reference: `packages/renderer-dom/src/mount.ts`.

---

## 3. Key design decisions (the *why* not in the spec)

### 3.1 Coordinate model — "model B" (contained media, relative zoom)

The committed zoom defaults to `{ scale: 1, x: 0, y: 0 }`. The media is laid out by CSS
`object-fit: contain` inside the content layer (which fills the stage), so **scale 1 == fit**: the
image is fully visible at scale 1, and the zoom transform is *relative* (scale ≥ 1 zooms in).

- Gesture/pan math therefore uses the **stage size** as the clamp basis (`fitScale(stage, stage) = 1`);
  `mount`'s `getGeometry()` returns `naturalSize = stage size` for this reason.
- Overlays use the **real media `naturalSize`** to compute the contain rect, so natural/normalized
  anchor coordinates map onto the letterboxed image correctly.

Trade-off: model B keeps the renderer simple and avoids a "fit on open" round-trip through the
store. The alternative (model A: transform maps natural pixels → stage, fit < 1) is cleaner for
image-space overlays but needs the renderer to initialize zoom to fit on every slide. We chose B
for Phase 0; overlays bridge the gap via the contain-rect mapping in
`packages/renderer-dom/src/overlays/position.ts`.

### 3.2 Imperative-during-gesture zoom (decision P0-E)

`ViewerState.zoom` is the **last committed** transform, not the live one. During an active
pan/zoom, `attachGestures` mutates `content.style.transform` directly via a RAF and **does not
write the store**; it commits once on gesture end (`getInternals(viewer).setZoom`, clamped by the
renderer's zoom bounds). This protects 60fps and stops framework adapters (Phase 1) from
re-rendering 60×/second. See
`packages/renderer-dom/src/gestures.ts`.

### 3.3 Lifecycle transitions are renderer-driven

`open()`/`close()` dispatch `OPEN`/`CLOSE`, then wait for the renderer's lifecycle driver
(`getInternals(viewer).setLifecycleDriver`) to call `done()` before dispatching `OPENED`/`CLOSED`
and emitting `opened`/`closed`. Without a driver they settle in the same tick. The DOM renderer
reflects the phase as `data-gallerist-phase` on the root and settles when the theme's phase
animation ends (fade in 280ms, fade out 180ms; none under reduced motion), with a timer backing
up `animationend`. The overlay therefore stays mounted, focus-trapped and scroll-locked through
its exit. Each transition carries a generation, so a `done()` from a superseded one (close during
opening, reopen during closing) is ignored, and removing the driver settles a transition in
flight so `closed` always fires. Nav coalescing during transitions (spec §6) is still future
work.

### 3.4 Overlay paint vs update

Rebuilding overlays on every state change would re-invoke user `render()` and thrash the DOM
(violating spec §9.2). Instead `paintOverlays` runs **only when the current item changes** and
returns retained `OverlayEntry[]`; a zoom-only change calls `updateOverlays(entries, scale)` which
adjusts point counter-scale and `visibleAt` visibility in place — no `render()`, no DOM recreation.

### 3.5 Mode is a data attribute, not a class

The viewer root carries `data-gallerist-mode="overlay" | "inline"`, **not** a `gallerist-overlay` class.
`gallerist-overlay` is also the class for overlay *elements* (`.gallerist-overlay { pointer-events: none }`),
and `pointer-events` **inherits** — a class collision once put the whole tree to
`pointer-events: none` and killed all gestures. See §6 (gotchas).

---

## 4. Subsystems

### 4.1 Navigation (two-axis) — `packages/core/src/nav/nav.ts`
Pure `(cursor, ctx) → cursor`. Primary axis (groups) wraps when `loop`; secondary axis (items)
clamps, never wraps. `itemMemory`: `reset` (→0), `preserve` (keep index if present else 0),
`clamp` (min(i, last)). `goTo`/`goToId` route through `navTo`: a same-group jump emits **item**
events, a cross-group jump emits **slide** events (§18 taxonomy).

### 4.2 Zoom + gesture arbitration — `packages/core/src/zoom/`
Pure math: `contentToStage`/`stageToContent`, `focalZoom` (pins the focal pixel), `fitScale`/
`fitTransform`, `clampPan` (cover-or-center), `clampScale`, `toggleZoom`. `arbitrate(input)`
resolves one pointer-down to exactly one intent (`navigate|pan|close|zoom|secondary`) per the
§11.3 rules; the renderer locks the result for the gesture. The matrix is exhaustively unit-tested;
real Pointer Events are exercised in Playwright.

### 4.3 Virtualization — `packages/renderer-dom/src/windowing.ts`
`windowIndices` selects the mounted slide window; `reconcileKeys` diffs mounted vs wanted for the
node pool (enter/exit/keep). Proven bound: a 10,000-group collection keeps **< 10 slides live** and
stays bounded across 500 navigations. A `groupId → index` Map (rebuilt only on `setCollection`)
keeps per-render cost off the O(groups) path.

### 4.4 Overlays — `packages/renderer-dom/src/overlays/`
Two layers: **viewport** (corner-anchored, `pointer-events:none` unless `interactive`) and
**content** (inside the transformed content layer, so it tracks pan/zoom for free). `region` anchors
scale with the image; `point` anchors counter-scale to a constant screen size. `position.ts` is the
pure mapping; `render.ts` paints/updates.

### 4.5 Motion — `packages/core/src/motion/spring.ts` + theme
`sampleSpring` turns a damped oscillator into progress keyframes + a clamped duration; `SPRINGS`
ships the named presets (spec §27.2). The default theme drives the **axis distinction** (time =
horizontal slide, screen = depth pop) with CSS keyframes toggled by `data-gallerist-enter`, and honors
`prefers-reduced-motion`. FLIP shared-element open/close and full interruptible-hero re-basing are
deferred (the sampler is in place for them).

---

## 5. Public API (Phase 0)

Authoritative types: `packages/core/src/api.ts` and `packages/core/src/types.ts`.

```ts
// core
const viewer = createViewer({
  items? | groups? | collection?,   // one front door (flat items → singleton groups)
  startAt?, loop = true, itemMemory = 'reset', keepZoomOnNav = false,
  overlays?, on?,                    // on: { slide, item, zoom, overlayClick, ... }
})
viewer.open(at?) / close()
viewer.next() / prev() / nextItem() / prevItem()
viewer.goTo(g, i?) / goToId(groupId, itemId?)
viewer.zoomTo(scale, focal?) / resetZoom()  // focal: stage px kept fixed; default centre; clamped
viewer.setCollection(next)          // diff by id, preserves cursor (+ zoom if same item)
viewer.getState() / getCollection() / subscribe(fn)
viewer.on(event, handler)           // runtime events
// renderer/plugin plumbing: getInternals(viewer).emit / getPlugins / onPluginsChanged
// from '@gallerist/core/internal' (spec §8.4), alongside the zoom/nav/windowing math
viewer.destroy()

// renderer-dom
const handle = mount(viewer, {
  container? = null,   // null = overlay/portal; element = inline
  controls? = true, adapters? = [imageAdapter()], preload? = {ahead:2,behind:1}, overlays?,
  strings?,            // label/announcement overrides for translation (DEFAULT_STRINGS)
})
handle.destroy()
```

Events (spec §18): lifecycle (`open/opened/close/closed`), group axis (`beforeSlide/slide/
afterSlide`, **cancelable** `beforeSlide`), item axis (`beforeItem/item/afterItem`, cancelable),
`zoom/zoomEnd/pan`, `load/loaded/loadError`, `collectionChange`, `fullscreenChange`, `overlayClick`,
`init/destroy`.

---

## 6. Known gotchas (read before editing)

- **`pointer-events` inherits.** A `pointer-events:none` rule on an ancestor disables the whole
  subtree. Root mode is a `data-gallerist-mode` attribute precisely to avoid colliding with the
  `.gallerist-overlay` element class. (See `packages/theme-default/src/base.css`.)
- **Gesture commit reads the pointer-up event's own coordinates**, not the last stored pointer
  position — Chromium coalesces `pointermove`s, so a fast flick may fire none before `pointerup`.
  Using the up-event coords makes flicks commit reliably (`gestures.ts` `onUp`).
- **Re-mounting media must not wipe the overlay host.** The content layer holds `[img,
  overlayHost]`; media swap destroys the old `<img>` (adapter `destroy`) and re-appends the overlay
  host last (above the media). Never `replaceChildren()` the content layer.
- **`getBoundingClientRect` is forced layout.** Gestures snapshot stage geometry at `pointerdown`
  and reuse it for the gesture — don't reintroduce per-`pointermove` rect reads (kills 60fps).
- **Playwright pointer input:** use discrete `mouse.move` calls, not `{steps}` — step-interpolation
  coalesces moves and can drop the `pointerup` (see `e2e/tests/viewer.spec.ts` `drag` helper).

---

## 7. Extension points

- **Media adapters** — implement `MediaAdapter` (`type`, optional `match`, `mount → MountedMedia`)
  and pass via `mount(viewer, { adapters: [...] })`. The image adapter is the reference.
- **Overlays** — declarative `OverlaySpec` (viewport or content anchor, `render` returns
  `string | Node`, `interactive`, `visibleAt`, `layer`, `scaleWithImage`). String render uses
  `textContent` (no XSS); `placeholder` is treated as trusted input.
- **Phase 1 prerequisite:** the **region/slot plugin contract** must be defined abstractly in
  `@gallerist/core` before the first plugin, so plugins survive a renderer swap (the headless moat).
  Not built in Phase 0 — see `plans/phase-0.md` (review finding I5).

---

## 8. Build, test, CI

- **Build:** tsup → ESM + CJS + `.d.ts` per package. `theme-default` is CSS-only.
- **Tests:** vitest **node** env for pure logic; **happy-dom** (per-file pragma) for DOM units;
  **Playwright** (chromium) for real gestures, axe a11y, and overlay zoom-tracking.
- **Gates (CI = `.github/workflows/ci.yml`):** lint (Biome) → typecheck → unit → build →
  size-limit (`core ≤ 12 KB`, `core+renderer ≤ 16.65 KB`) → Playwright e2e (incl. axe).
- **Deferred budget:** the 60fps frame-trace assertion is flaky as a gate → dedicated perf job;
  size and the DOM-bound memory claim are gated now.

---

## 9. What is intentionally NOT in Phase 0

Plugins, framework adapters (React/Vue/Svelte), video/provider adapters, DZI deep-zoom (v2 seam
only), FLIP open/close + full interruptible hero, async nav coalescing, and the region/slot
contract. Phase 1 (spec §25) starts with the React adapter (dogfood-first) and the first plugins.

---

## 10. Known limitations (v0.2.0) — consciously deferred

The Phase-1 publish-readiness review fixed all critical and important findings. Three lower-priority
items are deferred with rationale (we launch at 0.x, so none is frozen):

- **Image-space overlays on extreme aspect ratios (review S-UX6 / #69).** The coordinate model maps
  through the *stage* rect, not the contained image rect, so for a very tall portrait in a wide
  stage (or vice-versa) zoom/pan bounds and point-anchored overlays can be slightly off — they
  reveal letterbox area and anchor to the stage box rather than the painted image box. The true
  contained-rect mapping is the spec's M4 work; until then, pass `item.naturalSize` for best results
  and avoid anchored overlays on extreme ratios.
- **Gesture discoverability (review S-UX2).** There is no first-run hint for swipe / pinch /
  swipe-to-dismiss. Planned as an opt-in coachmark; for now, document the gestures in your UI.
- **Cross-browser e2e.** The Playwright suite runs on chromium + webkit. Five synthetic-input/
  headless-focus assertions (mouse-drag gestures, Tab-cycle, focus-restore) are chromium-only — the
  logic is browser-agnostic and Playwright/WebKit's synthetic input drops drag pointer events and
  Tab focus. Everything WebKit uniquely covers (CSS rendering, the prefixed Fullscreen path, axe,
  overlays/resize re-anchor, plugins) runs on both.
