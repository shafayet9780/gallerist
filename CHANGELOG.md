# Changelog

## v0.3.0

### Performance (U17)
Measured with `e2e/tests/perf.spec.ts`, now part of the e2e suite as a count-based regression gate.
- **plugin-thumbnails**: a step writes the active state of the two thumbs that changed, not of every
  thumb (10,017 attribute writes per item step in a 10k-item group, now 17).
- **plugin-thumbnails**: the rail draws what fits in it plus 3 cards on each side and follows its own
  scroll, inserting only the cards that enter and removing the ones that leave; the scroll offset
  follows, so what's on screen doesn't move. Viewer elements at 2000 groups × 5: 283 → 179 (Console
  reviewer preset 470 → 274); nodes re-appended per group step 38 → 3.
- **plugin-grid**: the grid draws the cells or sections around the current item and more as you
  scroll toward either end, and drops them when hidden. The `tour` overview at 5000 groups held 50,435
  elements and blocked the main thread for 662 ms on open; now 221 and no long task. A move inside the
  open cells moves the selection instead of redrawing them (20,003 elements recreated per step at one
  10k-item group, now 1).
- **renderer-dom**: the images `preload.ahead` / `preload.behind` steps away within the current group
  (default 2 ahead, 1 behind) are fetched ahead, as the spec always said; the slide window already
  covered neighbouring groups. They start once the current item's media is ready, at low fetch
  priority, are cancelled when a move leaves them behind or the viewer is destroyed, and cover only
  items the built-in image adapter would mount (a custom adapter loads its own).
- **plugin-grid**: the drawn run starts on a row, and scrolling up draws whole rows above it, so the
  cells on screen keep their columns (a run of 40 into a grid of 3 or 7 columns shifted every
  visible cell sideways); the same in the `sections` overview.
- **theme**: each thumb in the vertical item stack contains its own layout and paint, so scrolling a
  long stack doesn't make WebKit revisit every item: an item step in a 10k-item group with the Console
  skin took ~660 ms there; now ~65 ms.

### Fixed
- **renderer-dom**: a focused caption band that stops scrolling (a shorter caption after ←/→, a taller
  viewport, the captions plugin removed) hands focus back to the viewer instead of dropping it to
  `<body>`, and ↑/↓/Home/End aimed at a band that no longer scrolls navigate again. A sub-pixel overflow
  doesn't count as scrolling. The theme rings a focused band (`--gallerist-focus`, inset).
- **plugin-download**: whether a URL is cross-origin is judged the way the link resolves it (against
  `document.baseURI`, so a `<base href>` counts) and against the document's origin: in an
  `about:srcdoc` frame a relative URL no longer throws (no download, an unhandled rejection), and a
  relative URL that a `<base>` sends to another origin opens in a new tab instead of navigating the
  host page away.
- **renderer-dom, plugin-thumbnails, plugin-grid**: a group caption that isn't a string counts as
  none (the group title, arrow labels, index rows, overview sections), as item captions already did.
