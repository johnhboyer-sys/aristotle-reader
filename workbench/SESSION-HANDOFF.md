# Session Handoff — Document Structure Tools (Workbench)

_Last updated: 2026-07-30 (evening)_

## Where things stand

- **Branch:** `claude/doc-structure` (based on `origin/main`), pushed.
- **Test app:** `~/Downloads/Translation Workbench.app` — de-quarantined, corpus bundled.
- **Tests:** 1570 passing (`npm test` from `workbench/`); `npx tsc --noEmit` and `npx vite build` clean.
- **Not PR'd yet** — this is a working branch. `origin/main` has moved on with website deploys since it was cut, so it needs a rebase before any PR.

### Tested live on the real Summa (2026-07-30) — all working
Create a Book · rename · right-click menus · **"Begin a book here…"** · **Remove Book** (chapters
regroup, no text lost). `+ Book` inserts no text, which was the bug that started the redesign.

### Also shipped that day, NOT yet tested by John
- **Whole-work export was broken for every work and is now fixed.** `resolveResource('reference.docx')`
  pointed at `Contents/Resources/reference.docx`, but `tauri.conf.json` declares the resource as
  `resources/reference.docx`, so the bundler puts it one level deeper. Pandoc got a `--reference-doc`
  for a nonexistent file and refused. Single-chapter export always worked because it passes no
  reference doc. Now resolves the declared path, checks it exists, falls back to pandoc's own styling
  rather than failing, and the error note quotes pandoc's first line instead of shrugging.
- **File type: Word (.docx) or Markdown (.md)** in the export dialog. Markdown skips pandoc entirely,
  so a machine without pandoc can still export. Both control groups lock while an export runs.
- **"Bilingual"** replaces "Greek and English", and the filename names the work's OWN language
  (`Summa Theologiae (Latin and translation).docx`), read from the language you typed at import.
  Aristotle still reads "Greek and translation"; a work with no declared language gets "source".
- **Author on document works** — right-click the work title in the rail → **Work details…**. Prints as
  an italic byline under the title in the export. Corpus exports are byte-identical to before: they
  have always opened on the book heading, and a title page there was not the ask.

## The model, in one line

A **document work** is one file. The lines you **mark** in the text are its **Chapters** and headings. **Books are containers** — a saved label plus the chapter it begins at — so a Book like "Prima Pars", which is not a line in your text, no longer has to pretend to be one.

---

## ✅ What to test in this build

Open `~/Downloads/Translation Workbench.app` with the Summa (fixture `~/Downloads/summa-Ia-q2.txt`).

**The bug that started this:**
- [ ] **`+ Book` inserts no text.** It creates an empty Book called "Book 1" in the sidebar. Your English column must be untouched — this is the whole point of the redesign.
- [ ] **The first Book wraps everything.** Adding the first Book to a document that already has chapters puts all of them under it.
- [ ] **`+ Chapter` is gone.** Chapters are made by marking a line (right-click a line in the text, or a node in the sidebar → "Make this a … [Question]").

**Grouping:**
- [ ] **"Begin a book here…"** — right-click a chapter, pick a Book → that Book starts there, and everything after it moves into that Book. No text moves.
- [ ] Only the **second and later** Books are offered; the first always begins at the top of the document, so there is nothing to set.
- [ ] **Rename a Book** — right-click → Rename… → type → Enter.
- [ ] **Remove Book (chapters stay)** — the Book disappears, its chapters regroup into the Book above, and **no text is deleted**.
- [ ] **Add Book after** — inserts an empty Book below; fill it with "Begin a book here…".
- [ ] An **empty Book** shows a hint line, not a blank row.
- [ ] A document with **no Books** looks and behaves exactly as before.

**Export:**
- [ ] Compile/export a work with Books → `## <Book label>` / `### <Chapter label>` reflect your Book grouping, chapter labels still coming from the marked lines.

### One deliberate restriction, in case it surprises you
"Begin a book here…" is offered only on **Book- or Chapter-marked** lines, not on plain headings. The export cannot cut the text at a heading, so a Book that began at one would group one way in the sidebar and another in the compiled file. If you want a Book to start at a line, mark that line as a Chapter first.

