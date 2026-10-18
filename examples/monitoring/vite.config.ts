import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: r('.'),
  resolve: {
    alias: {
      '@gallerist/core/internal': r('../../packages/core/src/internal.ts'),
      '@gallerist/core': r('../../packages/core/src/index.ts'),
      '@gallerist/renderer-dom': r('../../packages/renderer-dom/src/index.ts'),
      '@gallerist/theme-default': r('../../packages/theme-default/src'),
    },
  },
})