- **plugin-thumbnails**: in a `flat` rail, item thumbs give their place within their group
  (`aria-posinset` / `aria-setsize`), like the item column, not in the whole flattened list ("Item 2,
  57 of 10000" inside "Group 29"). A block or grid rail that scrolls both ways takes its axis from
  the way its content overflows (else its longer side).
- **plugin-grid**: a run drawn before the grid had a layout (its columns unknown) is realigned to a
  row on the first scroll check, so growing it upward no longer shifts every cell sideways once.
- **renderer-dom**: `ResolvedPreset` is typed read-only (and its `rootAttrs` / `thumbnails`), matching
  the frozen built-in presets.
- **plugin-thumbnails**: mounting a viewer again with another preset (`h = mount(v, { preset:
  'reviewer' }); h.destroy(); mount(v, { preset: 'editorial' })`, or none, then `tour`) kept the first
  mount's rail (its timeline and aside stack under the new layout); the rail is rebuilt for each mount.
- **plugin-thumbnails**: `thumbnails({ groupDisplay: 'stacked' })` under `tour` no longer inherits the
  index's horizontal item row and numbering: an explicit `groupDisplay` other than the preset's starts
  from the plugin's own `itemAxis`, `numberItems` and `timeline`. Unknown `groupDisplay` / `itemAxis`
  values (from a renderer's preset or untyped options) fall back to the defaults, and a preset that
  makes the rail `flat` leaves the claimed items toggle and `e` key inert.
- **renderer-dom**: the built-in presets are frozen, so a plugin writing to `ctx.preset` can't change
  the preset for the next mount; `RegionCtx` fields are `readonly`.
- **renderer-dom**: a caption renderer's band that overflows (a long `plugin-captions` /
  `<Gallerist.Caption>` caption, in the band or the editorial placard) can be scrolled by keyboard: while
  it overflows it is focusable (`tabindex="0"`), a `region` named by `strings.caption` ("Caption"), and
  ↑/↓/Home/End scroll it instead of moving the viewer. A band that fits stays out of the tab order.
- **plugin-grid**: each group's `listbox` in the `cells` layout is named after its header.
- **plugin-pins, plugin-download**: relative URLs are judged against a fixed http base rather than the
  page's own URL, so they keep their link / download on `file:`, app-scheme (`capacitor:`) and
  `about:srcdoc` pages (resolving against `about:srcdoc` threw). Pins also link `tel:` URLs. Both use
  one check (`safeUrl` in `@gallerist/core/internal`) with their own scheme lists.
- **plugin-thumbnails**: a right-to-left rail follows its scroll; it read the first card (the
  rightmost) as the one in the middle and folded the drawn run back to the start, leaving what showed
  empty. The rail reads which way it runs from its scroller rather than from two cards, so a `flat`
  rail on a side rail (cards side by side in a vertical rail) measures down the rail and no longer
  scrolls sideways; a line holding several cards counts them all.
- **plugin-thumbnails**: a numeric `overscan` below half the cards that fit is raised to that, so the
  rail never draws with gaps.
- **plugin-thumbnails, plugin-grid**: focus on a thumb or cell that a redraw takes away (new data via
  `setCollection`, a jump past the drawn run, the item column rebuilt for a new group) moves to the
  grid's new current cell or to the viewer, not to `<body>` where the keys don't reach.
- **plugin-thumbnails, plugin-grid**: the drawn cards, item thumbs and cells carry `aria-setsize` /
  `aria-posinset`, so a screen reader gives each its place in the whole list, not in the drawn part.
- **plugin-pins**: a form in a pin card can keep Escape with `preventDefault()`, as GETTING-STARTED
  says; the card used to close first. Otherwise Escape inside the card closes the card (focus back on
  its pin) and leaves the viewer open.
- **renderer-dom, plugin-captions, react**: a caption that isn't a string (an old `OverlaySpec`
  caption in untyped JSON or CDN data) counts as none: no "[object Object]" in the caption bar, no
  object handed to the host, no React error from `<Gallerist.Caption>`.
- **renderer-dom**: the viewer is described by its caption (`aria-describedby`) only while the caption
  bar shows, so hidden text isn't read out.
- **plugin-captions, react**: the item's text caption, shown when `render` / `<Gallerist.Caption>`
  returns nothing, sits in a `span.gallerist-caption-text`, so it keeps the theme's caption font.
  `<Gallerist.Caption>` treats `true` / `false` like `null`.
- **plugin-download**: a cross-origin `downloadUrl` opens in a new tab (`target="_blank"`,
  `rel="noopener"`; browsers ignore `download` there) instead of navigating the host page away, and
  `downloadUrl(item)` is called once per click.
