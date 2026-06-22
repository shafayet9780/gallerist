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
    // happy-dom tests must never touch the network. Block external <script>/<link>
    // resource loading so e.g. plugin-video-youtube's iframe_api script tag can't
    // fire a real request (was surfacing as a stray TLSSocket error in `pnpm test`).
    environmentOptions: {
      happyDOM: {
        settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
      },
    },
    include: ['packages/**/src/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
    // happy-dom emits a benign async log when it blocks the (now-disabled) external
    // script load above; the youtube adapter handles that failure via script.onerror.
    onConsoleLog: (log) =>
      log.includes('JavaScript file loading is disabled') ? false : undefined,
  },
})
