# @gallerist/plugin-thumbnails

Windowed thumbnail rail for [Gallerist](https://github.com/shafayet9780/gallerist#readme). One card per group along the primary (←/→)
axis; the active multi-item group expands into its item thumbs along the secondary (↑/↓) axis.
Windowed + lazy: the rail draws what fits in it plus 3 cards on each side and follows its own scroll,
so a 10k-group gallery keeps about 20 cards in the document. One group's item stack draws all its
items; for a single huge group use `flat`, which is windowed by item.

Three display modes via `groupDisplay`: **`stacked`** (default — collapsed group cards, with a peek
flyout to preview a group without navigating in), **`flat`** (every image side-by-side, each group
under its label, a hairline between groups), and **`index`** (a section index with names and counts).
All stay windowed + lazy.

```ts
import { createViewer } from '@gallerist/core'
import { mount } from '@gallerist/renderer-dom'
import { thumbnails } from '@gallerist/plugin-thumbnails'

const viewer = createViewer({ collection, plugins: [thumbnails()] })
mount(viewer)
```

## Behaviour

- **Reconciles in place.** Cursor moves flip `data-active` and scroll the active node into view (inside the viewer's panels only, never the page) —
  the rail is never torn down on navigation (rebuilt only when the collection or visible window
  changes). This keeps node identity stable and the scroll position steady.
- **Context around the current card.** While the current card and the cards on either side of it
  show whole, the rail doesn't move, so clicking a card in view doesn't shift it. Once one of them
  would be cut off by an edge, the rail scrolls to centre the current card, so a step always shows
  what comes next. At either end of the rail the scroll stops at the first or last card. This applies
  to every rail that scrolls (`flat`, `stacked`, `index` rows and chips, side rails, right to left) and
  to the item column. These scrolls are instant, with no animation, so there is nothing to turn off
  for `prefers-reduced-motion`.
- **Pull, don't scroll.** The rail shows no scrollbar (in every engine). A mouse or pen **drags** it:
  past 5px a press is a drag, which scrolls the rail and never clicks the card it started on; short of
  that it's a click, which selects. While a rail can scroll it shows a grab cursor between its cards,
  and nothing in it is selected or dragged out as an image. Touch keeps the browser's own scrolling.
  A **vertical wheel** scrolls a sideways rail (towards its end, whatever the reading direction) while
  it can go that way; at that end, or when it doesn't scroll, the page gets the wheel. A sideways wheel
  or trackpad swipe, and a pinch, are left to the browser. Each end with more beyond it **fades**
  (`data-gallerist-more-start` / `data-gallerist-more-end` on the rail, the theme's mask, 40px by
  `--gallerist-rail-fade`), on a side rail too. On a sideways rail, **‹ ›** buttons at those ends
  (`.gallerist-rail-page`, in the rail region) show while a mouse is over the rail and page it by 80%
  of its width, gliding unless the user prefers reduced motion; they are out of the tab order and
  hidden from assistive tech, as the keys already walk the rail and bring the current card into view.
  The item column beside the stage drags too, and keeps its scrollbar (it sits on a panel). The
  theme paints the rail's band on the region (`.gallerist-thumbs-region`), so the rail itself can fade
  its ends.
- **Glides open and shut.** Collapsing the rail (its handle, **`t`**, fullscreen) and bringing it back
  animates its height (a side rail's width) over `--gallerist-dur-panel` (220ms), so the stage refits
  smoothly and a zoomed image keeps its view; the item column beside the stage does the same as it
  opens and closes (the items toggle, **`e`**). On its way out a panel is `inert`, then
  `display: none` as before; a collapse that would take the focus with it hands it to the viewer. No
  motion under `prefers-reduced-motion`, or where the browser has no Web Animations.
- **Live-preview card.** The active multi-item group's card mirrors the currently-viewed item's
  image; it reverts to the group cover once the group is no longer active.
- **Vertical item column (default).** The active group's items stack in a column floating above the
  rail, so ↑/↓ moves the highlight up/down — input direction matches visual direction.
- **Count badge** on grouped (multi-item) cards only; **captions** render as a single label band
  **beneath the thumbnail**, only when a string `caption` is provided on the group/item (no `alt`
  fallback — `alt` stays accessibility text). A timestamp is just a caption the host supplies.
- **Active item panel** (`stacked` mode). The active multi-item group auto-expands a panel of its
  item thumbs (`expandActive`, default on). With the default vertical item axis it is a stack in
  the viewer's `aside` column beside the stage (a renderer without that region gets it on the rail
  instead). Hide/show it with the toolbar items-toggle button or the **`e`** key; the state
  persists as you navigate. Phones drop the column and the toggle; the viewer's ↑ · position · ↓
  navigator moves between items there.
- **Peek flyout** (`stacked` mode). Hovering or keyboard-focusing a multi-item card opens a
  transient flyout of its item thumbs — preview a group **without** navigating into it; click a
  thumb to jump straight to it. Hover never moves the cursor. Touch screens have no hover, so a tap
  just navigates and the card shows no peek caret. Inert in `flat` mode
  (every item is already visible); for the active group it defers to the panel unless that panel is
  hidden, in which case hovering the active card peeks too.
- **Flat mode** (`groupDisplay: 'flat'`). Every item of every group renders side-by-side as its own
  card, each group's run wrapped in a `role="group"` element with its label above the items (the
  `timeline` label, else `group.caption`) and a divider between neighbouring groups; on a side rail
  the groups run down the rail, the items in a column. The group holding the current item is marked
  `data-active`, and only its label takes the accent. The label is part of the group's accessible
  name (`strings.groupAt`), and the visible text is `aria-hidden` so it isn't read twice.
  **Item-windowed**, so it stays bounded for huge galleries *and* for a single giant group; a group
  the drawn run cuts is flagged `data-partial-start` / `data-partial-end` (no divider or label on
  the cut side, its card there faded). `itemAxis` is ignored here.
- **Flat means linear.** A flat rail marks its region `data-gallerist-linear`, so the DOM renderer
  defaults to linear traversal while it is mounted: ←/→ walk every item in rail order across groups,
  the counter reads `item N / total` and the ↑/↓ item navigator hides. Pass `linear: false` to
  `mount()` (`linear={false}` in React) to keep the group/item axes.

## Switching the display at run time

```ts
import { getGroupDisplay, setGroupDisplay, thumbnails } from '@gallerist/plugin-thumbnails'

const viewer = createViewer({ collection, plugins: [thumbnails()] })
mount(viewer, { preset: 'reviewer' })
viewer.open()

setGroupDisplay(viewer, 'flat') // → true; every item in one row, ←/→ walk them in order
getGroupDisplay(viewer)         // 'flat'
setGroupDisplay(viewer, 'stacked')
```

`setGroupDisplay(viewer, display)` switches the viewer's mounted rail (`stacked`, `flat` or `index`)
in place. The current item stays current; the rail is drawn again around it (its run, its marks, the
scroll that shows it with its neighbours, the item panel of a stacked or index rail); and the renderer
follows at once: a flat rail turns linear traversal on (unless `mount()` was given `linear`), so the
counter, the item navigator and the arrows change with it. A zoomed image stays zoomed. The switch
counts as an explicit `groupDisplay`, so the preset rules below hold (`reviewer` → `flat` keeps the
timeline, drops the numbering; back to `stacked` brings the numbering back), and an option you passed
to `thumbnails()` still wins. Called before the rail mounts, it sets the display the rail mounts with;
the display also stays for a later mount of the same viewer. With several thumbnails plugins it
switches the last one registered, whose rail shows. It returns `false` when the viewer has no
thumbnails rail, and ignores an unknown display. `getGroupDisplay(viewer)` returns the rail's display,
`undefined` until it has mounted.

The rail keeps the nodes it gave the renderer for every display it can switch to, since the renderer
holds them for the mount: a flat rail keeps its items toggle in the toolbar (`hidden`, and marked
`data-gallerist-off`, so a bar without built-in controls doesn't show for it alone) and, while a
stacked rail would stack its items in the `aside` column, that column (`hidden`, taking no room). A
flat rail doesn't claim `e`, nor does a rail not built yet: another plugin's `e` works there, and
the rail takes it back when it switches to stacked or index. React has a reactive `groupDisplay` prop that does the same, and
[`@gallerist/plugin-view`](../plugin-view/README.md) puts the switch in a View menu.

Without this package's import, the rail is found among the viewer's plugin instances: the instance
named `thumbnails` has `display` and `setDisplay(display)` (`ThumbnailsInstance`).

## Options

```ts
thumbnails({
  overscan: 8,             // optional: a fixed number of cards each side (default: measured)
  itemAxis: 'vertical',    // 'vertical' (default) | 'horizontal' — layout of the active group's items
  groupDisplay: 'stacked', // 'stacked' (default) | 'flat' | 'index'
  expandActive: true,      // auto-expand the active group's item panel (stacked); toggle with `e`
})
```

| Option         | Type                         | Default     | Notes |
|----------------|------------------------------|-------------|-------|
| `overscan`     | `number`                     | measured    | Cards drawn each side of the card in the middle of the rail; scrolling draws the ones it reaches. A jump past the drawn run first draws around the new current card, then the scroll that reveals it trims the run back to the middle. By default what fits plus 3 each side (8 each side before the rail has a layout); a number below half of what fits is raised to it. Group cards in `stacked`/`index`, item cards in `flat`. |
| `itemAxis`     | `'vertical' \| 'horizontal'` | `'vertical'`| `vertical` matches the ↑/↓ input direction; `horizontal` is the legacy inline row. Ignored in `flat`. |
| `groupDisplay` | `'stacked' \| 'flat' \| 'index'` | `'stacked'` | `stacked` collapses each group to one card (peek to preview); `flat` lays every item out side-by-side, grouped under each group's label with a hairline between groups, and makes the renderer's traversal linear by default. The display it starts with; `setGroupDisplay()` changes it later. |
| `expandActive` | `boolean`                    | `true`      | `stacked` and `index`. Auto-show the active multi-item group's item panel; hide/show via the toolbar items-toggle or `e`. Ignored in `flat`. |
| `timeline`     | `boolean \| (group, index) => string` | off | `stacked` and `flat`, the current group's label in the accent. Stacked: a label with a tick above each card, joined into a track. Flat: the label heads each group in place of its caption (a group whose label is `undefined` shows its caption). `true` reads `group.meta.time`. The label joins the card's (flat: the group's) accessible name. |
| `groupDisplay: 'index'` | | | A section index: a row per group with its cover, `group.caption`, `group.meta.subtitle` and item count; the active group's items expand under its row (always as a row, so `itemAxis` doesn't apply, and there's no peek). A bottom rail, or any rail at 900px wide or less, shows chips instead; chips don't expand items. Used by the `tour` preset. |
| `numberItems`  | `boolean`                    | `false`     | Number the item thumbs (1, 2, 3…) so they can be referred to, e.g. "monitor 2". |

Presets configure these for you: with `mount(viewer, { preset })` (or React's `preset` prop) every
option you leave unset takes the preset's value, so `thumbnails()` under `preset: 'reviewer'` gets the
timeline and numbered items; an option you pass wins, key by key (`undefined` counts as unset). One
exception: the preset's `itemAxis` and `numberItems` belong to its own group display, so an explicit
`groupDisplay` other than the preset's starts from the plugin's defaults for those. Its `timeline`
carries over (`groupDisplay: 'flat'` under `reviewer` heads each group with its time). The
options settle when the rail mounts (and again for each new mount, with its preset). See [layout presets](https://github.com/shafayet9780/gallerist/blob/main/docs/PRESETS.md)
for each preset's values. The rail's **position** (bottom/top/hidden) is a renderer option (`rail`),
not a thumbnails option.

## Data

- `group.caption?: string` / `item.caption?: string` — optional label shown beneath the card/thumb.
- `group.thumb` / `item.thumb` — preferred thumbnail source (falls back to the item `source`).
