---
"@gallerist/plugin-zoom": patch
"@gallerist/theme-default": patch
---

**New: `@gallerist/plugin-zoom`.** `zoom()` adds a "− 100% +" tool to the toolbar: zoom out, the
current zoom (press it to fit the image again), zoom in, through stops of the zoom range (fit, 150%,
200%, 300%, 400%), pivoting on the stage's centre. The percentage follows a pinch, a wheel or a double
click as it moves. − and + are unavailable at the ends of the range and while the item can't zoom (a
video, loading, an error). While the viewer has focus, `+` / `=`, `-` and `0` take the same steps
(not in text fields, not with a modifier). The renderer's own zoom-reset button stays out of a bar
that has the tool. A phone (600px or less) leaves the tool out of the bar (a pinch zooms);
`--gallerist-phone-zoom: flex` keeps it, with − and + only. A `hidden` tool stays hidden. Not in the
`@gallerist/cdn` bundle.
