---
"@gallerist/theme-default": patch
"@gallerist/renderer-dom": patch
---

**A docked arrow focused from a keyboard on a touch screen no longer covers the media.** With
`arrows: 'docked'` (the `reviewer` preset) the group arrows are visually hidden on touch, where swipes
navigate, and the stage takes the full width. A keyboard or switch user who tabbed to one (a tablet
with a keyboard, say) got it back at the stage edge, over the image: on a 390×844 phone, over the
start of a full-width screenshot. Now the stage makes room for it only while a group arrow has
keyboard focus, as much on each side, so letterboxed media holds still: on a landscape screen a
gutter at each side; on a portrait one a band above and below the stage, with the arrows in the
bottom band (↑ in the top one on a vertical group axis). Landscape or portrait is the screen's, not
the viewer's. This holds on a stacked rail (the arrows step groups) and a flat one (they step
screens), left to right and right to left. A focused docked arrow also stays above the zoom minimap,
which could cover it on a short stage, with a mouse too.

**Zoomed in, a stage that shrinks and grows back returns to the same view.** The pan was clamped to
the smaller stage and stayed clamped when it grew back: zoomed 2× at a panorama's right edge on a
touch tablet, tabbing past a docked arrow left the view about 140px short of that edge, and a
rotation there and back did the same. Now the part of the image at the stage's centre stays there
through a resize, and the view comes back as it was. That memory is the current item's, against
the box it was clamped to: moving to another item (the zoom carries over within a group) or a load
in between never pans to a view nobody saw, and a stage with no size (hidden) commits nothing and
fires no `zoom` event. Known limitation, as before: a resize in the middle of a pinch, or before a
wheel zoom settles, shows the re-clamped view for a frame, and the gesture then commits from where it
began, in the old stage's pixels (clamped to the new stage), not from the re-clamped view.

**Idle auto-hide no longer fades a control that has keyboard focus**, nor the band (or `immersive`
rail) it is in, so a keyboard user who pauses on one still sees where focus is. A press on the stage
(a click, a tap) moves focus to the viewer, so the chrome fades again; a swipe or pinch moves no
focus, as a page scroll doesn't. Where `:has()` and `:focus-visible` are unsupported (iOS Safari
before 15.4) all of it fades, as before, and the idle rules keep their selectors' specificity, so a
page's own idle style still applies.
