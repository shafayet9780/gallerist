import type { Collection, Item, ItemMemory } from '@gallerist/core'
import { fullscreen } from '@gallerist/plugin-fullscreen'
import { grid } from '@gallerist/plugin-grid'
import { hash } from '@gallerist/plugin-hash'
import { download } from '@gallerist/plugin-save'
import { thumbnails } from '@gallerist/plugin-thumbnails'
import { video } from '@gallerist/plugin-video'
import { videoYouTube } from '@gallerist/plugin-video-youtube'
import {
  type ArrowLayout,
  type ColorScheme,
  Gallerist,
  type PresetName,
  type RailPlacement,
  resolvePreset,
} from '@gallerist/react'
import '@gallerist/theme-default/gallerist.css'
import '@gallerist/theme-default/console.css'
import '@gallerist/theme-default/editorial.css'
import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

// A single playground for every Gallerist knob. Groups are time buckets (the ←/→ axis); items are the
// screens captured then (the ↑/↓ axis). Each control maps to a real option on <Gallerist>, the core
// viewer, or the thumbnails plugin — flip them and re-open to feel the difference.

type SkinName = 'gallery' | 'console' | 'editorial'
// '' = the skin's own default scheme (dark for Gallery and Console, the light wall for Editorial)
type SchemeOpt = ColorScheme | ''
type GroupDisplay = 'stacked' | 'flat' | 'index'
type ItemAxis = 'vertical' | 'horizontal'
type AutoHide = 'auto' | 'on' | 'off'
type LinearOpt = 'auto' | 'on' | 'off'
type Opt<T> = T | 'auto'

// Local tech photos (served from examples/react/public/photos) so the playground works fully
// offline — no dependency on an external image service. Cycled across items at module load.
const PHOTOS = ['tech-01', 'tech-02', 'tech-03', 'tech-04', 'tech-05', 'tech-06']
let photoN = 0

const shot = (seed: string, alt: string, caption?: string): Item => {
  const photo = PHOTOS[photoN++ % PHOTOS.length]
  return {
    id: seed,
    type: 'image',
    source: `/photos/${photo}.jpg`,
    thumb: `/photos/${photo}-thumb.jpg`,
    alt,
    caption,
    naturalSize: { w: 1600, h: 1000 },
  }
}

const bucket = (
  id: string,
  time: string,
  label: string,
  shots: [string, string?][],
): Collection['groups'][number] => ({
  id,
  caption: `${time} · ${label}`,
  items: shots.map(([alt, caption], i) => shot(`${id}-${i + 1}`, alt, caption)),
})

// Varied group sizes: singletons, a couple of multis (peek + flat shine here), a big one.
const baseGroups: Collection['groups'] = [
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
    ['Action items'],
  ]),
  bucket('build', '13:05', 'Build & ship', [['CI pipeline', 'All green'], ['Test report']]),
  bucket('idle', '14:20', 'Idle', [['Lock screen']]),
]

// Opt-in media group — exercises the video + YouTube adapters (both are type: 'video').
const mediaGroup: Collection['groups'][number] = {
  id: 'media',
  caption: '15:00 · Media',
  items: [
    {
      id: 'yt',
      type: 'video',
      source: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumb: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
      alt: 'YouTube clip',
      caption: 'YouTube embed',
    },
    {
      id: 'mp4',
      type: 'video',
      source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumb: '/photos/tech-06-thumb.jpg',
      alt: 'MP4 clip',
      caption: 'MP4 file',
    },
  ],
}

