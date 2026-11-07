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
Close's `--gallerist-close-icon`, the tool glyph unless set). With a fine pointer (a mouse or trackpad)
the Console skin's bar is compact: 36px tools, 18px glyphs, Close's 2px larger (Console sets
`--gallerist-close-icon` to `--gallerist-tool-icon` + 2px, so it follows a page's glyph size; set it
too to size Close apart), and plugin-zoom's "− 100% +" one bordered group 30px tall
(`--gallerist-zoom-group: 1`; 0, the default, keeps three loose tools; a unitless 0 or 1, nothing
else). A touch keeps 44px targets; Gallery and Editorial keep 44px tools. `--gallerist-close-rule` is
the room before Close (a length: Console 9px; 0px, the default, none), not the line: the 1 × 20 hairline in it is
drawn as a border, so forced colours keep it.

The rail (`.gallerist-thumbs`) has a `scroll-padding` of `--gallerist-rail-fade` (40px) at its ends,
inline on a sideways rail and block on a side rail: plugin-thumbnails reads it to keep the current
card clear of the end fades and the ‹ › buttons in them, and a card focused with Tab lands clear too.
On a phone (600px wide or less with a coarse pointer, where the ‹ › buttons never show) the fade is
16px (0.5), so the current card kept clear of it leaves room for the next card whole beside it. A
page's own `--gallerist-rail-fade` wins (the theme's tokens are in a cascade layer).

Loading (0.5): an item's `placeholder` image is blurred `--gallerist-placeholder-blur` (6px) and
clipped to the image's box; the image fades in over it in `--gallerist-dur-reveal` (150ms). A box
with no size to go by takes `--gallerist-media-ratio` (`3 / 2`). A load still running after
`--gallerist-loading-delay` (400ms) shows a "Loading full size" pill (the panel, hairline and muted
text tokens; no warning colours). With no placeholder the box is a skeleton after 300ms:
`--gallerist-placeholder` with a `--gallerist-shimmer` sweep. See the renderer's README.

The rail's current label (a flat rail's group label, a timeline's time label) is
`--gallerist-label-current` (the accent) at `--gallerist-label-current-weight` (500). A focused thumb's
ring is 2px `--gallerist-focus` in `--gallerist-thumb-focus-style` (`solid`; `dashed` tells it apart
from a solid selection ring), 2px out, or `--gallerist-thumb-focus-offset-current` (2px) out on the
current thumb, whose ring (`--gallerist-thumb-ring`, `--gallerist-item-ring`) may sit outside it.

The theme follows `forced-colors: active` (Windows High Contrast): the View popover's chosen segment
takes the system's selection colours and the focus rings the text colour. The rail's
item clusters (`thumbnails({ cluster })`) use `--gallerist-cluster-inner` (2px) inside a cluster and
`--gallerist-cluster-gap` (8px) between two. An item thumb's badge (`thumbnails({ renderItemBadge })`)
sits `--gallerist-thumb-badge-inset-block` from its image's top and bottom, as `inset-block` takes
them: `3px auto`, the top end corner; `auto 3px` puts it in the bottom end corner, still on the image
(a caption band under it stays clear).

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
