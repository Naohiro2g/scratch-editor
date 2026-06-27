/// <reference types="vitest/config" />
import dts from 'unplugin-dts/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'McRemoteProtocol',
      fileName: 'protocol',
      formats: ['es'],
    },
  },
  plugins: [
    // Generate TypeScript declaration files
    dts({
      insertTypesEntry: true,
      tsconfigPath: 'tsconfig.build.json',
    }),
  ],
  test: {
    coverage: {
      exclude: ['dist/**', 'node_modules/**', 'test/**', 'vite.config.js'],
    },
  },
})
