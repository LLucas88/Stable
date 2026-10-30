import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  css:{postcss:{plugins:[tailwindcss()]}},
  resolve:{alias:{'cloudflare:workers':fileURLToPath(new URL('./runtime/node-env.mjs',import.meta.url))}},
  plugins:[vinext()],
});
