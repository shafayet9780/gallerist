# Visora — Phase 1 Review Fixes (remediation plan)

## Overview

The end-to-end Phase 1 review (`/agent-skills:review`) found **0 Critical, 8 Important, ~13 Suggestions**
across the 8 new packages + core/renderer changes. Foundation is sound (headless invariant compiler-
enforced, portal bridge survives repaints, all gates green: 237 unit, sizes way under). This plan
remediates every finding, TDD per task (RED → GREEN → suite → build → commit), ordered security-first
(fail fast). Target release: **`v0.1.1`** (patch — hardening, no API breaks).

## Architecture decisions (for the fixes)

- **Render-gating without new API.** Thumbnails/grid over-render because `subscribe(render)` fires on
  every committed state change. The store already early-returns on `Object.is` no-ops and exposes
  `select()`. Fix by comparing `cursor.g/i` + collection ref *inside the render closure* (no
  `ViewerApi` surface change, works for any renderer). Keep windowing as the node bound.
- **Security = reject, don't transform.** Scheme/placeholder/filename fixes fail closed (skip/strip),
  never best-effort sanitize into something executable. Single shared helpers where >1 sink.
- **Adapters live, like overlays.** Mirror `currentGlobalOverlays`: make `adapters` a getter computed
  from `viewer.getPlugins()` at selection time, so late `use()` works.
- **Scope discipline.** Region-reconcile, React selector overload + SSR snapshot, and the
  renderer-dom peer→dep change are **deferred to Phase 2** (larger / design-needed / non-blocking) —
  see Deferred. Everything else is in scope now.

## Dependency graph

```
F1 security (download, image)        ── independent, do first (fail fast)
F2 correctness (youtube match, late adapters)
F3 perf/a11y (thumbnails ⇒ grid mirrors it)
F4 react lifecycle (useState ⇒ ids)
F5 robustness (hash, youtube hardening, download zip, core getPlugins, supply chain)
Release: docs + CHANGELOG + tag      ── last, depends on all
```
Tasks within a phase are independent unless noted. Each task leaves the system green.

---

## Phase F1 — Security hardening (highest value, fail fast)

### Task 1: Download — URL scheme allowlist + filename/zip-name sanitization (S)
**Description:** Close the two data-derived sinks in `plugin-download`: an attacker-influenceable
`item.source` reaching `a.href`/`fetch`, and an unsanitized filename reaching the zip central
directory (zip-slip).
**Acceptance criteria:**
- [ ] `safeHref(url)` allows only `http:`/`https:`/`blob:` (`data:` rejected by default); non-allowed → download skipped (no anchor click, no fetch).
- [ ] `sanitizeName(name)` strips `/ \ \x00-\x1f`, collapses `..`, caps length, falls back to sanitized `item.id` then `'download'`; applied to both `a.download` and the zip entry `name`.
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-download`: `safeHref('javascript:alert(1)')`→null, `data:text/html`→null, `https://…`→ok; `sanitizeName('../../x')`→no `..`/sep; `filenameOf` with backslash/CRLF cleaned.
- [ ] `pnpm lint && pnpm typecheck`
**Dependencies:** None.
**Files:** `packages/plugin-download/src/index.ts`, `packages/plugin-download/src/index.test.ts`.
**Scope:** Small.

