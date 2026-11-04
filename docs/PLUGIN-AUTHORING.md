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
    overlays?: OverlaySpec[] | ((slide: { group, item }) => OverlaySpec[])
                                        // image-space / viewport overlays; the function form gives
                                        // each slide its own (e.g. pins read from the item)
    regions?: Partial<Record<RegionName, (ctx) => Node>>  // inject UI into named slots
  })
}
```

`RegionName` = `'toolbar' | 'aside' | 'footer' | 'caption' | 'thumbnails' | 'stage' | 'backdrop'`
(extensible). `toolbar`, `aside` and `footer` are **additive** (many plugins contribute); the others are
**exclusive** (last-wins + dev warn). A `caption` node replaces the caption bar's text and keeps the
bar up for every item (`plugin-captions` is the reference).

A region renderer gets `ctx = { viewer, preset? }`. `preset` is the renderer's mounted layout preset as
`PresetDefaults`, a map keyed by what each entry configures (the DOM renderer passes `resolvePreset()`'s
result; it's undefined without a preset). A plugin reads its own key as defaults under the options it
was given: `plugin-thumbnails` takes `preset.thumbnails` and settles its layout when its region mounts.
Treat it as untyped, read-only data: the built-in presets are frozen, and a value your plugin doesn't
know should fall back to its default. Each mount passes its own `ctx` to all of its regions, and a
region renderer runs once per mount: when a viewer is mounted again (after the first mount was
destroyed) the renderer calls it with a new `ctx`, perhaps with another preset, so a plugin that builds
its UI from `ctx.preset` builds it again for that mount (see `plugin-thumbnails`).

## Patterns

- **A toolbar button** (region + keymap), e.g. `plugin-fullscreen`:
  ```ts
  return {
    name: 'fullscreen',
    keymap: { f: toggle },
    regions: { toolbar: () => { const b = document.createElement('button'); b.onclick = toggle; return b } },
  }
  ```
- **Live UI that tracks state** (e.g. the thumbnail rail): create your root in `init()` (or in the
  region renderer, when it depends on `ctx.preset`), subscribe with `viewer.subscribe(render)`, return
  the same root from the region renderer, and unsubscribe in `destroy()`. The region renderer is
  called once; you own updates.
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
  (`http`/`https`/`blob`; reject `javascript:`/`data:`/`file:`) with `safeUrl(url, schemes)` from
`@gallerist/core/internal`, which judges relative URLs against a fixed http base (the page's own URL
may be `file:` or `about:srcdoc`); sanitize any value used as a
  filename or zip entry name (strip `/`, `\`, `..`, control chars) — see `plugin-save`. Anchor
  provider URL matching to the hostname, not a substring — see `plugin-video-youtube`. Inject a
  third-party `<script>`/iframe only from a hardcoded trusted origin and document the required CSP.
- **Decorative images get `alt=""`**; interactive controls get an `aria-label` (axe is a CI gate).
- **Own your cleanup** in `destroy()` (listeners, observers, subscriptions). `viewer.use()` returns a
  disposer for per-instance lifecycles (the React adapter relies on this).
- **One package per plugin**, `sideEffects:false`, depend on `@gallerist/core` types only.
