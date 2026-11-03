# Gallerist — Phase 2 TODO (one engine, six looks)

> Plan: `plans/phase-2-product.md`. Each milestone merges on its own with every gate green.

## Done before Phase 2
- [x] Step 1: correctness and API meaning (`fix/correctness-pass`, incl. independent review fixes)
- [x] Six design directions, 24 frames each (links in the plan)

## Release 0.3
- [x] **M15** Chrome architecture: top bar region, reserved space, item indicator variants, hidden axes, mobile layer, `strings`, caption bar, SVG plugin icons. The verification gate is a geometry lint (`e2e/tests/layout.spec.ts`) instead of screenshot baselines, which differ between macOS and Linux CI. An independent review followed: 25 findings, 22 fixed, 3 accepted as intended (idle tool fade, rail collapse not animated, caption overlay specs not rendered yet)
- [x] **M16** Skin system: base/skin split, `skin`/`accent`/`scheme`, Gallery default, `console` extracted with zero visual diff. Verified as a zero computed-style diff (26 configurations × 3 viewports) against M15. Console keeps `color-scheme: normal` to stay identical; M18 can move it to `dark`. Review: 10 findings fixed (token overrides via cascade layers, load order, partial `applyAppearance`, hover/focus states, axe per skin)
- [x] **M17** Contained-rect zoom bounds + `plugin-pins` (`comment`, `tag`, `feature`), hotspot demo (`examples/hotspots`). Review: 10 findings fixed (Escape on WebKit and after `open()`, focus on hide and repaint, placing vs pan, card room, resolved contrast), plus a thumbnails side-column bug found while building M18
- [x] **M18** Console: skin polish, `reviewer` preset upgrade (timeline rail, numbered items), zoom navigator, comment pins in the monitoring example. Review: 11 findings fixed (lint on the JSON files, React `navigator` prop, idle fade, CSS-sized minimap, video items, timeline in side rails and long labels, grid.css documented)
- [x] **M19** Editorial: wall skin + Night scheme, framed media, placard caption with item controls, `editorial` preset. The renderer's scheme default moved to the skins (Editorial defaults to the light wall). Review: 7 findings fixed (editorial with side rails, fixed-height placard band, item stack column, tick targets, distinct item motion, framed error card, docs)
- [x] **M20** Tour: thumbnails `groupDisplay: 'index'`, grid `layout: 'sections'` + `startOpen`, `arrowLabels`, `groupAxis`, `tour` preset, `examples/tour`. Review: 11 findings fixed (focus after cell click and on entering the overview, overview dropping sections, navigation behind the overview, reopen semantics, stale docs, late `use()`, one-group loop labels, items toggle on chips, Tab trap past hidden controls, `+N` name); chips start at 900px
- [x] **M21** Parity: `"use client"`, DOM-markup init (`bind`), UMD build (`@gallerist/cdn`), strings audit. Review: 9 findings fixed (repeated link ids, `pins()` across galleries documented, CDN versioned with its parts via a changesets `fixed` group, deep-link claim dropped, focus return, viewer-owned links, `open()` after destroy, skin docs, stricter audit)
- [ ] Release 0.3: positioning, docs site with skin × preset playground (done on `feat/release-0.3`; no migration notes, nothing was ever published); merge the stack, repo public, `NPM_TOKEN`, enable Pages, confirm the npm scope, publish (owner). Pre-release review: 9 findings fixed. Before 0.4: a minor changeset releases 1.0.0 (a minor peer bump counts as major), so set minor versions by hand, or use `onlyUpdatePeerDependentsWhenOutOfRange` with peer range `workspace:>=0.3.0 <1`, which allows mixed minors. Also window a single huge group's item thumbs