### Task 2: Image placeholder — CSS `url()` breakout (XS)
**Description:** `applyPlaceholder` interpolates `item.placeholder` into `url("…")` unescaped; a `"`
injects a second comma-separated `url()` → attacker-controlled image request (referer/tracking leak).
(Pre-existing Phase 0 code; no script-XSS — `.backgroundImage` longhand can't reach other properties.)
**Acceptance criteria:**
- [ ] Placeholders containing `"`, `)`, `\`, or newline are rejected (no `backgroundImage` set); valid `data:`/path/color unchanged.
**Verification:**
- [ ] `pnpm test --filter @visora/renderer-dom`: malicious placeholder leaves `style.backgroundImage` empty; `data:image/png…` and `#fff` still applied.
**Dependencies:** None.
**Files:** `packages/renderer-dom/src/adapters/image.ts`, `packages/renderer-dom/src/adapters/image.test.ts`.
**Scope:** XS.

### Checkpoint F1
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm size` green. Security sinks closed.

---

## Phase F2 — Correctness / contract

### Task 3: YouTube URL matching — `/shorts/`, `/live/`, anchored host (S)
**Description:** `parseYouTubeId` omits `shorts/`/`live/` (claims the item then yields empty videoId =
broken player); `isYouTube` substring-matches `evil-youtube.com`.
**Acceptance criteria:**
- [ ] `parseYouTubeId` extracts the id from `watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/`.
- [ ] `isYouTube` anchors to hostname (`youtube.com`/`youtu.be` and subdomains only); `evil-youtube.com`, `notyoutube.com` → false; malformed URL → false (no throw).
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-video-youtube`: table of URL shapes incl shorts/live + the two evil hosts.
**Dependencies:** None.
**Files:** `packages/plugin-video-youtube/src/index.ts`, `packages/plugin-video-youtube/src/index.test.ts`.
**Scope:** Small.

### Task 4: Late-registered `mediaAdapters` go live (S)
**Description:** `mount.ts` freezes `adapters` at mount while `overlays`/`regions`/`keymap` are live;
a `viewer.use(video())` after mount contributes everything except its adapter.
**Acceptance criteria:**
- [ ] `pickAdapter` resolves adapters computed from `viewer.getPlugins()` at call time (default image adapter + `opts.adapters` retained).
**Verification:**
- [ ] `pnpm test --filter @visora/renderer-dom`: mount, then `viewer.use()` a plugin with a `mediaAdapter`, navigate to a matching item → that adapter mounts.
**Dependencies:** None.
**Files:** `packages/renderer-dom/src/mount.ts`, `packages/renderer-dom/src/mount.test.ts`.
**Scope:** Small.

### Checkpoint F2
- [ ] Gates green; both contract gaps closed; existing video/youtube e2e still pass.

---

## Phase F3 — Perf / a11y (thumbnails, then grid mirrors it)

### Task 5: Thumbnails — render-gating, in-place active, a11y, tighten bound test (M)
**Description:** Rail rebuilds (`replaceChildren` + re-observe all imgs) on every committed state
change, not just cursor/collection; item row is an invalid nested `role=listbox`.
**Acceptance criteria:**
- [ ] `render` early-returns when `cursor.g`, `cursor.i`, and collection reference are all unchanged since last paint.
- [ ] Item row uses `role=group` (not nested `listbox`) with `aria-label`.
- [ ] 10k-group bound test tightened from `<200` to `<= 2*overscan+1` (deterministic window) so a windowing regression fails.
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-thumbnails`: spy/assert no `replaceChildren` on a no-op notification; active flips on cursor change; bound test ≤49; axe-relevant role check.
- [ ] `pnpm e2e` thumbnail nav still green.
**Dependencies:** None (pattern reused by Task 6).
**Files:** `packages/plugin-thumbnails/src/index.ts`, `packages/plugin-thumbnails/src/index.test.ts`.
**Scope:** Medium.

### Task 6: Grid — render-gating (mirror Task 5) (S)
**Description:** Grid `render()` (when open) rebuilds on every committed change; apply the same gate.
**Acceptance criteria:**
- [ ] `render` skips when open and `cursor`/collection unchanged.
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-grid`: no rebuild on no-op while open; toggle + cell-click still navigate.
- [ ] `pnpm e2e` grid toggle/cell still green.
**Dependencies:** Task 5 (shares the gating approach).
**Files:** `packages/plugin-grid/src/index.ts`, `packages/plugin-grid/src/index.test.ts`.
**Scope:** Small.

### Checkpoint F3
- [ ] Gates + e2e + thumbnails size budget green; no over-render on unrelated state.

---

## Phase F4 — React adapter lifecycle

### Task 7: Stable viewer + decoupled destroy (S)
**Description:** `useMemo` create-once isn't guaranteed (React may discard); renderer-mount effect
cleanup also destroys the viewer the ref/context still hold.
**Acceptance criteria:**
- [ ] Viewer created via lazy `useState(() => createViewer(options))` (drop the create-once `useMemo` + biome-ignore).
- [ ] `viewer.destroy()` runs in an unmount-only effect (`[viewer]`); renderer-mount effect owns only `handle.destroy()`.
- [ ] StrictMode double-mount/unmount leaves no leaked renderer and a usable viewer.
**Verification:**
- [ ] `pnpm test --filter @visora/react`: StrictMode mount→unmount→remount; ref methods work after remount; existing 8 tests green.
**Dependencies:** None.
**Files:** `packages/react/src/Visora.tsx`, `packages/react/src/Visora.test.tsx`.
**Scope:** Small.

### Task 8: Deterministic overlay ids via `useId` (XS)
**Description:** Auto overlay id uses a module-global counter → SSR/client hydration mismatch.
**Acceptance criteria:**
- [ ] Auto id from `useId()` (called unconditionally); explicit `props.id` still wins.
**Verification:**
- [ ] `pnpm test --filter @visora/react`: overlay registers with a stable id; no module counter remains.
**Dependencies:** Task 7 (same file).
**Files:** `packages/react/src/Visora.tsx`, `packages/react/src/Visora.test.tsx`.
**Scope:** XS.

### Checkpoint F4
- [ ] Gates green; React example smoke-tested in StrictMode.

---

## Phase F5 — Robustness (remaining suggestions in scope)

### Task 9: Hash — robust self-write guard + malformed handling (S)
**Description:** Boolean `selfWrite` latch can stick (coalesced writes / unchanged hash) and swallow a
genuine back/forward; malformed hash untested.
**Acceptance criteria:**
- [ ] Replace latch with `lastWritten` compare (`location.hash.replace(/^#/,'') === lastWritten` → ignore).
- [ ] Malformed hash (`#i=x` no `g`, empty values, bad encoding) → no-op, no throw.
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-hash`: write→hashchange doesn't loop; external back/forward applies; malformed cases no-op.
**Dependencies:** None.
**Files:** `packages/plugin-hash/src/index.ts`, `packages/plugin-hash/src/index.test.ts`.
**Scope:** Small. *(History-mode `replaceState` left as Phase 2 — behavior decision.)*

### Task 10: YouTube — load resilience + parity + types (S)
**Description:** A 404/CSP-blocked API script memoizes a forever-pending promise; no `advanceAxis`
parity with plugin-video; `YTGlobal = any` leaks.
**Acceptance criteria:**
- [ ] `script.onerror` + timeout reject and clear `apiPromise` (retry on next mount).
- [ ] `advanceAxis: 'group'|'item'` option mirrors plugin-video's onEnded branch.
- [ ] Minimal local YT interface replaces `any` on the public surface; optional `host`/nocookie option documented.
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-video-youtube`: onerror rejects + clears memo; advance honors axis.
**Dependencies:** Task 3 (same file).
**Files:** `packages/plugin-video-youtube/src/index.ts`, `packages/plugin-video-youtube/src/index.test.ts`.
**Scope:** Small.

### Task 11: Download — zip resilience (S)
**Description:** `import('client-zip')` unguarded (optional dep); zip fetch has no `res.ok`/abort.
**Acceptance criteria:**
- [ ] Missing `client-zip` → fall back to per-file downloads (try/catch the dynamic import).
- [ ] Zip entries skip non-`ok` responses; an `AbortSignal` threads through the fetches.
**Verification:**
- [ ] `pnpm test --filter @visora/plugin-download`: import-failure path falls back; failed fetch skipped not fatal.
**Dependencies:** Task 1 (same file).
**Files:** `packages/plugin-download/src/index.ts`, `packages/plugin-download/src/index.test.ts`.
**Scope:** Small.

### Task 12: Core — `getPlugins()` returns a copy (XS)
**Description:** Returns the live internal array despite `readonly` type.
**Acceptance criteria:**
- [ ] `getPlugins()` returns `[...pluginInstances]`.
**Verification:**
- [ ] `pnpm test --filter @visora/core`: mutating the returned array doesn't affect the registry.
**Dependencies:** None.
**Files:** `packages/core/src/controller/createViewer.ts`, `packages/core/src/plugins/registry.test.ts`.
**Scope:** XS.

### Task 13: Supply chain — pin `client-zip` + CI audit (XS)
**Description:** Sole runtime 3rd-party dep ranged `^2.4.5`.
**Acceptance criteria:**
- [ ] Exact-pin `client-zip` in `plugin-download` manifest; add `pnpm audit` (non-blocking) to CI.
**Verification:**
- [ ] `pnpm install` lockfile stable; CI workflow parses.
**Dependencies:** None.
**Files:** `packages/plugin-download/package.json`, CI workflow (if present) or note in CHANGELOG.
**Scope:** XS.

### Checkpoint F5
- [ ] Full gates + e2e green; all in-scope Importants + Suggestions resolved.

---

## Release

### Task 14: Docs + CHANGELOG + tag `v0.1.1` (S)
**Acceptance criteria:**
- [ ] CHANGELOG `v0.1.1` section (security + fixes); PLUGIN-AUTHORING note on URL/filename hardening + YT host/CSP; bump package versions.
- [ ] Annotated tag `v0.1.1` on the fix HEAD.
**Verification:**
- [ ] `pnpm build && pnpm test && pnpm e2e && pnpm lint && pnpm typecheck && pnpm size` all green; `git tag -n3 v0.1.1`.
**Dependencies:** F1–F5.
**Files:** `CHANGELOG.md`, `docs/PLUGIN-AUTHORING.md`, package manifests.
**Scope:** Small.

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Render-gating skips a needed repaint (stale active state) | Med | Gate only on cursor+collection identity; add test asserting active flips on cursor change |
| Scheme/filename reject breaks a legit download | Med | Allowlist is permissive (`http/https/blob`); test real URLs pass; `item.id` fallback |
| YT host-anchor regex rejects a valid shape | Low | Table test of all real shapes; `URL()` parse with try/catch |
| React `useState`/effect change alters mount timing | Med | Keep StrictMode test; verify example renders; idempotent destroy retained |
| `client-zip` exact-pin drifts from lockfile | Low | Pin to the already-resolved version; `pnpm install` verifies integrity |

## Deferred to Phase 2 (out of scope — recommend)

- **Region remount reconcile** (`regions.ts` full `replaceChildren` on plugin change) — larger refactor; only loses transient region DOM state on add/remove; not blocking.
- **React selector overload + inert SSR server snapshot** — API addition + design; current whole-state subscription is correct, just broad.
- **`@visora/renderer-dom` peer → dependency** — packaging decision (singleton vs DX); document the install requirement for now.
- **hash `replaceState` history mode** — UX behavior decision (per-slide history entry).

## Open questions

1. Release as `v0.1.1` patch tag now, or fold into a later milestone? (Plan assumes `v0.1.1`.)
2. `data:` scheme for downloads — keep rejected (default) or allow `data:image|video`? (Plan rejects.)
3. Push/merge `phase-1` + tags to origin after fixes, or keep local? (Still pending from Phase 1.)
