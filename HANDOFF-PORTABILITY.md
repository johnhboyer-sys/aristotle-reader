# Handoff — portability, mirrors, and backups (four readers and Grammata)

Written 2026-11-20 from an audit of the repos; rewritten the same day when
phase 0 began. Scope: `aristotle-reader`, `plato-reader`, `homer-reader`,
`greek-plays`, and Grammata (`grammar-site`, `grammars`, `classical-grammars`).
Aristotle goes first; the others take each change as a per-hunk port (`shared/`
is copied between the repos, never synced as a folder).

## State (2026-11-20)

Phase 0 is under way. Nothing in any reader's code has changed.

| Phase 0 step | State |
|---|---|
| Snapshot of each live site, with checksums | Done for all five; each folder and archive verified |
| Leak check on the snapshots | Done; Aristotle passes all five deploy data gates |
| Copies: GitHub release, iCloud, Google Drive, external drive | iCloud and the flash drive done and verified; the other two wait on John |
| First git mirror on GitLab (seven repos) | Waits on John's GitLab account |
| List of unpushed work for John | Done; given to John, not committed |
| Plays history check | Done; findings below, John flips visibility |
| Diogenes version and Homer's export patch recorded | Done, below |

Next: John's GitLab account; then phase 1 (Aristotle builds without the
laptop), whose baseline is measured below.

### Phase 1 baseline: a clean build already matches live

On 2026-11-20 a fresh worktree at `origin/main` (`6e800cdc03`) ran
`npm run build:public` to the end: 50 works, 7,560 pages, 0 broken links,
4 min 53 s. Against the Aristotle snapshot:

- **Data:** all 9,770 files the build makes are byte for byte what live
  serves. Live holds 23 more: the key record and 22 English search shards the
  index no longer names (the bucket never deletes).
- **App:** 7,845 files on each side. 7,614 are identical; 214 are equal once
  bundle hashes are masked; 16 bundles carry another hash; `sw.js` differs.
  The build ran without `PUBLIC_DATA_ROOT`, so the bundle hashes had to
  differ.

So test 2 is within reach, and the build's only inputs from outside the repo
are these:

1. **The Diogenes export, 86 files, 14 MB**, for three TLG authors: 0086
   (Aristotle), 0547, and 2034 (Porphyry, for the Isagoge). That is the upper
   bound on what `corpus/greek/` will hold.
2. **`pipeline/tools/merge_juv.py`, run by hand** after the export. It splices
   TLG works 018 and 037 into a made-up work 918 for *Juv*. No script calls
   it; the build fails at *Juv* without it.
3. **Morpheus and LSJ** from inside Diogenes.app (unchanged from the audit).

And the build's own call to Diogenes no longer works: `stage1_greek.run_export`
passes an environment with no `HOME`, and Diogenes 4.7.2 stops with "Could
not find user profile dir" (exit 25). Nobody saw it because the export was
cached, and the cache is now gone from every checkout. Run by hand with
`HOME` set and `TLG_DIR` at the iCloud folder, the export works. Phase 1's
`extract` replaces that call; do not patch it in place and leave it in the
build.

## Goal

A reader must survive the loss of any one of these: John's laptop, the GitHub
account, the Cloudflare account, or the Loyola OneDrive folder. A stranger with a
clone and the written recipe must be able to build the site and serve it from any
static host.

Done means these tests pass, for each reader:

1. **Clean build.** A Linux container with no Diogenes, no TLG files, and no Mac
   paths builds the full site from a clone plus named, checksummed inputs.
2. **Same output.** That build matches the phase 0 snapshot of the live site:
   every data file byte for byte, every page after masking bundle hashes (the
   masks `scripts/compare-live.mjs` already uses).
3. **No outside calls.** The built folder, served by a plain static server with all
   other hosts blocked, renders a work page, a word popup, a search, and a lemma
   page. Any allowed outside host is on a short list John has ruled on.
4. **Second copy of everything.** Source, built site, and corpus inputs each exist
   in at least two places run by different companies, with checksums, and a
   scheduled check reports when a copy is stale or gone.
5. **Restore drill.** Someone follows `RESTORE.md` from the mirror alone and gets a
   working site. The time it took is written down.

## What the audit found (checked again 2026-11-20)

