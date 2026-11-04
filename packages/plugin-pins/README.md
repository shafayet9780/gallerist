# @gallerist/plugin-pins

Gallerist plugin — pins anchored to the image: comment threads, product tags or feature notes.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-pins
```

## Usage

A pin is a point on an item, as a fraction of the image (`space: 'normalized'`, the default) or
in image pixels (`space: 'natural'`). It follows pan and zoom at a constant screen size, and
clicking it opens a card beside it. By default pins are read from `item.meta.pins`:

```ts
import { createViewer } from '@gallerist/core'
import { pins } from '@gallerist/plugin-pins'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css' // includes the pin styles

const viewer = createViewer({
  items: [
    {
      id: 'living-room',
      type: 'image',
      source: 'room.jpg',
      meta: {
        pins: [{ id: 'sofa', x: 0.5, y: 0.47, label: 'Marlow sofa', meta: '$2,490', href: '/sofa' }],
      },
    },
  ],
  plugins: [pins({ presentation: 'tag' })],
})
mount(viewer)
```

| Presentation | Marker | Card |
|---|---|---|
| `tag` (default) | a frosted ring | `label`, `meta` (price), `body`, a link (`href`, `linkLabel`) |
| `comment` | a numbered disc in the accent; muted when `resolved` | `label` (author), `meta` (time), `body`, `replies`, a resolved badge |
| `feature` | a numbered disc | `label`, `meta`, `body`, an optional link |

| Option | Default | |
|---|---|---|
| `presentation` | `'tag'` | how pins look and what the card holds |
| `pins(item, group)` | `item.meta.pins` | where pins come from |
| `visible` | `true` | start shown; the toolbar toggle and `p` flip it |
| `toggle` | `true` | add the show/hide button to the toolbar |
| `renderCard(pin, ctx)` | — | replace the card's contents |
| `onOpenChange(pin \| null, ctx)` | — | a card opened or closed |
| `onPlace(at, ctx)` | — | turn on placing: the "Add a comment" button (or `c`) arms one click on the image, reported as `{ x, y }` in 0..1 |
| `strings` | English | every label, for translation |

The returned plugin also has `refresh()` (re-read pins you changed in place), `setVisible(bool)` and
`open(id | null)`. Escape closes an open card (or cancels placing) without closing the viewer,
wherever focus is. A card opens toward the side of the stage with more room. While placing, a pan
or a click beside the image keeps the mode armed; a click outside the stage cancels it.

```ts
const commentPins = pins({
  presentation: 'comment',
  onPlace: (at, { item }) => {
    item.meta.pins.push({ id: crypto.randomUUID(), ...at, label: 'You', body: '' })
    commentPins.refresh()
  },
})
```

Pins take their colours from the skin (`--gallerist-pin-*`, the accent, the panel surface), so they
match Gallery, Console and the light schemes. A live demo of all three presentations is in
[`examples/hotspots`](https://github.com/shafayet9780/gallerist/tree/main/examples/hotspots).

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
