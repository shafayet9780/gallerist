import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

// Single source of truth for the runtime VERSION: derived from package.json at build
// (see src/index.ts) so the constant can never drift from the published version.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  target: 'es2022',
  define: { __GALLERIST_VERSION__: JSON.stringify(version) },
  // self-contained maps: they carry their sources, since the package doesn't ship src/
  esbuildOptions(options) {
    options.sourcesContent = true
  },
})
