# WORKBENCH Session Handoff

_This file is the **Translation Workbench** handoff only — `workbench/`. No
other session's handoff belongs here. Rewrite it (don't append) when you hand
off workbench work._

_Last rewritten: 2026-10-01 (sandbox phase 2)._

## Where things stand

**Sandboxing, phase 2 done, on `claude/workbench-sandbox`** (pushed, no PR,
not merged — John's say-so needed). Plan and "phase 2 as built":
`workbench-design/sandboxing-plan.md`.

- The window names a job and supplies data; Rust picks the program and
  builds the arguments (`src-tauri/src/commands.rs`). `run_program`,
  `assist_which`, the argv `assist_run` and the shell plugin are gone.
- Commits: `f2ec0360f5` (phase 2), `518037fcbd` (Codex + Grok review fixes),
  then a follow-up from Codex's verification (separators and invisible
  characters refused in the custom-command alert).
- **Test app:** `~/Downloads/Translation Workbench.app`, built from this
  branch for John's test list (plan, last section) — export, TLG import, AI.
  The previous build is beside it as `Translation Workbench (atomic-save).app`.
- **Suite:** Rust 59, vitest 1,864, `tsc` clean, `npm run smoke` 11 checks.
  `svelte-check` still reports the 8 errors already on main.
- **Gemini is disabled** (John, 2026-10-02) until its tools can be switched
  off and that is tested.

## Known, not fixed

- **Phase 3 is required before sharing:** the window can still write `/**`,
  so it could overwrite a program Rust runs. Reference-doc and disc-folder
  "was it picked" checks also wait for phase 3 (persisted-scope).
- **Dock Quit, logout, shutdown** go through macOS `terminate:`, which tao
  0.35.3 cannot intercept. An edit made in the last ~1.5s before those can be
  lost.
- **A write that never resolves** (a Drive hang) keeps the autosave loop
  waiting.
- **Windows/Linux**: built-in Quit kept; Diogenes/perl locations untested.

## Run it

```
source ~/.nvm/nvm.sh && nvm use v22 && source ~/.cargo/env
npm --prefix workbench test
node workbench/scripts/build-dev-corpus.mjs   # once per checkout; smoke 404s without it
npm --prefix workbench run smoke              # npx playwright install chromium if it says so
cd workbench && npm run build && npm run stage:corpus && npm run app:build -- --bundles app
cp -R "src-tauri/target/release/bundle/macos/Translation Workbench.app" ~/Downloads/
xattr -dr com.apple.quarantine ~/Downloads/"Translation Workbench.app"
```

## Hard-won

- **The smoke run needs `.dev-corpus/`** (gitignored, TLG-derived). A fresh
  checkout fails "open a corpus chapter" with 404s until
  `scripts/build-dev-corpus.mjs` builds it.
- **A green suite does not mean the app starts** — `npm run smoke` exists for
  that. And smoke does not mean the native shell works: quit, close, menus and
  fs permissions only show up in the built `.app`.
- **Never install a build you cannot vouch for.** The first temp-file cut would
  have made every save fail; it was caught by review before it reached
  `~/Downloads`.

## Next

1. John tests the built `.app` (plan's test list; phase 2 touches export,
   Reveal in Finder, Add work from TLG, disc import, AI with Claude/Codex,
   Settings › Export pandoc pick, Settings › AI custom command).
2. Phase 3 (fs scopes + persisted-scope), phase 4
   (graceful re-pick), phase 5 (reviews, test pass).
3. Untested since long before: lexicon pack removal, a true first-run empty
   state.
4. Parked on John's taste: heading style; drag-a-chapter-into-a-Book.
