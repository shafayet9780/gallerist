# @gallerist/plugin-zoom

## 0.5.2

## 0.5.1

## 0.5.0

### Minor Changes

- 39a85f6: **plugin-thumbnails (changed):** wherever the current card and the cards either side of it can't all
  show, the rail shows the current card and the next one the way the cursor goes whole, centred
  together, wherever those two fit, whatever lies behind. 0.4.1 did so only where more lay between the
  current card and the one ahead than behind it, and otherwise centred the current card, which cut the
  next one off: on a 390px phone, stepping into a one-screen timeframe whose label line is wider than
  its card (44–48px cut in the e2e fixture), or between evenly spaced cards too wide for three. Where the
  two don't fit either, the current card is still centred; where the three fit, nothing changes.

  **theme-default (changed):** on a phone (`(max-width: 600px) and (pointer: coarse)`, where the rail's
  ‹ › page buttons never show) `--gallerist-rail-fade` is 16px (was 40px), and so is the rail's
  `scroll-padding`. The current card, kept clear of the fade, now leaves room for the card ahead past a
  marker or a wide label (0.4.1 left it cut by what the 40px fade took: 6px in the e2e fixture, 16px in
  Apploye's). A desktop, and a narrow window with a mouse, keep 40px.

  Upgrading: a page that relied on 0.4.1's centring between evenly spaced cards (a narrow index-chip
  rail) sees the current card and the next one centred together instead. A page that wants 0.4.1's
  phone fade sets `--gallerist-rail-fade: 40px` on `.gallerist` (a page's tokens win over the theme's).

## 0.4.1

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