| | Aristotle | Plato | Homer | Greek plays |
|---|---|---|---|---|
| GitHub repo | public, MIT | public, **no licence** | public, **no licence** | **private**, no licence |
| All heads and tags, less `gh-pages` | 127 MB | 11 MB | 26 MB | 137 MB |
| Old `gh-pages` history | 1,991 MB | 1,220 MB | 288 MB | none |
| `gh-pages` tip now | a redirect page | a redirect page | a redirect page | none |
| Host since 2026-11-19 | Worker + R2 | Worker + R2 | Worker + R2 | Worker, data inside (since 10-24) |
| R2 bucket (wrangler `r2 bucket info`) | 9,793 objects, 459 MB | 7,592 objects, 293 MB | 5,263 objects, 161 MB | none |
| Greek source | TLG 0086 via Diogenes | TLG 0059 via Diogenes | TLG 0012 via Diogenes | TLG via Diogenes; some Perseus and OCR editions |
| Diogenes export on disk | **none** | 9.2 MB | **none** | **none** |
| Fonts | Google Fonts at runtime | self-hosted | self-hosted | Google Fonts at runtime (15 source files) |
| Server code | none | none | none | Worker script: `/api/*` feedback form, email binding |

Each bucket's object count equals its `_deploy/keys.json` plus the record
itself, so the key record names everything in the bucket.

