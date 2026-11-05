---
"@gallerist/theme-default": patch
---

**A docked arrow focused from a keyboard on a touch screen no longer covers the media.** With
`arrows: 'docked'` (the `reviewer` preset) the group arrows are visually hidden on touch, where swipes
navigate, and the stage takes the full width. A keyboard or switch user who tabbed to one (a tablet
with a keyboard, say) got it back at the stage edge, over the image: on a 390×844 phone, over the
start of a full-width screenshot. Now the stage makes room for the arrow only while it has focus, as
much on each side, so letterboxed media holds still: on a landscape screen the gutters a mouse gets;
on a portrait one a band above and below the stage, with the arrows in the bottom band (↑ in the top
one on a vertical group axis). This holds on a stacked rail (the arrows step groups) and a flat one
(they step screens), left to right and right to left. A focused docked arrow also stays above the
zoom minimap, which could cover it on a short stage, with a mouse too.
