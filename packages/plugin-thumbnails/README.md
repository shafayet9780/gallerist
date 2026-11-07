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
  what comes next. Where the three can't show together (a marker or a group label wider than its
  cards between them, or cards too wide for three), the rail shows the current card and the next one
  the way you're going whole, centred together, wherever the two fit (0.5; 0.4.1 did so only where
  more lay ahead than behind, and centred the current card otherwise). The current card itself
  always lands clear of the rail's scroll-padding, which the theme sets to the end fade
  (`--gallerist-rail-fade`, where the **‹ ›** buttons sit too), so it is never dimmed or covered;
  where the room is short, the card ahead runs into the far fade instead (0.4.1). On a phone the
  theme's fade is 16px (0.5), so the two fit whole there wherever they'd fit beside 16px. "The next one the way you're going" follows the last step that moved along the rail: a step
  between the items of one group, the items toggle or reopening the viewer keeps it. At either end of
  the rail the scroll stops at the first or last card. This applies to every rail that scrolls (`flat`,
  `stacked`, `index` rows and chips, side rails, right to left) and to the item column, where the item
  ahead is always the next one (the column doesn't track which way you went). These scrolls are
  instant, with no animation, so there is nothing to turn off for `prefers-reduced-motion`.
- **Pull, don't scroll.** The rail shows no scrollbar (in every engine). A mouse or pen **drags** it:
  past 5px along the rail (10px with a pen) a press is a drag, which scrolls the rail and never clicks
  the card it started on; short of that, or across the rail, it's a click, which selects. A press
  that ends off the rail before it was a drag is over at the next move without a button, so hovering
  back never drags. While a rail can scroll it shows a grab cursor between its cards, and nothing in
  it is selected or dragged out as an image: the rail cancels `dragstart` (a host that wants a card
  to be draggable can't use the native drag there). Touch keeps the browser's own scrolling.
  A **vertical wheel** scrolls a sideways rail (towards its end, whatever the reading direction) while
  it can go that way; at that end, or when it doesn't scroll, the page gets the wheel. A sideways wheel
  or trackpad swipe, and a pinch, are left to the browser. Each end with more beyond it (scrolled
  away, or cards not drawn yet: the rail draws a run of them) **fades**
  (`data-gallerist-more-start` / `data-gallerist-more-end` on the rail, the theme's mask, 40px by
  `--gallerist-rail-fade`; the theme's `scroll-padding` on the rail is the same width, so a card
  brought into view, or focused with Tab, lands clear of it), on a side rail too. On a sideways rail, **‹ ›** buttons at those ends
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
  `display: none` as before; a collapse that would take the focus with it (a card in the rail or in
  the item column) hands it to the viewer, while the handle keeps it. No motion under
  `prefers-reduced-motion`, with a `--gallerist-dur-panel` of 0, or where the browser has no Web
  Animations.
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
| `timeline`     | `boolean \| (group, index) => string` | off | `stacked` and `flat`, the current group's label in the accent. Stacked: a label with a tick above each card, joined into a track; a long one widens its card's column (up to three card heights). Flat: the label heads each group in place of its caption (a group whose label is `undefined` shows its caption). `true` reads `group.meta.time`. The label joins the card's (flat: the group's) accessible name. |
| `groupDisplay: 'index'` | | | A section index: a row per group with its cover, `group.caption`, `group.meta.subtitle` and item count; the active group's items expand under its row (always as a row, so `itemAxis` doesn't apply, and there's no peek). A bottom rail, or any rail at 900px wide or less, shows chips instead; chips don't expand items. Used by the `tour` preset. |
| `numberItems`  | `boolean`                    | `false`     | Number the item thumbs (1, 2, 3…) so they can be referred to, e.g. "monitor 2". |
| `renderGroupMeta` | `(group, index, { display, place }) => Node \| string \| null` | none | A host's decoration per group: flat, at the end of its label line; stacked, under the card (and with a `timeline`, at the end of its time label). See [Host decorations](#host-decorations-and-markers). |
| `renderItemBadge` | `(item, g, i) => Node \| string \| null` | none | A host's badge in each item thumb's top end corner. |
| `cluster`      | `(item, g, i) => string \| number \| null` | none | Consecutive items with the same key sit 2px apart, 8px between clusters. Visual, unless `clusterKeys`. |
| `clusterKeys`  | `boolean`                    | `false`     | `flat`: ↑/↓ step to the item before / after the current one in its cluster (another monitor of the same capture). See [Host decorations](#host-decorations-and-markers). |
| `markers`      | `(collection) => RailMarker[]` | none | Entries between groups that are not items (time without screenshots): drawn, never a stop. |

Presets configure these for you: with `mount(viewer, { preset })` (or React's `preset` prop) every
option you leave unset takes the preset's value, so `thumbnails()` under `preset: 'reviewer'` gets the
timeline and numbered items; an option you pass wins, key by key (`undefined` counts as unset). One
exception: the preset's `itemAxis` and `numberItems` belong to its own group display, so an explicit
`groupDisplay` other than the preset's starts from the plugin's defaults for those. Its `timeline`
carries over (`groupDisplay: 'flat'` under `reviewer` heads each group with its time). The
options settle when the rail mounts (and again for each new mount, with its preset). See [layout presets](https://github.com/shafayet9780/gallerist/blob/main/docs/PRESETS.md)
for each preset's values. The rail's **position** (bottom/top/hidden) is a renderer option (`rail`),
not a thumbnails option.

## Host decorations and markers

The rail draws what the host renders for its groups and items, so data the viewer doesn't know about
(activity, notes, a monitor) shows where it belongs. Each function returns a `Node`, a string (shown
as text, never parsed) or `null`/`undefined` (nothing). What it returns is presentational: it sits
inside a card (a button) or a label, hidden from assistive tech, and its text joins the accessible
name instead, a node's `aria-label` if it has one, else its text content. Give a meter or an icon an
`aria-label` ("Activity 64%", "Monitor 2"). Return a fresh node each call.

```ts
import { refreshRail, thumbnails } from '@gallerist/plugin-thumbnails'

thumbnails({
  // flat: the end of the label line · stacked: under the card ('below') and, with a timeline,
  // the end of its time label ('label')
  renderGroupMeta: (group, index, { display, place }) =>
    display === 'stacked' && place === 'label' ? noteCount(group) : activityMeter(group),
  // a thumb's top end corner (numberItems keeps the start)
  renderItemBadge: (item) => monitorBadge(item.meta.screen),
  // the screens of one capture sit together
  cluster: (item) => item.meta.capturedAt,
  // manual time: not a screenshot, so not an item
  markers: (collection) => [
    {
      id: 'manual-42',
      after: 'timeframe-1110', // a group id (or `before: id`)
      caption: 'Manual', // the label line over it
      label: 'Manual time, 11:20 – 11:45, 25 minutes', // its accessible name
      render: () => '✎ 25m', // the box (default: the label)
      tip: () => entryDetails(), // hover, or a long press on touch
    },
  ],
})

// after the host's data changed in place (a note saved):
refreshRail(viewer)
```

- **`renderGroupMeta(group, index, { display, place })`**: `display` is `'flat'` or `'stacked'`
  (an index rail draws none). Flat: `place: 'label'`, at the end of the group's label line; the group
  widens to fit the label and the meta, the label still ending in an ellipsis past three card heights
  (its whole text in its `title` while cut). Stacked: `'below'`, under the card at its width (every card is
  wrapped, so the rail's height grows by that line), and with a `timeline` also `'label'`, at the end
  of the card's time label: a label longer than its card widens the card's column so it shows whole,
  clear of the next card's label, up to three card heights, then ends in an ellipsis (its whole text
  in its `title` while cut); down a side rail it keeps to the rail's width. Called for each group as it is drawn
  (the rail draws only a run of them) and on `refreshRail()`.
- **`renderItemBadge(item, g, i)`**: in each item thumb's top end corner, wherever item thumbs show
  (a flat rail, the item column, the peek, an index section). The `numberItems` number takes the top
  start; the focus ring is outside the thumb.
- **`cluster(item, g, i)`**: consecutive items with the same key (not `null`/`undefined`) sit
  `--gallerist-cluster-inner` apart (2px), with `--gallerist-cluster-gap` (8px) where the key
  changes, in a row and in a column alike. Items without a key keep the plain gap. Traversal, counts
  and names don't change: ↑/↓ (or ←/→ on a flat rail) still step one item at a time, so the other
  monitor of the same capture is the next item. Thumbs carry `data-cluster="in"` (continues the one
  before) or `"start"` (a new one after another).
- **`clusterKeys: true`** (0.5) gives a flat rail's ↑/↓, which a row rail walking with ←/→ leaves
  free, to the clusters: ↓ steps to the next item of the current one's cluster, ↑ to the one before,
  announced as any step is. At the cluster's end (or on an item with no key) ↑/↓ do what they did:
  nothing on a row rail; down a side rail, where ↑/↓ walk it, the cluster's next item is the walk's
  next anyway. A stacked rail keeps ↑/↓ for its items. Through the plugin keymap the renderer asks
  first, so ↑/↓ stay with a focused caption band that scrolls, a text field, and a dialog, menu,
  slider or menu button in the viewer. plugin-shortcuts lists them ("Previous / next in the cluster",
  `strings.prevNextCluster`). A reviewer whose captures span monitors needs no keyboard code of its
  own:
  ```ts
  thumbnails({
    groupDisplay: 'flat',
    cluster: (item, g) => `${g}:${item.meta.capturedAt}`, // the monitors of one capture
    clusterKeys: true, // ↑/↓: the capture's other monitor
  })
  shortcuts({ strings: { prevNextCluster: 'Other monitor, same capture' } })
  ```
- **`markers(collection)`** returns `RailMarker`s: `{ id, after?, before?, label, caption?, render?,
  tip? }`. A marker is drawn after the group `after` names (else before `before`'s), in the order
  given, on flat and stacked rails; one whose group isn't in the collection, or whose `id` an earlier
  marker already has, is not drawn. It is not
  part of the collection: never a stop for the arrows, Home/End or a click, not counted, not in the
  hash, and windowed with its group (drawn when its group's end, or start for `before`, is drawn). It
  is a dashed box the height of the rail's cards under a label line (`.gallerist-rail-marker`, `-cap`,
  `-body`). Read for each new collection and on `refreshRail()`.
- **Markers and assistive tech**: a marker is not focusable. It is information, not an action, and a
  stop that does nothing would cost every keyboard user a key press each time they pass it (the
  reason it isn't an item in the first place). It is a named `role="group"` (the one role a listbox
  holds besides its options) with no option in it, so a screen reader's reading of the rail meets
  its `label`; its text shows in the box. Its `tip` shows while a mouse or pen is over it, and after
  a long press on touch (500ms, until the next press anywhere), in the rail's region (unclipped,
  above or beside the marker, kept inside the viewer) as `role="tooltip"`. Without a `tip` the
  marker's `title` is its `label`. Put what matters in `label`: the tip can't be reached from the
  keyboard.
- **`refreshRail(viewer)`**: draws the decorations and the markers again in place (the cards, the
  thumbs, the scroll and focus stay; a marker's open tip shows again, with the new data). A new collection (`setCollection`) needs no call. The
  instance's `refresh()` does the same.

## Data

- `group.caption?: string` / `item.caption?: string` — optional label shown beneath the card/thumb.
- `group.thumb` / `item.thumb` — preferred thumbnail source (falls back to the item `source`).
