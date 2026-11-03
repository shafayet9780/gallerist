// Checks on built output that source tests can't see. Run after `pnpm build`.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
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

// Pack every publishable package the way `changeset publish` will (pnpm rewrites `workspace:`
// ranges to real versions while packing); a range left behind would break every install from npm.
const packDir = mkdtempSync(join(tmpdir(), 'gallerist-pack-'))
try {
  let bytes = 0
  for (const name of readdirSync('packages')) {
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
  }
  console.log(`check-dist: packed ${tarballs.length} packages, ${(bytes / 1024).toFixed(1)} kB`)
} finally {
  rmSync(packDir, { recursive: true, force: true })
}

if (!process.exitCode) console.log('check-dist: ok')
