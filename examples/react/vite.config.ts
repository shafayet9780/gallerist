import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: r('.'),
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@visora/core': r('../../packages/core/src/index.ts'),
      '@visora/renderer-dom': r('../../packages/renderer-dom/src/index.ts'),
      '@visora/react': r('../../packages/react/src/index.ts'),
      '@visora/plugin-thumbnails': r('../../packages/plugin-thumbnails/src/index.ts'),
      '@visora/plugin-grid': r('../../packages/plugin-grid/src/index.ts'),
      '@visora/plugin-fullscreen': r('../../packages/plugin-fullscreen/src/index.ts'),
      '@visora/plugin-download': r('../../packages/plugin-download/src/index.ts'),
      '@visora/plugin-hash': r('../../packages/plugin-hash/src/index.ts'),
      '@visora/theme-default/visora.css': r('../../packages/theme-default/src/visora.css'),
    },
  },
})
