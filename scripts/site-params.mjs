// The site's address as build parameters (HANDOFF-PORTABILITY.md, phase 2).
// Node 22+, no dependencies. Unset or empty, they give the primary site at
// the root, which is today's build. app/astro.config.mjs and
// scripts/check-links.mjs both read them here, so a build and its link check
// cannot disagree about the base.
//
//   SITE_ORIGIN  the origin canonical links, cards and the sitemap name, like
//                https://aristotle.johnhboyer.com. A mirror keeps the default:
//                its canonical links name the primary site.
//   SITE_BASE    the path the site is served under, like / or /aristotle/.
//
// The two the bundle itself reads are PUBLIC_DATA_ROOT (shared/lib/data.ts;
// unset, the data is under <base>/data on the site's own origin) and
// PUBLIC_GRAMMATA_LOOKUP (shared/components/WordPopup.svelte and
// app/src/components/LemmaPage.astro; unset, grammata.pages.dev).
export const DEFAULT_ORIGIN = 'https://aristotle.johnhboyer.com';

export function siteParams(env = process.env) {
  const site = env.SITE_ORIGIN || DEFAULT_ORIGIN;
  const origin = URL.canParse(site) ? new URL(site) : null;
  if (!origin || !/^https?:$/.test(origin.protocol) || origin.origin !== site) {
    throw new Error(`SITE_ORIGIN must be an origin like https://example.org, with no path and no trailing slash: got ${JSON.stringify(site)}`);
  }
  const base = env.SITE_BASE || '/';
  if (!/^\/(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*$/.test(base)) {
    throw new Error(`SITE_BASE must start and end with "/", like / or /aristotle/: got ${JSON.stringify(base)}`);
  }
  return { site, base };
}
