# @gallerist/theme-default

Default Gallerist theme — pure CSS, no JS dependency. Driven by --gallerist-* custom properties.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/theme-default
```

## Usage

```ts
import '@gallerist/theme-default/gallerist.css' // base + the Gallery skin (the default look)
import '@gallerist/theme-default/console.css'   // optional: the Console skin, layered on top
```

Pick a skin, accent and colour scheme with the renderer's `skin`, `accent` and `scheme` options:

| Skin | Accents (first is the default) |
|------|---------|
| `gallery` (default) | `periwinkle`, `mint`, `amber`, `vermilion` |
| `console` | `amber`, `cyan`, `vermilion` |

`scheme` is `dark` (default), `light` or `auto`. All visuals are driven by `--gallerist-*` CSS
custom properties; override them to restyle the viewer. `base.css` is the shared structure on its
own, for building a skin from scratch.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
