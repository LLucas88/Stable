import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'

export default defineConfig({
  // Documents\Codex is retained as a Windows junction. Keep Vite's root and
  // module ids on the same canonical drive so build-html emits relative names.
  root: realpathSync(process.cwd()),
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
