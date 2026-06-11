// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  integrations: [svelte()],
  // Data files are large and served statically; the dev server mounts
  // the pipeline's dist output directly so there's no copy step in dev.
  vite: {
    server: {
      fs: { allow: ['..'] },
    },
  },
});
