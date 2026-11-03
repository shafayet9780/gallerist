import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

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
  external: ['@gallerist/core'],
  tsconfig: 'tsconfig.build.json',
  define: { __GALLERIST_VERSION__: JSON.stringify(version) },
  // self-contained maps: they carry their sources, since the package doesn't ship src/
  esbuildOptions(options) {
    options.sourcesContent = true
  },
})
