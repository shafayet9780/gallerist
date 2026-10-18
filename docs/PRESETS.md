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
  axis becomes **↑/↓** and items **←/→**; the keys and on-screen arrows remap to match and the item
  column / peek open toward the stage (left rail → right, right rail → left). Touch swipes stay
  conventional (horizontal = group, swipe-down = dismiss) — only keys/arrows/layout flip.
- `hidden` — the rail starts collapsed; reveal it with the toggle, the `t` key, or fullscreen exit.

## Group display (`thumbnails({ groupDisplay })`)

A `thumbnails()` option (not a preset/rail field), so set it on the plugin. All presets default to
`stacked`; opt into `flat` explicitly, e.g. `thumbnails({ ...resolvePreset('contact').thumbnails,
groupDisplay: 'flat' })`.

- `stacked` (default) — one collapsed card per group. Hover/focus a multi-item card to **peek** its
  items without navigating in (touch gets an expand affordance); the active group expands its item
  column as before.
- `flat` — every item renders side-by-side, each group bracketed (left accent rule + caption
  header). Item-windowed, so it stays bounded for large galleries and for a single giant group.

## Linear traversal (`mount({ linear })`, `<Gallerist linear>`)

A renderer option that pairs with the **flat** rail: when set, ←/→ walks the flattened item
sequence across groups (1a, 1b, 2a, 2b, 2c, 3a…), the ↑/↓ item axis retires, the counter shows
`item N / total`, and the within-group pills hide — surfaced as `data-gallerist-linear`. Pass `loop`
alongside it to wrap at the global first/last item. The React example couples it to the flat rail
(`linear={groupDisplay === 'flat'}`).

## Arrow placement (`data-gallerist-arrows`)

The ←/→ group arrows stay on the side edges; the option controls the within-group ↑/↓ arrows:

- `pill-right` (default) — ↑/↓ as a stacked pill at right-center, inboard of →.
- `corner-br` — ↑/↓ paired in the bottom-right corner.
- `dpad` — all four arrows clustered as a directional pad (bottom-right).
- `split` — legacy ↑/↓ at top/bottom-center.

## Rail collapse & idle auto-hide

- **Collapse the thumbnail rail** with the `t` key or the toggle button; tracked as
  `data-gallerist-rail="collapsed|expanded"`. Entering fullscreen collapses it by default and exit
  restores the prior state.
- **Auto-hide chrome on idle** (`autoHide`, default `true`) flags `data-gallerist-idle` after
  inactivity so the theme can fade the chrome. It is **inert under `prefers-reduced-motion`** (no
  surprise disappearing UI). The `immersive` preset additionally fades the rail + toolbar.

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
