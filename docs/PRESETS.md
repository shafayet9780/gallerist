# Layout presets, arrows, collapse & theming

Visora's chrome layout is **declarative**: the renderer sets `data-visora-*` attributes on the root
and the theme reacts. Presets bundle coherent defaults; everything is overridable.

## Presets

A preset bundles arrow placement, chrome auto-hide, and the thumbnail rail's secondary-axis layout.

| Preset      | Arrows      | Auto-hide | Rail ticks | For |
|-------------|-------------|-----------|------------|-----|
| `filmstrip` | `pill-right`| no        | no         | Classic lightbox, persistent chrome (default). |
| `immersive` | `pill-right`| yes       | no         | Full-bleed viewing; chrome + rail fade on idle. |
| `reviewer`  | `corner-br` | no        | yes        | Time-series review; time-ribbon under the rail. |
| `contact`   | `pill-right`| no        | no         | Grid-first browsing (host opens `plugin-grid`). |

```tsx
// React
<Visora preset="reviewer" theme="amber" collection={c}
        plugins={[thumbnails({ ...resolvePreset('reviewer').thumbnails }), grid(), fullscreen()]} />
```

```ts
// Vanilla — mount() applies the preset's arrows/auto-hide + data-visora-preset.
mount(viewer, { preset: 'reviewer' })
// thumbnails() options aren't owned by mount; apply them from the resolver:
const { thumbnails: t } = resolvePreset('reviewer')
createViewer({ collection, plugins: [thumbnails(t)] })
```

`resolvePreset(name)` is a pure function → `{ rootAttrs, arrows, autoHide, thumbnails }`. Unknown
names fall back to `filmstrip`. Explicit `arrows`/`autoHide` options always win over the preset.

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
