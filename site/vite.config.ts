import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: r('.'),
  base: './', // works at a domain root and under a project path
  publicDir: r('../examples/react/public'), // the demo photos
  build: {
    rollupOptions: { input: { index: r('index.html'), docs: r('docs.html') } },
  },
  resolve: {
    alias: {
      '@gallerist/core/internal': r('../packages/core/src/internal.ts'),
      '@gallerist/core': r('../packages/core/src/index.ts'),
      '@gallerist/renderer-dom': r('../packages/renderer-dom/src/index.ts'),
      '@gallerist/plugin-save': r('../packages/plugin-save/src/index.ts'),
      '@gallerist/plugin-fullscreen': r('../packages/plugin-fullscreen/src/index.ts'),
      '@gallerist/plugin-grid': r('../packages/plugin-grid/src/index.ts'),
      '@gallerist/plugin-pins': r('../packages/plugin-pins/src/index.ts'),
      '@gallerist/plugin-thumbnails': r('../packages/plugin-thumbnails/src/index.ts'),
      '@gallerist/plugin-view': r('../packages/plugin-view/src/index.ts'),
      '@gallerist/plugin-zoom': r('../packages/plugin-zoom/src/index.ts'),
      '@gallerist/plugin-shortcuts': r('../packages/plugin-shortcuts/src/index.ts'),
      '@gallerist/theme-default': r('../packages/theme-default/src'),
    },
  },
})
