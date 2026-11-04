import { type Page, type TestInfo, expect, test } from '@playwright/test'

// Runtime performance harness and regression gate (U17): DOM size at 10k items, per-step DOM churn
// (does item nav rebuild chrome/rail/stage?), open / nav / jump timings, long tasks and JS heap, across
// the real setups (e2e/app/perf.ts). Every number goes to a `perf` annotation and a `PERF {json}`
// stdout line. The gate asserts counts only (elements, nodes created/moved, attribute writes), never
// timings, so it holds on a busy machine. Where a documented limit applies (one huge group's item
// stack draws every item: 1x10000 outside `flat`), the element target is reported, not asserted;
// PERF_GATE=1 asserts it there too.
//
//   pnpm exec playwright test e2e/tests/perf.spec.ts --project=chromium

const GATE = process.env.PERF_GATE === '1'
const NODE_TARGET = 200 // elements live in the viewer at 10k items (spec §27 perf table)
// Presets that draw more per card: a reviewer card carries a timeline label (6-7 elements), a tour
// section row a name, subtitle and count (7). Measured 274 / 233 at 2000x5: these bound regressions.
const PRESET_BOUND: Partial<Record<string, number>> = { reviewer: 300, tour: 260 }
const GRID_BOUND = 300 // the grid's own elements while open (cells or sections drawn so far)

const CONFIGS = ['default', 'reviewer', 'tour', 'grid', 'grid-sections', 'flat'] as const
const SHAPES = ['1x10000', '2000x5', '5000x2'] as const

type Probe = {
  action: string
  ok: boolean
  cursor: { g: number; i: number }
  scriptMs: number
  layoutMs: number
  frameMs: number
  created: number
  /** created outside the item's overlays (its pins, badges): the chrome, the rail, the stage */
  createdChrome: number
  destroyed: number
  moved: number
  attrMutations: number
  textMutations: number
  createdBy: Record<string, number>
  destroyedBy: Record<string, number>
  movedBy: Record<string, number>
  /** the rail's drawn run changed (a card entered or left it) */
  shifted: boolean
}
type Counts = {
  elements: number
  nodes: number
  thumbs: { groups: number; items: number }
  slides: number
  regions: Record<string, number>
}
type Series = {
  n: number
  scriptMean: number
  layoutMean: number
  layoutP95: number
  frameMean: number
  frameP95: number
}

