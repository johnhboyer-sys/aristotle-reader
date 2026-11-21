// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

import sitemap from '@astrojs/sitemap';

import { siteParams } from '../scripts/site-params.mjs';

// Build parameters SITE_ORIGIN and SITE_BASE; unset, the primary site at the root.
const { site, base } = siteParams();

export default defineConfig({
  // The primary site sits at the root of aristotle.johnhboyer.com and needs
  // no base. App code reads import.meta.env.BASE_URL, so it works at any
  // base; scripts/check-links.mjs reads the same parameter.
  // `site` is the canonical origin: canonical links, cards, robots.txt and
  // @astrojs/sitemap's absolute URLs (site + base + path). App UI uses
  // base-relative URLs, not Astro.site.
  site,
  base,
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