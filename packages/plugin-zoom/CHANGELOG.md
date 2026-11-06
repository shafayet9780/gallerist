# @gallerist/plugin-zoom

## 0.4.0

### Minor Changes

- 8ccd430: **New: `@gallerist/plugin-zoom`.** `zoom()` adds a "− 100% +" tool to the toolbar: zoom out, the
  current zoom (press it to fit the image again), zoom in, through stops of the zoom range (fit, 150%,
  200%, 300%, 400%), pivoting on the stage's centre. The percentage follows a pinch, a wheel or a double
  click as it moves. − and + are unavailable at the ends of the range and while the item can't zoom (a
  video, loading, an error); a zoom from the tool or its keys is announced. While the viewer has
  focus, `+` / `=`, `-` and `0` take the same steps, except where they are someone else's: a text field
  (in a shadow root too), a dialog or menu in the viewer (the View popover), a slider, spinbutton, tree
  or grid, or with a modifier. Stops outside the DOM renderer's range (fit to 400%) are brought into it.
  The renderer's own zoom-reset button stays out of a bar that shows the tool. A phone (600px or less)
  leaves the tool out of the bar (a pinch zooms, and the renderer's reset shows while zoomed);
  `--gallerist-phone-zoom: flex` keeps it, with − and + only. A `hidden` tool stays hidden. Not in the
  `@gallerist/cdn` bundle.
