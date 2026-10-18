# Gallerist — Phase 2 Plan: one engine, six looks

> Strategic plan. Executable checklist: `tasks/todo.md` (Phase 2 section). Design source of truth
> for each look: the six design canvases (links below). Spec: `docs/GALLERIST_SPEC.md` (decisions
> D16–D19 record the choices here).

## Context

Step 1 of the October 2026 roadmap (correctness and API meaning) is done on `fix/correctness-pass`.
A design review then produced six complete directions, each a 24-frame canvas covering every shipped
feature, the configuration surface and the Phase 2 plugins:

| Direction | Canvas | Becomes |
|---|---|---|
| Gallery | https://claude.ai/artifact/EVi76rik5oEqY8hoQSc84D | **Default skin** (`gallery`) |
| Console | https://claude.ai/artifact/LxedyaehthBUMbtwH6H3kJ | **Skin** `console` + the `reviewer` preset (flagship demo) |
| White Cube | https://claude.ai/artifact/Pjh7JNxnsH9YM8Bs4LxtFd | **Skin** `editorial` (light, with a Night scheme) + `editorial` preset |
| Tour | https://claude.ai/artifact/GvziLcxEw7ZVWP68H5DJtM | **Preset** `tour`, built from extended thumbnails/grid plugins |
| Atlas | https://claude.ai/artifact/ULns4pHBkufWoXMZT5BN9P | **Plugin** `@gallerist/plugin-atlas` + a renderer `peek` option |
| Stories | https://claude.ai/artifact/S1Dvexx3FNi4b1BBJmvJbn | **Renderer mode** `stories`, after 0.3, with a go/no-go check |

Comparison and build-cost notes: https://claude.ai/artifact/6Tvp9X5zUGWHQxxY8k7euj

The canvases are reference designs, not pixel specs: they were built without visual verification,
and where a canvas and this plan disagree, the plan wins.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| P2-A | Layering | Three independent layers. **Skin** = colour, type, radius and motion tokens. **Preset** = layout (rail, arrows, auto-hide, item indicator, caption position). **Plugin / mode** = behaviour. Any skin works with any preset; each direction is a recommended pairing. |
| P2-B | Structure vs skin | `theme-default` splits into a structural base (`base.css`: regions, layout, reserved space, mobile layer, RTL, reduced motion) and skins that only set tokens and a few component treatments. Skins never position chrome. |
| P2-C | Packaging | One CSS package, several entry files: `@gallerist/theme-default/gallerist.css` (base + gallery skin, zero-config), plus `console.css` and `editorial.css` that layer on top. Skins are scoped by `data-gallerist-skin`, so two viewers on one page can differ. |
| P2-D | Option names | `skin: 'gallery' \| 'console' \| 'editorial'`, `accent` (named per skin), `scheme: 'dark' \| 'light' \| 'auto'`. The current React `theme` prop (amber/cyan/vermilion accents) becomes `accent`. Breaking, pre-1.0. |
| P2-E | Default look | **Gallery** becomes the default. Today's graphite + amber look moves, unchanged, into the `console` skin, verified by screenshot comparison. Visual breaking change for anyone on the default; pre-1.0, called out in the changelog. |
| P2-F | Presets | Keep `filmstrip`, `reviewer`, `immersive`, `contact`; add `editorial` and `tour`. Presets stay layout-only (no colours). |
| P2-G | Tour without a new package | The section index is a new thumbnails `groupDisplay: 'index'` (vertical, names and counts, active section expands); the overview start screen is a grid `layout: 'sections'` + `startOpen`; labelled arrows are a renderer option `arrowLabels`. |
| P2-H | Atlas | Neighbour peeks are a renderer option (`peek: 'none' \| 'groups' \| 'both'`), because the renderer owns slide placement (neighbours are already mounted, just off-screen). The skyline minimap and the map mode live in `@gallerist/plugin-atlas`. |
| P2-I | Anchored overlays | One `@gallerist/plugin-pins` with presentations: `comment` (numbered pins + threads, Console), `tag` (product card, Gallery), `feature` (amenity pins, Tour). Requires contained-rect zoom bounds first. |
| P2-J | Stories | `mode: 'stories'` in renderer-dom (portrait stage, progress segments, tap zones, auto-advance) plus a story-tray rail. Scheduled after 0.3, with an explicit go/no-go: ReelKit already ships a stories player. |
| P2-K | Verification | A Playwright screenshot matrix (skin × preset × desktop/phone × scheme, representative cells) becomes a CI gate, alongside axe per skin and an RTL pass per skin. Three skins and six presets cannot be kept collision-free by eye. |

## Architecture changes in the code

- **Chrome regions.** One top bar region in fixed order: counter → title/caption → tools → close.
  Arrows, the item indicator and the caption bar get their own regions, so presets can move them
  without overlap.
- **Reserved space.** Persistent rails and panels publish their size as CSS variables
  (`--gallerist-inset-bottom`, `-left`, `-right`, `-top`); the stage insets by them. Overlay-style
  rails (immersive) set them to 0.