Grammata is larger than the first audit said. It is three repos
(`grammar-site`, private, 5 MB, the site; `grammars`, private, 1.1 GB by
GitHub's count, the data and its scripts; `classical-grammars`, public, 123 MB,
a one-way copy of `grammars`' `data/` and `scripts/` that CI builds from), a
Cloudflare Pages project (`grammata`), and an R2 bucket (`grammata-packs`,
17 objects, 85 MB). `lookup.js` fetches the word packs from
`pub-d505f3fd993b4e01b2ab095428d0493e.r2.dev`. It already builds and deploys in
CI with no laptop (`grammar-site/.github/workflows/deploy.yml`), using a
Cloudflare token held in GitHub's secrets.

The single points of failure, worst first:

1. **The live sites were the only full copy of what they serve.** `build/` is
   git-ignored in every repo; no Aristotle, Homer, or plays build exists on the
   laptop (one built Homer app sits in `~/Developer/homer-reader-speaker-alias/app/dist`,
   2026-11-18). `deploy-cloudflare.mjs` never deletes from R2; on 2026-11-20
   the bucket held 22 search shards no build makes, and nothing else (the
   baseline above). Phase 0's snapshots are now the second copy.
2. **The Greek comes from a licensed disc kept in cloud folders.** Diogenes
   reads the TLG from `~/Library/CloudStorage/OneDrive-LoyolaUniversityNewOrleans/TLG Files/TLG`;
   the plays' recipe names `~/Documents/CLAUDE CODE ARISTOTLE PROJECT/TLG Files/TLG`.
   Both folders list 3,690 files (644.5 MB), and on 2026-11-20 every file in
   both was a cloud-only placeholder: the laptop held no TLG bytes. That day a
   read of `TLG0086.IDT` from the OneDrive folder timed out, with OneDrive
   running; the same file read at once from the second folder, which is
   iCloud's Documents sync and so a copy outside Loyola. Nobody has compared
   the two. `TLG_DIR` points the build at either.
   Stage 1 (`stage1_greek.run_export`) shells out to
   `/Applications/Diogenes.app/Contents/server/xml-export.pl` when the cache is
   missing. Stages 4 and 5 read `greek-analyses.txt` (121 MB, Morpheus) and
   `grc.lsj.xml` (116 MB, LSJ) from `/Applications/Diogenes.app/Contents/dependencies/data`.
   Every manifest hard-codes those paths.
3. **One Cloudflare account holds DNS, the Workers, the R2 buckets, and Grammata.**
   A mirror on another host does not help if the name `johnhboyer.com` stops
   resolving.
4. **LSJ entries load from two addresses John does not own.**
   `shared/components/WordPopup.svelte` and `app/src/components/LemmaPage.astro`
   import `https://grammata.pages.dev/t8/lookup.js`, and that script reads its
   packs from the `r2.dev` address above. A standing ruling (2026-08-29) says
   not to vendor, pin, or proxy the module.
5. **CI cannot build a reader.** `ci.yml` says so: "the corpus is machine-local".
   Deploys run from the laptop through wrangler's login.
6. **One GitHub account, one person, and work that is nowhere else.**
   `classical-philosophy-reader` has no remote: 788 commits on 39 branches
   exist only on the laptop. Aristotle has 28 commits on 8 local branches that
   no GitHub branch holds; `grammar-site` has 1. The main checkouts hold
   modified and untracked files (Aristotle 19 and 24, Plato 10 untracked, the
   plays 15 untracked), and Aristotle's local `main` is 371 commits behind.

## Decisions

All ruled by John on 2026-11-20 unless marked open.

1. **How the Greek enters the build: commit a derived file.** ("Yes, commit
   it.") One line-level file per work (work, page or column, line number, NFC
   text), made by a local `extract` command, in each reader's own repo
   (John: "in each reader's own repo"), in one folder that holds nothing else
   (`corpus/greek/`). Stage 1's parsing stays in the build. The Diogenes XML and
   the disc's beta-code files still never enter a repo. The ruling replaces the
   "never committed" comments in Plato's and the plays' `.gitignore` and the
   "Corpus source text is never committed" line in the plays' and Homer's
   CLAUDE.md; correct those in the PR that adds the files. Reopen the
   own-repo choice if a reader's files pass about 50 MB, if they change often
   enough to swell history, or if John wants one shared source for Moerbeke and
   the Lyceum reader.
2. **Second git host: GitLab.com for all seven repos, now.** Codeberg's terms
   (read 2026-11-20) bar CC NC/ND material in public repos and hold private
   repos to about 100 MB; Aristotle's plates, Homer's Kosmos Butler, and
   several plays sources are NC or ND. John: a Codeberg copy without the NC/ND
   files is possible later, and a third host later if need be. Both are open
   and neither blocks anything. (A copy without those files is a filtered
   history, not a mirror; price it before promising it.)
3. **Licences and visibility.** The plays repo goes public after the history
   check (findings below); John flips the setting himself. MIT for code in all
   four repos ("Yes, MIT + CC0"); CC0 1.0 on the `corpus/greek/` files;
   **CC BY 4.0 on John's own derived data** (alignments, chapter data,
   corrections, Bekker ticks); a per-source table for the rest. Data built from
   LSJ or Perseus texts keeps CC BY-SA 4.0. The table names editions, not the
   TLG (John's rule). Precedent John asked for: the CLLG FREED corpus puts
   CC0 1.0 on its TLG-exported texts and CC BY 4.0 on citation structure and
   metadata (gitlab.inria.fr/almanach/cllg/freed-corpus, read 2026-11-20).
4. **Grammata: keep the 2026-08-29 ruling; mirror Grammata too.** Nothing is
   vendored into the readers. Grammata gets a domain John owns, for the site
   and for the packs bucket; its address becomes a build parameter in every
   reader; it is mirrored and snapshotted like the others. Test 3's allowed list
   is two hosts (the site and the packs) until the packs move under one name.
5. **Where the mirror list shows: the attribution page.** All four readers
   have `/attribution/`. The list also goes in each README and on each mirror.
6. **Second live host: open until phase 2.** John will rule after a test of the
   real mirror bundle on two hosts. Limits read from each host's own page on
   2026-11-20: GitLab Pages 1 GB a site (Aristotle's bundle is about 900 MB);
   Netlify free 300 credits a month (20 a GB of bandwidth, 15 a deploy);
   Neocities free 1 GB, $5 a month for 50 GB; Bunny pay-as-you-go, $1 monthly
   minimum. **Archives: Software Heritage for source, Zenodo by hand for named
   releases, and the Internet Archive; no IPFS.** Zenodo allows 50 GB and 100
   files a record, so a release is one zip; a published record cannot be
   withdrawn. Software Heritage's own page sits behind a bot wall and was not
   read; check its terms before the first save. None of the three gets a copy
   until the licence table exists and the leak check passes.
7. **Old `gh-pages` branches: keep on GitHub, skip in mirrors.** Deleting them
   is a later question, and only once two verified snapshots exist.
8. **John's own actions** (no session can do these): confirm the iCloud TLG
   copy is whole, or make a private copy outside Loyola's OneDrive; the
   registrar and renewal date of `johnhboyer.com`, with auto-renew on; an export
   of the DNS zone; a GitHub account successor or a second owner; who gets the
   keys if he cannot act; a remote for `classical-philosophy-reader`.
9. **Snapshot copies: a GitHub release on each repo, iCloud Drive, John's
   personal Google Drive, and an external drive.**
10. **Open: export-shaped test fixtures.** `pipeline/tests/fixtures/stephanus/euthyphro_p2_3.xml`
    (9.4 KB, two Stephanus pages of the Euthyphro in the Diogenes export's
    markup) has been in `plato-reader`, public, since 2026-07-11, and was
    copied into `homer-reader` and `greek-plays`. Homer also has a 1.6 KB
    "synthetic" Iliad fixture with real opening lines, and Aristotle's pipeline
    tests carry short inline snippets. Phase 1's guard test must either allow
    short fixtures or these become synthetic text. John rules; a history
    rewrite on a public repo would be his call too.

## Phase 0 record

### Snapshots

Made by `scripts/snapshot-live.mjs` (this repo) on 2026-11-20, kept in
`~/Developer/reader-snapshots/2026-11-20/<site>/` with `MANIFEST.json` (every
file's address, size, hash, and how it was found; every 404 and redirect) and
`SHA256SUMS`. `scripts/verify-snapshot.mjs <folder or archive>` checks a copy;
so does `shasum -a 256 -c SHA256SUMS`.

| Site | App files | Data files | Bytes | Archive | Not found | Left open |
|---|---|---|---|---|---|---|
| Aristotle | 7,845 | 9,793 | 889 MB | 189 MB | 18 | nothing |
| Plato | 5,582 | 7,592 | 820 MB | 129 MB | 16 | nothing |
| Homer | 4,787 | 5,263 | 348 MB | 60 MB | 22 | nothing |
| Plays | 10,975 in all (data ships in the app) | | 444 MB | 106 MB | 20,753 guesses | the whole is unproven |
| Grammata | 4,725 | 15 packs | 2,130 MB | 445 MB | 8 | 2 bucket objects unnamed |

Aristotle's app count equals the 7,845 files `docs/cloudflare.md` records for
the 2026-11-19 deploy. The archives are `<site>-snapshot-2026-11-20.tar.gz`,
with `SHA256SUMS` at each one's root and a second `SHA256SUMS` beside them for
the archives themselves. "Not found" for the three R2 readers is old bundle
names in the last `gh-pages` tree, `.DS_Store` files, and `/favicon.ico`.

How each part was found, and what that proves:

- **Data on R2 (Aristotle, Plato, Homer):** every key in the bucket's key
  record, fetched from the data address, with its MD5 checked against R2's
  ETag. The bucket's object count equals the record plus one. This part is
  complete.
- **App on a Worker:** Cloudflare cannot list a Worker's files, so the app was
  walked from the sitemap, the last full `gh-pages` tree (the parent of each
  redirect commit), `app/public` at `origin/main`, and every same-origin
  address the fetched pages, stylesheets, and scripts name. A file that only a
  script builds the name of, and that no list names, would be missed. Every
  sitemap page was saved.
- **The plays:** no key record and no `gh-pages` tree. The data list came from
  `scripts/snapshot-candidates.mjs`: the site's own indexes (each work's
  manifest, `lemmata/_index.json`, `search-shards/index.json`), the three key
  records with the work and numbers taken out, and file names the plays' code
  mentions. Measured the same way against a reader whose real list is known
  each of the other three, from the other two's records): it named 97.8% of
  Homer's real keys, 95.6% of Plato's, and 99.6% of Aristotle's. The misses
  were each reader's own families (Homer's scansion, Cunliffe, and plates),
  Plato's per-translation files (its manifests list no translations; the
  plays' do), and search shards the index does not name (Plato's `accents`
  stream; 22 stale English shards in Aristotle's bucket). So the plays'
  snapshot is a floor, not a proven whole; phase 4's clean build is diffed
  against it.
- **Grammata:** the Pages site walked from its home page, `public/`, and
  `/t8/lookup.js` (no page links the module the readers import, so the list
  names it). The site has no sitemap and no 404 page: it answers any missing
  address with its home page and a 200. The first run saved nine such copies
  under names like `robots.txt` and `sw.js`; the tool now asks the host for
  an address that cannot exist and counts any file equal to that answer as
  not found. The packs were fetched by the 15 names in `classical-grammars`'
  `data/wordtool`, and each pack matches the hash in Grammata's own
  `manifest.json`. The bucket holds 17 objects, so two are not named by the
  repo and are not in the snapshot; the laptop's rclone token cannot list
  that bucket.

### Review of the tools

Codex (GPT-6.1-Sol) read the three snapshot scripts and returned 16 findings.
Ten were real gaps and are fixed, each with a test that fails without the fix:
the verifier followed links and missed names a Mac holds as one file; the
walk could save one address over another; a data file with no ETag passed
unchecked; an empty key record passed; a dead redirect left no trace in the
exit code; the link finder missed the bundler's own file lists and `url()` in
HTML. None had touched today's copies: the fixed link finder, run over all
five snapshots, named no address the walk had not tried; no two saved names
collide; every data file's ETag was checked; and all ten copies pass the
stricter verifier. A second pass found smaller gaps, fixed the same way: a
doubled slash in an address, a page sent under a file's name (the tool now
refuses `text/html` at a name like `x.js`), two more link shapes, and a
mirror check that compared branch tips only (it now clones the mirror and
runs `git fsck`, since a mirror pushed from a shallow checkout has the right
tips and no history). A third pass closed those and found three small
faults in the fixes, also fixed. Left as they are, on purpose: queries are dropped from
addresses (static hosts); a 404 that a page names, and a redirect that leaves
the site, are listed in the manifest without failing the run.

