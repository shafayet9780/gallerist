import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  target: 'es2022',
  external: ['react', 'react-dom', '@gallerist/core', '@gallerist/renderer-dom'],
  tsconfig: 'tsconfig.build.json',
  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.sourcesContent = false
  },
})
