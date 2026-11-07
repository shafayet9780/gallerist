# @gallerist/renderer-dom

Default DOM renderer for Gallerist — the only ring that touches the DOM.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/renderer-dom
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({ items: [{ id: 'a', type: 'image', source: 'a.jpg' }] })
mount(viewer) // overlay/lightbox mode; pass { container } for inline
viewer.open()
```

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## Loading: `placeholder`

An item's `placeholder` shows the moment the item does, in the box the image will paint in (its
`naturalSize` gives the box; without one, the placeholder image's own shape, or
`--gallerist-media-ratio`). Pass the thumbnail URL the rail or the page has already loaded: it is
in the browser's cache, so it paints in the same frame as the step, with no flash of an empty stage.

```ts
{ id: 'a', type: 'image', source: 'a-2400.jpg', thumb: 'a-320.jpg', placeholder: 'a-320.jpg',
  naturalSize: { w: 2400, h: 1350 } }
```

- **An image URL** (or a data URI) is drawn blurred (`--gallerist-placeholder-blur`, 6px), clipped
  to the image's box; the image fades in over it (`--gallerist-dur-reveal`, 150ms) as the blur
  clears. A load still running after `--gallerist-loading-delay` (400ms) shows a pill in the box's
  bottom end corner: "Loading full size…" (`strings.loadingFull`), a polite `role="status"` line
  that says nothing on a fast load. A failed load keeps the placeholder, sharp, and the pill says
  "Couldn't load full size" (`strings.loadFailed`) with a Retry button (`strings.retry`) that loads
  the item afresh (focus on it goes to the viewer).
- **A colour** (`#2a3340`, `rgb(…)`) fills the box. A failure shows the error card.
- **None:** a skeleton fills the box after 300ms, with a shimmer (`--gallerist-placeholder`,
  `--gallerist-shimmer`). A failure shows the error card.

With reduced motion the placeholder isn't blurred, the skeleton and the spinner hold still, and the
image still fades in. Zoom acts on the content layer, so a wheel, pinch or double tap before the
image is in zooms the placeholder with it (and re-fits once the image's size is known);
`@gallerist/plugin-zoom`'s − + wait for the image.

## Keys and host UI inside the viewer

The viewer's keys (arrows, Home/End, digits, `+`/`-`/`0`, `t`, plugin keys) do nothing in a text
field inside the viewer (`input`, `textarea`, `select`, contenteditable), and nothing with a key a
handler before the viewer's already took with `preventDefault()`. So a host popover closes on Escape
before the viewer does: handle Escape on the popover (or its field) and call `preventDefault()`; an
Escape nobody took still closes the viewer, from a field too. A plugin key that moves focus into a
field (a "notes" key opening a note box) should `preventDefault()` too, or the field gets the
character.

A plugin's `keymap` is asked before the viewer's own keys (0.5), so a plugin can rebind one for a
layout: a handler that takes the key calls `preventDefault()`, and the viewer then does nothing with
it; one that doesn't leaves the viewer's own key, if it has one, to run after. plugin-thumbnails'
`clusterKeys` takes ↑/↓ this way on a flat rail. A plugin is not asked for a key typed with Ctrl, ⌘ or
Alt (AltGr is fine: `?` on some layouts), a key taken already, or one from a text field (Escape there
is the viewer's alone); nor for an arrow key from a widget in the viewer that has arrow keys of its
own: inside a dialog, a menu or a slider (`role="dialog"`, `"menu"`, `"slider"`; the overlay's root
doesn't count), or on a menu button (`aria-haspopup`). A focused caption band that scrolls keeps
↑/↓/Home/End for scrolling before anyone is asked. So a host no longer needs a capture-phase listener
to take an arrow key.

## Markup init

`bind()` opens a viewer from `<a href="big.jpg" data-gallerist="trip">` links, with no collection to
write. Attributes are listed in [`@gallerist/cdn`](../cdn/README.md), which puts it on a global for
pages with no build step.

## License

MIT © Shafayet Ahmmed
