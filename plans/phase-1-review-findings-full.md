# Gallerist — Phase 1 Review: Complete Findings Dump

> Companion to [`phase-1-review-report.md`](./phase-1-review-report.md) (the ranked synthesis).
> This file is the **raw, unabridged** output of the multi-modal review workflow — every finding,
> every field, plus the adversarial-verification verdict and the cross-cutting critic notes.

**Date:** 2026-06-22 · **Branch:** `phase-1` @ `d0d31e5`

## Run stats

- Reviewer agents: 8 dimensions (architecture, core-correctness, renderer-correctness, plugins-correctness, performance, uiux-a11y, tests, publish-security) + per-finding adversarial verify + 1 completeness critic
- Total workflow agents: **54**
- Findings raised: **70** · refuted by skeptics: **6** · survived: **64** · added by critic: **5**
- Carried in this file: **69** (effective severity after verification)
- By effective severity: **5 critical · 30 important · 34 suggestion**

> Reviewing Gallerist across 8 dimensions, then adversarially verifying each critical/important finding.
> Reviewers raised 70 findings; 6 refuted by skeptics; 64 survive.

## Cross-cutting critic — gaps the per-dimension passes missed

The eight per-dimension passes were thorough within their slices but under-covered the SEAMS between packages. Specifically:

1. React lifecycle <-> core plugin lifecycle: nobody traced what happens to plugins passed via `options.plugins` (the common path, and the only path the example uses) when `<Gallerist>` unmounts/remounts. The renderer is torn down but the viewer is deliberately never destroyed (StrictMode workaround), so plugin `init()`-created subscriptions/observers/DOM leak on every remount — a real memory leak the per-package reviews each assumed the other side handled.

2. React prop identity <-> plugin registration churn: the `<Gallerist.Overlay>`/`<Gallerist.Region>` effect dependency arrays include object/array props (`anchor`, `visibleAt`), which are fresh references on every parent render. The shipped example passes inline literals, so every render disposes+re-registers the overlay plugin, which fans out through `onPluginsChanged -> mountRegions -> full overlay repaint`. This crosses React -> core registry -> renderer and was invisible to single-slice review.

3. Renderer <-> theme CSS contract: the renderer writes a `--gallerist-dismiss` custom property during drag-to-dismiss, but the default theme defines no rule consuming it, so the intended backdrop feedback is dead. Renderer-correctness saw the write, uiux saw the CSS, neither checked the handshake.

4. The hardcoded `loop=false` windowing bug was flagged only in renderer-dom/mount.ts; the identical defect also lives in plugin-thumbnails (2 call sites) and plugin-grid, which were not cited — so the "fix" as scoped would leave the rails/grid still wrong on wrap.

5. The controlled-`open` + `onClose` React binding turns the existing "close-while-closed re-emits" core finding from an edge case into a guaranteed double-fire of `onClose` on every Escape/close (close -> closed event -> setOpen(false) -> effect -> close() again). The cross-package amplification was not noted.

Under-covered areas overall: cross-package teardown ordering, React referential-stability footguns for plugin/overlay props, and renderer->theme token handshakes. Single-package deep dives missed all of these.

---


# 🔴 CRITICAL

## [1] Plugins passed via options.plugins leak on every React remount (viewer is intentionally never destroyed)

- **Dimension:** cross-cutting
- **Effective severity:** critical  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/react/src/Gallerist.tsx:60`, `packages/react/src/Gallerist.tsx:70`, `packages/react/src/Gallerist.tsx:82`, `packages/core/src/controller/createViewer.ts:272`, `packages/plugin-thumbnails/src/index.ts:627`, `packages/plugin-thumbnails/src/index.ts:605`, `packages/plugin-grid/src/index.ts:134`

**Description.** <Gallerist> creates the viewer with `useState(() => createViewer(options))`, which registers every plugin in `options.plugins` (createViewer.ts:272). Those plugins' `init()` subscribe to the store (`viewer.subscribe(render)`, thumbnails:627) and create IntersectionObservers, DOM nodes, timers, etc. On unmount the effect cleanup calls `handle.destroy()` (Gallerist.tsx:82) which tears down ONLY the renderer; the comment at Gallerist.tsx:64-68 deliberately does NOT call `viewer.destroy()` (to survive StrictMode). Since the renderer's destroy() never disposes plugins either (mount.ts:669-681 only `unsubscribe`/`offPlugins`/`detachGestures`, never `inst.destroy()`), the plugin subscriptions/observers/DOM from `options.plugins` are never torn down. The example forces a full remount via `key={mountKey}` on any option toggle (examples/react/main.tsx:503, 170-192), so each toggle leaks an entire viewer + its plugin subscriptions and observers permanently.

**Impact.** Unbounded memory growth in any React app that conditionally configures Gallerist (changing preset/loop/plugins/etc.), and stale plugin subscribers keep firing render() against detached DOM. Over a session the leaked IntersectionObservers and store subscribers accumulate without bound.

**Recommended fix.** Either (a) destroy the viewer in the unmount cleanup but guard StrictMode via a real ref/double-invoke guard instead of leaking, or (b) capture and call the disposers returned by registering each `options.plugins` entry through `viewer.use()` (rather than passing them to createViewer) and dispose them in the effect cleanup, or (c) have renderer-dom's destroy() dispose the plugins it owns. Whichever path, plugin `destroy()` MUST run when the React tree unmounts.

---

## [2] All publishable packages are version 0.0.0 (and core hardcodes VERSION='0.0.0')

- **Dimension:** publish-security
- **Effective severity:** critical  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → critical)
- **Files:** `packages/core/package.json:3`, `packages/core/src/index.ts:3`, `packages/react/package.json:3`, `packages/renderer-dom/package.json:3`, `CHANGELOG.md:3`

**Description.** Every one of the 11 publishable package.json files declares "version": "0.0.0", and packages/core/src/index.ts exports `export const VERSION = '0.0.0'`. The CHANGELOG.md already documents shipped milestones up through v0.2.0, so the package version, the runtime VERSION constant, and the changelog all disagree. There are no pending changesets in .changeset/ (only config.json), so a `changeset version` run would not bump anything. `npm pack --dry-run` in packages/core confirms the tarball would be published as @gallerist/core@0.0.0.

**Impact.** Publishing 0.0.0 is a non-recoverable mistake: npm forbids re-publishing the same version, so a botched 0.0.0 publish burns that version forever and can't be a real v1. The runtime VERSION='0.0.0' will lie to any consumer that reads it for diagnostics/telemetry. The workspace:^ rewrite (separate finding) would also pin internal deps to ^0.0.0.

**Recommended fix.** Decide the launch version (the CHANGELOG implies 0.2.0 next, or jump to 1.0.0 for the 'v1' publish) and set it consistently. Create a changeset, run `changeset version` to bump all packages and the internal deps together, and drive VERSION from package.json at build time (tsup `define`/`env`, or generate it) so the constant can never drift from the published version again.

**Skeptic reasoning.** Every cited claim is accurate and personally verified. All 11 publishable packages declare "version": "0.0.0" and none are marked private, so they are genuinely publishable. The runtime constant in packages/core/src/index.ts:3 is `export const VERSION = '0.0.0'` and grep confirms it is the only VERSION definition; tsup.config.ts for core has no define/env injection, so the constant is hardcoded and would ship verbatim. CHANGELOG.md:3 documents `## v0.2.0`, directly contradicting the 0.0.0 package version and runtime constant. The .changeset/ directory contains only config.json with no pending .md changesets, so a `changeset version` run would bump nothing. Node-resolved package.json confirms the tarball would publish as @gallerist/core@0.0.0. Impact reasoning holds: npm forbids re-publishing a version, so a 0.0.0 publish is non-recoverable and cannot be a real v1; the VERSION constant would misreport to diagnostics/telemetry; and workspace:^ internal deps would resolve against ^0.0.0. This directly blocks the stated goal of shipping v1 to npm and is non-recoverable once executed, so critical is the correct severity.

**Verified evidence.** packages/core/package.json:3 "version": "0.0.0"; packages/core/src/index.ts:3 export const VERSION = '0.0.0' (grep: only VERSION decl in core/src); packages/react/package.json:3 and packages/renderer-dom/package.json:3 both "version": "0.0.0"; CHANGELOG.md:3 "## v0.2.0 — UX/UI overhaul"; Node enumeration: all 11 non-private, non-ignored packages = 0.0.0; .changeset/ holds only config.json (no pending .md, updateInternalDependencies: patch); packages/core/tsup.config.ts has no define/env version injection; node resolve -> "would publish: @gallerist/core@0.0.0".

---

## [3] Gestures never set pointer capture — drags/releases off the stage strand the gesture

- **Dimension:** renderer-correctness
- **Effective severity:** critical  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → critical)
- **Files:** `packages/renderer-dom/src/gestures.ts:107`, `packages/renderer-dom/src/gestures.ts:167`, `packages/renderer-dom/src/gestures.ts:237`

**Description.** onDown (gestures.ts:107) sets the pointer in the map and snapshots geometry but never calls stage.setPointerCapture(e.pointerId). Without capture, once the pointer moves outside the stage element the browser stops delivering pointermove/pointerup to the stage. If the pointerup occurs off-stage, onUp never runs: the pointers Map is never drained, `start`/`intent`/`gestureGeom` stay set, the imperative live transform is frozen mid-gesture, and the `--gallerist-dismiss` CSS var (set during a close drag, gestures.ts:161) is never removed so the stage stays dimmed. Worse, the stale entry in `pointers` poisons the next gesture: the next pointerdown sees pointers.size become 2, so onDown takes the pinch branch (intent='zoom') for what is actually a fresh single-finger drag. This is easy to hit when panning a zoomed image (you drag past the stage edge) or doing a fast swipe.

**Impact.** Stuck/È wrong gestures and a frozen or dimmed stage after any drag that leaves the stage bounds — a class of bug that is very visible in real touch/mouse use and not caught by the synthetic-event unit tests (which dispatch directly on the stage).

**Recommended fix.** Call stage.setPointerCapture(e.pointerId) in onDown so all subsequent move/up/cancel for that pointer are delivered to the stage regardless of position, and stage.releasePointerCapture in onUp. Pointer capture also routes pointercancel reliably. Add a Playwright/manual test that drags beyond the stage rect.

**Skeptic reasoning.** The finding is accurate. I verified every link in the chain against the actual source.

1) No pointer capture exists anywhere: grep across all packages returns zero hits for setPointerCapture/releasePointerCapture. onDown (gestures.ts:107-120) does pointers.set + geometry snapshot but never captures.

2) Listeners are bound to the stage element, not document/window: gestures.ts:237-242 attach pointerdown/move/up/cancel to `stage`, and mount.ts:630 passes the `.gallerist-stage` div (created mount.ts:204). With no capture, the browser stops routing pointermove/pointerup to that element once the pointer leaves the stage subtree — standard Pointer Events behavior. This is realistically hit when panning a zoomed image past the stage edge or on a fast swipe.

3) The strand consequences are exactly as described: if pointerup fires off-stage, onUp never runs, so pointers.delete (line 169) is skipped and start/intent/gestureGeom (cleared only at lines 211-213) stay set; the live imperative transform is frozen; and the --gallerist-dismiss var set during a close drag (line 161) is never removed (removal is at line 200), leaving the stage dimmed.

4) The next-gesture poisoning is real and the worst part: a leftover entry means the next pointerdown makes pointers.size === 2, so onDown takes the pinch branch and sets intent='zoom' (lines 115-119) for what is actually a fresh single-finger drag.

5) Tests cannot catch it: unit tests dispatch synthetic events directly on `stage` (gestures.test.ts:66-134), which delivers irrespective of coordinates; the e2e drag helper (viewer.spec.ts:13-20) computes all coordinates inside the stage bounding box (lines 49-60), so no drag ever leaves the stage.

The proposed fix (setPointerCapture in onDown, releasePointerCapture in onUp, plus an off-stage Playwright drag) is the correct, idiomatic remedy and also makes pointercancel routing reliable. Severity critical is justified because the failure not only freezes/dims the current gesture but corrupts the immediately following interaction into a wrong intent, and it is easy to trigger in normal touch/mouse use while being invisible to the existing test suite.

**Verified evidence.** packages/renderer-dom/src/gestures.ts:107-120 (onDown: pointers.set + snapshot, no setPointerCapture); gestures.ts:161 (sets --gallerist-dismiss) vs gestures.ts:200 (removed only in onUp); gestures.ts:167-169 (onUp early-returns / pointers.delete only when delivered); gestures.ts:210-214 (start/intent/gestureGeom cleared only when pointers.size===0 inside onUp); gestures.ts:112-119 (size===2 → intent='zoom' pinch branch); gestures.ts:237-242 (listeners on `stage`); packages/renderer-dom/src/mount.ts:204 + 629-630 (passes the .gallerist-stage div); grep over packages/ shows no setPointerCapture/releasePointerCapture anywhere (only gallerist.css:74 touch-action:none); e2e/tests/viewer.spec.ts:13-20 + 49-60 (drag helper stays inside the stage box, no off-stage coverage); gestures.test.ts:66-134 (synthetic events dispatched directly on stage).

---

## [4] No ResizeObserver on the stage — spec-mandated re-measure is entirely missing

- **Dimension:** renderer-correctness
- **Effective severity:** critical  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → critical)
- **Files:** `packages/renderer-dom/src/mount.ts:204`, `packages/renderer-dom/src/mount.ts:383`, `docs/GALLERIST_SPEC.md:369`

**Description.** GALLERIST_SPEC.md:369 requires: "A single ResizeObserver on the stage re-measures and re-picks srcset candidates and re-clamps zoom bounds. Debounced to a frame." A grep across the entire renderer-dom package finds zero uses of ResizeObserver / 'resize' / orientationchange. Overlays compute absolute pixel left/top/width/height from stage.getBoundingClientRect() at paint time (mount.ts:385-398) and are only repainted when rec.overlayItemId changes (mount.ts:383). On a window resize or device rotation: image-space overlays keep their stale pixel positions and drift off the image; the committed zoom transform is never re-clamped against the new fit, so a zoomed/panned image can be left over-zoomed or panned past the stage edge; and srcset is never re-evaluated. viewer.refresh() does not help: it is a documented no-op in core (createViewer.ts:217) that never notifies subscribers, and even a re-render would not repaint overlays because overlayItemId is unchanged.

**Impact.** Resizing the window or rotating a phone leaves overlays mis-anchored and zoom/pan geometry stale until the user navigates to a different item. This is a guaranteed, easily-triggered visual defect on the two-axis overlay feature that is a headline capability of the library, and a direct violation of a locked spec requirement.

**Recommended fix.** Add a single ResizeObserver on `stage` (and ideally an orientationchange fallback), debounced to one RAF. On fire: snapshot the new stage rect, force overlay repaint (set current rec.overlayItemId = undefined then renderWindow()), and re-clamp the committed zoom via clampPan/clampScale against the new fit. Disconnect it in destroy(). Re-pick srcset by re-setting sizes if needed.

**Skeptic reasoning.** Every concrete claim in the finding checks out against the actual code. (1) The spec line is real and explicit: GALLERIST_SPEC.md:369 §10.5 mandates "A single ResizeObserver on the stage re-measures and re-picks srcset candidates and re-clamps zoom bounds. Debounced to a frame." (2) There is zero implementation: a grep for ResizeObserver / orientationchange / addEventListener('resize' across the whole packages/ tree (excluding tests/dist) returns no matches. (3) Image-space overlays write absolute pixel left/top/width/height derived from the stage size — overlays/render.ts:100-104 via contentAnchorBox(spec.anchor, ctx.stage, ctx.natural) — and mount.ts only repaints them when rec.overlayItemId !== it.id (mount.ts:383). A resize does not change the item id, so the repaint branch is skipped and only updateOverlays runs (mount.ts:401), which per render.ts:39-46 only toggles visibleAt visibility and re-applies counterScaleTransform; it never recomputes the pixel anchors. Result: overlays drift off the image on resize/rotation until the user navigates. (4) viewer.refresh() genuinely cannot rescue this: createViewer.ts:216-218 is a comment-only no-op that never calls store.set and never emits, so the renderer's subscriber (sync) is never re-run. (5) Committed zoom is applied from state.zoom (mount.ts:379) and is only re-clamped on explicit gesture/keyboard input — no resize path re-runs clampScale/clampPan, so a zoomed/panned image can be left over-zoomed or panned past the new stage edge. The defect is not a documented deferral: no resize/ResizeObserver task exists in tasks/plan.md or tasks/todo.md, and IMPLEMENTATION.md's gotchas never mention it (it only notes gestures snapshot the rect at pointerdown, IMPLEMENTATION.md:199). Minor imprecisions in the finding do not undercut it: live pan bounds self-correct on the next pointerdown (mount.ts:635 re-reads the rect), and the proposed srcset fix is approximate — but the committed-zoom staleness and overlay mis-anchoring stand. Severity is critical: it is a guaranteed, trivially triggered visual defect (window resize / device rotation) on the flagship two-axis image-space-overlay feature and a direct violation of a locked spec requirement shipping in v1. (A defensible downgrade to important exists since it is action-triggered and self-heals on navigation, but the locked-spec violation plus visible breakage of a headline capability keeps it critical.)

**Verified evidence.** docs/GALLERIST_SPEC.md:369 (ResizeObserver mandate, §10.5); packages/renderer-dom/src/mount.ts:383-399 (overlay repaint gated solely on overlayItemId change; stage rect read once at paint time, line 384); packages/renderer-dom/src/mount.ts:400-402 (zoom-only path calls updateOverlays, never re-anchors px); packages/renderer-dom/src/overlays/render.ts:100-104 (contentAnchorBox writes literal left/top/width/height px from ctx.stage); packages/renderer-dom/src/overlays/render.ts:39-46 (updateOverlays only toggles visibility + counter-scale, no px recompute); packages/renderer-dom/src/mount.ts:379 (applyTransform from state.zoom, no resize re-clamp); packages/core/src/controller/createViewer.ts:216-218 (refresh() is a comment-only no-op, no store.set, no emit); grep ResizeObserver|orientationchange|addEventListener('resize') across packages/ -> no matches (renderer-dom grep exit 1); tasks/plan.md & tasks/todo.md -> no resize task (not a known deferral)

---

## [5] No focus trap and no inerting of background — the modal dialog is not actually modal

- **Dimension:** uiux-a11y
- **Effective severity:** critical  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → critical)
- **Files:** `packages/renderer-dom/src/mount.ts:194-208`, `packages/renderer-dom/src/mount.ts:499-519`, `packages/renderer-dom/src/mount.ts:565-606`

**Description.** In overlay mode the root gets role=dialog + aria-modal=true and is appended to document.body, but nothing keeps focus inside it. onKey handles arrows/Escape/etc. but never intercepts Tab, so pressing Tab walks out of the dialog into the still-focusable page behind it (the trigger button, links, etc.). The background is never set inert or aria-hidden, so screen-reader virtual-cursor and Tab both reach content that is visually obscured by the position:fixed overlay. aria-modal=true only tells AT the rest is inert; it does not enforce it. The a11y e2e test only asserts role/aria-modal/initial focus (a11y.spec.ts), so this is uncaught.

**Impact.** WCAG 2.4.3 (Focus Order) / 1.3.1 and the ARIA dialog pattern are violated. Keyboard and screen-reader users lose the viewer context, can operate hidden background controls, and can get the page into a confusing state — a genuine a11y blocker for a component whose whole job is a modal overlay.

**Recommended fix.** Add a Tab/Shift+Tab handler on root that cycles focus among the dialog's tabbable elements (wrap-around), and on Tab landing outside, pull focus back to the first/last tabbable. On attach(), set aria-hidden="true" (or the `inert` attribute, now broadly supported) on all body children except the dialog root; restore on detach(). Add a Playwright test that Tabs N+1 times and asserts focus stays within .gallerist.

**Skeptic reasoning.** The finding is accurate on every cited point. In overlay mode the root is appended to document.body (mount.ts:506) with role=dialog + aria-modal=true (mount.ts:195-196) and tabIndex=-1, and root.focus() is called on attach (mount.ts:507). However, the sole keydown handler onKey (mount.ts:565-605, bound at 606) handles arrows/Escape/+/-/0/t/Home/End/digits/plugin keys but never intercepts Tab or Shift+Tab — so browser-default Tab navigation walks focus out of the dialog. A repo-wide grep confirms there is no Tab handling, no tabbable-cycling/focus-trap logic, and no inert or background aria-hidden anywhere in src (the only aria-hidden hits are on overlay hosts and SVG icons, unrelated to inerting siblings). attach()/detach() (mount.ts:499-519) set scroll-lock, move focus in, and restore focus on close, but do nothing to inert sibling body children, so the background trigger button (e2e/app/index.html:19: <button id="open">) and any page links remain in the tab order and reachable by SR virtual cursor behind the position:fixed overlay. aria-modal=true only advertises modality to AT; it does not enforce it. Critically, the project's own spec locks this in: docs/GALLERIST_SPEC.md:534 requires overlay mode to be role=dialog aria-modal=true with "focus trapped" and scroll-lock — three of four sub-requirements are implemented; focus trapping was left unbuilt. The a11y e2e test (e2e/tests/a11y.spec.ts) only asserts role/aria-modal/initial focus and runs axe scoped to .include('.gallerist'); axe does not test focus-trap dynamics and the scoping excludes the background anyway, so the gap is genuinely uncaught. Severity critical is warranted: it breaks a locked spec decision and the ARIA dialog pattern for a component whose entire purpose is a modal overlay, with real keyboard/SR impact (WCAG 2.4.3 / dialog pattern). The proposed fix (Tab/Shift+Tab cycling on root + inert/aria-hidden on body siblings during attach, restored on detach, plus a Playwright tab-loop assertion) is correct.

**Verified evidence.** mount.ts:195-197 sets role=dialog, aria-modal=true, tabIndex=-1; mount.ts:506-507 appends root to document.body and calls root.focus(); mount.ts:565-605 onKey switch has no Tab case (default branch handles only /^[1-9]$/ digits and pluginKeymap); mount.ts:499-519 attach/detach do scroll-lock + restoreFocus but never inert/aria-hidden background; grep of packages/renderer-dom/src found zero matches for Tab/tabbable/focus-trap and no background inerting (only overlays/render.ts:83 + icons.ts aria-hidden, both unrelated); e2e/tests/a11y.spec.ts:9-14 scopes axe to .include('.gallerist') and lines 21-24 assert only role/aria-modal/initial focus; e2e/app/index.html:19 background <button id="open"> stays focusable; docs/GALLERIST_SPEC.md:534 mandates "focus trapped" for overlay dialog mode.

---


# 🟠 IMPORTANT

## [6] All publishable packages are at version 0.0.0 and export VERSION = '0.0.0' — blocks a clean v1 publish

- **Dimension:** architecture
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/package.json`, `packages/core/src/index.ts:3`, `packages/renderer-dom/src/index.ts:2`, `packages/react/package.json`

**Description.** Every package.json (core, renderer-dom, react, all plugin-*, theme-default) is `"version": "0.0.0"`, and core/renderer-dom hard-code `export const VERSION = '0.0.0'`. There are no changesets staged (.changeset only has config.json). For a stated v1 npm publish, these must be bumped to 1.0.0 and the hard-coded VERSION constants kept in sync (they will otherwise lie at runtime).

**Impact.** Publishing as-is ships 0.0.0 to npm (or fails the intended 1.0 tag), and the runtime `VERSION` export will report 0.0.0 regardless of the package version, which is a confusing public-API value to freeze.

**Recommended fix.** Stage Changesets to bump all public packages to 1.0.0, and derive the runtime `VERSION` from package.json (e.g. inject at build via tsup `define`/`env`, or generate it) rather than hard-coding, so it can never drift from the published version. Confirm the changeset `fixed`/`linked` groups so core/renderer/react version in lockstep if that's the intent.

**Skeptic reasoning.** I tried to refute this finding but the evidence holds up under direct inspection. Every factual claim checks out:

1. All 11 publishable packages are at "version": "0.0.0" — verified by grepping every packages/*/package.json (core, renderer-dom, react, theme-default, and all six plugin-* packages). None is marked "private", and none has a publishConfig override, so changesets/npm would publish them all as 0.0.0 unless bumped. The changeset config sets "access": "public", confirming intent to publish.

2. The runtime VERSION constants are hard-coded to '0.0.0' in exactly the two cited files: packages/core/src/index.ts:3 and packages/renderer-dom/src/index.ts:2. These are the only two VERSION = constants in any package src. Because they are string literals (not derived from package.json), they will not track the published version and will silently lie at runtime once the package version is bumped — exactly the drift the reviewer warns about.

3. No changesets are staged: .changeset/ contains only config.json. config.json has empty "fixed" and "linked" arrays, so even when changesets are added, core/renderer/react are NOT currently configured to version in lockstep — supporting the reviewer's note to confirm the fixed/linked groups if lockstep is the intent.

The only nuance: this is release-engineering hygiene, not a code-correctness bug, and it is trivially fixable before publish (one changeset run plus deriving VERSION at build). The runtime-lie impact only materializes after a version bump if the constants aren't refactored. That keeps it at "important" (it genuinely blocks a clean, honest v1 publish to npm) rather than "critical". Severity confirmed as claimed.

**Verified evidence.** packages/core/package.json: "version": "0.0.0" (no "private", no publishConfig). packages/react/package.json, packages/renderer-dom/package.json, packages/theme-default/package.json, and all packages/plugin-*/package.json likewise "version": "0.0.0" — verified via grep over packages/*/package.json. packages/core/src/index.ts:3 → export const VERSION = '0.0.0'. packages/renderer-dom/src/index.ts:2 → export const VERSION = '0.0.0' (the only two VERSION= constants in any src). .changeset/ contains only config.json (no staged changesets). .changeset/config.json: "access": "public", "fixed": [], "linked": [].

---

## [7] Public EventMap declares four events that are never emitted (load, loaded, loadError, pan)

- **Dimension:** architecture
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/src/events/events.ts:51-53`, `packages/renderer-dom/src/gestures.ts:190-234`, `packages/core/src/controller/createViewer.ts:138-142`

