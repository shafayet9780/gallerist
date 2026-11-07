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
bar up for every item (`plugin-captions` is the reference). A `thumbnails` node that carries (or holds
an element with) `data-gallerist-linear` asks the DOM renderer for linear traversal: unless `mount()`
got an explicit `linear`, ←/→ then walk every item in order across groups. The renderer reads it each
time the plugin set changes, so it follows the rail being added or removed; `plugin-thumbnails` marks
its region this way in `flat` mode. A plugin that changes the marker on a region already mounted (the
rail switching its display at run time) calls `viewer.refresh()` after, and the renderer reads it
again, with the counter, the item navigator and the arrows' names. The plugins' keymaps are read at
the same times, so a `keymap` getter can drop a key a layout doesn't use and leave it to an earlier
plugin (a flat rail leaves `e`), or add one it does (a flat rail with `clusterKeys` takes ↑/↓). The
DOM renderer asks the keymaps before its own keys (arrows, Home/End, `+`/`-`/`0`, `t`, 1–9, Escape):
a handler that takes a key calls `preventDefault()`, and the renderer then does nothing with it;
otherwise the renderer's own key runs after. Not asked: a chord (Ctrl, ⌘, Alt; AltGr is fine), a key
a handler before took already, a key from a text field (shadow roots included; Escape there is the
renderer's alone), an arrow from inside a dialog, menu or slider in the viewer or from a menu button
(`aria-haspopup`), and ↑/↓/Home/End on a focused caption band that scrolls. Without built-in controls (`controls: false`) the bar shows while the
toolbar holds a tool, but for tools marked `data-gallerist-off`: a tool its plugin keeps hidden for a
later layout (a flat rail's items toggle, a View menu with nothing to offer) carries that marker
beside `hidden`, and the plugin calls `viewer.refresh()` when it changes. A tool that only toggles
`hidden` itself still shows the bar, as before.

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
- **A setting other code can change at run time**: put it on the instance your factory returns, and
  let the region nodes you hand the renderer stay (they are cached per mount); redraw what's inside
  them. `plugin-thumbnails`' instance carries `display` and `setDisplay(display)`, and exports
  `getGroupDisplay(viewer)` / `setGroupDisplay(viewer, display)` that look it up. Code that shouldn't
  import the plugin finds it the same way, among `getInternals(viewer).getPlugins()` by its name and
  that method: `plugin-view` and React's `groupDisplay` prop do.
- **A popover from the toolbar** (`plugin-view`): a button (`aria-haspopup="dialog"`,
  `aria-expanded`) whose popover (a non-modal `role="dialog"`, radio groups inside) is appended to the viewer root (`button.closest('.gallerist')`, which is
  positioned), not to the toolbar region, which scrolls sideways on a narrow screen and would clip it.
  Stop the keys it handles (`stopPropagation`, `preventDefault`) so the viewer's keymap doesn't
  navigate, zoom or close under it, close it on a press outside (check `event.composedPath()`, so a
  viewer in a shadow root works) and when the viewer closes, and return focus to the button. The
  renderer can be destroyed under an open menu without telling plugins: close it from the next
  document or window event that finds the button disconnected (`!button.isConnected`).
- **Following a gesture's zoom** (`plugin-zoom`): `viewer.getState().zoom` is the committed zoom;
  a pinch, a wheel or a double click shows its transform on the current slide's content
  (`.gallerist-content[data-gallerist-current]`, `transform: translate(…) scale(s)`) before it
  commits. Watch `style` on the viewer root's subtree with a `MutationObserver` to read it live, and
  ignore a scale below 1 (a drag to dismiss shrinks the content too). To take a key from the
  renderer's own keymap (`+`, `-`, `0` are built in), give it a keymap entry that calls
  `preventDefault()` (0.5); plugin-zoom still listens on the root in the capture phase and
  `stopImmediatePropagation()`s, so its keys reach no keymap while its `keys` are on.
- **A modal layer over the viewer** (`plugin-shortcuts`): put it in the viewer's root (found from a
  hidden node in a region, marked `data-gallerist-off` so a bar shows not for it alone), set `inert`
  on the root's other children while it shows (and only on those not inert already), and take keys in
  a `window` capture-phase listener while it's open: it runs before the root's own listeners (the
  renderer's keymap, plugin-zoom's capture listener), so `stopPropagation()` there keeps every key
  from the viewer. Restore focus to the element focused before it opened.
- **A setting the host may own** (`plugin-view`): read `viewer[Symbol.for('gallerist.controlled')]`
  (`true` or a list of setting names) each time before applying a value of your own. A host or an
  adapter sets it for the settings it applies itself; React's `<Gallerist>` lists `scheme` and
  `rail` while its `scheme` and `groupDisplay` props are passed. Report a choice for such a setting,
  don't apply it.

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
