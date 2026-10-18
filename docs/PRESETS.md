# Layout presets, arrows, collapse & theming

Gallerist's chrome layout is **declarative**: the renderer sets `data-gallerist-*` attributes on the root
and the theme reacts. Presets bundle coherent defaults; everything is overridable.

> **Breaking (unreleased):** the `top` rail position was removed — `RailPlacement` is now
> `bottom | left | right | hidden`. The `contact` preset, which defaulted to `top`, now defaults to
> `right` (a vertical rail, so its group axis is ↑/↓). To keep a horizontal rail, pass `rail="bottom"`.

## Presets

A preset bundles a **rail placement**, arrow placement, and chrome auto-hide into a visibly
distinct layout.

| Preset      | Rail     | Arrows      | Auto-hide | For |
|-------------|----------|-------------|-----------|-----|
| `filmstrip` | `bottom` | `pill-right`| no        | Classic lightbox, persistent chrome (default). |
| `reviewer`  | `bottom` | `corner-br` | no        | Time-series review; labels under each screen. |
| `immersive` | `hidden` | `pill-right`| yes       | Full-bleed viewing; rail hidden, chrome fades on idle. |
| `contact`   | `right`  | `pill-right`| no        | Browse-heavy; vertical rail on the right (pairs with `plugin-grid`). |

```tsx
// React
<Gallerist preset="reviewer" theme="amber" collection={c}
        plugins={[thumbnails({ ...resolvePreset('reviewer').thumbnails }), grid(), fullscreen()]} />
```

```ts
// Vanilla — mount() applies the preset's rail/arrows/auto-hide + data-gallerist-preset.
mount(viewer, { preset: 'reviewer' })
// thumbnails() options aren't owned by mount; apply them from the resolver:
const { thumbnails: t } = resolvePreset('reviewer')
createViewer({ collection, plugins: [thumbnails(t)] })
```

`resolvePreset(name)` is a pure function → `{ rootAttrs, arrows, autoHide, rail, thumbnails }`.
Unknown names fall back to `filmstrip`. Explicit `rail`/`arrows`/`autoHide` options always win over
the preset.

## Rail placement (`data-gallerist-rail-pos`)

- `bottom` (default) — the rail stays **horizontal**, matching the ←/→ group axis.
- `left` / `right` — the rail runs **vertical** (`data-gallerist-orientation="vertical"`), so the group
  axis becomes **↑/↓** and items **←/→**; the keys and on-screen arrows remap to match (group arrows
  stack at the stage's inline end, the item navigator runs along the bottom) and a peek opens toward
  the stage. Touch swipes stay conventional (horizontal = group, swipe-down = dismiss). In an RTL
  document the whole layout mirrors, side rails included.
- `hidden` — the rail starts collapsed; reveal it with the toggle, the `t` key, or fullscreen exit.

## Group display (`thumbnails({ groupDisplay })`)

A `thumbnails()` option (not a preset/rail field), so set it on the plugin. All presets default to
`stacked`; opt into `flat` explicitly, e.g. `thumbnails({ ...resolvePreset('contact').thumbnails,
groupDisplay: 'flat' })`.

- `stacked` (default) — one collapsed card per group. Hover/focus a multi-item card to **peek** its
  items without navigating in (touch gets an expand affordance). The active group's items show as a
  vertical stack in the **`aside` column** beside the stage (`itemAxis: 'vertical'`, the default), or
  as a row inline in the rail (`itemAxis: 'horizontal'`). The stack takes space rather than covering
  the stage, and stays up for one-item groups so the stage doesn't change width as you navigate.
- `flat` — every item renders side-by-side, each group bracketed (left accent rule + caption
  header). Item-windowed, so it stays bounded for large galleries and for a single giant group.

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

On a touch screen the on-image arrows are visually hidden (swipes navigate; screen readers still
reach them) and the navigator shows only the `n / N` position, at the bottom centre of the stage.

## Layout areas, rail collapse & idle auto-hide

The viewer is a grid of areas: a **top bar** (counter → group title → plugin tools → zoom reset →
close), the **stage**, an **`aside`** column at its inline end, a **caption** bar (the item's
caption, shown only when it has one), a plugin **footer**, and the **rail**. Persistent chrome takes
its own space instead of covering the image, so pieces can't collide. The `immersive` preset is the
exception: the stage fills the viewer and the bar, caption and rail float over it.

- **Collapse the thumbnail rail** with the `t` key or the toggle button; tracked as
  `data-gallerist-rail="collapsed|expanded"`. The rail shrinks to its handle and the stage grows into
  the space. Entering fullscreen collapses it by default and exit restores the prior state.
- **Auto-hide chrome on idle** (`autoHide`, default `true`) flags `data-gallerist-idle` after
  inactivity; the chrome fades but keeps its place, so nothing jumps. It is **inert under
  `prefers-reduced-motion`**. The `immersive` preset additionally fades the rail + toolbar.
- **Zoom reset** appears only while zoomed in.
- **Phones:** under 600px wide the chrome compacts and the `aside` column is dropped; on a touch
  screen every target is at least 44px and safe-area insets are respected.

## Theming (`data-gallerist-theme`)

The default theme is a "pro-review console": warm graphite surfaces, one signal accent, monospace
tabular numerals. Ship-in accent variants:

| `data-gallerist-theme` | Accent |
|---------------------|--------|
| (unset) / `amber`   | signal amber `#ffb000` |
| `cyan`              | scope cyan `#22d3ee` |
| `vermilion`         | record vermilion `#ff5a36` |

```tsx
<Gallerist theme="cyan" … />          // React (reactive)
root.setAttribute('data-gallerist-theme', 'vermilion') // vanilla
```

Everything is plain CSS custom properties (`--gallerist-*`). Override `--gallerist-accent`,
`--gallerist-backdrop`, `--gallerist-thumb-h`, etc. to restyle without forking the theme.
