import { defineConfig } from 'vitest/config'

// Default env is node (pure logic: model, FSM, nav math, zoom math, store).
// DOM tests opt in per-file with:  // @vitest-environment happy-dom
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.{test,spec}.ts'],
    clearMocks: true,
  },
})
