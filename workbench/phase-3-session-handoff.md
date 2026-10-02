# WORKBENCH Session Handoff — sandboxing phases 3–4

_This file is the **Translation Workbench** handoff — `workbench/`. It was
`SESSION-HANDOFF.md` until 2026-10-02; John renamed it so another session's
handoff cannot be written over it. No other session's handoff belongs here.
Rewrite it (don't append) when you hand off workbench work. The name still
says phase 3 so links keep working._

_Last rewritten: 2026-10-02 (sandbox phases 3–4: John's test pass passed; merge awaits his say-so)._

## Where things stand

**Phases 3 and 4 done on `claude/workbench-sandbox-p3`** (from main after PR
#130). Not merged — John's say-so needed. Full account: "Phases 3–4 as built"
in `workbench-design/sandboxing-plan.md`, with each Codex finding and what was
done about it.

- The window reads `$APPDATA` and `$RESOURCE`, writes `$APPDATA/**` only, and
  reaches anything else only through a dialog pick, kept across restarts by
  tauri-plugin-persisted-scope 2.3.7. No fs permission *set* is used; each
  command is granted alone. An fs global-scope deny refuses `$APPDATA` itself
  and Rust's dotfiles to every command, picks included. Rust creates
  `$APPDATA` at startup.
- `src-tauri/src/capability_tests.rs` sends real fs calls through the IPC
  against the compiled capability (9 tests, each under its own app id).
- Rust checks picks for export's reference doc, Diogenes' disc folder and a
  lexicon pack zip. `pick_status` drives phase 4: the library folder is
  checked at startup (`LibraryRepickDialog`, shell inert meanwhile); Add work,
  Import a text (TLG and PHI), both exports and Settings › Export say why and
  offer "Choose … again".
- Commits: `dc19877ca7` (phases 3–4), `4472601ff0` (Codex + Grok fixes),
  `cba692df8c` (`$APPDATA` itself denied), plus the plan doc.
- **Reviews:** Codex GPT-6-Sol (Rust, capability) — 5 findings, 2 fixed, 3
  recorded; two verification passes, the second's ancestor-pick case accepted
  (plan). Grok 4.6 (frontend) — 7 findings, all fixed; its verification is in
  `workbench/shots/grok-verify-p3.md` (gitignored, like every review file
  there).
- **Suite:** Rust 73, vitest 1,900 (+2 `discImportLive` failures on John's
  real Theophrastus cache — the citation track's, same as on main), `tsc`
  clean, `npm run smoke` 12 checks, `svelte-check` 6 errors (all on main).
- **John's test pass passed, 2026-10-02**: all 11 tests worked in the built
  `.app` (page: https://claude.ai/artifact/9ZQmRgzcun1uU9oFYMfwRM; ticks in
  ArtifactData `steps`, notes in `notes`). Test 1's re-pick steps did not
  apply: his library is in the default place.
- After the pass: Settings › Export says "Line numbers" (was "Bekker line
  numbers") and "At each page or column start only" (`70faab3682`, John's
  request; not in the build he tested).

## Known, not fixed

- **Picks are writable.** The dialog plugin adds a pick to the scope every fs
  command checks; a picked TLG folder or reference doc is writable by the
  window, and a picked folder that contains `$APPDATA` can be deleted with it
  (fails closed; accepted in the plan).
- **Dock Quit, logout, shutdown** go through macOS `terminate:`, which tao
  0.35.3 cannot intercept. An edit made in the last ~1.5s before those can be
  lost.
- **A write that never resolves** (a Drive hang) keeps the autosave loop
  waiting.
- `referenceRoot` is still read from settings but nothing sets it; if it were
  set, reads there would now be refused.
- **Windows/Linux**: built-in Quit kept; Diogenes/perl locations untested;
  `fs:deny-default` denies `$APPLOCALDATA/**` on Linux, which may be `$APPDATA`
  there — untested.

## John's requests (not started)

**The whole-work export's gap report counts opened chapters as done**
(found in the pass): opening a chapter writes its file at once
(`ChapterEditor.svelte:1202`, since phase 1) and `buildGapReport`
(`lib/export/compile.ts`) counts files, so "missing" means "never opened" and
a book can read complete with blank chapters. Count a chapter only if it
holds English; list opened-but-blank ones as missing. Whole-work export window should close after "Exported."; single-chapter
export should offer the same choices; Import a text should remember the TLG
folder (it does try — check after this pass); clicking the AI spark icon
should open assist; a model picker in the AI sidebar. Citation parsing for
imports belongs to the "TLG Greek resource vendoring" session.

## Run it

```
source ~/.nvm/nvm.sh && nvm use v22 && source ~/.cargo/env
npm --prefix workbench test
node workbench/scripts/build-dev-corpus.mjs   # once per checkout; smoke 404s without it
npm --prefix workbench run smoke              # npx playwright install chromium if it says so
(cd workbench/src-tauri && CARGO_INCREMENTAL=0 cargo test)
cd workbench && npm run build && npm run stage:corpus && npm run app:build -- --bundles app
cp -R "src-tauri/target/release/bundle/macos/Translation Workbench.app" ~/Downloads/
xattr -dr com.apple.quarantine ~/Downloads/"Translation Workbench.app"
```

## Hard-won

- **The disk fills.** The Mac ran out of space twice on 2026-10-02; build
  with `CARGO_INCREMENTAL=0` and check `df` before a release build.
- **The capability is tested through the IPC, not by reading the JSON.**
  `generate_context!(test = true)` — a second plain `generate_context!`
  duplicates `_EMBED_INFO_PLIST` and fails to link.
- **`open` is a write command**: it takes write/create options from the window.
- **Re-pick screenshots**: `workbench/shots/repick.html` + `repick-shots.mjs`
  mount each dialog with a fake Tauri bridge (gitignored).
- **Three app copies in `~/Downloads` share one bundle id.** John opens
  `Translation Workbench.app` from Finder; check `ps` before trusting a test.
- **A green suite does not mean the app starts**; smoke does not cover the
  native shell. Never install a build no one can vouch for.

## Next

1. John's say-so on pushing and merging `claude/workbench-sandbox-p3`. After
   it, the app may be shared.
2. His requests above.
3. Parked on John's taste: heading style; drag-a-chapter-into-a-Book.