### Leak check

Aristotle's snapshot went through the five data gates `deploy-cloudflare.mjs`
runs (`scanForLeaks`, `scanGatedSlots`, `scanHeldWorks`,
`scanTranslationIndexes`, `scanSearchShards`), after a planted "Tredennick"
file failed the first as it must: 9,698 JSON files, the control word in 1,633,
no Ackrill, Tredennick, or Irwin, and Rackham only in the two files
`KNOWN_BENIGN` lists. The siblings keep no list of gated names; the same name
scan over their data (Plato 7,555 JSON files, Homer 5,260, the plays 10,670,
each with a control word found) hit twice, both in Shorey's footnotes to the
Republic citing Rackham and Grube as scholars. Grammata holds grammars and
lexica, no translations, and was not scanned.

### Copies

| Copy | State |
|---|---|
| Laptop, `~/Developer/reader-snapshots/2026-11-20/` | folders and archives, verified |
| iCloud Drive, `reader-snapshots/2026-11-20/` | five archives, verified where they sit; macOS reports all uploaded |
| GitHub release `snapshot/2026-11-20` on each repo | waits on John's yes (public on the three public repos) |
| Google Drive (John's personal account) | waits on John: Drive for desktop is not installed |
| Flash drive `BOYER USB`, `reader-snapshots/2026-11-20/` | five archives, verified where they sit |

### Open after phase 0

- A past session's `wrangler deploy --dry-run` read 25,362 files from an
  Aristotle worktree's `app/dist`; live holds 17,638 and a clean build's
  `app/dist` holds 17,615. The larger count did not come back; that
  worktree's dist was not a clean build.
- The plays' deployed file count: Cloudflare reports none for a Worker's
  assets, and the 9,739 in `app/wrangler.jsonc` dates from 2026-10-23.
- Grammata's two unnamed bucket objects.

### Plays history check (every blob in all 52 refs; 6,346 blobs, 1,087 MB)

No raw TLG or PHI file names, no Diogenes export paths, no dense beta-code
text, no key or credential files, no build output. What John should know
before the repo goes public:

- The export-shaped Euthyphro fixture (decision 10).
- `app/wrangler.jsonc` and `app/worker/index.js` name John's Gmail address as
  the feedback form's destination, and the Cloudflare account id.
- `sources/kosmos/*.html` (13 saved pages) carry a Google API key that belongs
  to the Kosmos Society's own page. It is theirs and public, but GitHub's
  secret scanning may flag it.
- Eugene O'Neill Jr. is named only in rules, the allowlist, and docs; none of
  his text is in the history. All 81 `sources/perseus` XML files carry a
  Perseus header.
- `docs/redesign/drawings/contact-sheet.html` is in history eight times at
  about 20 MB each: most of the repo's 137 MB.

The search was tested first on a small repo with a planted TLG file name, a
beta-code file, an export XML, and a token, all removed by a later commit; it
found each one.

### Diogenes

Diogenes.app 4.7.2 (`xml-export.pl` dated 2025-02-06; `grc.lsj.xml` and
`greek-analyses.txt` dated 2025-02-21). Homer's "patched `-y` export" is
obsolete: 4.7.2 has `-y`/`-Y` built in. The plays' `docs/tlg-phi-export.md`
records the change (2026-08-29) and a byte-for-byte calibration of the native
path against a 4.5-era export; the old patch survives there only as history.
Homer's CLAUDE.md still says "patched"; its port session corrects it.

## Plan

Each phase ends in a check a machine can run. Finish Aristotle through phase 3
before porting.

### Phase 0 — copies first, no changes to any reader's code

State table at the top. Still to do once John has a GitLab account: push each
repo's heads and tags (less `gh-pages`) from a fresh fetch of `origin`; every
project starts private. *Check: `scripts/mirror-check.mjs --source=<GitHub>
--mirror=<GitLab>` compares `git ls-remote` on both hosts and fails on a
missing ref, a ref at another commit, an unreadable remote, or a source with
no refs; its tests start from a deleted ref.*

### Phase 1 — build without the laptop (Aristotle)

- `extract` (local, needs TLG) writes the committed line-level files (decision 1).
  `build` reads only those and raises if one is missing; it never runs Diogenes.
  Measure the files' total size per repo before the first commit and tell John.
  *Check: a test that the committed files hold no beta code and no Diogenes XML
  markup, with a planted case that fails it.* (Decision 10 settles the fixtures.)
- Morpheus table and LSJ XML: fetched from a pinned source with a checksum; path
  from the environment, with the Diogenes.app path as a local default only.
- Remove the other machine paths from the public build (`/tmp/perseus-ne/...` in
  the manifests). Offline tools may keep theirs.
- Diff the snapshot's data against a clean build (done once, by hand, in the
  baseline above; make it a script and a CI step). The 22 stale shards on
  live need a ruling: delete them from R2, or leave them.
