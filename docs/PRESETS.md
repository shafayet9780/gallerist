# Layout presets, arrows, collapse & theming

Gallerist's chrome layout is **declarative**: the renderer sets `data-gallerist-*` attributes on the root
and the theme reacts. Presets bundle coherent defaults; everything is overridable.

## Presets

A preset bundles a **rail placement**, arrow placement, and chrome auto-hide into a visibly
distinct layout.

| Preset      | Rail     | Arrows      | Auto-hide | For |
|-------------|----------|-------------|-----------|-----|
| `filmstrip` | `bottom` | `pill-right`| no        | Classic lightbox, persistent chrome (default). |
| `reviewer`  | `bottom` | `docked`    | no        | Time-series review: a timeline rail (a time over each group from `group.meta.time`), numbered items, the zoom navigator, and no control over the media (`arrows: 'docked'`). Pairs with `skin: 'console'`. |
| `immersive` | `hidden` | `pill-right`| yes       | Full-bleed viewing; rail hidden, chrome fades on idle. |
| `contact`   | `right`  | `pill-right`| no        | Browse-heavy; vertical rail on the right (pairs with `plugin-grid`). |
| `editorial` | `bottom` | `pill-right`| no        | A gallery wall: the work framed with room around it (`frame`), a placard beside it holding the caption and the item navigator (`itemIndicator: 'placard'`), numbered items inline in the rail. Pairs with `skin: 'editorial'`. With a side rail the placard becomes the caption band under the stage. |
| `tour`      | `left`   | `pill-right`| no        | A walkthrough of named sections: a section index (`groupDisplay: 'index'`), ←/→ between sections on labelled arrows (`groupAxis: 'horizontal'`, `arrowLabels`), ↑/↓ within one, framed media. Pairs with `grid({ layout: 'sections', startOpen: true })`. At 900px wide or less the index becomes a strip of chips along the bottom. |

```tsx
// React
<Gallerist preset="reviewer" skin="console" collection={c}
        plugins={[thumbnails(), grid(), fullscreen()]} />
```

```ts
// Vanilla — mount() applies the preset's rail/arrows/auto-hide + data-gallerist-preset, and the
// thumbnails rail takes the preset's options (reviewer: a timeline, numbered items).
const viewer = createViewer({ collection, plugins: [thumbnails()] })
mount(viewer, { preset: 'reviewer' })
// an option you pass wins, key by key; the rest still come from the preset
createViewer({ collection, plugins: [thumbnails({ timeline: false })] })
```

`resolvePreset(name)` is a pure function → `{ rootAttrs, arrows, autoHide, rail, thumbnails,
navigator?, frame?, itemIndicator?, groupAxis?, arrowLabels? }`. Unknown names fall back to `filmstrip`. Explicit `rail`/`arrows`/`autoHide`/`navigator`/
`frame`/`itemIndicator`/`groupAxis`/`arrowLabels` options always win over the preset.

The renderer hands the resolved preset to every plugin region (`RegionCtx.preset`), and
`thumbnails()` takes its `thumbnails` entry for each option it wasn't given (`undefined` counts as
not given). The rail settles its options when its region mounts, so this also holds for a
`viewer.use(thumbnails())` after `mount()`. Each preset's rail:

