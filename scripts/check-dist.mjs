// Checks on built output that source tests can't see. Run after `pnpm build`.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

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
for (const name of ['createViewer', 'mount', 'bind', 'thumbnails', 'grid', 'pins', 'video']) {
  if (typeof api[name] !== 'function') fail(`${umd} doesn't export ${name}`)
}

if (!process.exitCode) console.log('check-dist: ok')
