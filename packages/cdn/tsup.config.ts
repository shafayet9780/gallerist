import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

// One file for a <script> tag. esbuild writes an IIFE that assigns the global `Gallerist`; the footer
// makes that a UMD, so a CommonJS or AMD loader gets the same object. (So this package isn't
// `type: module`: Node must read the .js as CommonJS.)
export default defineConfig({
  entry: { gallerist: 'src/index.ts' },
  format: ['iife'],
  globalName: 'Gallerist',
  outExtension: () => ({ js: '.umd.js' }),
  noExternal: [/.*/],
  define: { __GALLERIST_VERSION__: JSON.stringify(version) },
  dts: false,
  clean: true,
  sourcemap: true,
  minify: true,
  target: 'es2022',
  footer: {
    js: 'typeof module==="object"&&module.exports?module.exports=Gallerist:typeof define==="function"&&define.amd&&define(function(){return Gallerist});',
  },
  esbuildOptions(options) {
    options.sourcesContent = false
  },
})