- [ ] **0.3 API from the Apploye integration** (`feat/0.3-api`, before the first publish): captions as a per-viewer renderer (`Item.caption: string`, `@gallerist/plugin-captions`, React `<Gallerist.Caption>`, renderer `caption` region, caption as `aria-describedby`); React `useCurrentItem()`, `open={{ g, i }}`, forwarded `label` / `returnFocus` / `preload` / `adapters`, imperative ref documented; pins `renderCard` → `null` keeps the default card, `defaultPinCard` exported; download `downloadUrl`, unavailable button per item, `client-zip` a regular dependency; Escape respects `defaultPrevented`; opaque Console backdrop; self-contained source maps; `check:dist` packs and rejects `workspace:` ranges. Left for the lead after the rebase: plugin-thumbnails reads the mounted preset's rail defaults; `sourcesContent` in the plugin-thumbnails and plugin-grid tsup configs.
- [x] **0.3 follow-ups** (`feat/0.3-api`, one commit on top of the API/build commits): presets configure the rail (P2-Q: core `RegionCtx.preset: PresetDefaults`, the renderer passes its `ResolvedPreset`, `thumbnails()` settles its options at region mount with explicit options winning per key; examples, site, docs no longer spell out `resolvePreset(name).thumbnails`; `examples/tour` keeps an explicit override); `sourcesContent` in plugin-thumbnails and plugin-grid; pins' default card links only to http(s)/mailto/relative URLs; Gallery and Editorial backdrops opaque (light and dark); layout lint covers a plugin-captions band (short and tall, default/reviewer/editorial × every skin and viewport) plus a behaviour test that the band grows to 40vh then scrolls and never overlaps stage, rail or toolbar; site size table refreshed.
- [x] **0.3 review fixes** (`feat/0.3-api`, one commit on top of the follow-ups). Two independent reviews; each finding was checked against the code first, and none turned out wrong.
  - Perf review of 9385c58 (1 Critical, 4 Important, suggestions), all fixed:
    - **C1** an RTL rail folded its run back to the start (`middleOf` took the first card, the rightmost); it now takes the card holding the middle, else the nearest centre.
    - **I1** the axis came from the first two cards (a `flat` rail on a side rail read 'x' and scrolled sideways); it now comes from the scroller (`axisOf`), the stride is measured along it, and a line of several cards counts them all.
    - **I2** grid prepends reflowed sideways; the run starts on a row and grows by whole rows (column count from the resolved `grid-template-columns`), in cells and sections.
    - **I3** in-group warmers are tracked by item id, cancelled when no longer wanted or on destroy, start once the current media is ready, `fetchPriority: 'low'`, and only for items the built-in image adapter mounts (`mountImage` identity).
    - **I4** unit tests for RTL, a side rail, flat on a side rail and index chips; e2e `rail.spec.ts` scrolls the rail (LTR, RTL, side rail) and asserts what shows is drawn (it fails on the old code in RTL); the perf gate adds two group steps past the rail's visible end, far enough in to move the run, and asserts it shifted.
    - Suggestions: focus rescue in the rail (`setCollection`, item column rebuilds) and on grid redraws; `aria-setsize`/`aria-posinset` on rail cards, item thumbs and grid cells (`cells` layout; a `sections` card draws all of its options); a numeric `overscan` below half of what fits is raised to it (documented); CHANGELOG preload wording, `overscan` after a jump, base.css "~65 ms".
  - API review of 992b8d7..8480d6c (2 Important, suggestions):
    - **I1** pins: Escape from inside an open card is left to a bubble listener on the card, so a host form keeps it with `preventDefault()`; otherwise the card closes and the viewer stays.
    - **I3** caption string guards restored (renderer text and band reservation, plugin-captions fallback, `<Gallerist.Caption>`); thumbnails `captionOf` takes `unknown`; the regions.ts header lists `caption`.
    - Suggestions done: fallback caption in `span.gallerist-caption-text`; React Caption treats `true`/`false` as none; DocumentFragment note; root `aria-describedby` only while the caption bar shows; a cross-origin `downloadUrl` opens in a new tab and is read once per click; React README (`open` compared by value, Escape vs document-capture modals); `check:dist` skips folders without package.json and checks every manifest target is packed (cdn and theme CSS included) and runs in the release workflow; size-limit entry for plugin-download (969 B, limit 1.2 kB); tests for `<Gallerist.Caption>` under StrictMode and `open` `{g}`→`true`→`false`→`{g}`.
    - **Open**: a keyboard-scrollable caption band (tabindex and a name only while it overflows) doesn't fit the core + renderer budget: measured at 16,058 B (limit 16,000; 15,952 B without it). Raising the budget, or giving it another home, is the owner's call.
  - Size: core + renderer-dom 15,779 → 15,952 B gz (limit 16,000). Gates: lint 0, clean typecheck 0, unit 0 (672), build 0, check:dist 0, size 0, attw 0, e2e Chromium + WebKit 0 (685 passed, 535 skipped by design).
