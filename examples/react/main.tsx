import type { Collection, Item } from '@visora/core'
import { download } from '@visora/plugin-download'
import { fullscreen } from '@visora/plugin-fullscreen'
import { grid } from '@visora/plugin-grid'
import { hash } from '@visora/plugin-hash'
import { thumbnails } from '@visora/plugin-thumbnails'
import { type PresetName, Visora, resolvePreset } from '@visora/react'
import '@visora/theme-default/visora.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

// A work-session reviewer: groups are time buckets (the ←/→ axis), items are the screens captured
// then (the ↑/↓ axis). The under-thumbnail caption is the single label slot (time + title here).
type Theme = 'amber' | 'cyan' | 'vermilion'

const shot = (seed: string, alt: string, caption?: string): Item => ({
  id: seed,
  type: 'image',
  source: `https://picsum.photos/seed/${seed}/1600/1000`,
  thumb: `https://picsum.photos/seed/${seed}/360/225`,
  alt,
  caption,
  naturalSize: { w: 1600, h: 1000 },
})

const bucket = (
  id: string,
  time: string,
  label: string,
  shots: [string, string?][],
): Collection['groups'][number] => ({
  id,
  // caption is the under-thumbnail label — fold the timestamp into it (no separate time-ribbon)
  caption: `${time} · ${label}`,
  items: shots.map(([alt, caption], i) => shot(`${id}-${i + 1}`, alt, caption)),
})

const collection: Collection = {
  groups: [
    bucket('standup', '09:02', 'Standup', [['Kanban board'], ['Sprint burndown', 'Behind on QA']]),
    bucket('design', '09:48', 'Design review', [
      ['Figma frame'],
      ['Component specs', 'Spacing tokens off'],
      ['Color tokens'],
    ]),
    bucket('focus', '10:30', 'Focus block', [['Editor — refactor']]),
    bucket('call', '11:15', 'Customer call', [
      ['Slide deck'],
      ['Q&A notes'],
      ['Roadmap'],
      ['Pricing', 'Flagged for follow-up'],
    ]),
    bucket('build', '13:05', 'Build & ship', [['CI pipeline', 'All green'], ['Test report']]),
    bucket('idle', '14:20', 'Idle', [['Lock screen']]),
  ],
}

const PRESETS: PresetName[] = ['reviewer', 'filmstrip', 'immersive', 'contact']
const THEMES: Theme[] = ['amber', 'cyan', 'vermilion']

const BLURB: Record<PresetName, string> = {
  reviewer: 'bottom timeline rail · corner arrows · labels under each screen',
  filmstrip: 'classic bottom rail · side arrows · persistent chrome',
  immersive: 'rail hidden (press t / hover) · chrome auto-hides on idle',
  contact: 'rail along the top · pairs with the grid (press g)',
}

function App() {
  const [open, setOpen] = useState(() => /(?:^|[#&])g=/.test(window.location.hash))
  const [preset, setPreset] = useState<PresetName>('reviewer')
  const [theme, setTheme] = useState<Theme>('amber')
  const t = resolvePreset(preset).thumbnails

  return (
    <main>
      <p className="eyebrow">Headless · framework-agnostic · 60fps</p>
      <h1>Visora</h1>
      <p className="lede">
        A nested media viewer for grouped collections. Walk the timeline with ←/→, drop into a
        bucket's screens with ↑/↓, and the rail mirrors exactly what's on stage.
      </p>

      <div className="controls">
        <label>
          Preset
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetName)}>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Accent
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            {THEMES.map((th) => (
              <option key={th} value={th}>
                {th}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="open" onClick={() => setOpen(true)}>
          Open reviewer
        </button>
      </div>

      <p className="preset-note">{BLURB[preset]}</p>

      <p className="hint">
        ←/→ timeline · ↑/↓ screens · <kbd>t</kbd> hide rail · <kbd>g</kbd> grid · <kbd>f</kbd>{' '}
        fullscreen · <kbd>d</kbd> download · <kbd>Esc</kbd> close. The URL deep-links the current
        screen — copy it and reload.
      </p>

      <Visora
        key={preset} // preset is a mount-time layout → remount on change
        collection={collection}
        loop
        open={open}
        onClose={() => setOpen(false)}
        preset={preset}
        theme={theme}
        plugins={[thumbnails({ itemAxis: t.itemAxis }), grid(), fullscreen(), download(), hash()]}
      >
        <Visora.Region name="toolbar">
          <span className="vbadge">{preset}</span>
        </Visora.Region>
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
