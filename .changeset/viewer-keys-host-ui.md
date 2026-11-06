---
"@gallerist/renderer-dom": minor
---

**The viewer leaves a key a host already took.** Any key a handler inside the viewer already took
with `preventDefault()` does nothing in the viewer (until now only Escape was checked), so a host
popover in the caption can walk its own list with the arrows and close itself on Escape before the
viewer closes. Keys typed in a text field inside the viewer stay there, as before.
