# Migrating to 0.3

0.3 is the first version on npm. These notes are for anyone already using the code from git, such as the
`v0.2.0` tag or the earlier `@visora/*` name. New to Gallerist? You can skip this.

## The default look changed

**Gallery** is now the default skin: quiet near-black surfaces and round controls. The old graphite and
amber look is the **Console** skin, unchanged. To keep it:

```ts
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'

mount(viewer, { skin: 'console' })
// or <Gallerist skin="console" />
```

## `theme` became `skin`, `accent` and `scheme`

| Before | Now |
|---|---|
| React `theme="cyan"` | `accent="cyan"` (add `skin="console"` for that accent) |
| `data-gallerist-theme` | `data-gallerist-accent`, `data-gallerist-skin`, `data-gallerist-scheme` |

Accents are named per skin: `gallery` has `periwinkle`, `mint`, `amber`, `vermilion`; `console` has
`amber`, `cyan`, `vermilion`; `editorial` has `vermilion`, `cobalt`. `applyAppearance(root, …)` changes
them on a mounted viewer.

Without a `scheme` option, the root no longer has `data-gallerist-scheme="dark"`; each skin applies its
own default. CSS that selected that attribute needs `:not([data-gallerist-scheme])` as well.

## Layout

- Chrome now takes space instead of floating over the image. CSS that positioned `.gallerist-*` chrome
  absolutely, or reserved room for it, should be removed.
- The `top` rail is gone; `rail` is `bottom`, `left`, `right` or `hidden`. The `contact` preset moved to
  `right`.

## Theme overrides

Tokens now sit in cascade layers, so your `--gallerist-*` overrides on `.gallerist` win in every skin,
scheme and accent. Remove any `!important` or extra specificity you added to make them stick.

`plugin-grid` and `plugin-pins` styles are separate files. `gallerist.css` includes them; if you build on
`base.css` alone, import `grid.css` and `pins.css` too.

## Core

- `viewer.emit`, `getPlugins` and `onPluginsChanged` moved: use `getInternals(viewer)` from
  `@gallerist/core/internal`. The engine's building blocks (normalize, store, FSM…) moved there too.
- `zoomTo(scale, focal?)`: `focal` is now a stage point that stays fixed, as documented. It used to be
  treated as the pan offset. To set a whole transform, use `getInternals(viewer).setZoom({ scale, x, y })`.
- `createViewer` and `setCollection` throw on a duplicate group id or item id.

## Renamed package scope

`@visora/*` is `@gallerist/*`, `--visora-*` tokens are `--gallerist-*`, `data-visora-*` attributes are
`data-gallerist-*`, and the React API is `<Gallerist>` and `useGallerist()`.
