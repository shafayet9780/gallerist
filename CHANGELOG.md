# Changelog

## Unreleased

### Added
- **renderer-dom (M21)**: `bind()` and `collectionFromLinks()`: open a viewer from `data-gallerist`
  links, with groups, captions and thumbnails read from attributes; links added later join in.
- **cdn (M21)**: `@gallerist/cdn`, a one-file UMD build on a global `Gallerist`, for pages with no
  build step (`examples/cdn`).
- **react (M21)**: the build carries a `"use client"` banner, for React Server Components.
- **plugins (M21)**: `strings` on thumbnails, grid, download and fullscreen, with exported English
  defaults. An audit test fails on any UI text that can't be translated.
- **renderer-dom (M20)**: the `tour` preset: a section index beside the stage, ←/→ between sections on
  labelled arrows, ↑/↓ within one, framed media. Options: `groupAxis` (which arrows move between
  groups, independent of the rail) and `arrowLabels` (name the group arrows after their target), with
  `strings.previousTo` / `nextTo`. Both are React props too.
- **plugin-thumbnails (M20)**: `groupDisplay: 'index'`, a section index with names, subtitles and
  counts, the active section expanded; chips on a bottom rail or at 900px wide or less.
- **plugin-grid (M20)**: `layout: 'sections'` (an overview, one card per group), `startOpen`. Hiding the grid now hands focus to the viewer, so keys keep working after a cell click.
- **renderer-dom (M20)**: the overlay's Tab trap skips hidden controls, so Tab can't leave the dialog
  past one.
- **examples/tour**: a listing page using all of the above.

### Breaking
- **renderer-dom (M19)**: without a `scheme` option the root no longer carries
  `data-gallerist-scheme="dark"`. Each skin applies its own default (Gallery and Console dark,
  Editorial light), so the look is unchanged; only CSS that selected `[data-gallerist-scheme="dark"]`
  by default needs `:not([data-gallerist-scheme])` too.
- **theme + renderer-dom + react (M16)**: the default look is now the **Gallery** skin: quiet
  near-black surfaces, round controls, sans numerals, and a periwinkle tint for focus only.
  The previous graphite + amber look is the **Console** skin. It is unchanged, verified as a zero
  computed-style diff across the layout lint's configurations. To keep it, load it and opt in:
  `import '@gallerist/theme-default/console.css'` after `gallerist.css`, then
  `mount(viewer, { skin: 'console' })` or `<Gallerist skin="console">`.
- **renderer-dom + react**: appearance is three options, `skin` (`gallery` | `console`), `accent`
  (named per skin) and `scheme` (`dark` | `light` | `auto`), reflected as `data-gallerist-skin`,
  `data-gallerist-accent` and `data-gallerist-scheme`. React's `theme` prop is replaced by `accent`,
  and the `data-gallerist-theme` attribute is gone. All three props are reactive in React, and
  `applyAppearance(root, …)` changes them on a mounted vanilla viewer (only the options given).
- **theme**: token declarations live in cascade layers, so a page's `--gallerist-*` override on
  `.gallerist` wins in every skin, scheme and accent, also on phones, and the skins apply in a
  fixed order whatever order the files load in. An existing override keeps working after
  switching to `skin: 'console'`. Component rules are not layered.
- **theme**: Console's vermilion accent puts dark ink on the accent (white was 3.1:1).
- **core**: renderer/plugin plumbing moved off the public `ViewerApi` to
  `@gallerist/core/internal`: `viewer.emit`, `getPlugins` and `onPluginsChanged` are now
  `getInternals(viewer).emit(…)` etc. The engine building blocks (normalize, store, FSM, nav,
  windowing, springs, arbitration, zoom math, emitter) moved there too, so the root entry is just
  the app-facing API (spec §8.4). Root bundle 3.5 → 2.7 KB gz.
- **core**: `normalize` (and so `createViewer` / `setCollection`) throws on a duplicate group id or
  item id.
- **core**: `zoomTo(scale, focal?)` now does what spec §8.2 says: `focal` is a stage point (px) whose
  content stays fixed, defaulting to the stage centre. It used to be treated as the pan offset. Set
  a full transform with `getInternals(viewer).setZoom({ scale, x, y })`.

### Added
- **theme (M19)**: the **Editorial** skin (`editorial.css`, `skin: 'editorial'`). A warm gallery
  wall, with a Night scheme, ink type, serif titles and captions, outlined round arrows, and
  `vermilion` / `cobalt` accents. Works fade in rather than slide: the slide animations are now
  tokens (`--gallerist-enter-group`, `--gallerist-enter-item`); items settle in (a fade with a
  slight scale) so the two axes never share a motion.
