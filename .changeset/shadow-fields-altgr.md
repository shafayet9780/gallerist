---
"@gallerist/renderer-dom": minor
"@gallerist/plugin-shortcuts": minor
---

**Keys from a field in a shadow root, and keys typed with AltGr.** A text field inside an open shadow
root in the viewer (a host's web component) keeps its keys, as a field in the light DOM always did: the
viewer reads the event's first target, not the shadow host. A plugin's key typed with AltGr (Ctrl + Alt
on Windows, as `?` is on some layouts) reaches the plugin instead of being taken for a browser chord.
