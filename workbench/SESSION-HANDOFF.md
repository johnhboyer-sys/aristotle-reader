# WORKBENCH Session Handoff

_This file is the **Translation Workbench** handoff only — `workbench/`. No
other session's handoff belongs here. Rewrite it (don't append) when you hand
off workbench work._

_Last rewritten: 2026-10-01._

## Where things stand

**John is using the app.** He tested the build from this branch in the real
`.app` on 2026-10-01 and every item passed: typed text survives quit and
reopen; a Physics re-import keeps its eight books after an edit; ⌘Q and the
close button save the last keystroke; footnote text saves; the footnote panel
opens on insert and on a marker click; Summa export to Word looks right; fold,
rename and remove work in the rail.

- **Branch:** `claude/workbench-atomic-save`, five commits on `origin/main`
  (0bebd082cc). **Not pushed, no PR** as of this writing.
- **Test app:** `~/Downloads/Translation Workbench.app`, built from c49f0facee.
  The Aug 28 build sits beside it as `Translation Workbench (Aug 28).app`.
- **Suite:** 1,910 vitest green, `tsc` clean, `npm run smoke` 11 checks.
  `svelte-check` reports 8 errors, all already on main (`CtxMenuItem` in
  ChapterEditor, AssistPopover, LibraryRail) — not ours, not fixed.

## The five commits

1. `45eb0d6179` **Saves write a temp file and rename it into place** (chapter
   files, `works.json`, `settings.json`). `fs:allow-rename` granted.
2. `528d02921a` **The footnote index lost its leading dot** (from a separate
   session). tauri-plugin-fs defaults `requireLiteralLeadingDot` to true on
   Unix, so `/**` scopes refuse any path component starting with a dot — the
   index had never been writable, and a dot-prefixed temp file would have
   broken every save.
3. `37adda7373` **⌘Q saves before quitting.** macOS's built-in Quit ended the
   app inside the 400ms row commit + 1s autosave debounce. ⌘Q is now our own
   menu item (`src-tauri/src/lib.rs`) → `quit-requested` → `lib/quit.ts`
   flushes every open editor → `quit_now`.
4. `0c5a961696` **The close button saves too; quit cannot strand the app; the
   footnote panel opens itself.** Footnote bodies commit before any save; a
   save that fails or takes 10s+ keeps the app open and asks; each ⌘Q is
   numbered so the Rust 5s fallback cannot fire mid-save.
5. `c49f0facee` **A footnote focus request the panel cannot show is dropped**
   (while the Ask or AI panel holds the right slot).

Every commit had a Grok 4.6 static review; each defect it named was fixed and,
where it could be, pinned by a test or smoke step.

## Known, not fixed

- **Dock Quit, logout, shutdown** go through macOS `terminate:`, which tao
  0.35.3 cannot intercept (no `applicationShouldTerminate:`). An edit made in
  the last ~1.5s before those can be lost.
- **A write that never resolves** (a Drive hang) keeps the autosave loop
  waiting; after "Keep Open", later edits join the hung write and are not
  saved. Fixing it means cancelling a write in flight.
- **Windows/Linux** keep the built-in Quit (the swap is macOS-only).

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

1. Push and open the PR (John's call: one PR or several).
2. Open decision for John (security review 2026-09-07,
   `workbench-design/security-review-2026-09-07.md`): `run_program` and
   `assist_run` run any absolute executable. Have Rust hold the picker-approved
   paths, or state plainly that the CSP is the control.
3. Untested since long before this session: export settings' Tauri halves
   (reference-doc picker, pandoc override, the side-by-side bilingual table in
   Word), lexicon pack removal, a true first-run empty state.
4. Parked on John's taste: heading style (big titles vs small labels);
   drag-a-chapter-into-a-Book.
