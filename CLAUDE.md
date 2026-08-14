# CLAUDE.md — aristotle-reader

Bilingual Greek/English Aristotle reading site (Astro + Svelte), deployed to GitHub Pages at johnhboyer-sys.github.io/aristotle-reader. Deploy state and the full deploy recipe live in DEPLOY-STATUS.md — read it before any deploy.

## Layout

- `app/` — the Astro site. `pipeline/` — Python corpus pipeline (Diogenes → per-work data). `build/dist` — built corpus data. `shared/` — reader core shared with sibling readers (plato-reader, homer). `workbench/` — Translation Workbench (Tauri, isolated from the site). `desktop/` — desktop reader app (Tauri). `bonitz/` — Index Aristotelicus OCR work, not deployed.
- `ocr_translations/CLAUDE.md` is a self-contained OCR recipe, not project instructions.
- `HANDOFF.md` carries the state of the most recent session — what is done, what was decided and why, what failed. Read it at the start of a session; rewrite it (don't append) when handing off.

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
