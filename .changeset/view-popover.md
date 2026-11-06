---
"@gallerist/plugin-view": patch
"@gallerist/theme-default": patch
---

**The View menu is a compact popover with segmented controls.** Layout [Stacked | Row] and Theme
[Dark | Light] (Index and Auto when offered), each segment an icon and a name, the current one raised
on a recessed track with its glyph in the selection colour; the keyboard's segment takes the neutral
focus ring. A choice applies at once and the popover stays open; it follows a host that applies a
controlled choice while it's open. With `@gallerist/plugin-shortcuts` registered, a last row,
"Keyboard shortcuts ?" ("Gestures" on a touch screen), opens the shortcut list. Each setting is now a
radio group (`role="radio"` segments, roving focus) in a non-modal `role="dialog"`, the tool's
`aria-haspopup` is `dialog`: ←/→ (↑/↓) move and choose, mirrored right to left; Space or a click
chooses; Enter chooses and closes; Tab moves between the groups and past either end closes; Escape
closes; `?` opens the shortcut list. The API is unchanged; the default `rail` / `scheme` strings now
read "Layout" / "Theme". New theme tokens: `--gallerist-popover-bg`, `--gallerist-popover-shadow`,
`--gallerist-seg-track`, `--gallerist-seg-on`, `--gallerist-seg-on-shadow`. plugin-view's size budget
goes from 2.4 to 3 kB (2.93 kB).
