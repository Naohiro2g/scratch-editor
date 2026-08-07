import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'McRemoteLive',
      fileName: 'observer',
      formats: ['es'],
    },
  },
})
