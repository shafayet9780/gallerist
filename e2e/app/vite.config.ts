import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Serves the e2e fixture, resolving @visora/* to source (no build step needed).
export default defineConfig({
  root: r('.'),
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: {
      '@visora/core': r('../../packages/core/src/index.ts'),
      '@visora/renderer-dom': r('../../packages/renderer-dom/src/index.ts'),
      '@visora/theme-default/visora.css': r('../../packages/theme-default/src/visora.css'),
    },
  },
})
