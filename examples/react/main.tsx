import type { Collection } from '@visora/core'
import { Visora } from '@visora/react'
import '@visora/theme-default/visora.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

const svg = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect width="100%" height="100%" fill="${color}"/><text x="60" y="160" fill="white" font-size="130" font-family="sans-serif">${label}</text></svg>`,
  )}`

const collection: Collection = {
  groups: [
    {
      id: 'g0',
      items: [
        {
          id: 'a0',
          type: 'image',
          source: svg('#2980b9', 'A·1'),
          naturalSize: { w: 2400, h: 1600 },
        },
        {
          id: 'a1',
          type: 'image',
          source: svg('#27ae60', 'A·2'),
          naturalSize: { w: 2400, h: 1600 },
        },
      ],
    },
    {
      id: 'g1',
      items: [
        {
          id: 'b0',
          type: 'image',
          source: svg('#c0392b', 'B·1'),
          naturalSize: { w: 2400, h: 1600 },
        },
      ],
    },
  ],
}

function App() {
  const [open, setOpen] = useState(false)
  return (
    <main>
      <h1>Visora — React adapter</h1>
      <button type="button" className="open" onClick={() => setOpen(true)}>
        Open viewer
      </button>

      <Visora collection={collection} loop open={open} onClose={() => setOpen(false)}>
        {/* JSX into a renderer region (portal bridge) */}
        <Visora.Region name="toolbar">
          <span className="vbadge">React toolbar</span>
        </Visora.Region>
        {/* JSX as an image-space overlay (counter-scales with zoom) */}
        <Visora.Overlay anchor={{ kind: 'point', x: 0.5, y: 0.5 }}>
          <div style={{ fontSize: 28 }}>📍</div>
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
