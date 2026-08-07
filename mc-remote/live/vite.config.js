/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    coverage: {
      exclude: ['dist/**', 'node_modules/**', 'test/**', 'vite*.config.js'],
    },
  },
})