const PRESETS: PresetName[] = ['reviewer', 'filmstrip', 'immersive', 'contact', 'editorial', 'tour']
const SKINS: SkinName[] = ['gallery', 'console', 'editorial']
// accents are named per skin; the first one is the skin's default
const ACCENTS: Record<SkinName, string[]> = {
  editorial: ['vermilion', 'cobalt'],
  gallery: ['periwinkle', 'mint', 'amber', 'vermilion'],
  console: ['amber', 'cyan', 'vermilion'],
}
const SCHEMES: SchemeOpt[] = ['', 'dark', 'light', 'auto']
const ARROWS: ArrowLayout[] = ['pill-right', 'corner-br', 'dpad', 'split', 'docked']
const RAILS: RailPlacement[] = ['bottom', 'left', 'right', 'hidden']
const MEMORIES: ItemMemory[] = ['reset', 'preserve', 'clamp']
const GROUP_DISPLAYS: GroupDisplay[] = ['stacked', 'flat', 'index']
const AXES: ItemAxis[] = ['vertical', 'horizontal']

const BLURB: Record<PresetName, string> = {
  reviewer: 'bottom timeline rail · corner arrows · labels under each screen',
  filmstrip: 'classic bottom rail · side arrows · persistent chrome',
  immersive: 'rail hidden (press t / hover) · chrome auto-hides on idle',
  contact: 'vertical rail on the right · pairs with the grid (press g)',
  editorial:
    'framed work on a wall · a placard with the item navigator · pairs with skin editorial',
  tour: 'section index beside the stage · labelled ←/→ between sections · framed photos',
}

