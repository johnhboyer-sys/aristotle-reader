# Cloudflare hosting (preview built 2026-11-19; cutover is John's)

The plan (John, 2026-11-19): move the site off GitHub Pages, where the
gh-pages branch is at 17,636 files and 889 MB, close to GitHub's 1 GB limit.
The app goes on Cloudflare and the corpus data goes on R2, joined by a
build-time data root.

## What runs where

| Part | Where | Size |
|---|---|---|
| App (pages, `_astro`, plates, og cards, icons, `sw.js`) | Worker `aristotle-reader`, static assets only, no script (`app/wrangler.jsonc`) | 7,845 files |
| Corpus data (`data/`) | R2 bucket `aristotle-reader-data`, keys without the `data/` prefix | 9,791 objects, 458 MB |
| Preview | `https://aristotle-reader.johnhboyer.workers.dev` | |
| Preview data root | `https://pub-1893afca177845708191e7dc77c78e9f.r2.dev` (r2.dev: rate-limited, for testing only) | |

This is how greekdrama runs, with one difference: greekdrama is a Worker
with static assets too, but it ships its data inside the Worker (9,739 files
in all). Aristotle's 17,636 files would leave only 2,364 under the 20,000-files-per-version
limit, so the data goes to R2. Cloudflare now runs Pages as Workers
static assets, so the "Pages project" is the Worker above.

The data root is baked in at build time through `PUBLIC_DATA_ROOT`
(`shared/lib/data.ts`, `shared/lib/search.ts`; every client data fetch goes
through them). The desktop app's `globalThis.__ARISTOTLE_DATA_ROOT__` still
wins. With the variable unset the build is the GitHub Pages build, unchanged.
With it set, `app/scripts/postbuild-data-root.mjs` writes the root into
`dist/sw.js`, so offline reading caches R2 data, and writes
`dist/.assetsignore` so `wrangler deploy` leaves `dist/data` out.

## Free-tier check (2026-11-19)

R2 before this move: `classical-philosophy-reader-data` 548 MB and
`grammata-packs` 85 MB. With Aristotle's 458 MB the account holds about
1.1 GB of the 10 GB-month free storage. The upload costs about 9,800 writes
against 1 million free a month. Reads are free up to 10 million a month, and
egress is always free. A payment method is on file for R2, so going past these
limits would be billed, not refused. Workers static-asset requests are free
and unlimited. The Worker runs no script, so the 100,000-requests-a-day
limit on Workers does not apply.

## Build and deploy (preview)

From the repo root, on Node 22 (`nvm use 22`), with `build/dist` holding the
corpus (for an app-only rebuild, a copy of live's `data/`):

1. Build:
   `cd app && PUBLIC_SHOW_PRIVATE=0 PUBLIC_DATA_ROOT=<data root> npm run build`.
   The last line should read `postbuild-data-root: sw.js and .assetsignore written for <data root>`.
2. Upload the data: `npx wrangler@4 r2 bulk put aristotle-reader-data --remote --filename <list.json> --ct "application/json; charset=utf-8" --cc max-age=600 --concurrency 8`,
   once per content type (`.json`, `.md` as `text/markdown; charset=utf-8`,
   `.bin` as `application/octet-stream`). Each list is a JSON array of
   `{"key": "EN/chapters.json", "file": "/abs/path/build/dist/EN/chapters.json"}`.
   `max-age=600` matches what GitHub Pages sends. The rclone `r2:` key
   reaches only the Lyceum bucket, so the upload uses wrangler's login.
3. Deploy the app: `cd app && CLOUDFLARE_ACCOUNT_ID=6ff75c6d6c06d1092df2c7efd42077ba npx wrangler@4 deploy`.
   It should upload about 7,845 files. A count near 17,600 means
   `.assetsignore` is missing and the data went into the Worker.
4. Check: `node scripts/compare-live.mjs --app=<worker url> --data=<data root>`
   fetches every file in the gh-pages tree from Cloudflare (4 at a time) and
   compares its hash with the tree's. It also fetches a sample of 40 from live itself.

Bucket CORS is in `deploy/r2-cors.json`: GET and HEAD from
`https://aristotle.johnhboyer.com` and the preview origin. Apply it with
`npx wrangler@4 r2 bucket cors set aristotle-reader-data --file deploy/r2-cors.json`.

Still missing: a Cloudflare deploy script with the gates `npm run deploy`
runs (link check, leak check, live-only data restore). The preview was built
from live's own data, which passed those gates on 2026-11-18.

## Cutover checklist (John's to do or approve; nothing here is done)

1. **Data hostname.** Attach a custom domain to the bucket, e.g.
   `aristotle-data.johnhboyer.com` (R2 → `aristotle-reader-data` → Settings →
   Custom Domains). Cloudflare creates the DNS record. Use one level under
   johnhboyer.com: the free Universal SSL certificate covers
   `*.johnhboyer.com` but not `*.aristotle.johnhboyer.com`. The bucket CORS
   already allows `https://aristotle.johnhboyer.com`, so it needs no change.
2. **Rebuild against it.** Build with
   `PUBLIC_DATA_ROOT=https://aristotle-data.johnhboyer.com`, deploy to the
   Worker, and rerun `compare-live.mjs` with `--data=` that hostname. The preview
   then reads from the production data address.
3. **Switch the site's DNS.** Delete the DNS-only CNAME
   `aristotle → johnhboyer-sys.github.io`, then attach
   `aristotle.johnhboyer.com` to the Worker (Workers → `aristotle-reader` →
   Settings → Domains, or add
   `"routes": [{ "pattern": "aristotle.johnhboyer.com", "custom_domain": true }]`
   to `app/wrangler.jsonc` and deploy, as greekdrama did). Cloudflare refuses
   the custom domain while the old record exists. Expect a few minutes of
   errors between the two steps, so do it at a quiet hour. HSTS and Always
   Use HTTPS are on, so check `https://aristotle.johnhboyer.com/` answers
   before leaving it. Two small differences from GitHub Pages: a missing
   trailing slash redirects with 307, not 301, and `/data/...` on the site's
   own address answers 404. If outside links to data files matter, a
   `_redirects` line `/data/* https://aristotle-data.johnhboyer.com/:splat 301`
   in `app/public/` would carry them over.
4. **Check live.** `/`, a work page, `/search/`, a lemma page, and a word
   lookup, all with the network panel showing data from the data hostname;
   `/bonitz/` still 404.
5. **GitHub Pages.** Once Cloudflare serves the domain, remove the custom
   domain in the repo's Settings → Pages, then unpublish. Decide first
   whether the old `johnhboyer-sys.github.io/aristotle-reader/` address matters:
   its redirect to the custom domain stops when the custom domain is removed.
   Leave the gh-pages branch in place as the record until you choose to
   delete it.
6. **After.** Turn off the r2.dev address
   (`npx wrangler@4 r2 bucket dev-url disable aristotle-reader-data`) and,
   if wanted, the workers.dev preview (`"workers_dev": false`). Update
   CLAUDE.md and DEPLOY-STATUS.md: `npm run deploy` (gh-pages) is retired,
   and this file's recipe replaces it.

Visitors' service workers update themselves: the origin stays the same, and the
new `sw.js` caches R2 data. Their old cached `/data/` copies stay in the cache unused
until the cache version is next bumped.