- **renderer-dom (M19)**: `frame` option. The work hangs inside the stage with room around it, and
  the media element is sized to the image, so a skin's mat and shadow hug it. Zoom bounds,
  overlays, pins and the navigator follow the framed box. `itemIndicator: 'placard'` moves the item
  navigator into the caption, as ticks and `n / N` under the item's caption.
- **renderer-dom (M19)**: the `editorial` preset: framed media, a placard caption beside the work,
  and numbered items inline in a bottom rail.
- **renderer-dom (M18)**: `navigator` option, a zoom navigator. While zoomed in, a minimap of the
  image with a box for the visible part; click or drag to move around. On in the `reviewer` preset.
- **plugin-thumbnails (M18)**: `timeline` (a time label and tick above each group card, joined
  into a track; `true` reads `group.meta.time`) and `numberItems` (numbered item thumbs). The
  `reviewer` preset turns both on.
- **plugin-pins (M17)**: new `@gallerist/plugin-pins`. Pins are points on an item that follow pan
  and zoom at a constant size and open a card. Three presentations: `comment` (numbered threads
  with replies and a resolved state, plus `onPlace` to drop a new one with a click or `c`), `tag`
  (a product hotspot with a card and link) and `feature` (numbered notes). Pins come from
  `item.meta.pins` or a `pins(item, group)` reader. A toolbar toggle and `p` show or hide them;
  Escape closes a card, not the viewer. `refresh()`, `setVisible()` and `open(id)` let the host
  drive them. Styles are in `theme-default/pins.css`, which `gallerist.css` includes, and are drawn
  from the skin's tokens. Demo: `examples/hotspots`.
- **core + renderer-dom**: a plugin's `overlays` may be a function of the slide
  (`({ group, item }) => OverlaySpec[]`). Overlays repaint when an item's data changes under the
  same id. An interactive overlay whose content has its own controls is no longer an extra tab
  stop, and double-clicking a control in the stage no longer zooms.

### Changed
- **theme (M18)**: the Console skin is polished to its design canvas. The bar and rail are opaque
  graphite bands with hairlines. Tools are flat until pressed, and a pressed toggle gets a raised
  surface with an accent glyph and underline instead of an accent fill. Focus is a neutral ring, so
  it never reads as selection. Idle thumbs recede a little, and the accents move to the canvas
  values (amber `#f2a93b`, cyan `#3cc8dc`, vermilion `#ff6b4a`). Console now uses
  `color-scheme: dark` (dark native scrollbars). New base tokens let any skin do the same:
  `--gallerist-bar-bg`, `--gallerist-bar-border`, `--gallerist-rail-border`, `--gallerist-tool-fg`,
  `--gallerist-pressed-shadow`. Gallery is unchanged.
- **theme (M18)**: plugin-grid's styles move from `base.css` to `grid.css` (like `pins.css`);
  `gallerist.css` includes both, so only a skin built on `base.css` alone needs to import them.
- **examples/monitoring (M18)**: Console + `reviewer` with timeline times, numbered monitors, the
  zoom navigator and comment pins (press C to add one).
- **theme (M16)**: `theme-default` splits into `base.css` (structure: layout areas, reserved space,
  the mobile layer, RTL, reduced motion, every component rule) and skins that only set tokens.
  `gallerist.css` stays the zero-config entry (base + Gallery). New tokens let a skin give bar
  tools, arrows and the item navigator their own treatment, and restyle selection rings, idle thumbs,
  dots, the counter, title and caption. Light schemes: Gallery's warm paper and Console's Paper.
  Accents: Gallery `periwinkle` / `mint` / `amber` / `vermilion`, Console `amber` / `cyan` /
  `vermilion`, each with a value per scheme. The layout lint now runs every configuration in both
  skins.
- **renderer-dom + theme (M15)**: the viewer is laid out as a grid of areas: top bar (counter →
  group title → plugin tools → zoom reset → close), stage, an `aside` column, caption bar, footer and
  rail. Persistent chrome now takes space instead of covering the image, and no two pieces of chrome
  can overlap in any preset, arrow layout, rail position or direction. A Playwright layout lint
  checks 16 configurations on desktop and phone for overlaps, off-screen chrome, a covered stage
  and touch targets under 44px.
- **renderer-dom**: ↑ · position · ↓ form one item navigator, hidden for one-item groups and in
  linear mode; zoom reset shows only while zoomed; group and item captions are shown (bar title and
  caption bar); the `dpad` layout is now a keyboard-arrow cluster.
- **plugin-thumbnails**: the vertical item stack moves into the new `aside` region beside the stage
  (it used to float over the stage), and stays up for one-item groups so the stage keeps its width.
- **theme**: a mobile layer (compact chrome under 600px, 44px touch targets, safe areas, swipes
  instead of on-image arrows on touch) and RTL arrow glyphs that point the reading direction.