function App() {
  const [open, setOpen] = useState(() => /(?:^|[#&])g=/.test(window.location.hash))

  // preset + appearance
  const [preset, setPreset] = useState<PresetName>('reviewer')
  const [skin, setSkin] = useState<SkinName>('gallery')
  const [accent, setAccent] = useState('periwinkle')
  const [scheme, setScheme] = useState<SchemeOpt>('')

  // layout overrides (win over the preset; 'auto' = keep the preset default)
  const [arrows, setArrows] = useState<Opt<ArrowLayout>>('auto')
  const [rail, setRail] = useState<Opt<RailPlacement>>('auto')
  const [autoHide, setAutoHide] = useState<AutoHide>('auto')
  const [controls, setControls] = useState(true)

  // core viewer behaviour
  const [loop, setLoop] = useState(true)
  const [itemMemory, setItemMemory] = useState<ItemMemory>('reset')
  const [keepZoomOnNav, setKeepZoomOnNav] = useState(false)
  const [startGroup, setStartGroup] = useState(0)
  // linear traversal: 'auto' couples it to the flat rail; 'on'/'off' force it.
  const [linearOpt, setLinearOpt] = useState<LinearOpt>('auto')

  // thumbnails plugin
  const [groupDisplay, setGroupDisplay] = useState<GroupDisplay>('stacked')
  // 'auto' leaves itemAxis unset, so the preset's rail shows (editorial's numbered row, tour's index)
  const [itemAxis, setItemAxis] = useState<Opt<ItemAxis>>('auto')
  const [overscan, setOverscan] = useState(24)
  const [expandActive, setExpandActive] = useState(true)

  // plugins + composition
  const [pGrid, setPGrid] = useState(true)
  const [pFullscreen, setPFullscreen] = useState(true)
  const [pDownload, setPDownload] = useState(true)
  const [pHash, setPHash] = useState(true)
  const [pMedia, setPMedia] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)

  const def = resolvePreset(preset)
  // linear couples to the flat rail by default; the effective rail decides the on-screen axis labels.
  const linear = linearOpt === 'auto' ? groupDisplay === 'flat' : linearOpt === 'on'
  const effRail = rail === 'auto' ? def.rail : rail
  const vertical = effRail === 'left' || effRail === 'right'

  const collection: Collection = useMemo(
    () => ({ groups: pMedia ? [...baseGroups, mediaGroup] : baseGroups }),
    [pMedia],
  )

  const plugins = useMemo(() => {
    const list = [
      thumbnails({
        groupDisplay,
        itemAxis: itemAxis === 'auto' ? undefined : itemAxis,
        overscan,
        expandActive,
      }),
    ]
    if (pGrid) list.push(grid())
    if (pFullscreen) list.push(fullscreen())
    if (pDownload) list.push(download())
    if (pHash) list.push(hash())
    if (pMedia) {
      list.push(videoYouTube()) // before video(): both match type 'video', YouTube is the specialisation
      list.push(video())
    }
    return list
  }, [groupDisplay, itemAxis, overscan, expandActive, pGrid, pFullscreen, pDownload, pHash, pMedia])

  // <Gallerist> reads collection / core options / plugins / layout at construction + mount time, so a
  // change to any of them needs a fresh instance. skin, accent, scheme + open stay reactive (no remount).
  const mountKey = [
    preset,
    arrows,
    rail,
    autoHide,
    controls,
    loop,
    itemMemory,
    keepZoomOnNav,
    startGroup,
    linearOpt,
    groupDisplay,
    itemAxis,
    overscan,
    expandActive,
    pGrid,
    pFullscreen,
    pDownload,
    pHash,
    pMedia,
    showOverlay,
  ].join('|')

  // axis labels follow the rail orientation; a vertical (left/right) rail swaps the arrows.
  const primary = vertical ? '↑/↓' : '←/→'
  const secondary = vertical ? '←/→' : '↑/↓'
  const keys = [
    linear ? `${primary} all images (linear)` : `${primary} groups`,
    linear ? null : `${secondary} screens`,
    effRail !== 'hidden' && (
      <span key="t">
        <kbd>t</kbd> rail
      </span>
    ),
    groupDisplay === 'stacked' && (
      <span key="e">
        <kbd>e</kbd> items
      </span>
    ),
    pGrid && (
      <span key="g">
        <kbd>g</kbd> grid
      </span>
    ),
    pFullscreen && (
      <span key="f">
        <kbd>f</kbd> fullscreen
      </span>
    ),
    pDownload && (
      <span key="d">
        <kbd>d</kbd> download
      </span>
    ),
    <span key="esc">
      <kbd>Esc</kbd> close
    </span>,
  ].filter(Boolean)

  return (
    <main>
      <p className="eyebrow">Headless · framework-agnostic · 60fps</p>
      <h1>Gallerist playground</h1>
      <p className="lede">
        A nested media viewer for grouped collections. Every control below maps to a real option —
        flip them, hit <strong>Open</strong>, and feel the difference. Walk the timeline with ←/→,
        drop into a bucket's screens with ↑/↓.
      </p>

      <div className="panel">
        <fieldset className="group">
          <legend>Preset &amp; accent</legend>
          <label className="field">
            Preset
            <select
              value={preset}
              onChange={(e) => {
                const next = e.target.value as PresetName
                setPreset(next)
                setGroupDisplay(resolvePreset(next).thumbnails.groupDisplay ?? 'stacked')
              }}
            >
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Skin
            <select
              value={skin}
              onChange={(e) => {
                const next = e.target.value as SkinName
                setSkin(next)
                setAccent(ACCENTS[next][0] as string)
              }}
            >
              {SKINS.map((sk) => (
                <option key={sk} value={sk}>
                  {sk}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Accent
            <select value={accent} onChange={(e) => setAccent(e.target.value)}>
              {ACCENTS[skin].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Scheme
            <select value={scheme} onChange={(e) => setScheme(e.target.value as SchemeOpt)}>
              {SCHEMES.map((sc) => (
                <option key={sc || 'default'} value={sc}>
                  {sc || "skin's default"}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>Layout</legend>
          <label className="field">
            Arrows<span className="def">preset: {def.arrows}</span>
            <select value={arrows} onChange={(e) => setArrows(e.target.value as Opt<ArrowLayout>)}>
              <option value="auto">auto (preset)</option>
              {ARROWS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Rail<span className="def">preset: {def.rail}</span>
            <select value={rail} onChange={(e) => setRail(e.target.value as Opt<RailPlacement>)}>
              <option value="auto">auto (preset)</option>
              {RAILS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Auto-hide chrome<span className="def">preset: {String(def.autoHide)}</span>
            <select value={autoHide} onChange={(e) => setAutoHide(e.target.value as AutoHide)}>
              <option value="auto">auto (preset)</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={controls}
              onChange={(e) => setControls(e.target.checked)}
            />
            Render chrome (controls)
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>Navigation</legend>
          <label className="field">
            Item memory
            <select
              value={itemMemory}
              onChange={(e) => setItemMemory(e.target.value as ItemMemory)}
            >
              {MEMORIES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Start at group
            <select value={startGroup} onChange={(e) => setStartGroup(Number(e.target.value))}>
              {collection.groups.map((g, i) => (
                <option key={g.id} value={i}>
                  {i} · {g.id}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop the axes
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={keepZoomOnNav}
              onChange={(e) => setKeepZoomOnNav(e.target.checked)}
            />
            Keep zoom on nav
          </label>
          <label className="field">
            Linear traversal<span className="def">auto = on with flat</span>
            <select value={linearOpt} onChange={(e) => setLinearOpt(e.target.value as LinearOpt)}>
              <option value="auto">auto (flat)</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>Thumbnails</legend>
          <label className="field">
            Group display
            <select
              value={groupDisplay}
              onChange={(e) => setGroupDisplay(e.target.value as GroupDisplay)}
            >
              {GROUP_DISPLAYS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Item axis
            {groupDisplay === 'flat' ? (
              <span className="def">ignored in flat</span>
            ) : (
              <span className="def">preset: {def.thumbnails.itemAxis}</span>
            )}
            <select
              value={itemAxis}
              disabled={groupDisplay === 'flat'}
              onChange={(e) => setItemAxis(e.target.value as Opt<ItemAxis>)}
            >
              <option value="auto">auto (preset)</option>
              {AXES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Overscan
            <input
              type="number"
              min={0}
              max={200}
              value={overscan}
              onChange={(e) => setOverscan(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={expandActive}
              disabled={groupDisplay === 'flat'}
              onChange={(e) => setExpandActive(e.target.checked)}
            />
            Auto-expand active items (<kbd>e</kbd>)
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>Plugins</legend>
          <label className="check">
            <input type="checkbox" checked={pGrid} onChange={(e) => setPGrid(e.target.checked)} />
            grid (<kbd>g</kbd>)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={pFullscreen}
              onChange={(e) => setPFullscreen(e.target.checked)}
            />
            fullscreen (<kbd>f</kbd>)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={pDownload}
              onChange={(e) => setPDownload(e.target.checked)}
            />
            download (<kbd>d</kbd>)
          </label>
          <label className="check">
            <input type="checkbox" checked={pHash} onChange={(e) => setPHash(e.target.checked)} />
            hash (deep-link URL)
          </label>
          <label className="check">
            <input type="checkbox" checked={pMedia} onChange={(e) => setPMedia(e.target.checked)} />
            video + YouTube (adds a media group)
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>Composition</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
            />
            Viewport overlay (&lt;Gallerist.Overlay&gt;)
          </label>
          <p className="def" style={{ opacity: 0.7 }}>
            The toolbar badge is a &lt;Gallerist.Region name="toolbar"&gt; portal — always on.
          </p>
        </fieldset>
      </div>

      <div className="actions">
        <button type="button" className="open" onClick={() => setOpen(true)}>
          Open viewer
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <p className="preset-note">{BLURB[preset]}</p>
      <p className="hint">
        {keys.map((k, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static legend, order is stable
          <span key={i}>
            {i > 0 ? ' · ' : ''}
            {k}
          </span>
        ))}
        . The URL deep-links the current screen when <code>hash</code> is on — copy it and reload.
      </p>

      <div className="snippet">
        <header>resulting usage</header>
        <pre>
          {usageSnippet({
            preset,
            skin,
            accent,
            scheme,
            arrows,
            rail,
            autoHide,
            controls,
            loop,
            itemMemory,
            keepZoomOnNav,
            startGroup,
            linear,
            groupDisplay,
            itemAxis,
            overscan,
            expandActive,
            pGrid,
            pFullscreen,
            pDownload,
            pHash,
            pMedia,
          })}
        </pre>
      </div>

      <Gallerist
        key={mountKey}
        collection={collection}
        startAt={{ g: startGroup }}
        loop={loop}
        itemMemory={itemMemory}
        keepZoomOnNav={keepZoomOnNav}
        open={open}
        onClose={() => setOpen(false)}
        controls={controls}
        preset={preset}
        skin={skin}
        accent={accent}
        scheme={scheme || undefined}
        arrows={arrows === 'auto' ? undefined : arrows}
        rail={rail === 'auto' ? undefined : rail}
        autoHide={autoHide === 'auto' ? undefined : autoHide === 'on'}
        linear={linear} // flat rail ⇒ linear by default; the Linear control can force it on/off
        plugins={plugins}
      >
        <Gallerist.Region name="toolbar">
          <span className="vbadge">{preset}</span>
        </Gallerist.Region>
        {showOverlay && (
          <Gallerist.Overlay anchor={{ kind: 'viewport', at: 'bottom', offset: [0, -84] }}>
            <span className="vchip">
              overlay · {skin} · {accent}
            </span>
          </Gallerist.Overlay>
        )}
      </Gallerist>
    </main>
  )
}

// Build a copy-pasteable JSX snippet mirroring the live config — the example doubles as docs.
function usageSnippet(c: {
  preset: PresetName
  skin: SkinName
  accent: string
  scheme: SchemeOpt
  arrows: Opt<ArrowLayout>
  rail: Opt<RailPlacement>
  autoHide: AutoHide
  controls: boolean
  loop: boolean
  itemMemory: ItemMemory
  keepZoomOnNav: boolean
  startGroup: number
  linear: boolean
  groupDisplay: GroupDisplay
  itemAxis: Opt<ItemAxis>
  overscan: number
  expandActive: boolean
  pGrid: boolean
  pFullscreen: boolean
  pDownload: boolean
  pHash: boolean
  pMedia: boolean
}): string {
  const thumbOpts = [
    `groupDisplay: '${c.groupDisplay}'`,
    c.groupDisplay === 'flat' || c.itemAxis === 'auto' ? null : `itemAxis: '${c.itemAxis}'`,
    c.overscan !== 24 ? `overscan: ${c.overscan}` : null,
    c.groupDisplay !== 'flat' && !c.expandActive ? 'expandActive: false' : null,
  ].filter(Boolean)
  const plugins = [
    `thumbnails({ ${thumbOpts.join(', ')} })`,
    c.pGrid && 'grid()',
    c.pFullscreen && 'fullscreen()',
    c.pDownload && 'download()',
    c.pHash && 'hash()',
    c.pMedia && 'videoYouTube()',
    c.pMedia && 'video()',
  ].filter(Boolean)
  const props = [
    'collection={collection}',
    c.startGroup !== 0 ? `startAt={{ g: ${c.startGroup} }}` : null,
    `loop={${c.loop}}`,
    c.itemMemory !== 'reset' ? `itemMemory="${c.itemMemory}"` : null,
    c.keepZoomOnNav ? 'keepZoomOnNav' : null,
    `preset="${c.preset}"`,
    c.skin !== 'gallery' ? `skin="${c.skin}"` : null,
    c.accent !== ACCENTS[c.skin][0] ? `accent="${c.accent}"` : null,
    c.scheme ? `scheme="${c.scheme}"` : null,
    c.arrows !== 'auto' ? `arrows="${c.arrows}"` : null,
    c.rail !== 'auto' ? `rail="${c.rail}"` : null,
    c.autoHide !== 'auto' ? `autoHide={${c.autoHide === 'on'}}` : null,
    c.linear ? 'linear' : null,
    c.controls ? null : 'controls={false}',
    'open={open}',
  ].filter(Boolean)
  return `<Gallerist\n  ${props.join('\n  ')}\n  plugins={[\n    ${plugins.join(',\n    ')},\n  ]}\n/>`
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
