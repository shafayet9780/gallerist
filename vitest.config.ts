import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Default env is node (pure logic: model, FSM, nav math, zoom math, store).
// DOM tests opt in per-file with:  // @vitest-environment happy-dom
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@visora/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@visora/renderer-dom': fileURLToPath(
        new URL('./packages/renderer-dom/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
  },
})