- **renderer-dom**: generic wording: announcements and pill labels say "item", not "screen".
- **renderer-dom + react**: `itemIndicator` option: `pills` (default), `dots` (plain dots with the
  count) or `counter`.
- **renderer-dom + react**: `strings` option (`mount(viewer, { strings })`, `<Gallerist strings>`)
  for every label and announcement the renderer produces, with English defaults
  (`DEFAULT_STRINGS`); positions are functions so a language can order words and numbers.
- **plugins + renderer-dom**: one icon family. The shared SVG set moves to `@gallerist/core/internal`
  (`ICONS`) and the toolbar buttons of thumbnails, grid, fullscreen and download use it instead of
  Unicode glyphs. Zoom reset gets its own icon (it used to look like fullscreen). The fullscreen
  button exposes `aria-pressed`, and a pressed toggle (accent fill) looks different from focus (ring).
- **renderer-dom + theme (M15 review)**: the chrome contract was hardened after an independent
  review. Captions get a fixed two-line band, reserved per collection so the stage doesn't jump.
  Focus stays in the viewer when the focused zoom reset or item navigator hides. With
  `controls: false` an empty top bar is hidden. Immersive arrows are inset clear of the floating bar,
  caption and rail, and the floating chrome lets clicks through to the image. On touch the item
  navigator is always reachable, and group arrows reappear on keyboard focus. Phones drop the items
  toggle and let bar tools scroll instead of overflowing. Collapsing the rail hides the `aside` item
  stack. Side rails stay on their physical side in RTL, using the new `data-gallerist-dir`
  attribute instead of `:dir()`. The dialog name and carousel role description are translatable
  (`strings.dialog`, `strings.carousel`). The layout lint now also covers long captions, zoom,
  `controls: false`, RTL side rails, immersive arrow layouts and a 320px touch screen, and checks
  occlusion, stage size and item-axis reachability.

### Fixed
- **plugin-thumbnails**: the item stack went into the rail instead of the side column when an
  overlay viewer opened after mount (on a click, as pages do). The column is used whenever the
  renderer has mounted it, not only once it is in the document.
- **renderer-dom (M17)**: a repaint of the overlays keeps keyboard focus on the same overlay
  instead of dropping it to `<body>`; a double click inside an interactive overlay doesn't zoom.
- **core + renderer-dom (M17)**: zoom and pan are bounded by the painted image, not the stage. A
  zoomed portrait in a landscape stage (or a panorama in a tall one) stays centred until it is wider
  than the stage, and can no longer be dragged into the empty letterbox beside it. The bound updates
  when the image's natural size arrives. New `clampPanToBox` in `@gallerist/core/internal`.
- **core**: a throwing event handler no longer stops later handlers (it is reported via
  `reportError`); a destructured `preventDefault()` works; `zoomTo` ignores NaN/negative input.
- **core**: the `overlays` option of `createViewer` (and so `<Gallerist overlays>`) was declared but
  never read. Global overlays passed there now render.
- **react**: `items` / `groups` / `collection` are reactive. They were read once at construction,
  so data that arrived later (an API call) never showed. Changed content is applied with
  `setCollection`, keeping the cursor on the same item. Inline data rebuilt with the same content
  is ignored, and an invalid update is logged instead of crashing the tree.
- **react**: `on` handlers always call the latest props instead of the first render's closures.
- **core + renderer-dom + theme**: open/close are real transitions. `opened` / `closed` fire when
  the open fade (280ms) or close fade (180ms) ends, and the overlay stays mounted through its exit
  instead of vanishing. Renderers drive this via `getInternals(viewer).setLifecycleDriver`. The
  phase is exposed as `data-gallerist-phase`. No animation under reduced motion.
- **renderer-dom**: plugin region renderers run once per plugin instance, as PLUGIN-AUTHORING
  promises. Every plugin change (each React `<Gallerist.Overlay>` mount) used to re-run all of them
  and rebuild every region host. Hosts are now only touched when their nodes change.
- **core + renderer-dom**: `viewer.refresh()` re-measures (re-anchors overlays, re-clamps zoom).
  It was a no-op that no renderer could hook.
- **core**: `open({ g, i })` on a viewer that is already open now navigates like `goTo` (slide/item
  events, cancelable). It used to move the cursor silently. Reopening starts at fit instead of
  the previous session's zoom.
- **renderer-dom**: cancelled media loads are no longer reported as `loadError`.
- **core + renderer-dom**: zooming back out (keyboard, double-tap, pinch, `zoomTo`) no longer
  leaves the image off-centre or panned past its edge. The renderer lends the core its stage
  geometry, and every committed zoom is clamped against it.
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
