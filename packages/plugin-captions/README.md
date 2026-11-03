# @gallerist/plugin-captions

Gallerist plugin — designed captions: render the caption bar for the current item with your own markup.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-captions
```

## Usage

An item's `caption` is plain text, so item data stays JSON. When a caption needs a design (a title
line, a timestamp, a badge, a link), give the viewer one render function. It runs for the current
item whenever the item or the collection changes, and its node replaces the text in the caption bar.
Presets keep placing that bar: under the stage, in the editorial placard, or floating in `immersive`.

```ts
import { createViewer } from '@gallerist/core'
import { captions } from '@gallerist/plugin-captions'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

interface Shot {
  app: string
  capturedAt: string
}

const viewer = createViewer({
  groups,
  plugins: [
    captions<unknown, Shot>({
      render: (item, group, { cursor }) => {
        if (!item.meta) return null // the item's text caption
        const el = document.createElement('div')
        el.className = 'shot-caption'
        const app = document.createElement('strong')
        app.textContent = item.meta.app
        const time = document.createElement('time')
        time.textContent = item.meta.capturedAt
        el.append(app, ' ', time, ` · ${cursor.i + 1} of ${group.items.length}`)
        return el
      },
    }),
  ],
})
mount(viewer)
```

`render(item, group, ctx)` returns:

| Return | Shows |
|---|---|
| a `Node` | the node, as is |
| a `string` | the string as text (never parsed as HTML) |
| `null` or `undefined` | the item's text `caption`, or nothing |

`ctx` is `{ viewer, cursor }`. The plugin also has `refresh()`, which renders the current caption again
after you changed data that `render` reads in place. Zoom and pan don't call `render`.

While the plugin is mounted the caption bar is up for every item, so moving between items with and
without a caption doesn't move the stage. The bar grows with your node (from the height of a two-line
text caption, up to 40% of the viewport or until the stage is down to 36% of the viewer, then it
scrolls) and the stage gives up the room; in a placard it keeps the placard's slot and scrolls
inside it. Style your node with your own classes; the theme's caption tokens
(`--gallerist-caption-size`, `--gallerist-fg`, …) are inherited.

## Accessibility

- The caption is the viewer's accessible description (`aria-describedby` on the dialog), so a screen
  reader reads its text: for a node, the node's text content as the browser computes it.
- The announcement on navigation is the position plus the item's `alt`, never the rendered caption
  (it may hold buttons or links, and changes markup at will). Put what a screen reader user needs to
  know about the item in `alt`.
- Controls inside your node are reachable with Tab like any other viewer control.

## React

In React, use `<Gallerist.Caption>` from `@gallerist/react`; it renders JSX into the same region.

```tsx
<Gallerist groups={groups} open={open} onClose={close}>
  <Gallerist.Caption>
    {({ item }) => (item.meta ? <ShotCaption shot={item.meta as Shot} /> : null)}
  </Gallerist.Caption>
</Gallerist>
```

The plugin works in React too (pass it in `plugins`), when `render` builds DOM nodes rather than JSX.

## Cleanup

Removing the plugin (the disposer from `viewer.use()`, `viewer.destroy()`, or unmounting
`<Gallerist>`) stops rendering, empties the region, and brings the text caption back.

See [Plugin authoring](https://github.com/shafayet9780/gallerist/blob/main/docs/PLUGIN-AUTHORING.md).

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
