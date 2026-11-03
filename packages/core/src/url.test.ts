import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeUrl } from './url'

const WEB = ['http:', 'https:']

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safeUrl', () => {
  it('keeps a URL whose scheme is listed, as given', () => {
    expect(safeUrl('https://h/a.jpg', WEB)).toBe('https://h/a.jpg')
    expect(safeUrl('HTTP://h/a.jpg', WEB)).toBe('HTTP://h/a.jpg')
    expect(safeUrl('mailto:a@b.c', [...WEB, 'mailto:'])).toBe('mailto:a@b.c')
  })

  it('rejects other schemes and unparsable input', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:x', 'data:,x', 'file:///etc/passwd'])
      expect(safeUrl(bad, WEB), bad).toBeNull()
    expect(safeUrl('mailto:a@b.c', WEB)).toBeNull()
    expect(safeUrl('http://[::1', WEB)).toBeNull()
  })

  // the page's own URL can be file:, an app scheme or about:srcdoc (where resolving against it
  // throws): relative URLs are judged against a fixed http base instead
  for (const href of ['file:///app/index.html', 'capacitor://localhost/', 'about:srcdoc']) {
    it(`keeps relative URLs on a ${href.split(':')[0]}: page`, () => {
      vi.stubGlobal('location', { href, protocol: `${href.split(':')[0]}:` })
      expect(safeUrl('a0.jpg', WEB)).toBe('a0.jpg')
      expect(safeUrl('/lamp?id=2', WEB)).toBe('/lamp?id=2')
      expect(safeUrl('#lamp', WEB)).toBe('#lamp')
      expect(safeUrl('javascript:alert(1)', WEB)).toBeNull()
    })
  }
})
