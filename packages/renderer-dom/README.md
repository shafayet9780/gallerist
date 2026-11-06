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

## Keys and host UI inside the viewer

The viewer's keys (arrows, Home/End, digits, `+`/`-`/`0`, `t`, plugin keys) do nothing in a text
field inside the viewer (`input`, `textarea`, `select`, contenteditable), and nothing with a key a
handler before the viewer's already took with `preventDefault()`. So a host popover closes on Escape
before the viewer does: handle Escape on the popover (or its field) and call `preventDefault()`; an
Escape nobody took still closes the viewer, from a field too. A plugin key that moves focus into a
field (a "notes" key opening a note box) should `preventDefault()` too, or the field gets the
character.

## Markup init

`bind()` opens a viewer from `<a href="big.jpg" data-gallerist="trip">` links, with no collection to
write. Attributes are listed in [`@gallerist/cdn`](../cdn/README.md), which puts it on a global for
pages with no build step.

## License

MIT © Shafayet Ahmmed