**Description.** EventMap (the frozen public event taxonomy, spec §18) declares `pan`, `load`, `loaded`, and `loadError`, but a repo-wide grep shows no `emit('load'…)`, `emit('loaded'…)`, `emit('loadError'…)`, or `emit('pan'…)` anywhere in core or renderer-dom. Only `overlayClick`, `fullscreenChange`, `zoom`/`zoomEnd`, the nav events, and lifecycle events are actually emitted. Gestures call `viewer.zoomTo()` during pan (gestures.ts) but never emit `pan`; the image adapter never surfaces load lifecycle events. So `viewer.on('load'|'loaded'|'loadError'|'pan', …)` silently never fires.

**Impact.** Consumers and plugin authors will subscribe to these events (e.g. to drive loading spinners or analytics on `loaded`/`loadError`, or pan-tracking on `pan`) and get nothing, with no error. Because EventMap is a 1.0-frozen contract, you cannot quietly delete these later without a breaking type change — but you also can't leave them as silent no-ops. This is exactly the kind of API wart the review brief flags as costly to change post-1.0.

**Recommended fix.** Before v1, either (a) wire these events at their natural sites — emit `load`/`loaded`/`loadError` from the renderer when the adapter's `ready` promise settles, and emit `pan` from gestures.ts where pan transforms are committed; or (b) remove them from EventMap and the public type until the emit path exists. Do not ship a frozen event map with dead members.

