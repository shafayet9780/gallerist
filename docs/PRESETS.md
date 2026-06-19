# Layout presets, arrows, collapse & theming

Visora's chrome layout is **declarative**: the renderer sets `data-visora-*` attributes on the root
and the theme reacts. Presets bundle coherent defaults; everything is overridable.

## Presets

A preset bundles a **rail placement**, arrow placement, and chrome auto-hide into a visibly
distinct layout.

| Preset      | Rail     | Arrows      | Auto-hide | For |
|-------------|----------|-------------|-----------|-----|
| `filmstrip` | `bottom` | `pill-right`| no        | Classic lightbox, persistent chrome (default). |
| `reviewer`  | `bottom` | `corner-br` | no        | Time-series review; labels under each screen. |
| `immersive` | `hidden` | `pill-right`| yes       | Full-bleed viewing; rail hidden, chrome fades on idle. |
| `contact`   | `top`    | `pill-right`| no        | Browse-heavy; rail along the top (pairs with `plugin-grid`). |

```tsx
// React
<Visora preset="reviewer" theme="amber" collection={c}
        plugins={[thumbnails({ ...resolvePreset('reviewer').thumbnails }), grid(), fullscreen()]} />
```

```ts
// Vanilla — mount() applies the preset's rail/arrows/auto-hide + data-visora-preset.
mount(viewer, { preset: 'reviewer' })
// thumbnails() options aren't owned by mount; apply them from the resolver:
const { thumbnails: t } = resolvePreset('reviewer')
createViewer({ collection, plugins: [thumbnails(t)] })
```

`resolvePreset(name)` is a pure function → `{ rootAttrs, arrows, autoHide, rail, thumbnails }`.
Unknown names fall back to `filmstrip`. Explicit `rail`/`arrows`/`autoHide` options always win over
the preset.

## Rail placement (`data-visora-rail-pos`)

- `bottom` (default) / `top` — the rail stays **horizontal** so it matches the ←/→ group axis (a
  vertical side rail would mis-map that axis, so it isn't offered). With `top`, the active group's
  item column expands downward instead of up.
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

## Arrow placement (`data-visora-arrows`)

The ←/→ group arrows stay on the side edges; the option controls the within-group ↑/↓ arrows:

- `pill-right` (default) — ↑/↓ as a stacked pill at right-center, inboard of →.
- `corner-br` — ↑/↓ paired in the bottom-right corner.
- `dpad` — all four arrows clustered as a directional pad (bottom-right).
- `split` — legacy ↑/↓ at top/bottom-center.

## Rail collapse & idle auto-hide

- **Collapse the thumbnail rail** with the `t` key or the toggle button; tracked as
  `data-visora-rail="collapsed|expanded"`. Entering fullscreen collapses it by default and exit
  restores the prior state.
- **Auto-hide chrome on idle** (`autoHide`, default `true`) flags `data-visora-idle` after
  inactivity so the theme can fade the chrome. It is **inert under `prefers-reduced-motion`** (no
  surprise disappearing UI). The `immersive` preset additionally fades the rail + toolbar.

## Theming (`data-visora-theme`)

The default theme is a "pro-review console": warm graphite surfaces, one signal accent, monospace
tabular numerals. Ship-in accent variants:

| `data-visora-theme` | Accent |
|---------------------|--------|
| (unset) / `amber`   | signal amber `#ffb000` |
| `cyan`              | scope cyan `#22d3ee` |
| `vermilion`         | record vermilion `#ff5a36` |

```tsx
<Visora theme="cyan" … />          // React (reactive)
root.setAttribute('data-visora-theme', 'vermilion') // vanilla
```

Everything is plain CSS custom properties (`--visora-*`). Override `--visora-accent`,
`--visora-backdrop`, `--visora-thumb-h`, etc. to restyle without forking the theme.
