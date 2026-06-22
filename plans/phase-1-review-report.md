# Visora — Phase 1 Publish-Readiness Review

**Date:** 2026-06-22 · **Branch:** `phase-1` (== `main`, @ `d0d31e5`) · **Goal:** ship a bug-free, performant, polished **v1** to npm.

Multi-modal review: 8 scoped reviewer agents (architecture, core-correctness, renderer-correctness,
plugins-correctness, performance, ui/ux-a11y, tests, publish-security) → every critical/important
finding adversarially verified by an independent skeptic → a cross-cutting completeness critic.
70 findings raised, **6 refuted**, **64 survived + 5 from the critic = 69**. Skeptics downgraded 13
(several "critical"→"important"). Counts below use the **post-verification** severity.

## Verdict: **NOT YET — do not publish until the 5 Critical + the publish-blocking Important items are fixed.**

The engine is in good shape — green build, 341 passing unit tests, sizes far under budget — but there
is a cluster of issues that would either **burn the npm version forever** (0.0.0), **ship a broken
install** (`workspace:^0.0.0`), or surface as **visible bugs on the headline features** (overlays
drift on resize, blank frame on loop-wrap, modal isn't actually modal). None are deep; most are
small, surgical fixes. Estimate: the Criticals + publish-blockers are ~1–2 focused days.

## Baseline (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ pass |
| `pnpm test` | ✅ 341 tests / 28 files pass |
| `pnpm build` | ✅ all packages |
| `pnpm size` | ✅ core **3.49**/12kB · core+renderer **9.79**/16kB · +thumbnails **12.39**/24kB · react **0.93**/3kB gz |

> Smell: the unit run prints a stray `TLSSocket` error trace — a test makes a **real network request** (non-deterministic). See T-3.

## Scorecard by dimension

| Dimension | Critical | Important | Suggestion | Headline issue |
|---|:--:|:--:|:--:|---|
| Architecture | 0 | 4 | 3 | Frozen public API has dead members (events, state fields) |
| Core correctness | 0 | 2 | 3 | Lifecycle events double-fire; `keepZoomOnNav` is dead |
| Renderer correctness | 3 | 3 | 4 | No ResizeObserver; no pointer capture; loop-wrap blank frame |
| Plugins | 0 | 6 | 5 | hash crashes on bad URL; fullscreen broken on Safari |
| Performance | 0 | 2 | 4 | Wheel-zoom commits to store per tick (no RAF) |
| UI/UX & a11y | 1 | 5 | 6 | No focus trap / background not inert; broken-image = blank |
| Tests | 0 | 3 | 5 | No resize / pinch / error-path / focus-restore coverage |
| Publish & security | 1 | 4 | 4 | 0.0.0 versions; no LICENSE; maps embed full src |
| Cross-cutting | 1 | 3 | 1 | React remount leaks plugins; onClose double-fires |

---

# 🔴 CRITICAL — must fix before publish (5)

### C1 — All 11 packages are version `0.0.0`; `workspace:^` will resolve to `^0.0.0` → broken first publish
`packages/*/package.json` (×11), `packages/core/src/index.ts:3`, `packages/renderer-dom/src/index.ts:2`
*(merges #2, #9, #52)*

Every publishable `package.json` is `"version": "0.0.0"`, and core + renderer hardcode
`export const VERSION = '0.0.0'`. CHANGELOG already documents through v0.2.0 — three sources disagree.
Publishing `0.0.0` is **non-recoverable** (npm forbids re-publishing a version). Worse: changesets
rewrite `workspace:^`/`workspace:*` to the *current* version at publish, so `@visora/react`'s peer
ranges become `^0.0.0` (caret on 0.0.x ⇒ exactly 0.0.0), guaranteeing a broken install graph.

**Fix:** pick the launch version (CHANGELOG implies 0.2.0; or jump to 1.0.0 for the "v1"), create a
changeset, run `changeset version` to bump all packages + internal ranges together, and **derive
`VERSION` from `package.json` at build** (tsup `define`/`env`) so it can never drift. Publish only via
`pnpm publish`/`changeset publish` (never raw `npm publish`) so `workspace:` is rewritten; verify the
packed tarballs.

### C2 — No ResizeObserver anywhere: overlays drift and zoom/pan goes stale on any resize/rotate
`packages/renderer-dom/src/mount.ts:383-399` · spec `docs/VISORA_SPEC.md:369` *(merges #3, #29, #44; verified: grep finds zero `ResizeObserver`/`resize`/`orientationchange` in renderer)*

Spec §10.5 mandates "a single ResizeObserver on the stage … debounced to a frame." It doesn't exist.
Image-space overlays compute absolute px from `stage.getBoundingClientRect()` only when the item
changes, and committed zoom is never re-clamped. On window resize / phone rotation / responsive
shift: **overlays mis-anchor and zoom/pan geometry is wrong until the user navigates away and back.**
`viewer.refresh()` can't save you — it's a documented no-op (`createViewer.ts:217`). This breaks the
library's headline feature (image-space overlays) on a trivially-triggered action, and nothing tests
it.

**Fix:** add one debounced (RAF) ResizeObserver on `stage`; on fire re-snapshot the rect, force overlay
repaint (`rec.overlayItemId = undefined; renderWindow()`), re-clamp committed zoom. Disconnect in
`destroy()`. Add a renderer unit test + a Playwright `setViewportSize` test.

### C3 — Gestures never call `setPointerCapture` → drags/releases off the stage strand the gesture
`packages/renderer-dom/src/gestures.ts:107,167,237` *(#4; verified: no `setPointerCapture` anywhere)*

`onDown` never captures the pointer, so once the pointer leaves the stage the browser stops delivering
`pointermove`/`pointerup`. If `pointerup` lands off-stage, `onUp` never runs: the `pointers` Map isn't
drained, the live transform freezes, `--visora-dismiss` stays set (stage dimmed), and the **stale
pointer poisons the next gesture** (size becomes 2 → next single-finger drag is misread as a pinch).
Easy to hit when panning a zoomed image past the edge or a fast swipe. Synthetic-event unit tests
dispatch on the stage so they never catch it.

**Fix:** `stage.setPointerCapture(e.pointerId)` in `onDown`, `releasePointerCapture` in `onUp`. Add a
Playwright test that drags beyond the stage rect.

### C4 — Loop-wrap shows a blank frame: `loop=false` hardcoded in slide window (and thumbnails + grid)
`packages/renderer-dom/src/mount.ts:327`, `plugin-thumbnails/src/index.ts:563,571`, `plugin-grid/src/index.ts:72` · core default `createViewer.ts:24` *(merges #26, #13; verified: 4 hardcoded `false` sites; core `loop ?? true`)*

Core defaults `loop=true` and `next()` at the last group wraps to group 0 — but all four virtualization
windows hardcode `loop=false`, so the wrap target is **never preloaded**. Result: a blank/unloaded
frame every time the user wraps last→first or first→last (the most common boundary nav), plus the
thumbnail rail and grid windows disagree with the stage at the seam. The shipped `examples/vanilla`
uses `loop:true`, so the default demo exhibits it.

**Fix:** expose the viewer's resolved `loop` (e.g. a `viewer.loop` mirror like `cursor`/`zoom`) and
thread it into all four `windowIndices(...)` calls. Add a wrap-boundary test.

### C5 — Overlay/lightbox is not actually modal: no focus trap, background never inerted
`packages/renderer-dom/src/mount.ts:194-208,499-519,565-606` *(#5; verified: no Tab handling, no inert/aria-hidden)*

The root gets `role=dialog` + `aria-modal=true` but **nothing keeps focus inside it**. `onKey` never
intercepts Tab, so Tab walks into the page behind the overlay; the background is never `inert`/
`aria-hidden`, so SR virtual-cursor and Tab reach obscured controls. `aria-modal` only *claims*
inertness; it doesn't enforce it. Violates WCAG 2.4.3 / the ARIA dialog pattern — a genuine a11y
blocker for a component whose whole job is a modal overlay. The a11y e2e only checks role/aria-modal/
initial-focus, so it's uncaught.

**Fix:** add Tab/Shift+Tab wrap-around among tabbable descendants; set `inert` (or `aria-hidden`) on all
other body children on attach and restore on detach. Add a Playwright test that Tabs N+1× and asserts
focus stays in `.visora`. (Pairs with I-UX1 dialog-name and S-UX focus-restore.)

---

# 🟠 IMPORTANT — should fix before v1 (30)

Several of these are publish-blockers in their own right (marked **[publish-blocker]**).

## Publish hygiene
- **I-P1 [publish-blocker]** No `LICENSE` file anywhere, yet all 11 packages declare `"license":"MIT"`. Trips license scanners / corporate OSS gates. Add root `LICENSE` (MIT) and include it in each package's `files`/prepack. `README.md:87` *(#23, verified)*
- **I-P2 [publish-blocker]** 10 of 11 packages ship **no README** → blank npmjs pages for `@visora/core`, `@visora/react`, etc. plugin-thumbnails' README uses repo-relative links that 404 on npm. Add a focused README per package. *(#24)*
- **I-P3** Sourcemaps embed **full TS source** and ship in every tarball (~3× size bloat; effectively re-publishes `src` despite `files:["dist"]`). Maps are ~107kB of core's 172kB. Set `sourcesContent:false` or drop maps from the published build. `*/tsup.config.ts:8` *(#25)*
- **I-P4** `@visora/core` depends on core via `workspace:*` in **`dependencies`** while react peers it — asymmetric, risks a duplicate core copy in consumer trees. Use `workspace:^` and consider making core a `peerDependency` of renderer-dom. `renderer-dom/package.json` *(#8)*

## Frozen-API correctness (costly to change post-1.0)
- **I-A1** Public `EventMap` declares **`pan`/`load`/`loaded`/`loadError`** — none are ever emitted. Wire them (emit `load*` when the adapter `ready` settles; `pan` from gestures) or remove from the frozen map. `core/src/events/events.ts:51-53` *(#6)*
- **I-A2** `ViewerState` exposes **`interaction`/`fullscreen`/`loaded`** — never written (permanently `idle`/`false`/`{}`). `INTERACT` is defined but never dispatched. Wire or drop before freezing. `core/src/types.ts:154-166` *(#7, #20)*
- **I-C1** Lifecycle events fire on **no-op transitions**: `open()` twice emits `open`/`opened` ×2; `close()` on a closed viewer re-emits. `dispatch()` returns void so the controller can't tell. Make `dispatch` return whether it transitioned and gate emits. `core/src/controller/createViewer.ts:146-160` *(#10)*
- **I-X1** **Amplifies I-C1 in React:** controlled `open` + `onClose={()=>setOpen(false)}` (the documented pattern) makes the close path run twice → **`onClose` fires twice on every dismissal** (double analytics/cleanup/routing). Fix root cause in core; also skip `close()` in the effect when already closed. `react/src/Visora.tsx:96-102` *(#14)*
- **I-C2** `keepZoomOnNav` is accepted in options but **read nowhere**; zoom is never reset on nav (spec default = reset). Zoom into a corner, hit next → land pre-zoomed on a differently-sized image. Implement reset-on-group-change or remove the dead option. `core/src/controller/createViewer.ts:110-128`, `api.ts:26` *(#11)*

## Cross-package / lifecycle
- **I-X2 (borderline critical)** `<Visora>` deliberately never calls `viewer.destroy()` (StrictMode workaround) and renderer `destroy()` doesn't dispose plugins → **plugins passed via `options.plugins` leak on every React remount** (store subscriptions, IntersectionObservers, DOM). The example forces a full remount (`key={mountKey}`) on every option toggle → unbounded growth + stale subscribers firing into detached DOM. Dispose plugin `destroy()` on unmount. `react/src/Visora.tsx:60-82`, `core/.../createViewer.ts:272`, `mount.ts:669-681` *(#1 — critic flagged this as the top cross-cutting miss)*
- **I-X3** `<Visora.Overlay>`/`<Visora.Region>` effect deps include object/array props (`anchor`,`visibleAt`) — inline literals (as in the shipped example) are fresh each render → **dispose+re-register the overlay plugin on every parent render**, fanning out to a full overlay repaint. Stabilize registration or memoize. `react/src/Visora.tsx:128-161` *(#12)*

## Renderer correctness
- **I-R1** Overlays paint against a **wrong contain rect before the image decodes** (naturalSize is null → falls back to stage size → full-square fit) and never repaint on load. Image-space overlays are mis-placed on first view of any item without a `naturalSize` hint. Await `rec.media.ready` and repaint. `mount.ts:396`, `overlays/position.ts:24` *(#27)*
- **I-R2** Pinch→single-finger handoff broken: lifting the **first** finger doesn't commit the zoom (`size===0` guard), and the remaining finger is inert (pinch branch needs ≥2). User must lift both fingers to pan. Commit zoom and re-seat to pan on the 2→1 transition. `gestures.ts:193,139` *(#28)*

## Plugins
- **I-PL1** **plugin-hash crashes on hostile input:** `decodeURIComponent` is unguarded — a URL like `#g=%` throws `URIError`, breaking the hashchange listener and on-load deep-link. Wrap in try/catch. `plugin-hash/src/index.ts:12-22` *(#17)*
- **I-PL2** plugin-hash truncates ids containing `=` (`split('=')` keeps only the first value) → deep links resolve to the **wrong item**. Split on first `=` only. `plugin-hash/src/index.ts:15-21` *(#18)*
- **I-PL3** plugin-hash writes `location.hash` on **every** nav → one history entry per item → **Back-button trap**. Use `history.replaceState` for intra-gallery moves. (todo.md already lists this as deferred.) `plugin-hash/src/index.ts:47-55` *(#22)*
- **I-PL4** plugin-fullscreen targets `document.querySelector('.visora')` (first match) instead of its bound viewer → **wrong element fullscreened with multiple viewers**. Resolve root from the viewer. `plugin-fullscreen/src/index.ts:14-17` *(#19)*
- **I-PL5** plugin-download revokes the blob object URL **synchronously** right after click → bulk-zip downloads can be cancelled mid-flight (esp. older Firefox). Defer revoke (`setTimeout(…,0)`). `plugin-download/src/index.ts:102-105` *(#21)*
- *(plugin-fullscreen Safari prefixes and YouTube empty-id are real but were downgraded to suggestions — see S-PL.)*

## Performance
- **I-PERF1** **Wheel/trackpad zoom commits to the store on every tick** (no RAF), unlike the pan/pinch path which RAF-coalesces. Each tick → full `renderWindow()` + every subscriber (thumbnails, grid, React) + 2 payload allocations, and `zoomEnd` wrongly fires per tick. The most likely place to drop below 60fps. RAF-coalesce; emit `zoomEnd` only on settle. `gestures.ts:217-228` *(#15, #58)*
- **I-PERF2** `renderWindow` re-runs `windowIndices` + `reconcileKeys` (≈6 short-lived arrays/Sets + O(window) loop) on **every** store commit, including zoom/pan where the window is unchanged (`updateChrome` is gated; this isn't). Early-out when cursor+collection unchanged. `mount.ts:320-335,528-538` *(#16)*

## UI/UX & a11y
- **I-UX1** Dialog has **no accessible name** (no `aria-label`/`labelledby`) — announced as just "dialog". axe misses it because the e2e uses only `wcag2a/wcag2aa` tags. Add a name + `best-practice` tag. `mount.ts:194-201` *(#32)*
- **I-UX2** Root keydown handler **hijacks typing**: digits/`t`/`+`/`-`/plugin letters fire even when focus is in an overlay `<input>`/`<textarea>`/contenteditable. Bail when `e.target` is editable or modifiers held. `mount.ts:565-606` *(#33, #50)*
- **I-UX3** **Broken/failed images stay permanently invisible** — `.visora-media-image` starts `opacity:0` and only `onLoad` reveals it; `onError` sets no marker. A 404 → blank stage with chrome, no feedback. Add a `data-visora-error` state + visible broken-state CSS (and a loading skeleton per spec §727). `image.ts:53-66`, `visora.css:119-130` *(#34)*
- **I-UX4** Vertical-rail item-panel/peek flyout floats over the stage with **no collision/clamp** and (for vertical rails) CSS hard-overrides the JS-computed offset, so every card peeks to the same fixed spot. Affects the shipped `contact` preset. Compute cross-axis offset from the card rect; clamp to host. `visora.css:727-741`, `plugin-thumbnails/src/index.ts:225-254` *(#35)*

## Tests (gaps on risky paths)
- **I-T1** **No resize test** at all (ties to C2) — overlay/pan-bounds desync is invisible to the suite. *(#29)*
- **I-T2** Gesture **teardown, multi-pointer pinch, and pointercancel are untested** in JS; the test injects a synchronous rAF so the coalescing/cancel logic never runs — a real batching or leak bug would pass. Add a controllable-rAF test + pinch/pointercancel/detach-no-op tests. `gestures.test.ts:31` *(#30)*
- **I-T3** No runtime test for media **abort/error/decode-failure** through the mount pipeline (`loadError` never asserted end-to-end). Also the source of the stray real-network `TLSSocket` error in the unit run — make tests offline/deterministic. `image.test.ts`, `events.ts:54` *(#31)*

---

# 🟡 SUGGESTION — polish / post-v1 (34)

Grouped; each is low-risk. Full detail (file:line + fix) in the source digest.

**Architecture (3)** · S-A1 core barrel re-exports engine internals (FSM/store/spring/nav/zoom math) as the frozen 1.0 surface — split to an `/internal` entry (#36). · S-A2 `RegionName` `(string & {})` lets plugins target non-existent regions that are silently dropped — warn or close the union (#37). · S-A3 overlay/adapter contract returns `HTMLElement`/`Node` inside DOM-free core — document as DOM-targeted or parameterize the node type (ADR) (#38).

**Core (3)** · S-C1 `sampleSpring(p,1)` → `[1]` (NaN intermediate); `count=0` → `[]`; public export, unguarded — clamp `count≥2` (#39/#59). · S-C2 item axis now wraps on `loop`, diverging from spec §5 (only primary axis wraps) — reconcile spec/code or split the flag (#40). · S-C3 `prevItem/nextItem` don't re-clamp an out-of-range incoming index — defensive clamp (#41).

**Renderer (4)** · S-R1 drag-to-dismiss writes `--visora-dismiss` but the theme **never consumes it** — dead backdrop feedback; add the CSS rule (#42). · S-R2 stacked overlay viewers clobber the body scroll-lock restore (no refcount) → page scroll stays locked after nested close (#56). · S-R3 Home/End/digit keys ignore linear/flat mode — End doesn't reach the true last item (#57). · S-R4 wheel handler forces layout per tick via `getBoundingClientRect` (subset of I-PERF1) (#58).

**Plugins (5)** · S-PL1 plugin-fullscreen has **no WebKit prefixes** → silently inert on Safari/iOS (downgraded only because spec targets unprefixed-capable versions; still worth it) (#47). · S-PL2 plugin-video-youtube: valid-but-unparseable URLs (playlist/homepage) build an empty player; `ready` hangs forever — reject or decline the match (#48). · S-PL3 youtube embed sets no `playerVars.origin` (postMessage hardening) + document CSP (#49). · S-PL4 plugin single-letter keymaps fire regardless of phase/focused input (overlaps I-UX2) (#50). · S-PL5 plugin-fullscreen toggle uses document-global `isFs()` — can exit an unrelated fullscreen element (#51).

**Performance (4)** · S-PERF1 `store.select()` exists, documented, tested — but **zero prod callers**; every subscriber wakes on every commit. Adopt it for cursor-only consumers or drop it from the 1.0 surface (#43). · S-PERF2 resize re-measure missing (perf view of C2) (#44). · S-PERF3 idle `onActivity` does a `removeAttribute` on every pointermove/wheel even when not idle — guard with a flag (#45). · S-PERF4 `useVisora` reallocates 10 action closures + object every render → breaks referential stability; return stable refs or `useMemo([viewer])` (#46).

**Publish (4)** · S-P1 `workspace:` → `^0.0.0` consequence of C1 (#52). · S-P2 no `repository`/`homepage`/`keywords`/`author`/`bugs`/`publishConfig` on any package → no npm source link, no provenance, poor SEO (#53). · S-P3 CJS type resolution falls back to ESM `.d.ts` (no nested `require.types`) — add per-condition `types`; run `attw` in CI (#54). · S-P4 theme-default ships unbuilt `src` with no `main`/`types` — minor; document or build to `dist` (#55).

**UI/UX & a11y (6)** · S-UX1 footer caption band is positioned only for a bottom rail; overlaps/detaches under vertical/hidden rails (3 of 4 presets) (#64). · S-UX2 no gesture discoverability (swipe/pinch/dismiss) — touch users on immersive preset can feel trapped; add a dismissible first-run hint (#65). · S-UX3 RTL unhandled (physical left/right, fixed arrow mapping) — use logical properties + flip arrows on `dir=rtl`, or document as unsupported (#66). · S-UX4 focus isn't moved to the new slide on nav and alt/caption isn't announced; focus-restore can land on `body` in dynamic apps — append alt to the live region; allow an explicit `returnFocus` (#67). · S-UX5 single accent color encodes focus+active+selection (color-only signaling); counter text ~3.5:1 (<AA) — add a non-color active cue, bump contrast (#68). · S-UX6 contained-size coordinate model mis-handles extreme aspect ratios (portrait-in-landscape) for pan bounds + overlays — confirm M4 closes this before shipping overlays as stable (#69).

---

# Cross-cutting themes (from the completeness critic)

1. **Cross-package teardown is nobody's job.** Each package assumed the other disposed plugins; the result is the React remount leak (I-X2). Define teardown ownership end-to-end.
2. **React referential-stability footguns.** Inline object/array props for overlays/regions (I-X3) and unstable `useVisora` closures (S-PERF4) thrash registration and re-renders. Either memoize internally or document the contract loudly.
3. **Renderer→theme token handshakes go unverified.** `--visora-dismiss` is written but unconsumed (S-R1); footer offset uses an image-height token instead of the live rail height (S-UX1).
4. **One bug, many call sites.** `loop=false` is hardcoded in 4 places (C4), not one; fixing only the renderer leaves rails/grid wrong.
5. **The frozen public surface has dead members** (events I-A1, state fields I-A2, `keepZoomOnNav` I-C2, `select()` S-PERF1). Decide wire-vs-remove for each *before* 1.0 — these are the expensive-to-change ones.

# Recommended pre-publish gate (ordered)

**Block the publish on:** C1–C5, I-P1, I-P2, I-P4, I-X2 (plus I-X1, I-PL1 — cheap and user-facing).

1. **Versioning & publish plumbing** — C1, I-P4, S-P1: set the real version, derive `VERSION` at build, fix dep ranges, dry-run `pnpm publish` and inspect tarballs.
2. **Legal/discoverability** — I-P1 (LICENSE), I-P2 (READMEs), I-P3 (maps), S-P2 (npm metadata).
3. **Headline-feature correctness** — C2 (ResizeObserver), C3 (pointer capture), C4 (loop-wrap), I-R1 (overlay-before-decode).
4. **Modal a11y** — C5 (focus trap/inert), I-UX1 (dialog name), I-UX2 (key hijack), I-UX3 (broken-image state).
5. **Lifecycle/leaks** — I-X2 (plugin disposal), I-C1+I-X1 (double-fire), I-X3.
6. **Frozen-API decisions** — I-A1, I-A2, I-C2, S-PERF1: wire or remove.
7. **Perf** — I-PERF1, I-PERF2 (RAF-coalesce the wheel path).
8. **Tests** — I-T1/T2/T3 (resize, pinch/teardown, error-path) + make the suite offline.

Then re-run `typecheck` + `test` + `e2e` + `size` and a manual pass of all four presets on touch + a screen reader.

> Transparency: 6 raised findings were **refuted** by the skeptic pass (e.g. an overstated duplicate-core `instanceof` mechanism — `createViewer` uses per-instance registration, no module singletons) and are not listed here.
