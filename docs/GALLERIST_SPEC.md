# Gallerist — Technical Specification

> **Name:** Gallerist (locked) — the person who runs galleries. Namespace `@gallerist/*` · GitHub `galleristjs` · `gallerist.dev`.
> A headless, framework-agnostic media viewer for **grouped / nested** galleries, with **image-space overlays** and **virtualized rendering** at scale.
> License: MIT (clean-room; no lightGallery source consulted at any point).
> Status: design spec, **v1.1** — all 14 decisions locked (logged in §24). Implementation-ready.

---

## 0. Table of contents

1. Vision, scope, non-goals
2. Naming & identity
3. Architecture overview
4. The core data model (the spine)
5. Navigation model (two-axis)
6. State machine
7. Reactive store
8. Public API surface
9. Overlay system (image-space)
10. Rendering & virtualization pipeline
11. Zoom / pan engine
12. Media adapters
13. Plugin architecture
14. Official plugins
15. Theming & styling
16. Framework adapters & SSR
17. Accessibility
18. Event taxonomy
19. Configuration reference
20. Performance budgets
21. Build, packaging & repo structure
22. Browser support
23. Testing strategy
24. Decision log (resolved)
25. Roadmap & phasing
26. Licensing & contribution model
27. UI/UX & motion design

---

## 1. Vision, scope, non-goals

**Vision.** The viewer for *structured* media. Every existing lightbox models a gallery as a flat 1-D strip; the real web is galleries-of-galleries (product variants × angles, posts × images, moments × monitors, documents × pages). Gallerist makes nesting a first-class primitive, lets you anchor interactive content to points *on the image*, and holds 60fps across thousands of items.

**In scope (v1):** image/video/iframe/audio/html/custom media; two-axis navigation; zoom/pan with gesture arbitration; image-space + viewport overlays; virtualized slides and thumbnails; full keyboard + a11y; headless core + optional default theme; vanilla + React/Vue/Svelte adapters; SSR-safe; tree-shakeable plugin system.