- `merge_juv.py` becomes part of `extract`, so *Juv*'s spliced spine is a
  committed file like the rest.
- *Check: tests 1 and 2. CI runs the full build (about 4 minutes locally) and
  uploads the bundle.*

### Phase 2 — a bundle any host can serve

- Build parameters for site origin, base path, data root, and the Grammata
  address; defaults give today's build. The mirror bundle has same-origin data,
  base `/`, and canonical links to the primary.
- Self-host the fonts. Make the plays' feedback form hide when `/api` is absent.
- `Dockerfile` (build, then Caddy), `ARCHITECTURE.md`, `RESTORE.md`.
- Test the real bundle on two candidate hosts and bring John the results
  (decision 6).
- *Check: test 3, plus a second build at a test base path that passes the link
  check and the same browser test.*

### Phase 3 — mirrors that follow a deploy

- The deploy script, after a deploy succeeds, tags `deploy/<date>` and attaches the
  bundle and `SHA256SUMS` to a GitHub release.
- `.github/workflows/mirror.yml`, calling repo scripts: on every push, mirror git
  (`fetch-depth: 0`; `refs/heads/*` and `refs/tags/*`, less `gh-pages`); on a
  release, verify the bundle's checksums, run the leak check with its positive
  control, then publish to the second host. Zenodo and the Internet Archive run
  only by hand.
