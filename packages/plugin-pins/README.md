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

The default card links only to `http:`, `https:`, `mailto:` and `tel:` URLs, and to relative ones
(judged as http, whatever the page's own scheme). Any other `href` (`javascript:`, `data:`, `file:`,
`blob:` …) shows the card without its link. A `renderCard` card is yours to check.

| Option | Default | |
|---|---|---|
| `presentation` | `'tag'` | how pins look and what the card holds |
| `pins(item, group)` | `item.meta.pins` | where pins come from |
| `visible` | `true` | start shown; the toolbar toggle and `p` flip it |
| `toggle` | `true` | add the show/hide button to the toolbar |
| `renderCard(pin, ctx)` | — | replace the card's contents; return `null` to keep the default card for that pin. Called when the card opens, and again when an open card is redrawn |
| `onCardRemove(pin, node)` | — | a node `renderCard` returned left its card: unmount what you rendered there (once per node; never for default cards) |
| `onOpenChange(pin \| null, ctx)` | — | a card opened (`pin`) or closed (`null`); `ctx.previous` is the pin whose card was open until then (the one that closed) |
| `onPlace(at, ctx)` | — | turn on placing: the "Add a comment" button (or `c`) arms one click on the image, reported as `{ x, y }` in 0..1 |
| `strings` | English | every label, for translation |

The returned plugin also has `refresh()` (re-read pins you changed in place), `setVisible(bool)` and
`open(id | null, { focus })`: `focus: true` moves focus into the card as it opens (once its pin is
painted, if it isn't yet, unless focus moved elsewhere meanwhile), or to the pin as it closes. An
`open(id)` before the plugin has joined a viewer waits and opens on the first paint; after `destroy()`
it does nothing. Until the card is drawn, a click elsewhere doesn't cancel it (the click that creates
or opens the viewer). An overlay viewer moves focus into itself as it opens, which counts as focus
having moved: an `open(id, { focus: true })` made before `viewer.open()` may open the card without
focusing it. To focus the card, call it once the viewer is open.

