# @gallerist/plugin-zoom

Gallerist plugin — a **zoom tool** in the toolbar: **− 100% +**. Zoom out, the current zoom (press
it to fit the image again), zoom in; the `+`, `-` and `0` keys do the same.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-zoom
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { zoom } from '@gallerist/plugin-zoom'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({ groups, plugins: [zoom()] })
mount(viewer, { preset: 'reviewer' })
```

One tool joins the toolbar, a group named "Zoom" of three buttons:

- **−** zooms out to the previous stop, **+** in to the next. The stops are fit (100%), 150%, 200%,
  300% and 400% by default: 100% is the image fitted to the stage, and 400% the DOM renderer's
  largest zoom. Every step pivots on the centre of the stage, and the view stays inside the image.
- **the percentage** shows the current zoom, and fits the image again when pressed (Enter or Space
  from the keyboard). It follows every zoom as it happens: a pinch, a wheel or a double click shows
  its percentage while it moves, not only once it settles, and a new item shows its own.

While the viewer has focus, **`+`** (or **`=`**) and **`-`** step through the same stops, and **`0`**
fits the image. They do nothing while the focus is in a text field inside the viewer (a pin's note,
say), and nothing with Ctrl, ⌘ or Alt held (the browser's own page zoom). Without this plugin the
renderer zooms by a fixed factor on those keys; with it, the keys and the buttons take the same
steps (`keys: false` leaves the keys to the renderer).

**−** and **+** are unavailable at either end of the range, and while the current item can't zoom: a
video or another non-image, an image still loading, one that failed to load. The percentage is
unavailable at fit, where there's nothing to reset. Unavailable buttons are `aria-disabled` and dimmed
(the percentage keeps its colour), and stay focusable, so the focus never drops out of the toolbar when
a press reaches the end of the range.

The renderer's own zoom-reset button (shown in the bar while the image is zoomed) is left out while
this tool shows in the bar: the percentage does the same. A tool given `hidden`, or left out on a
phone, leaves the reset where it was; without the plugin it works as before. A zoom from the tool or
its keys is announced in the viewer's live region (`150%`); a pinch or a wheel only shows it.

## Options

| Option | Default | |
|---|---|---|
| `stops` | `[1, 1.5, 2, 3, 4]` | the zoom levels − and + step through, as scales (1 = fit); the first and last are the ends of the range. The DOM renderer zooms from fit to 400%: a stop outside that range is brought into it |
| `zoomable(item)` | `item.type === 'image'` | whether an item can zoom once it has loaded (a custom adapter's media that zooms) |
| `keys` | `true` | `+` / `=`, `-` and `0` step through the stops; `false` leaves them to the renderer |
| `strings` | English | the labels, for translation; defaults in `DEFAULT_ZOOM_STRINGS`: `zoom` (the group), `zoomIn`, `zoomOut`, `reset(percent)` (the percentage button's name, which includes the percentage it shows), `percent(scale)` (how a zoom reads, `125%`) |

`nextStop(stops, scale, dir)` (the stop a step lands on) and `DEFAULT_STOPS` are exported too.

## Look

The buttons are bar tools like the others, so they take each skin's tool style, in both schemes.
Right to left the group mirrors with the bar (− stays at the inline start, now on the right). The
percentage uses tabular figures and keeps one width, so the bar doesn't shift as it changes. On a phone (600px wide or less) the bar
leaves the tool out (a pinch zooms there, and a double tap fits); a page that keeps it
(`.gallerist { --gallerist-phone-zoom: flex }`) gets − and + without the percentage, and the
toolbar's strip scrolls if the tools still don't fit. A tool given `hidden` stays hidden. The styles ship in `@gallerist/theme-default` (`base.css`).

## How it reads the zoom

The committed zoom comes from the viewer's state (`viewer.subscribe`). A gesture's zoom isn't
committed until it ends, so while one moves the plugin reads the transform the renderer gives the
current slide (`.gallerist-content[data-gallerist-current]`), through a `MutationObserver` on the
viewer's root that only looks at `style` changes. The keys are a capture-phase `keydown` listener on
the viewer's root; it stops the keys it takes (`+`, `=`, `-`, `0`) from reaching the renderer and
anything above the viewer. It leaves them alone where they are someone else's: typed in a field
(`input`, `textarea`, `select`, contenteditable, one in an open shadow root included), inside a
dialog or menu in the viewer (the View popover, a host's popover), inside a `slider`, `spinbutton`,
`tree` or `grid`, or with Ctrl, ⌘ or Alt. While the current item can't zoom they do nothing (as the
tool shows) and go on to the page, marked taken (`preventDefault()`), so the renderer doesn't zoom it
either.

## Not in the CDN bundle

`@gallerist/cdn` (the one-`<script>` build) doesn't include this plugin: it would take that bundle
past its size budget. Install it from npm alongside the packages above.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
