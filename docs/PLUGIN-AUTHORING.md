# Authoring a Visora plugin

A plugin is a factory the user binds (e.g. `fullscreen()`) that returns `(viewer) => PluginInstance`.
Everything beyond the engine is a plugin; core ships with none enabled, so bundle size scales with
features used (spec §13). Plugins register on the **viewer** (`createViewer({ plugins })` or
`viewer.use()`); the renderer reads them at mount and reacts to `onPluginsChanged`.

## Contract

```ts
import type { Plugin } from '@visora/core'

export function myPlugin(opts?: MyOptions): Plugin {
  return (viewer) => ({
    name: 'my-plugin',
    init?(): void          // run once on registration (DOM allowed — plugins aren't headless)
    destroy?(): void       // clean up listeners/subscriptions
    on?: EventHandlers     // { slide, item, zoom, overlayClick, ... } wired to the emitter
    keymap?: Record<string, (e: KeyboardEvent) => void>
    mediaAdapters?: MediaAdapter[]      // e.g. a <video> or YouTube adapter
    overlays?: OverlaySpec[]            // image-space / viewport overlays
    regions?: Partial<Record<RegionName, (ctx) => Node>>  // inject UI into named slots
  })
}
```

`RegionName` = `'toolbar' | 'footer' | 'thumbnails' | 'stage' | 'backdrop'` (extensible). `toolbar`
and `footer` are **additive** (many plugins contribute); the others are **exclusive** (last-wins +
dev warn).

## Patterns

- **A toolbar button** (region + keymap), e.g. `plugin-fullscreen`:
  ```ts
  return {
    name: 'fullscreen',
    keymap: { f: toggle },
    regions: { toolbar: () => { const b = document.createElement('button'); b.onclick = toggle; return b } },
  }
  ```
- **Live UI that tracks state** (e.g. the thumbnail rail): create your root in `init()`, subscribe
  with `viewer.subscribe(render)`, return the same root from the region renderer, and unsubscribe in
  `destroy()`. The region renderer is called once; you own updates.
- **A media type**: return a `mediaAdapters: [adapter]`. The adapter's `match(item)` selects it;
  `mount()` returns `MountedMedia` with `activate()`/`deactivate()` (called on slide enter/leave) and
  `destroy()`. See `plugin-video`.
- **An event**: surface one with `viewer.emit('overlayClick', …)`; consumers subscribe via the `on`
  option or `viewer.on(...)`.

## Rules

- **DOM is fine in plugins** — the headless invariant binds `@visora/core` only. Guard `window`/
  `document` for SSR (see `plugin-hash`).
- **Reuse core helpers**: `windowIndices` / `reconcileKeys` for windowed UI at scale (keep live DOM
  bounded — see `plugin-thumbnails`/`plugin-grid`).
- **Decorative images get `alt=""`**; interactive controls get an `aria-label` (axe is a CI gate).
- **Own your cleanup** in `destroy()` (listeners, observers, subscriptions). `viewer.use()` returns a
  disposer for per-instance lifecycles (the React adapter relies on this).
- **One package per plugin**, `sideEffects:false`, depend on `@visora/core` types only.
