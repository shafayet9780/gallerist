---
"@gallerist/renderer-dom": minor
"@gallerist/theme-default": minor
"@gallerist/core": minor
---

**renderer-dom (changed):** an item's `placeholder` now shows. It is drawn at once in the box the
image will paint in (from `naturalSize`, else the placeholder image's own shape, else
`--gallerist-media-ratio`): an image URL or data URI blurred and clipped to that box, a colour as a
flat fill. The image fades in over it and the blur clears. A load still running after 400ms shows a
quiet pill in the box's bottom end corner, "Loading full size…" (a polite `role="status"` line, empty
until that delay, so a fast load neither shows nor says it). A failed load keeps the image placeholder, sharp, and the pill says
"Couldn't load full size" with a Retry button that loads the item afresh (focus on it goes to the
viewer, and back to the new Retry if the load fails again while focus is still there). A colour
placeholder gets no pill. With no placeholder, a skeleton fills the box after 300ms, gone at once
when the image is in (a failure still shows the error card). New strings:
`loadingFull`, `loadFailed`, `retry`. Adapters get `strings` and `retry()` in their context
(`DomAdapterCtx`). Pass the thumbnail URL the page already loaded as `placeholder`: it is cached, so
moving between items never flashes an empty stage. With reduced motion the placeholder isn't
blurred, nothing shimmers or spins, and the image still fades in (it no longer cuts in).

**theme-default (new):** `--gallerist-placeholder-blur` (6px), `--gallerist-dur-reveal` (150ms, the
image's fade-in; was 180ms), `--gallerist-media-ratio` (`3 / 2`), `--gallerist-loading-delay` (400ms).
The Console and Gallery dark skeleton shimmer is brighter (`--gallerist-shimmer` 9% / 8%, was 5% /
6%). `.gallerist-content` is a size container (`container-type: size`).

**core (docs):** `Item.placeholder` documents what it takes and how it shows.

Upgrading: a `placeholder` that never showed (it was painted on the image while the image was still
hidden) now shows while the image loads: an image placeholder blurred in the image's box, a colour
filling that box. Check that it is the same picture as the image (a thumbnail of it), or drop it.
The full-stage shimmer that started 600ms into a slow load is gone: the skeleton, the placeholder
and the pill take its place. A string placeholder is a colour when it reads as one (`#…`, a name,
`rgb(…)` and other functions) and the browser parses it as one (`CSS.supports('color', …)`),
otherwise an image URL (a bare `thumb.jpg` or `thumb` is now a URL; `rgb(0 0 0 / 50%)` is now a
colour). `Strings` has three new required members, `loadingFull`, `loadFailed` and `retry`:
`mount(viewer, { strings })` takes a partial set and fills them in, but code that builds a whole
`Strings` object itself (a typed translation table) must add them.
