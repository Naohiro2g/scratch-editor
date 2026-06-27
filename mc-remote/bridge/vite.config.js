/// <reference types="vitest/config" />
import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'
import packageJson from './package.json'

// Externalize dependencies and Node built-ins: this is a Node server, not a
// bundled-for-the-browser library.
const external = [
  ...Object.keys(packageJson.dependencies || {}),
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
].map((name) => new RegExp(`^${name}(?:/.*)?$`))

export default defineConfig({
  build: {
    target: 'node22',
    lib: {
      entry: {
        index: 'src/index.ts',
        main: 'src/main.ts',
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external,
    },
  },
  test: {
    coverage: {
      exclude: ['dist/**', 'node_modules/**', 'test/**', 'vite.config.js'],
    },
  },
})
