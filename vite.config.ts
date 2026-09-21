import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    // SPA routes: /party, /r/:code
    proxy: {},
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
  },
})
