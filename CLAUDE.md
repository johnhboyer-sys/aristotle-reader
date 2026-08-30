# CLAUDE.md — aristotle-reader

Bilingual Greek/English Aristotle reading site (Astro + Svelte), deployed to GitHub Pages at johnhboyer-sys.github.io/aristotle-reader. Deploy state and the full deploy recipe live in DEPLOY-STATUS.md — read it before any deploy.

## Layout

- `app/` — the Astro site. `pipeline/` — Python corpus pipeline (Diogenes → per-work data). `build/dist` — built corpus data. `shared/` — reader core shared with sibling readers (plato-reader, homer). `workbench/` — Translation Workbench (Tauri, isolated from the site). `desktop/` — desktop reader app (Tauri). `bonitz/` — Index Aristotelicus OCR work, not deployed.
- `ocr_translations/CLAUDE.md` is a self-contained OCR recipe, not project instructions.
- **Handoffs are per track — never one shared `HANDOFF.md`.** Each carries the state of that track: what is done, what was decided and why, what failed. Read the one for the track you are working at the start of a session; rewrite it (don't append) when handing off. A new track starts a new `HANDOFF-<TRACK>.md` at the root.
- There is deliberately no bare `HANDOFF.md`. On 2026-08-25 a Lyceum session wrote its handoff over the LSJ one through that filename, and the LSJ handoff survived only in git history. Do not recreate it.
- Live handoffs, one per track: `HANDOFF-LSJ.md` (LSJ presentation) · `bonitz/BONITZ_HANDOFF.md` (Index Aristotelicus OCR) · `workbench/SESSION-HANDOFF.md` (Workbench doc-structure tools) · `workbench-design/HANDOFF.md` (Workbench design) · `docs/print-design-handoff.md` (print/PDF layout). The names are inconsistent for historical reasons — read the one for your track, and never start a second file for a track that already has one.
- A track whose work has moved to another repo keeps its handoff there, not here.

## Build and deploy invariants

- App-only build: `PUBLIC_SHOW_PRIVATE=0 npm run build` in `app/`, Node 22. The env var is `PUBLIC_SHOW_PRIVATE` (unset/0 = hidden); `PUBLIC_HIDE_PRIVATE` is a stale name from old notes.
- Full corpus rebuild: `npm run build:public` at repo root (runs all gates: preflight, shared-LSJ verify, link integrity).
- `/bonitz` must stay 404 on live (XSS fix outstanding): move `app/src/pages/bonitz.astro` aside during the build, or remove `app/dist/bonitz` before rsync.
- Deploy = rsync into a fresh shallow gh-pages clone, commit, push. Never `rm -rf .git && git init` — times out at this repo size.
- Pre-deploy leak check: no gated-translation prose (Ackrill, Tredennick, Rackham) in data JSON. Known benign hits are listed in DEPLOY-STATUS.md.
- Link-integrity gate must report 0 broken before pushing.

## Hard gotchas

- `serde_json` must stay in `desktop/src-tauri/Cargo.toml` — signed/updater builds need it even though nothing imports it directly.
- Run workbench vitest from `workbench/`, never from a worktree root.
- Svelte 5 tests: `vi.resetModules()` creates a second Svelte runtime (`effect_orphan`); mock `lib/data` to isolate shard caches instead.
- Bonitz transcription is diplomatic: record the printer's errors as printed; corrections must move toward the ink, never away.
