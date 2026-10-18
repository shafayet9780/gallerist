# Authoring a Gallerist plugin

A plugin is a factory the user binds (e.g. `fullscreen()`) that returns `(viewer) => PluginInstance`.
Everything beyond the engine is a plugin; core ships with none enabled, so bundle size scales with
features used (spec §13). Plugins register on the **viewer** (`createViewer({ plugins })` or
`viewer.use()`); the renderer reads them at mount and reacts to plugin-set changes.

Plugins that need engine plumbing (emitting an event, the zoom/windowing math) import it from
`@gallerist/core/internal` (spec §8.4). It is shared by the official plugins but not covered by
semver before 1.0.

## Contract

```ts
import type { Plugin } from '@gallerist/core'

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
- **An event**: surface one with `getInternals(viewer).emit('fullscreenChange', …)` (from
  `@gallerist/core/internal`); consumers subscribe via the `on` option or `viewer.on(...)`.

## Rules

- **DOM is fine in plugins** — the headless invariant binds `@gallerist/core` only. Guard `window`/
  `document` for SSR (see `plugin-hash`).
- **Reuse core helpers**: `windowIndices` / `reconcileKeys` for windowed UI at scale (keep live DOM
  bounded — see `plugin-thumbnails`/`plugin-grid`).
- **Treat collection data (URLs, ids, captions, the URL hash) as untrusted** — it often comes from a
  host app's end users. Prefer `textContent` over `innerHTML` (the renderer is text-first). Before
  assigning an attacker-influenceable URL to `a.href`/`fetch`, allowlist the scheme
  (`http`/`https`/`blob`; reject `javascript:`/`data:`/`file:`); sanitize any value used as a
  filename or zip entry name (strip `/`, `\`, `..`, control chars) — see `plugin-download`. Anchor
  provider URL matching to the hostname, not a substring — see `plugin-video-youtube`. Inject a
  third-party `<script>`/iframe only from a hardcoded trusted origin and document the required CSP.
- **Decorative images get `alt=""`**; interactive controls get an `aria-label` (axe is a CI gate).
- **Own your cleanup** in `destroy()` (listeners, observers, subscriptions). `viewer.use()` returns a
  disposer for per-instance lifecycles (the React adapter relies on this).
- **One package per plugin**, `sideEffects:false`, depend on `@gallerist/core` types only.