| Preset      | `thumbnails` defaults |
|-------------|-----------------------|
| `filmstrip`, `immersive`, `contact` | `itemAxis: 'vertical'` (the plugin's own defaults) |
| `reviewer`  | `itemAxis: 'vertical'`, `timeline: true`, `numberItems: true` |
| `editorial` | `itemAxis: 'horizontal'`, `numberItems: true` |
| `tour`      | `groupDisplay: 'index'`, `itemAxis: 'horizontal'`, `numberItems: true` |

## Rail placement (`data-gallerist-rail-pos`)

- `bottom` (default) — the rail stays **horizontal**, matching the ←/→ group axis.
- `left` / `right` — the rail runs **vertical** (`data-gallerist-orientation="vertical"`), so the group
  axis becomes **↑/↓** and items **←/→**; the keys and on-screen arrows remap to match (group arrows
  stack at the stage's inline end, the item navigator runs along the bottom) and a peek opens toward
  the stage. Touch swipes stay conventional (horizontal = group, swipe-down = dismiss). In an RTL
  document the whole layout mirrors, side rails included.
- `hidden` — the rail starts collapsed; reveal it with the toggle, the `t` key, or fullscreen exit.

`groupAxis` overrides which arrows move between groups, whatever the rail does: `tour` keeps
`horizontal` beside its left rail, so ←/→ moves between sections and ↑/↓ within one
(`data-gallerist-axis`; the rail's own direction stays `data-gallerist-orientation`).

`arrowLabels` names the group arrows after where they go (`true` = `group.caption`, or a function).
It needs horizontal group arrows in the `pill-right` layout and is ignored otherwise. Translate the
arrow's accessible name with `strings.previousTo` / `strings.nextTo`.

## Group display (`thumbnails({ groupDisplay })`)

A `thumbnails()` option (not a preset/rail field), so set it on the plugin. Presets default to
`stacked` (`tour` uses `index`); opt into `flat` explicitly, e.g. `thumbnails({ groupDisplay: 'flat' })`.
A preset's `itemAxis`, `numberItems` and `timeline` belong to its own group display, so an explicit
`groupDisplay` other than the preset's starts from the plugin's defaults for those (`tour` with
`groupDisplay: 'stacked'` gets the plain vertical stack, unnumbered); pass them too to keep them.

- `stacked` (default) — one collapsed card per group. Hover/focus a multi-item card to **peek** its
  items without navigating in (touch gets an expand affordance). The active group's items show as a
  vertical stack in the **`aside` column** beside the stage (`itemAxis: 'vertical'`, the default), or
  as a row inline in the rail (`itemAxis: 'horizontal'`). The stack takes space rather than covering
  the stage, and stays up for one-item groups so the stage doesn't change width as you navigate.
- `flat` — every item renders side-by-side, each group bracketed (left accent rule + caption
  header). Item-windowed, so it stays bounded for large galleries and for a single giant group.
- `index` — a section index: a row per group with its cover, `group.caption`, `group.meta.subtitle`
  and item count; the active group's items expand under its row. At 900px wide or less, or on a
  bottom rail, it's a strip of chips instead, which don't expand.

## Linear traversal (`mount({ linear })`, `<Gallerist linear>`)

A renderer option that pairs with the **flat** rail: when set, ←/→ walks the flattened item
sequence across groups (1a, 1b, 2a, 2b, 2c, 3a…), the ↑/↓ item axis retires, the counter shows
`item N / total`, and the within-group pills hide — surfaced as `data-gallerist-linear`. Pass `loop`
alongside it to wrap at the global first/last item. The React example couples it to the flat rail
(`linear={groupDisplay === 'flat'}`).

## Arrow placement (`data-gallerist-arrows`)

The ←/→ group arrows stay on the side edges; the option places the **item navigator** (↑ · position ·
↓, one cluster), which only appears for groups with more than one item:

- `pill-right` (default) — a vertical cluster at the inline-end centre, inboard of →.
- `corner-br` — a horizontal cluster in the bottom inline-end corner.
- `dpad` — a keyboard-arrow cluster in the bottom inline-end corner: ↑ on top, ← ↓ → along the bottom.
- `split` — ↑ at top-centre with the position under it, ↓ at bottom-centre.
- `docked` (the `reviewer` preset) — nothing over the media, for review that needs every pixel,
  corners included. The group arrows sit in gutters the stage leaves at its sides (on touch, where
  swipes stand in for them, the stage takes the full width). The navigator leaves the stage: the
  `n / N` count over ↑ ↓, as a header on the `aside` item column while that shows (a `stacked`
  rail's vertical item stack, over 600px wide, rail expanded), otherwise at the end of the caption
  row, beside a text caption or a designed one (`plugin-captions`, `<Gallerist.Caption>`), which make
  room for it. It shows the count rather than pills or dots. While any group has several items it
  keeps its room on a one-item group, so neither the stage nor the item column moves.

The position inside the navigator follows `itemIndicator` (`mount` option / `<Gallerist itemIndicator>`):
`pills` (default — numbered pills up to 8 items, then `n / N`), `dots` (plain dots plus the `n / N`
count, up to 12 items), or `counter` (always `n / N`).

On a touch screen the on-image arrows are visually hidden (swipes navigate; screen readers still
reach them) and the navigator shows only the `n / N` position, at the bottom centre of the stage
(`docked`: where it docks, with its ↑ ↓). A group arrow focused from a keyboard on a touch screen
comes back over the stage edge while it has focus, `docked` included.

## Layout areas, rail collapse & idle auto-hide

The viewer is a grid of areas: a **top bar** (counter → group title → plugin tools → zoom reset →
close), the **stage**, an **`aside`** column at its inline end, a **caption** bar (the item's
caption, shown only when the collection has one, or a designed caption from `plugin-captions` /
`<Gallerist.Caption>`), a plugin **footer**, and the **rail**. Persistent chrome takes its own space
instead of covering the image, so pieces can't collide. The `immersive` preset is the exception: the
stage fills the viewer and the bar, caption and rail float over it.

The stage gets what is left. A text caption is a fixed two-line band, but the `footer` region and a
designed caption are as tall as their content, so the stage shrinks when they grow (and grows back
when they shrink). Keep them a steady height if the image shouldn't move between items.

- **Collapse the thumbnail rail** with the `t` key or the toggle button; tracked as
  `data-gallerist-rail="collapsed|expanded"`. The rail shrinks to its handle and the stage grows into
  the space (a grid track, so it snaps rather than animates). Collapsing also hides the `aside`
  item stack. Entering fullscreen collapses it by default and exit restores the prior state.
- **Auto-hide chrome on idle** (`autoHide`, default `true`) flags `data-gallerist-idle` after
  inactivity; the chrome fades but keeps its place, so nothing jumps. Plugin tools in the bar fade
  with it on purpose; they come back on the next pointer move or key press. It is **inert under
  `prefers-reduced-motion`**. The `immersive` preset additionally fades the rail + toolbar, and
  there the floating bar and caption let clicks through to the image except on their buttons.
- **Zoom reset** appears only while zoomed in.
- **Framed media** (`frame: true`, on in `editorial`): the work hangs inside the stage with room
  around it (the skin's `--gallerist-frame-inset`), and the media element is sized to the image so
  the skin's mat (`--gallerist-frame-mat`) and shadow (`--gallerist-frame-shadow`) hug it. Zoom
  bounds, overlays and pins follow the framed box.
- **Placard** (`itemIndicator: 'placard'`, on in `editorial`): the item navigator moves from over
  the stage into the caption, with a tick per item. Under the stage the placard is one band of
  fixed height (the caption on one line), so the stage keeps its size; the editorial preset sets it
  as a column beside the work on wide screens. It stays up even with no caption and a one-item group,
  so the layout never shifts.
- **Zoom navigator** (`navigator: true`, on in `reviewer`): while zoomed in, a minimap of the image
  in the stage's bottom corner (top corner on narrow screens) with a box for the visible part;
  click or drag it to move around. It is a pointer aid, hidden from assistive tech; the keys zoom
  and pan as before. It belongs to the built-in controls (none with `controls: false`) and fades
  with them on idle; it isn't shown for media that can't zoom (video).
- **Phones:** under 600px wide the chrome compacts, the `aside` column and the items toggle are
  dropped and the bar's tools scroll sideways if they don't fit. On a touch screen every target is
  at least 44px, the ↑ · position · ↓ navigator stays visible (group arrows give way to swipes but
  reappear on keyboard focus) and safe-area insets are respected.
- **Captions** take a fixed two-line band (longer text is clamped), reserved for the whole
  collection when any item has one, so the stage keeps its size as you move between items.
- **Right-to-left:** the renderer sets `data-gallerist-dir="ltr|rtl"` from the computed direction;
  the theme mirrors arrow glyphs and keeps `rail: 'left' | 'right'` on the physical side.

## Skins, accents and schemes

The look is three independent options, separate from the layout preset: any skin works with any
preset. The renderer reflects them as `data-gallerist-skin`, `data-gallerist-accent` and
`data-gallerist-scheme` on the root, and the theme does the rest.

| `skin` | Stylesheet | Look | Accents (first is the default) |
|--------|-----------|------|---------|
| `gallery` (default) | `gallerist.css` | Quiet near-black or warm paper, round controls, sans numerals. The tint marks focus and progress only; selection and pressed toggles use the foreground. | `periwinkle`, `mint`, `amber`, `vermilion` |
| `editorial` | `gallerist.css` + `editorial.css` | A warm gallery wall (light by default) or Night, ink type, a serif for titles and captions, one red for what's current; works fade in rather than slide. Uses Hanken Grotesk and Newsreader when the page loads them. | `vermilion`, `cobalt` |
| `console` | `gallerist.css` + `console.css` | Pro review: flat graphite (or Paper) bands with hairlines, one signal accent for what's current (the thumb ring, a pressed toggle's glyph and underline), a neutral focus ring, monospaced numerals. Uses IBM Plex when the page loads it. | `amber`, `cyan`, `vermilion` |

`scheme` is `dark`, `light`, or `auto` (follows `prefers-color-scheme`). Unset, each skin uses its
own default: Gallery and Console dark, Editorial the light wall (`dark` is its Night). Each accent has a
dark and a light value, so every accent works in both schemes.

```ts
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css' // only for skin: 'console'

mount(viewer, { skin: 'console', accent: 'cyan', scheme: 'auto' })
```

```tsx
<Gallerist skin="console" accent="cyan" scheme="auto" … /> // React: all three are reactive
```

Without its stylesheet a skin falls back to Gallery, and an accent the skin doesn't name falls back
to the skin's default. Gallery uses Instrument Sans when the page has loaded it and the system sans
otherwise; the theme never downloads fonts.

Everything is plain CSS custom properties (`--gallerist-*`). Override `--gallerist-accent-dark`,
`--gallerist-backdrop`, `--gallerist-thumb-h`, etc. on `.gallerist` to restyle without forking the
theme. The theme declares its tokens in cascade layers (`gallerist.base`, `.gallery`, `.console`,
`.compact`), so a page's own rule wins in every skin, scheme and accent, and on phones. Scope it
to narrow it, e.g. `.gallerist[data-gallerist-skin="console"] { --gallerist-accent-dark: … }`.
The component rules themselves are not layered, so a page's element resets (`button { … }`)
don't strip the chrome.

A custom skin is a rule that sets tokens, e.g. `.gallerist[data-gallerist-skin="mine"] { … }`,
loaded after `gallerist.css`; `base.css` documents every token it reads. Skins set tokens only;
they never position chrome, so the layout guarantees hold in every skin. `applyAppearance(root,
{ accent })` changes only the options it is given.
