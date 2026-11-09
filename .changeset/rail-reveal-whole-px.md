---
"@gallerist/plugin-thumbnails": patch
---

**plugin-thumbnails (fixed):** stepping along a rail whose cards and groups have fractional widths
(a host's group meta of fractional width, Apploye's after its activity meter left the label line) no
longer leaves the card ahead cut by more than 1px at the rail's edge. A step's reveal scrolls in whole
px (WebKit drops a scroll's fraction) and the re-window after it, dropping the cards far behind,
holds what shows in place in whole px too, carrying the fraction it leaves out to the next one. The
reveal rounded on its own and left that carry as it was, so the re-window made up a fraction owed from
before the reveal on top of its own rounding and the reveal's: on a 390px phone at 2x the next
timeframe's first screen, brought just inside the edge, ended 1.1px past it (as much as 1.5px could
add up). The reveal now owes its own fraction in the carry's place, so the two land within half a px
of where the reveal aims. And where the cards that should show overrun the rail by under a px (they
count as fitting), both ends now share it, rather than the card at the far end showing whole and the
other, the card ahead when stepping back, taking all of it and the rounding.
