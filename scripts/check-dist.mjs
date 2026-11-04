// Checks on built output that source tests can't see. Run after `pnpm build`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fail = (message) => {
  console.error(`check-dist: ${message}`)
  process.exitCode = 1
}

// A React Server Components tree needs this first, or importing the adapter breaks on its hooks.
for (const file of ['packages/react/dist/index.js', 'packages/react/dist/index.cjs']) {
  if (!/^"use client";/.test(readFileSync(file, 'utf8')))
    fail(`${file} lacks the "use client" banner`)
}

// The global build also loads as CommonJS, and bundles everything: no workspace imports left behind.
const umd = 'packages/cdn/dist/gallerist.umd.js'
if (/require\(["']@gallerist\//.test(readFileSync(umd, 'utf8')))
  fail(`${umd} left a package external`)
const api = createRequire(import.meta.url)(`../${umd}`)
for (const name of [
  'createViewer',
  'mount',
  'bind',
  'thumbnails',
  'grid',
  'pins',
  'captions',
  'video',
]) {
  if (typeof api[name] !== 'function') fail(`${umd} doesn't export ${name}`)
}

const { version } = JSON.parse(readFileSync('packages/cdn/package.json', 'utf8'))
if (api.VERSION !== version) fail(`${umd} reports version ${api.VERSION}, not ${version}`)

// Every file a manifest points at: main/module/types/unpkg/jsdelivr/style and each `exports` target
// (conditions nested to any depth; `*` patterns are left to the build).
const targets = (manifest) => {
  const out = []
  const walk = (v) => {
    if (typeof v === 'string') out.push(v)
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  for (const key of ['main', 'module', 'types', 'typings', 'unpkg', 'jsdelivr', 'style'])
    walk(manifest[key])
  walk(manifest.exports)
  return [...new Set(out)].filter((t) => !t.includes('*'))
}

// Pack every publishable package the way `changeset publish` will (pnpm rewrites `workspace:`
// ranges to real versions while packing); a range left behind would break every install from npm.
// Each tarball must also hold every file its manifest points at (a dist/ or src/ left out of
// `files`, or a target the build never wrote, would install a package that can't be imported).
const packDir = mkdtempSync(join(tmpdir(), 'gallerist-pack-'))
try {
  let bytes = 0
  for (const name of readdirSync('packages')) {
    // a stray directory (an old build, an editor's folder) is not a package
    if (!existsSync(`packages/${name}/package.json`)) continue
    const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'))
    if (manifest.private) continue
    execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
      cwd: `packages/${name}`,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  }
  const tarballs = readdirSync(packDir).filter((f) => f.endsWith('.tgz'))
  if (tarballs.length === 0) fail('pnpm pack produced no tarballs')
  for (const tarball of tarballs) {
    bytes += statSync(join(packDir, tarball)).size
    const packed = execFileSync('tar', ['-xOzf', join(packDir, tarball), 'package/package.json'], {
      encoding: 'utf8',
    })
    if (packed.includes('workspace:')) fail(`${tarball} still has a workspace: range`)
    const files = new Set(
      execFileSync('tar', ['-tzf', join(packDir, tarball)], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean),
    )
    for (const target of targets(JSON.parse(packed))) {
      const path = `package/${target.replace(/^\.\//, '')}`
      if (!files.has(path)) fail(`${tarball} lacks ${target}, which its package.json points at`)
    }
  }
  console.log(`check-dist: packed ${tarballs.length} packages, ${(bytes / 1024).toFixed(1)} kB`)
} finally {
  rmSync(packDir, { recursive: true, force: true })
}

if (!process.exitCode) console.log('check-dist: ok')