- [x] **c3c3830 review fixes + keyboard-scrollable caption band** (`feat/0.3-api`, one commit on top of the review fixes). Review of c3c3830 (presets configure the rail, pins links, opaque backdrops, caption-band e2e); each finding checked against the code first (line refs had moved in 1038c37), none wrong.
  - **I1** a remount kept the first preset's rail (a one-shot `built` flag; the region mounter caches per mount): the rail remembers the `RegionCtx` it was built for and, on a new one, tears down (listeners, observers, DOM, reconcile state), re-`configure()`s and rebuilds. Unit tests: reviewer → destroy → editorial, none → destroy → tour.
  - **S1** an explicit `groupDisplay` other than the preset's drops the preset's `itemAxis`, `numberItems` and `timeline` (decided: all three belong to the preset's own display; `tour` + `groupDisplay: 'stacked'` is the plain unnumbered vertical stack). Same display keeps them (reviewer + `stacked` keeps the timeline). Documented in the thumbnails README, PRESETS, CHANGELOG, plan P2-Q.
  - **S2** `configure()` validates `groupDisplay` / `itemAxis` (unknown → defaults), takes a non-object `preset.thumbnails` as none, and a non-function truthy `timeline` as `true`.
  - **S3** `toggleActivePanel` returns in flat mode; test of a preset making the rail flat (toolbar region gets the comment node, `e`/`E` change nothing).
  - **S4** built-in presets frozen (`rootAttrs`, `thumbnails`, the entry; +36 B, inside the old 16,000 B limit); `RegionCtx` fields `readonly`; test that every preset is frozen. PLUGIN-AUTHORING: `ctx.preset` is read-only untyped data, and a region renderer runs again (new `ctx`) per mount.
  - **S5** React example: item axis `auto (preset)` (default) leaves `itemAxis` unset; the code snippet omits it.
  - **S6** `safeUrl(url, schemes)` in `@gallerist/core/internal` resolves against a fixed `http://localhost/` base (not `location.href`: `file:`/`capacitor:` pages rejected relative links, `about:srcdoc` threw); pins (http/https/mailto/tel + relative) and download's `safeHref` (http/https/blob + relative) use it. Tests for each (stubbed `location`); READMEs list the linked schemes.
  - **S7** CHANGELOG Breaking names `tour` (section index) and `editorial` (aside stack → numbered row) under bare `thumbnails()`, the S1 rule, and that the rail DOM is created at region mount, not in `init()`.
  - **S8** ADR 0001: status and the consequence note "superseded by P2-Q".
  - **S9** layout sweep gains a landscape phone (844×390, touch) and the caption-band behaviour test runs at 844×390. It found real failures (34 of 159): the stage at 43–128 px (< 35%) with captions/timeline, and the rail pushed off-screen by a custom caption band. Fixed in the theme, no check relaxed: a short viewer (`max-height: 500px`) takes the compact sizes (thumb 56, toolbar 52) and compact caption type, a bottom rail's handle sits beside the strip rather than above it (the coarse-pointer 44 px row was the biggest cost), and the rail keeps its full height (`min-height: auto`) so a tall caption band scrolls instead of squeezing it.
  - **S10** `waitForTimeout(150)` in the caption-band test → `railSettled()`: the rail has children and rail contents/scroll, stage and band size hold for two frames.
  - Grid `cells`: each group's `listbox` gets `aria-label` from its header (test).
  - **Caption band a11y (owner raised the budget 16 → 16.5 kB, plan P2-R)**: while a caption renderer's band overflows, its scroller (the band; in a placard the caption region in the slot) gets `tabindex="0"`, `role="region"` and `aria-labelledby` → a hidden label (`strings.caption`, "Caption"); removed when it fits. Labelled by reference because an `aria-label` on the placard's region would replace the viewer's `aria-describedby` text. A `ResizeObserver` on the scroller and its children checks it (no layout read in the sync path); ↑/↓/Home/End on the focused band scroll it instead of navigating. Unit tests (pills, placard) and e2e: axe (wcag2a/aa + best-practice) clean with a tall caption in the default band and the editorial placard, keyboard scrolls it, the item doesn't change, a short band stays out of the tab order. +171 B.
  - Size: core + renderer-dom 15,952 → 16,159 B gz (limit 16,500: freeze +36, caption band +171). Site table, README, spec §20 and IMPLEMENTATION budget refreshed.
- [x] **Third review fixes** (`feat/0.3-api`, one commit on top of 0eade23). Review of 1038c37 + 0eade23; each finding checked against the code first.
  - **I-1** `fitCaption` dropped `tabindex`/`role` from a focused band (focus fell to `<body>`, or stayed on a band whose ↑/↓/Home/End were still swallowed): when the band stops scrolling while focused, `root.focus({ preventScroll: true })` first; the keydown early return also needs `capScroll.hasAttribute('tabindex')`; overflow is `scrollHeight > clientHeight + 1`. Unit test (pills, placard): focused band → content shrinks (incl. 1 px) → focus on root, ↓ navigates, a key on the old band navigates.
  - **I-2** download `crossOrigin` used `new URL(url, location.href)` (throws in `about:srcdoc`, ignores `<base href>`): resolves against `document.baseURI` in a try (catch → same-origin) and compares with `globalThis.origin || location.origin` (`location.origin` is "null" in srcdoc; happy-dom lacks `self.origin`). Tests: `<base>` to another origin → `_blank`; stubbed srcdoc location → no throw, not `_blank`.
  - a11y e2e "short band stays out of the tab order" waits two rAFs and asserts the band fits before its negative checks.
  - theme: `:is(.gallerist-caption, .gallerist-region-caption)[tabindex]:focus-visible` ring (`--gallerist-focus`, offset -2px).
  - thumbnails flat item thumbs: `aria-posinset`/`setsize` within the group (default of `buildItemButton`; the pos/size params went).
  - `axisOf`: flex column / x-hidden+y-scroll → y; a flex row → x; one scrolling axis decides; otherwise (block/grid scrolling both ways or neither) the larger clamped overflow, else the longer side. Unit test. (A first cut let a flex row fall through to the overflow check: `overflow-x: auto` computes `overflow-y` to `auto`, so the bottom rail read as vertical; the perf and rail e2e caught it, 24 failures, and the unit test now covers it.)
  - grid: `extend(true, 0)` at the start of every edge-observer callback realigns a run drawn before layout (`repeat(…)` → 1 column) to a row. Unit test with columns unresolved at open.
  - group captions guarded: renderer title + `arrowLabels: true` (`str()`), thumbnails index rows (`captionOf`), grid sections.
  - `ResolvedPreset` fields (and `rootAttrs`, `thumbnails`) `readonly`; `@ts-expect-error` writes in presets.test.ts (typechecked).
  - layout e2e `railSettled` throws after 120 frames instead of returning.
  - download README: without `zip`, cross-origin items each open a tab after awaits, so only the first has user activation; use `zip` (CORS) or a same-origin `downloadUrl`. No fetch-to-blob fallback (not small).
  - **Skipped (wrong premise)**: "a jump's `sideOf(perView, …) * perLine` exceeds an explicit small `overscan` on a wide flat side rail". Nothing multiplies by `perLine` there: `perView` already counts the cards that fit (`(lines + 1) * perLine`), and a jump draws `max(overscan, perView)` each side, which is the documented minimum for the card to land at either edge without gaps. No perf-gate case added for it.
  - Size: core + renderer-dom 16,159 → 16,197 B gz (limit 16,500).
  - **Open**: the old rail stays subscribed after a renderer unmount until the next mount or viewer destroy (needs a core region-unmount signal).
- [x] **Reviewer controls off the media; pins card lifecycle** (`feat/0.3-api`, one commit on top of 33859ef). From Apploye's reviewer (owner-approved; plan P2-S, P2-T).
  - renderer-dom + theme: new `ArrowLayout` value `'docked'`; `reviewer` uses it (was `corner-br`). Group arrows in gutters the stage leaves (`inset-inline: arrow-size + 24px`, none on coarse pointers; end side only on a vertical group axis). The item navigator is a root grid item (`main.after(itemNav)`; a placard still wins): `n / N` over ↑ ↓ (`--gallerist-dock-w` / `--gallerist-dock-h`), the aside item column's header when that shows (≥ 601px, rail expanded, `.gallerist-thumb-items` in the aside; `contain: inline-size` so it doesn't widen the column), else the end of the caption row (the caption takes `margin-inline-end`). `data-gallerist-multi` (any group with several items) keeps its room on a one-item group; a docked bottom rail keeps its full height (`min-height: auto`) so the navigator's row floor can't push the strip off a 320×640 screen. Unit tests (placement, tab order, preset, placard, `controls: false`).
  - e2e: `reviewer: nothing over the media` (both engines; desktop, 390×844, 844×390 × 3 skins × plain / custom short / custom tall / text captions / 3:1 panorama / RTL 12-item group / rail collapsed; first item and after ↓): no bar, tool, arrow, navigator, caption or rail box intersects the painted image. Fails on the old `corner-br` (13 of 21 Console cases: navigator over the image; panorama under the arrows). Plus stage size held across 1/3/12-item groups, and the navigator moving from the item column to the caption row on `t`. Lint sweep gained 6 docked configs; no check relaxed. Fixture `wide=1`.
  - plugin-pins: card contents are drawn on open (and redraw), dropped on close; `onCardRemove(pin, node)` once per `renderCard` node (close, Escape, other pin, item change, pin gone, redraw, plugin/viewer destroy), called after state settles, never for default cards. Focus leaving a closing/redrawn card → its marker on the current item, else add-pin button, else the viewer (again after the task, for a repaint that drops the marker). `open(id, { focus })` (`PinOpenOptions`); `onOpenChange(pin, ctx: PinOpenChange)` with `ctx.previous`. Also fixed: a pin opens on the current item only; a neighbour slide's repaint no longer closes the card; pins of a closed overlay viewer open again after reopen (old `isConnected` filter dropped them; test fails on old code). Unit tests (counts across refresh/navigation/destroy, save → redraw → marker → Escape, pin gone → add button, item change → root, focus option, previous) and e2e (host form card, both engines; the focus step fails on old code in one engine). README: lifecycle + React portal example.
  - Screenshots (before/after, 1440×900, 390×844, 844×390): scratchpad `controls/`.
  - Size: core + renderer-dom 16,197 → 16,226 B gz (limit 16,500); pins 2,930 → 3,280 B (limit 4 kB); base.css 6,914 B. Site table refreshed.
  - Gates: lint 0, clean typecheck 0, unit 0 (705), build 0, check:dist 0, size 0, attw 0, e2e Chromium + WebKit 0 (1059 passed, 769 skipped by design).
  - **Open**: on a touch screen a group arrow focused from a keyboard reappears over the stage edge while focused (docked too); the aside header makes the landscape-phone item column scroll a little sooner.
