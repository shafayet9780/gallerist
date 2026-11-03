import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // esbuild still drops unused code; rollup's pass (treeshake: true) would strip the banner
  treeshake: false,
  // the adapter uses hooks, so a React Server Components tree must treat it as a client boundary
  banner: { js: '"use client";' },
  sourcemap: true,
  minify: false,
  target: 'es2022',
  external: ['react', 'react-dom', '@gallerist/core', '@gallerist/renderer-dom'],
  tsconfig: 'tsconfig.build.json',
  esbuildOptions(options) {
    options.jsx = 'automatic'
    // self-contained maps: they carry their sources, since the package doesn't ship src/
    options.sourcesContent = true
  },
})
