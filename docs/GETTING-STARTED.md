# Getting started

Gallerist has three parts: a headless core (`createViewer`), a DOM renderer (`mount`) and a CSS theme.
Plugins and a React adapter are optional.

## Install

```bash
npm i @gallerist/core @gallerist/renderer-dom @gallerist/theme-default
```

## A flat gallery

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import '@gallerist/theme-default/gallerist.css'

const viewer = createViewer({
  items: [
    { id: 'a', type: 'image', source: 'a.jpg', alt: 'Harbour at dawn' },
    { id: 'b', type: 'image', source: 'b.jpg', alt: 'Market street' },
  ],
})
mount(viewer) // a lightbox; pass { container } to render inline in the page
viewer.open()
```

## Groups: the reason it exists

A collection is groups of items. ←/→ moves between groups, ↑/↓ moves within one.

```ts
const viewer = createViewer({
  collection: {
    groups: [
      { id: 'kitchen', caption: 'Kitchen', items: [kitchen1, kitchen2, kitchen3] },
      { id: 'study', caption: 'Study', items: [study1] },
    ],
  },
  itemMemory: 'preserve', // or 'reset' (default) or 'clamp': which item a group opens on
})
```

Open at a place with `viewer.open({ g: 1, i: 0 })`. `viewer.open()` alone resumes where the viewer was.

## Choosing a look

A **skin** sets colour, type and motion; a **preset** sets the layout. Any skin works with any preset.
Skins other than the default need their stylesheet too.

```ts
import { mount, resolvePreset } from '@gallerist/renderer-dom'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'

const viewer = createViewer({
  collection,
  // the renderer doesn't own the plugin, so hand it the preset's rail options
  plugins: [thumbnails(resolvePreset('reviewer').thumbnails)],
})
mount(viewer, { preset: 'reviewer', skin: 'console', accent: 'cyan', scheme: 'dark' })
```

See [Presets and layout](PRESETS.md) for every option, and restyle anything by overriding
`--gallerist-*` tokens on `.gallerist` in your own CSS.

## Plugins

| Plugin | Adds |
|---|---|
| [`plugin-thumbnails`](../packages/plugin-thumbnails/README.md) | The rail: stacked cards, flat, or a section index |
| [`plugin-grid`](../packages/plugin-grid/README.md) | A contact sheet, or an overview to open on |
| [`plugin-pins`](../packages/plugin-pins/README.md) | Comments, product tags and features pinned to the image |
| `plugin-fullscreen`, `plugin-download`, `plugin-hash` | Fullscreen, downloads and zips, deep links |
| `plugin-video`, `plugin-video-youtube` | HTML5 and YouTube video items |

Writing your own: [Plugin authoring](PLUGIN-AUTHORING.md).

## React

```tsx
import { Gallerist } from '@gallerist/react'
import '@gallerist/theme-default/gallerist.css'

<Gallerist collection={collection} open={open} onClose={() => setOpen(false)} preset="filmstrip" />
```

The build is marked `"use client"`, so it works from a Server Component tree. See
[`@gallerist/react`](../packages/react/README.md) for which props update live.

## Without a build step

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gallerist/theme-default/src/gallerist.css" />
<script src="https://cdn.jsdelivr.net/npm/@gallerist/cdn/dist/gallerist.umd.js"></script>
<a href="big.jpg" data-gallerist="trip"><img src="small.jpg" alt="Harbour" /></a>
<script>
  Gallerist.bind()
</script>
```

`bind()` is in `@gallerist/renderer-dom` for bundled pages too. Attributes are listed in
[`@gallerist/cdn`](../packages/cdn/README.md).

## Translating the interface

Every label has an English default and is overridable: `strings` on `mount` and on the thumbnails, grid,
download, fullscreen and pins plugins. Each plugin exports its defaults (`DEFAULT_GRID_STRINGS`…).
