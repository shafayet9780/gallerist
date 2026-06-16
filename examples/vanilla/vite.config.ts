import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: r('.'),
  resolve: {
    alias: {
      '@visora/core': r('../../packages/core/src/index.ts'),
      '@visora/renderer-dom': r('../../packages/renderer-dom/src/index.ts'),
      '@visora/theme-default/visora.css': r('../../packages/theme-default/src/visora.css'),
    },
  },
})
