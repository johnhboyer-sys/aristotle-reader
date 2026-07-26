# Translation Workbench — D8 Handoff (2026-07-07)

**Corpus-free documents + paragraph/interpolated views** — built overnight, reviewed, ready for your hand-testing.

## Where things are

- **App:** `~/Downloads/Translation Workbench.app` — rebuilt from the D8 branch, de-quarantined (⌘Q + relaunch if it was open). It **contains all of PR #20** (D8 branched from its head), so your #20 QA continues on this same build.
- **Branch:** `claude/workbench-paragraph-views` — 11 commits, local-only (NOT pushed), in worktree `.claude/worktrees/unruffled-raman-97a20c`. Base = PR #20 head `39849421`.
- **Design doc:** `workbench-design/d8-view-modes.md` (+ memo pair `d8-memo-deep-reasoner.md` / `d8-memo-codex.md`).
- **State:** 1352 vitest passed / 9 skipped · tsc clean · svelte-check 0 errors · vite + tauri build clean · every phase live-verified in the browser dev harness · full Codex adversarial review run, 4 findings all fixed + regression-pinned.

## What's new (one paragraph)

The workbench no longer requires a corpus spine or line numbers. "New document…" in the library rail takes pasted or file text in any language, detects lines-vs-paragraphs (you can override), and creates a free-standing document with `¶N` or plain line numbering. Paragraph docs get a **Paragraph view** (original left, your translation right, one row per paragraph) and an **Interpolated view** (original shown under the field you type in, switchable between by-paragraph and by-sentence). Sentences are auto-detected at import and fixable by hand. Paragraph-level and sentence-level translations are **two coexisting layers** — switching granularity never moves, splits, or destroys your text; the other layer shows as a read-only block. Paragraphs can be split/merged (renumbering is automatic), line texts can be grouped into paragraph chunks, and the AI suite, export (incl. bilingual), and undo all work across the new units. Aristotle/Bekker behavior is byte-identical — regression-locked by tests.

## Testing checklist

The full step-by-step list is at the top of `workbench-design/TODO.md`. Short form:

1. **Create:** New document… → paste multi-paragraph prose, set title + a language label (e.g. "German") → detects "paragraphs" → opens in Paragraph view.
2. **Paragraph view:** type a translation, blur, quit/reopen → persists (`[ENGLISH.PARA]` in the file).
3. **Interpolated:** By sentence → per-sentence fields with source beneath; By paragraph → whole-paragraph field, sentence tick marks in the source, your sentence text as a read-only block; ⌘Z is per-layer.
4. **Structure:** right-click original → Split paragraph here / Merge with previous (confirm only when both have text); on paragraph rows D6 gestures read "Start new sentence here" / "Join sentences".
5. **Plain-line doc:** paste verse with stanza gaps → "lines" → grid; Paragraphs view chunks by the gaps; right-click to regroup.
6. **AI (needs the .app):** four modes on the paragraph cell with paragraph wording; Translate fills only the paragraph layer; batch "Translate N paragraphs" warns before overwriting.
7. **Export:** paragraph doc → docx with real paragraph breaks, `…` gaps, no stamps; Compile "Greek and English" → interleaved (this was one of the review fixes).
8. **Regression (5 min):** Metaphysics Ζ.17 — identical grid, no view toggle, D6 labels unchanged.

## What the adversarial review caught (all fixed)

1. Para-layer footnote markers could orphan bodies / resurrect empty footnotes → footnotes are now sentence-layer only, markers stripped losslessly at file boundaries.
2. A malformed `paragraph_starts` made the whole file unopenable → now degrades with a one-line notice.
3. Bilingual compile of free docs silently exported English-only → real bilingual interleaving implemented.
4. Paragraph "Check my translation" ignored sentence-layer text → now reads the draft you see.

Two earlier seam bugs were caught by successive build phases: paragraph-view commits corrupting the sentence layer (D1, fixed in D2) and stale cells after paragraph splices (D3, fixed in D3).

## Deferred to the refinement pass (your call later)

- Plain-line rows show chunk "Start paragraph here" adjacent to D6's intra-line "Start new paragraph here" — confusable wording.
- Busse (corpus-paragraph) works fall back to the grid rendering in paragraph view.
- Multi-sentence AI suggestions are flattened to one line by `sanitizeSuggestion`.
- Interpolated originals are display-only (structure gestures live in the two-column views).
- v1 scope excludes: paragraph-grouping the Aristotle corpus, auto-splitting English, multi-chapter free documents.

## If you want changes tomorrow

Resume in the worktree: `cd ~/Developer/aristotle-reader/.claude/worktrees/unruffled-raman-97a20c/workbench && npm install && node scripts/build-dev-corpus.mjs` (if freshly cleaned), tests via `npx vitest run`, app rebuild via `source ~/.cargo/env && npm run app:package`. The branch is unpushed — say the word to push/PR it after testing.
