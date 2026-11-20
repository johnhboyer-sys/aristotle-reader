// Runs after `astro build`. With PUBLIC_DATA_ROOT unset (the GitHub Pages
// build) it does nothing. With it set (the Cloudflare build, data on R2):
//  - writes the root into dist/sw.js, which is a static copy of public/sw.js
//    and cannot read import.meta.env; without this the worker never caches
//    corpus data and offline reading silently stops working;
//  - writes dist/.assetsignore so `wrangler deploy` leaves dist/data out of
//    the Worker (the data goes to R2; see docs/cloudflare.md);
//  - writes dist/_redirects sending /data/* to the root, so a tab or service
//    worker still running a pre-cutover bundle (which fetches same-origin
//    /data/) and outside links to data files keep working. 302, not 301:
//    browsers keep a 301 for good, and the root may move.
// Ported from greek-plays app/scripts/postbuild-sw.mjs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PLACEHOLDER = /^const DATA_ROOT = '';$/m;
const dist = process.argv[2] ?? 'dist';
const SW = `${dist}/sw.js`;

const root = process.env.PUBLIC_DATA_ROOT;
if (root) {
  try {
    new URL(root);
  } catch {
    console.error(`postbuild-data-root: PUBLIC_DATA_ROOT is not an absolute URL: ${root}`);
    process.exit(1);
  }
  if (!existsSync(SW)) {
    console.error(`postbuild-data-root: ${SW} not found`);
    process.exit(1);
  }
  const source = readFileSync(SW, 'utf8');
  if (!PLACEHOLDER.test(source)) {
    console.error(`postbuild-data-root: no DATA_ROOT placeholder in ${SW}; public/sw.js has drifted`);
    process.exit(1);
  }
  writeFileSync(SW, source.replace(PLACEHOLDER, `const DATA_ROOT = ${JSON.stringify(root)};`));
  writeFileSync(`${dist}/.assetsignore`, 'data\n');
  writeFileSync(`${dist}/_redirects`, `/data/* ${root.replace(/\/+$/, '')}/:splat 302\n`);
  console.log(`postbuild-data-root: sw.js, .assetsignore and _redirects written for ${root}`);
}
