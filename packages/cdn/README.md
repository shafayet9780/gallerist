# @gallerist/cdn

Gallerist as one `<script>`, for pages with no build step: the core, the DOM renderer and every plugin
on a global `Gallerist`. Using a bundler? Install the packages you need instead; they tree-shake.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gallerist/theme-default/src/gallerist.css" />
<script src="https://cdn.jsdelivr.net/npm/@gallerist/cdn/dist/gallerist.umd.js"></script>

<a href="photos/one.jpg" data-gallerist="trip"><img src="photos/one-thumb.jpg" alt="Harbour" /></a>
<a href="photos/two.jpg" data-gallerist="trip"><img src="photos/two-thumb.jpg" alt="Market" /></a>

<script>
  Gallerist.bind({ viewer: { plugins: [Gallerist.thumbnails()] } })
</script>
```

Pin a version in production (`@gallerist/cdn@<version>/dist/...`). Other skins are separate files,
`.../theme-default/src/console.css` and `.../editorial.css`: load one after `gallerist.css` and select
it with `mount: { skin: 'console' }`. Editorial looks as designed with `preset: 'editorial'` too.

## Link attributes

Each `data-gallerist` value is one gallery; links without a value share a default one.

| Attribute | Default | Meaning |
|---|---|---|
| `href`, or `data-gallerist-src` | | the media URL (the attribute wins) |
| `data-gallerist-thumb` | nested `<img>` `src` | thumbnail |
| `data-gallerist-alt` | nested `<img>` `alt` | description |
| `data-gallerist-caption` | | caption |
| `data-gallerist-type` | `image` | `video` needs the matching plugin |
| `data-gallerist-width`, `-height` | | natural size, to reserve the space |
| `data-gallerist-id` | generated | a stable item id; a repeated one falls back to a generated id |
| `data-gallerist-group` | own group | links with the same value form one group |
| `data-gallerist-group-caption`, `-group-subtitle` | | the group's name and subtitle, from its first link |

`bind()` listens once on the page, so links added later join on the next click. Modified clicks (new
tab, download) stay the browser's, and focus returns to the link on close. It takes `selector`, `root`,
`viewer` and `mount`; the last two may be functions of the gallery name. It returns `open(gallery, at)`,
`viewer(gallery)` and `destroy()`.

With several galleries, pass `viewer` as a function if you use `pins()`, so each gets its own instance:
`viewer: () => ({ plugins: [Gallerist.pins()] })`. Viewers are created on first open, so `hash()` can't
open one from the URL on page load.

`bind` is also exported by `@gallerist/renderer-dom`, for bundled pages.

## License

MIT
