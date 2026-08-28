# WORKBENCH Session Handoff

_This file is the **Translation Workbench** handoff only — `workbench/`. It is
not the repo-wide `HANDOFF.md` at the root, and no other session's handoff
should be written here. Rewrite it (don't append) when you hand off workbench
work._

_Last rewritten: 2026-08-28, evening._

## Where things stand

- **Branch:** `claude/workbench-autonomous-capabilities-e6fc26`, pushed.
- **[PR #102](https://github.com/johnhboyer-sys/aristotle-reader/pull/102) — MERGED** into `main` (2026-08-27): eight backlog items.
- **[PR #103](https://github.com/johnhboyer-sys/aristotle-reader/pull/103) — MERGED** (2026-08-28 evening): author names, rename a work, the smoke run, and the divisions work below.
- **Suite:** 1,840 vitest green from `workbench/` (never a worktree root). `npx tsc --noEmit` clean. `npm run smoke` passes.
- **Test app:** `~/Downloads/Translation Workbench.app`, rebuilt from everything merged. De-quarantined.
- **QA so far (John, 2026-08-28):** re-imported the Physics — the eight books came in with their outline, the 71 chapters with them, and he renamed the work and its author. The export pass and the older untested list below are still open.

## What shipped since the last handoff

PR #102, in the order it was asked for:

1. **An imported work could not be reopened.** `row_refs` joins addresses with commas and 78 of Aristotle's lines are numbered `205a.25,29`, so the address split in two on read and the 1:1 row check refused the file. John's own `physica/b01c01.md` was in that state (5524 refs vs 5520 rows). Addresses are percent-escaped now; a file already written is repaired on read (bare-number entries rejoin, accepted only when the count lands exactly). **The "imported works get no outline" thread was never about the headers line.**
2. **Marked lines print as headings in the export** — book `##`, chapter `###`, in-page `####`+depth, subtitle as an italic line. Bilingual: English is the heading, source italic under it (John's rule, 2026-07-31), except `block` layout where each stream carries its own.
3. **Disc imports no longer collide** — `importFromDisc` takes `existingIds`.
4. **Remove a work** — rail menu, confirms in the menu itself. Needed a new `fs:allow-remove` capability.
5. **Fold a work; works shelved by author** (`lib/works/authorGroups.ts`).
6. **A work's language is editable** in Work details….
7. **The retired container-slot model** (`books` in works.json) is out of the registry.
8. **Perseus Bekker numbers import.** Milestone state carries across division boundaries, and a page with something finer under it IS the address; a page alone is not, so Plato stays `1.327a`.

PR #103, from John's QA:

- **An import now arrives divided.** A TLG disc has no chapter level, so the
  Physics used to import as 8 title lines and 5,520 rows with none of its 71
  chapters. `scripts/build-divisions.mjs` folds `manifests/<ID>.yaml` +
  `build/dist/<ID>/chapters.json` into a 93KB table (46 works, 1,973 chapters,
  citation data only) staged beside the corpus resources; the importer matches
  each chapter's Bekker address to a row. Chapters are BOUNDARIES (label + row,
  `works/chapterContainers.ts`), never marks — a marked row becomes a title and
  drops out of the text, and chapter 1 starts at 184a10, mid-prose.
  Measured on the real cache: 39 works, everything placed but 4 of the
  Mirabilia's 178.
- **Books are lettered from their own title lines** (`works/bookLetter.ts`):
  Book Α–Θ, not Book 1–8, and the rail no longer prints the title line under
  the Book named after it. Narrow rule — first node only, letters must agree —
  so a hand-made "Prima Pars" hides nothing.
- ⚠️ **Divisions apply at IMPORT only.** A work already in the library gets
  them by re-importing (it lands as `<id>-2`), or not at all. If that becomes a
  nuisance, the fix is to store the TLG ids on the record and add a rail
  command that re-applies.

- **The disc's alternate name joined the author's.** `TLG0086 …Corpus Aristotelicum&\x80Aristotle` — 0x80 introduces the English name (13 authors have one). The parser dropped the marker and kept reading. Fixed at the parser; **existing registry entries keep the fused name until edited.**
- **Rename a work** — Work details… leads with Title. The id never changes: it is the folder name the chapter files live under.
- **The work you were reading could not be folded** (the unfold effect undid the user's own click).
- **The editor header kept the loaded name** after a rename (a document work's fixture is cached until the locus changes).
- **`npm run smoke`** — see below.

## Run it

```
source ~/.nvm/nvm.sh && nvm use v22.23.1 && source ~/.cargo/env
npm --prefix workbench test            # vitest, 1,825
npm --prefix workbench run smoke       # browser pass, fails on any console error
cd workbench && npm run build && npm run stage:corpus && npm run app:build -- --bundles app
cp -R "src-tauri/target/release/bundle/macos/Translation Workbench.app" ~/Downloads/
xattr -dr com.apple.quarantine ~/Downloads/"Translation Workbench.app"
```

The Tauri build takes ~90s warm. `npm run smoke` needs a browser for THIS
Playwright build — `npx playwright install chromium` if it says so (the cache is
shared with other checkouts and can hold a different revision).

## Hard-won this week

- **A green suite does not mean the app starts.** A prop added to a component's
  TYPE but not to its destructuring threw at render with `tsc` clean and every
  test passing. That is what `npm run smoke` exists for; it fails on any console
  error and names the step. A sweep found no other instance in the 31 components.
- **`.svelte` edits hot-reload; `src/lib/**` edits may not.** Say which kind a
  fix is before asking John to test it.
- **The live tests over the disc cache carry a 60s timeout.** They parse 55
  works and 122,429 citations; the vitest default is a coin flip on a machine
  that is also compiling.
- **The Metaphysics books are lettered in GREEK.** A selector looking for
  "Book A" with a Latin A matches nothing.

## Next, in the order I'd take it

1. **John's QA of the real `.app`** — nothing below is worth much until this
   happens. First: re-import Physics from the disc (it should arrive as
   `physica-2` with eight books in the outline). Then export the Summa and check
   Word's navigation pane. Then the rail: fold, author shelves, rename, remove.
2. **Untested since long before this week**: export settings' Tauri halves
   (reference-doc picker, `run_program` pandoc override, the three bilingual
   layouts and especially the side-by-side table in Word), lexicon pack REMOVAL,
   a true first-run empty state.
3. **Parked on John's taste**: heading style — big titles vs small labels; and
   drag-a-chapter-into-a-Book (he chose "skip for now" once already).
4. **Offered, not built**: the Add work… dialog's dead end. When every corpus
   work is already in the library it says "Every available work is already
   here" and stops, instead of pointing at "Import a text…".