---

## How it was built

Three chunks on disjoint files, each built by one model and reviewed by another:

| Chunk | Built by | Reviewed by |
|---|---|---|
| Container model + persistence (`works/bookContainers.ts`, `groupOutlineByBooks`, registry) | Codex gpt-5.6 | Opus |
| Rail + App (`LibraryRail.svelte`, `App.svelte`) | Opus | Codex adversarial-review |
| Export grouping (`export/documentExport.ts`) | Grok | Sonnet |

What the reviews caught, all fixed:
- **Opus →** the spec's own "begin here" rule silently moved the *next* Book's boundary when applied to the first Book. First Book is now pinned and not offerable.
- **Sonnet →** a Book boundary on a heading-only root made the export disagree with the sidebar. Heading roots are no longer offerable as boundaries.
- **Codex →** "Make this a…" still listed Book tiers, so marking a row as a Book wrote into the chapter file — the last surviving text-mutating path from a Book control. Book tiers are withheld now.
- **Codex →** the five Book handlers each transformed a stale snapshot and awaited, so two fast clicks lost an edit. Edits are serialized in `works/bookContainerQueue.ts`.
- **Codex (re-review) →** a queued edit resolved its target work from the *current* selection, so switching documents mid-save wrote one work's Books onto another. Work id is captured when the edit is made.

Grok also corrected a wrong assumption in the spec: `splitDocument` parts are **not** 1:1 with outline roots (a leading preface opens a part with no root; a legacy Book mark owns several), so export anchors each part by its recovered start row.

---

## Next up (parked, each with the diagnosis already done)

1. **Export ignores heading marks.** `grep headingLevel src/lib/export/*.ts` returns nothing — the
   export layer never reads them. So (a) Objection / Sed contra / Respondeo / the Article's "Utrum"
   title all export as plain body paragraphs with no Word heading style, and (b) a marked Chapter
   line prints **twice** — once as its `### Question 2` heading, then again as the body's first
   paragraph. Fix: pass the work profile into `renderDocumentSpineEnglish` / `…Bilingual`
   (`pandocMarkdown.ts` ~545/659), emit `####`+depth for heading tiers, and suppress the row that
   became its own heading. **Open question you tabled:** in BILINGUAL, does a heading line read
   English-with-Latin-under, Latin-with-English-under, or both on one line?
2. **Drag a chapter into a Book.** Under the contiguous document-order model, a drop can only set
   that Book's boundary (the chapter *and everything after it* joins). A true single-chapter move
   would reorder the document text and break the "nothing moves your text" guarantee. You chose
   "skip for now" when given that choice.
3. **Other dictionaries → per-work language picker in the rail.** Language is set once at New-document
   time and can't be changed after; it already drives the AI-assist persona and the export filename,
   and it's what a Latin dictionary/parser would key off.

## Other backlog
- **Heading style:** marked content headings render as big titles — keep vs. small labels. "Decide later."
- Stale registry `books` / `documentBooks` from the retired container-slot model are still in your `works.json`, still ignored by nav and by the new export path.

## Rebuild recipe (from `workbench/`)
```
source ~/.nvm/nvm.sh && nvm use v22.23.1 && source ~/.cargo/env
npm run build && npm run stage:corpus && npm run app:build -- --bundles app
cp -R "src-tauri/target/release/bundle/macos/Translation Workbench.app" ~/Downloads/
xattr -dr com.apple.quarantine "~/Downloads/Translation Workbench.app"
```
Node 22 is required (system default is 24 → violates the engine). `npm test` = vitest; typecheck via `npx tsc --noEmit -p tsconfig.json`.

## Key commits on this branch
- `7767abc4e` — whole-work export fix (reference.docx path), Markdown output, work author
- `ea777abf6` — bilingual export names the source language, not "Greek"
- `2417359c8` — queued Book edits carry their own work id
- `30d430cdb` — **Books are containers, not lines in the text** (the current model)
- `58d322cf0` — marker-driven navigation (chapters are marks — still true)
- `531dc28de … 77a291bbf` — the earlier container-SLOT model (superseded; `splitDocument` lives on for export)