- [x] **0478662 review fixes** (`fix/0.3-review4`, one commit on top of 0478662). Fourth review (of 0478662: pins card lifecycle and the docked layout), each finding checked against the code first, plus three pins bugs Apploye's reviewer found on 0478662 (Chromium, 844×390).
  - pins (review): a throwing `renderCard` falls back to `defaultPinCard` and is reported (`reportError`, else `console.error`); host callbacks queue and drain after the outermost change (re-entrancy safe); a node returned again isn't handed back while live; the repaint microtask is guarded; `open(id, { focus: true })` skips the late focus if the user moved on; the `<body>` rescue only in an open overlay or when focus was in the card; destroy resets `root`; README: one `pins()` per viewer, the portal key.
  - docked layout (review): the minimap recorded as the one intended exception; docked + immersive / editorial placements; caption → navigator DOM/tab order; box radius; `data-gallerist-one-group` hides gutters and arrows (not linear); aside header room only when multi and not linear; layout e2e matrix gains `rail=left`/`right` and an infinite-animation filter.
  - **A1** (Apploye) a card taller than a short stage ran past its bottom or opened up under the toolbar: `placeCard` keeps it inside the free stage (stage ∩ the inset controls box, i.e. less immersive's floated bands) on both axes: side with more room, level with the pin else slid along it, `max-height` = the room (−8px each side), `overflow: auto`; while it scrolls it is `tabindex="0"` and ↑/↓/Home/End/PageUp/PageDown on the focused card scroll it instead of navigating; a wheel over it scrolls it (no zoom); re-placed by a `ResizeObserver` as host contents render late. Unit tests (placement maths with mocked rects: the 159px stage / 194px card, bottom edge, immersive inset); e2e at 844×390 with a 300px host card: card within the stage, scrolls, `tabindex=0`, Discard scrolled into view inside the card and clickable (fails without the CSS).
  - **A2** (Apploye) × on an empty draft the host drops in `onOpenChange` + `refresh()`: the repaint a frame later took the marker focus had gone to → `<body>`. `overlays()` notes a focused pin of the current item and, after the repaint, rescues (marker of that id, else add-pin, else root). Unit (× and Escape variants, no add button → root; fail without the fix) and e2e on both engines (focus on the add button after the repaint; Escape from the draft closes the card, the draft goes, the viewer stays).
  - **A3** (Apploye) focus ring: rescues/opens pass `focusVisible: true` after a key (Escape, or the focus left showed the ring) and leave it to the browser otherwise (no forced ring after a click: platform convention; documented). TS 5.9 lib lacks `focusVisible`, cast to `FocusOptions`. Chromium already rings a script focus after a key, so the e2e (Escape → ring, × click → none, keyboard Save → ring) passes either way; the unit test asserts the option.
  - Loose ends: the overview (`grid({ layout: 'sections' })`) left the docked navigator (a root grid item) showing beside it: the theme hides `.gallerist-itemnav` too and plugin-grid rescues focus from it (unit + e2e, the e2e fails on the old CSS). A focused docked group arrow when the collection drops to one group hands focus to the root (unit). CHANGELOG lines for the docked fixes and `data-gallerist-one-group`, and the three pins fixes.
  - Size: core + renderer-dom 16,241 → 16,261 B gz (limit 16,500; HEAD 16,226); pins ~3.55 kB → 3,919 B (limit 4 kB; HEAD 3,280).
  - Gates: lint 0, clean typecheck 0, unit 0 (723), build 0, check:dist 0, size 0, attw 0, e2e Chromium + WebKit 0 (1158 passed, 820 skipped by design).
  - **Open**: on a touch screen a keyboard-focused group arrow still shows over the stage (Apploye probe, phone portrait; from 0478662). A scrolled card's close button scrolls with its contents (Escape still closes it).

## Release 0.4
- [ ] Per-item `zoomable: false`: placeholder items (a "no screenshot" card) shouldn't zoom or show the navigator (from the Apploye integration)
- [ ] Pins compose UI: a built-in draft card for a placed comment (text field, save / cancel), instead of each host building its own around `onPlace` (from the Apploye integration)
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
- [x] **U17** axe + perf (zero rebuild on item nav, <200 nodes @10k) + size re-check + e2e (`fix/u17-perf`). The
  "tag `v0.2.0`" part is obsolete: nothing was published, the first release is 0.3.0. `e2e/tests/perf.spec.ts` is
  now a count-based gate in the e2e suite (elements, nodes created/moved, attribute writes; never timings).
  Viewer elements after nav (chromium; webkit counts match), before → after:

  | Config @ shape | Before | After |
  |---|---|---|
  | default @ 2000×5 / 5000×2 | 283 / 274 | 179 / 170 |
  | reviewer @ 2000×5 / 5000×2 | 470 / 458 | 274 / 262 |
  | tour @ 2000×5 / 5000×2 | 32,447 / 50,435 | 233 / 221 |
  | grid (cells open) @ 1×10k: grid's own | 20,003 | 166 |
  | grid after closing @ 2000×5 | 446 | 186 |
  | flat @ 5000×2 | 237 | 153 |
  | item step attribute writes @ 1×10k | 10,017 | 17 |
  | group step nodes re-appended | 38 | 3 |
  | grid cells: elements recreated per step while open @ 1×10k | 20,003 | 1 |
  | tour @ 5000×2 open: click→open / longest task (chromium) | 1,090 ms / 662 ms | 336 ms / none |
  | reviewer @ 1×10k item step, script+layout / to frame: webkit; chromium | 664 ms / 2.7 s; 19 / 76 ms | 64 ms / 256 ms; 15 / 66 ms |

  Still open: one huge group's item stack (stacked, index) draws every item (20k–30k elements at 1×10k; the gate
  reports it, `PERF_GATE=1` asserts it); reviewer and tour draw more per card and are gated at <300 / <260.