- A weekly job reads `version.json` from each mirror, compares it with the latest
  release, and opens an issue when one is stale or silent.
- `mirrors.json`, shown on the attribution page (decision 5).
- *Check: test 4, then test 5 run once by hand.*

### Phase 4 — port

Plato, then Homer, then the plays, then Grammata's address and domain. Per
hunk, with each repo's own rules read first. The plays differ most: data ships
inside the Worker, the Worker has a script, the repo is private, and
`PUBLIC_SITE_ORIGIN` already exists.

## Why the plan is shaped this way

The plan answers a prompt John brought from Gemini. Where that prompt was wrong:

| It says | What is true | Do this |
|---|---|---|
| Build compiles `dist/` from a committed `data/corpus/` | Three steps: TLG → Diogenes export (`build/export`) → nine pipeline stages and gates (`build/dist`) → Astro (`app/dist`). The site is split: app on a Worker, data on R2, joined by `PUBLIC_DATA_ROOT` at build time. | Cut the pipeline at stage 1's input, not at `dist`. |
| Extraction runs on every build | It runs only when `build/export` is missing. The trouble is that the cache is not kept anywhere. | Make the build refuse to call Diogenes; keep the extract as a named input. |
| Only the Greek text is local | So are the Morpheus table and the LSJ XML, both read from inside Diogenes.app. | Fetch both from a pinned source with a checksum. |
| Check `dist/` is 100% identical before and after | Pages are not byte-stable: a clean rebuild of the same commit differed from live on 213 pages and 5 bundles (docs/cloudflare.md). | Compare data by hash and pages with masks, against the phase 0 snapshot. |
| Replace domains with `./` so one `dist` runs in any subfolder | Astro bakes `base` into every page; sitemap, canonical links, robots, and OG cards need an absolute origin. | Make origin, base, and data root build parameters. A subfolder is a rebuild with a different base, proved by one test build. |
| Bundle every outside script | Right for fonts. Wrong for Grammata, which a ruling forbids. The plays' feedback form needs a Worker. | Decision 4. The form hides itself when its endpoint is absent. |
| Dockerfile that serves `dist/` | A static folder needs no container. What is missing is a pinned build environment. | One Dockerfile: build stage, then Caddy. Building it in CI is test 1. |
| Mirror on every push to `main` | Deploys are John's call in every repo. | Git mirrors follow every push. Site mirrors follow a deploy tag. |
| `git push --mirror` | `--mirror` pushes `refs/pull/*` (refused) and `gh-pages` (1.2–2 GB). `actions/checkout` clones shallow by default. | `fetch-depth: 0`; push heads and tags only, less `gh-pages`. |
| Pin to IPFS | Pinata's free plan holds 1 GB and 500 files, Filebase's 5 GB and 500 pinned files; a pin lasts only as long as the account. | Dropped (decision 6). |
| The workflow is the system | The workflow would itself depend on GitHub. | Put the logic in repo scripts; the workflow only calls them. |

