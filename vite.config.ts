import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = realpathSync(process.cwd())
const dependencyRoot = realpathSync(join(projectRoot, 'node_modules'))

export default defineConfig({
  // Documents\Codex is retained as a Windows junction. Keep Vite's root and
  // module ids on the same canonical drive so build-html emits relative names.
  root: projectRoot,
  plugins: [react()],
  base: './',
  server: {
    fs: {
      strict: true,
      // A worktree may share node_modules through a junction. Allow only its
      // resolved dependency directory, not the parent checkout or entire drive.
      allow: [projectRoot, dependencyRoot],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
