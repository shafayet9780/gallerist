# @gallerist/plugin-fullscreen

Gallerist plugin — native Fullscreen API toggle (toolbar button + 'f' key).

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-fullscreen
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { mount } from '@gallerist/renderer-dom'

const viewer = createViewer({ groups, plugins: [fullscreen()] })
mount(viewer)

viewer.on('fullscreenChange', ({ fullscreen }) => console.log('fullscreen:', fullscreen))
```

A toggle joins the toolbar (pressed while fullscreen), and `f` toggles. The plugin fullscreens this
viewer's own root, so two viewers on a page don't fullscreen each other, and a fullscreen `<video>`
elsewhere on the page doesn't count as ours. Older Safari's prefixed API is used where the standard one
is missing.

| Option | Default | |
|---|---|---|
| `target` | the viewer's root | a CSS selector for the element to fullscreen instead |
| `strings` | English | the button's label (`toggle`), for translation; defaults in `DEFAULT_FULLSCREEN_STRINGS` |

While the viewer is fullscreen the default renderer collapses the thumbnail rail, and restores it on
exit (a toggle of the rail while fullscreen wins). The viewer emits `fullscreenChange` with
`{ viewer, fullscreen }` on every change.

Browsers only enter fullscreen from a user gesture (a click or a key press); a refused request is
ignored. iPhone Safari has no element fullscreen (only `<video>`), so there the button does nothing;
hide it with CSS (`.gallerist-fullscreen-btn`) if you'd rather not show it.

On a phone (600px wide or less) `@gallerist/theme-default` leaves the button out of an **overlay**
viewer's bar, which already fills the screen; an **inline** viewer keeps it. Set
`--gallerist-phone-fullscreen: grid` on `.gallerist` to keep it in an overlay too.

See [Plugin authoring](https://github.com/shafayet9780/gallerist/blob/main/docs/PLUGIN-AUTHORING.md):
this plugin is the small example of a toolbar button.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
