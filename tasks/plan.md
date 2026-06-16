# Visora — Phase 1 Plan (parity + first consumer)

> Strategic plan. Executable checklist: `tasks/todo.md`. Design source of truth:
> `docs/VISORA_SPEC.md`. As-built Phase 0: `docs/IMPLEMENTATION.md`.

## Context

Phase 0 shipped the engine MVP — headless `@visora/core`, `@visora/renderer-dom`,
`@visora/theme-default`, image adapter, vanilla API (tag `v0.0.0-phase0`; 173 unit + 11 e2e green;
core 3.07 KB, core+renderer 6.75 KB / 16 KB). Phase 1 (spec §25) makes the engine adoptable: a
**plugin architecture**, the **React adapter** (dogfood-first), and the first official **plugins**,
so Apploye (separate private package) can rebuild its reviewer and general users reach parity.

Phase 0 review finding **I5**: the named-region plugin contract must live abstractly in
`@visora/core` so plugins survive a renderer swap. Phase 1 builds it first.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| P1-A | Build order | **Foundation-first**: plugin arch + region contract → 1 plugin end-to-end → React → rest |
| P1-B | Scope | **Full §25**: thumbnails(grouped), grid, download, fullscreen, hash, video(HTML5)+youtube, React |
| P1-C | Plugin registration | **Register on core** (`createViewer({plugins})` + `viewer.use()`); renderer pulls regions at mount |
| P1-D | Region contract | **Abstract `RegionName` in core** (spec §13); renderer-dom implements mounts; regions return `Node` |
| P1-E | React UI authoring | **JSX portal bridge** — `<Visora.Overlay>`/`<Visora.Region>` portal React children into host nodes (P0-G) |
| P1-F | React API shape | **Compound components** + headless **`useVisora()`**; `useSyncExternalStore` |
| P1-G | Video packaging | **Split sub-plugins** (D8): `@visora/plugin-video` (HTML5) + `@visora/plugin-video-youtube` |
| P1-H | Download | single + group (no dep); bulk **zip via dynamic `import()`** of a tiny streaming zip lib |
| P1-I | Grid | **In-viewer grid mode** — `stage`-region contact sheet; click cell → `goTo` + hide |
| P1-J | React peer | `react >= 18`; component tests via @testing-library/react + happy-dom |

## New packages

```
packages/react                     @visora/react
packages/plugin-fullscreen         @visora/plugin-fullscreen
packages/plugin-hash               @visora/plugin-hash
packages/plugin-thumbnails         @visora/plugin-thumbnails
packages/plugin-grid               @visora/plugin-grid
packages/plugin-download           @visora/plugin-download
packages/plugin-video              @visora/plugin-video           (HTML5)
packages/plugin-video-youtube      @visora/plugin-video-youtube
```
Each: own package, `sideEffects:false`, tree-shakeable, depends on `@visora/core` types only.

## Dependency graph / build order

```
core: Plugin/PluginInstance/RegionName contract + registry        (F1)
  └─ renderer-dom: region hosts + plugin consumption              (F2)
       ├─ plugin-fullscreen   (thin slice — proves the contract)  [M7]
       ├─ @visora/react (hook → component → portal bridge)        [M8]
       ├─ plugin-hash, plugin-download                            [M9]
       ├─ plugin-thumbnails (grouped; reuses windowing)           [M10]
       ├─ plugin-grid (in-viewer mode; reuses windowing)          [M11]
       └─ plugin-video + plugin-video-youtube                     [M12]
            └─ M13 hardening (a11y, perf, size, examples, docs)
```

## Architecture invariants (extend Phase 0)

1. Core stays DOM-free: plugin/region **types** in core; region **mounts** in renderer-dom.
2. One registration path: plugins register on the viewer (core); renderer reads `viewer`'s plugins
   at mount. `viewer.use(p)` re-runs region mounting.
3. Region conflict = last-wins + dev `console.warn` (spec §13).
4. Every plugin independently tree-shakeable; none bundled into core/renderer.
5. SSR-safe: `window`/`document` guarded; React placeholder + hydrate (spec §16).

## Key contracts to add (spec §13/§16)

```ts
// @visora/core
type RegionName = 'toolbar' | 'footer' | 'stage' | 'thumbnails' | 'backdrop' | (string & {})
type Plugin = (viewer: ViewerApi, opts?: unknown) => PluginInstance
interface PluginInstance {
  name: string
  init?(): void; destroy?(): void
  on?: EventHandlers
  regions?: Partial<Record<RegionName, (ctx: RegionCtx) => Node>>
  overlays?: OverlaySpec[]
  mediaAdapters?: MediaAdapter[]
  keymap?: Record<string, (e: KeyboardEvent) => void>
  transitions?: Record<string, TransitionStrategy>
}
// ViewerOptions.plugins?: Plugin[];  ViewerApi.use(p: Plugin): void
```
Reuse: `windowIndices`/`reconcileKeys` (`renderer-dom/src/windowing.ts`) for thumbnails+grid; the
image adapter (`adapters/image.ts`) for video; overlay paint/update for plugin overlays; `emit`/`on`
for plugin events.

## Risks & mitigations

1. **React portal host stability** — overlays rebuild on item change (I1) → host recreated → portal
   dropped. Mitigation: React bridge re-portals on host change (ref-callback), or core keeps a
   stable host per overlay id. Decide in M8.
2. **Region re-render timing** — cursor-dependent regions (thumbnails active state) update in place
   via a region ctx `subscribe` (mirror overlay paint/update split).
3. **Thumbnails/grid at 10k** — stay <200 nodes (§20): windowing + IntersectionObserver overscan;
   perf gate in M13.
4. **YouTube async API** — guard + mock in unit; gate youtube e2e behind an opt-in flag.
5. **Size creep** — per-package size-limit entries; `sideEffects:false`; no plugin in core/renderer.

## End-to-end verification

```
pnpm build && pnpm typecheck && pnpm lint
pnpm test     # core registry, react hook/portal, plugin units (node + happy-dom)
pnpm e2e      # fullscreen, hash, download, thumbnails nav, grid, video, React example, axe
pnpm size     # core ≤12, core+renderer ≤16, core+thumbnails+image ≤24 (gz)
```
Manual: React example + plugins demo — thumbnails (grouped, expand), grid toggle, fullscreen,
deep-link round-trip (`#g=&i=`), download, video play/pause on slide enter/leave.
