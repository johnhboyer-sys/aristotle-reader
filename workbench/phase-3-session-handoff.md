# WORKBENCH Session Handoff — sandboxing phase 3

_This file is the **Translation Workbench** handoff — `workbench/`, picking up
at sandboxing phase 3. It was `SESSION-HANDOFF.md` until 2026-10-02; John
renamed it so another session's handoff cannot be written over it. No other
session's handoff belongs here. Rewrite it (don't append) when you hand off
workbench work._

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
- **John tested phase 2 in the built app on 2026-10-02 and every test
  passed** (test page with his ticks and notes:
  https://claude.ai/artifact/GncAkTbQXTsKZHzRpR3nc8, read with ArtifactData
  `steps` / `notes`). Watch-out: three copies sit in `~/Downloads` with one
  bundle id, and reopening from the Dock brought back the old one mid-pass;
  tell John to open `Translation Workbench.app` from Finder.
- The pass found **Translate with AI showing nothing** — a pre-phase-2 bug:
  AssistPopover's `state` prop made Svelte read the `$state` rune as a store
  (`efc8a19e02`, smoke step added; svelte-check 8 → 6 errors).
- **Claude Code's own sign-in** expired mid-test; the app's "needs a
  sign-in" message was right. `claude auth login` fixed it.
- **John's requests from the pass** (not done): the whole-work export window
  should close after "Exported."; single-chapter export should offer the same
  choices (translation only / bilingual…); Import a text should remember the
  TLG folder; clicking the AI spark icon should open assist without a
  right-click; a model picker in the AI sidebar. Citation parsing for
  imports (Theophrastus `40*.1`, `4.61(59).1`; auto books/chapters from
  citation levels) is **another session's track** — John, 2026-10-02.
- **Suite:** Rust 59, vitest 1,864 (+1 live test, `discImportLive`, that
  now fails on John's real Theophrastus cache — the citation track's, not
  ours), `tsc` clean, `npm run smoke` 12 checks, `svelte-check` 6 errors (all
  already on main).
- **Gemini is disabled** (John, 2026-10-02) until its tools can be switched
  off and that is tested. **Grok was not added** (John asked): grok 1.0.46
  ran commands, read and wrote files with every tools-off flag it has. See
  the plan.

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

1. John's say-so on merging phase 2 (or carrying on to phase 3 on this
   branch).
2. Phase 3 (fs scopes + persisted-scope), phase 4
   (graceful re-pick), phase 5 (reviews, test pass).
3. Untested since long before: lexicon pack removal, a true first-run empty
   state.
4. Parked on John's taste: heading style; drag-a-chapter-into-a-Book.