- **Item indicator** becomes a renderer option: `pills` (≤8, today), `dots` (Gallery, vertical),
  `counter` (`n / N`), `placard` (inside the caption label, editorial). Hidden for one-item groups
  and in linear mode.
- **Strings.** All UI text through a `strings` option with English defaults; no domain words
  ("Screen N" goes).
- **Navigator.** A zoom navigator (minimap of the zoomed image with the viewport box) as a renderer
  option, used by Console and Atlas.
- **First-run hint.** One coach-mark component (gesture hint, "n more below"), opt-in, dismissible,
  remembered per browser; every skin styles it.
- **Plugin UI uses tokens only.** Toolbar buttons move from Unicode glyphs to the shared SVG icon set;
  pressed and focus states are distinct in every skin.

## Milestones

Each milestone leaves the system green (lint, typecheck, unit, e2e, size, attw, examples) and
merges on its own. Estimates are solo-developer weeks.

| Milestone | Contents | Est. | Roadmap step |
|---|---|---|---|
| **M15 Chrome architecture** | Top bar region, reserved space, item indicator variants, hidden axes, zoom-reset only when zoomed, SVG plugin icons, logical properties, mobile layer (breakpoints, coarse pointer, safe areas, compact rail, no mid-image arrows on touch), `strings`, stage caption bar. Screenshot matrix introduced. | 2 | 2 |
| **M16 Skin system + Gallery default** | Split base/skin, `skin`/`accent`/`scheme` options, Gallery skin as default (dark + light), today's look extracted as `console` with zero visual diff. | 1 | 2 |
| **M17 Contained-rect bounds + pins** | Zoom and pan bounds against the painted image box; `plugin-pins` with `comment`, `tag` and `feature` presentations; hotspot demo. | 2 | 3 |
| **M18 Console** | `console` skin polish to the canvas, `reviewer` preset upgrade (labelled timeline rail, numbered item stack), zoom navigator, comment pins wired in the monitoring example. Apploye's reviewer can adopt this. | 1 | 3 |
| **M19 Editorial** | `editorial` skin (wall + Night scheme), framed media, placard caption hosting the item controls, crossfade motion tokens, `editorial` preset. | 1 | 2 |
| **M20 Tour** | Thumbnails `groupDisplay: 'index'`, grid `layout: 'sections'` + `startOpen`, `arrowLabels`, `tour` preset, a listing example. | 1 | — |
| **M21 Parity** | `"use client"` banner, DOM-markup init (`data-gallerist` links), a UMD/CDN build, translatable strings audited. | 0.5 | 4 |
| **Release 0.3** | Honest positioning, docs site with a live playground that switches skin × preset, migration notes for P2-D/P2-E, then publish (repo public, `NPM_TOKEN`, manual release workflow). | 1.5 | 5 |
| **M22 Atlas** | Renderer `peek`, `plugin-atlas` (skyline minimap, map mode on the grid), first-run hint. | 1.5 | — |
| **M23 Review plugins** | `triage` and `compare` first (Console), then `slideshow`, `rotate`, `share`, `info`, `timeline`, `filter`, `redaction`, each styled by tokens in all three skins. | 3 | 6 |
| **Release 0.4** | Atlas + review plugins, Vue adapter. | 1 | 5 |
| **M24 Stories (go/no-go)** | Review demand and the ReelKit overlap first; if go: `mode: 'stories'`, segments, tap zones, auto-advance, story tray, phone-first examples. | 2–3 | — |

Rough total: about 11 weeks to 0.3 and about 16 to 0.4, before Stories. That is longer than the
earlier "4–6 weeks to 0.3" because every look is now in scope; the release cut below keeps the
first publish from waiting on Atlas and the review plugins.

## Release cut

- **0.3:** Gallery (default), Console + reviewer, Editorial, Tour, pins, parity. Enough to show the
  positioning (structured review) and the mainstream default.
- **0.4:** Atlas, the review plugins, Vue.
- **0.5 or later:** Stories, if it passes go/no-go.

## Budgets

- Core stays ≤ 12 KB gz (today 3.1 KB); renderer growth for peek, navigator, labels, indicator
  variants ≤ +2.5 KB gz (core + renderer ≤ 16 KB, today 12.8 KB).
- Each skin CSS ≤ 6 KB gz; `base.css` ≤ 10 KB gz.
- Each new plugin gets its own size-limit entry (pins ≤ 4 KB, atlas ≤ 5 KB).

## Risks

- **Scope for one developer.** Mitigated by the release cut and by building Tour and Atlas mostly
  from existing plugins.
- **Visual consistency across 3 skins × 6 presets.** Mitigated by P2-B (skins never position chrome)
  and the screenshot gate (P2-K).
- **The default-look change surprises early adopters.** Nothing is published yet; the old look stays
  one option away (`skin: 'console'`).
- **Stories competes with ReelKit.** Kept behind an explicit go/no-go.
- **Apploye (first consumer) depends on the reviewer look.** Console is extracted in M16 and polished
  in M18, before 0.3.

## Still deferred from step 1

A `RegionCtx` root handle for plugins, exporting gestures and overlay painting for custom renderers,
and holding navigation during open/close transitions. Revisit in M15 (the region work touches the
first) or after 0.3.
