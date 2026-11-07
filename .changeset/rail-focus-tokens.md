---
"@gallerist/theme-default": minor
---

**theme-default (new):** five tokens for the rail's current and focused states, each defaulting to
today's look. `--gallerist-label-current` (the accent) and `--gallerist-label-current-weight` (500)
style the current group's label on a flat rail and the current time label on a timeline (its tick
too), so a page whose accent means something else (a Save button) can keep the label neutral.
`--gallerist-thumb-focus-style` (`solid`) is a focused thumb's outline style: `dashed` tells keyboard
focus apart from a solid selection ring. `--gallerist-thumb-focus-offset-current` (2px) moves the
focus ring further out on the current thumb, whose ring sits outside it.
`--gallerist-thumb-focus-opacity` (1) is the opacity of a focused thumb that isn't current: today it
brightens as on hover; `var(--gallerist-thumb-idle-opacity)` keeps it dimmed, so the bright thumb is
always the current one (hover still brightens). A screenshot reviewer's
neutral selection, in a page's CSS:

```css
.gallerist {
  --gallerist-selection: #f5f6f7;
  --gallerist-thumb-active-border: var(--gallerist-rail-bg); /* the 2px dark gap */
  --gallerist-item-ring: 0 0 0 2px var(--gallerist-selection);
  --gallerist-label-current: #f5f6f7;
  --gallerist-label-current-weight: 600;
  --gallerist-focus: #f5f6f7;
  --gallerist-thumb-focus-style: dashed;
  --gallerist-thumb-focus-offset-current: 6px;
  --gallerist-thumb-focus-opacity: var(--gallerist-thumb-idle-opacity);
}
```
