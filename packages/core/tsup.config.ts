import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// Single source of truth for the runtime VERSION: derived from package.json at build
// (see src/index.ts) so the constant can never drift from the published version.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  target: 'es2022',
  define: { __VISORA_VERSION__: JSON.stringify(version) },
  // Don't embed the full TS source in the shipped maps (keeps the tarball lean).
  esbuildOptions(options) {
    options.sourcesContent = false
  },
})
