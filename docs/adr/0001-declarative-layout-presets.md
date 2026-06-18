# ADR 0001 — Declarative layout via data-attributes + a pure preset resolver

- Status: accepted
- Date: 2026-06-18
- Milestone: M14 (UX/UI overhaul, v0.2.0)

## Context

M14 made the viewer's chrome configurable: arrow placement, chrome auto-hide, rail collapse,
secondary-axis rail layout, time-ribbon, accent variants, and four "smart" presets. These choices
span three rings — the renderer (chrome/arrows/idle), the thumbnails **plugin** (rail layout/ticks),
and the **theme** CSS (appearance/placement). We needed a configuration model that keeps the
headless core DOM-free, works in both vanilla and React, and doesn't push imperative layout code
into JS.

## Decision

1. **Layout is driven by root `data-visora-*` attributes**, consumed entirely by the theme CSS:
   `data-visora-arrows`, `data-visora-rail`, `data-visora-idle`, `data-visora-preset`,
   `data-visora-theme` (+ the thumbnails rail's `data-axis` / `data-ticks`). JS only *sets*
   attributes and builds the item-column DOM; all positioning/appearance lives in CSS, so it is
   overridable without forking and adds no per-frame JS.

2. **Presets are a pure resolver** in `@visora/renderer-dom`: `resolvePreset(name)` →
   `{ rootAttrs, arrows, autoHide, thumbnails }`, no DOM, unit-tested. `mount()` accepts `preset`
   and applies the arrow/auto-hide defaults + root attrs (explicit options win). The preset's
   preferred thumbnails options are **returned for the host to apply** rather than auto-injected,
   because the thumbnails rail is a separately-registered plugin the renderer doesn't own.

3. **No new core state.** Idle/collapse are DOM concerns owned by `renderer-dom` (an idle controller
   + a collapse toggle), preserving the headless moat — the core gains only an additive
   `Group.caption` type.

## Consequences

- Restyling/repositioning is CSS-only; consumers override `--visora-*` tokens or the `data-*`
  selectors. The same attributes work identically in vanilla and React (`<Visora preset theme>`
  just fans out to `mount()` options + the theme attribute).
- A preset cannot, by itself, configure the thumbnails plugin or open the grid — the host wires
  `resolvePreset(name).thumbnails` into `thumbnails()` (and opens `plugin-grid` for `contact`).
  Accepted as the price of keeping plugins independent and tree-shakeable.
- Auto-hide is inert under `prefers-reduced-motion`; the default theme appearance changed (a
  pre-1.0, semver-minor visual break) — documented, and reversible via token overrides.