// ── in-page helpers ───────────────────────────────────────────────────────────────────────────
// Installed once per page; everything measured runs inside the page so Playwright round trips don't
// pollute timings.
const install = (page: Page) =>
  page.evaluate(() => {
    type V = {
      next(): void
      prev(): void
      nextItem(): void
      prevItem(): void
      goTo(g: number, i?: number): void
      getState(): { cursor: { g: number; i: number }; phase: string }
    }
    const w = window as unknown as Record<string, unknown> & { viewer: V }
    const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const rootEl = () =>
      document.querySelector<HTMLElement>('.gallerist[data-gallerist-phase]') as HTMLElement
    const label = (n: Node) => {
      if (!(n instanceof Element)) return n.nodeName
      const cls = typeof n.className === 'string' ? n.className.split(' ')[0] : ''
      return `${n.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
    }
    const tally = (nodes: Iterable<Node>) => {
      const out: Record<string, number> = {}
      for (const n of nodes) out[label(n)] = (out[label(n)] ?? 0) + 1
      return Object.fromEntries(
        Object.entries(out)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
      )
    }
    const subtree = (el: Element | null) => (el ? el.querySelectorAll('*').length + 1 : 0)
    const REGIONS = [
      '.gallerist-thumbs-region',
      '.gallerist-thumbs-aside',
      '.gallerist-track',
      '.gallerist-viewport-layer',
      '.gallerist-grid',
      '.gallerist-controls',
      '.gallerist-bar',
      '.gallerist-caption',
      '.gallerist-rail-handle',
    ]
    const counts = () => {
      const root = rootEl()
      let nodes = 0
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
      while (tw.nextNode()) nodes++
      const regions: Record<string, number> = {}
      for (const sel of REGIONS) {
        const all = root.querySelectorAll(sel)
        if (all.length) regions[sel] = [...all].reduce((s, e) => s + subtree(e), 0)
      }
      regions.svg = [...root.querySelectorAll('svg')].reduce((s, e) => s + subtree(e), 0)
      const rail = 'button:not(.gallerist-grid-cell)'
      return {
        elements: subtree(root),
        nodes: nodes + 1,
        thumbs: {
          groups: root.querySelectorAll(`${rail}[data-group]:not([data-item])`).length,
          items: root.querySelectorAll(`${rail}[data-item]`).length,
        },
        slides: root.querySelectorAll('.gallerist-slide').length,
        regions,
      }
    }
    const doAction = (action: string): boolean => {
      const v = w.viewer
      const { g, i } = v.getState().cursor
      const root = rootEl()
      if (action === 'nextItem') v.nextItem()
      else if (action === 'prevItem') v.prevItem()
      else if (action === 'next') v.next()
      else if (action === 'prev') v.prev()
      else if (action.startsWith('goTo:')) {
        const [tg, ti] = action.slice(5).split(',').map(Number)
        v.goTo(tg as number, ti)
      } else if (action === 'clickItemThumb') {
        const btn = root.querySelector<HTMLElement>(
          `button:not(.gallerist-grid-cell)[data-item="g${g}i${i + 1}"]`,
        )
        if (!btn) return false
        btn.click()
      } else if (action === 'clickGroupThumb') {
        // a group card, or (flat rail: no cards) the next group's first item
        const btn = root.querySelector<HTMLElement>(
          `button:not(.gallerist-grid-cell)[data-group="g${g + 1}"]:not([data-item]), button:not(.gallerist-grid-cell)[data-item="g${g + 1}i0"]`,
        )
        if (!btn) return false
        btn.click()
      } else if (action === 'toRailEnd') {
        // the last card wholly inside the rail: a group step from there scrolls the rail, and the
        // run follows (cards enter at one end and leave at the other)
        const rail = root.querySelector<HTMLElement>('.gallerist-thumbs')
        if (!rail) return false
        const box = rail.getBoundingClientRect()
        const down = getComputedStyle(rail).flexDirection.startsWith('column')
        const cards = [
          ...rail.querySelectorAll<HTMLElement>(
            'button[data-group]:not(.gallerist-thumb-expand), button[data-item]',
          ),
        ].filter((c) => {
          const r = c.getBoundingClientRect()
          return r.width > 0 && (down ? r.bottom <= box.bottom : r.right <= box.right)
        })
        const last = cards.at(-1)
        const id = last?.dataset.group ?? last?.dataset.item?.split('i')[0]
        if (!id) return false
        v.goTo(Number(id.slice(1)), 0)
      } else if (action === 'nextPastEdge') v.next()
      else if (action === 'startTour') {
        const btn = root.querySelector<HTMLElement>('.gallerist-grid-start')
        if (!btn) return false
        btn.click()
      } else if (action === 'toggleGrid') {
        const btn = root.querySelector<HTMLElement>('.gallerist-grid-toggle')
        if (!btn) return false
        btn.click()
      } else throw new Error(`unknown action ${action}`)
      return true
    }
    // One step under a MutationObserver: what was created, destroyed or moved (re-inserted, same
    // node), and how long the step took to script, to lay out, and to reach the next frame.
    const probe = async (action: string) => {
      const root = rootEl()
      const before = [...root.querySelectorAll('*')]
      const known = new WeakSet<Element>(before)
      const removedNodes: Node[] = []
      let attrMutations = 0
      let textMutations = 0
      const take = (recs: MutationRecord[]) => {
        for (const r of recs) {
          if (r.type === 'attributes') attrMutations++
          else if (r.type === 'characterData') textMutations++
          else {
            for (const n of r.removedNodes) removedNodes.push(n)
            for (const n of r.addedNodes) if (n.nodeType === Node.TEXT_NODE) textMutations++
          }
        }
      }
      // the drawn run: the first and last card in the rail
      const runOf = () => {
        const cards = root.querySelectorAll<HTMLElement>(
          '.gallerist-thumbs [data-group]:not(.gallerist-thumb-expand), .gallerist-thumbs [data-item]',
        )
        const id = (c?: HTMLElement) => c?.dataset.item ?? c?.dataset.group
        return `${id(cards[0])}..${id(cards[cards.length - 1])}`
      }
      const runBefore = runOf()
      const mo = new MutationObserver(take)
      mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
      const t0 = performance.now()
      const ok = doAction(action)
      const t1 = performance.now()
      void root.getBoundingClientRect().width // force style + layout
      const t2 = performance.now()
      await raf()
      await raf()
      const t3 = performance.now()
      await sleep(120) // async follow-ups (image load, microtask-deferred region moves)
      take(mo.takeRecords())
      mo.disconnect()
      const created = [...root.querySelectorAll('*')].filter((e) => !known.has(e))
      const destroyed = before.filter((e) => !root.contains(e))
      const moved = [
        ...new Set(removedNodes.filter((n) => n instanceof Element && root.contains(n))),
      ]
      return {
        action,
        ok,
        cursor: w.viewer.getState().cursor,
        scriptMs: t1 - t0,
        layoutMs: t2 - t0,
        frameMs: t3 - t0,
        created: created.length,
        createdChrome: created.filter(
          (e) => !e.closest('.gallerist-overlays-content, .gallerist-viewport-layer'),
        ).length,
        destroyed: destroyed.length,
        moved: moved.length,
        attrMutations,
        textMutations,
        createdBy: tally(created),
        destroyedBy: tally(destroyed),
        movedBy: tally(moved),
        shifted: runOf() !== runBefore,
      }
    }
    const stats = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b)
      const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
      const p95 = s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? 0
      return { mean, p95 }
    }
    // n steps forward then n back: script time, script + layout, and time to the second frame
    const series = async (fwd: string, back: string, n: number) => {
      const script: number[] = []
      const layout: number[] = []
      const frame: number[] = []
      for (const action of [...Array(n).fill(fwd), ...Array(n).fill(back)] as string[]) {
        const root = rootEl()
        const t0 = performance.now()
        doAction(action)
        const t1 = performance.now()
        void root.getBoundingClientRect().width
        const t2 = performance.now()
        await raf()
        await raf()
        const t3 = performance.now()
        script.push(t1 - t0)
        layout.push(t2 - t0)
        frame.push(t3 - t0)
      }
      const l = stats(layout)
      const f = stats(frame)
      return {
        n: script.length,
        scriptMean: stats(script).mean,
        layoutMean: l.mean,
        layoutP95: l.p95,
        frameMean: f.mean,
        frameP95: f.p95,
      }
    }
    // record when the phase attribute flips, from the click on #open
    const phases: Record<string, number> = {}
    new MutationObserver((recs) => {
      for (const r of recs) {
        // the overlay root gets its phase while detached, then is attached: look at added nodes too
        for (const n of [r.target, ...r.addedNodes]) {
          const ph = n instanceof Element ? n.getAttribute('data-gallerist-phase') : null
          if (!ph || ph === 'closed' || ph in phases) continue
          phases[ph] = performance.now()
          if (ph === 'opening')
            raf().then(() => {
              phases.firstFrame = performance.now()
            })
        }
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-gallerist-phase'],
    })
    document.getElementById('open')?.addEventListener(
      'click',
      (e) => {
        phases.click = e.timeStamp
      },
      { capture: true, once: true },
    )
    // resolves once the viewer's DOM has been quiet for 150ms (the rail re-windows a frame after it
    // scrolls; a busy machine can delay that frame past a fixed sleep)
    const settle = () =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(done, 150)
        const mo = new MutationObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(done, 150)
        })
        const giveUp = setTimeout(done, 3000)
        function done() {
          mo.disconnect()
          clearTimeout(giveUp)
          resolve()
        }
        mo.observe(rootEl(), { subtree: true, childList: true, attributes: true })
      })
    w.__perf = { probe, series, counts, settle, phases }
  })

type PerfApi = {
  probe(a: string): Promise<Probe>
  series(f: string, b: string, n: number): Promise<Series>
  counts(): Counts
  settle(): Promise<void>
  phases: Record<string, number>
}
// call a helper installed by `install`
const call = <K extends keyof PerfApi>(
  page: Page,
  method: K,
  ...args: PerfApi[K] extends (...a: infer A) => unknown ? A : never
) =>
  page.evaluate(
    ([m, a]) => {
      const api = (window as unknown as { __perf: Record<string, (...x: unknown[]) => unknown> })
        .__perf
      return api[m as string]?.(...(a as unknown[]))
    },
    [method, args] as const,
  ) as Promise<Awaited<ReturnType<Extract<PerfApi[K], (...a: never[]) => unknown>>>>
const now = (page: Page) => page.evaluate(() => performance.now())

const longTasks = (page: Page, from: number, to: number) =>
  page.evaluate(
    ([a, b]) => {
      const w = window as unknown as {
        __longtasks: Array<{ start: number; duration: number }>
        __longtaskSupported: boolean
      }
      if (!w.__longtaskSupported) return null
      const hit = w.__longtasks.filter((t) => t.start + t.duration >= a && t.start <= b)
      return {
        count: hit.length,
        totalMs: Math.round(hit.reduce((s, t) => s + t.duration, 0)),
        maxMs: Math.round(Math.max(0, ...hit.map((t) => t.duration))),
      }
    },
    [from, to] as const,
  )

const heapMB = async (page: Page, browserName: string) => {
  if (browserName !== 'chromium') return null
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }
  await cdp.detach()
  return Math.round((usedSize / 1048576) * 10) / 10
}

const report = (info: TestInfo, data: unknown) => {
  info.annotations.push({ type: 'perf', description: JSON.stringify(data) })
  console.log(`PERF ${JSON.stringify(data)}`)
}

test.describe.configure({ mode: 'parallel' })

for (const config of CONFIGS) {
  for (const shape of SHAPES) {
    test(`perf: ${config} @ ${shape}`, async ({ page, browserName }, testInfo) => {
      test.setTimeout(240_000)
      const [groupCount, perGroup] = shape.split('x').map(Number) as [number, number]
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(String(e)))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })

      await page.goto(`/perf.html?config=${config}&shape=${shape}`)
      await page.waitForFunction(() => 'viewer' in window)
      await install(page)
      const heapBefore = await heapMB(page, browserName)

      // ── open ──
      await page.locator('#open').click()
      // 10k items take a while to build on a busy machine: wait longer than the default 5s (the gate
      // is on counts, not on this time)
      await expect(page.locator('.gallerist[data-gallerist-phase="open"]').first())
        .toBeVisible({ timeout: 30_000 })
        .catch(async (e) => {
          const phase = await page.evaluate(() =>
            document.querySelector('.gallerist')?.getAttribute('data-gallerist-phase'),
          )
          console.log(`not open: phase=${phase} errors=${JSON.stringify(errors)}`)
          throw e
        })
      await page.waitForTimeout(300) // let the rail's deferred work land before counting
      await call(page, 'settle')
      const phases: Record<string, number> = {
        ...((await page.evaluate(
          () => (window as unknown as { __perf: PerfApi }).__perf.phases,
        )) as Record<string, number>),
      }
      phases.settled = await now(page)
      const at = (k: string) => phases[k] ?? Number.NaN
      const open = {
        toFirstFrameMs: at('firstFrame') - at('click'),
        toOpeningMs: at('opening') - at('click'),
        toOpenMs: at('open') - at('click'),
        longTasks: await longTasks(page, at('click'), at('settled')),
      }
      const heapOpen = await heapMB(page, browserName)
      const atOpen = await call(page, 'counts')

      // grid configs: the overview/cells are a view of their own; measure it, then go back
      let gridView: { probe: Probe; counts: Counts; navWhileOpen: Probe[]; close: Probe } | null =
        null
      if (config === 'grid' || config === 'grid-sections') {
        const probe = await call(page, 'probe', 'toggleGrid')
        await call(page, 'settle')
        const counts = await call(page, 'counts')
        // cells stay open across navigation (a sections overview closes on any move)
        const navWhileOpen: Probe[] = []
        if (config === 'grid') {
          const [fwd, back] = perGroup > 1 ? ['nextItem', 'prevItem'] : ['next', 'prev']
          navWhileOpen.push(await call(page, 'probe', fwd as string))
          navWhileOpen.push(await call(page, 'probe', back as string))
        }
        const close = await call(page, 'probe', 'toggleGrid')
        gridView = { probe, counts, navWhileOpen, close }
      }
      let tourStart: Probe | null = null
      if (config === 'tour') {
        // the overview opens over the first item; its "Start tour" button leaves it
        tourStart = await call(page, 'probe', 'startTour')
      }
      await call(page, 'settle')
      const afterSetup = await call(page, 'counts')

      // ── per-step churn, from a group in the middle (g=10) ──
      const mid = Math.min(10, groupCount - 1)
      await call(page, 'probe', `goTo:${mid},0`)
      const steps: Probe[] = []
      const run = async (action: string) => {
        const r = await call(page, 'probe', action)
        steps.push(r)
        return r
      }
      if (perGroup > 1) {
        await run('nextItem') // within the group
        await run('prevItem')
        await run('clickItemThumb')
      }
      if (groupCount > 1) {
        await run('next') // across a group boundary
        await run('prev')
        await run('clickGroupThumb')
        // two group steps from the end of what the rail shows: each scrolls the rail by about a
        // card, so between them the run must shift (one alone may stop short of the next card).
        // Far enough in that the run isn't held at the start of the collection.
        await call(page, 'probe', `goTo:${Math.min(60, groupCount - 3)},0`)
        await call(page, 'probe', 'toRailEnd')
        await run('nextPastEdge')
        await run('nextPastEdge')
      }

      // ── latency series (~50 steps each) ──
      const latency: Record<string, Series> = {}
      const t0 = await now(page)
      if (perGroup > 1) latency.item = await call(page, 'series', 'nextItem', 'prevItem', 25)
      if (groupCount > 1) latency.group = await call(page, 'series', 'next', 'prev', 25)
      const t1 = await now(page)
      const navLongTasks = await longTasks(page, t0, t1)

      // ── jump far ──
      const far =
        groupCount > 1
          ? `goTo:${Math.floor(groupCount * 0.8)},0`
          : `goTo:0,${Math.floor(perGroup * 0.8)}`
      const j0 = await now(page)
      const jump = await call(page, 'probe', far)
      const j1 = await now(page)
      const jumpLongTasks = await longTasks(page, j0, j1)
      await call(page, 'settle')
      const afterNav = await call(page, 'counts')
      const heapAfterNav = await heapMB(page, browserName)

      const result = {
        browser: browserName,
        config,
        shape,
        open: { ...open, heapBeforeMB: heapBefore, heapOpenMB: heapOpen },
        atOpen,
        gridView,
        tourStart,
        afterSetup,
        steps,
        latency,
        navLongTasks,
        jump,
        jumpLongTasks,
        afterNav,
        heapAfterNavMB: heapAfterNav,
        errors,
      }
      report(testInfo, result)

      // functional sanity: these must hold regardless of perf
      expect(errors, 'page errors').toEqual([])
      expect(jump.cursor).toEqual(
        groupCount > 1
          ? { g: Math.floor(groupCount * 0.8), i: 0 }
          : { g: 0, i: Math.floor(perGroup * 0.8) },
      )
      for (const s of steps) expect.soft(s.ok, `${s.action} found its target`).toBe(true)

      // ── the gate (counts only) ──
      const limited = perGroup > groupCount * 100 && config !== 'flat' // one huge group's item stack
      const bound = PRESET_BOUND[config] ?? NODE_TARGET
      if (!limited || GATE) {
        const target = limited ? NODE_TARGET : bound
        expect.soft(afterSetup.elements, 'viewer elements after open').toBeLessThan(target)
        expect.soft(afterNav.elements, 'viewer elements after nav').toBeLessThan(target)
      }
      for (const s of steps.filter((x) => x.action.endsWith('Item'))) {
        // an item step may swap the slide window's media (and draw the item's own overlays: the
        // reviewer's pins), never the chrome or the rail
        expect.soft(s.createdChrome, `${s.action} created`).toBeLessThanOrEqual(8)
        // active state moves between two thumbs, whatever the group's size (was 10k writes at 1x10000)
        expect.soft(s.attrMutations, `${s.action} attribute writes`).toBeLessThanOrEqual(40)
      }
      for (const s of steps.filter((x) => /^(next|prev)$|PastEdge$/.test(x.action))) {
        // a group step inserts the cards that enter the rail; the ones that stay aren't re-appended
        expect.soft(s.moved, `${s.action} moved`).toBeLessThanOrEqual(8)
      }
      const pastEdge = steps.filter((x) => x.action === 'nextPastEdge')
      if (pastEdge.length) {
        // the gate above saw the rail's run actually move
        expect
          .soft(
            pastEdge.some((s) => s.shifted),
            'a step past the rail edge shifted the run',
          )
          .toBe(true)
      }
      const gridEls = (c: Counts) => c.regions['.gallerist-grid'] ?? 0
      if (config === 'tour') {
        expect.soft(gridEls(atOpen), 'overview elements at open').toBeLessThan(GRID_BOUND)
      }
      if (gridView) {
        expect.soft(gridEls(gridView.counts), 'grid elements while open').toBeLessThan(GRID_BOUND)
        if (!limited || GATE) {
          expect.soft(gridView.counts.elements, 'with grid open').toBeLessThan(2 * NODE_TARGET + 50)
        }
        for (const s of gridView.navWhileOpen) {
          // a move inside the open cells moves the selection, nothing is redrawn
          expect.soft(s.created, `grid ${s.action} created`).toBeLessThanOrEqual(8)
        }
      }
      if (gridView || config === 'tour') {
        // a closed grid keeps nothing in the document (it redraws on open)
        expect.soft(gridEls(afterSetup), 'grid elements once closed').toBeLessThanOrEqual(1)
        expect.soft(gridEls(afterNav), 'grid elements after nav').toBeLessThanOrEqual(1)
      }
    })
  }
}