Use one `pins()` per viewer: the plugin keeps the open card, its listeners and its viewer in the
instance, so two live viewers sharing one would close each other's cards. Each gallery gets its own
`pins({...})`; the same instance can move to a new viewer once the old one is destroyed (a React remount). Escape closes an open card (or cancels placing)
without closing the viewer, wherever focus is; a field in a `renderCard` card keeps Escape for itself
by calling `event.preventDefault()` in its own `keydown` handler. A card opens beside its pin toward
the side of the stage with more room and stays inside the stage on both axes: level with its pin when
it fits, else slid along it (across too, over the pin, when the room beside it is narrow), never
under a band floated over the stage (immersive) or the docked item navigator, and never wider or
taller than the room. A taller card scrolls: it then joins the tab order, ↑ ↓ Home End Page Up/Down
scroll it rather than navigate, a wheel over it scrolls it, and its close button stays in view. A
wheel over something in a card that scrolls on the wheel's axis (the card, or a textarea or list of
yours in it) scrolls that; over anything else, or a pinch (ctrl+wheel) anywhere on a card, it zooms
the image as anywhere on the stage. A touch in a card never pans or zooms the page (a textarea or
select of yours pans vertically). The card lays out its contents in normal block flow, as your page
would (a fragment's inline siblings share a line, a button keeps its width); the close button comes
first in it, in reading and tab order too. A card is placed again
after a zoom or pan and as its contents resize, so a host may render into it late. While placing, a
pan or a click beside the image keeps the mode armed; a click outside the stage cancels it.

Focus never falls to `<body>` (where the next Escape would close the viewer): when a card closes or is
redrawn while focus is inside it, focus goes to its pin if that is still on the current item, else to
the "Add a comment" button, else to the viewer. Focus already on `<body>` is moved too in an open overlay
viewer, but not in an inline one, where it may have come from a control of your page. The same holds when a
repaint drops the pin that has focus (you removed it, say an empty draft in `onOpenChange` followed by
`refresh()`): focus moves on once the repaint is done. Focus the plugin moves shows the focus ring
when the input that led to it was a key (Escape, Enter on ×; not a shortcut with meta, ctrl or alt) or
a click without a pointer (assistive tech), and not after a pointer (`focusVisible: true` / `false`; a
browser without the option decides for itself).

```ts
const commentPins = pins({
  presentation: 'comment',
  onPlace: (at, { item }) => {
    item.meta.pins.push({ id: crypto.randomUUID(), ...at, label: 'You', body: '' })
    commentPins.refresh()
  },
})
```

`renderCard` can replace some cards and keep the rest, or build on the default: `defaultPinCard(pin,
{ presentation, strings })` returns the contents `pins()` draws (a `DocumentFragment`; text is set as
text). Pass the same `presentation` as the plugin (default `tag`).

```ts
import { defaultPinCard, pins } from '@gallerist/plugin-pins'

pins({
  presentation: 'comment',
  renderCard: (pin) => {
    if (!pin.meta?.startsWith('v2')) return null // the default card
    const card = document.createElement('div')
    card.append(defaultPinCard(pin, { presentation: 'comment' }), versionBadge(pin))
    return card
  },
})
```

### Host-rendered cards (React)

A card holds its contents only while it is open: `renderCard` runs as it opens, and again when an open
card is redrawn (`refresh()`, new data for its item), and the node it returned is handed back to
`onCardRemove` once it has left the card: the card closed (its pin, Escape, `open()`, another pin, a
click outside), moved to another item, its pin left the data, the redraw replaced it, or the plugin or
viewer was destroyed. Exactly once per node, so a portal or root can follow it. Return an element (a
`DocumentFragment` empties as it is inserted).

- Returning the same node again is supported (say, one cached per pin): a redraw that gets it back
  doesn't hand it to `onCardRemove`; it is handed back when it really leaves, once each time it does.
- If `renderCard` throws, that pin gets the default card and the error is reported (`reportError`, so
  `window.onerror`; else `console.error`) once the card has opened. The same goes for a callback that
  throws: the rest still run.
- `onCardRemove` and `onOpenChange` run after the change has settled, in order. Calling `open()` or
  `refresh()` from them is fine (its own events follow); from `renderCard` it isn't. So when one
  does, an earlier `onOpenChange` may describe a state that a later change has already replaced:
  the last one is current.
- A callback that calls `viewer.destroy()` doesn't stop the ones queued after it: they still run,
  with the destroyed viewer's `ctx`. Once the plugin has left its viewer, `open()` does nothing (no
  card the next viewer would open unprompted).

A portal keeps the card in your React tree (context, state, event handlers). Give each node its own
key (a counter, not `pin.id`: a redraw briefly has two nodes for the same pin):

```tsx
import type { Collection } from '@gallerist/core'
import { type Pin, pins } from '@gallerist/plugin-pins'
import { Gallerist } from '@gallerist/react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type Card = { key: number; pin: Pin; node: HTMLElement }
let nextKey = 0

function ReviewPins(props: { collection: Collection; onSave: (pin: Pin, text: string) => void }) {
  const { collection, onSave } = props
  const [cards, setCards] = useState<Card[]>([])
  const plugin = useMemo(
    () =>
      pins({
        presentation: 'comment',
        renderCard: (pin) => {
          const node = document.createElement('div')
          setCards((list) => [...list, { key: ++nextKey, pin, node }])
          return node
        },
        onCardRemove: (_pin, node) => setCards((list) => list.filter((c) => c.node !== node)),
      }),
    [],
  )
  return (
    <>
      <Gallerist collection={collection} plugins={[plugin]} preset="reviewer" skin="console" />
      {cards.map(({ key, pin, node }) =>
        createPortal(<CommentForm pin={pin} onSave={onSave} />, node, String(key)),
      )}
    </>
  )
}
```

After saving, update your data and call `plugin.refresh()` (or pass a new collection): the card is
redrawn from the new data, focus is on its pin, and Escape closes the card rather than the viewer.
With a root per card instead of a portal: `createRoot(node).render(…)` in `renderCard`, and
`root.unmount()` in `onCardRemove` (keep the roots in a `Map` by node).

Pins take their colours from the skin (`--gallerist-pin-*`, the accent, the panel surface), so they
match Gallery, Console and the light schemes. A live demo of all three presentations is in
[`examples/hotspots`](https://github.com/shafayet9780/gallerist/tree/main/examples/hotspots).

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
