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
`accent`, `scheme` and `groupDisplay`. `skin`, `accent` and `scheme` are each written to the viewer
only when they change, so a value set another way (a View menu) stays while that prop doesn't. Everything else (`loop`, `startAt`, `plugins`, `overlays`, `preset`, `container`,
`label`, `returnFocus`, `preload`, `adapters`, …) is read once; change the component's `key` to apply
new values.

`preset` sets the layout, the thumbnails rail included: `thumbnails()` in `plugins` takes the preset's
rail options for any option you don't pass (`preset="reviewer"` gives the timeline and numbered items;
`thumbnails({ timeline: false })` keeps the numbers and drops the timeline).

`linear` follows the rail when you leave it out: with `thumbnails({ groupDisplay: 'flat' })` ←/→ walk
every item in order across groups (the counter reads `item N / total`); with another rail, or none,
they move between groups. `linear={false}` keeps the group and item axes under a flat rail, and
`linear` turns linear traversal on whatever the rail.

`groupDisplay` (`'stacked'`, `'flat'` or `'index'`) is the thumbnails rail's display, and it is
reactive: a new value switches the mounted rail in place (no remount), keeping the current item, and
`linear` follows it as above. The first value is the display the rail mounts with. Leave it out and
the rail keeps its own (`thumbnails({ groupDisplay })`, the preset's, a View menu's choice).

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
same value doesn't pull them back. `open` is compared by value (`g` and `i`), so setting the same
`{ g, i }` again does nothing; to jump back to it, call `ref.current.open({ g, i })`. Going from a
position to `true` keeps the viewer where it is.

### Escape

The viewer listens for Escape on its own root and closes, unless a handler that ran first called
`event.preventDefault()`. A dialog or popover you open over the viewer should handle Escape itself:
if it is rendered inside the viewer (`<Gallerist.Overlay>`, `<Gallerist.Region>`), call
`preventDefault()` on the Escape that closes it, or the viewer closes too. A dialog library that
listens on `document` in the capture phase sees Escape before the viewer does; it keeps the viewer
open only if it calls `preventDefault()` (or `stopPropagation()`) on the key it handles.

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

Returning `null`, `undefined`, `true` or `false` shows the item's text `caption` (or nothing), in a
`span.gallerist-caption-text` so it keeps the theme's caption font. The band grows with what you render
(the stage gives up the room), from the height of a two-line text caption up to 40% of the viewport
(less if the stage would drop below 36% of the viewer), then it scrolls. Its text is the viewer's
accessible description (`aria-describedby`); the announcement on navigation stays the position plus
the item's `alt`, so put what a screen reader user needs in `alt`. Without React, use
[`@gallerist/plugin-captions`](../plugin-captions/README.md).

### A View menu

[`@gallerist/plugin-view`](../plugin-view/README.md) adds a View tool to the toolbar: people switch the
rail between stacked and one row, and the scheme between dark and light, in the open viewer. Either
the plugin applies a choice (uncontrolled) or your component does (controlled); neither remounts.

Uncontrolled: the menu applies it, you remember it.

```tsx
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { type ViewState, view } from '@gallerist/plugin-view'

const KEY = 'reviewer-view'
const saved = (): Partial<ViewState> => JSON.parse(localStorage.getItem(KEY) ?? '{}')

function Reviewer({ groups, onClose }: Props) {
  const [plugins] = useState(() => [
    thumbnails(),
    view({ initial: saved(), onChange: (s) => localStorage.setItem(KEY, JSON.stringify(s)) }),
  ])
  return <Gallerist groups={groups} open onClose={onClose} preset="reviewer" skin="console" plugins={plugins} />
}
```

Controlled: your state owns both, through the `scheme` and `groupDisplay` props, and the menu reports
what was picked (`controlled: true`; or `['scheme']` to own only the scheme).

```tsx
type Prefs = { rail: 'stacked' | 'flat'; scheme: 'dark' | 'light' }

function Reviewer({ groups, onClose }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(
    () => JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { rail: 'stacked', scheme: 'dark' },
  )
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(prefs)), [prefs])
  const [plugins] = useState(() => [
    thumbnails(),
    view({
      controlled: true,
      onChange: ({ rail, scheme }) =>
        setPrefs({ rail: rail === 'flat' ? 'flat' : 'stacked', scheme: scheme === 'light' ? 'light' : 'dark' }),
    }),
  ])
  return (
    <Gallerist
      groups={groups}
      open
      onClose={onClose}
      preset="reviewer"
      skin="console"
      plugins={plugins}
      scheme={prefs.scheme}
      groupDisplay={prefs.rail}
    />
  )
}
```

The menu reads the viewer each time it opens, so it shows what your props applied. Don't pass `scheme`
(or `groupDisplay`) for a setting the menu owns: the prop would set it back the next time it changes.

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
