# ADR 0002 — The v1 core overlay/adapter contract is DOM-targeted

- Status: accepted
- Date: 2026-06-22
- Context: Phase-1 publish-readiness review (finding S-A3 / architecture #38)

## Context

`@gallerist/core` is headless and DOM-free at runtime (zero deps, no `document` access). But two
*type-level* members of the public contract name DOM types directly:

- `OverlaySpec.render: (ctx) => HTMLElement | string | Node`
- `MediaAdapter` / `MountedMedia` — `element: HTMLElement`, `mount(item, slot: HTMLElement, …)`

These are type-only (the core never touches the DOM), so the headless / zero-dep invariant holds.
But they do bake "the renderer target is the DOM" into the contract that ships frozen-ish at 1.0. A
hypothetical future canvas / native / SSR-string renderer could not satisfy `render: () => HTMLElement`.

## Decision

For v1, the core overlay and media-adapter contract is **explicitly DOM-targeted**. We accept that
the only shipped renderer is `@gallerist/renderer-dom` and that overlays/adapters return DOM nodes.

We are launching at **0.x** (see the version decision), so the public surface is not yet frozen:
if and when a non-DOM renderer is built, we can generalize the contract (e.g. parameterize as
`OverlaySpec<TNode = Node>` and a renderer-supplied node type) in a later minor without the pressure
of a 1.0 major. We deliberately do **not** pre-generalize now — speculative generality for a renderer
that doesn't exist would complicate the contract every real (DOM) consumer uses.

## Consequences

- The `render`/`element`/`mount` DOM types stay as-is for v1; documented here as intentional.
- A future non-DOM renderer is a known, non-breaking-at-0.x extension point, not an oversight.
- The headless core keeps its zero-runtime-dep, DOM-free guarantee regardless (these are types only).