**Non-goals (explicit):**
- Not a **grid/masonry gallery layout** engine (that's the *page*; Gallerist is the *viewer*). A thumbnail/grid plugin exists, but Gallerist does not compete with Masonry/Isotope for page layout.
- Not an **image editor** (crop/filters). Redaction/annotation overlays are display-layer only.
- Not a **video player**; it embeds providers/`<video>`, it does not reimplement playback UI.
- No jQuery. No IE.
- No bundled icon font or CSS framework dependency.

**Success criteria.** A developer with a *grouped* media problem who is currently flattening it onto PhotoSwipe/lightGallery can express the structure natively in <20 lines, and ship it lighter than they could before.

---

## 2. Naming & identity

The library is **Gallerist**: a gallerist runs galleries and curates their collections, which is what the library does for galleries of galleries. It was renamed from the working name *Visora* before first publish (Oct 2026), because the `@visora` npm scope belongs to an unrelated publisher. The criteria, in order: understandable on first hearing, not generic-sounding, and no overlap with a direct competitor. That ruled out Foldview (generic), Enfilade (obscure), anything with "reel" (`@reelkit/*` is a direct competitor), and Loupe (chai's `loupe`).

**Namespace:** npm scope `@gallerist` — `@gallerist/core`, `@gallerist/react`, `@gallerist/plugin-*`; GitHub org `galleristjs` (`gallerist` is held by an empty org); primary domain `gallerist.dev` (`.com` and `.io` are taken).

**Claim checklist (before any public release):** the `@gallerist` npm org ✅; npm `gallerist` (bare); the `galleristjs` GitHub org; `gallerist.dev`; a trademark glance in software/SaaS classes.

---

## 3. Architecture overview

Four concentric rings, each independently consumable:

```
            ┌─────────────────────────────────────────────┐
            │  Framework adapters (@gallerist/react, /vue…)   │  ← thin bindings
            │  ┌───────────────────────────────────────┐  │
            │  │   Official plugins (tree-shakeable)    │  │  ← opt-in features
            │  │  ┌─────────────────────────────────┐  │  │
            │  │  │      Renderer + default theme    │  │  │  ← DOM + CSS (swappable)
            │  │  │  ┌───────────────────────────┐  │  │  │
            │  │  │  │   Headless core engine     │  │  │  │  ← no DOM, no CSS
            │  │  │  │  data model · FSM · store  │  │  │  │
            │  │  │  │  nav · zoom math · a11y    │  │  │  │
            │  │  │  └───────────────────────────┘  │  │  │
            │  │  └─────────────────────────────────┘  │  │
            │  └───────────────────────────────────────┘  │
            └─────────────────────────────────────────────┘
```

**Key stance:** the **headless core** owns *state and logic* and touches no DOM. The **renderer** is the only ring that writes to the DOM, and it is replaceable. This is what lets Apploye (and anyone) build a fully custom UI on the same engine — and it's an architectural moat incumbents can't retrofit, because their APIs assume a fixed DOM.

Packages and their dependency direction (arrows point to dependencies):

```
react / vue / svelte ─► core
plugin-* ─────────────► core
renderer-dom ─────────► core
theme-default ────────► (CSS only, no JS dep)
core ─────────────────► (zero runtime deps)
```

---

## 4. The core data model (the spine)

### 4.1 Shape

```ts
interface Collection<GM = unknown, IM = unknown> {
  groups: Group<GM, IM>[];
  meta?: Record<string, unknown>;
}

interface Group<GM = unknown, IM = unknown> {
  id: string;                 // stable, used for keying + deep-links
  items: Item<IM>[];          // the secondary (variant) axis
  meta?: GM;                  // typed, opaque to core, consumed by plugins
  thumb?: MediaSource;        // representative thumb for the group (else items[0])
  overlays?: OverlaySpec[];   // group-level overlays (apply to all items)
}

interface Item<IM = unknown> {
  id: string;
  type: MediaType;            // 'image' | 'video' | 'iframe' | 'audio' | 'html' | custom
  source: MediaSource;        // see §12
  thumb?: MediaSource;
  alt?: string;               // a11y
  caption?: string;           // plain text; designed captions are a per-viewer renderer (plugin-captions)
  naturalSize?: { w: number; h: number };  // enables zoom-from-origin without a load
  meta?: IM;
  overlays?: OverlaySpec[];   // item-level overlays
}
```

### 4.2 The flat-gallery elegance

Internally the engine is **always** two-axis. But ~70% of users have a flat gallery. So the public API accepts either form and normalizes:

```ts
createViewer({ items: [a, b, c] })
// normalized → groups: [{items:[a]}, {items:[b]}, {items:[c]}]  (singleton groups)

createViewer({ groups: [{items:[a1,a2]}, {items:[b1]}] })
// used as-is
```

One internal representation, two ergonomic front doors. Flat users never see the word "group"; grouped users get a real model. This uniformity removes an entire class of branching bugs from the engine.

### 4.3 Sources are lazy and pluggable

`MediaSource` (full definition in §12) may be a URL string, a responsive `srcset` descriptor, an async loader (`() => Promise<...>`), or a tiled/DZI descriptor. Nothing is fetched until the windowing logic (§10) requests it.

### 4.4 Identity & stability

`id` on group and item is mandatory, must be stable across renders, and must be unique: group ids among groups, item ids across the whole collection (a group and an item may share one, as flat items do). `normalize` throws on a duplicate. It powers: DOM keying/recycling, deep-link hashes (`#g=<groupId>&i=<itemId>`), overlay persistence, and the diffing used when the collection updates live (e.g. Apploye streaming in new screenshots). The engine supports **live collection updates** — `viewer.setCollection(next)` diffs by id, preserving cursor and zoom where possible.

---

## 5. Navigation model (two-axis)

The cursor is `{ g: number; i: number }` (group index, item index).

- **Primary axis** (`next()/prev()`): moves `g`. Wraps if `loop`.
- **Secondary axis** (`nextItem()/prevItem()`): moves `i` within the current group. **Wraps within the group if `loop`** (the same flag governs both axes — see D15). A group with one item makes the secondary axis a no-op (and the renderer hides its affordances).
- **Cross-axis policy** when entering a new group — `itemMemory` (locked: default `reset`; Apploye ships `preserve`):
  - `'reset'` → `i = 0` (default; most galleries).
  - `'preserve'` → keep `i` if the new group has that index (great for monitoring: stay on monitor 2 across moments).
  - `'clamp'` → `min(i, lastIndex)`.

Default keyboard map (overridable, see §17):

| Key | Action |
|---|---|
| `←` / `→` | prev / next group |
| `↑` / `↓` | prev / next item (secondary axis) |
| `1`–`9` | jump to item N in group |
| `+` / `-` / wheel | zoom in / out |
| `0` | reset zoom (fit) |
| `Space` | toggle autoplay (if plugin) / next |
| `Esc` | close (from anywhere, including a text field, unless a handler before the viewer's called `preventDefault()` on it) |
| `f` | fullscreen (if plugin) |
| `Home`/`End` | first / last group |

Gestures (see §11 for arbitration): swipe horizontal = group nav (when not zoomed); swipe vertical-down = close; pinch/double-tap = zoom; drag = pan (when zoomed).

---

## 6. State machine

An explicit FSM prevents the "navigate-while-zooming-while-closing" bug soup. Phases:

```
closed ──open()──► opening ──(transition end)──► open ──close()──► closing ──► closed
```

Within `open`, an orthogonal **interaction** region tracks: `idle | navigating | zooming | panning | dragging`. Rules:

- A new `open()` while `closing` cancels the close and re-opens (no fl/icker).
- Navigation requests during `navigating` are **coalesced**: the latest target wins; intermediate slides are skipped (rapid arrow-key mashing lands on the final slide, loading only it).
- Zoom is reset on group change unless `keepZoomOnNav` (per-axis configurable).
- Entering `panning`/`dragging` locks the primary swipe handler (arbitration).

The FSM is implemented as a tiny pure reducer in core; the renderer subscribes and reacts. Transitions emit events (§18).

---

## 7. Reactive store

Core ships a minimal observable store: a custom ~40-line zero-dependency signal store (locked).

It is a ~40-line custom signal/selector implementation. Shape:

```ts
interface Store<S> {
  get(): Readonly<S>;
  subscribe(fn: (s: Readonly<S>) => void): () => void;
  // selector subscription to avoid over-notifying
  select<T>(sel: (s: S) => T, fn: (t: T) => void, eq?: (a:T,b:T)=>boolean): () => void;
}
```

Adapters (React `useSyncExternalStore`, Vue `shallowRef`, Svelte store contract) bind to this. Keeping it custom preserves the zero-dependency promise and a tiny bundle.

Canonical state slice:

```ts
interface ViewerState {
  phase: 'closed'|'opening'|'open'|'closing';
  interaction: 'idle'|'navigating'|'zooming'|'panning'|'dragging';
  cursor: { g: number; i: number };
  zoom: { scale: number; x: number; y: number };
  loaded: Record<string, LoadStatus>;   // by item id
  fullscreen: boolean;
}
```

---

## 8. Public API surface

### 8.1 Instantiation

```ts
const viewer = createViewer({
  // data (one of):
  items?: Item[] | HTMLCollection | string,   // flat sugar; string = CSS selector
  groups?: Group[],
  collection?: Collection,

  // behavior
  startAt?: { g?: number; i?: number },
  loop?: boolean,                 // default true
  itemMemory?: 'reset'|'preserve'|'clamp',   // default 'reset'
  keepZoomOnNav?: boolean,        // default false

  // rendering
  container?: HTMLElement | null, // null = overlay/lightbox mode (default); element = inline mode
  preload?: { ahead: number; behind: number },  // default {ahead:2, behind:1}
  windowSize?: number,            // mounted slides; default = preload span + 1

  // ui composition
  plugins?: Plugin[],
  overlays?: OverlaySpec[],       // global overlays
  controls?: boolean | ControlsConfig,  // default true; false = headless UI

  // i18n & a11y
  strings?: Partial<Strings>,
  rtl?: boolean,

  // hooks (also available as events)
  on?: Partial<EventMap>,
});
```

### 8.2 Methods

```ts
viewer.open(at?: {g?:number;i?:number}): void
viewer.close(): void
viewer.next() / prev(): void
viewer.nextItem() / prevItem(): void
viewer.goTo(g: number, i?: number): void
viewer.goToId(groupId: string, itemId?: string): void
viewer.zoomTo(scale: number, focal?: {x:number;y:number}): void  // keeps the content under `focal` (stage px) fixed; default: stage centre
viewer.resetZoom(): void
viewer.setCollection(next: Collection): void   // live diff update
viewer.refresh(): void                         // re-measure (e.g. container resize)
viewer.getState(): Readonly<ViewerState>
viewer.subscribe(fn): () => void
viewer.use(plugin: Plugin): void               // late plugin registration
viewer.destroy(): void
```

### 8.3 Inline vs overlay mode

Single flag (`container`) toggles between a full-screen lightbox (default, mounted to a portal) and an **inline** embedded viewer (carousel-in-page). All features work in both; inline mode can "maximize" to overlay if a plugin provides the control. This subsumes lightGallery's separate inline-gallery concept into one code path.

### 8.4 Internal surface (`@gallerist/core/internal`)

The root entry is the app-facing API that freezes at 1.0. Renderers and plugin authors also need plumbing that apps should not touch, so it lives behind a second entry, unstable before 1.0:

```ts
import { getInternals } from '@gallerist/core/internal'
const { emit, getPlugins, onPluginsChanged } = getInternals(viewer)
```

- `emit(event, payload)`: surface an event (the renderer emits load/overlay events, plugins their own). Off the public API so app code can't forge, say, a `loaded` event.
- `getPlugins()` / `onPluginsChanged(fn)`: the plugin registry the renderer mounts regions, adapters and overlays from.
- `setZoom(transform)`: commit a full `{scale, x, y}` (gesture end, resize re-clamp).
- `onRefresh(fn)`: run when the app calls `viewer.refresh()`; the DOM renderer re-measures, re-clamps zoom, and reads again what its plugins ask for (a rail's `data-gallerist-linear` and the keymaps, after a rail switched its display; which tools are marked `data-gallerist-off` under `controls: false`).
- `setLifecycleDriver({ opening?(done), closing?(done) })`: stretch open/close over a real transition. `opened` / `closed` fire when the renderer calls `done()`; a `done()` from a superseded transition is ignored, and removing the driver settles one in flight. The DOM renderer settles when the theme's phase animation on the root (`data-gallerist-phase`) ends.
- `setZoomBounds({ center, constrain })`: the renderer lends the core its stage geometry. Every committed zoom, from `zoomTo`, `resetZoom` or `setZoom`, passes through `constrain` (scale into [fit, max], pan so the content covers the stage, centred at fit), and `zoomTo` without a focal point pivots on `center()`.
- The engine building blocks: normalize, store, FSM, nav, windowing, springs, gesture arbitration and zoom math.

`getInternals` finds the viewer's internals under a `Symbol.for` key, so it works even when the two entries are bundled as separate copies.

---

## 9. Overlay system (image-space) — wedge #2

The differentiator. An overlay is declarative; the engine positions and (optionally) counter-scales it.

```ts
interface OverlaySpec {
  id: string;
  anchor: ViewportAnchor | ContentAnchor;
  render: (ctx: OverlayCtx) => HTMLElement | string | Node;
  layer?: number;                 // z-order within overlay stack
  interactive?: boolean;          // default false → pointer-events:none (won't block gestures)
  visibleAt?: [minScale: number, maxScale: number];  // show only in a zoom range
  scaleWithImage?: boolean;       // default depends on anchor type (see below)
  class?: string;
}

type ViewportAnchor =
  | { kind:'viewport'; at: 'top-left'|'top'|'top-right'|'left'|'center'|'right'|'bottom-left'|'bottom'|'bottom-right'; offset?: [x:number,y:number] };

type ContentAnchor =
  | { kind:'point'; x: number; y: number; space?: 'natural'|'normalized' }   // sticks to a pixel/percentage on the image
  | { kind:'region'; x:number; y:number; w:number; h:number; space?:'natural'|'normalized' }; // a rect on the image

interface OverlayCtx {
  group: Group; item: Item;
  zoom: { scale:number; x:number; y:number };
  viewer: ViewerApi;             // overlays can drive navigation, open menus, etc.
}
```

### 9.1 Positioning mechanics

Two overlay containers sit above the media in the slide:

- **Viewport layer** — normal flow within the stage; anchored to frame corners. Used for badges, toolbars, counters (the activity %, app/time chips in the mockup). `pointer-events:none` by default so they never eat swipe/zoom gestures unless `interactive`.
- **Content layer** — a single positioned element that shares the **exact transform matrix** of the media (`translate(x,y) scale(scale)`). Children placed in image-space coordinates therefore track the photo through zoom/pan **for free**, with no per-frame JS.
  - `kind:'region'` (redaction box, hotspot area) — `scaleWithImage:true` default → scales with the image naturally.
  - `kind:'point'` (a pin, a callout) — `scaleWithImage:false` default → the engine applies a counter-scale `scale(1/zoom)` so the pin stays a constant screen size while its anchor point stays glued to the pixel.

This single mechanism powers shoppable hotspots, annotations, measurement callouts, and privacy redaction — none of which any competitor offers, and all from one ~slot API.

### 9.2 Performance

The content layer transform is updated by the same RAF that drives zoom/pan, so overlays add **zero** extra layout passes. Counter-scaled points use CSS `transform` only (compositor-friendly). Overlays for non-visible slides are not rendered.

---

## 10. Rendering & virtualization pipeline

### 10.1 Slide windowing

Only `windowSize` slides exist in the DOM. A **node pool** recycles slide containers on navigation rather than create/destroy (eliminates GC churn and layout thrash). For each mounted slide, only the **active item** of its group is mounted by default; neighboring items within the group are preloaded per `preload`.

### 10.2 Load scheduling

- Each source load is an abortable task (`AbortController`); fast navigation cancels superseded loads.
- Images: set `decoding="async"`, call `img.decode()` before reveal to avoid half-painted fl/ash, choose the right `srcset` candidate from measured stage size, set `fetchpriority="high"` on the current slide and `"low"` on preloads.
- Priority order: current item → secondary-axis neighbors (if grouped) → adjacent groups → thumbnails.

### 10.3 Thumbnail / secondary-view virtualization

The thumbnail rail is a windowed list: only visible thumbs + overscan are in the DOM, lazy-loaded via `IntersectionObserver`. This is what makes 10k-item galleries (Apploye's reality) scroll smoothly — the flat libraries render every thumb and choke. Grouped rails render one entry per group (the stacked card); expanding a group lazily mounts its item thumbs.

### 10.4 Transitions

Default transition = transform-based slide (`translate3d`) on a track, or per-slide cross-fade. All transitions are pure CSS transforms/opacity (compositor thread), gated by `prefers-reduced-motion` (→ instant). Pluggable transition strategies (`mode`) so the long tail of effects lives in opt-in plugins, not core weight.

### 10.5 Resize

A single `ResizeObserver` on the stage re-measures and re-picks `srcset` candidates and re-clamps zoom bounds. Debounced to a frame.

---

## 11. Zoom / pan engine

### 11.1 Coordinate spaces

`screen → stage → content(natural)`. State `{scale, x, y}` is the content layer's transform. Conversion helpers map pointer coords ↔ image-natural coords (needed by overlays and hotspots).

### 11.2 Gestures

- **Wheel** → focal zoom centered at the cursor.
- **Pinch** → focal zoom centered at the touch midpoint.
- **Double-tap / double-click** → toggle fit ↔ actual (or stepped: fit → 1× → max).
- **Drag** → pan when `scale > fitScale`.
- **Inertia** → momentum on pan release with rubber-band bounds.

### 11.3 Gesture arbitration (the hard part, specified)

A single pointer-down must resolve to exactly one of {navigate-swipe, pan, close-swipe, zoom}. Rules, evaluated on first move past a small threshold:

1. If two pointers → **zoom** (pinch). Lock others.
2. Else if `scale > fitScale`:
   - Horizontal intent → **pan**. At a pan boundary, if the drag continues in the same direction past an over-pull threshold → hand off to **navigate** (so a zoomed user can still page).
   - Vertical intent → **pan**.
3. Else (`scale == fitScale`):
   - Dominant-horizontal → **navigate** (group axis).
   - Dominant-vertical-down → **close-swipe** (drag-to-dismiss with backdrop fade tracking displacement).
   - Dominant-vertical-up → **secondary axis** if grouped, else ignored.

Intent = first axis to exceed threshold; locked for the gesture once chosen (no mid-gesture flip-flop). Uses Pointer Events (unified mouse/touch/pen).

### 11.4 Large images

`naturalSize` lets zoom-from-origin and bounds compute without a load. For very large sources, the **tiled/DZI adapter** (§12, v2) serves resolution levels so deep zoom never loads a 100MP full image. DZI is scoped to **v2**; v1 ships the adapter seam and zoom-engine hooks so it drops in without a breaking change.

---

## 12. Media adapters

A media type is handled by an adapter; this is also a plugin extension point (custom types).

```ts
interface MediaAdapter {
  type: string;                                  // 'image', 'video', ...
  match?(item: Item): boolean;                   // optional override of item.type
  mount(item: Item, slot: HTMLElement, ctx: AdapterCtx): MountedMedia;
}
interface MountedMedia {
  element: HTMLElement;
  ready: Promise<void>;                          // resolves when displayable
  naturalSize?(): { w:number; h:number } | null; // for zoom bounds
  supportsZoom: boolean;
  activate?(): void; deactivate?(): void;        // e.g. play/pause on slide enter/leave
  destroy(): void;
}
```

`MediaSource`:

```ts
type MediaSource =
  | string                                              // url
  | { src: string; srcset?: string; sizes?: string }    // responsive
  | { loader: (signal: AbortSignal) => Promise<string|HTMLElement> }
  | { tiles: DZIDescriptor };                            // deep zoom (v2)
```

Adapters:

- **image** (core): responsive `srcset`, decode-before-reveal, zoom via the zoom engine, `naturalSize` from `decode()` or `naturalSize` hint.
- **video** (plugin, `plugin-video`): HTML5 `<video>` in core-light form; provider sub-adapters (`plugin-video-youtube`, `-vimeo`, `-wistia`) split out so you only ship the providers you use. `activate/deactivate` wire play/pause and "advance on ended". This avoids lightGallery's monolithic video weight.
- **iframe / html / audio** (small core or plugin).
- **custom**: register via `viewer.use(mediaAdapter(...))` — e.g. a 3D model viewer, PDF page, map.

---

## 13. Plugin architecture

A plugin is a factory returning lifecycle hooks and extension registrations. Everything beyond the engine is a plugin; **core ships with none enabled**, so bundle size scales with features used.

```ts
type Plugin = (viewer: ViewerApi, opts?: unknown) => PluginInstance;

interface PluginInstance {
  name: string;
  // lifecycle (all optional)
  init?(): void;
  destroy?(): void;
  // hooks
  on?: Partial<EventMap>;
  // UI region injection (renderer provides named regions)
  regions?: Partial<Record<RegionName, (ctx) => Node>>;  // 'toolbar'|'aside'|'footer'|'caption'|'stage'|'thumbnails'|'backdrop'
  // extensions
  overlays?: OverlaySpec[];
  mediaAdapters?: MediaAdapter[];
  keymap?: Record<string, (e: KeyboardEvent) => void>;
  transitions?: Record<string, TransitionStrategy>;
}
```

Plugins compose: e.g. `plugin-thumbnails` registers a `thumbnails` region + keymap; `plugin-redaction` registers `region`-anchored overlays + an edit toolbar button. Ordering is explicit (registration order); conflicts (two plugins claiming the same region) resolve last-wins with a dev warning.

---

## 14. Official plugins (the breadth that earns retention)

Tree-shakeable, each its own package:

| Plugin | Purpose |
|---|---|
| `plugin-thumbnails` | Filmstrip rail (windowed); grouped stacked cards for multi-item groups. |
| `plugin-grid` | Contact-sheet / grid view, groupable with interval headers. |
| `plugin-timeline` | Draggable scrubber where a `meta` field maps to color/position (activity heatmap). |
| `plugin-filter` | Faceted filter/sort over `meta` (activity threshold, app, tag, flagged). |
| `plugin-video` (+ provider subs) | HTML5 + YouTube/Vimeo/Wistia adapters. |
| `plugin-fullscreen` | Native Fullscreen API. |
| `plugin-hash` | Deep-link `#g=&i=`, back/forward nav, shareable URLs. |
| `plugin-save` | Single / "all items in group" / bulk-range → zip. |
| `plugin-share` | Social + custom share targets. |
| `plugin-slideshow` | Autoplay with progress bar; stop-on-interaction. |
| `plugin-rotate` | Rotate/flip (display transform). |
| `plugin-captions` | Designed captions: one render function per viewer, drawn into the caption region (item data keeps a text `caption`). |
| `plugin-redaction` | Region overlays for privacy blur/redaction. |
| `plugin-compare` | Two slides side-by-side or a before/after wipe (degenerate 2-item group). |
| `plugin-triage` | Keyboard review mode (`j/k`, flag, delete) + bulk-select. |
| `plugin-exif` | Read & display EXIF/metadata. |

Core differentiators (`thumbnails` grouped mode, `timeline`, `filter`, `redaction`, `compare`) are what no single competitor bundles — but they're all generic, not Apploye-specific.

---

## 15. Theming & styling

Three tiers, opt-in:

1. **Headless** (`controls:false`, no theme CSS) — core renders structural DOM only; you bring all UI via regions/overlays. This is how Apploye builds its bespoke admin reviewer.
2. **Default theme** (`@gallerist/theme-default`, pure CSS, no JS dep) — a clean, modern skin driven entirely by CSS custom properties.
3. **Tokens** — every color/size/timing is a `--gallerist-*` variable. Skins (`gallery` default, `console`, `editorial`) set tokens on a shared `base.css`, selected with `[data-gallerist-skin]`; the accent (`[data-gallerist-accent]`) and the dark/light/auto scheme (`[data-gallerist-scheme]`) are independent of the skin (D18); an unset scheme is the skin's own default. No hardcoded colors anywhere.

```css
.gallerist { --gallerist-backdrop: rgb(0 0 0 / .9); --gallerist-fg:#fff; --gallerist-accent:#378add;
          --gallerist-radius:8px; --gallerist-speed:300ms; --gallerist-thumb-h:80px; /* … */ }
```

Class hooks are stable and documented (`.gallerist-stage`, `.gallerist-slide`, `.gallerist-thumb`, `.gallerist-overlay-*`). No inline styles for theming (only for computed transforms). RTL via `[dir=rtl]` flips axis math and layout.

---

## 16. Framework adapters & SSR

Thin bindings over the headless store. Build order (locked): **vanilla → React → Vue → Svelte** — React first, to dogfood Apploye.

- **Vanilla** — `createViewer()` (the reference).
- **React** — `<Gallerist>` component (controlled `open`/`onClose`, or imperative ref) **and** a headless `useGallerist()` hook returning state + actions for fully custom UI. Uses `useSyncExternalStore`.
- **Vue 3** — `<Gallerist>` SFC + `useGallerist()` composable; `v-model:open`.
- **Svelte** — component + a store conforming to Svelte's contract + an `action` for triggers.

**SSR:** the core does zero DOM work at import or construction; all DOM access is deferred to `open()`/mount and guarded for `typeof window`. Components render a stable placeholder server-side and hydrate on mount. Deep-link (`plugin-hash`) reads the URL only client-side.

---

## 17. Accessibility (first-class, not bolted on)

- **Dialog semantics:** overlay mode = `role="dialog" aria-modal="true"`, focus trapped, focus restored to the trigger on close, scroll-lock on the page behind.
- **Carousel + group semantics:** the sequence exposes the APG carousel pattern; the secondary axis exposes a group/listbox so SR users understand the nesting. `aria-roledescription` per layer.
- **Live region:** an `aria-live="polite"` node announces transitions, including nesting: *"Group 3 of 40, screen 1 of 3."*
- **Keyboard:** every action reachable; full map in §5; visible focus rings; overlays that are `interactive` are tab-reachable, decorative ones `aria-hidden`.
- **Media:** `alt` per item required (lint warns if missing); the caption (text, or a rendered caption's text content) is the viewer's description via `aria-describedby`; the live announcement is position + `alt`, never a rendered caption; video respects provider a11y.
- **Motion / contrast:** `prefers-reduced-motion` → instant transitions, no auto-zoom; `prefers-contrast` honored by theme tokens.
- **Target sizes:** controls ≥44px touch targets.
- **Testing:** axe in CI on the example apps + manual SR passes (VoiceOver/NVDA) before each minor.

---

## 18. Event taxonomy

Typed emitter; every event also accepts a handler in `on`. Payloads carry `{viewer, cursor, group, item}` plus event-specifics.

```
init, destroy
open, opened, close, closed              (phase transitions)
beforeSlide, slide, afterSlide           (group axis; cancelable beforeSlide)
beforeItem, item, afterItem              (secondary axis)
zoom, zoomEnd, pan
load, loaded, loadError                  (per item, with id)
collectionChange                         (after setCollection diff)
fullscreenChange
overlayClick                             (id of clicked interactive overlay)
```

`beforeSlide`/`beforeItem` are **cancelable** (return `false` / call `e.preventDefault()`) — e.g. Apploye can block navigation until an unsaved annotation is confirmed.

---

## 19. Configuration reference

Full option list with defaults lives in §8.1; defaults summary: `loop:true`, `itemMemory:'reset'`, `keepZoomOnNav:false`, `preload:{ahead:2,behind:1}`, `controls:true`, `container:null` (overlay mode), transitions on, motion-safe. Mobile overrides are merged from a `mobile` block (unlike lightGallery, Gallerist **merges** mobile over defaults rather than replacing the whole object — fixes a known footgun).

---

## 20. Performance budgets (committed, CI-enforced)

| Metric | Target |
|---|---|
| Core (`@gallerist/core` + `renderer-dom`, gz) | ≤ 16.5 KB (16 KB until 2026-11-03; raised for the keyboard-scrollable caption band, plan P2-R) |
| Core + thumbnails + image, gz | ≤ 24 KB (≈ lighter than lightGallery+plugins and ~PhotoSwipe) |
| Cold open → first slide painted | < 100 ms (cached) |
| Navigation frame rate | 60 fps (no long tasks > 50 ms) |
| Thumbnail rail, 10,000 items | smooth scroll, < 200 DOM nodes live |
| Memory, 10k-item session | bounded (windowed); no monotonic growth across 500 navigations |

Budgets are gates: a PR that exceeds size or drops frames fails CI (size-limit + a Playwright perf trace). Bundle size is a headline marketing claim, so it's protected.

---

## 21. Build, packaging & repo structure

- **Language:** TypeScript, strict. Ship `.d.ts`. (locked)
- **Output:** ESM-first with a `cjs` fallback; UMD build only for the CDN `<script>` use case. `exports` map per package; `sideEffects:false` for tree-shaking; CSS shipped separately.
- **Monorepo:** pnpm workspaces + Changesets for versioning/release. (locked)

```
gallerist/
├─ packages/
│  ├─ core/                 # engine: model, FSM, store, nav, zoom math, a11y, events
│  ├─ renderer-dom/         # the DOM renderer (default)
│  ├─ theme-default/        # CSS only
│  ├─ react/  vue/  svelte/ # adapters
│  └─ plugin-*/             # one package per plugin
├─ examples/                # vanilla, react, ecommerce, monitoring(Apploye-like), photography
├─ docs/                    # docs site (also the live demo playground)
├─ e2e/                     # Playwright: gestures, a11y, perf
└─ .changeset/
```

- **CI:** typecheck → unit (vitest) → size-limit → docs build. e2e (Playwright, including axe and the perf gate) runs locally before merging, or on demand through the manual E2E workflow. Release via Changesets, run by hand.

---

## 22. Browser support

Evergreen baseline: last 2 versions of Chrome/Edge/Firefox/Safari + iOS Safari 15+. Hard requirements: Pointer Events, ResizeObserver, IntersectionObserver, `Element.animate`/CSS transforms, `img.decode()`. No IE, no polyfill bundle (consumers may add their own). Floor locked (admin-facing dashboard; every required API has been baseline since ~2020).

---

## 23. Testing strategy

- **Unit (vitest):** model normalization (flat↔grouped), FSM transitions, nav math (loop/itemMemory), zoom coordinate conversions, store selectors.
- **Gesture simulation:** synthetic Pointer Event sequences asserting arbitration outcomes (the §11.3 rules table becomes a test matrix).
- **Visual regression (Playwright):** transitions, theme, overlays at multiple zoom levels.
- **A11y (axe + manual):** dialog/focus/live-region; SR scripts.
- **Performance:** Playwright trace asserting frame budget + size-limit on every package.
- **Examples-as-tests:** each example app is smoke-tested so the public DX never silently breaks.


---

## 24. Decision log (resolved)

All forks are locked. Recorded here for provenance.

| # | Decision | Locked choice | Why |
|---|---|---|---|
| D1 | Name & scope | **Gallerist**, `@gallerist/*` | Renamed from Visora (its npm scope was taken). Understandable at first hearing, on-theme (galleries of galleries), and the npm scope and bare name were free. |
| D2 | Language | **TypeScript**, strict, ships `.d.ts` | A typed grouped model is a selling point. |
| D3 | Core store | **Custom ~40-line zero-dep** signal store | Protects the zero-dependency promise and bundle budget. |
| D4 | `itemMemory` default | **`reset`** (Apploye ships `preserve`) | Matches general galleries; monitoring keeps the same monitor across moments. |
| D5 | Styling | **Headless core + optional default theme** | Widest appeal; serves community and Apploye's custom UI alike. |
| D6 | Framework order | **vanilla → React → Vue → Svelte** | React first, to dogfood Apploye. |
| D7 | Contribution model | **Pure MIT + DCO** (no CLA) | Moat is the domain layer + category ownership, not relicensing the core; MIT already allows Apploye's closed plugins; DCO gives provenance without an ownership grab; on-message for why Gallerist exists. |
| D8 | Video providers | **Split provider sub-plugins** | Bundle hygiene — ship only the providers you use. |
| D9 | Deep-zoom (DZI) | **v2**, seams in v1 | Heavy; most users don't need 100MP tiling; v1 leaves a non-breaking hook. |
| D10 | Browser floor | **Evergreen + iOS 15+** | Admin-facing dashboard; required APIs baseline since ~2020; no IE. |
| D11 | Bundle ceiling | **Public, CI-enforced promise** | "Lighter than X" is core positioning (§20). |
| D12 | Monorepo tooling | **pnpm + Changesets** | Simplest for an OSS lib. |
| D13 | Production direction | **Dogfood-first** | Apploye is the first consumer of the MVP; stress-tests the grouped model on a hard workload. |
| D14 | Open-core boundary | **All generic features MIT; only Apploye domain logic proprietary** | Generosity in the core drives adoption; the moat is the domain layer, not withheld features. |
| D15 | `loop` axis scope | **Both axes wrap on `loop`** (single flag) | Phase-1 review: `nextItem/prevItem` wrap within the group when `loop` is set, mirroring the primary axis, rather than introducing a separate per-axis flag. Simpler surface; the variant axis cycles like the group axis. |
| D16 | Look layering | **Skin × preset × plugin** | Oct 2026 design review: six directions become three skins (`gallery`, `console`, `editorial`), layout presets (incl. new `editorial`, `tour`) and plugins/modes (`plugin-atlas`, `plugin-pins`, a later `stories` mode). Skins set tokens only and never position chrome. See `plans/phase-2-product.md`. |
| D17 | Default look | **Gallery skin** | The neutral photo-first skin fits the mainstream; today's graphite + amber look moves unchanged into the `console` skin, paired with the `reviewer` preset as the flagship review demo. |
| D18 | Theme options | **`skin`, `accent`, `scheme`** | Separates the skin from its accent and from dark/light. The React `theme` prop (an accent) is renamed `accent`; breaking, pre-1.0. |
| D19 | Stories | **Gated after 0.3** | A portrait stories mode is effectively a second interaction model, and ReelKit already ships one; build only after an explicit go/no-go. |

Note on D7: pure MIT + DCO means the open core cannot be *unilaterally* re-licensed commercially later. Accepted deliberately — that lever isn't needed, because value capture lives in the Apploye layer, which MIT already permits to stay closed.

---

## 25. Roadmap & phasing

> **Current plan (Oct 2026):** `plans/phase-2-product.md` supersedes the Phase 2/3 ordering below:
> chrome architecture and skins first, 0.3 with Gallery, Console, Editorial, Tour and pins, then
> Atlas and the review plugins in 0.4, and Stories behind a go/no-go.

**Phase 0 — Engine MVP (the foundation, ~the half-the-project the spec buys).**
Core: data model + normalization, FSM, store, two-axis nav, zoom/pan + arbitration, overlay layer (both anchor types), slide windowing, a11y baseline, events. Renderer-dom + default theme. Image adapter. Vanilla API. → *At this point Gallerist already does something nobody else does: native grouped navigation with image-space overlays.*

**Phase 1 — Parity + first consumer.**
`plugin-thumbnails` (grouped), `plugin-grid`, `plugin-save`, `plugin-fullscreen`, `plugin-hash`, `plugin-video` + HTML5/YouTube. React adapter (first, per the locked order). Apploye reviewer rebuilt on top — dogfood-first. → *Replaces lightGallery for Apploye; reaches feature-parity for general users.*

**Phase 2 — Differentiators + reach.**
`plugin-timeline`, `plugin-filter`, `plugin-redaction`, `plugin-compare`, `plugin-triage`, `plugin-exif`, remaining video providers, remaining framework adapters, DZI hooks. Docs site with live playground. → *Now it's clearly the "structured media viewer," not just another lightbox.*

**Phase 3 — Ecosystem.**
Plugin authoring guide, third-party adapter examples (3D/PDF/maps), perf hardening, 1.0 stability commitment, community launch (Show HN / Product Hunt) leading with the grouped/nested story.

---

## 26. Licensing & contribution model

- **License:** MIT for the entire public project — core, renderer, theme, all official plugins, and adapters.
- **Contributions:** accepted under a **DCO** (Developer Certificate of Origin), not a CLA. Contributors attest they have the right to submit their work; no copyright assignment, no ownership transfer. Maximises community trust and matches the reason Gallerist exists.
- **No dual-licensing of the core.** Gallerist is pure MIT with no CLA, so the open core cannot be unilaterally re-licensed later. Deliberate (D7): value capture lives in the Apploye layer, not in relicensing generic features.
- **Clean-room discipline (non-negotiable):** no lightGallery (or other GPL lightbox) source is read, ported, or referenced during implementation. Design derives only from public behavior, this spec, and original work. This keeps Gallerist free of copyleft obligations and lets Apploye use it commercially with zero friction — the entire point.
- **Apploye layer:** a separate *private* package consuming `@gallerist/*` through public APIs. MIT permits proprietary downstream use, so there is no conflict and no CLA is needed to keep Apploye's domain logic closed.

---

## 27. UI/UX & motion design

Gallerist ships a default theme + motion layer that any adopter inherits for free; every value below is a `--vis-*` token, and headless mode (`controls:false`, no theme CSS) opts out entirely. The stance: **the content is the UI, chrome is a guest that fades, and every interaction follows the finger.**

### 27.1 Principles (binding)
1. **Direct manipulation, 1:1.** Pan/zoom/drag track input exactly; animations are interruptible mid-flight.
2. **Disappearing chrome.** Controls fade on idle, return on intent; the media is the hero.
3. **Spring physics, never linear.** No animation is linear; none exceeds ~450ms.
4. **Spatial consistency.** Time moves horizontally; variants move in depth — the two axes never share a motion.
5. **Typographic discipline.** Tabular numerics, tight scale, weight ≤500, ruthless legibility on dark.
6. **No jank.** Placeholder-or-image always; never a spinner on black; chrome never reflows.

### 27.2 Motion system
Named springs (physical intent; sampled to keyframes for WAAPI, approximated by cubic-bezier in CSS):

| Token | Use | Feel |
|---|---|---|
| `--vis-spring-smooth` | shared-element open/close | stiffness ≈210, damping ≈26 (~420ms) |
| `--vis-spring-snappy` | time-axis nav, dismiss spring-back | stiffness ≈320, damping ≈30 (~340–430ms) |
| `--vis-spring-pop` | screen-axis (depth) | slight overshoot, `cubic-bezier(.34,1.3,.5,1)` (~340ms) |
| `--vis-spring-gentle` | chrome / backdrop fades | stiffness ≈140, damping ≈24 (~280ms) |

- Hero moments (open/close, axis transitions) use `Element.animate` with spring-sampled keyframes; non-hero motion uses tuned cubic-beziers (`ease-out = cubic-bezier(.22,1,.36,1)`).
- Duration bands: micro 120–180ms · standard 220–320ms · hero 340–430ms. Hard ceiling 450ms.
- **Interruptibility (required):** any in-flight hero animation can be grabbed; a new gesture/command re-bases from the current computed transform — never a snap.

### 27.3 The three signature moments (specs)
1. **Shared-element open/close.** FLIP from the trigger thumbnail's bounding rect to the stage rect; the image cross-scales while the backdrop blooms (opacity + blur) over the same `--vis-spring-smooth` curve. Close recomputes the live trigger rect (in case the page scrolled) and reverses. Fallback when `naturalSize` is absent or reduced-motion is set: a ≤140ms cross-fade.
2. **Depth-flip between screens.** Screen-axis transition uses `--vis-spring-pop` (scale 0.9→1 + small Y offset + overshoot); optional stacked-card parallax (cards behind shift slightly). Visibly distinct from the horizontal time slide — this distinction is load-bearing and visual-regression-locked.
3. **Scrubber loupe.** A draggable day-timeline; on hover/drag a magnified preview tile floats above the cursor showing the frame at that position, tinted by an activity `meta` field. RAF-throttled; preview thumb lazily decoded.

### 27.4 Chrome & material
- Top bar 56px; bottom rail per §14 components. Both: `backdrop-filter: blur(20px) saturate(180%)`, background `rgba(10,10,14,.45)`, `0.5px` hairline `rgba(255,255,255,.08)`.
- **Auto-hide:** chrome fades (`--vis-spring-gentle`) after `chromeIdleMs` (default 2500). Returns on `pointermove`, `keydown`, `touchstart`, or focus entering the viewer. Desktop cursor hides with the chrome. Auto-hide is **paused while keyboard focus is inside the viewer**, so keyboard users never lose controls.
- **Backdrop:** `rgba(8,8,10,.94)` + a subtle radial vignette; in inline-maximize, the page behind is blurred.
- **Accent:** a single `--vis-accent` (default a calm blue), used sparingly — active indicator, focus ring, selection.

### 27.5 Spatial grammar (two axes)
- **Time axis** (groups): horizontal `translateX`, direction-aware enter from ±X, opacity 0→1, `--vis-spring-snappy`.
- **Screen axis** (items): depth pop (`--vis-spring-pop`), no horizontal travel.
- Rule: the axes must never share a motion; comprehension of the nesting depends on it.

### 27.6 Typography & color
- Numerics (counter, timestamps, durations): 13px, `font-variant-numeric: tabular-nums`. Captions 14px. Titles 15–16px / weight 500. Max weight 500.
- Monochrome surfaces + one accent. The activity ramp (red <30 / amber 30–69 / green ≥70) is used **only** where it encodes meaning, never decoratively.

### 27.7 Loading & perception
- Render a **BlurHash/LQIP placeholder immediately**; decode the sharp image off-thread (`decoding="async"` + `img.decode()`), then cross-fade in (~180ms).
- **Never a spinner on black.** If a load exceeds ~600ms, show a faint skeleton shimmer over the placeholder.
- Reserve metadata space so chrome never reflows when data arrives.

### 27.8 Direct-manipulation feel
- During an active drag/zoom there is **no easing** — 1:1 with the pointer.
- **Drag-to-dismiss:** vertical drag shrinks the media toward the trigger and fades the backdrop proportional to displacement; release past threshold → close (continue to the trigger), else spring back (`--vis-spring-snappy`).
- Rubber-band at pan/zoom bounds; momentum on release.
- **Haptics:** optional Vibration API taps on zoom-snap and slide-commit; off by default (`haptics:false`).

### 27.9 Theming & escape hatch
- Everything above ships in `@gallerist/theme-default` plus a motion module in core; all values are `--vis-*` tokens.
- Headless mode opts out of theme and motion entirely.
- Apploye sets `--vis-accent` and a density token and inherits the rest.

### 27.10 Accessibility within polish
- `prefers-reduced-motion: reduce` → all springs/transforms collapse to ≤140ms opacity cross-fades; no auto-zoom, no parallax; drag-to-dismiss still works, without inertial overshoot.
- `:focus-visible` rings (2px accent) on every control; never removed for aesthetics.

### 27.11 Design acceptance bar (testable)
- No animation is linear; none exceeds 450ms.
- Every hero animation is interruptible (test: reverse mid-flight → assert no snap).
- 60fps during nav/zoom/drag on a mid-tier laptop and a ~3-year-old phone (Playwright trace, no long task >50ms).
- No spinner-on-black anywhere; first paint is always placeholder-or-image.
- Reduced-motion path verified to remove all transforms.
- Time vs screen axes use visibly distinct motions (visual-regression locked).

---

*End of spec v1.1 — all decisions locked, Gallerist threaded, UI/UX formalized. Next: Phase 0 implementation, starting with the core data model (§4) and state machine (§6) as the first slice.*