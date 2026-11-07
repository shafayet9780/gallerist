---
"@gallerist/renderer-dom": minor
"@gallerist/plugin-thumbnails": minor
"@gallerist/plugin-shortcuts": minor
---

**renderer-dom (changed):** a plugin's `keymap` is asked before the renderer's own keys, so a plugin
can rebind one for a layout. A handler takes a key with `preventDefault()`, and the renderer then does
nothing with it; otherwise the renderer's own key for it (an arrow, Home/End, `+`/`-`/`0`, `t`, 1–9,
Escape) runs after. A plugin is not asked for a chord (Ctrl, ⌘, Alt; AltGr is fine), a key a handler
took already, a key from a text field (shadow roots too; Escape there is the renderer's alone), an
arrow key from inside a dialog, menu or slider in the viewer or from a menu button (`aria-haspopup`;
the overlay's root, a dialog, doesn't count), and a focused caption band that scrolls keeps ↑/↓ /
Home / End for scrolling first. A host no longer needs a capture-phase listener to take an arrow key.

**plugin-thumbnails (new):** `clusterKeys: true` gives a flat rail's ↑/↓ (a row rail walks with ←/→)
to its clusters: ↓ steps to the next item of the current one's `cluster`, ↑ to the one before,
announced as any step is; at the cluster's end they do what they did. A stacked rail keeps ↑/↓ for its
items; down a side rail, where ↑/↓ walk the rail, the cluster's next item is the walk's next. A
reviewer whose captures span monitors (`cluster: (item, g) => \`${g}:${capture}\``) switches monitors
with ↑/↓ and no keyboard code of its own, and a keyboard user can still scroll a long caption band.

**plugin-shortcuts (new):** lists ↑/↓ "Previous / next in the cluster" while plugin-thumbnails'
`clusterKeys` holds them (`strings.prevNextCluster`).

Upgrading: a plugin keymap entry for one of the renderer's keys used to be ignored (the renderer's
key won); now it runs first, and the renderer's key runs too unless the handler calls
`preventDefault()`. A plugin given a renderer key on purpose (`grid({ key: 't' })`) now toggles both.
A host that took ↑/↓ with a capture-phase `keydown` listener and `preventDefault()` keeps working (the
renderer still leaves a key a handler took); with plugin-thumbnails' `clusterKeys` it can delete it.
A plugin's arrow keys no longer reach it from inside a dialog, menu or slider in the viewer, or from a
menu button.