## Sessions

One lead session, rooted in `aristotle-reader`, takes Aristotle through phase 3
and does phase 0 for all five sites (it changes no reader's code). Then one
port session per sibling, each rooted in its own repo: Plato's, Homer's, and
the plays' `CLAUDE.md` forbid editing a sister repo from another repo's
session. The ports touch separate repos, so they can run side by side, each
briefed from Aristotle's merged PRs. The lead session starts them once
Aristotle's phase 3 is merged, checks their reports, and brings John only
decisions.

## Rules for the session

- Work in a fresh worktree from `origin/main` in each repo. The main checkouts are
  stale and hold other sessions' uncommitted work; do not touch them.
- Deploys, pushes to a new host, new accounts, spending, licences, making a repo
  public, and anything that cannot be recalled are John's call.
- Read each repo's `CLAUDE.md` and `docs/cloudflare.md` first.
- Every new gate gets its failing case first and says how much it examined.
- Never commit raw TLG files or the Diogenes XML. Run the gated-translation leak
  check before any copy leaves the machine; Zenodo, Internet Archive, and
  Software Heritage copies cannot be recalled.
- No new npm or Python packages without a reason in the commit message.
- Load the `delegate` skill before any subagent. The implementer and the reviewer
  come from different model families.
- In zsh, never name a loop variable `path`: it is tied to `PATH` and empties it.

## Secrets John will add

| Secret | For | Needed when |
|---|---|---|
| `MIRROR_GIT_SSH_KEY` (a deploy key per repo, write access) and `MIRROR_GIT_URL` | git mirror to GitLab | phase 3 |
| Second host's deploy token and site id | live mirror | after decision 6 |
| `ZENODO_TOKEN` | archive releases | manual job only |

No R2 S3 token was needed for phase 0: the key records are complete. No
Cloudflare token goes into the readers' CI unless John wants CI to deploy the
primary.

## Not covered

The Aristotle desktop app and its updater; Moerbeke; bonitz-text;
`classical-philosophy-reader` beyond noting it has no remote; `~/.claude` memory
and review notes, which hold much of how these sites are run and live only on the
laptop.
