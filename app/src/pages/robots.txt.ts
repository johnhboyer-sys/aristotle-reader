// robots.txt, written from the build's own origin and base (SITE_ORIGIN and
// SITE_BASE; scripts/site-params.mjs), so its Sitemap line cannot name
// another site's.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${site!.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/sitemap-index.xml\n`);
