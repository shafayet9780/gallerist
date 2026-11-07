---
"@gallerist/theme-default": minor
"@gallerist/plugin-thumbnails": minor
---

**theme-default (new):** `--gallerist-thumb-badge-inset-block` places an item thumb's badge
(plugin-thumbnails `renderItemBadge`): its `inset-block` from the thumb's image, `3px auto` (the top
end corner, as before). `.gallerist { --gallerist-thumb-badge-inset-block: auto 3px; }` puts it in the
image's bottom end corner, for a screenshot reviewer whose thumbs' tops hold the window titles. It is
measured from the image, not the thumb, so a caption band under the image stays clear, in every skin,
right to left, on flat and stacked rails, in the peek and on a phone. Nothing else sits in that corner.

**plugin-thumbnails (docs):** `renderItemBadge` documents the token.

Upgrading: an item thumb (`.gallerist-thumb-item`) is a one-column grid (was a flex column), so the
badge can be placed in its image's row; its image and caption band lay out as before. A page that
styled an item thumb's children as flex items (`order`, `flex-grow`) sets `display: flex;
flex-direction: column` on `.gallerist-thumb-item` to keep them.
