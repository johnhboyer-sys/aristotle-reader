# CLAUDE.md — aristotle-reader

Bilingual Greek/English Aristotle reading site (Astro + Svelte) at aristotle.johnhboyer.com. Since 2026-11-19 it runs on Cloudflare: the app on the Worker `aristotle-reader`, the corpus data on the R2 bucket `aristotle-reader-data` at aristotle-data.johnhboyer.com (`docs/cloudflare.md`). GitHub Pages is unpublished and the old github.io address is gone. Deploy state lives in DEPLOY-STATUS.md — read it before any deploy.

## Layout

- `app/` — the Astro site. `pipeline/` — Python corpus pipeline (`corpus/greek/` line files → per-work data; `python -m aristotle_pipeline.extract` makes those files from Diogenes, locally, and the build never runs it). `corpus/greek/` — the committed Greek, one line-level file per work. `build/dist` — built corpus data. `shared/` — reader core shared with sibling readers (plato-reader, homer). `desktop/` — desktop reader app (Tauri). Bonitz (Index Aristotelicus OCR) lives in its own repo, `~/Developer/bonitz-text` (`johnhboyer-sys/bonitz-text`); it reads this repo's `build/dist` and nothing here reads it. The Translation Workbench (now Moerbeke) moved to its own repo on 2026-10-03, `~/Developer/moerbeke` (`johnhboyer-sys/moerbeke`, private); its corpus scripts read this repo's `build/dist`, `build/export`, `manifests/` and `sources/`, and nothing here reads it.
- `ocr_translations/CLAUDE.md` is a self-contained OCR recipe, not project instructions.
- **Handoffs are per track — never one shared `HANDOFF.md`.** Each carries the state of that track: what is done, what was decided and why, what failed. Read the one for the track you are working at the start of a session; rewrite it (don't append) when handing off. A new track starts a new `HANDOFF-<TRACK>.md` at the root.
- There is deliberately no bare `HANDOFF.md`. On 2026-08-25 a Lyceum session wrote its handoff over the LSJ one through that filename, and the LSJ handoff survived only in git history. Do not recreate it.
- Live handoffs, one per track: `HANDOFF-LSJ.md` (LSJ presentation) · `docs/print-design-handoff.md` (print/PDF layout) · `HANDOFF-ENGLISH.md` (English text corrections; tools and checker notes in `docs/english-sweep/`) · `HANDOFF-REDESIGN.md` (site redesign mockups; kit code in `docs/redesign-kit/`) · `HANDOFF-TOPICS.md` (topic search; report and notes in `docs/topic-search/`) · `HANDOFF-SPURIOUS.md` (the dubious and spurious works: Problemata, De Spiritu, Rhet. ad Alex., De Plantis, the vol. VI works) · `HANDOFF-ATHPOL.md` (the Athenian Constitution; plan in `docs/ath-pol-plan.md`) · `HANDOFF-SEARCH-FOLLOWUPS.md` (search counting, pages, phrases, and smaller items after the redesign; tools in `docs/search-counting/`) · `HANDOFF-SEARCH-PORT.md` (the new search to the other readers) · `HANDOFF-WORDHOVER.md` (Greek↔English word hover and its word-level alignment; method and review page in `docs/mockups/2026-11-18-word-hover/PROCESS.md`) · `HANDOFF-PORTABILITY.md` (building without the laptop, mirrors, and backups, for the four readers and Grammata; snapshot tools are `scripts/snapshot-live.mjs` and `scripts/verify-snapshot.mjs`). The names are inconsistent for historical reasons — read the one for your track, and never start a second file for a track that already has one.
- A track whose work has moved to another repo keeps its handoff there, not here.

## Build and deploy invariants

- App-only build: `PUBLIC_SHOW_PRIVATE=0 npm run build` in `app/`, Node 22. The env var is `PUBLIC_SHOW_PRIVATE` (unset/0 = hidden); `PUBLIC_HIDE_PRIVATE` is a stale name from old notes.
- Full corpus rebuild: `npm run build:public` at repo root (runs all gates: preflight, shared-LSJ verify, link integrity).
- `/bonitz` is 404 on live and must stay so. The page was removed from `app/` on 2026-09-03 (it built empty and carried an unfixed XSS); no move-aside is needed at build time any more. A future Index Aristotelicus reader is built against bonitz-text's output, not resurrected from git.
- Deploy = build with `PUBLIC_DATA_ROOT=https://aristotle-data.johnhboyer.com`, then `npm run deploy:cloudflare` at the root (`scripts/deploy-cloudflare.mjs`: link check, the data gates, changed data to R2, then `wrangler deploy`; `npm run deploy:cloudflare:dry` rehearses). Recipe in `docs/cloudflare.md`. `npm run deploy` (gh-pages) is retired: pushing to gh-pages no longer reaches readers.
- Pre-deploy leak check: no gated-translation prose (Ackrill, Tredennick, Irwin, Rackham) in data JSON. The deploy script runs it with a positive control; known benign hits are its `KNOWN_BENIGN` list and DEPLOY-STATUS.md.
- Link-integrity gate must report 0 broken before pushing.

## Hard gotchas

- **A gate that compares a thing to itself reports green forever.** Three were
  found this way in 2026-09: the Isagoge's Busse column check compared the spine
  against itself; `check-links.mjs` matched only `\d+` in a `loc=`, so a lettered
  citation was *skipped* rather than failed; the alignment gate received offsets
  already clamped and sorted. When you add a check, write the failing case
  first, and make sure the check says so when it examined nothing.

- `serde_json` must stay in `desktop/src-tauri/Cargo.toml` — signed/updater builds need it even though nothing imports it directly.
- Svelte 5 tests: `vi.resetModules()` creates a second Svelte runtime (`effect_orphan`); mock `lib/data` to isolate shard caches instead.
