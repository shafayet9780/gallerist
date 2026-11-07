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
import '@gallerist/theme-default/editorial.css' // optional: the Editorial skin, layered on top
```

Pick a skin, accent and colour scheme with the renderer's `skin`, `accent` and `scheme` options:

| Skin | Accents (first is the default) |
|------|---------|
| `gallery` (default) | `periwinkle`, `mint`, `amber`, `vermilion` |
| `console` | `amber`, `cyan`, `vermilion` |
| `editorial` | `vermilion`, `cobalt` |

`scheme` is `dark`, `light` or `auto`; unset, each skin uses its own default (Gallery and Console
dark, Editorial light). All visuals are driven by `--gallerist-*` CSS custom properties; override
them to restyle the viewer. `gallerist.css` bundles the shared structure (`base.css`), the Gallery
skin (`gallery.css`) and the plugin add-ons (`grid.css` for plugin-grid, `pins.css` for
plugin-pins). To build a skin from scratch, import `base.css` plus the add-ons for the plugins you
use, then your own tokens.

On a phone (600px wide or less) the bar leaves out the zoom tool (`@gallerist/plugin-zoom`): a
pinch or a double tap zooms, and the renderer's reset button shows while zoomed. An overlay viewer's
bar leaves out fullscreen (`@gallerist/plugin-fullscreen`) too, as the overlay already fills the
screen; an inline viewer keeps it. Keep them with `--gallerist-phone-zoom: flex` and
`--gallerist-phone-fullscreen: grid` on `.gallerist` (each tool's own display; there the zoom tool
shows − and + only). A bar whose only tools are these two (and `controls: false`) still shows on a
phone, empty: leave the plugins out there, or keep the tools with the tokens.

The bar's tools are `--gallerist-tool-size` (44px) with `--gallerist-tool-icon` glyphs (22px;
Close's `--gallerist-close-icon`). With a fine pointer (a mouse or trackpad) the Console skin's bar is
compact: 36px tools, 18px glyphs (Close 20px), and plugin-zoom's "− 100% +" one bordered group 30px
tall (`--gallerist-zoom-group: 1`; 0, the default, keeps three loose tools). A touch keeps 44px
targets; Gallery and Editorial keep 44px tools. `--gallerist-close-rule` makes room before Close with a
1 × 20 hairline in it (Console 9px; 0, the default, none).

The theme follows `forced-colors: active` (Windows High Contrast): the View popover's chosen segment
takes the system's selection colours and the focus rings the text colour. The rail's
item clusters (`thumbnails({ cluster })`) use `--gallerist-cluster-inner` (2px) inside a cluster and
`--gallerist-cluster-gap` (8px) between two.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