- **build**: `pnpm check:dist` also fails when a packed package lacks a file its `package.json`
  points at (`main`, `types`, every `exports` target, the theme's CSS, the CDN build), skips folders in
  `packages/` without a `package.json`, and runs in the release workflow before publishing.
- **plugin-thumbnails, plugin-grid**: moving the cursor no longer scrolls the page around an inline
  viewer; only the viewer's own panels scroll.
- **plugin-thumbnails**: a viewer opening on a far group now scrolls the rail to it.
- **theme**: every skin's backdrop is opaque (Gallery and Console were 98%, Editorial 99%), so the
  host page no longer shows through on phones, in light and dark schemes. Drag-to-dismiss still fades
  it to show the page.
- **theme**: a caption renderer's content taller than a placard (editorial) scrolls inside the placard;
  it was cut off. The placard keeps its slot, so the stage still doesn't move.
- **theme**: a caption renderer's band stops growing where the stage would drop below 36% of the
  viewer (a tall rail and bar on a phone, or the reviewer's timeline), and scrolls from there; it
  used to take its full 40vh and leave the stage as little as 28%.
- **plugin-pins**: the default card links only to `http:`, `https:`, `mailto:`, `tel:` and relative URLs; a
  pin whose `href` is `javascript:`, `data:` or any other scheme gets no link (pin data can come from
  users).
- **plugin-download**: an item with nothing safe to save (no URL, or a `data:`, `javascript:` or
  `file:` one) marks the button unavailable (`aria-disabled`, dimmed; it stays focusable) instead of a
  click that does nothing, per item as you navigate. `client-zip` is a regular dependency (`^2.5.0`),
  so an install without optional dependencies can't break a bundler on zip mode's `import()`.
- **build**: source maps carry their sources (`sourcesContent`) in every package, since `src/` isn't
  published; they pointed nowhere before. `pnpm check:dist` packs every package and fails on a leftover `workspace:`
  range.

### Added
- **renderer-dom, plugin-thumbnails**: presets configure the rail. `thumbnails()` takes the mounted
  preset's `thumbnails` options for each option it wasn't given, and an explicit one wins, key by key:
  `preset: 'reviewer'` alone now gives the timeline and numbered items, `tour` the section index,
  `editorial` the numbered item row; React's `preset` prop too. No more
  `thumbnails(resolvePreset(name).thumbnails)`. The rail settles its options when its region mounts,
  so a `viewer.use(thumbnails())` after `mount()` follows the preset as well.
- **core**: `RegionCtx.preset` (`PresetDefaults`), the renderer's mounted preset as defaults for
  plugins, keyed by what they configure; core stays renderer-agnostic. The DOM renderer passes its
  `ResolvedPreset` (now a type alias, so it fits).
- **plugin-captions** (new): designed captions, one `render(item, group, ctx)` per viewer, drawn into
  the renderer's new `caption` region (the caption bar, the editorial placard, wherever the preset puts
  it). A string is set as text; `null` shows the item's text caption. Re-renders on navigation and
  collection changes, not on zoom; `refresh()`; cleans up on removal. In the CDN global as `captions`.
- **renderer-dom**: the caption is the viewer's accessible description (`aria-describedby`); the
  navigation announcement stays position + `alt`.
- **react**: `<Gallerist.Caption>{({ item, group, cursor }) => …}</Gallerist.Caption>` (a portal into
  the caption region), `useCurrentItem()` → `{ item, group, cursor }`, `open={{ g, i }}` to open at a
  position (a new position while open moves the cursor), and the mount options `label`,
  `returnFocus`, `preload` and `adapters`, which were dropped before.
- **plugin-pins**: `renderCard` returning `null` keeps the default card for that pin; the default card
  is exported as `defaultPinCard(pin, { presentation, strings })`.
- **plugin-download**: `downloadUrl(item)`, the file to save (e.g. the full-resolution original), or
  `null` for an item that can't be downloaded; zip mode honours it too.
- **renderer-dom**: Escape still closes from anywhere, including a text field, but not when a handler
  before the viewer's called `preventDefault()` on it, so a host form can keep Escape.
- **docs**: real READMEs for plugin-download and plugin-fullscreen; the React README documents the
  imperative ref, `open` positions, captions and hooks.
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
- **plugin-thumbnails**: under a preset, an option left unset follows the preset, so a bare
  `thumbnails()` changes with it: `preset: 'reviewer'` now draws the timeline and numbered items it
  used to need spelling out; `tour` turns the rail into the section index (`groupDisplay: 'index'`,
  numbered items); `editorial` moves the item stack out of the aside column into a numbered row in the
  rail (`itemAxis: 'horizontal'`, `numberItems: true`). Pass the option (e.g. `timeline: false`,
  `groupDisplay: 'stacked'`) to keep the old rail. An explicit `groupDisplay` other than the preset's
  also drops its `itemAxis`, `numberItems` and `timeline`, which belong to the preset's own display.
- **plugin-thumbnails**: the rail's DOM is no longer created in `init()`, only when its region mounts
  (`mount()`, or a `viewer.use()` after it), so a viewer that is never mounted creates none. A new
  mount after the previous one was destroyed builds the rail again, with that mount's preset.
- **core**: `Item.caption` is plain text (`string`); it no longer accepts an `OverlaySpec`, which the
  DOM renderer never drew. Designed captions come from `@gallerist/plugin-captions` or
  `<Gallerist.Caption>`, so item data stays JSON.
- **plugin-thumbnails**: `overscan` is unset by default (the rail measures itself; it was 24) and
  counts cards on each side of the card in the middle of the rail rather than of the cursor. A jump
  past the drawn run first draws around the new current card (wide enough for it to land at either
  edge of the rail), and the scroll that reveals it trims the run back to the middle. A number below
  half the cards that fit is raised to that.
- **plugin-grid**: `overscan` counts cells (default 40) or sections (default 4) on each side of the
  current one, drawn when the grid opens; it used to count groups (default 12) and, for `sections`,
  bound the overview, which otherwise drew every group.
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

## v0.2.0

> **Renamed before first publish:** the project was developed as *Visora* (`@visora/*`); the
> `@visora` npm scope belongs to an unrelated publisher, so every package ships as `@gallerist/*`.
> CSS tokens are `--gallerist-*`, attributes `data-gallerist-*`, and the React API is
> `<Gallerist>` / `useGallerist()`.

This version was tagged in git but never reached npm; 0.3.0 is the first npm release. Alongside the UX overhaul below, a multi-axis
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
