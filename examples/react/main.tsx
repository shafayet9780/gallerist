import type { Collection, Item } from '@visora/core'
import { download } from '@visora/plugin-download'
import { fullscreen } from '@visora/plugin-fullscreen'
import { grid } from '@visora/plugin-grid'
import { hash } from '@visora/plugin-hash'
import { thumbnails } from '@visora/plugin-thumbnails'
import { Visora, useViewerContext, useVisora } from '@visora/react'
import '@visora/theme-default/visora.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

// Real photos via Lorem Picsum seed URLs (deterministic, never 404). Full + thumb derivatives.
const photo = (seed: string, alt: string): Item => ({
  id: seed,
  type: 'image',
  source: `https://picsum.photos/seed/${seed}/1600/1067`,
  thumb: `https://picsum.photos/seed/${seed}/320/213`,
  alt,
  naturalSize: { w: 1600, h: 1067 },
})

// Grouped / nested: albums (time axis, ←/→) × photos within an album (screen axis, ↑/↓).
const album = (id: string, title: string, ...alts: string[]): Collection['groups'][number] => ({
  id,
  meta: title,
  items: alts.map((alt, i) => photo(`${id}-${i + 1}`, alt)),
})

const collection: Collection = {
  groups: [
    album('mountains', 'Mountains', 'Ridge at dawn', 'River valley', 'Misty peak', 'Alpine lake'),
    album('city', 'City', 'Skyline', 'Rooftops', 'Night bridge'),
    album('ocean', 'Ocean', 'Open coast', 'Old pier', 'Breaking waves', 'Cliff path', 'Lighthouse'),
    album('forest', 'Forest', 'Trail', 'Canopy', 'Waterfall'),
  ],
}

// Live caption in the footer region — reads engine state via useVisora (useSyncExternalStore).
function Caption() {
  const viewer = useViewerContext()
  const { state } = useVisora(viewer)
  const group = viewer.getCollection().groups[state.cursor.g]
  const item = group?.items[state.cursor.i]
  if (!group || !item) return null
  return (
    <div className="vcaption">
      <strong>{String(group.meta)}</strong> · {item.alt}
      <span className="vpos">
        {state.cursor.i + 1} / {group.items.length}
      </span>
    </div>
  )
}

function App() {
  // initialize open from the URL hash so deep-links (#g=ocean&i=ocean-3) open the viewer on load
  const [open, setOpen] = useState(() => /(?:^|[#&])g=/.test(window.location.hash))
  return (
    <main>
      <h1>Visora</h1>
      <p className="lede">
        Headless, framework-agnostic nested media viewer. Grouped galleries, image-space overlays,
        windowed thumbnails — driven by the React adapter.
      </p>
      <button type="button" className="open" onClick={() => setOpen(true)}>
        Open gallery
      </button>
      <p className="hint">
        ←/→ albums · ↑/↓ photos · scroll/pinch to zoom · <kbd>g</kbd> grid · <kbd>f</kbd> fullscreen
        · <kbd>d</kbd> download · <kbd>Esc</kbd> close. The URL updates as you browse — copy it and
        reload to deep-link.
      </p>

      <Visora
        collection={collection}
        loop
        open={open}
        onClose={() => setOpen(false)}
        plugins={[thumbnails(), grid(), fullscreen(), download(), hash()]}
      >
        {/* JSX portaled into a renderer region (the portal bridge) */}
        <Visora.Region name="toolbar">
          <span className="vbadge">Visora · React</span>
        </Visora.Region>
        {/* live caption in the footer region */}
        <Visora.Region name="footer">
          <Caption />
        </Visora.Region>
        {/* JSX as an image-space overlay — counter-scales as you zoom */}
        <Visora.Overlay anchor={{ kind: 'point', x: 0.5, y: 0.5 }}>
          <div className="vpin">📍 center</div>
        </Visora.Overlay>
      </Visora>
    </main>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
