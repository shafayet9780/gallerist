import './site.css'
import { marked } from 'marked'
import start from '../../docs/GETTING-STARTED.md?raw'
import authoring from '../../docs/PLUGIN-AUTHORING.md?raw'
import presets from '../../docs/PRESETS.md?raw'
import cdn from '../../packages/cdn/README.md?raw'
import grid from '../../packages/plugin-grid/README.md?raw'
import pins from '../../packages/plugin-pins/README.md?raw'
import thumbnails from '../../packages/plugin-thumbnails/README.md?raw'
import react from '../../packages/react/README.md?raw'
import theme from '../../packages/theme-default/README.md?raw'

const REPO = 'https://github.com/shafayet9780/gallerist/blob/main/'

interface Page {
  slug: string
  title: string
  /** path in the repo, which relative links in the page resolve against */
  path: string
  source: string
}

const PAGES: Page[] = [
  { slug: 'start', title: 'Getting started', path: 'docs/GETTING-STARTED.md', source: start },
  { slug: 'presets', title: 'Presets and layout', path: 'docs/PRESETS.md', source: presets },
  {
    slug: 'theme',
    title: 'Skins and tokens',
    path: 'packages/theme-default/README.md',
    source: theme,
  },
  { slug: 'react', title: 'React', path: 'packages/react/README.md', source: react },
  { slug: 'cdn', title: 'Script tag and links', path: 'packages/cdn/README.md', source: cdn },
  {
    slug: 'thumbnails',
    title: 'Thumbnails plugin',
    path: 'packages/plugin-thumbnails/README.md',
    source: thumbnails,
  },
  { slug: 'grid', title: 'Grid plugin', path: 'packages/plugin-grid/README.md', source: grid },
  { slug: 'pins', title: 'Pins plugin', path: 'packages/plugin-pins/README.md', source: pins },
  {
    slug: 'authoring',
    title: 'Writing a plugin',
    path: 'docs/PLUGIN-AUTHORING.md',
    source: authoring,
  },
]

const nav = document.getElementById('doc-nav') as HTMLElement
const doc = document.getElementById('doc') as HTMLElement

for (const page of PAGES) {
  const link = document.createElement('a')
  link.href = `#${page.slug}`
  link.textContent = page.title
  nav.append(link)
}

const resolve = (from: string, href: string) => new URL(href, `https://r/${from}`).pathname.slice(1)

// Links between these pages stay on the site; anything else in the repo goes to GitHub.
function rewriteLinks(page: Page) {
  for (const a of doc.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? ''
    if (/^(https?:|mailto:|#)/.test(href)) continue
    const [file, hash] = href.split('#')
    const path = resolve(page.path, file ?? '')
    const target = PAGES.find((p) => p.path === path)
    a.href = target ? `#${target.slug}` : `${REPO}${path}${hash ? `#${hash}` : ''}`
  }
}

function show(first = false) {
  const slug = location.hash.slice(1)
  const page = PAGES.find((p) => p.slug === slug) ?? (PAGES[0] as Page)
  // our own markdown, from this repo, at build time
  doc.innerHTML = marked.parse(page.source, { async: false })
  rewriteLinks(page)
  // wide code scrolls, so a keyboard has to be able to reach it
  for (const pre of doc.querySelectorAll('pre')) pre.tabIndex = 0
  document.title = `${page.title}: Gallerist docs`
  for (const link of nav.querySelectorAll('a')) {
    if (link.getAttribute('href') === `#${page.slug}`) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  if (!first) {
    window.scrollTo(0, 0)
    doc.focus({ preventScroll: true })
  }
}
addEventListener('hashchange', () => show())
show(true)
