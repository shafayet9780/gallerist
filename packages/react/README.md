# @gallerist/react

React adapter for Gallerist — <Gallerist> component, useGallerist() hook, JSX overlay/region portals.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/react
```

Needs React and React DOM 18 or later (it uses `useSyncExternalStore`, `useId` and
`useInsertionEffect`).

## Usage

```tsx
import { Gallerist } from '@gallerist/react'
import '@gallerist/theme-default/gallerist.css'

<Gallerist items={[{ id: 'a', type: 'image', source: 'a.jpg' }]} open={open} onClose={() => setOpen(false)} />
```

Props that update live: `items` / `groups` / `collection` (changed content is applied in place and
keeps the cursor on the same item; data rebuilt inline with the same content is ignored; an invalid
update, such as a duplicate id, is logged and the current data kept), `on`, `open`, `onClose`, `skin`,
`accent` and `scheme`. Everything else (`loop`, `startAt`, `plugins`, `overlays`, `preset`, `container`,
`label`, `returnFocus`, `preload`, `adapters`, …) is read once; change the component's `key` to apply
new values.

`plugins`, `on` and render props are functions, so `<Gallerist>` is used from a client component. The
build carries a `"use client"` banner, so a Next.js App Router page can import it from inside a client
boundary (a file that starts with `"use client"`); a Server Component can't pass it those props.

### Opening at a position

`open` takes `true`, `false`, or a position `{ g, i }` (group index, optional item index):

```tsx
const [at, setAt] = useState<{ g: number; i?: number } | false>(false)

<button onClick={() => setAt({ g: 3, i: 1 })}>Open the 4th group</button>
<Gallerist groups={groups} open={at} onClose={() => setAt(false)} />
```

A new position while the viewer is open moves the cursor. The position is applied when it changes,
not enforced: the user can navigate away from it, and an inline `open={{ g: 3 }}` re-rendered with the
same value doesn't pull them back.

### The imperative handle

The ref is the viewer itself (`ViewerApi` from `@gallerist/core`), for code that drives the viewer
without controlled props:

```tsx
import type { ViewerApi } from '@gallerist/core'

const viewer = useRef<ViewerApi>(null)

<Gallerist ref={viewer} groups={groups} />
<button onClick={() => viewer.current?.open({ g: 2, i: 0 })}>Open</button>
```

`open({ g, i })`, `close()`, `next()` / `prev()`, `nextItem()` / `prevItem()`, `goTo(g, i)`,
`goToId(groupId, itemId)`, `zoomTo(scale)`, `resetZoom()`, `getState()`, `subscribe(fn)` and
`on(event, fn)` are all there. Leave `open` undefined when the ref drives visibility, or the next
change of `open` wins.

### Captions

`<Gallerist.Caption>` renders the current item's caption with React, into the renderer's caption
region: the caption bar under the stage, the editorial placard, or wherever the preset puts it. Item
data keeps its plain-text `caption`; the design lives here, once per viewer.

```tsx
interface Shot {
  app: string
  capturedAt: string
}

<Gallerist groups={groups} open={open} onClose={close}>
  <Gallerist.Caption>
    {({ item, group, cursor }) => {
      const shot = item.meta as Shot
      return (
        <div className="shot-caption">
          <strong>{shot.app}</strong> <time>{shot.capturedAt}</time>
          <span>
            {cursor.i + 1} of {group.items.length}
          </span>
        </div>
      )
    }}
  </Gallerist.Caption>
</Gallerist>
```

Returning `null` shows the item's text `caption` (or nothing). The band grows with what you render
(the stage gives up the room), from the height of a two-line text caption. Its text is the viewer's
accessible description (`aria-describedby`); the announcement on navigation stays the position plus
the item's `alt`, so put what a screen reader user needs in `alt`. Without React, use
[`@gallerist/plugin-captions`](../plugin-captions/README.md).

### Hooks

- `useCurrentItem()` returns `{ item, group, cursor }` for the enclosing `<Gallerist>` (or pass it a
  viewer). It re-renders on navigation and collection changes, not on zoom or pan.
- `useGallerist(viewer)` returns the whole state (`useSyncExternalStore`) and stable action functions.

```tsx
function Details() {
  const { item } = useCurrentItem()
  return <p>{item?.alt}</p>
}
```

### Portals

`<Gallerist.Region name="toolbar">` renders JSX into a named region (`toolbar`, `aside`, `footer`,
`caption`, …); `<Gallerist.Overlay anchor={…}>` renders JSX as an overlay on the image or the viewport.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
