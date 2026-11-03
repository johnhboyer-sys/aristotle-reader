// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Published on GitHub Pages under the custom domain aristotle.johnhboyer.com
  // (the CNAME file in public/), so the site sits at the root and needs no
  // base. App code reads import.meta.env.BASE_URL, so it works at any base;
  // scripts/check-links.mjs BASE must match this one.
  // `site` is the canonical origin — set only so @astrojs/sitemap can emit
  // absolute URLs (site + base + path). App UI still uses base-relative URLs,
  // not Astro.site, so this changes no existing links.
  site: 'https://aristotle.johnhboyer.com',
  base: '/',
  // Astro 7 changed the default to 'jsx', which drops the whitespace between
  // inline elements on separate lines and runs words together. Keep v6's.
  compressHTML: true,
  integrations: [
    svelte(),
    sitemap(),
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