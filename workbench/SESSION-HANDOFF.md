# Session Handoff — Document Structure Tools (Workbench)

_Last updated: 2026-07-30_

## Where things stand

- **Branch:** `claude/doc-structure` (based on `origin/main`), HEAD **`2417359c8`**.
- **Test app:** `~/Downloads/Translation Workbench.app` — de-quarantined, corpus bundled, **includes Books-as-containers**.
- **Tests:** 1561 passing (`npm test` from `workbench/`); `npx tsc --noEmit` and `npx vite build` clean.
- **Not PR'd yet** — this is a working branch. `origin/main` has moved on with website deploys since it was cut, so it needs a rebase before any PR.

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

## Other backlog (parked)
- **Heading style:** marked content headings (Objection / Sed contra / Respondeo) render as big titles — keep vs. make them small labels. You said **"decide later."**
- **Latin dictionaries + click-to-parse** (Latin analog of the Greek LSJ drawer) — "later."
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
- `2417359c8` — queued Book edits carry their own work id
- `30d430cdb` — **Books are containers, not lines in the text** (the current model)
- `58d322cf0` — marker-driven navigation (chapters are marks — still true)
- `531dc28de … 77a291bbf` — the earlier container-SLOT model (superseded; `splitDocument` lives on for export)
