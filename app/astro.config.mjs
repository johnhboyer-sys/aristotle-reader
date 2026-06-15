// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  // Published as a GitHub Pages project site at
  // johnhboyer-sys.github.io/aristotle-reader/. `base` prefixes every app
  // path; code reads import.meta.env.BASE_URL so it works at any base. `site`
  // is intentionally omitted — the app uses base-relative URLs (not Astro.site).
  base: '/aristotle-reader',
  integrations: [svelte()],
  vite: {
    server: {
      fs: { allow: ['..'] },
    },
  },
});
