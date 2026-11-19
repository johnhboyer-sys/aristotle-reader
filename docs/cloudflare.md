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
| Data address | `https://aristotle-data.johnhboyer.com` (R2 custom domain, attached by John 2026-11-19) | |
| Preview | `https://aristotle-reader.johnhboyer.workers.dev` | |
| Test data address | `https://pub-1893afca177845708191e7dc77c78e9f.r2.dev` (r2.dev: rate-limited; turn off after cutover) | |

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

## Build and deploy

From the repo root, on Node 22 (`nvm use 22`), with `build/dist` holding the
corpus (for an app-only rebuild, a copy of live's `data/`):

1. Build: `cd app && PUBLIC_SHOW_PRIVATE=0 PUBLIC_DATA_ROOT=https://aristotle-data.johnhboyer.com npm run build`.
   The last line should read `postbuild-data-root: sw.js and .assetsignore written for …`.
2. Rehearse: `npm run deploy:cloudflare:dry`. It refuses a build without the
   data address, checks the page count against the live sitemap (90% floor),
   runs the link check and the data gates `npm run deploy` runs (leak check,
   gated translation slots, held works, search indexes, search shards), then
   reads every data file's ETag from R2 and lists what would upload.
3. Deploy: `npm run deploy:cloudflare`. It uploads only the data files whose
   MD5 differs from R2's ETag (wrangler `r2 bulk put`, `max-age=600` as
   GitHub Pages sent), reads them back, then runs `wrangler deploy` from `app/`.
   It never deletes from R2: a file the build lacks stays, as `npm run deploy`
   restored live-only data files, and it is fetched and run through the same
   data gates. Wrangler cannot list a bucket, so the bucket keeps a record of
   every key the script has uploaded, `_deploy/keys.json` (seeded 2026-11-19
   with the 9,791 keys of the first upload); upload data only through the
   script, or the record goes stale. Cloudflare's API limit holds uploads to
   about 1,100 files per 5 minutes, so a full corpus upload takes about 40
   minutes.
4. Check (optional, while gh-pages is still the record of live):
   `node scripts/compare-live.mjs --app=<worker url> --data=<data address>`
   fetches every file in the gh-pages tree from Cloudflare (4 at a time) and
   compares its hash with the tree's, plus a sample of 40 from live itself.

The rclone `r2:` key reaches only the Lyceum bucket, so uploads use
wrangler's login. Bucket CORS is in `deploy/r2-cors.json`: GET and HEAD from
`https://aristotle.johnhboyer.com` and the preview origin. Apply it with
`npx wrangler@4 r2 bucket cors set aristotle-reader-data --file deploy/r2-cors.json`.

Open question for John: the data is overwritten in place, not swapped in one
step. Between the upload and the Worker deploy, or for good if the Worker
deploy fails, the old app reads the new data. GitHub Pages had a milder form
of this (browsers keep JSON for 10 minutes). Codex's review (2026-11-19)
suggests a folder per release (`releases/<version>/`), with the app pointed
at its own folder; the cost is a full upload, about 40 minutes, on every
deploy that changes data, plus deleting old folders by hand. For app-only
deploys and small data fixes the in-place upload is safe.

## Cutover checklist (John's to do or approve)

1. **Data hostname.** DONE 2026-11-19 (John): `aristotle-data.johnhboyer.com`. Attach a custom domain to the bucket, e.g.
   `aristotle-data.johnhboyer.com` (R2 → `aristotle-reader-data` → Settings →
   Custom Domains). Cloudflare creates the DNS record. Use one level under
   johnhboyer.com: the free Universal SSL certificate covers
   `*.johnhboyer.com` but not `*.aristotle.johnhboyer.com`. The bucket CORS
   already allows `https://aristotle.johnhboyer.com`, so it needs no change.
2. **Rebuild against it.** DONE 2026-11-19 (Worker version `0dd8700f`; compare and browser checks below). Build with
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

## Preview verified (2026-11-19)

Worker version `a6f31ba8`, branch `claude/cloudflare-move` at the commit that added this
section, built from 61cd5630af (the commit live serves) with live's own `data/`.

- `compare-live.mjs`, all 17,634 files of gh-pages 2b7c15a0 (less CNAME and `.nojekyll`),
  4 in flight: 17,403 byte-identical; 214 pages equal once bundle names, Svelte class
  hashes and island ids are masked; 16 bundles renamed; `sw.js` differs by design;
  0 missing, 0 errors, 0 other differences. All 40 files sampled from live matched the tree.
- What the renames carry: against a clean build of 61cd5630af, only `data.js` and
  `search.js` differ in content (the R2 root), plus the home page's script
  (`fetchChapters`/`fetchColumns`). A clean build of 61cd5630af itself differs from live
  on 213 pages and in 5 bundles, so hashes depend on where the build runs.
- Browser (built-in pane): `/EN/book/1/` renders and fetches only from R2; the word popup
  (`ἀγαθοῦ`) and its LSJ entry load; the home page resumes at "Book II, chapter 2 · 1104a12"
  from R2; `/search/?l=nous` reads "119 chapters · 270 hits" as on live (142 R2 requests,
  none same-origin); the service worker cached 147 R2 files; no console errors.
- Gates: shared vitest 1,993 passed (9 skipped); app vitest 255; `npm run test:scripts` 99;
  svelte-check 0 errors; link integrity 0 broken (7,563 pages). Pipeline untouched, pytest not run.
- Routing: `/bonitz/` and unknown pages 404 as on live; a missing trailing slash redirects 307
  (live: 301); `/data/...` on the Worker is 404 (the data is on R2).

## Production data address verified (2026-11-19)

Worker version `0dd8700f`, built with `PUBLIC_DATA_ROOT=https://aristotle-data.johnhboyer.com`.
The data address serves the same bytes, `max-age=600`, and CORS for both origins.
`compare-live.mjs --data=https://aristotle-data.johnhboyer.com`: the same result as above
(17,403 identical, 214 hash-only pages, 16 renamed bundles, `sw.js`; 0 missing, 0 errors,
0 other; 40/40 live samples matched). Browser: the word popup and LSJ load; `/search/?l=nous`
reads "119 chapters · 270 hits" with all 142 requests to the data address; the service worker
cached 145 files from it; no console errors. Link integrity 0 broken.
