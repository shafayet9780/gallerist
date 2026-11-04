// URL scheme allow-listing for plugins that turn data into links or downloads (pins, download).

/**
 * `url` when it parses to one of `schemes` (e.g. `['https:']`), else null. A relative URL resolves
 * against a fixed http base, never the page's own URL: that may be `file:`, an app scheme
 * (`capacitor:`, `app:`) or `about:srcdoc`, where it would be rejected or fail to parse. So a
 * relative URL counts as http(s) and is kept as given.
 */
export function safeUrl(url: string, schemes: readonly string[]): string | null {
  try {
    return schemes.includes(new URL(url, 'http://localhost/').protocol) ? url : null
  } catch {
    return null
  }
}
