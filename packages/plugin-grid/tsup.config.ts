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
  external: ['@gallerist/core'],
  tsconfig: 'tsconfig.build.json',
  // self-contained maps: they carry their sources, since the package doesn't ship src/
  esbuildOptions(options) {
    options.sourcesContent = true
  },
})
