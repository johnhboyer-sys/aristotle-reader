# Architecture

How the site is made, what it needs, and what it calls. Written so that someone
with this repository and no access to its author's machines or accounts can
build the site and serve it. State and plans for the work that made this
possible are in `HANDOFF-PORTABILITY.md`; how to bring the site back from a
mirror is `RESTORE.md` (not yet written).

## The site is static

Every page is a file. There is no server code, no database, and no account
system. A host needs to do one thing: serve a folder of files over HTTPS, with
`index.html` for a folder and `404.html` for a missing page.

A build has two parts:

| Part | Folder in a build | Size | What it is |
|---|---|---|---|
| App | `app/dist/` less `data/` | about 7,800 files | Pages, scripts, styles, images, the service worker |
| Corpus data | `app/dist/data/` | about 9,800 files, 880 MB | Per-work JSON: Greek and English by chapter, alignments, lemmas, search shards, LSJ entries |

The app fetches data as the reader moves. Where it fetches from is a build
parameter (below), so the two parts can sit on one host or on two.

## From sources to a site

```
corpus/greek/*.tsv        Greek text, one printed line per row (committed)
sources/                  English translations and two Greek texts (committed)
manifests/*.yaml          one per work: editions, licences, how to build it
greek-analyses.txt        Morpheus parse table   } not committed; pinned by
grc.lsj.xml               LSJ lexicon            } sha256, from Diogenes 4.7.2
        │
        ▼  pipeline/ (Python, run with uv): nine stages and their gates
build/dist/               corpus data
        │
        ▼  app/ (Astro and Svelte, Node 22), with shared/ compiled in
app/dist/                 the site
```

- **Greek text.** `corpus/greek/` holds every work's Greek as plain line files;
  its README gives the format. The build reads them and runs no outside
  program. Making them afresh (`python -m aristotle_pipeline.extract --all`) is
  a separate step for a machine that holds the digital source texts.
- **Two outside inputs.** The Morpheus table and the LSJ XML are not in the
  repository. `python -m aristotle_pipeline.inputs check` (in `pipeline/`)
  checks the copies it finds against pinned sizes and sha256 sums; the folder
  is named by `DIOGENES_DATA`.
- **Full build.** `npm run build:public` at the root runs the pipeline for every
  work from its public manifest, the corpus-wide checks, the app build, and the
  link check. About five minutes on a laptop.
- **App-only build.** `PUBLIC_SHOW_PRIVATE=0 npm run build` in `app/`, when
  `build/dist/` is already there.
- **`shared/`** is the reader core this site has in common with its sibling
  readers. It is copied between the repositories, not linked.

## Build parameters

All are read at build time. Unset, each gives the primary site's build.

| Variable | Default | What it sets |
|---|---|---|
| `SITE_ORIGIN` | `https://aristotle.johnhboyer.com` | The origin in canonical links, share cards, `robots.txt`, and the sitemap |
| `SITE_BASE` | `/` | The path the site is served under, such as `/aristotle/` |
| `PUBLIC_DATA_ROOT` | unset | Where the app fetches corpus data. Unset: `<base>/data` on the site's own origin. Set: an absolute URL on another host |
| `PUBLIC_GRAMMATA_LOOKUP` | Grammata's `lookup.js` | The address of the grammar lookup script (see outside calls) |
| `PUBLIC_SHOW_PRIVATE` | unset | Must be unset or `0` for anything that leaves the machine. `1` compiles in translations that are not cleared for the public site |
| `DIOGENES_DATA` | each manifest's path | The folder that holds the two outside inputs |

`scripts/site-params.mjs` reads the first two for the Astro config and for the
link check alike, and refuses a value that is not an origin or a base path.

## What runs where today

| Piece | Where | Notes |
|---|---|---|
| App | A Cloudflare Worker serving static assets, at `aristotle.johnhboyer.com` | `npm run deploy:cloudflare`; `docs/cloudflare.md` |
| Corpus data | A Cloudflare R2 bucket, at `aristotle-data.johnhboyer.com` | The build sets `PUBLIC_DATA_ROOT` to it |
| Source | GitHub, `johnhboyer-sys/aristotle-reader` | |

The split exists because a Worker takes at most 20,000 files a version and the
whole site is about 17,600. It is a choice of this host, not of the site. The
site was on GitHub Pages until 2026-11-19; that copy is unpublished, and the
`gh-pages` branch stays as a record.

## A copy any host can serve

Build with `PUBLIC_DATA_ROOT` unset and the data sits beside the app, so one
folder is the whole site. `scripts/make-bundle.mjs` packs that folder as one
`.tar.gz`:

- without two files that belong to the primary's name (`CNAME`, and the search
  console's verification page);
- with a `SHA256SUMS` that names every file, so a copy can be checked with
  `shasum -a 256 -c SHA256SUMS`;
- only after the data has passed the gates a deploy runs, the leak check for
  gated translations among them.

Unpacked at a web root, the bundle is the site. Its canonical links name the
primary, so a mirror does not compete with it in search results.

## Outside calls a visitor's browser makes

| Host | For | State |
|---|---|---|
| The data host | Corpus data, when `PUBLIC_DATA_ROOT` is set | None in a same-origin build |
| `fonts.googleapis.com`, `fonts.gstatic.com` | Web fonts | To be replaced by files in the site (phase 2) |
| Grammata (`PUBLIC_GRAMMATA_LOOKUP`) | The grammar lookup in the word popup and on lemma pages | Stays, by a ruling of 2026-08-29. With it refused, the popup and the lemma page still show their own headword, gloss, and parses; the full LSJ entry says "Lookup failed" |

Links to the sibling readers in the footer are plain links. There are no
analytics and no trackers.

## Checks

| Check | Command | What it proves |
|---|---|---|
| Pipeline tests | `cd pipeline && uv run --with pytest pytest -q` | The stages, and that every letter of every committed Greek line is Greek |
| Script tests | `npm run test:scripts` | The build, deploy, snapshot, and bundle scripts |
| App and shared tests | `cd app && npx vitest run`; `cd shared && npm test` | The reader's code |
| Link check | `node scripts/check-links.mjs` | No broken link or anchor in a built site, at any base path |
| No outside calls | `node scripts/check-no-outside-calls.mjs` | In a browser whose every request passes a recorder that forwards nothing, the built site shows a work page, a word popup, a search, and a lemma page, and asks for no host off its allowed list. Needs Playwright and its Chromium |
| Same output | `node scripts/compare-snapshot.mjs` | A build matches a dated snapshot of the live site: data byte for byte, pages byte for byte once the names a checkout's folder changes are swapped |
| Leak check | Inside `npm run deploy:cloudflare` and `scripts/make-bundle.mjs` | No gated translation's prose in served data, with a positive control |

Two builds of one commit in two folders differ in a few class names and bundle
file names: Svelte hashes a component's absolute path into its style class when
the component lives outside `app/`. `compare-snapshot.mjs` computes the
expected names and accepts those swaps and no others.
