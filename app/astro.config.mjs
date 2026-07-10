// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Published as a GitHub Pages project site at
  // johnhboyer-sys.github.io/aristotle-reader/. `base` prefixes every app
  // path; app code reads import.meta.env.BASE_URL so it works at any base.
  // `site` is the canonical origin — set only so @astrojs/sitemap can emit
  // absolute URLs (site + base + path). App UI still uses base-relative URLs,
  // not Astro.site, so this changes no existing links.
  site: 'https://johnhboyer-sys.github.io',
  base: '/aristotle-reader',
  integrations: [
    svelte(),
    // Exclude the work-in-progress Bonitz Index Aristotelicus page from the
    // sitemap so it isn't advertised to search engines until it ships.
    sitemap({ filter: (page) => !page.includes('/bonitz') }),
  ],
  vite: {
    server: {
      fs: { allow: ['..'] },
    },
    resolve: {
      // The reader core (components, libs, global.css) lives in ../shared and
      // is consumed by both this site and the desktop app. See shared/README.md.
      alias: {
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
  },
});