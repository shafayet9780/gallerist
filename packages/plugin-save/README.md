# @gallerist/plugin-save

Gallerist plugin — download the current item, a whole group, or a bulk zip.

This is the download plugin. Its package is named `plugin-save` because npm doesn't allow the word
"download" in package names; the plugin itself is still `download()`.

Part of [Gallerist](https://github.com/shafayet9780/gallerist#readme) — a headless, framework-agnostic media viewer for grouped / nested galleries with image-space overlays and virtualized rendering.

## Install

```bash
npm i @gallerist/plugin-save
```

## Usage

```ts
import { createViewer } from '@gallerist/core'
import { download } from '@gallerist/plugin-save'
import { mount } from '@gallerist/renderer-dom'

const viewer = createViewer({ groups, plugins: [download()] })
mount(viewer)
```

A download button joins the toolbar, and `d` saves the current item.

| Option | Default | |
|---|---|---|
| `downloadUrl(item)` | the item's source | the file to save: a URL (e.g. the full-resolution original where `source` is a display size), `null` for an item that can't be downloaded, `undefined` for its source |
| `key` | `'d'` | the keyboard shortcut |
| `strings` | English | the button's label (`download`), for translation; defaults in `DEFAULT_DOWNLOAD_STRINGS` |

```ts
interface Shot {
  originalUrl?: string
  redacted?: boolean
}

download({
  // screenshots show a compressed JPEG: save the original PNG, and nothing for a redacted shot
  downloadUrl: (item) => {
    const shot = item.meta as Shot | undefined
    return shot?.redacted ? null : shot?.originalUrl
  },
})
```

Only `http:`, `https:` and `blob:` URLs (and relative ones, judged as http whatever the page's own
scheme, so they work on `file:` and app pages too) are saved. When the current item has none
(no source URL, a `data:`, `javascript:` or `file:` URL, a tiled source, or `downloadUrl` returned
`null`), the button is marked unavailable (`aria-disabled="true"`, dimmed by the theme) and `d` does
nothing; the state follows the item as you navigate. The button stays focusable, so focus never drops
out of the viewer. A source with a `loader` counts as downloadable; it resolves on click.

The browser saves through a link with the `download` attribute, which it honours for same-origin URLs
only. A cross-origin URL opens in a new tab instead of saving (the host page stays where it is) unless
its server sends `Content-Disposition: attachment`.

## Several items and zips

```ts
import { downloadGroup, downloadItems } from '@gallerist/plugin-save'

await downloadGroup(viewer.getCollection().groups[0]) // one file per item
await downloadItems(items, { zip: true, zipName: 'review.zip', downloadUrl })
```

| `ZipOptions` | |
|---|---|
| `zip` | bundle into one zip instead of one download per item |
| `zipName` | the zip's file name (default `gallerist.zip`) |
| `downloadUrl` | as for the plugin |
| `signal` | an `AbortSignal` that cancels the fetches |

Without `zip`, each item is saved through its own link, one after another. Same-origin (and `blob:`)
URLs all save. Cross-origin URLs each open a new tab, and only the first comes straight from the click:
the rest open after awaits, without user activation, so a popup blocker usually stops them. For several
cross-origin files, use `zip: true` (it needs CORS) or a `downloadUrl` that points at your own origin
(a proxy).

Zip mode fetches every file (so cross-origin URLs need CORS), skips the ones that fail, and saves
nothing when none succeeded. It loads [`client-zip`](https://github.com/Touffy/client-zip), a
dependency of this package, with a dynamic `import()`, so it costs nothing until the first zip; if
that chunk can't load, it falls back to one download per item. File names come from the URL (or the
item's id) and are sanitized, so a name can't climb out of the zip's folder.

Also exported: `downloadItem(item, downloadUrl?)`, `resolveDownloadUrl(item, downloadUrl?)`,
`urlOf(source)`, `safeHref(url)`, `filenameOf(item, url)` and `sanitizeName(name)`.

Full docs: the [monorepo README](https://github.com/shafayet9780/gallerist#readme) and [`docs/`](https://github.com/shafayet9780/gallerist/tree/main/docs).

## License

MIT © Shafayet Ahmmed