**Skeptic reasoning.** The finding is accurate on every cited point. EventMap declares pan, load, loaded, loadError as public, spec-locked (§18) members, but none are ever emitted anywhere in core or renderer-dom. A repo-wide grep for emit('load'|'loaded'|'loadError'|'pan' returns zero matches; the complete enumeration of .emit( calls confirms only overlayClick, the slide/item nav events, zoom/zoomEnd, open/opened/close/closed, collectionChange, init/destroy, and fullscreenChange are emitted. The pan case in gestures.ts commits via viewer.zoomTo(), which routes through commitZoom() in createViewer.ts emitting only zoom/zoomEnd — never pan. The image adapter builds a `ready` promise (resolves on load/decode, rejects on error/abort) that is the exact natural emit site the proposed fix names, but mount.ts mounts the adapter (rec.media) and never consumes rec.media.ready to emit load/loaded/loadError. Because EventMap and spec §18 are a 1.0-frozen contract (with the {id} / {id;error} payload shapes already typed), consumers can subscribe to these and silently get nothing, and the members cannot be quietly removed post-1.0 without a breaking type change. The reviewer did not misread the code; severity 'important' (API contract correctness defect, not a crash) is correct.

**Verified evidence.** packages/core/src/events/events.ts:51-54 declares pan/load/loaded/loadError in EventMap. grep across packages/ for emit('load'|'loaded'|'loadError'|'pan' = 0 matches. Full .emit( list (overlays/render.ts:74, createViewer.ts:114-274, plugin-fullscreen/index.ts:31) contains none of the four. gestures.ts:185-191 pan case calls viewer.zoomTo() -> createViewer.ts:138-142 commitZoom emits only zoom/zoomEnd. image.ts:38-109 builds and returns a `ready` promise; mount.ts:358 mounts via pickAdapter(...).mount() into rec.media but never reads rec.media.ready to emit. Spec lock: docs/GALLERIST_SPEC.md:554-555 lists "zoom, zoomEnd, pan" and "load, loaded, loadError (per item, with id)" under §18 event taxonomy.

---

## [8] ViewerState exposes three fields that are never written: interaction, fullscreen, loaded

- **Dimension:** architecture
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/src/types.ts:154-166`, `packages/core/src/controller/createViewer.ts:40-47`, `packages/core/src/fsm/fsm.ts:38-42`

**Description.** ViewerState (returned by `getState()`, `subscribe()`, and surfaced via the React `useGallerist().state`) declares `interaction: Interaction`, `fullscreen: boolean`, and `loaded: Record<string, LoadStatus>`. None are ever updated: the FSM defines an `INTERACT` event (fsm.ts:38) but `dispatch` is only ever called with OPEN/OPENED/CLOSE/CLOSED — no `INTERACT` is dispatched anywhere, so `interaction` is permanently `'idle'` even during zoom/pan/drag. `fullscreen` is initialized `false` and never set (the fullscreen plugin only emits an event; it never writes core state). `loaded` is initialized `{}` and never populated. Verified by grepping: the only writes to phase/interaction are in dispatch, and `loaded`/`fullscreen` have no setter.

**Impact.** A consumer reading `state.interaction` to know if the user is zooming, or `state.fullscreen` to render a fullscreen indicator, or `state.loaded[id]` to drive a per-item spinner, gets permanently stale values. These are part of the frozen public state shape — removing them post-1.0 is a breaking change, and leaving them is misleading. `interaction` in particular is documented as a core concept in the project brief and spec §6.

**Recommended fix.** Wire them: dispatch `INTERACT` from the gesture/zoom paths so `interaction` reflects zooming/panning/dragging; have the renderer (or the fullscreen plugin via a setter) reflect fullscreen into state, or drop `fullscreen` from ViewerState and let it live only on the `fullscreenChange` event; populate `loaded` from the adapter ready/error path (this ties to the `load*` events above). If you cannot wire a field for v1, remove it from the public type rather than freeze a dead field.

**Skeptic reasoning.** I tried to refute this but the code fully supports every sub-claim.

1. `interaction` is permanently 'idle'. ViewerState declares it (types.ts:160). The store is seeded 'idle' (createViewer.ts:42). The ONLY path that can change it is `dispatch()` -> `reduceFsm` (createViewer.ts:94-101). The only thing producing a non-'idle' interaction is the `INTERACT` event (fsm.ts:38-41). Grepping the whole repo, `dispatch(...)` is called exactly four times — OPEN, OPENED, CLOSE, CLOSED (createViewer.ts:149,151,157,158) — and `INTERACT` appears ONLY inside fsm.ts and its unit test. No production path (core, renderer-dom gestures, or zoom) ever dispatches INTERACT. `commitZoom` (createViewer.ts:138-142) writes `zoom` but does not dispatch INTERACT, so even zooming leaves interaction 'idle'. Confirmed.

2. `fullscreen` is permanently false. Seeded false (createViewer.ts:46). The only store.set calls in core (createViewer.ts:99,106,139,206) write phase/interaction, cursor, zoom — never `fullscreen`. The fullscreen plugin (plugin-fullscreen/src/index.ts:31) only calls `viewer.emit('fullscreenChange', ...)`; it never writes core state and has no setter. renderer-dom's fullscreenchange handler (mount.ts:610-622) only collapses the rail. So `state.fullscreen` is dead. Confirmed.

3. `loaded` is permanently {}. Seeded {} (createViewer.ts:45). Nothing writes `loaded[...]` or sets `state.loaded` (grep for `loaded[` empty in src). The image adapter only sets a DOM attribute `data-gallerist-loaded` (image.ts:60,90), unrelated to the state map. The `load`/`loaded`/`loadError` events declared in events.ts:52-54 are NEVER emitted from production code (only tests), so even an event-driven path doesn't exist. Confirmed.

Public-surface impact is real: getState()/subscribe() return the full ViewerState, and React's useGallerist exposes `state: Readonly<ViewerState>` verbatim (useGallerist.ts:5,22-23). A consumer reading state.interaction to detect zooming, state.fullscreen for an indicator, or state.loaded[id] for a per-item spinner gets permanently stale values. Since this is a v1-frozen public type, shipping three dead fields is misleading and removing them later is breaking.

Severity 'important' is correct, not 'critical' — nothing crashes or corrupts; it's a misleading frozen public contract. Proposed fix is sound: wire them, or drop fullscreen/loaded from the public type for v1 (fullscreen can live on the event) and either wire interaction from the renderer gesture/zoom paths or document it as renderer-owned (the file comments themselves say the renderer is meant to own interaction/nav coalescing in M3).

**Verified evidence.** types.ts:158-166 (ViewerState declares interaction/loaded/fullscreen); createViewer.ts:40-47 (all three seeded idle/{}/false); createViewer.ts:94-101 (dispatch only writes phase+interaction via reduceFsm); createViewer.ts:149,151,157,158 (dispatch called ONLY with OPEN/OPENED/CLOSE/CLOSED); fsm.ts:38-41 (INTERACT is the only path to non-idle interaction); fsm.ts:17 + fsm.test.ts are the only references to INTERACT — never dispatched in prod; createViewer.ts:99,106,139,206 (the four core store.set calls never touch loaded/fullscreen); plugin-fullscreen/src/index.ts:31 (plugin only emits fullscreenChange, no state write); image.ts:60,90 (only a DOM data-gallerist-loaded attribute, not the state map); events.ts:52-54 load/loaded/loadError events never emitted from src (grep empty); useGallerist.ts:5,22-23 (React surfaces full ViewerState).

---

## [9] renderer-dom depends on @gallerist/core as a hard dependency pinned `workspace:*` — publish/version-range hazard

- **Dimension:** architecture
- **Effective severity:** important  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/package.json`, `packages/react/package.json`

**Description.** renderer-dom lists `@gallerist/core: workspace:*` under `dependencies` (not peerDependencies). With Changesets' default `workspace:*` replacement, on publish this becomes a pinned exact version (e.g. `1.0.0`), not a caret range. The React package correctly uses peerDependencies with `workspace:^` for core/renderer-dom. The asymmetry means a consumer who installs `@gallerist/react` (peer-deps core+renderer) plus their own `@gallerist/core` can end up with renderer-dom pinning one exact core version while react peers a range — risking a duplicate/mismatched `@gallerist/core` instance. Since core holds module-level identity-sensitive state contracts (the viewer handle, event identity), a duplicated core copy breaks `instanceof`-style assumptions and plugin registration.

**Impact.** Duplicate-core installs are a classic monorepo-publish footgun that manifests only post-publish in consumer trees, and changing dependency type/range strategy after 1.0 is itself a semver-sensitive change. A `workspace:*` exact pin also forces lockstep upgrades of renderer-dom whenever core releases a patch.

**Recommended fix.** Decide a single dependency strategy: renderer-dom should depend on core via a caret range (use `workspace:^` so Changesets emits `^1.0.0`), and consider making core a peerDependency of renderer-dom (as it already is for react) so only one core copy is ever resolved. Add an integration test that asserts a single `@gallerist/core` instance across the tree.

**Skeptic reasoning.** The finding's central, load-bearing facts are all verified in the actual files. (1) The asymmetry is real: packages/renderer-dom/package.json:23-25 declares `@gallerist/core: "workspace:*"` under `dependencies`, while EVERY other consumer of core uses peerDependencies with `workspace:^` — all 7 plugins (e.g. plugin-thumbnails, plugin-grid, plugin-download, plugin-video, plugin-fullscreen, plugin-hash, plugin-video-youtube) and react (packages/react/package.json:23-28: `@gallerist/core` and `@gallerist/renderer-dom` both peer'd as `workspace:^`). renderer-dom is the lone outlier on both dimensions (dep type AND range form). (2) The publish-replacement claim is correct and well-established: pnpm/Changesets rewrites `workspace:*` to an exact pin (e.g. `1.0.0`) and `workspace:^` to a caret (`^1.0.0`). The repo uses Changesets (.changeset/config.json present, @changesets/cli in root devDeps) and pnpm@10 — the exact toolchain whose default replacement matches the description. (3) The duplicate-instance scenario is reachable: react imports `mount` from `@gallerist/renderer-dom` at runtime (packages/react/src/Gallerist.tsx:8) while peering both core and renderer-dom; a consumer that installs @gallerist/react + their own @gallerist/core can, after a core patch (1.0.1 satisfying their `^` peer) while a published renderer-dom@1.0.0 still hard-pins exactly `1.0.0`, get two @gallerist/core copies. The lockstep-upgrade concern (exact pin forces renderer-dom republish on every core patch) is also valid.

One claimed IMPACT detail is overstated and I down-weight it but it does not sink the finding: the description says a duplicated core "breaks instanceof-style assumptions and plugin registration" because core "holds module-level identity-sensitive state." I searched core/src and found NO module-level singletons, NO `instanceof` checks, NO `Symbol()` brands; the API is fully closure/instance-based — createViewer returns a per-instance ViewerApi and plugins register per-instance via `use()` (api.ts). So the specific mechanism cited is inaccurate. However, the genuine hazard remains: duplicate-core means duplicated TYPE identity, duplicated event/handler module state, doubled bundle weight, and a real risk that types/values from one copy are passed to functions from the other. That is exactly the classic monorepo-publish footgun, manifesting only post-publish, and the dependency-strategy change is harder to make after 1.0 (semver-sensitive). The proposed fix (use `workspace:^` so Changesets emits `^1.0.0`, and ideally make core a peerDependency of renderer-dom for single-copy resolution, plus an integration test asserting a single core instance) is the right remediation and is consistent with the pattern every other package already follows.

Severity: important is appropriate — it is a publish-time correctness/packaging hazard that should be fixed before v1 is cut (after which the dep-range strategy itself becomes a semver-sensitive change), not merely cosmetic. Not critical because the bug only manifests in certain consumer install permutations and the impact is duplication/version-skew rather than a guaranteed crash, and the overstated instanceof mechanism means worst-case runtime breakage is less certain than claimed.

**Verified evidence.** packages/renderer-dom/package.json:23-25 → "dependencies": { "@gallerist/core": "workspace:*" } (the outlier). packages/react/package.json:23-28 → peerDependencies @gallerist/core "workspace:^" and @gallerist/renderer-dom "workspace:^". All plugins use peerDependencies @gallerist/core "workspace:^" (verified via node script over packages/*/package.json: plugin-download, plugin-fullscreen, plugin-grid, plugin-hash, plugin-thumbnails, plugin-video, plugin-video-youtube). .changeset/config.json present + @changesets/cli ^2.27.10 in root package.json devDeps + packageManager pnpm@10.24.0 (confirms the workspace-protocol replacement toolchain). packages/react/src/Gallerist.tsx:8 imports mount from '@gallerist/renderer-dom' (runtime dep, so renderer-dom IS in the consumer tree under @gallerist/react). Counter-evidence on the overstated impact: grep over packages/core/src for `instanceof`, `Symbol(`, and module-level singleton/registry declarations returned ZERO hits; api.ts shows createViewer returns a per-instance ViewerApi with per-instance plugin registration via use() — so the cited "module-level identity-sensitive state / instanceof" mechanism is not present, though duplicate-core type/event-module duplication and version skew remain real.

---

## [10] Lifecycle events (open/opened, close/closed) fire on no-op transitions — double-open & close-while-closed re-emit

- **Dimension:** core-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → important)
- **Files:** `packages/core/src/controller/createViewer.ts:146-153`, `packages/core/src/controller/createViewer.ts:154-160`, `packages/core/src/controller/createViewer.ts:94-101`

**Description.** `open()` always emits `open` then `opened`, and `close()` always emits `close` then `closed`, regardless of whether the FSM actually transitioned. `dispatch()` returns void, so the controller has no way to know the transition was a no-op and emits unconditionally. Verified against the real build: calling `open()` twice fires `open`x2 and `opened`x2; calling `close()` on a never-opened viewer fires `close`x1 and `closed`x1. The FSM correctly no-ops the phase (reduceFsm returns the same reference), but the events still fire — exactly the 'open/close race / double-fire' class the FSM exists to prevent (spec §6).

**Impact.** Handlers wired to lifecycle events double-run: focus-trap setup/teardown, body scroll-lock, analytics 'lightbox_opened', history pushState, and the M3 renderer's open/close CSS transition driver. A stray `close()` on an already-closed viewer will run teardown logic against nothing (e.g. restoring scroll position twice, popping history). This is a correctness footgun that ships into every consumer and is costly to change post-1.0 once handlers depend on the current (buggy) firing.

**Recommended fix.** Make `dispatch()` return whether a transition occurred (e.g. return `next !== prev`) and gate the event emits on it. For `open()`: only emit `open`/`opened` when OPEN actually moved the phase out of open/opening; for `close()`: only emit `close`/`closed` when CLOSE actually fired. Add tests: `open();open()` emits once; `close()` on a closed viewer emits nothing.

**Skeptic reasoning.** I personally traced the cited code and the finding holds exactly as described.

DOUBLE-OPEN: open() (createViewer.ts:146-153) unconditionally calls emitter.emit('open') at L150 and emitter.emit('opened') at L152, sandwiched around dispatch(OPEN)/dispatch(OPENED). On a second open() when phase is already 'open', reduceFsm (fsm.ts:23-30) returns the SAME state reference for both OPEN (L28, only transitions from 'closed'/'closing') and OPENED (L30, only transitions from 'opening'). dispatch (L94-101) returns void and only guards the store.set with `if (next !== prev)`, so the store is correctly not mutated — but the two emits fire regardless. Result: open x2, opened x2 on a no-op. Confirmed.

CLOSE-WHILE-CLOSED: close() (L154-160) emits 'close' at L156 BEFORE any dispatch, then dispatch(CLOSE)/dispatch(CLOSED) both no-op via fsm.ts:34 (CLOSE only from 'open'/'opening') and fsm.ts:37 (CLOSED only from 'closing'), then emits 'closed' at L159. On a never-opened viewer this fires close x1 + closed x1 with zero state change. Confirmed.

dispatch returns void (L94), so the controller genuinely cannot gate the emits — the proposed fix (return next !== prev, gate emits on it) is the right shape. Spec §6 (line 203: "Transitions emit events") supports that events should be tied to real transitions, and the existing tests (createViewer.test.ts:21-47) only cover single-open and open-then-close happy paths, so there is no coverage protecting double-fire.

IMPACT — I confirm the bug but temper the severity. The claimed concrete downstream handlers (focus-trap, scroll-lock, analytics, history pushState, M3 transition driver) do not exist in the core today — the M3 renderer is explicitly described as future (createViewer.ts:1-4, "renderer overrides in M3"). So this is a latent footgun in the public event contract rather than a currently-observable broken behavior in shipped code. It is a real correctness defect in a v1 public API that consumers WILL wire idempotency-sensitive handlers to, and it's cheap to fix now / costly to change post-1.0 — but with no current in-repo consumer double-running and no data-corruption/crash, it does not meet the bar of a critical (release-blocking, actively-breaking) defect. It is a solid 'important' API-correctness fix to land before 1.0.

**Verified evidence.** packages/core/src/controller/createViewer.ts:146-153 (open: emits 'open' L150 and 'opened' L152 unconditionally around dispatch); :154-160 (close: emits 'close' L156 before dispatch, 'closed' L159 after, both unconditional); :94-101 (dispatch returns void, guards only store.set with `if (next !== prev)`, gives controller no transition signal). fsm.ts:21-43 confirms no-op transitions return the same `state` reference: OPEN L25-28 only from closed/closing, OPENED L30 only from opening, CLOSE L32-34 only from open/opening, CLOSED L37 only from closing. createViewer.test.ts:21-47 covers only single open() and open()+close(); no double-open / close-while-closed test exists. GALLERIST_SPEC.md:203 "Transitions emit events (§18)" implies events are tied to real transitions.

---

## [11] Zoom is never reset on group/item navigation — spec default (keepZoomOnNav:false) not implemented; option is dead

- **Dimension:** core-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/src/controller/createViewer.ts:110-118`, `packages/core/src/controller/createViewer.ts:120-128`, `packages/core/src/api.ts:26`, `docs/GALLERIST_SPEC.md:200`

**Description.** Spec §6/§8.1 lock: 'Zoom is reset on group change unless keepZoomOnNav' with default false. The controller's `groupNav`/`itemNav` only mutate the cursor and emit events; they never touch `zoom`. The `keepZoomOnNav` option is accepted in `ViewerOptions` (api.ts:26) but is read nowhere in the controller (grep confirms only the type decl and docs). Verified: zoom in to {scale:3,x:50,y:50}, call `next()`, the committed zoom stays {scale:3,x:50,y:50}.

**Impact.** A user zoomed/panned into the corner of one image navigates to the next group and lands pre-zoomed and pan-clamped to a meaningless region of a differently-sized image — a visible UX break and the exact behavior the spec deliberately defaults off. Shipping a documented option (`keepZoomOnNav`) that is silently inert is an API correctness defect that locks in wrong behavior at 1.0.

**Recommended fix.** In `groupNav` (and per spec wording 'group change', at minimum group-axis), reset committed zoom to IDENTITY_ZOOM after a successful cursor change unless `options.keepZoomOnNav`. If lifecycle/zoom reset is intentionally deferred to the M3 renderer, document that clearly and remove or mark the option experimental so it isn't a published no-op. Add a test asserting zoom resets on `next()`/`prev()` by default and persists when keepZoomOnNav is true.

**Skeptic reasoning.** The finding holds on every verifiable claim. (1) Spec lock confirmed: GALLERIST_SPEC.md:200 states "Zoom is reset on group change unless keepZoomOnNav (per-axis configurable)" with default false (GALLERIST_SPEC.md:254,:567; IMPLEMENTATION.md:161). (2) The controller never resets zoom on nav: groupNav (createViewer.ts:110-118) and itemNav (120-128) only validate the cursor, emit before/after events, and call setCursor; setCursor (103-108) mutates ONLY the cursor field. Zoom is mutated solely by commitZoom/zoomTo/resetZoom (138-142,180-188) and the setCollection same-item branch (209). So next()/prev()/nextItem()/prevItem() leave committed zoom untouched — matching the reviewer's repro. (3) The option is genuinely inert: createViewer reads only options.loop, options.itemMemory, options.startAt, options.on, options.plugins; a repo-wide grep finds keepZoomOnNav ONLY in api.ts:26 (type decl), the spec/impl docs, and the React example UI. It is referenced in zero core or renderer logic files. (4) The "deferred to M3 renderer" defense (controller header, lines 1-4) fails: renderer-dom (M3) is already built (mount.ts) and the only resetZoom() callers there are the manual reset button (mount.ts:277) and the '0' key (mount.ts:584) — no slide/item/afterSlide/afterItem subscription resets zoom. The behavior is missing at every ring. Severity stays "important", not "critical": it is a real, user-visible UX break and a published no-op option, but it is a single bounded behavioral gap with a clear fix, not a crash/data-loss/safety issue. Aggravating factor confirming importance: examples/react/main.tsx:127,340,508 surfaces keepZoomOnNav as a live checkbox passed into the viewer, so v1 ships an advertised toggle that silently does nothing.

**Verified evidence.** packages/core/src/controller/createViewer.ts:110-118 (groupNav touches cursor+events only); :120-128 (itemNav same); :103-108 (setCursor mutates only cursor); :23-47 (options.keepZoomOnNav never destructured/read); :185-188 (resetZoom is the only identity-zoom path besides setCollection:209). docs/GALLERIST_SPEC.md:200 (reset-on-group-change lock), :254 & :567 (default false). grep keepZoomOnNav: hits only api.ts:26, docs, examples/react/main.tsx:127,180,340,486,508,543,576 — none in packages/core/src/controller or packages/renderer-dom/src logic. renderer-dom resetZoom callers: packages/renderer-dom/src/mount.ts:277 (reset button) and :584 ('0' key) only — no nav-event-driven reset.

---

## [12] <Gallerist.Overlay>/<Gallerist.Region> re-register their plugin on every parent render due to object/array props in the effect deps

- **Dimension:** cross-cutting
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/react/src/Gallerist.tsx:128`, `packages/react/src/Gallerist.tsx:145`, `packages/react/src/Gallerist.tsx:161`, `packages/core/src/controller/createViewer.ts:71`, `packages/core/src/controller/createViewer.ts:79`, `packages/renderer-dom/src/mount.ts:648`, `packages/renderer-dom/src/mount.ts:657`, `examples/react/main.tsx:524`

**Description.** The Overlay effect dependency array (Gallerist.tsx:145) includes `props.anchor`, `props.visibleAt`, and other props that are typically passed as inline object/array literals — a fresh reference on every render. The shipped example does exactly this: `anchor={{ kind: 'viewport', at: 'bottom', offset: [0, -84] }}` (main.tsx:524) allocates a new object (and a new `offset` array) each render. Each new reference re-runs the effect: it disposes the previous overlay plugin and registers a new one. Both `registerPlugin` and its disposer call `notifyPlugins()` (createViewer.ts:71, 79), which fires `onPluginsChanged -> mountRegions()` (mount.ts:648). mountRegions forces `cur.overlayItemId = undefined` (mount.ts:657) and re-runs `renderWindow()`, fully rebuilding overlay DOM and re-invoking user render(). So a single unrelated parent state change triggers two full overlay repaints.

**Impact.** Every parent re-render (e.g. the example's option panel, or any app-level state) thrashes plugin registration and forces full overlay teardown/repaint, defeating the §9.2 'no rebuild on zoom/no extra layout' guarantee and creating jank proportional to overlay count.

**Recommended fix.** Stabilize the registration: register the overlay/region plugin once per mount and update its spec imperatively, or shallow-compare anchor/visibleAt inside the effect, or document that consumers MUST memoize `anchor`/`visibleAt`. Also gate mountRegions so an identical plugin set does not force `overlayItemId = undefined`.

---

## [13] Controlled open + onClose binding guarantees onClose fires twice and re-runs the close path on every dismissal

- **Dimension:** cross-cutting
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/react/src/Gallerist.tsx:96`, `packages/react/src/Gallerist.tsx:102`, `packages/core/src/controller/createViewer.ts:154`, `examples/react/main.tsx:509`, `examples/react/main.tsx:510`

**Description.** The documented controlled pattern (and the example) wires `open={open}` with `onClose={() => setOpen(false)}` (main.tsx:509-510). When the user closes via Escape/backdrop, `viewer.close()` emits `close` then `closed`; the `closed` handler (Gallerist.tsx:102-105) calls `onClose()` -> `setOpen(false)`. The `open` effect (Gallerist.tsx:96-100) then re-runs with `open===false` and calls `viewer.close()` a SECOND time. Because core's close() has no phase guard (createViewer.ts:154-160, the existing 'close-while-closed re-emits' finding), this second call re-emits `close`/`closed`, firing `onClose()` again. So the standard React controlled binding turns the core edge case into a guaranteed double `onClose` on every close.

**Impact.** User onClose handlers run twice per dismissal (double analytics events, double cleanup, potential double-navigation in apps that route on close). Masks the core no-op-transition bug behind a 'works but fires twice' symptom that is hard to diagnose at the app layer.

**Recommended fix.** Fix the root cause by guarding lifecycle emits on actual phase transitions in core (close() should early-return / not emit when already closed). Independently, the React `open` effect can skip calling close() when the viewer is already in phase 'closed'.

---

## [14] loop=false is hardcoded in plugin-thumbnails and plugin-grid windowing too, not only the renderer

- **Dimension:** cross-cutting
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/plugin-thumbnails/src/index.ts:563`, `packages/plugin-thumbnails/src/index.ts:571`, `packages/plugin-grid/src/index.ts:72`, `packages/core/src/controller/createViewer.ts:24`

**Description.** The known critical bug (renderer slide window passes loop=false while core defaults loop=true) is also present, independently, in the thumbnail rail (windowIndices at index.ts:563 flat-mode and :571 stacked-mode, both pass `false`) and the grid (index.ts:72 passes `false`). Core's loop default is true (createViewer.ts:24). None of these plugins receive the viewer's loop option, so when navigation wraps from the last group to the first, the thumbnail rail window and the grid window will not include the wrap-adjacent neighbors, producing missing/empty rail entries at the seam.

**Impact.** With looping enabled (the default), wrapping at the collection boundary leaves the thumbnail rail and grid windowing visually inconsistent with the stage (rail won't pre-mount the wrapped neighbor; active item can scroll to an edge with no neighbor). Fixing only the renderer (as the existing finding scopes it) leaves the rails/grid wrong.

**Recommended fix.** Thread the viewer's `loop` option into thumbnails() and grid() windowing (read it from the viewer or accept it as an option) and pass it to windowIndices, so all virtualization windows agree on wrap behavior.

---

## [15] Wheel zoom commits to the store synchronously on every wheel tick (no RAF), fanning out a full re-render per event

- **Dimension:** performance
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/gestures.ts:217-228`, `packages/core/src/controller/createViewer.ts:138-142`, `packages/renderer-dom/src/mount.ts:528-538`

**Description.** onWheel calls viewer.zoomTo(...) synchronously for every wheel event. Unlike onMove (pan/pinch), which coalesces writes through schedule()/RAF and never touches the store mid-gesture (decision P0-E), the wheel path goes straight to commitZoom → store.set on every tick. A trackpad/mouse-wheel emits dozens of events per second, and each one triggers: (a) the renderer's sync() → renderWindow() full-window pass, (b) updateChrome (gated, cheap), (c) plugin-thumbnails render() and plugin-grid render() subscription callbacks, (d) any React useGallerist component re-render via useSyncExternalStore, and (e) two emitter.emit calls ('zoom' and 'zoomEnd') each allocating a spread payload object plus an Array snapshot of the handler set. zoomEnd also firing on every intermediate wheel tick is semantically wrong (the zoom hasn't ended) and doubles the emit cost.

**Impact.** Wheel/trackpad zoom is the one continuous interaction routed through the store instead of imperative RAF. On a gallery with the React adapter or multiple plugins subscribed, every wheel tick does O(window) renderWindow work plus full subscriber fan-out plus 2 payload allocations, with no per-frame throttle. This is the most likely place to drop below 60fps during interactive zoom.

**Recommended fix.** Mirror the onMove approach: accumulate the target scale/focal and apply it imperatively to content.style.transform inside the existing RAF schedule(), committing to the store only on a debounced wheel-end (e.g. a trailing timeout). At minimum, RAF-coalesce so at most one zoomTo per frame. Separately, in commitZoom stop emitting 'zoomEnd' on every commit — emit 'zoom' continuously and 'zoomEnd' only on settle — to halve emit allocations and fix the event semantics.

**Skeptic reasoning.** Every mechanical claim in the finding is verified against the cited code.

(1) Wheel commits synchronously with no coalescing. gestures.ts onWheel (217-228) calls viewer.zoomTo(...) directly on line 227 for every wheel event. There is no RAF, throttle, or debounce on this path — the only `raf`/`schedule()` machinery in the file (lines 96-105) is wired exclusively into the pointer gesture path (used at 145/157/162), not wheel. Confirmed by grep: the only raf references are the gesture schedule and the option default.

(2) The asymmetry with onMove is real. onMove (135-165) honors decision P0-E: pan/pinch only mutate content.style.transform inside RAF schedule() and never write the store; the store is written once on release in onUp (190/194/202). The wheel path bypasses this entirely.

(3) zoomTo → commitZoom (createViewer.ts 138-142) does store.set + emit('zoom') + emit('zoomEnd') on every call. store.set (store.ts 20-26) synchronously iterates [...subs] (an allocated snapshot) and invokes every subscriber. The renderer subscribes sync (mount.ts:664), and sync (528-538) calls renderWindow() whenever attached. renderWindow (320+) always allocates idxs.map/wantKeys/reconcileKeys (327-329) and, for a zoom-only change, still iterates the whole mounted window applying transforms/overlay updates (346-409, applyTransform at 379, updateOverlays at 401). plugin-thumbnails (index.ts:627) and plugin-grid (index.ts:134) both viewer.subscribe and thus re-render on every tick too.

(4) Emit cost: both emit('zoom') and emit('zoomEnd') allocate a spread payload `{ ...basePayload(), zoom: z }` (140-141) and each emit snapshots [...set] (events.ts:94). So 2 payload allocations + 2 set snapshots per tick.

(5) zoomEnd semantics: the spec (GALLERIST_SPEC.md:554) lists `zoom, zoomEnd` as distinct events, paralleling the slide/afterSlide and beforeItem/item/afterItem terminal-event convention. Firing zoomEnd on every intermediate commit collapses that distinction — a genuine semantic bug, not just a perf one.

This is the one continuous interaction routed through the store rather than imperative RAF, on the hot 60fps path, with full subscriber fan-out per tick. Severity 'important' stands. The proposed fix (RAF-coalesce wheel into the existing schedule(), commit to store on a trailing wheel-end timeout, and only emit zoomEnd on settle) is the correct shape. Not raised to critical because it degrades smoothness rather than causing incorrectness/crash, and wheel ticks are typically capped well below pointermove frequency, but it is squarely the most likely interactive frame-drop source described.

**Verified evidence.** packages/renderer-dom/src/gestures.ts:217-228 (onWheel calls viewer.zoomTo on 227, no raf/throttle); contrast onMove pan/pinch using schedule()/RAF at gestures.ts:96-105,145,157,162 with store writes only on release at gestures.ts:190,194,202. packages/core/src/controller/createViewer.ts:138-142 (commitZoom: store.set + emit('zoom') + emit('zoomEnd'), each emit allocates a spread payload). packages/core/src/store/store.ts:20-26 (set() synchronously iterates [...subs] and notifies every subscriber). packages/renderer-dom/src/mount.ts:664 (viewer.subscribe(sync)) → mount.ts:528-538 (sync calls renderWindow when attached) → mount.ts:320-409 (renderWindow allocates wantKeys/reconcileKeys at 328-329 and walks the mounted window, applyTransform at 379, updateOverlays at 401, on every call). packages/plugin-thumbnails/src/index.ts:627 and packages/plugin-grid/src/index.ts:134 (both viewer.subscribe → re-render per tick). packages/core/src/events/events.ts:94 ([...set] snapshot per emit). docs/GALLERIST_SPEC.md:554 (zoom, zoomEnd listed as distinct events, confirming zoomEnd-per-tick is semantically wrong). grep confirmed no setTimeout/throttle/debounce/wheelEnd anywhere on the wheel path.

---

## [16] renderWindow re-runs windowIndices + reconcileKeys allocations on every store commit, including zoom/pan where the window is unchanged

- **Dimension:** performance
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/mount.ts:320-335`, `packages/renderer-dom/src/mount.ts:528-538`, `packages/core/src/windowing.ts:6-42`

**Description.** sync() calls renderWindow() on every subscription notification with no cursor/collection gate (updateChrome right next to it IS gated at line 467, renderWindow is not). On each call renderWindow allocates: windowIndices → an out[] array plus a new Set plus a spread copy (windowing.ts:24); wantKeys via .map; [...mounted.keys()] spread; reconcileKeys → 2 Sets + 3 filtered arrays (windowing.ts:34-41). On a zoom or pan commit the cursor hasn't moved so enter/exit are empty and no DOM changes, but all of these arrays/Sets are still allocated and the full mounted-window loop still runs (groupIndex Map lookup + applyTransform per slide) every commit. With wheel zoom firing per tick (finding above), this is per-frame GC pressure.

**Impact.** Avoidable per-commit allocations (roughly 6+ short-lived arrays/Sets) and an O(window) loop on every zoom/pan commit, feeding GC pressure during continuous zoom and adding constant overhead to a path that should be near-free when only the transform changed.

**Recommended fix.** Split the work: on a zoom-only commit (cursor + collection unchanged) skip windowIndices/reconcileKeys entirely and only re-apply the transform + updateOverlays for the current slide. Cache lastCursor.g/lastCol and early-out of the window-diff portion when neither changed, the way updateChrome already does.

**Skeptic reasoning.** I attempted to refute this finding but the cited code fully supports it on every point.

1. sync() calls renderWindow() with no gate. mount.ts:528-538: sync() runs renderWindow() then updateChrome() whenever attached. updateChrome (mount.ts:464-467) early-returns when `col === chromeCol && cur.g === chromeG && cur.i === chromeI`; renderWindow (mount.ts:320-412) has NO such early-out — it always runs windowIndices + reconcileKeys regardless of whether the cursor/collection moved. The finding's central asymmetry claim is literally true.

2. Zoom commits notify this subscriber. mount.ts:664 wires `viewer.subscribe(sync)` with no rAF/throttle. createViewer.ts:138-139 commitZoom() calls `store.set(...)`, and store.ts:20-26 notifies every subscriber on any non-Object.is state change. So a zoom commit reaches sync() → renderWindow().

3. Wheel zoom commits per tick. gestures.ts:217-228 onWheel calls viewer.zoomTo() directly on each wheel event (no rAF coalescing on the wheel path), so continuous wheel zoom does fire renderWindow() per tick — the per-frame GC-pressure premise holds for the wheel case.

4. The allocations are real. Per renderWindow call on a zoom-only commit: windowing.ts:14+24 (out[] array + new Set + spread copy), mount.ts:328 (idxs.map → wantKeys), mount.ts:329 ([...mounted.keys()] spread + reconcileKeys at windowing.ts:35-41 = 2 Sets + 3 filtered arrays). ~6 arrays + 3 Sets allocated, plus the full `for (const [k,rec] of mounted)` loop (mount.ts:346-411) runs groupIndex() Map lookup + applyTransform per slide, even though enter/exit are empty so no DOM is mutated.

5. The proposed fix is sound and matches an established in-repo pattern. The thumbnails plugin already does exactly this gate (index.ts:555: `if (col === lastCol && cur.g === lastG && cur.i === lastI) return // skip zoom/pan/etc.`) and has a dedicated test for it (index.test.ts:133: "changes zoom state, not cursor/collection → render must early-return"). On a zoom-only commit the only work in renderWindow's loop that is NOT a no-op is applyTransform (mount.ts:379) and updateOverlays (mount.ts:401) for the current slide — exactly what the proposed fix preserves. Media activation, tagAxis, and data-gallerist-current writes are all no-ops when the cursor is unchanged, so skipping the window-diff is behaviorally safe.

Why important and not critical: it is not a correctness bug, and at the default preload window {ahead:2, behind:1} the loop is only ~4 slides, so the per-tick cost is ~9 short-lived objects and a 4-iteration loop — modest, transient (only during active wheel zoom), and the existing gating pattern makes the fix low-risk. It is a genuine, avoidable hot-path inefficiency on a path that should be near-free, with a clear precedent fix already in the codebase, so "important" is fair; I do not downgrade to suggestion because the renderer is the only ring that writes DOM and the project explicitly targets 60fps at thousands of items where the window can be larger.

One minor correction to the finding's wording: continuous PAN/pinch drag does NOT hit this path — gestures.ts:135-163/schedule() applies the transform directly to the DOM via rAF during the drag and only commits to the store once on pointer-up (gestures.ts:190,194). So the per-commit churn applies to wheel zoom (per tick) and to the single commit at the end of a pan/pinch, not to every pan move. This does not weaken the finding; the wheel case alone substantiates the per-frame GC-pressure concern.

**Verified evidence.** mount.ts:528-538 (sync runs renderWindow ungated); mount.ts:464-467 (updateChrome IS gated, the asymmetry); mount.ts:320-412 (renderWindow has no cursor/collection early-out); mount.ts:327-329 + windowing.ts:14,24,35-41 (per-call array/Set allocations); mount.ts:346-411 + mount.ts:293-299 (O(window) loop with groupIndex Map lookup + applyTransform every commit); mount.ts:664 (subscribe(sync) with no throttle); store.ts:20-26 (set notifies all subscribers on any change); createViewer.ts:138-139 (commitZoom → store.set); gestures.ts:217-228 (wheel commits zoom per tick); gestures.ts:135-163,190,194 (pan/pinch drag bypasses store, commits only on pointer-up — corrects the finding's pan claim); plugin-thumbnails/src/index.ts:555 and index.test.ts:133 (established gate-on-cursor pattern + test the proposed fix mirrors)

---

## [17] core state.fullscreen is never updated — permanently false; fullscreen plugin only emits an event

- **Dimension:** plugins-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/src/types.ts:165`, `packages/core/src/controller/createViewer.ts:46`, `packages/plugin-fullscreen/src/index.ts:31`

**Description.** ViewerState declares `fullscreen: boolean` and createViewer initializes it to false. Grepping the entire core + renderer shows nothing ever sets it to true — the only writer-shaped reference is the initializer. The fullscreen plugin emits the 'fullscreenChange' event but never calls into the store, so any consumer reading viewer.getState().fullscreen (the natural, documented place to read it) always sees false even while fullscreened. This is a public-API contract field that lies.

**Impact.** API wart in v1 state shape: a documented state field is dead/misleading, and it's costly to change semantics post-1.0. Subscribers can't reactively read fullscreen state; they must separately wire the event.

**Recommended fix.** Either (a) have the fullscreen plugin update the store on fullscreenchange (needs a core setter or a sanctioned store API), making state.fullscreen authoritative, or (b) if fullscreen is deliberately event-only, remove the field from ViewerState before 1.0 to avoid shipping a permanently-false property. Pick one and make it consistent with the renderer's own fullscreen tracking.

**Skeptic reasoning.** Verified the finding directly. ViewerState.fullscreen is a public, spec-documented state field (types.ts:165; GALLERIST_SPEC.md:233 "Canonical state slice" that adapters bind to via useSyncExternalStore/Vue/Svelte). It is initialized to false (createViewer.ts:46) and NEVER written again: a grep across packages/core/src, packages/renderer-dom/src, packages/react/src and all of packages/ shows the only state-field references are the declaration and the initializer. Every store.set in createViewer.ts (lines 99, 106, 139, 206-210) updates only phase/interaction/cursor/zoom — none touch fullscreen. The fullscreen plugin (plugin-fullscreen/src/index.ts:31) only emits 'fullscreenChange' and has no store API to call. Notably the DOM renderer, the one internal consumer that cares about fullscreen, deliberately bypasses the store and reads document.fullscreenElement directly (mount.ts:609-622) — corroborating that state.fullscreen is dead. So viewer.getState().fullscreen always returns false even while fullscreened, making a documented contract field misleading and unreadable for reactive subscribers. Severity is correctly 'important', not 'critical': nothing crashes, fullscreen still works visually, and the event is a functional (if undocumented-as-required) workaround. But it is a 1.0 state-shape contract wart that is breaking to fix later. The proposed fix (make plugin authoritative via a sanctioned setter, or drop the field pre-1.0) is correct.

**Verified evidence.** packages/core/src/types.ts:165 declares `fullscreen: boolean`. packages/core/src/controller/createViewer.ts:46 sets `fullscreen: false` in the initial store; no other store.set (lines 99,106,139,206-210) ever spreads fullscreen. packages/plugin-fullscreen/src/index.ts:31 `const onChange = () => viewer.emit('fullscreenChange', { viewer, fullscreen: isFs() })` — emit only, no store write. docs/GALLERIST_SPEC.md:233 lists `fullscreen: boolean;` in the canonical ViewerState that adapters bind to. packages/renderer-dom/src/mount.ts:609-622 tracks fullscreen via `document.fullscreenElement` directly, never reading viewer.getState().fullscreen. Grep for `.fullscreen`/`fullscreen:` across packages returns only the declaration, initializer, event payload, and the plugin emit — confirming no writer of the state field exists.

---

## [18] plugin-download: blob object URL revoked synchronously right after click (download-cancel race)

- **Dimension:** plugins-correctness
- **Effective severity:** important  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/plugin-download/src/index.ts:102-105`, `packages/plugin-download/src/index.ts:52-62`

**Description.** For the zip path, the code creates `objectUrl = URL.createObjectURL(blob)`, calls anchorDownload (which appends an <a download>, clicks it, removes it), then immediately `URL.revokeObjectURL(objectUrl)` on the next synchronous line. The browser's download of a blob: URL is asynchronous; revoking in the same microtask/task can race with the download starting and abort it in some browsers (notably older Firefox, and intermittently elsewhere). The blob lifecycle is otherwise correct (created, anchored, revoked) — the only issue is timing.

**Impact.** Bulk-zip downloads can intermittently fail to save (empty/cancelled download) depending on browser; hard-to-reproduce field bug.

**Recommended fix.** Defer the revoke: `setTimeout(() => URL.revokeObjectURL(objectUrl), 0)` (or longer, e.g. a few seconds), or revoke on the anchor's load/click completion. Keep the create/revoke pairing so it still frees memory.

**Skeptic reasoning.** The cited code is exactly as described. In packages/plugin-download/src/index.ts the zip path (lines 102-105) does: `const objectUrl = URL.createObjectURL(blob); anchorDownload(objectUrl, ...); URL.revokeObjectURL(objectUrl)`. `anchorDownload` (lines 52-62) is fully synchronous — it appends an <a download>, calls a.click(), and removes the anchor, all in the same task with no completion callback. a.click() on a blob:/download anchor only schedules the download; the browser reads the blob URL asynchronously after the handler returns. Revoking the object URL on the immediately-following synchronous line therefore races with the download actually starting and can abort it (a well-documented blob-URL pitfall; FileSaver.js and MDN both defer revocation). I confirmed via grep that revokeObjectURL appears only at line 105 with no setTimeout/rAF/load-event deferral anywhere, so the race is real and not mitigated elsewhere. Scope is correctly limited to the zip path: the single-item path (downloadItem -> anchorDownload) uses the original http(s) URL and creates no object URL, so it is unaffected. The proposed fix (defer the revoke, e.g. setTimeout(() => URL.revokeObjectURL(objectUrl), 0) or a few seconds) is correct and standard. Severity stays 'important': it only affects the bulk-zip feature and is intermittent/browser-dependent, but when it fires the download silently fails with no error surfaced to the user — a hard-to-diagnose field bug. The trivial, low-risk fix further supports landing it before v1.

**Verified evidence.** packages/plugin-download/src/index.ts:102-105 — objectUrl created, passed to anchorDownload, then URL.revokeObjectURL(objectUrl) on the next synchronous line. packages/plugin-download/src/index.ts:52-62 — anchorDownload is synchronous (createElement, appendChild, a.click(), a.remove()) with no load/completion callback. grep confirms revokeObjectURL occurs only at src/index.ts:105 (plus a vi.fn mock at src/index.test.ts:92); no setTimeout/requestAnimationFrame deferral exists. Single-file path downloadItem (lines 64-67) uses the remote url, never an object URL, so it is not affected.

---

## [19] plugin-fullscreen: targets the first .gallerist in the document — wrong element with multiple viewers

- **Dimension:** plugins-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/plugin-fullscreen/src/index.ts:14-17`

**Description.** root() does `document.querySelector('.gallerist')` (default) which returns the FIRST .gallerist element on the page, not the viewer this plugin instance is bound to. The plugin receives `viewer` but never uses it to locate its own root. With two viewers on one page (a documented, supported scenario — getPlugins/regions are per-viewer), pressing 'f' or clicking the button in the second viewer fullscreens the first viewer's root. The opts.target escape hatch also resolves globally.

**Impact.** Wrong element fullscreened in multi-viewer pages; state desync between the fullscreened element and the viewer that triggered it.

**Recommended fix.** Resolve the root relative to the bound viewer rather than globally. Either expose the renderer root via the viewer (e.g. a viewer.root() accessor or a region-host reference captured at init) and prefer it, or at minimum scope opts.target lookups within the viewer's known container. Falling back to document.querySelector is fine only for the single-viewer case.

**Skeptic reasoning.** The finding is accurate. plugin-fullscreen/src/index.ts:14-17 resolves the fullscreen target via global document queries in BOTH branches: `opts.target ? document.querySelector(opts.target) : document.querySelector('.gallerist')`. document.querySelector returns the FIRST matching element in document order, not the viewer this instance is bound to. The `.gallerist` root created at renderer-dom/src/mount.ts:186 carries only the bare `gallerist` class with no per-instance identifier, so every viewer's root matches the same selector. The plugin factory does receive `viewer` (plugins/types.ts:35 `Plugin = (viewer: ViewerApi) => PluginInstance`) and closes over it, but never uses it to locate its root — and ViewerApi (api.ts:32-62) exposes no root()/host accessor, so today there is no clean per-viewer handle, which is exactly why the global query was used and why the proposed fix (add an accessor, or scope via DOM traversal) is the correct remedy.

Multi-viewer is a genuine supported scenario: plugins, regions, and keymaps are all registered per-viewer instance, and inline mode appends each root into its own container (mount.ts:523), so two galleries on one page is ordinary usage. The fullscreen button is appended into its own viewer's toolbar host (regions.ts:31), which is a descendant of that viewer's own root (mount.ts:220) — so a `btn.closest('.gallerist')` fix is viable and proves the correct root is reachable while the code ignores it.

Impact: with two viewers, pressing `f` or clicking the button in the second viewer fullscreens the FIRST viewer's root. The keymap trigger itself is correctly per-viewer, but the target resolution is global, so the wrong element is fullscreened. This also produces the claimed state desync: onChange emits `fullscreenChange` with `viewer` set to the triggering viewer (index.ts:31) while document.fullscreenElement is a different viewer's root. opts.target has the same global-resolution flaw.

Not critical: it degrades gracefully to correct behavior in the common single-viewer case (the only case the tests at index.test.ts:43-69 exercise — they pass precisely because there's just one .gallerist, leaving the bug latent). It requires multiple viewers to manifest. "important" is the right level.

**Verified evidence.** packages/plugin-fullscreen/src/index.ts:14-17 — `const root = () => (opts.target ? document.querySelector(opts.target) : document.querySelector('.gallerist')) as HTMLElement | null` (both branches query the whole document). index.ts:13 closes over `viewer` but never uses it for root resolution; index.ts:31 emits fullscreenChange with the triggering viewer. packages/renderer-dom/src/mount.ts:186 `const root = el('div', 'gallerist')` — no per-instance id. mount.ts:220 appends region hosts into that root; packages/renderer-dom/src/regions.ts:31 `host.appendChild(render(ctx))` mounts the toolbar button into the bound viewer's own host. packages/core/src/api.ts:32-62 ViewerApi has no root()/host accessor. packages/core/src/plugins/types.ts:11-13,35 RegionCtx/Plugin carry only `viewer`, no DOM handle. packages/plugin-fullscreen/src/index.test.ts:21-78 only ever mounts a single viewer, so the bug is untested and latent.

---

## [20] plugin-hash: every navigation writes location.hash, polluting browser history

- **Dimension:** plugins-correctness
- **Effective severity:** important  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/plugin-hash/src/index.ts:47-55`, `packages/plugin-hash/src/index.ts:66-69`

**Description.** writeHash assigns `window.location.hash = lastWritten` on every 'slide', 'item', and 'opened' event. Assigning location.hash pushes a NEW history entry each time. Browsing through a gallery of N items therefore creates N history entries, so the user must press Back N times to leave the lightbox / return to the previous page. The spec wants 'back/forward nav, shareable URLs' (GALLERIST_SPEC §16 / line 487), which is reasonable for entering/leaving the viewer but is hostile when applied to every intra-gallery move.

**Impact.** Back-button trap — a well-known UX/a11y anti-pattern. Costly to change semantics after 1.0 once people depend on the current behavior.

**Recommended fix.** Use `history.replaceState(null, '', '#' + lastWritten)` for intra-session cursor moves so the URL stays shareable without stacking history, and reserve a pushState (or the initial open) for the enter/leave boundary. Optionally expose an option to choose push vs replace. Also keep the lastWritten-echo guard, which already works correctly. Consider clearing/updating the hash on 'closed' so a closed viewer doesn't leave a stale deep link that auto-reopens on reload.

**Skeptic reasoning.** The technical core of the finding is correct and verified against the actual source. `writeHash` assigns `window.location.hash = lastWritten` unconditionally (index.ts:54) and is subscribed to the 'slide', 'item', and 'opened' events (index.ts:67-69), so it fires on every intra-gallery navigation. Assigning a changed location.hash pushes a NEW session-history entry (standard, unchanged WHATWG/browser behavior), so traversing N items stacks N history entries and produces the well-known back-button trap: the user must press Back N times to leave the viewer. The lastWritten echo guard (index.ts:58) only suppresses the resulting hashchange feedback loop; it does nothing to prevent the new history entry. The proposed fix (history.replaceState for intra-session cursor moves, reserving push/the initial entry for the enter/leave boundary) is the standard, correct remedy and preserves shareable URLs.

Three points reinforce that this is real and not a misread: (1) the test suite only asserts the hash VALUE (e.g. index.test.ts:35 toContain('g=g1')), never history-stack semantics, so nothing locks in the push behavior intentionally; (2) the spec is silent on push-vs-replace — line 487 only says 'Deep-link #g=&i=, back/forward nav, shareable URLs', which does not endorse polluting history per move; (3) decisively, tasks/todo.md:128 lists 'hash replaceState history mode (decision)' as an OPEN, unchecked item deferred to Phase 2 — the project itself already flagged this exact concern. That deferral is also why I keep severity at 'important' rather than 'critical': it is a recognized refinement, the spec contract is technically met (back/forward does move the cursor), and the finding's own confidence is medium. But for a polished v1 with a goal of top-notch UX/a11y, a back-button trap with such a cheap, low-risk fix is a legitimate quality defect, and changing the semantics after 1.0 is costly once users depend on it.

**Verified evidence.** packages/plugin-hash/src/index.ts:47-55 — writeHash does `lastWritten = formatHash(...)` then `window.location.hash = lastWritten` (unconditional assignment = new history entry on every change). index.ts:66-69 — `viewer.on('slide', writeHash), viewer.on('item', writeHash), viewer.on('opened', writeHash)` so it fires on every cursor move, not just open/close. index.ts:57-60 — onHashChange echo guard compares value but cannot un-push a history entry. packages/plugin-hash/src/index.test.ts:30-83 — tests only assert hash value / cursor state, never history depth, so push behavior is incidental. tasks/todo.md:128 — '[ ] hash `replaceState` history mode (decision)' listed under 'Deferred → Phase 2', confirming the project already recognized this exact issue and left it unresolved. docs/GALLERIST_SPEC.md:487 — only spec text on plugin-hash ('back/forward nav, shareable URLs'), silent on push-vs-replace.

---

## [21] plugin-hash: malformed percent-escape in URL hash throws URIError (untrusted-input crash)

- **Dimension:** plugins-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → important)
- **Files:** `packages/plugin-hash/src/index.ts:12-22`, `packages/plugin-hash/src/index.ts:40-45`, `packages/plugin-hash/src/index.ts:57-60`

**Description.** parseHash calls decodeURIComponent(v) with no try/catch. A hash like '#g=%' or '#g=%E0%A4%A' (which any end user can type into the address bar, or that arrives via a shared/forged link) throws URIError 'URI malformed'. Verified by running the parser: parseHash('#g=%') throws. That exception propagates out of onHashChange (the 'hashchange' listener) and out of applyFromHash on load — so a single bad character in the URL fragment throws an uncaught error every time the hash changes, and breaks deep-linking entirely on load. The authoring doc explicitly says to treat the URL hash as untrusted input.

**Impact.** Uncaught runtime exception driven by attacker/user-controllable input; breaks the hash listener and on-load deep-link. A bug-free v1 cannot ship a plugin that crashes on a hostile URL fragment.

**Recommended fix.** Wrap each decodeURIComponent in a try/catch and fall back to the raw value (or skip that key) on failure. A small helper: `const dec = (s) => { try { return decodeURIComponent(s) } catch { return s } }`. Add a test feeding parseHash('#g=%') and a hashchange with a malformed escape, asserting no throw.

**Skeptic reasoning.** The finding is accurate. parseHash (packages/plugin-hash/src/index.ts:12-22) calls decodeURIComponent(v) at lines 18-19 with no try/catch. I ran the parser directly: parseHash('#g=%'), '#g=%E0%A4%A', '#i=%C0', and '#g=valid&i=%' all throw URIError 'URI malformed', while valid inputs parse correctly. The throw propagates two ways with no guard anywhere in the chain (grep confirms zero try/catch in the file): (1) onHashChange (line 57-60) -> applyFromHash (line 41) -> parseHash, so a hashchange event with a malformed escape throws an uncaught URIError out of the listener; (2) init (line 71) calls parseHash(window.location.hash).g on load, so a malformed fragment throws during plugin init and breaks on-load deep-linking. The hash fragment is user/attacker-controllable (address bar, shared/forged links, back/forward), and PLUGIN-AUTHORING.md:56 explicitly mandates treating the URL hash as untrusted input — so this violates the project's own documented contract. The existing test 'ignores a malformed hash without throwing' (index.test.ts:76-83) only exercises a structurally-incomplete hash ('i=oops', missing g) that short-circuits before any decode; it does NOT cover a malformed percent-escape, so the gap is genuine and untested. The proposed fix (a dec helper that try/catches and falls back to the raw value, plus a regression test) is correct. I rate it 'important' rather than 'critical' because the failure is a localized uncaught exception in one tree-shakeable plugin (caught by a host's global error handler, not state corruption), but it is a guaranteed crash on hostile input that breaks the feature on load and on every hash change, which must be fixed before a bug-free v1.

**Verified evidence.** packages/plugin-hash/src/index.ts:18-19 (decodeURIComponent(v) unguarded); :41 and :57-60 (onHashChange->applyFromHash->parseHash, listener path); :71 (parseHash on load in init); grep shows no try/catch in the file. Ran parser: parseHash('#g=%') -> URIError 'URI malformed' (also '#g=%E0%A4%A', '#i=%C0', '#g=valid&i='). docs/PLUGIN-AUTHORING.md:56 ('Treat ... the URL hash as untrusted'). Existing test index.test.ts:76-83 only covers missing-g, not a malformed escape.

---

## [22] plugin-hash: value parser truncates ids containing '=' (split('=') drops everything after the first '=')

- **Dimension:** plugins-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/plugin-hash/src/index.ts:15-21`

**Description.** parseHash does `const [k, v] = part.split('=')`, which on 'g=abc=' yields v='abc' (the trailing '=' and anything after is dropped), and on 'g=a=b' yields v='a'. Verified: parseHash('#g=abc=') => {g:'abc'}. Group/item ids are arbitrary host-supplied strings (spec §4.1 only requires they be stable). Base64/base64url ids, ids with '=' padding, or any id formatHash percent-encodes to something containing a literal '=' after a round-trip will deep-link to the WRONG item or fail to resolve. formatHash encodes with encodeURIComponent so '=' inside an id becomes '%3D' on write and decodes correctly — but a user-shared/hand-edited URL, or any id that legitimately contains '=' unencoded, breaks. The empty-value guard `if (!v) continue` also silently drops 'g=' (empty id), which is a valid edge to at least not mis-handle.

**Impact.** Deep links resolve to the wrong item or silently fail for a class of legitimate ids — data-correctness bug in the headline feature of the plugin.

**Recommended fix.** Split on the first '=' only: `const eq = part.indexOf('='); const k = part.slice(0, eq < 0 ? part.length : eq); const v = eq < 0 ? '' : part.slice(eq + 1)`. Keep the decode guard from the previous finding. Add a round-trip test for an id containing '='.

**Skeptic reasoning.** The finding is factually correct. parseHash uses `const [k, v] = part.split('=')` (packages/plugin-hash/src/index.ts:16), which splits on EVERY '=' and destructures only the first two elements, dropping anything after the first '='. I reproduced the exact claimed behavior in Node: parseHash('#g=abc=') => {g:'abc'} and parseHash('#g=a=b') => {g:'a'}. The trailing/embedded '=' and everything after it is silently lost.

The reviewer's analysis is also honest about the boundary: formatHash (line 26-27) percent-encodes via encodeURIComponent, so '=' inside an id becomes '%3D' on write, and the plugin's own write->read round-trip is SAFE — I verified formatHash('YWJj=') => 'g=YWJj%3D' and parseHash of that correctly recovers {g:'YWJj='}. So normal in-app navigation is never broken. The bug only bites a hash NOT produced by formatHash: a hand-edited or shared URL, or a host that writes location.hash itself with a literal unencoded '=' in an id. Spec §4.1 (docs/GALLERIST_SPEC.md:115,155) says ids are mandatory, stable, host-supplied strings with no charset restriction, so a base64/base64url id or any id containing '=' is spec-legal, and the spec explicitly markets 'shareable URLs' (docs/GALLERIST_SPEC.md:487) — exactly where a human edits/copies a URL. When it bites, the failure is silent: the cursor resolves to the wrong id or fails to resolve, with no error.

The empty-value guard `if (!v) continue` (line 17) also drops 'g=' (parseHash('#g=') => {}), but an empty-string id is degenerate, so that sub-point is minor.

The proposed fix (indexOf('=') + slice) is correct and trivially safe — I verified parseFixed('#g=a=b') => {g:'a=b'}. Verdict: confirmed real correctness bug. I keep severity at important rather than downgrading because it is silent data corruption in the plugin's headline feature on spec-legal, spec-advertised (shareable) URLs, and the fix is trivial — though the realistic exposure is narrower than the wording implies (the in-app write path is immune), placing it at the upper edge of important.

**Verified evidence.** packages/plugin-hash/src/index.ts:16 `const [k, v] = part.split('=')` — splits on all '=', keeps only first value (truncation). Reproduced: parseHash('#g=abc=')=>{g:'abc'}, parseHash('#g=a=b')=>{g:'a'}, parseHash('#g=')=>{} . Round-trip safe via line 26-27 formatHash encodeURIComponent: formatHash('YWJj=')=>'g=YWJj%3D' decodes back to {g:'YWJj='}. Spec: docs/GALLERIST_SPEC.md:115/155 (ids host-supplied, no charset limit), :487 ('shareable URLs'). No existing test covers an id containing '=' (packages/plugin-hash/src/index.test.ts only tests space-encoding at :24-27).

---

## [23] 10 of 11 publishable packages ship no README (blank npm package pages)

- **Dimension:** publish-security
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/package.json:8`, `packages/react/package.json:8`, `packages/renderer-dom/package.json:8`, `packages/theme-default/package.json:7`

**Description.** Only packages/plugin-thumbnails has a README.md. core, renderer-dom, react, theme-default, and the other six plugins have none. Each package's `files` is `["dist"]` (theme-default `["src"]`); npm auto-includes a README if present, but there is nothing to include, so `npm pack` ships none. The root README is excellent but does not get attached to the sub-packages on npm.

**Impact.** @gallerist/core, @gallerist/react, etc. would have empty npmjs.com pages — poor first impression for a flagship v1 launch and a discoverability/adoption hit. The plugin-thumbnails README also uses repo-relative links ([Gallerist](../../README.md)) that 404 on npm.

**Recommended fix.** Add a focused README.md to each publishable package (can be short: what it is, install, minimal usage, link to the repo). Fix the relative links in plugin-thumbnails to absolute repo URLs so they resolve on npm.

**Skeptic reasoning.** Verified every claim directly. The repo contains exactly 11 packages under packages/ and none are marked "private", so all 11 are publishable. A repo-wide search for README* returns only two files: the root README and packages/plugin-thumbnails/README.md. The remaining 10 publishable packages (core, react, renderer-dom, theme-default, and plugins download/fullscreen/grid/hash/video/video-youtube) have no README whatsoever — so npm cannot auto-include one and `npm pack` ships a package with a blank npmjs.com page. Cited lines are exact: core:8, react:8, renderer-dom:8 all have "files": ["dist"]; theme-default:7 has "files": ["src"]. The six remaining plugins also use "files": ["dist"]. The relative-link sub-claim is also true: plugin-thumbnails/README.md line 3 links [Gallerist](../../README.md) and line 67 links [layout presets](../../docs/PRESETS.md), both repo-relative paths that resolve to 404 on npm. The finding has one cosmetic imprecision ("the other six plugins" — there are 6 non-thumbnails plugins plus core/react/renderer-dom/theme = 10 total without README), but the "10 of 11" headline and the technical mechanism are correct. This is a genuine packaging/launch-polish defect with no runtime/correctness/security impact; it sits at the important/suggestion boundary, but given the explicit flagship-v1 npm-launch goal where the package page is the storefront, important is justified.

**Verified evidence.** Only packages/plugin-thumbnails/README.md and ./README.md exist (find packages -iname README* and repo-wide find). 11 package.json files under packages/, zero with "private". packages/core/package.json:8 "files": ["dist"]; packages/react/package.json:8 "files": ["dist"]; packages/renderer-dom/package.json:8 "files": ["dist"]; packages/theme-default/package.json:7 "files": ["src"]; plugins download/fullscreen/grid/hash/video/video-youtube all package.json:8 "files": ["dist"]. plugin-thumbnails/README.md:3 [Gallerist](../../README.md) and :67 [layout presets](../../docs/PRESETS.md) are repo-relative links that 404 on npm.

---

## [24] No LICENSE file in the repo or any package — every package.json claims MIT

- **Dimension:** publish-security
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → important)
- **Files:** `packages/core/package.json:5`, `README.md:87`, `packages/react/package.json:5`, `packages/theme-default/package.json:5`

**Description.** All 11 packages declare "license": "MIT" and the README states "MIT, with a DCO for contributions", but `find -iname LICENSE*` (excluding node_modules) returns nothing — there is no LICENSE file at the repo root or in any package directory. `npm pack --dry-run` for core lists exactly 7 files (dist/* + package.json); no LICENSE is included in the tarball.

**Impact.** Declaring a license without shipping the license text is legally incomplete and trips license scanners/compliance gates (FOSSA, license-checker, corporate OSS review), which can block downstream adoption. For a clean public v1 it is a hard hygiene blocker.

**Recommended fix.** Add a root LICENSE file with the MIT text and copyright line. Since `files` is `["dist"]` (and `["src"]` for theme-default), either add LICENSE to each package's `files` whitelist or use a prepack step that copies the root LICENSE into each package before publish. Verify with `npm pack --dry-run` that LICENSE appears in every tarball.

**Skeptic reasoning.** Every cited fact is independently verified. (1) `find /Users/dev/Documents/shafayet/codes/gallerist -iname "LICENSE*" -not -path "*/node_modules/*"` returns nothing; the repo-root listing and a maxdepth-2 search of packages/ also find no LICENSE/COPYING file. (2) All 11 publishable packages declare "license": "MIT" — confirmed at packages/core/package.json:5, packages/react/package.json:5, packages/theme-default/package.json:5 (and the other 8). The root package.json (gallerist-monorepo) is the private workspace root and has no license field, which is fine. (3) README.md:87 reads exactly "MIT, with a DCO for contributions (no CLA)..." and README.md:4 says "MIT licensed". (4) `npm pack --dry-run` for @gallerist/core lists exactly 7 files (dist/index.cjs, dist/index.cjs.map, dist/index.d.cts, dist/index.d.ts, dist/index.js, dist/index.js.map, package.json) — no LICENSE; react and theme-default tarballs likewise contain no LICENSE (grep for 'license' in pack output empty). The "files" whitelist is ["dist"] for code packages and ["src"] for theme-default, so even adding a root LICENSE would not auto-include it without a files entry or prepack copy step — the proposed fix is correct. This is a real, standard npm-publishing hygiene defect: declaring a license without shipping its text trips SPDX/license scanners (license-checker, FOSSA) and corporate OSS review gates, which can block downstream adoption of a public v1. I adjust severity from "critical" to "important": it is a genuine hard publish blocker for the stated clean-v1 goal, but it has no runtime, correctness, or security impact and the remedy is a one-file add plus a files/prepack tweak verifiable via npm pack. Not a refutation candidate — the cited code fully supports the claim.

**Verified evidence.** packages/core/package.json:5 ("license": "MIT") and :8 ("files": ["dist"]); packages/react/package.json:5; packages/theme-default/package.json:5 + :7 ("files": ["src"]); README.md:4 ("MIT licensed") and README.md:87 ("MIT, with a DCO for contributions (no CLA)"); `find ... -iname LICENSE* -not -path "*/node_modules/*"` => no output; `npm pack --dry-run` (packages/core) => total files: 7 (dist/* + package.json, no LICENSE); same dry-run for react and theme-default => no 'license' line in tarball contents.

---

## [25] Sourcemaps embed full TypeScript source and ship in every tarball (~3x size bloat, effectively re-publishes src)

- **Dimension:** publish-security
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/core/tsup.config.ts:8`, `packages/core/package.json:8`, `packages/react/tsup.config.ts:8`, `packages/plugin-download/tsup.config.ts:8`

**Description.** Every tsup config sets `sourcemap: true`, and `files` is `["dist"]`, so the generated .js.map and .cjs.map ship. `npm pack --dry-run` for core shows index.cjs.map (53.4kB) and index.js.map (53.4kB) alongside index.cjs (17.5kB) and index.js (16.9kB) — the maps are ~107kB of a 172kB unpacked package. Inspecting the maps confirms `sourcesContent` embeds the full original .ts source for every module (events.ts, fsm.ts, normalize.ts, store.ts, createViewer.ts, zoom.ts, etc.). So even though `files` is dist-only, the complete source is published inside the maps.

**Impact.** Roughly triples download/install size for a library that markets itself on top-notch performance and a tight size budget (core ≤12kB gz). The embedded full source is also published whether or not that's intended (no obfuscation, fine for MIT, but a surprise for a 'dist only' whitelist). Disagrees with the lean-bundle positioning.

**Recommended fix.** For a published library, drop maps from the tarball (simplest: leave `sourcemap: true` for local debugging but add a publish-time exclusion, or set `sourcemap: false` for the production build), OR keep maps but disable embedded source (`sourcesContent: false`) so consumers can map against installed dist without shipping full src. Re-run `npm pack --dry-run` and check `pnpm size` after, and confirm the size-limit budgets in .size-limit.json still pass.

**Skeptic reasoning.** I verified every cited claim against the actual files and an actual `npm pack --dry-run`; the finding is accurate and in fact understated — all 10 publishable packages set `sourcemap: true`, not just the 4 cited.

Configs: packages/core/tsup.config.ts:9, react:9, plugin-download:9 all set `sourcemap: true`; grep shows the same in renderer-dom, plugin-grid, plugin-video, plugin-hash, plugin-fullscreen, plugin-thumbnails, plugin-video-youtube. packages/core/package.json:8 is `"files": ["dist"]`, identical in every publishable package, so the dist .map files are whitelisted into the tarball. No .npmignore, no publishConfig, no sourcesContent:false, no prepublish strip anywhere.

Tarball reality (npm pack --dry-run for core): dist/index.cjs.map 53.4kB + dist/index.js.map 53.4kB = ~107kB of maps vs index.cjs 17.5kB + index.js 16.9kB = ~34kB code; unpacked 172.0 kB; package 45.0 kB. Parsing index.js.map: 11 sources, sourcesContent 11 entries, 0 null, 28,868 chars of original TS embedded; the raw dump shows full commented source of events.ts/fsm.ts/normalize.ts. Maps are 3.11x the JS code and 75.7% of the js+map payload — matching the ~3x claim.

This is a real shipping defect: the published library re-publishes full TypeScript source and roughly triples install/download footprint for a project marketing a tight size budget, with no mitigation. Proposed fixes (sourcesContent:false, or sourcemap:false for prod, or publish-time exclusion) are correct and should apply to all packages.

Why important, not critical: the bloat hits npm install disk/download, not the runtime bundle — bundlers don't pull .map into app bundles, and .size-limit.json measures only gzipped dist/index.js (it never accounts for maps), so the advertised 12kB gz core budget is not actually broken. No secret/credential leak (MIT source), just a surprise for a 'dist only' whitelist. Genuine quality/footprint problem worth fixing before v1, consistent with the original 'important' severity.

**Verified evidence.** packages/core/tsup.config.ts:9 `sourcemap: true`; packages/react/tsup.config.ts:9; packages/plugin-download/tsup.config.ts:9 (plus 7 more via grep across packages/*/tsup.config.ts). packages/core/package.json:8 `"files": ["dist"]` (same in all publishable packages). `npm pack --dry-run` for @gallerist/core: 53.4kB dist/index.cjs.map, 53.4kB dist/index.js.map, 17.5kB index.cjs, 16.9kB index.js, unpacked 172.0 kB. Parsing dist/index.js.map: 11 sources, sourcesContent 11/11 non-null, 28,868 chars of embedded original TS (raw output shows full source of events.ts/fsm.ts/normalize.ts). Computed maps = 3.11x code, 75.7% of js+map payload. No .npmignore/publishConfig/sourcesContent override in any package.

---

## [26] Overlays paint against a wrong contain rect before the image decodes and never repaint on load

- **Dimension:** renderer-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/mount.ts:396`, `packages/renderer-dom/src/overlays/position.ts:24`, `packages/renderer-dom/src/adapters/image.ts:111`

**Description.** When a slide becomes current, paintOverlays is called with natural = rec.media?.naturalSize?.() ?? stageSize (mount.ts:396). For a fresh <img> that has not decoded yet and has no item.naturalSize hint, naturalSize() returns null (image.ts:111-113), so natural falls back to stageSize. containRect(stage, stage) then yields a full-stage square fit with scale=1 and zero offset, which is the wrong contain rect for any non-square image — every point/region overlay is anchored to the wrong place. There is no repaint after the image's load/decode resolves (the renderer does not await rec.media.ready, and overlays only repaint when overlayItemId changes), so the overlays stay mis-anchored until the user navigates away and back.

**Impact.** Image-space overlays are positioned incorrectly on the first view of any item that lacks a naturalSize hint (the common case for plain string/srcset sources) until a manual re-navigation. Combined with the missing ResizeObserver, image-space overlays are effectively unreliable for the default image adapter.

**Recommended fix.** After mounting media for the current slide, await rec.media.ready (or hook the adapter's load) and re-run the overlay paint with the now-known naturalSize; or skip painting content-anchored overlays until naturalSize is available and paint on ready. Encourage authors to pass item.naturalSize, but do not depend on it for correctness.

**Skeptic reasoning.** The finding is accurate on every cited point and I could not refute it.

1. Wrong rect before decode (mount.ts:396): In renderWindow's current-slide branch, the media is mounted synchronously (mount.ts:358) — the image adapter's Promise executor runs immediately and sets img.src (image.ts:72-77). paintOverlays is then called in the SAME synchronous pass (mount.ts:386-398) with natural = rec.media?.naturalSize?.() ?? stageSize. At that instant the image has not decoded, so img.naturalWidth === 0.

2. naturalSize() returns null (image.ts:111-114): naturalSize() returns item.naturalSize if present, else img.naturalWidth ? {...} : null. With no naturalSize hint (the common case for a plain string/srcset source) and naturalWidth still 0, it returns null → natural falls back to stageSize.

3. containRect(stage, stage) is wrong for non-square images (position.ts:24-29): With natural === stage, s = min(1,1) = 1, giving rect {x:0,y:0,w:stage.w,h:stage.h}. The real object-fit:contain rect for a non-square image is letterboxed (nonzero offset, smaller w/h). Both normalized and natural spaces in contentAnchorBox (position.ts:31-50) derive their mapping from this rect, so every non-centered content (point/region) anchor lands wrong. Concrete: a 1600x900 image in a 1000x1000 stage puts a normalized (0.5,0.9) overlay at top=725px correctly vs top=900px with the fallback — a 175px error.

4. No repaint after load: I grepped the entire renderer-dom and react packages; rec.media.ready is never awaited and the image adapter's onLoad (image.ts:53-62) never re-runs the overlay paint or emits a re-sync. The declared load/loaded events are never wired (only their types exist in core). The only repaint triggers are overlayItemId reset on item change (mount.ts:383), plugin changes (mount.ts:656-659), or zoom-only updateOverlays (mount.ts:401) which does NOT recompute the box (render.ts:39-46). So overlays stay mis-anchored until the user navigates away and back.

This also directly violates the documented contract: IMPLEMENTATION.md:77-78 states "Overlays use the real media naturalSize to compute the contain rect, so natural/normalized anchor coordinates map onto the letterboxed image correctly." On first view they do not.

Severity is important, not critical: viewport-anchored overlays are unaffected, the bug self-heals on re-navigation, and authors can sidestep it by passing item.naturalSize (image.ts:112). But for the default image adapter with the common bare-string source, image-space overlays are positioned wrong on first view of every item — a real correctness defect for a documented, shipping feature. The proposed fix (hook rec.media.ready / the adapter load to repaint with the now-known naturalSize, or defer content-anchored paint until naturalSize is known) is the right remedy.

**Verified evidence.** mount.ts:358 (synchronous media mount) → mount.ts:386-398 (synchronous paintOverlays with natural at :396); image.ts:72-77 (src set synchronously in executor) + image.ts:111-114 (naturalSize() returns null when naturalWidth===0 and no hint); position.ts:24-29 (containRect(stage,stage) → s=1, zero offset, full-stage rect) + position.ts:31-50 (both spaces map through that rect); render.ts:39-46 (updateOverlays never recomputes the box); mount.ts:383,399,656-659 (only repaint triggers are item-change/plugin-change — none on decode); grep over renderer-dom + react confirms rec.media.ready is never awaited and load/loaded never emitted; IMPLEMENTATION.md:77-78 documents the violated contract.

---

## [27] Pinch-end does not commit zoom on the first finger lift; lingering finger is dead

- **Dimension:** renderer-correctness
- **Effective severity:** important  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/gestures.ts:193`, `packages/renderer-dom/src/gestures.ts:139`

**Description.** During a 2-finger pinch intent stays 'zoom'. When the first of the two fingers lifts, onUp deletes it (size→1) and hits `case 'zoom': if (pointers.size === 0)` — size is 1, so the pinch result is NOT committed yet. The remaining single finger is then inert: onMove's pinch branch requires pointers.size >= 2 (gestures.ts:139) so it no-ops, and the fall-through pan/close logic is skipped because intent is still 'zoom'. The zoom only commits when the second finger finally lifts. So the user can lift one finger expecting to keep panning the now-zoomed image and instead the gesture is frozen until they lift the second finger too.

**Impact.** On real multi-touch the pinch→single-finger-pan handoff is broken: after a pinch you must lift both fingers and start a new drag to pan. Feels unresponsive/laggy on touch, though the final zoom value is not lost.

**Recommended fix.** On the transition from 2→1 pointers, commit the current pinch zoom (viewer.zoomTo(live)), reset startZoom to the committed value, re-seat `start` to the remaining pointer's current position, and set intent='none' (or 'pan' if scale>fit) so the remaining finger continues as a pan. Verify with a Playwright multi-touch test.

**Skeptic reasoning.** I traced the exact 2→1 pointer transition and the finding is accurate. During a pinch, intent is locked to 'zoom' (gestures.ts:118) and live zoom is applied to the transform but never committed to the store (onMove only calls schedule(), gestures.ts:139-146). When the first of two fingers lifts: onUp deletes it leaving pointers.size===1 (gestures.ts:169); intent is still 'zoom' so the re-resolve guard `if (intent === 'none')` at line 182 is skipped; the switch hits `case 'zoom': if (pointers.size === 0)` (gestures.ts:193-194) which is FALSE (size is 1) so nothing commits; and the cleanup block `if (pointers.size === 0)` (gestures.ts:210) is also FALSE so start/intent/gestureGeom are NOT reset and intent stays 'zoom'.

The remaining single finger is then inert exactly as described. In onMove: the pinch branch requires `intent === 'zoom' && pointers.size >= 2` (gestures.ts:139) — size is 1, so it no-ops. Execution falls to line 149 `if (!start) return`, but `start` is still the first pointer's down position (set once at gestures.ts:113 and never cleared), so it is non-null and execution continues. Line 153 `if (intent === 'none')` is skipped because intent is 'zoom', so resolveIntent never runs and intent can never flip to 'pan'/'close'. The pan branch (155) and close branch (158) both require a different intent, so every move with one lingering finger does nothing. The image is frozen until the second finger lifts (which finally makes size===0 and commits live at line 194).

So: the natural pinch→single-finger-pan handoff is broken on real multi-touch; the user must lift both fingers and start a fresh drag to pan after zooming. The final zoom value is preserved (it commits on the last finger up), so this is a responsiveness/UX defect rather than data loss or a crash. It is touch-only and does not affect mouse/wheel/trackpad. I also confirmed there is zero Playwright multi-touch coverage (only one pointer-dispatch occurrence exists across all e2e specs, and no test references pinch/two-finger/pointers.size), so this path is genuinely untested — consistent with the file's own comment (line 4) that real multi-pointer flows are deferred to Playwright. Given the project's explicit goal of top-notch touch UI/UX and that pinch-to-zoom-then-pan is a flagship lightbox interaction, 'important' is the right severity. The proposed fix (on the 2→1 transition: commit live zoom, reseat startZoom and start to the remaining pointer, set intent to 'none'/'pan') is sound and correctly targeted.

**Verified evidence.** packages/renderer-dom/src/gestures.ts:118 (intent='zoom' on 2nd down); :139 pinch branch guarded by `pointers.size >= 2`; :149 `if (!start) return` but start set at :113 and only cleared at :210-214 under size===0; :153 resolveIntent skipped when intent!=='none'; :182 re-resolve also skipped when intent==='zoom'; :193-194 `case 'zoom': if (pointers.size === 0)` fails at size===1; :210 cleanup `if (pointers.size === 0)` fails at size===1 so intent stays 'zoom'. packages/core/src/zoom/arbitration.ts:25 `if (pointerCount >= 2) return 'zoom'`. e2e/: grep finds only 1 total pointer-event dispatch and zero pinch/two-finger/pointers.size references → no multi-touch test coverage.

---

## [28] Slide window hardcodes loop=false while core defaults loop=true → blank frame on wrap

- **Dimension:** renderer-correctness
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → important)
- **Files:** `packages/renderer-dom/src/mount.ts:327`, `packages/core/src/controller/createViewer.ts:24`, `packages/core/src/windowing.ts:6`

**Description.** renderWindow() always calls windowIndices(cur.g, groupCount, preload.ahead, preload.behind, false). The final argument (loop) is hardcoded false, but the core viewer's loop defaults to true (createViewer.ts:24: `const loop = options.loop ?? true`). At the last group the window is therefore [...,N-2,N-1] and at the first group [0,1,...], with no wrapped neighbor. But viewer.next() at the last group wraps to group 0 (and prev() at group 0 wraps to the last), and that wrap target is NOT in the mounted window. I verified numerically: windowIndices(9,10,2,1,false) = [8,9] vs the loop=true expectation [8,9,0,1]. So the single most common edge navigation (wrapping past the end) lands on a slide that was never preloaded.

**Impact.** A visible blank/unloaded frame every time the user wraps from the last group to the first (or first→last) in the default loop=true configuration — i.e. on the most common boundary navigation. Defeats the whole point of preload-ahead and reads as a broken viewer at the ends of every gallery.

**Recommended fix.** Thread the viewer's loop setting into the window call. The renderer already has `loop` (opts.loop) but it is only used for linear traversal; the viewer's own loop is not exposed on ViewerApi. Either add a `loop` accessor/getter to ViewerApi and pass it, or — since the renderer cannot currently read the core loop — at minimum pass the renderer's resolved loop intent and document that mount({loop}) must mirror the viewer. Cleanest: expose `viewer.loop` (mirror of the option, like `cursor`/`zoom`) and call windowIndices(cur.g, groupCount, ahead, behind, viewer.loop).

**Skeptic reasoning.** The finding is accurate on every checkable claim, verified against the actual code.

1. renderWindow hardcodes loop=false: mount.ts:327 calls windowIndices(cur.g, groupCount, preload.ahead, preload.behind, false). It is the ONLY windowIndices call in the renderer slide path; no alternate prefetch/warmup path exists (grep confirmed).

2. Core defaults loop=true: createViewer.ts:24 `const loop = options.loop ?? true`.

3. Navigation genuinely wraps: nav.ts nextGroup (31-35) and prevGroup (42-46) wrap to 0 / n-1 when ctx.loop is true.

4. Numeric claim verified by running windowIndices itself: last group windowIndices(9,10,2,1,false)=[8,9] vs loop=true [8,9,0,1]; first group windowIndices(0,10,2,1,false)=[0,1,2] vs loop=true [9,0,1,2]. The wrap target (group 0 at the end, group 9 at the start) is genuinely absent from the mounted window.

5. Visible-blank mechanism is real: the image adapter (adapters/image.ts:53-62) uses decode-before-reveal — data-gallerist-loaded (the attribute the theme reveals on) is set only after img.decode() resolves. A wrap target mounted lazily at navigation time (sync→renderWindow recenters on the new cursor) starts its network fetch + decode from scratch, so it shows placeholder/blank during the slide-in transition.

6. ViewerApi does not expose loop (api.ts has no loop accessor; line 22's loop is on ViewerOptions). The renderer's own opts.loop (mount.ts:119) is consumed ONLY for linear flat traversal (lines 169-170) and is never threaded into the slide window. Notably the React adapter already passes loop: options.loop to mount (Gallerist.tsx:79), so the renderer even HAS the value available at line 119 — it just isn't used for the slide window. The fix is a one-token change (false → loop at line 327), ideally plus a viewer.loop getter so the renderer reflects the core setting directly.

7. Default exposure is real: the shipped vanilla example does createViewer({ items, loop: true }) then mount(viewer) with no loop (examples/vanilla/main.ts:20-21); the React example defaults loop=true. So the bug is live in the out-of-the-box default configuration.

I downgrade critical→important rather than reject: this is a genuine default-config, user-visible defect on a common action (wrapping past the ends), but it is a transient blank that self-heals once the image decodes, is confined to the two wrap boundaries (not every navigation), does not corrupt state, show wrong content, or crash, and preload works correctly everywhere else. That is squarely 'important' (real polish/correctness regression, easy fix) rather than 'critical' (data loss / crash / pervasively broken). The related plugin-thumbnails hardcoding of false (index.ts:563,571) is a separate, lower-impact instance of the same pattern in the thumbnail rail.

**Verified evidence.** packages/renderer-dom/src/mount.ts:327 (windowIndices(cur.g, groupCount, preload.ahead, preload.behind, false) — only slide-window call, loop hardcoded false); mount.ts:119 (const loop = opts.loop ?? false) used only at mount.ts:169-170 (linear traversal); mount.ts:528-537 (sync subscriber re-runs renderWindow on each cursor change, recentering on the new/wrapped cursor); packages/core/src/controller/createViewer.ts:24 (loop ?? true); packages/core/src/nav/nav.ts:31-35 & 42-46 (nextGroup/prevGroup wrap when loop); packages/core/src/windowing.ts:6-25 (windowIndices: non-loop branch `else if (idx<0||idx>=count) continue` drops the wrap neighbor); runtime check of windowIndices: last [8,9] vs [8,9,0,1], first [0,1,2] vs [9,0,1,2]; packages/renderer-dom/src/adapters/image.ts:53-62 (data-gallerist-loaded set only after img.decode() — decode-before-reveal → blank lazily-mounted slide); packages/react/src/Gallerist.tsx:79 (mount passed loop: options.loop, yet slide window still ignores it); examples/vanilla/main.ts:20-21 (createViewer({items, loop:true}); mount(viewer) with no loop — bug in shipped default config); related: packages/plugin-thumbnails/src/index.ts:563,571 (same hardcoded false in the thumbnail rail).

---

## [29] Gesture teardown, multi-pointer pinch, and pointercancel are untested in JS; RAF mock hides scheduling/leak bugs

- **Dimension:** tests
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/gestures.test.ts:31`, `packages/renderer-dom/src/gestures.ts:96`, `packages/renderer-dom/src/gestures.ts:139`, `packages/renderer-dom/src/gestures.ts:244`

**Description.** gestures.test.ts injects a synchronous raf (cb => { cb(); return 1 }, line 31), so the schedule()/coalescing logic (gestures.ts:96-105) and the 'if (frame) caf(frame)' cleanup on up/detach (gestures.ts:170, 251) are never actually exercised — a real rAF batching or cancel bug would pass. There is no test for: two-pointer pinch (the entire intent==='zoom' branch at gestures.ts:139-147, pinchStartDist, focalZoom-around-midpoint), pointercancel mid-gesture, a pointerdown that goes to 2 then back to 1 pointer (the 'pointers.size === 0' reset guard at gestures.ts:210), or that detach() removes every listener so a post-detach pointermove is a no-op. The pan test (line 98) asserts only x:-60 with the sync raf, not that exactly one frame was scheduled.

**Impact.** The most leak-prone and concurrency-prone code in the package (per-frame rAF scheduling, pointer map lifecycle, listener teardown) ships with only happy-path single-pointer coverage. A teardown leak or a stuck pinch would not be caught before publish, on a v1 that claims a 60fps gesture budget.

**Recommended fix.** Add gesture tests with a controllable raf (queue callbacks, flush manually) asserting at most one pending frame and that detach()/pointerup cancels it. Add a pinch test (two pointerdowns + pointermoves changing distance → zoomTo with the focal preserved). Add a pointercancel-mid-drag test and a detach()-then-pointermove no-op test.

**Skeptic reasoning.** Every cited claim checks out against the actual code. (1) The JS test injects a synchronous rAF (gestures.test.ts:32-35 `raf: (cb)=>{cb();return 1}`, `caf: ()=>{}`), so the real schedule() coalescing guard (gestures.ts:96-105, `if (frame) return`) and the caf cancel paths (gestures.ts:170-173 on up, gestures.ts:251 on detach) are never exercised against an asynchronous queue — caf is a no-op stub, so a failure to cancel a pending frame would pass. (2) No two-pointer/pinch test exists: the `pe()` helper takes an `id` arg (gestures.test.ts:41) but no test dispatches a second pointerdown, leaving the entire `pointers.size===2` onDown branch (gestures.ts:115-119, pinchStartDist) and the `intent==='zoom'` move branch (gestures.ts:139-147, factor/focalZoom-around-midpoint) with zero coverage. (3) `pointercancel` is wired (gestures.ts:240) but never dispatched in any test. (4) The `pointers.size===0` reset/commit guards (gestures.ts:194, 210) are untested under a 2→1 pointer release. (5) detach() is called in afterEach (gestures.test.ts:53) but no test asserts a post-detach pointermove is a no-op. (6) The pan test only asserts `toMatchObject({scale:1, x:-60})` (gestures.test.ts:105), never that exactly one frame was scheduled. The source comment at gestures.ts:4 claims 'real multi-pointer flows are verified in Playwright (M3.5)', but the e2e suite (e2e/tests/viewer.spec.ts) only uses single-pointer `page.mouse` drag/wheel — Playwright's mouse API is single-pointer and there is no CDP touch/pinch, no pointercancel, and no teardown test anywhere in e2e. Mitigating context: the pure math (focalZoom, clampScale) and the arbitrate() reducer ARE unit-tested in core (zoom.test.ts, arbitration.test.ts including `pointerCount:2 → 'zoom'` at arbitration.test.ts:16-18), and single-pointer flows are covered in e2e — so this is a coverage gap, not a proven live bug. But the multi-pointer gesture WIRING, the rAF frame lifecycle, and listener teardown are genuinely unverified, which is exactly the leak/concurrency-prone surface a v1 claiming a 60fps gesture budget should test. Severity stays 'important' as claimed; the proposed fix (controllable queued rAF asserting ≤1 pending frame and cancel-on-up/detach, a pinch test, a pointercancel-mid-drag test, a detach-then-pointermove no-op test) is correct and actionable.

**Verified evidence.** gestures.test.ts:32-35 (sync raf/no-op caf); gestures.test.ts:41 (pe id param unused by any 2-pointer test); gestures.test.ts:98-106 (pan test asserts only x:-60, no frame assertion); gestures.test.ts:53 (detach in afterEach, no post-detach no-op assertion). gestures.ts:96-105 (schedule coalescing guard); gestures.ts:115-119 (2-pointer onDown / pinchStartDist); gestures.ts:139-147 (intent==='zoom' factor+focalZoom branch); gestures.ts:170-173 & 251 (caf cancel on up/detach); gestures.ts:194,210 (pointers.size===0 guards); gestures.ts:240,248 (pointercancel wired). gestures.ts:4 (comment claims Playwright covers multi-pointer). e2e/tests/viewer.spec.ts:13-20 single-pointer page.mouse drag, :64-70 wheel only — no pinch/pointercancel/teardown. arbitration.test.ts:16-18 only tests the pure reducer for pointerCount:2, not the gestures.ts pinch wiring.

---

## [30] No resize handling or test — overlays and pan bounds desync after a viewport/container resize

- **Dimension:** tests
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity critical → important)
- **Files:** `packages/renderer-dom/src/mount.ts:383`, `packages/renderer-dom/src/mount.ts:399`, `packages/renderer-dom/src/mount.ts:634`, `packages/renderer-dom/src/overlays/render.test.ts:1`

**Description.** mount.ts has zero resize wiring: there is no ResizeObserver and no window 'resize' listener (grep finds none). Overlay geometry is captured via getBoundingClientRect only when the item changes (rec.overlayItemId !== it.id, mount.ts:383) and is never recomputed afterward; on a zoom-only change it merely calls updateOverlays (mount.ts:399) which re-counter-scales but does NOT re-read stage size. Gesture geometry is snapshotted per-gesture (gestures.ts:111). So after the browser resizes, content/region overlays anchored to image points (spec §9.1) are positioned against a stale contain rect and pan clamps use the wrong stage size, both producing visibly wrong placement. No unit or e2e test resizes the viewport, so this regression is invisible to the suite.

**Impact.** Image-space overlays — a headline feature — drift off their anchors and zoom/pan clamps misbehave on any orientation change, responsive layout shift, or window resize. This is a correctness bug shipped silently because nothing tests it.

**Recommended fix.** Add a ResizeObserver (or window resize listener) in mount.ts that repaints overlays and re-reads geometry, then add a renderer test that opens, paints a content overlay, changes stage dimensions (set stage style / mock getBoundingClientRect), dispatches resize, and asserts the overlay box recomputes. Mirror it as a Playwright test using page.setViewportSize while a content overlay is visible.

**Skeptic reasoning.** The core of the finding is real and I verified every load-bearing claim by reading the source.

1) No resize wiring exists. Grepping all of packages/ source (excluding dist/ build artifacts and test files) for ResizeObserver / 'resize' / orientationchange / matchMedia-resize finds NOTHING. The only DOM listeners in mount.ts are keydown (mount.ts:606) and fullscreenchange (mount.ts:622). State subscribers (viewer.subscribe(sync), mount.ts:664) fire on store changes, not on container/viewport resize, so nothing repaints on resize.

2) Content/region (image-space) overlay geometry is captured ONLY on item change. In renderWindow, paintOverlays runs solely when rec.overlayItemId !== it.id (mount.ts:383), reading stage.getBoundingClientRect() once (mount.ts:384-385). The pixel box is computed by contentAnchorBox(anchor, stage, natural) (render.ts:100 -> position.ts:31-50) producing absolute left/top/width/height in px from that stage size. For normalized space, mapX(x)=rect.x + x*rect.w, derived from the paint-time stage; after a resize those px values no longer correspond to the new contain rect, so a 0.5/0.5 point overlay drifts off center. The headline spec §9.1 image-anchored overlay feature genuinely desyncs.

3) updateOverlays (render.ts:39-46), the only other overlay code path (mount.ts:401 on zoom-only changes), touches ONLY el.style.display (visibleAt) and el.style.transform (counter-scale). It never recomputes left/top/width/height from a new stage size. So even if a sync fired post-resize, retained overlays keep stale px positions.

4) The content layer itself auto-resizes via CSS (.gallerist-content is inset:0, gallerist.css:90-92), which is exactly why the overlays inside it visibly drift: the box stretches but the absolutely-positioned overlay px offsets don't.

5) Test gap is real. render.test.ts only asserts viewport-layer anchors and never changes stage size then re-asserts (no getBoundingClientRect mock, no resize). e2e overlays.spec.ts never calls page.setViewportSize. Grep for setViewportSize/resize in e2e/ finds nothing.

Where I downgrade from critical to important: the pan-bounds half of the claim is overstated. Gesture geometry is snapshotted at onDown (gestures.ts:111) but cleared to null at onUp (gestures.ts:213), and geom() falls back to a FRESH getGeometry() when no snapshot exists (gestures.ts:84). Keyboard zoomAroundCenter also re-reads getBoundingClientRect each call (mount.ts:542). So clamps on the NEXT interaction after a resize use the correct current stage size; only previously-committed pan offsets remain stale until the next gesture re-clamps them — a transient, self-healing condition, not the persistent misbehavior the finding implies. The persistent, user-visible correctness bug is the content/region overlay drift, which has no recompute path at all. That bug plus the genuine missing-test gap justify 'important'; it is a real shipped correctness defect but it affects positioning of an optional overlay feature (degraded UX, recovers on next item change), not data loss or a crash, so 'critical' is too strong.

**Verified evidence.** mount.ts:383 (paintOverlays gated on rec.overlayItemId !== it.id) + mount.ts:384-385 (single getBoundingClientRect at paint time) + render.ts:100 / position.ts:31-50 (contentAnchorBox computes absolute px from stage size) prove content overlays are positioned against a paint-time stage. render.ts:39-46 (updateOverlays touches only display + counter-scale transform, never re-reads stage) proves zoom-only path can't fix it. gallerist.css:90-92 (.gallerist-content inset:0) shows the container resizes while px offsets do not. Only listeners: mount.ts:606 (keydown), mount.ts:622 (fullscreenchange) — no ResizeObserver/resize anywhere in source. Test gap: render.test.ts only has viewport-anchor cases (lines 36,45-50,92,145-146) with no stage-resize re-assert; e2e/tests/overlays.spec.ts has no setViewportSize. Mitigating evidence for the overstated pan-bounds half: gestures.ts:84 (geom() falls back to fresh getGeometry), gestures.ts:213 (gestureGeom cleared on pointerup), mount.ts:542 (zoomAroundCenter re-reads rect).

---

## [31] No runtime test for media abort/error/decode-failure paths in the rendering pipeline (loadError event never asserted end-to-end)

- **Dimension:** tests
- **Effective severity:** important  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/adapters/image.ts:63`, `packages/renderer-dom/src/adapters/image.test.ts:87`, `packages/core/src/events/events.ts:54`

**Description.** image.test.ts covers the adapter's ready promise rejecting on abort/loader-reject in isolation, but no test verifies the renderer's reaction: that an image 'error' or aborted load surfaces the loadError event (events.ts:54), that a failed slide doesn't leave a half-mounted node, or that navigating away aborts an in-flight load (the AbortController signal path). The decode()-rejects-but-reveal-anyway branch (image.ts:55-57 catch) is also untested. E2E never serves a broken image URL.

**Impact.** Error/abort is exactly where leaks and stuck spinners live. v1 ships with the unhappy media path covered only at the unit boundary, not through the mount/window pipeline that wires abort signals and emits loadError.

**Recommended fix.** Add a renderer test: mount, open on an item whose img fires 'error', assert loadError emitted with the item id and no orphan node; and a test that navigating off an item before load aborts its signal (spy on the AbortController). Optionally add a Playwright test pointing one slide at a 404 image.

**Skeptic reasoning.** The finding holds, and the reality is worse than described. Verified facts:

1. The renderer NEVER consumes the adapter's `ready` promise. In packages/renderer-dom/src/mount.ts the adapter is mounted at line 358 (`rec.media = pickAdapter(...).mount(...)`) but there is no `.then`/`.catch`/`await` on `rec.media.ready` anywhere in the file (grep for `.ready` in mount.ts returns nothing). The promise is created and self-silenced in image.ts:103 (`ready.catch(() => {})`).

2. As a direct consequence, the `load`, `loaded`, and `loadError` events are NEVER emitted by any production code. `grep -rn \"emit(['\"]load\" packages --include=*.ts | grep -v dist` returns zero hits; `loadError` appears only in the type definition (events.ts:54) and compiled dist. Yet these events are a committed v1 contract: GALLERIST_SPEC.md:555 (\"load, loaded, loadError (per item, with id)\") and IMPLEMENTATION.md:183 list them as shipping events. So a documented public event that never fires is both untested AND non-functional — the missing renderer test is precisely what would have caught this.

3. The finding's one framing inaccuracy: it assumes loadError IS emitted by the renderer and merely untested. In fact it is never emitted. The reviewer's proposed test (\"mount, open on an item whose img fires 'error', assert loadError emitted with the item id\") would currently FAIL because nothing wires the rejection to an emit — which strengthens, not weakens, the value of the test.

4. The AbortController path the finding cites IS wired (mount.ts:355 `rec.abort?.abort()`, 357-362 creating a fresh AbortController per item and passing `abort.signal` into the adapter ctx) and the adapter reacts to it (image.ts:40,49,69). But there is no test asserting that navigating off an item calls abort or that the in-flight signal rejects — confirmed by grepping mount.test.ts (only mock `ready: Promise.resolve()` at line 337).

5. The decode()-rejects-but-reveal-anyway catch (image.ts:55-57) is untested — image.test.ts has no test dispatching a load event where decode throws.

6. E2E never serves a broken/404 image — grep of e2e/tests/*.spec.ts for 404/broken/error/loadError/decode returns nothing.

So the unhappy media path (error, abort, decode-failure) is covered only at the adapter unit boundary (image.test.ts:87,113), never through the mount pipeline, and the loadError contract is silently broken. \"important\" is the correct severity for the test dimension; the underlying never-emitted-event is arguably a correctness bug the missing test should gate.

**Verified evidence.** packages/renderer-dom/src/mount.ts:358 mounts adapter but no `.ready` reference exists in the file (grep `.ready` in mount.ts → empty). packages/renderer-dom/src/adapters/image.ts:103 `ready.catch(() => {})` self-silences; image.ts:55-57 decode catch; image.ts:63-66 onError rejects `image load error: ${item.id}`. packages/core/src/events/events.ts:52-54 declare load/loaded/loadError; `grep -rn "emit(['\"]load" packages` → zero hits (never emitted). docs/GALLERIST_SPEC.md:555 and docs/IMPLEMENTATION.md:183 list them as shipping events. AbortController wired at mount.ts:355-362; adapter reacts at image.ts:40,49,69. mount.test.ts:337 mocks `ready: Promise.resolve()` only; no error/abort/loadError assertions. e2e/tests/*.spec.ts contain no 404/broken/error/decode coverage.

---

## [32] Broken / failed images stay permanently invisible (no error state)

- **Dimension:** uiux-a11y
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/adapters/image.ts:53-66`, `packages/theme-default/src/gallerist.css:119-130`

**Description.** .gallerist-media-image starts at opacity:0 and only becomes visible via the [data-gallerist-loaded] attribute, which is set exclusively in onLoad. onError rejects the ready promise but never sets data-gallerist-loaded and never adds any error marker, so a 404/decode-failure leaves a fully transparent <img> with its broken-image glyph hidden and no fallback. The user sees an empty stage with chrome and no indication anything failed. There is also no loading affordance beyond the optional LQIP placeholder (a spinner/skeleton is absent), so slow loads look like nothing is happening.

**Impact.** A single broken URL produces a blank viewer with no feedback — looks like a crash to end users and gives screen-reader users (relying on alt) nothing. This is a polish blocker for v1.

**Recommended fix.** In onError, set an error marker on the slide/img (e.g. data-gallerist-error) and reveal it; in CSS render a visible broken-state (icon + the item's alt text as caption) for [data-gallerist-error]. Optionally add a lightweight loading skeleton/spinner that shows until data-gallerist-loaded or data-gallerist-error. Keep the rejected promise for adapters but make the DOM state user-visible.

**Skeptic reasoning.** The finding is mechanically accurate and I verified every link in the chain by reading the cited files plus the renderer that consumes the adapter.

1. image.ts:119-130 of the CSS sets .gallerist-media-image { opacity: 0 } and only flips to opacity:1 via .gallerist-media-image[data-gallerist-loaded] (css 128-130). 2. In image.ts, data-gallerist-loaded is set on EXACTLY two success paths: onLoad (line 60) and the custom-element loader resolve (line 90). 3. onError (image.ts:63-66) only calls cleanup() and reject(new Error(...)); it sets no attribute and adds no error marker. So a 404/decode failure leaves the <img> permanently at opacity:0. 4. The rejected ready promise is dead-ended: image.ts:103 does `ready.catch(() => {})`, and a grep of mount.ts (the only consumer of the mounted media, line 358) shows ZERO references to ready/error/catch/loaded — the renderer stores rec.media but never observes ready, so the rejection produces no visible state change. 5. A grep of the entire theme CSS for error/fail/broken/fallback returns nothing — no [data-gallerist-error] style exists. 6. Because the LQIP placeholder is painted as a background-image on the SAME .gallerist-media-image element (image.ts:15), and opacity:0 applies to the whole element, even the placeholder disappears on error — so the user truly sees only backdrop+chrome, and the native broken-image glyph is hidden too.

The reviewer also flagged the missing loading affordance. This is not merely a nice-to-have: GALLERIST_SPEC.md §27.7 and §27.11 make it binding — "If a load exceeds ~600ms, show a faint skeleton shimmer over the placeholder" and "No spinner-on-black anywhere." No such shimmer/skeleton exists in the CSS or renderer.

Severity: "important" is correct. It is not critical (no crash, data loss, or security impact; confined to the broken-source path), but a single bad URL yields a viewer that looks crashed with zero feedback, plus an unmet binding spec requirement for the >600ms loading state. That is a legitimate v1 polish blocker. The proposed fix (set data-gallerist-error in onError, reveal a visible broken state + caption from alt, optional skeleton until loaded/error, keep the rejected promise) is sound.

**Verified evidence.** packages/renderer-dom/src/adapters/image.ts:60 (data-gallerist-loaded set in onLoad), :63-66 (onError only cleanup()+reject, no marker), :90 (data-gallerist-loaded on loader resolve), :103 (ready.catch(()=>{}) swallows rejection), :15 (LQIP painted as background-image on the same img). packages/theme-default/src/gallerist.css:125 (opacity:0), :128-130 (opacity:1 only via [data-gallerist-loaded]); grep of full CSS for error/fail/broken/fallback returns nothing. packages/renderer-dom/src/mount.ts:358 (adapter mounted, rec.media stored) and grep of mount.ts for ready/error/catch/loaded returns nothing — ready rejection has no consumer. docs/GALLERIST_SPEC.md:727 (">600ms → skeleton shimmer over placeholder") and :749 ("No spinner-on-black anywhere") — binding loading-affordance requirement that is unmet.

---

## [33] Dialog has no accessible name

- **Dimension:** uiux-a11y
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/mount.ts:194-201`

**Description.** The overlay root sets role=dialog + aria-modal but no aria-label or aria-labelledby. A dialog with no accessible name is announced as just "dialog" by screen readers and is an axe best-practice/WCAG concern (aria-dialog-name). The existing axe test passes only because axe's aria-dialog-name rule is tagged best-practice / wcag412 and may not be in the wcag2a/wcag2aa tag set used in a11y.spec.ts:11, so it slips through.

**Impact.** Screen-reader users get no announced purpose when focus enters the viewer. Reduces clarity and trips stricter audits some downstream consumers run (e.g. wcag412 / best-practice tags).

**Recommended fix.** Give the dialog a name: either aria-label="Media viewer" (overridable via a mount option) or aria-labelledby pointing at the counter/caption. Add 'best-practice' to the axe tags in the e2e test so this class of issue is caught.

**Skeptic reasoning.** The finding is accurate. mount.ts:195-196 sets role='dialog' + aria-modal='true' on the overlay root, but I verified by grepping the entire mount.ts that no aria-label, aria-labelledby, or title is ever applied to that root element — the only aria-labels found are on child buttons (close/prev/next/rail toggle), and the only root-attr override path is preset.rootAttrs (line 193), which is not a naming guarantee. So the dialog has no accessible name and would be announced as just "dialog" by screen readers.

The reviewer's explanation of WHY the existing axe test passes also checks out against the actually-installed axe-core 4.11.4: the aria-dialog-name rule (axe.js:31287-31299) is tagged only ['cat.aria','best-practice'] and its any-check requires one of aria-label/aria-labelledby/non-empty-title. The e2e test (a11y.spec.ts:11) filters to .withTags(['wcag2a','wcag2aa']), which excludes best-practice rules, so this violation genuinely slips through.

One minor inaccuracy in the reviewer's supporting detail: they said the rule is tagged "best-practice / wcag412", but the installed version tags it only cat.aria + best-practice (no wcag412). This does not change the conclusion — the rule is outside the tested tag set either way, and a named dialog is APG/best-practice guidance. Given the spec markets a11y as "first-class, not bolted on" (§17, GALLERIST_SPEC.md:532-541) and follows the APG dialog/carousel pattern, leaving the dialog unnamed is a legitimate gap. It is a best-practice / UX-a11y concern rather than a hard WCAG 2 A/AA failure, which lands it squarely at "important" (not critical) for a v1 library. The proposed fix (aria-label='Media viewer', overridable, or aria-labelledby to the counter/caption, plus adding 'best-practice' to the axe tags) is correct.

**Verified evidence.** packages/renderer-dom/src/mount.ts:195-196 sets role='dialog'+aria-modal='true' with no name; grep over mount.ts shows aria-label only on child buttons (lines 233,242,255,260,263,268,272,275,445), never on root. node_modules/.pnpm/axe-core@4.11.4/.../axe.js:31287-31299 — aria-dialog-name tags=['cat.aria','best-practice'], any=[aria-label,aria-labelledby,non-empty-title]. e2e/tests/a11y.spec.ts:11 uses .withTags(['wcag2a','wcag2aa']), excluding best-practice. docs/GALLERIST_SPEC.md:532-541 (a11y first-class, APG carousel/dialog pattern).

---

## [34] Left/right vertical rail opens the item-panel/peek flyout over the stage with no collision handling

- **Dimension:** uiux-a11y
- **Effective severity:** important  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/theme-default/src/gallerist.css:727-741`, `packages/theme-default/src/gallerist.css:656-672`, `packages/plugin-thumbnails/src/index.ts:225-254`

**Description.** For a left rail the item column/peek flyout is positioned at left: calc(100% + 10px); top: 8px (and mirror for right), i.e. it floats out over the stage from the top of the rail. There is no max-width, no clamp to the viewport, and the flyout is anchored top-aligned regardless of where the active card is — for a tall rail the active card may be far down while the panel is pinned to the top, breaking the visual link. The peek's inline left is computed from the card's rect relative to the region host (index.ts:246-248) for the bottom rail, but for vertical rails the CSS hard-overrides left/right/top/bottom, so the JS-computed offset is discarded and every peek opens at the same fixed spot — multiple cards peek to an identical, non-adjacent location.

**Impact.** In the 'contact' preset (right rail, shipped) the item preview can sit far from the card it describes and overlap media, hurting the core nested-navigation UX. Looks broken on tall viewports.

**Recommended fix.** For vertical rails, compute the flyout's cross-axis offset (top) from the hovered/active card's rect like the horizontal path already does for left, and clamp it within the region host height. Add max-width and an overflow guard so it never spills off-screen.

**Skeptic reasoning.** The core UX defect is real and ships in the `contact` preset, but the reviewer's stated mechanism for the peek is partly inverted. I verified the cascade and JS by hand.

WHAT IS CONFIRMED:
1) The `contact` preset ships with a right (vertical) rail and stacked thumbnails (peek enabled): presets.ts:49-55 (`rail: 'right'`) and plugin-thumbnails/src/index.ts:128 (`groupDisplay` defaults to 'stacked'). So the buggy path is the default shipped behavior, not hypothetical. The react playground also exposes left/right rails (main.tsx:99,149-150) with stacked groups, so it is directly reachable.
2) NO horizontal clamp / NO max-width: the only size guard on `.gallerist-thumb-items[data-axis=vertical]` and `.gallerist-thumb-peek` is `max-height: 60vh` (gallerist.css:332, 373). There is no `max-width`/`max-inline-size` and no viewport clamp anywhere, so a wide/tall preview can spill off-screen. Confirmed via grep of the whole stylesheet.
3) Top-pinned regardless of active card: the vertical-rail override hardcodes `top: 8px` (gallerist.css:732, 739). `rebuildItemColumn` (index.ts:338-358) writes NO inline position styles, so the active item panel relies entirely on CSS and is pinned to the top of the region even when the active card is far down a tall rail — breaking the visual link, exactly as claimed.

WHERE THE REVIEWER IS WRONG (mechanism, not conclusion): The claim that "the CSS hard-overrides left/right/top/bottom, so the JS-computed offset is discarded and every peek opens at the same fixed spot" is backwards. Inline styles beat any selector. `openPeek` writes only `col.style.left` (index.ts:248) — no top/right/bottom. So for a LEFT rail, inline `left` WINS over CSS `left: calc(100% + 10px)` (gallerist.css:730), and for a RIGHT rail the inline `left` + CSS `right: calc(100% + 10px)` (gallerist.css:737) over-constrain a width:auto absolutely-positioned box (the peek has no `width`, gallerist.css:365-380), so per CSS the `right` is ignored and inline `left` wins again. The net effect is the opposite of "discarded": the inline `left` — which is computed for the bottom/horizontal layout (card-left relative to the host) — leaks into the vertical layout and DEFEATS the CSS intent to push the flyout toward the stage. Because all cards in a vertical rail share roughly the same x-band, the peek lands over the rail/cards (not toward the stage) and pinned at top:8px. So it is mis-placed, but not because JS was discarded.

NET: a genuine, visible UI/UX bug on a shipped preset (peek/item panel mis-positioned, top-pinned, unclamped). It is cosmetic-positioning, not a functional break (panels still appear, are clickable, and height-clamped), and tests only assert attributes (mount.test.ts:450-454) — nothing guards visual position. That keeps it at important rather than critical. The proposed fix direction is sound (drop/guard the inline left for vertical rails, anchor the cross-axis offset to the active/hovered card's rect, clamp within the region host, add max-width), though the author should note the real cause is the leaking inline `left`, not CSS overriding JS.

**Verified evidence.** packages/theme-default/src/gallerist.css:728-741 (vertical-rail override: left:calc(100%+10px)/right:calc(100%+10px), top:8px, bottom:auto); gallerist.css:365-380 (.gallerist-thumb-peek base: position:absolute, bottom:calc(100%+10px), max-height:60vh, NO width, NO max-width); gallerist.css:326-333 (.gallerist-thumb-items vertical: same, max-height:60vh only); packages/plugin-thumbnails/src/index.ts:248 (only inline write is `col.style.left = cardRect.left - baseRect.left`); index.ts:338-358 (rebuildItemColumn sets no inline position); index.ts:128 (groupDisplay default 'stacked'); packages/renderer-dom/src/presets.ts:49-55 (contact preset rail:'right'); examples/react/main.tsx:99,149-150 (left/right rails reachable in playground)

---

## [35] Root keydown handler hijacks typing and activation inside interactive overlays / chrome

- **Dimension:** uiux-a11y
- **Effective severity:** important  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → important)
- **Files:** `packages/renderer-dom/src/mount.ts:565-606`, `packages/renderer-dom/src/overlays/render.ts:72`, `packages/react/src/Gallerist.tsx:121-148`

**Description.** onKey is attached to root and matches plain printable keys: digits 1-9 jump to a screen, '+'/'='/'-'/'0' zoom, 't'/'T' toggle the rail, and plugin single-letter keymaps (e, g, f, d…) fire. Because the handler lives on the container and keydown bubbles, these fire even when focus is inside an interactive overlay input/textarea (overlays support interactive focusable content, render.ts:72) or any plugin-contributed text field. Typing '2' in an overlay text box would navigate the gallery; typing 't' toggles the rail. There is no guard for e.target being an editable element, contentEditable, or for modifier keys. Note arrows still call preventDefault unconditionally (line 604), which is fine for arrows but the printable-key branch returns before preventDefault — yet it has already invoked navigation.

**Impact.** Any real-world overlay form, caption editor, comment box, or search field becomes unusable and surprising — a serious UX/a11y wart that is costly to change after 1.0 because consumers will have built around it.

**Recommended fix.** At the top of onKey, bail out when the event originates from an editable target: if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(input|textarea|select)$/i.test(e.target.tagName))) return; also ignore when e.ctrlKey/metaKey/altKey are set for the single-letter/digit shortcuts. Consider scoping nav keys so they don't trigger when a button has focus and the key is Space/Enter.

**Skeptic reasoning.** I read all cited code and it fully supports the finding. The keydown handler is attached to the root container (mount.ts:606: root.addEventListener('keydown', onKey)), and onKey (mount.ts:565-605) acts on plain printable keys with no target guard: '+'/'='/'-'/'0' zoom (576-585), 't'/'T' toggles the rail (586-588), digits 1-9 jump to an item (597-598 via viewer.goTo), and any single-letter pluginKeymap key fires (599-600). There is no check for e.target being an input/textarea/select/contentEditable and no check for e.ctrlKey/metaKey/altKey anywhere — a repo-wide grep for isContentEditable/tagName/ctrlKey/metaKey returned only test files, and the React adapter and core have zero keydown handling.

Crucially, interactive overlays and regions are descendants of root, so their keydown events bubble straight into onKey. paintOverlays mounts the overlay host into content -> slide -> track -> stage -> root (mount.ts:339-342, 208-209), and region hosts (toolbar/footer/thumbnails) and chrome are appended to root (mount.ts:219-282). Interactive overlays are given pointer-events:auto and tabIndex=0 and render arbitrary string|Node content (overlays/render.ts:64,71-72). The React Overlay component (Gallerist.tsx:121-147) portals arbitrary children — which can include input, textarea, or contentEditable — into that interactive host. So typing '2' in an overlay text field navigates the gallery and typing 't' toggles the rail, exactly as claimed.

This is not a misread or an edge case the spec disclaims; the spec actively promises it as a supported pattern: GALLERIST_SPEC.md:537 states 'overlays that are interactive are tab-reachable', and it lists plugin-captions (rich captions) and plugin-share as supported plugins — interactive content that plausibly contains text inputs. The default keyboard map (spec section 5, lines 170-182) says nothing about an editable-target exemption, so the behavior is a real gap, not an intentional documented choice.

The finding's secondary observation is also accurate: the digit/plugin branch invokes navigation/plugin actions and then returns before reaching e.preventDefault() at line 604 (preventDefault only runs for the explicit cases like arrows, zoom, rail, Home/End). That nuance is correct and does not weaken the core claim. Severity 'important' is right: it makes any real-world overlay form/caption editor/comment box/search field unusable and surprising, it is an a11y/UX defect, and it is costly to fix post-1.0 because the proposed guard (bail when e.target is editable, or when modifier keys are held for single-letter/digit shortcuts) changes observable keyboard behavior consumers will have built around. I keep it 'important' rather than 'critical' because it does not break the core viewer for the common (no-interactive-overlay) case and has a small, well-understood fix.

**Verified evidence.** mount.ts:606 attaches onKey to root; mount.ts:586-588 't'/'T' toggles rail, 597-598 digits goTo, 599-600 pluginKeymap fires, with NO e.target/modifier guard. Overlay/region hosts are root descendants: mount.ts:339-342 (overlayHost into content/slide/track) + 208-209/219-282. overlays/render.ts:64,71-72 interactive overlays get pointer-events:auto + tabIndex=0 + arbitrary Node render. react/src/Gallerist.tsx:131-147 portals arbitrary children (inputs/textarea) into that host. GALLERIST_SPEC.md:537 promises interactive overlays are tab-reachable. Repo-wide grep for isContentEditable/tagName/ctrlKey/metaKey: only test files — no guard exists.

---


# 🟡 SUGGESTION

## [36] Overlay render contract is renderer-coupled (returns HTMLElement/Node) inside the DOM-free core types

- **Dimension:** architecture
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/types.ts:83-96`, `packages/core/src/types.ts:30-51`

**Description.** OverlaySpec.render (`(ctx) => HTMLElement | string | Node`) and MediaAdapter/MountedMedia (`element: HTMLElement`, `mount(item, slot: HTMLElement, …)`) are declared in core/types.ts. These are type-only (no runtime DOM access, so the headless/zero-dep invariant holds), but they bake the DOM as the only possible renderer target into the frozen core contract. The project goal is a framework-agnostic, renderer-pluggable engine; a future canvas/native/SSR-string renderer cannot satisfy `render: () => HTMLElement`.

**Impact.** It contradicts the stated 'renderer-agnostic core' positioning and is a 1.0-frozen assumption. Not a v1 blocker (DOM is the only shipped renderer), but worth a conscious decision before freezing, since generalizing the overlay/adapter return type later is breaking.

**Recommended fix.** Either explicitly document that v1's core overlay/adapter contract is DOM-targeted (and accept that a non-DOM renderer would need a new contract in a future major), or parameterize the render/element type (e.g. `OverlaySpec<TNode = Node>`) so the core stays renderer-neutral. A short ADR recording the choice would suffice given the existing adr/ directory.

---

## [37] RegionName widening `(string & {})` allows plugins to claim regions the renderer doesn't host, silently dropping their UI

- **Dimension:** architecture
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/plugins/types.ts:8`, `packages/renderer-dom/src/mount.ts:212-220`, `packages/renderer-dom/src/regions.ts:21-23`

**Description.** RegionName is `'toolbar'|'footer'|'stage'|'thumbnails'|'backdrop'|(string & {})`, so any arbitrary string type-checks as a region name. But the DOM renderer only creates hosts for the five known regions (mount.ts:212-220), and `mountPluginRegions` silently `continue`s when `!host` (regions.ts:22-23) — no warning. A plugin that registers `regions: { sidebar: … }` compiles fine and produces nothing at runtime with zero diagnostics.

**Impact.** Plugin authors get no feedback when they target a region the active renderer doesn't provide — the contract advertises open-ended region names but the only shipped renderer rejects unknown ones silently. This is a quiet leaky abstraction between the (renderer-agnostic) contract and the (fixed) DOM renderer.

**Recommended fix.** Either keep RegionName a closed union (drop `(string & {})`) so unknown regions are a type error, or have `mountPluginRegions` emit a dev `console.warn` when a plugin targets a region the renderer doesn't host, mirroring the existing last-wins warning. Document which regions the default renderer guarantees.

---

## [38] core's public index leaks internal engine primitives (FSM, store, spring, nav, zoom math) as the 1.0 surface

- **Dimension:** architecture
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/index.ts:15-52`

**Description.** The core barrel re-exports a large set of low-level internals that the spec/impl treat as engine guts: `reduceFsm`/`initialFsm`/`FsmEvent`/`FsmState`, `createStore`/`Store`, `sampleSpring`/`SPRINGS`/`SpringParams`, the full nav module (`goTo`/`nextGroup`/`prevGroup`/`nextItem`/`prevItem`/`applyItemMemory`/`resolveId`/`NavCtx`), `normalize`, and all of the zoom math (`clampPan`/`fitTransform`/`focalZoom`/`contentToStage`/`stageToContent`/etc.). The renderer legitimately needs a few (clampScale, focalZoom, windowIndices, reconcileKeys, the public types), but exporting the FSM reducer, the store factory, spring tables, and the entire nav module as named public API means all of them are frozen at 1.0 and any refactor (e.g. changing the FSM event shape, store signature, or nav signatures) becomes a breaking change.

**Impact.** Over-broad public surface increases the 1.0 freeze blast radius and the d.ts size, and invites consumers to build on internals you intended to keep private (the brief explicitly asks whether internal types are leaking). It also blurs the 'minimal, intentional public types' goal.

**Recommended fix.** Split the surface: keep `createViewer`, the data-model/state/event/overlay/plugin types, and the handful of helpers the renderer/plugins genuinely need (windowing, a small set of zoom converters) on the public root. Move FSM internals, the store factory, spring internals, and the raw nav module to a deep/internal entry (e.g. `@gallerist/core/internal`) or share them within the workspace without re-exporting from the published root. Audit each export against 'would a non-Gallerist consumer ever call this directly?'

---

## [39] Item axis now wraps on `loop` — diverges from spec §5 (only the primary axis 'Wraps if loop')

- **Dimension:** core-correctness
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/nav/nav.ts:49-63`, `docs/GALLERIST_SPEC.md:163-164`

**Description.** Commit d841da6 ('loop the item axis too') made `nextItem`/`prevItem` wrap within the group when `loop` is true. Spec §5 explicitly says only the primary axis 'Wraps if loop'; the secondary-axis bullet says nothing about wrapping. This couples two distinct behaviors (group-axis carousel looping vs. bounded variant scrubbing) to a single `loop` flag, so a consumer can no longer get the spec's described combination (looping groups + clamped items). It was an intentional fix for an issue, but it's now a locked-API behavior that contradicts the locked spec text.

**Impact.** Behavioral surprise for the monitoring/variant use case (Apploye): pressing ↓ at the last item of a group jumps back to the first item instead of stopping, which for a vertical variant axis is usually not desired. Changing this after 1.0 is a breaking nav-semantics change.

**Recommended fix.** Reconcile spec and code: either update spec §5 to state both axes wrap on `loop` (and log it in the §24 decision log), or split the flag (e.g. `loopItems` / per-axis loop config) so item-axis wrap is independently controllable, defaulting to the spec's bounded behavior. Decide before publish since it's a nav-contract lock.

---

## [40] prevItem/nextItem do not re-clamp an out-of-range incoming index

- **Dimension:** core-correctness
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/nav/nav.ts:49-63`

**Description.** If `cursor.i` is already out of range for its group, `prevItem` just decrements (i=5, count=3 → i=4, still out of range) and `nextItem` only happens to clamp via the `>=count` branch. There's no defensive clamp of the incoming index into [0,count). Today all cursors flow through `goTo`/`resolveId`/`applyItemMemory`, which keep `i` in range, so this is not reachable via the public API — but it's a fragile invariant: any future code path (or a plugin computing a cursor) that produces an out-of-range `i` will get a still-invalid result from prevItem rather than a clamped one.

**Impact.** Latent defense-in-depth gap. Not currently exploitable through the documented API, so impact is low, but it undermines the 'nav functions always return a valid cursor' guarantee the rest of the engine relies on.

**Recommended fix.** Clamp the incoming index at the top of both functions: `const cur = Math.min(Math.max(0, cursor.i), count - 1)` before stepping, mirroring `goTo`. Add a test feeding an out-of-range index.

---

## [41] sampleSpring divides by (count-1): count=1 yields NaN sample times, count=0 returns [] silently

- **Dimension:** core-correctness
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/motion/spring.ts:56-62`

**Description.** The sampling loop uses `(settle * i) / (count - 1)`. With `count=1`, the denominator is 0: the single index hits `at(NaN)`, then `values[0]=0` and `values[count-1]=values[0]=1` both write index 0, so the array silently becomes `[1]` (verified). With `count=0` the loop never runs and `values[0]=0`/`values[-1]=1` are no-ops, returning `{values:[], ...}`. Neither input is validated.

**Impact.** Low — the default count is 60 and callers are internal — but a plugin or renderer requesting `sampleSpring(p, 1)` for a single keyframe gets a meaningless `[1]` instead of `[0,1]` or a clear error, and `count<=0` returns an empty keyframe set that would break `Element.animate`. A latent footgun for the keyframe consumers.

**Recommended fix.** Validate/clamp `count` to >= 2 (or special-case 1 to return `[1]` deliberately and document it). Cheap guard: `const n = Math.max(2, count)` and sample over `n`.

---

## [42] Drag-to-dismiss sets --gallerist-dismiss but the default theme never consumes it (dead backdrop feedback)

- **Dimension:** cross-cutting
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/gestures.ts:161`, `packages/renderer-dom/src/gestures.ts:200`, `packages/theme-default/src/gallerist.css:1`

**Description.** During a close/dismiss drag the renderer writes `stage.style.setProperty('--gallerist-dismiss', <0..1>)` (gestures.ts:161) and clears it on release (gestures.ts:200), clearly intending the theme to fade/dim the backdrop proportionally to drag distance. A grep of packages/theme-default/src/gallerist.css finds zero references to `dismiss` or `--gallerist-dismiss`, so the property has no effect with the shipped theme. The content layer does shrink (live transform), giving partial feedback, but the intended progressive backdrop dim is absent.

**Impact.** Drag-to-dismiss feels less responsive/discoverable than designed; the backdrop does not communicate dismissal progress. A theme author also has no documented token to hook.

**Recommended fix.** Add a rule in the default theme keying backdrop opacity (or a scrim) off `var(--gallerist-dismiss, 0)`, and document the property in PLUGIN-AUTHORING/theme docs as a public theming hook.

---

## [43] No ResizeObserver on the stage — overlay geometry and pan bounds are computed once per item and never recomputed on resize

- **Dimension:** performance
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/mount.ts:383-399`, `packages/renderer-dom/src/overlays/render.ts:48-112`, `packages/renderer-dom/src/gestures.ts:634-644`

**Description.** Content-anchored overlays are positioned from stage.getBoundingClientRect() captured at the moment the item changes (mount.ts:384), and gesture pan bounds read the stage rect lazily per gesture (gestures.ts:635). There is no ResizeObserver anywhere in the renderer (confirmed by grep). On a window/container resize without an item change, content-anchor overlay boxes (computed in px from the old stage size, position.ts:contentAnchorBox) become stale and mispositioned until the next navigation. This is more a correctness gap than a perf cliff, but it is the perf-relevant tradeoff: there is intentionally no per-frame re-measure (good for perf), but also no event-driven re-measure (bad for correctness on resize).

**Impact.** Image-space overlays drift from their anchor points after a viewport resize until the user navigates. The gesture path self-heals (it re-reads the rect on next gesture), but painted overlays do not.

**Recommended fix.** Add a single debounced ResizeObserver on the stage that, on size change, repaints the current slide's content-anchor overlays (force rec.overlayItemId = undefined then renderWindow). Keep it debounced/RAF-batched so it does not reintroduce per-frame layout reads.

---

## [44] Store select() exists to scope notifications but no consumer uses it — every subscriber receives every commit

- **Dimension:** performance
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → suggestion)
- **Files:** `packages/core/src/store/store.ts:35-48`, `packages/renderer-dom/src/mount.ts:664`, `packages/plugin-thumbnails/src/index.ts:627`, `packages/plugin-grid/src/index.ts:134`, `packages/react/src/useGallerist.ts:21-23`

**Description.** The store ships a select(sel, fn, eq) API (store.ts:8-9, 35-48) documented as firing 'only when the selected slice changes (avoids over-notifying)', and it is unit-tested — but grep shows zero production callers. The renderer (mount.ts:664), thumbnails (index.ts:627), grid (index.ts:134) and React (useGallerist.ts) all use the bare full-state subscribe(). Each guards internally (thumbnails/grid early-return on unchanged cursor; updateChrome gates; React relies on getSnapshot identity), so correctness holds, but every store.set still invokes every subscriber callback. A zoom commit therefore wakes the thumbnail rail, the grid, and React even though none of them care about zoom — each pays at least a getState() read + comparison per commit.

**Impact.** Dead, untested-in-prod abstraction plus redundant subscriber invocations on the hottest path. With N plugins + React mounted, every zoom tick invokes N+2 callbacks that mostly early-return. It is cheap per call but multiplies the wheel/zoom fan-out and represents reactivity work that O(window) selectors would eliminate.

**Recommended fix.** Either route consumers that only care about cursor/collection through select(s => s.cursor, ...) with a tuple/shallow equality (rail, grid, chrome), so zoom commits don't wake them at all; or, if select() is not going to be adopted, drop it from the public API before 1.0 to avoid shipping/maintaining an unused exported surface. Adopting it is the higher-value option and directly reduces the per-commit fan-out.

**Skeptic reasoning.** The factual claims are accurate. select() is a shipped, exported, documented, unit-tested store API with zero production callers: grep across all non-test/non-dist .ts/.tsx finds `select` only in store.ts (definition) and store.test.ts (tests). All four cited consumers use bare subscribe(): renderer (mount.ts:664 `viewer.subscribe(sync)`), thumbnails (index.ts:627 `viewer.subscribe(render)`), grid (index.ts:134 `viewer.subscribe(...)`), React (useGallerist.ts:21-23 via useSyncExternalStore). store.set (store.ts:20-26) iterates every subscriber on every commit, so a zoom tick does wake the rail/grid/React callbacks, each of which early-returns (thumbnails index.ts:555 guards on col/g/i; grid index.ts:135 only renders when open; React relies on getSnapshot identity). So the dead-abstraction-plus-redundant-fan-out characterization is real.

However the finding overstates both severity and the fix. (1) Per-commit cost is trivial — a handful of callbacks (N plugins + renderer + React) doing a getState()/getCollection() read plus a couple of integer compares, not the O(window) work the impact section implies; set() already short-circuits unchanged state via Object.is at store.ts:22. Correctness is unaffected. This is suggestion-grade, not important. (2) The 'adopt select()' fix is under-specified/partly wrong: select is NOT reachable by any consumer today. The public ViewerApi exposes only getState() and subscribe() (api.ts:46-47); viewer.subscribe delegates to store.subscribe (createViewer.ts:222-223) but store.select is never surfaced on the viewer or plugin context (grep returns no matches in api.ts/createViewer.ts/plugins/types.ts). So 'route consumers through select(s => s.cursor)' requires first plumbing select through the viewer API — more than the finding suggests. The cleaner, lower-risk v1 action is the finding's alternative: drop select() from the public store surface before 1.0 rather than ship an exported-but-unused, unreachable API. Net: a real but minor pre-1.0 API-hygiene issue, downgraded to suggestion.

**Verified evidence.** store.ts:8-9,35-48 define+document select; grep (excl test/dist/node_modules) finds select only in store.ts + store.test.ts:58,70,80 → zero prod callers. Consumers use bare subscribe: mount.ts:664, plugin-thumbnails/src/index.ts:627, plugin-grid/src/index.ts:134, react/src/useGallerist.ts:21-23. Public surface lacks select: api.ts:46-47 lists only getState()+subscribe(); createViewer.ts:222-223 subscribe()→store.subscribe(fn); grep for `select` in api.ts/createViewer.ts/plugins/types.ts = no matches (exit 1). set() fan-out: store.ts:22 (Object.is short-circuit), store.ts:25 (`for (const fn of [...subs]) fn(state)`). Early-return guards: plugin-thumbnails index.ts:555, plugin-grid index.ts:135.

---

## [45] idle controller's activity handler does a DOM write (removeAttribute) on every pointermove/wheel during gestures

- **Dimension:** performance
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/idle.ts:59-64`

**Description.** onActivity is registered for pointermove, wheel, and touchstart (all passive, good) and calls root.removeAttribute(ATTR) unconditionally on every event. During an active pan/pinch/wheel-zoom these fire many times per second, and each invocation issues a removeAttribute even when the idle attribute is not set. removeAttribute on an absent attribute is cheap and does not itself force layout, but it is an avoidable DOM mutation on a per-move handler running concurrently with the gesture RAF. The re-arm is already throttled (REARM_THROTTLE_MS) but the attribute write is not guarded.

**Impact.** Minor: an unnecessary DOM API call per pointermove/wheel event for the lifetime of every gesture. Negligible in isolation but it runs in lockstep with the highest-frequency input handlers.

**Recommended fix.** Track an `isIdle` boolean and only call root.removeAttribute(ATTR) when it is actually set: `if (idleFlag) { root.removeAttribute(ATTR); idleFlag = false }`. Combine with the existing rearm throttle so the handler is near-free during gestures.

---

## [46] useGallerist returns freshly-allocated action closures on every render, breaking referential stability for consumers

- **Dimension:** performance
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/react/src/useGallerist.ts:25-38`

**Description.** useGallerist rebuilds the entire returned object — including 10 arrow-function wrappers (open/close/next/prev/nextItem/prevItem/goTo/goToId/zoomTo/resetZoom) — on every render. Because useSyncExternalStore re-renders the hook on every store commit (every zoom tick, per the fan-out findings), these closures are reallocated on every commit. Any consumer that passes e.g. `next` into a child's props or a useEffect/useCallback dep array will see a new identity each time and re-run/re-render needlessly. The wrappers are also redundant — they just forward to the already-stable viewer methods.

**Impact.** Per-render allocation of 10 closures and an object on the hottest React path, plus referential-instability foot-guns that defeat React.memo / dependency-array memoization in consumer code.

**Recommended fix.** Either return the viewer methods directly (they are stable for the viewer's lifetime), or wrap the action object in a useMemo([viewer]) so identities are stable across re-renders. Bind methods once: `useMemo(() => ({ open: viewer.open, ... }), [viewer])`.

---

## [47] plugin keymap handlers fire regardless of viewer phase and ignore focused text inputs

- **Dimension:** plugins-correctness
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/mount.ts:565-602`, `packages/plugin-download/src/index.ts:128-129`, `packages/plugin-grid/src/index.ts:144`, `packages/plugin-thumbnails/src/index.ts:600-602`

**Description.** The renderer's onKey dispatches pluginKeymap[e.key] in the default branch with no check for the viewer phase or the event target. So 'd' (download), 'g' (grid), 'e'/'E' (thumbnails item panel), and 'f' (fullscreen) fire whenever the .gallerist root has focus — including when a host-app input/textarea/contenteditable inside an overlay or footer region is focused, and (for plugins whose handlers don't self-guard, e.g. download running on the current item) potentially when closed. Single-letter shortcuts colliding with typing is the classic keymap footgun.

**Impact.** Surprising shortcut activation while typing in an embedded control; minor but a polish/a11y rough edge for v1.

**Recommended fix.** In the renderer keydown handler, skip pluginKeymap dispatch when the event target is an editable element (INPUT/TEXTAREA/SELECT/[contenteditable]) and/or when modifier keys are held, and optionally gate on phase==='open'. This is a one-place fix that protects all plugins' single-letter keys.

---

## [48] plugin-fullscreen: button click handler exits-vs-enters based on a global isFs() that can disagree with the bound viewer

- **Dimension:** plugins-correctness
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/plugin-fullscreen/src/index.ts:20-29`, `packages/plugin-fullscreen/src/index.ts:31`

**Description.** toggle() decides enter vs exit using isFs() = !!document.fullscreenElement, which is document-global. If some OTHER element on the page is fullscreen (e.g. a video, or another viewer), isFs() is true, so clicking this viewer's button calls document.exitFullscreen() and exits the unrelated element instead of entering fullscreen for this viewer. Combined with the global root() lookup, the enter/exit decision and the target element can both refer to the wrong thing. onChange likewise emits fullscreen:isFs() which reflects any document fullscreen, not this viewer's.

**Impact.** Cross-component interference and state desync on pages with other fullscreen content; edge but real.

**Recommended fix.** Base the toggle decision on whether THIS viewer's root is the fullscreen element: `const mine = () => document.fullscreenElement === el || el?.contains(document.fullscreenElement)`. Enter when not mine, exit only when mine. Emit fullscreen based on the same scoped check (the renderer already does this via isOurFullscreen at mount.ts:609-611 — mirror it).

---

## [49] plugin-fullscreen: no WebKit/Safari (and legacy) prefix support — broken on Safari

- **Dimension:** plugins-correctness
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → suggestion)
- **Files:** `packages/plugin-fullscreen/src/index.ts:18`, `packages/plugin-fullscreen/src/index.ts:23-28`, `packages/plugin-fullscreen/src/index.ts:48-54`

**Description.** The plugin only uses the unprefixed Fullscreen API: document.fullscreenElement, el.requestFullscreen, document.exitFullscreen, and the 'fullscreenchange' event. Safari (desktop and especially iOS) historically requires webkitRequestFullscreen / webkitFullscreenElement / webkitExitFullscreen / 'webkitfullscreenchange'. On affected Safari versions, `el.requestFullscreen?.()` is a no-op (optional-chaining swallows the missing method), isFs() always reads false, and the 'fullscreenchange' listener never fires, so fullscreenChange is never emitted and the button silently does nothing. The renderer's own rail-collapse logic (mount.ts:610-622) has the same unprefixed-only assumption. Note: iOS Safari on iPhone has no element fullscreen at all — only video elements — which should be documented.

**Impact.** A core advertised plugin is silently inert on a major browser; cross-browser quirks are explicitly in scope for this review and block a polished v1.

**Recommended fix.** Detect and call the available variant: `(el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el)`, read `document.fullscreenElement ?? document.webkitFullscreenElement`, exit via `(document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)`, and add a listener for both 'fullscreenchange' and 'webkitfullscreenchange'. Document the iOS-iPhone limitation.

**Skeptic reasoning.** The finding's code-level claims are all factually correct. I verified every cited line in packages/plugin-fullscreen/src/index.ts: isFs() (line 18) reads only document.fullscreenElement; toggle() (lines 24-25) calls document.exitFullscreen?.() / el.requestFullscreen?.() with optional chaining that silently no-ops when the method is absent; init() (line 49) only listens for 'fullscreenchange'. A repo-wide grep for "webkit" returns zero hits, so there is genuinely no prefixed fallback anywhere. The renderer rail-collapse logic at mount.ts:610-622 shares the identical unprefixed assumption (document.fullscreenElement + 'fullscreenchange'). So the mechanics are real: on a Safari version that only supports the webkit-prefixed API, the button is a silent no-op and fullscreenChange never fires.

HOWEVER, the claimed severity (important) is overstated once measured against the project's OWN locked browser-support contract. GALLERIST_SPEC.md:612 sets the supported baseline as "last 2 versions of Chrome/Edge/Firefox/Safari + iOS Safari 15+." Web research confirms desktop Safari and iPadOS shipped the UNPREFIXED Fullscreen API in Safari 16.4 (March 2023). As of the review date (June 2026), "last 2 versions of desktop Safari" is ~18/19 — far past 16.4 — so the unprefixed API the plugin uses works correctly on every desktop/iPad Safari version that is actually in scope. The breakage only occurs on Safari < 16.4, which is OUT of the supported "last 2 versions" window.

The one in-scope wrinkle is iOS Safari 15+ (the explicit floor): on iPhone, element fullscreen did not exist AT ALL until Safari 17.x — there is no webkit-prefixed element fullscreen on iPhone either. So the reviewer's proposed fix (add webkitRequestFullscreen fallback) would NOT make iPhone work; element fullscreen of a <div> is simply impossible on the iPhones in the support floor. The proposed fallback only meaningfully helps iPadOS 15-16 (a narrow, mostly-expired slice). The genuinely correct action is the part the reviewer almost buries: document the iPhone limitation. The current code already fails gracefully (optional chaining + try/catch swallow everything; no crash, no thrown error), which is acceptable degradation for an out-of-baseline browser.

Net: the issue is real but its practical blast radius is limited to browsers outside the locked support matrix, and the headline fix is partly ineffective for the one in-scope case. This is a low-priority polish item (add prefixed fallback for graceful behavior on stale Safari/iPadOS + document the iPhone no-element-fullscreen reality), not an "important" v1 blocker. Adjusting to suggestion.

**Verified evidence.** packages/plugin-fullscreen/src/index.ts:18 (isFs reads only document.fullscreenElement); :24-25 (document.exitFullscreen?.() / el.requestFullscreen?.() optional-chain no-op + try/catch swallow at :26-28); :49 (only 'fullscreenchange' listener). packages/renderer-dom/src/mount.ts:610-611 (document.fullscreenElement) and :622 (document.addEventListener('fullscreenchange',...)) confirm the same unprefixed assumption. grep -rn "webkit" --include="*.ts" packages/ returns no matches (no prefixed fallback exists). docs/GALLERIST_SPEC.md:612 locks support to "last 2 versions of Chrome/Edge/Firefox/Safari + iOS Safari 15+" — unprefixed Fullscreen API shipped in Safari/iPadOS 16.4, within that desktop window; iPhone has no element fullscreen through iOS 16 regardless of prefix.

---

## [50] plugin-video-youtube: no postMessage origin guard (playerVars.origin) on the embed

- **Dimension:** plugins-correctness
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/plugin-video-youtube/src/index.ts:112-126`

**Description.** The YT.Player config sets videoId and host but no playerVars.origin. YouTube's IFrame API docs recommend setting playerVars.origin to the embedding page's origin so the player validates the origin of postMessage commands. Without it the embed is more permissive about cross-origin messaging. The authoring doc's own security rules call out anchoring provider URL matching to the hostname (which this plugin does well) and documenting CSP for third-party scripts.

**Impact.** Hardening gap rather than an exploitable bug; tightens the postMessage channel between the page and the YouTube iframe.

**Recommended fix.** Pass `playerVars: { origin: window.location.origin }` in the Player config. Also document the required CSP (script-src https://www.youtube.com; frame-src https://www.youtube.com or youtube-nocookie.com) since the plugin injects a hardcoded third-party script.

---

## [51] plugin-video-youtube: valid-but-unparseable YouTube URLs build an empty player and the ready promise hangs

- **Dimension:** plugins-correctness
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → suggestion)
- **Files:** `packages/plugin-video-youtube/src/index.ts:31-34`, `packages/plugin-video-youtube/src/index.ts:97-128`

**Description.** match() accepts any URL whose hostname is youtube.com/youtu.be (via isYouTube), but parseYouTubeId returns '' for URLs it can't match: homepage, /playlist?list=..., or a 'v=' value that isn't exactly 11 word-chars. Verified: parseYouTubeId('https://www.youtube.com/playlist?list=...') => ''. The adapter then constructs `new YT.Player(host, { videoId: '' })`. The IFrame API never fires onReady for an empty/invalid videoId, so the mount's `ready` promise never resolves — it just sits pending (only swallowed by ready.catch). The slide shows a blank/broken embed with no error surfaced.

**Impact.** Silent broken-slide / never-ready state for a class of YouTube URLs the matcher claims to support; no graceful fallback or error event.

**Recommended fix.** Compute the id once before mounting; if parseYouTubeId returns '', either reject `ready` with a clear error (so the renderer can surface a load error) or decline the match (return false from match() when no id can be extracted) so another adapter / the error path takes over.

**Skeptic reasoning.** The core defect is real but the finding misdescribes its mechanism and overstates impact.

VERIFIED TRUE: match() (index.ts:98-101) accepts any youtube.com/youtu.be hostname via isYouTube, while parseYouTubeId (index.ts:31-34) returns '' for URLs its regex can't match. I reproduced this empirically: 'https://www.youtube.com/playlist?list=...', the bare homepage, /channel/..., /@creator, and a v= value that isn't exactly 11 word-chars all yield isYouTube=true but id=''. mount() then does `new YT.Player(host, { videoId: parseYouTubeId(...) })` at index.ts:113-114 with an empty id, and there is no onError handler wired anywhere in the file (the only onerror, index.ts:82, is on the API *script* load, and YTPlayerConfig.events at index.ts:42-46 declares only onReady/onStateChange). So a class of URLs the matcher claims to support produces a blank/broken embed with no error surfaced. That part is a genuine defect.

WHERE THE FINDING IS WRONG: (1) Mechanism. The claim 'the IFrame API never fires onReady for an empty/invalid videoId so ready hangs pending forever' is not accurate to the real API. new YT.Player() with an empty/invalid videoId still constructs the player and fires onReady; an invalid/missing video is reported via the onError callback (codes 2/5/100/101) and/or an error shown inside the embed — onReady is not withheld. So the actual symptom is a blank embed, not a hung never-ready viewer. (2) Impact/fix premise. The proposed 'reject ready so the renderer can surface a load error' would surface nothing. I grepped the whole repo: NO production code consumes .ready. The renderer at renderer-dom/src/mount.ts:358 calls adapter.mount() and stores it in rec.media but never awaits rec.media.ready; the only .ready references are tests and the image adapter's own self-comment (image.ts:102 'if no one awaits ready'). A pending or rejected ready is functionally identical to the user today.

Net: a real correctness/robustness gap (matcher accepts more than the parser handles; no onError fallback), but the practical symptom is a benign broken embed on unusual URLs (normal usage passes watch/share/shorts/embed URLs, all of which parse), not a viewer hang. The useful half of the fix is to decline the match (return false) when no id can be extracted. Downgrading from important to suggestion: real but narrow, low-frequency, non-fatal symptom, and the finding's headline mechanism is inaccurate.

**Verified evidence.** packages/plugin-video-youtube/src/index.ts:98-101 (match uses isYouTube only); :31-34 (parseYouTubeId returns '' on no match — reproduced via node: playlist/homepage/channel/@creator/short-v all => ''); :113-114 (videoId: parseYouTubeId(...) passed even when ''); :42-46 events interface has no onError; :82 onerror is only on the API script, not the player. renderer-dom/src/mount.ts:358 mounts and never awaits rec.media.ready. Repo-wide grep for '.ready' in non-test source: zero consumers (only declarations/assignments at core/src/types.ts:39, plugin-video/src/index.ts:61, plugin-video-youtube/src/index.ts:133, image.ts:109; image.ts:102 comment 'if no one awaits ready'). plugin-video-youtube/src/index.test.ts has no test for the empty-id case.

---

## [52] CJS type resolution falls back to the ESM .d.ts even though a matching index.d.cts is built

- **Dimension:** publish-security
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/package.json:12`, `packages/core/package.json:16`, `packages/react/package.json:12`

**Description.** tsup with dual ESM+CJS + dts emits both dist/index.d.ts and dist/index.d.cts (confirmed present in every package's dist). But the exports map uses a single top-level `"types": "./dist/index.d.ts"` and the `"require"` condition is a bare string `"./dist/index.cjs"` with no nested `types`. Under moduleResolution node16/nodenext, a CJS consumer therefore gets the ESM-flavored index.d.ts for the require path instead of index.d.cts. The condition order (types > import > require) is otherwise correct and both require() and import resolve at runtime.

**Impact.** Low in practice because the .d.ts and .d.cts contents are functionally identical here, so types still work. But it is exactly what the `@arethetypeswrong/cli` ('Masquerading as ESM/CJS') check flags, and it's a latent correctness gap if the two type files ever diverge. Cheap to make pristine before locking 1.0.

**Recommended fix.** Expand each exports entry to nest per-condition types: `".": { "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }, "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" } }`. Add `attw --pack` (are-the-types-wrong) to CI to keep all packages clean.

---

## [53] No npm metadata: missing repository, homepage, keywords, author, bugs, publishConfig

- **Dimension:** publish-security
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** **confirmed** (severity important → suggestion)
- **Files:** `packages/core/package.json:1`, `packages/react/package.json:1`, `package.json:1`

**Description.** No package.json (root or any package) declares `repository`, `homepage`, `keywords`, `author`, or `bugs`. `grep` for these fields returns none. There is also no `publishConfig` (the changeset config sets `access: public`, which covers the scoped-package access gate, but per-package `publishConfig` is still good practice). Without `repository`, npm cannot link the package to its source, provenance/'View source' is unavailable, and `npm audit`/Snyk source mapping is degraded.

**Impact.** Hurts npm SEO/discoverability (no keywords), removes the GitHub source link and issue/bugs link from every package page, and prevents npm provenance attestation on publish. All of these are cheap to add now and awkward to retrofit cleanly after launch.

**Recommended fix.** Add to each publishable package (or hoist common bits): `"repository": { "type": "git", "url": "git+https://github.com/<org>/gallerist.git", "directory": "packages/<name>" }`, `"homepage"`, `"bugs"`, `"author"`, and a `"keywords"` array (lightbox, gallery, media-viewer, headless, react, zoom, overlays). Consider `"publishConfig": { "access": "public", "provenance": true }` and publishing from CI with provenance.

**Skeptic reasoning.** The factual claim is fully verified. A grep for "repository"|"homepage"|"keywords"|"author"|"bugs"|"publishConfig" across every non-node_modules package.json returns zero matches (exit code 1). I personally read the three cited files: root package.json, packages/core/package.json, and packages/react/package.json — none contain any of these fields. There are 11 publishable @gallerist/* packages (core, react, renderer-dom, theme-default, and 7 plugin-*), all version 0.0.0 and all missing the metadata. The reviewer also correctly and honestly scoped the publishConfig point: .changeset/config.json:8 does set "access": "public", which the finding explicitly acknowledges covers the scoped-access gate, so the reviewer did not overstate. The impact claims are technically sound: npm provenance (--provenance) requires repository.url, and missing keywords/repository do degrade discoverability and the source link on package pages. However, I downgrade severity from important to suggestion: this is packaging/discoverability hygiene, not a correctness, runtime, or security vulnerability. It breaks nothing functional, exposes nothing, and is trivially fixable. Provenance is opt-in and absent today regardless, so its absence is not a regression — it is a missed best practice. For a v1 npm publish it is genuinely worth doing (cheap now, awkward later), but "important" overstates it relative to actual bugs.

**Verified evidence.** grep -rEl '"repository"|"homepage"|"keywords"|"author"|"bugs"|"publishConfig"' --include=package.json (excluding node_modules) returns no matches (exit 1). packages/core/package.json:1-27 has only name/version/description/license/type/sideEffects/files/main/module/types/exports/scripts/devDependencies — no repository/homepage/keywords/author/bugs/publishConfig. packages/react/package.json:1-40 same field set, none of the metadata. Root package.json:1-37 (name "gallerist-monorepo", private:true) — no metadata fields. .changeset/config.json:8 sets "access": "public" as the finding states. 11 publishable @gallerist/* packages confirmed via package-name listing, all missing the fields.

---

## [54] theme-default package.json has no top-level type/main/module/types and ships unbuilt src

- **Dimension:** publish-security
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/theme-default/package.json:7`, `packages/theme-default/package.json:8`

**Description.** @gallerist/theme-default ships `files: ["src"]` and exposes `"./gallerist.css": "./src/gallerist.css"` plus `"./package.json"`. It declares no `type`, `main`, `module`, or `types`. This is intentional (CSS-only, no build step — the build script just echoes a message), and the README import `@gallerist/theme-default/gallerist.css` matches the export. Functionally fine.

**Impact.** Minor: some bundlers/tools warn on a package with no main and a `files` whitelist pointing at src; and shipping from `src/` (rather than a `dist/`) is a slightly unusual convention that may confuse contributors. No runtime breakage.

**Recommended fix.** Optional polish: add `"sideEffects": ["*.css"]` is already present (good). Consider documenting the CSS-only nature in a short README and, if you want stricter hygiene, copy gallerist.css into a dist/ at pack time so the public path is dist-based like the other packages. Not a blocker.

---

## [55] workspace: protocol in dependencies and peerDependencies will pin internal deps to ^0.0.0

- **Dimension:** publish-security
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** **uncertain** (severity critical → suggestion)
- **Files:** `packages/react/package.json:24`, `packages/react/package.json:25`, `packages/renderer-dom/package.json:24`, `packages/plugin-thumbnails/package.json:20`, `packages/plugin-download/package.json:24`

**Description.** renderer-dom has `"@gallerist/core": "workspace:*"` in dependencies; react has `workspace:^` for both @gallerist/core and @gallerist/renderer-dom in peerDependencies; and every plugin has `"@gallerist/core": "workspace:^"` in peerDependencies. pnpm/changesets rewrite the workspace: protocol at publish time to the dependency's CURRENT version. Because that version is 0.0.0 (see version finding), the rewrite resolves `workspace:^` to `^0.0.0` and `workspace:*` to `0.0.0`.

**Impact.** `^0.0.0` is a near-useless range under semver (caret on a 0.0.x version only permits exactly 0.0.0), so a consumer installing @gallerist/react would demand the exact broken 0.0.0 of core/renderer-dom. Combined with the version finding this guarantees a broken first publish. Even after fixing versions, the workspace: protocol itself must never reach npm verbatim — if published without rewriting (e.g. via plain `npm publish` instead of `pnpm publish`/changeset publish) the literal string "workspace:^" is an invalid range and installs fail.

**Recommended fix.** Fix the versions first, then publish exclusively via `pnpm publish` / `changeset publish` (never raw `npm publish`) so the workspace: protocol is rewritten. Confirm the rewrite by inspecting the packed tarballs' package.json. Set `updateInternalDependencies` appropriately in .changeset/config.json (currently "patch") so internal ranges move together.

**Skeptic reasoning.** The finding bundles two claims of very different merit.

(1) The `workspace:` protocol usage is CORRECT, not a bug. I verified the cited lines: renderer-dom/package.json:24 has `"@gallerist/core": "workspace:*"` in dependencies; react/package.json:24-25 has `workspace:^` for core and renderer-dom in peerDependencies; plugin-thumbnails/package.json:20 and plugin-download/package.json:24 have `"@gallerist/core": "workspace:^"` in peerDependencies. This is idiomatic, recommended pnpm monorepo practice — pnpm/changesets rewrite the `workspace:` specifier to a concrete range at pack/publish time. The reviewer's own proposed fix concedes this ("publish exclusively via pnpm publish ... so the workspace: protocol is rewritten"). So there is NO edit to make in these files; the setup is right.

(2) The reviewer's semver math is technically accurate: every package is at version 0.0.0 (verified all 11 workspace packages plus root all read `"version": "0.0.0"`), and under semver caret-on-0.0.x, `^0.0.0` matches only exactly 0.0.0. So IF a release were cut at 0.0.0, the rewrite of `workspace:^` would yield a useless `^0.0.0` pin. BUT this is entirely DERIVATIVE of the separate version=0.0.0 finding — bump versions to a real release (e.g. 0.1.0/1.0.0) and `workspace:^` rewrites cleanly with zero changes to these files. It double-counts the version finding.

(3) The "literal workspace: string reaches npm if you run raw npm publish" risk is real but CONDITIONAL and not a present defect. I checked: `.changeset/` contains only config.json (no pending changesets, no release prepared), and `.github/workflows/ci.yml` has NO publish step at all (only install/audit/lint/typecheck/test/build/size/e2e). There is no pipeline today that would ship the literal protocol; the standard pnpm/changeset publish path the project is set up for handles the rewrite correctly. `updateInternalDependencies` is already `"patch"` in config.json, which is fine.

Net: the cited code is not itself buggy; the only real residual is a process caution (publish via pnpm/changesets, not raw npm publish — confirm via packed tarball) plus a symptom of the already-tracked 0.0.0 version issue. That is a worthwhile pre-publish checklist note (suggestion), not an independent critical code defect. I mark uncertain rather than rejected because the underlying publish hazard is genuine — just mis-scoped and over-severitized.

**Verified evidence.** packages/renderer-dom/package.json:24 `"@gallerist/core": "workspace:*"` (dependencies). packages/react/package.json:24-25 `"@gallerist/core": "workspace:^"`, `"@gallerist/renderer-dom": "workspace:^"` (peerDependencies). packages/plugin-thumbnails/package.json:20 and packages/plugin-download/package.json:24 `"@gallerist/core": "workspace:^"` (peerDependencies). All 11 workspace packages + root package.json read `"version": "0.0.0"`. .changeset/config.json: `"updateInternalDependencies": "patch"`, no pending changeset .md files present. .github/workflows/ci.yml:1-27 contains no publish/changeset-publish/npm-publish step — only build and test. The `workspace:` specifiers are valid pnpm monorepo syntax that publish tooling rewrites; the `^0.0.0` hazard is a consequence of the version=0.0.0 state, not of the workspace: protocol itself.

---

## [56] Home/End and digit keys ignore linear/flat traversal mode

- **Dimension:** renderer-correctness
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/mount.ts:590`, `packages/renderer-dom/src/mount.ts:597`

**Description.** In linear mode the counter and arrows operate on the flattened item sequence (mount.ts:164-183, 473-479), but Home jumps to goTo(0) (group 0, item 0) and End to goTo(lastGroup) (group N-1, item 0) — group boundaries, not the global first/last flat item. Similarly the 1-9 digit shortcuts call goTo(cur.g, n-1) to pick a within-group item even though the within-group pills are explicitly retired in linear mode. So in linear mode End lands on the last group's first item rather than the true last item, and digits jump within the current group inconsistently with the flat model.

**Impact.** Minor keyboard-navigation inconsistency in linear mode: End does not reach the actual last item, and digit keys expose a within-group concept that the linear UI otherwise hides.

**Recommended fix.** In linear mode, route Home→flatSeq[0], End→flatSeq[last] via viewer.goTo(t.g, t.i), and either disable digit shortcuts or remap them to the flat index.

---

## [57] Stacked overlay viewers clobber the body scroll-lock restore

- **Dimension:** renderer-correctness
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → suggestion)
- **Files:** `packages/renderer-dom/src/mount.ts:504`, `packages/renderer-dom/src/mount.ts:513`

**Description.** attach() captures prevOverflow = document.body.style.overflow and sets it to 'hidden'; detach() restores prevOverflow. If a second overlay viewer is opened while the first is still open, the second captures the already-'hidden' value as its prevOverflow. When either closes it restores 'hidden', and after both close the body is left with overflow:hidden — page scroll stays locked. There is no refcount or sentinel.

**Impact.** Opening a lightbox from within a lightbox (or any two concurrent overlay instances) permanently locks page scroll after close. Niche but a hard-to-diagnose data-loss-of-scroll bug for apps that nest viewers.

**Recommended fix.** Use a module-level open-overlay refcount: lock on first open, restore the original overflow only when the count returns to zero. Capture the original value once when the count goes 0→1.

**Skeptic reasoning.** The reviewer's mechanism is structurally accurate. I verified all load-bearing facts in mount.ts:

1. prevOverflow is a closure-local variable declared at line 492 INSIDE the mount() function body, so every mount() call gets its own private copy — there is no module-level state shared across instances.
2. attach() (overlay branch) does prevOverflow = document.body.style.overflow then document.body.style.overflow = 'hidden' (lines 504-505), and appends root to document.body (line 506).
3. detach() (overlay branch) does document.body.style.overflow = prevOverflow (line 515).
4. overlay is simply !opts.container (line 103); no singleton, registry, instance-limit, or sentinel anywhere in renderer-dom or core prevents two overlay viewers from being mounted and open concurrently.

Tracing two concurrent overlays from a default body (overflow ''):
- A opens: prevOverflowA='', body='hidden'.
- B opens: prevOverflowB='hidden' (captures A's lock), body='hidden'.
- If A closes first: body restored to '' while B is still open (premature unlock); then B closes restoring 'hidden' → body permanently locked after both are closed.
- If B closes first: correct, but only by luck of LIFO order.
Either ordering corrupts the scroll-lock state; the permanent-lock end state the reviewer describes occurs when the outer/first-opened viewer closes before the inner. The diagnosis, root cause, and proposed fix (module-level refcount: capture original once on 0→1, restore only on 1→0) are all correct.

Severity adjusted from important to suggestion: the bug is real but only triggers with two or more concurrent/nested overlay viewers. No spec or doc claims nested overlay viewers are a supported v1 scenario (the 'stacked' references in docs are about thumbnail layout, not stacked overlays). The dominant single-viewer path is correct and tested (mount.test.ts:39,56). It is a low-cost, defensible hardening worth doing, but not a release blocker and unlikely to be hit by typical consumers.

**Verified evidence.** packages/renderer-dom/src/mount.ts:492 (let prevOverflow = '' — closure-local, not module-level); :504-506 (attach: prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.appendChild(root)); :515 (detach: document.body.style.overflow = prevOverflow); :103 (const overlay = !opts.container — no singleton guard). grep across renderer-dom/src and core/src found no refcount/openCount/singleton/registry guarding body overflow. Tests at mount.test.ts:39 and :56 only cover the single-viewer lock/restore path, which works.

---

## [58] Wheel handler does forced layout per tick and never RAF-batches

- **Dimension:** renderer-correctness
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/gestures.ts:217`, `packages/renderer-dom/src/gestures.ts:84`

**Description.** onWheel calls geom() with no active gesture, so gestureGeom is null and getGeometry() runs stage.getBoundingClientRect() (a forced layout) on every wheel event, then commits zoom synchronously via viewer.zoomTo (triggering a full sync()/renderWindow()/applyTransform). On a high-frequency trackpad this is one layout read plus a full store-commit re-render per tick, where the pinch path deliberately snapshots geometry once and RAF-batches the transform.

**Impact.** Trackpad/wheel zoom can stutter and burn the 60fps budget on dense scroll, contrary to the §20 performance goal that the pinch path was written to protect.

**Recommended fix.** Snapshot geometry once for a wheel burst (cache the rect and invalidate on a short timer / next frame) and coalesce the imperative live transform through the same RAF schedule()/commit-on-idle path the pointer gestures use, committing to the store once the burst settles.

---

## [59] Empty and single-item collections are tested in pure nav but never through mount()/render at runtime

- **Dimension:** tests
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/nav/nav.test.ts:112`, `packages/renderer-dom/src/mount.test.ts:227`, `packages/renderer-dom/src/virtualization.test.ts:19`

**Description.** nav.test.ts covers the empty-collection no-op and single-item group; mount.test.ts covers a single-item group hiding the position indicator. But there is no renderer/mount test for opening an entirely empty collection (groups: []), where payloadAt returns undefined group/item (createViewer.ts:88-90) and the renderer must not crash trying to render a current slide. normalize allows items: [] → groups: [] (normalize.test.ts:38), so this state is reachable via the public API.

**Impact.** Opening an empty (or just-emptied via setCollection) viewer is a plausible real-world edge (async-loaded gallery that arrives empty) that could throw in the renderer with no test guarding it.

**Recommended fix.** Add a mount test that creates a viewer with items: [] (or setCollection to empty after open) and asserts open() does not throw, renders no slide/img, and the counter/chrome degrade gracefully.

---

## [60] Reduced-motion is only tested for the idle controller, not for the open/close/nav motion paths it must gate

- **Dimension:** tests
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/idle.test.ts:42`, `packages/renderer-dom/src/mount.ts:308`, `e2e/tests/motion.spec.ts:1`

**Description.** idle.test.ts asserts the idle controller is inert under reducedMotion (good). But the spec's reduced-motion contract for the actual transitions — the slide enter axis tagging (mount.ts data-gallerist-enter) and the reflow-to-restart-animation hack (mount.ts:308) — is not tested under prefers-reduced-motion. motion.spec.ts asserts the axis attribute but never with reduced motion forced. No test asserts animations are suppressed/instant when the user prefers reduced motion.

**Impact.** A WCAG-relevant motion path can regress (animate anyway under reduced-motion) without any failing test. Lower severity because the CSS likely media-queries it, but nothing verifies behavior.

**Recommended fix.** Add a Playwright test with page.emulateMedia({ reducedMotion: 'reduce' }) that opens, navigates, and asserts the slide transition is instant (e.g. animationName 'none' or duration 0). Confirm idle auto-hide stays off, which is already covered in unit.

---

## [61] Several assertions are weaker than they appear (threshold-only zoom checks, empty-array axe equality)

- **Dimension:** tests
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `e2e/tests/viewer.spec.ts:69`, `packages/renderer-dom/src/gestures.test.ts:93`, `e2e/tests/a11y.spec.ts:14`, `e2e/tests/plugins.spec.ts:146`

**Description.** Double-click zoom asserts only scale > 0.5 (gestures.test.ts:93) and wheel-zoom asserts scale > 1 (viewer.spec.ts:69) — both pass for any positive nudge and wouldn't catch a wrong target scale (e.g. toggleZoom returning fit+epsilon instead of max). axe tests assert results.violations toEqual([]) (a11y.spec.ts:14, plugins.spec.ts:146); equality on the whole violation objects is brittle and, more importantly, axe with default rules can pass while keyboard focus-trap / restore-focus-on-close (which axe does not check) is broken. There is no test that focus returns to the trigger element after close (only that focus enters on open, a11y.spec.ts:24).

**Impact.** Green tests give false confidence on zoom-target correctness and on a11y focus management — the focus-restore-on-close requirement common to lightboxes is entirely unverified.

**Recommended fix.** Assert exact expected zoom targets (toCloseTo(expected)) using known fit/max. Keep axe but add an explicit focus-trap test (Tab cycles within .gallerist) and a focus-restoration test (focus the trigger, open, close, assert document.activeElement is the trigger).

---

## [62] sampleSpring produces NaN / drops the start frame at small sample counts (untested edge)

- **Dimension:** tests
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** **uncertain** (severity important → suggestion)
- **Files:** `packages/core/src/motion/spring.ts:57`, `packages/core/src/motion/spring.ts:60`, `packages/core/src/motion/spring.test.ts:5`

**Description.** sampleSpring divides by (count - 1) (spring.ts:58: (settle * i) / (count - 1)). For count === 1 this is 0/0 → NaN, and the forcing lines values[0]=0; values[count-1]=1 both write index 0, so the function returns [1] (start keyframe lost). For count === 0 it returns [] with values[-1]=1 a no-op. The tests only ever call with count 60 or 80 (spring.test.ts), so the degenerate/small-count contract is undefined and untested. SPRINGS/sampleSpring is a public export from core (index.ts:28), so a consumer can legitimately pass a small count.

**Impact.** A public API can silently emit NaN keyframes (which Element.animate would reject or render as a broken animation) with no guard and no test. Latent crash/garbage-output on a documented export.

**Recommended fix.** Either guard count <= 1 to return a sane sample ([0,1] or [1]) or document/assert a minimum, and add spring.test.ts cases for count 0, 1, and 2 asserting no NaN and a monotone-ish, start-at-0 / end-at-1 result.

**Skeptic reasoning.** The structural code observations are real, but the finding's headline impact (NaN keyframes silently emitted) is NOT reproducible. I ran sampleSpring with counts 0,1,2,3. For count=1 the loop does compute at(0/0)=at(NaN), but lines 60-61 (values[0]=0; values[count-1]=1) both target index 0 and clobber that NaN, so the function returns [1] — NaN never escapes (hasNaN:false). The genuine, verified defect is degenerate OUTPUT, not NaN: count=1 returns [1] (start keyframe 0 lost), and count=0 returns [0] — note the finding's prose claimed count=0 returns [] which is WRONG (values[-1]=1 is a no-op, but values[0]=0 still writes, yielding [0]). So the 'latent crash / garbage NaN on a public export' framing that justified 'important' is overstated. What remains true: count is an unvalidated optional param on a public export (index.ts:28), divide-by-(count-1) is undefined at count<=1, no internal caller ever passes a small count (only defaults to 60 / explicit 80), and spring.test.ts:5-43 only covers 60/80 so the small-count contract is untested. That is a legitimate but minor robustness/hardening gap on an internally-unused path — worth a guard + tests but not a shipping blocker, and not the crash/NaN severity claimed. Net: partially confirmed (untested degenerate-count contract is real) but the central NaN-emission claim is refuted, so verdict uncertain and severity downgraded to suggestion.

**Verified evidence.** spring.ts:58 `values.push(at((settle * i) / (count - 1)))` — for count=1, i=0 gives 0/0=NaN. spring.ts:60-61 `values[0] = 0` then `values[count - 1] = 1` both write index 0 for count=1, overwriting the NaN → returns [1]. Direct execution: count=0 -> [0]; count=1 -> [1] (hasNaN:false, len:1); count=2 -> [0,1]; count=3 -> [0,0.77,1]. Public export confirmed at packages/core/src/index.ts:28. grep for sampleSpring( shows no internal caller passes a count argument. spring.test.ts:6,19,24 only use counts 60/80; no 0/1/2 cases.

---

## [63] setCollection zoom-preservation and rapid collection swaps lack edge coverage

- **Dimension:** tests
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/core/src/controller/createViewer.ts:189`, `packages/core/src/controller/createViewer.ts:207`, `packages/core/src/controller/createViewer.test.ts:150`

**Description.** setCollection has subtle logic: it preserves committed zoom only when the exact item id survives (sameItem flag, createViewer.ts:199-209). The tests cover cursor remap by id and the clamp fallback (createViewer.test.ts:150-181) but never assert the zoom-preservation contract — that zoom is kept when the same item persists and reset when it changes. The destroyed-guard on setCollection (createViewer.ts:190) and behavior when next collection is empty are also untested.

**Impact.** A regression that drops (or wrongly keeps) zoom across a collection update would not be caught — a real annoyance in live-updating galleries.

**Recommended fix.** Add createViewer tests: zoomTo then setCollection where the item id survives → zoom retained; where the item id is gone → zoom reset to identity; and setCollection({ groups: [] }) → cursor {0,0}, no throw.

---

## [64] Focus is not moved onto the new slide on navigation and live-region announce may be missed

- **Dimension:** uiux-a11y
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/mount.ts:464-488`, `packages/renderer-dom/src/mount.ts:222-223`

**Description.** Navigation keeps DOM focus on root (or wherever it was) and relies solely on the polite aria-live region (live.textContent) to announce 'Group X of Y, screen…'. That is reasonable, but: (1) the live region text is only updated on cursor/collection change (gated by chromeG/chromeI), and when navigating to a position that yields the same string it won't re-announce; more importantly, the stage <img> alt is inside .gallerist-content which is not in any reading order tied to the announcement, so SR users hear the position but not the image's alt/caption on navigation. (2) On close+reopen restoreFocus targets document.activeElement captured at attach time; if the trigger was inside a React tree that unmounted, focus silently falls to body.

**Impact.** Screen-reader users get position numbers but not the per-image description as they navigate, and focus restore can land on body in dynamic apps. Both reduce the quality of the SR experience.

**Recommended fix.** Append the current item's alt/caption to the live announcement (e.g. 'Group 2 of 6, screen 1 of 3 — Sprint burndown'). Consider moving focus to the current slide region (with tabindex=-1 and aria-roledescription='slide') on nav so the SR cursor follows. For focus restore, allow the host to pass an explicit returnFocus element (React: capture the trigger ref).

---

## [65] Footer caption band is positioned only for a bottom rail; it overlaps or detaches under vertical/hidden rails

- **Dimension:** uiux-a11y
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** **confirmed** (severity important → suggestion)
- **Files:** `packages/theme-default/src/gallerist.css:159-165`, `packages/theme-default/src/gallerist.css:656-726`

**Description.** .gallerist-region-footer is fixed at bottom: var(--gallerist-thumb-h, 0) — it assumes a horizontal bottom rail of height --gallerist-thumb-h. When the rail is left/right (orientation vertical) the bottom rail isn't there, so the footer floats 84px up from the bottom over empty stage; when rail is 'hidden'/collapsed the footer still reserves 84px. --gallerist-thumb-h is a card-image height token, not the actual rail region height, so even in the bottom case the footer can overlap the rail's padding/caption band. No token tracks the live rail height.

**Impact.** Any plugin/consumer using the footer region (captions, metadata) renders misaligned across the four rail placements — a visible polish defect in three of the four shipped presets.

**Recommended fix.** Drive the footer offset off the actual rail region rather than the image-height token: e.g. anchor the footer inside the stage region, or set bottom:0 when orientation=vertical or rail=hidden/collapsed, and 0 for the bottom case computed from the rail's measured height (publish a --gallerist-rail-h via ResizeObserver, or stack footer above the rail with flex). Add visual checks per preset.

**Skeptic reasoning.** The CSS claims are all accurate and I verified each one personally. `.gallerist-region-footer` is anchored at `bottom: var(--gallerist-thumb-h, 0)` (gallerist.css:163), and `--gallerist-thumb-h` is 84px (gallerist.css:17), defined and used as the thumbnail card IMAGE height (gallerist.css:278, :257, :344, :355) — not the rail region height. The footer rule appears exactly ONCE in the entire stylesheet (grep count=1) with NO `[data-gallerist-rail-pos]`, `[data-gallerist-orientation]`, or `[data-gallerist-rail="collapsed"]` override. Meanwhile vertical (left/right) rails relocate the thumbnails region to a side edge with `bottom: 0; top: var(--gallerist-toolbar-h)` (gallerist.css:659-672), so there is no bottom rail, yet the footer still floats 84px up over empty stage. Even in the bottom case there is a mismatch: the rail region is content-sized as [handle 22px][8px pad + 84px img (+ optional caption) + 8px pad] ≈ 130px+ (the code comment at gallerist.css:598 explicitly notes the rail collapse uses the region's own measured height 'so it works at any rail height', proving the height is dynamic and not equal to 84px), so the footer overlaps the handle/padding/caption. No --gallerist-rail-h token exists (grep found none). All four shipped presets are affected (presets.ts:23-56): filmstrip/reviewer = bottom (overlap), immersive = hidden (84px dead reserve over stage), contact = right vertical (floats over stage) — slightly WORSE than the reviewer's 'three of four'. So the diagnosis is correct. However, severity must drop from important to suggestion: NO shipped plugin or example renders into the footer region. The footer is a latent, documented PUBLIC extension point (React Gallerist.Region name='footer', Gallerist.tsx:155-175; spec line 462). The spec references a plugin-captions (GALLERIST_SPEC.md:492) that would use it, but that plugin is NOT in the v1 shipped set (only download/fullscreen/grid/hash/thumbnails/video/video-youtube exist). So the defect is invisible in every path v1 actually ships and only manifests for a consumer who uses the advertised footer API. Real bug, cheap fix, zero impact on the default shipped experience — a polish/correctness suggestion, not an important defect.

**Verified evidence.** packages/theme-default/src/gallerist.css:159-165 (footer: position absolute; bottom: var(--gallerist-thumb-h,0); only rule for .gallerist-region-footer — grep count=1, no rail/orientation override); gallerist.css:17 (--gallerist-thumb-h: 84px); gallerist.css:278/257/344/355 (--gallerist-thumb-h used as card IMAGE height); gallerist.css:659-672 (vertical rail → bottom:0, no bottom band); gallerist.css:598 (comment: rail collapse uses region's own height, 'works at any rail height' = dynamic, not 84px); packages/renderer-dom/src/presets.ts:23-56 (4 presets: filmstrip/reviewer bottom, immersive hidden, contact right); packages/renderer-dom/src/mount.ts:217,220 (footer host created, never populated by shipped code); packages/react/src/Gallerist.tsx:155-175 (footer is a public Region portal API); docs/GALLERIST_SPEC.md:462,492 (footer in regions API; plugin-captions referenced but not shipped in v1 plugin set).

---

## [66] No discoverability for swipe / pinch / double-tap / drag-to-dismiss gestures

- **Dimension:** uiux-a11y
- **Effective severity:** suggestion  ·  **Confidence:** high
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/renderer-dom/src/gestures.ts:107-235`, `packages/theme-default/src/gallerist.css:69-95`

**Description.** The gesture model is rich (swipe to navigate, swipe-down to dismiss, pinch-zoom, double-tap zoom, wheel zoom) but there is zero affordance signalling any of it. touch-action:none on the stage disables native scrolling, so on touch the only way to learn navigation is to guess. There is no hint chip, no first-run coachmark, and the close/nav buttons auto-hide on idle, so a touch user on the immersive preset (chrome hidden, rail hidden) can be left with a single image and no visible way out except a swipe they don't know exists.

**Impact.** Touch users — especially on immersive/auto-hide configs — may feel trapped or not realize they can navigate. Affects perceived quality and the swipe-vs-zoom mental model.

**Recommended fix.** On first open (or first touch session), show a brief, dismissible hint overlay ('Swipe to browse · Pinch to zoom · Swipe down to close'), honoring reduced-motion (fade only). At minimum keep the close button from fully auto-hiding on touch, or reveal chrome on any touchstart (the idle controller already wakes on touchstart, but immersive hides the rail/toolbar too).

---

## [67] RTL is not handled — arrow direction, rail side, and chevrons are hard-coded LTR

- **Dimension:** uiux-a11y
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/theme-default/src/gallerist.css:499-595`, `packages/renderer-dom/src/mount.ts:552-564`

**Description.** All chrome positioning uses physical left/right (.gallerist-prev left:12px, .gallerist-next right:12px, pill-right at right:68px, rail-pos left/right) and the keyboard map binds ArrowRight=next/ArrowLeft=prev unconditionally. In an RTL document the visual 'next' should be on the left and ArrowLeft should advance forward. Nothing reads dir/[dir=rtl]. The counter/position also sit top-left physically.

**Impact.** RTL consumers get a mirrored-but-wrong experience (Next arrow on the wrong side, arrow keys feel inverted). For a framework-agnostic v1 library this is a known limitation worth either fixing or explicitly documenting.

**Recommended fix.** Either (a) document RTL as unsupported for v1, or (b) switch chrome positioning to logical properties (inset-inline-start/end) and flip the ArrowLeft/ArrowRight→prev/next mapping when getComputedStyle(root).direction === 'rtl'. Add a [dir=rtl] visual test.

---

## [68] Single accent color also encodes focus, active-thumb, and selection — fails non-color-only signaling and theme contrast varies

- **Dimension:** uiux-a11y
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/theme-default/src/gallerist.css:184-187`, `packages/theme-default/src/gallerist.css:267-270`, `packages/theme-default/src/gallerist.css:822-826`, `packages/theme-default/src/gallerist.css:42-49`

**Description.** The accent (amber/cyan/vermilion) is the sole indicator for: focus-visible outline, active thumbnail border, active position pill, and active caption color. Active state on thumbnails is communicated only by a 2px accent border + glow (color difference), with no shape/icon change — borderline for WCAG 1.4.1 (Use of Color) and 1.4.11 (non-text contrast: a 2px border against #1a1c22 with the cyan accent #22d3ee is fine, but amber #ffb000 on the dark chrome and especially the active pill text using --gallerist-accent-fg #15110a on amber is ~good, whereas focus-visible outline reuse means a focused-and-active element shows one ring). The muted fg #9aa0ab on --gallerist-chrome-bg (rgb(20 22 27/.66)) for the counter is ~3.5:1, under 4.5:1 for normal text.

**Impact.** Color-blind users may not distinguish active vs inactive thumbnails; the counter text is below AA contrast. Minor but real audit findings.

**Recommended fix.** Add a non-color active cue to thumbnails (e.g. a checkmark/dot or scale). Bump the counter color toward --gallerist-fg or raise chrome-bg opacity to clear 4.5:1. Verify each accent variant's accent-fg pairing and focus outline contrast against the dark backdrop (≥3:1 for the focus indicator).

---

## [69] Very tall/wide images, zoom pan bounds, and overlay layer use a contained-size model that mis-handles extreme aspect ratios

- **Dimension:** uiux-a11y
- **Effective severity:** suggestion  ·  **Confidence:** medium
- **Verification:** not separately verified (suggestion passthrough)
- **Files:** `packages/theme-default/src/gallerist.css:112-130`, `packages/renderer-dom/src/gestures.ts:84-94`, `packages/renderer-dom/src/mount.ts:633-645`

**Description.** .gallerist-media-image uses object-fit:contain with width/height:100% on a layer that fills the stage, and getGeometry() reports naturalSize as the STAGE size (mount.ts:642 comment: 'Phase 0 coordinate model … scale 1 == fit'). For a very tall portrait in a wide stage, the actual painted image occupies a narrow center column, but pan/zoom bounds (clampPan) treat the whole stage as the image, so panning a zoomed portrait can reveal empty letterbox area and the zoom focal math is computed against stage dimensions, not the real image rect. Overlays anchored to image-space points map through the stage rect, not the contained rect, so they drift on extreme aspect ratios (the code comment acknowledges natural-coordinate mapping is deferred to M4).

**Impact.** On portrait-in-landscape or panoramic images, zoom/pan and image-anchored overlays will be visually off — a polish/correctness concern for the headline 'image-space overlays' feature on real-world varied media.

**Recommended fix.** Confirm M4 closes the contained-rect mapping before v1 ships the overlay feature as stable, or document the limitation. For pan bounds, compute the true contained rect (fit the natural aspect into the stage) and clamp against that rect rather than the full stage, so zoomed portrait/landscape images don't pan into empty bars.

---
