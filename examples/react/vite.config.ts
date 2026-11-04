import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: r('.'),
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@gallerist/core/internal': r('../../packages/core/src/internal.ts'),
      '@gallerist/core': r('../../packages/core/src/index.ts'),
      '@gallerist/renderer-dom': r('../../packages/renderer-dom/src/index.ts'),
      '@gallerist/react': r('../../packages/react/src/index.ts'),
      '@gallerist/plugin-thumbnails': r('../../packages/plugin-thumbnails/src/index.ts'),
      '@gallerist/plugin-grid': r('../../packages/plugin-grid/src/index.ts'),
      '@gallerist/plugin-fullscreen': r('../../packages/plugin-fullscreen/src/index.ts'),
      '@gallerist/plugin-download': r('../../packages/plugin-download/src/index.ts'),
      '@gallerist/plugin-hash': r('../../packages/plugin-hash/src/index.ts'),
      '@gallerist/plugin-video': r('../../packages/plugin-video/src/index.ts'),
      '@gallerist/plugin-video-youtube': r('../../packages/plugin-video-youtube/src/index.ts'),
      '@gallerist/theme-default/gallerist.css': r('../../packages/theme-default/src/gallerist.css'),
    },
  },
})
