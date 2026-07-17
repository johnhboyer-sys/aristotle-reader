# Session Handoff — Document Structure Tools (Workbench)

_Last updated: 2026-07-17_

## Where things stand

- **Branch:** `claude/doc-structure` (based on `origin/main`), HEAD **`13236a459`**, fully pushed.
- **Test app:** `~/Downloads/Translation Workbench.app` — de-quarantined, corpus bundled, **includes the marker-driven nav + last night's review fixes**.
- **Tests:** 1521 passing (`npm test` from `workbench/`; the 3 `plan.test.ts` perf tests flake under machine load — re-run that file alone to confirm).
- **Not PR'd yet** — this is a working branch.

## The model, in one line

A **document work** is one file. The lines you **mark** in the text (Book / Chapter / heading tiers) **are** the sidebar's navigation — one source of truth, no separate container slots. Click a node → the editor scrolls there. This replaced the earlier container-slot model (empty slots + import-into-slot), which was confusing.

> **⚠️ One decision is still open** — see "Open decision: Books-as-containers" below. Don't be surprised that `+ Book` misbehaves; it's the thing being redesigned.

---

## ✅ Testing TODOs — what's live in the current app

Open `~/Downloads/Translation Workbench.app` and the Summa (test fixture: `~/Downloads/summa-Ia-q2.txt`; app-data lives at `…/org.aristotlereader.workbench/library/`).

- [ ] **Summa opens clean.** It should show its **real in-text structure** (Quaestio 2, Articulus 1/2/3) as the sidebar nav. The old **"Prima Pars" book and empty "Question" slots should be GONE** (they were registry-only, no text behind them).
- [ ] **Mark a line → it becomes a chapter.** Right-click a line in the sidebar outline → **"Make this a … [Question]"** → it should appear as a chapter, **labeled from that line's text**, automatically.
- [ ] **Rename works.** Right-click a chapter/heading → **Rename…** → type → Enter. Should commit and stick. (This replaced double-click-to-rename, which was fighting click-to-open.)
- [ ] **Remove works.** Right-click → **Remove from outline** → the mark clears (the line becomes plain text, leaves the nav).
- [ ] **Click-to-scroll.** Clicking any Book / Chapter / heading in the sidebar scrolls the editor to that line.
- [ ] **No outline bleed.** Switch between selections / open a different work and come back — the previous doc's outline should **not** linger under the wrong thing (this was a bug; now fixed).
- [ ] **Export / Compile.** Export the work → the .docx/markdown should **split at your in-text marks** with `## Book` / `### Chapter` headings taken from the marked lines — **not** the dead "Prima Pars / Chapter 1" labels.

### Skip for now (known, being redesigned)
- [ ] ~~`+ Book` / `+ Chapter` buttons~~ — **known broken**: `+ Chapter` inserts a line into the **English translation** column (wrong — the app edits translations, not source), and on a brand-new doc these show a "no tier yet" status message. **This is exactly what the Books-as-containers redesign fixes.** Don't file it; don't rely on these buttons.

---

## 🛑 Open decision: Books-as-containers

**Blocking the next build — needs your go/no-go on the mockup `scratchpad/book-containers.html`.**

The gap the current model can't cover: a Book like **"Prima Pars" isn't a line in your text**, so it can't be a mark. It needs to be a **container** you create and group chapters under.

**Agreed model (you picked "by document order"):**
- Chapters stay as **in-text marks** (unchanged).
- **Books become containers.** `+ Book` makes an empty "Prima Pars" — **touches no text** (this kills the +Book-into-English bug).
- Chapters group under Books **in document order** (a Book runs until the next Book begins).
- **Move chapters in:** right-click a chapter → **"Start '[Book]' here"** sets where each Book begins.
- Book right-click → Rename / Add Book after / **Remove Book (chapters stay — never deletes text)**.

**On your "go", the build is:** book-container registry (ordered labels + per-book start-chapter boundary) → rail renders Book › Chapters › headings → `+ Book` = container → the "Start book here" + Book rename/remove menus. Then rebuild the app.

### After that build — testing TODOs (future)
- [ ] `+ Book` makes an empty container, inserts **no** text anywhere.
- [ ] First Book wraps all existing chapters.
- [ ] "Start '[Book]' here" on a chapter moves it + everything after under that Book.
- [ ] Remove Book ungroups its chapters (they survive) and deletes no text.
- [ ] Export reflects the Book grouping.

---

## Other backlog (parked)
- **Heading style:** marked content headings (Objection / Sed contra / Respondeo) render as big titles — keep vs. make them small labels. You said **"decide later."**
- **Latin dictionaries + click-to-parse** (Latin analog of the Greek LSJ drawer) — "later."

## Rebuild recipe (from `workbench/`)
```
source ~/.nvm/nvm.sh && nvm use v22.23.1 && source ~/.cargo/env
npm run build && npm run stage:corpus && npm run app:build -- --bundles app
cp -R "src-tauri/target/release/bundle/macos/Translation Workbench.app" ~/Downloads/
xattr -dr com.apple.quarantine "~/Downloads/Translation Workbench.app"
```
Node 22 is required (system default is 24 → violates the engine). `npm test` = vitest; typecheck via `npx tsc --noEmit -p tsconfig.json`.

## Key commits on this branch
- `13236a459` — review fixes (stale-documentBooks strip, compile primary-file-only, +Book status msg)
- `d72ea4b60` — marker-driven compile (`documentExport.ts`)
- `58d322cf0` — **marker-driven navigation** (the current model)
- `531dc28de … 77a291bbf` — earlier container-slot model (**superseded** for nav; engines `splitDocument` / `documentBookStructure` / registry `books[]` live on for export)
