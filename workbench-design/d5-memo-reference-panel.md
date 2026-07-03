# D5 — Reference-translation panel (build spec §13) — DESIGN MEMO

Status: **proposed 2026-07-03** by deep-reasoner. Design-only; no repo file was
modified. Charter: build-spec §13 — an "import reference translation" action
that accepts plain text/Markdown (John's private-study OCR of copyrighted
translations he personally owns; nothing bundled or redistributed), displayed in
a panel. **Ship chapter-level display first**; design so precise line-matching
(TF-IDF + monotonic DP, as in the Reader) can be added later **without migrating
stored data**. Not a PDF viewer.

Scope of this memo: the data model, storage/sync/copyright invariants, panel
UX, import flow, the upgrade path, module boundaries, failure modes, and phasing.
It does **not** design the aligner algorithm (explicitly deferred by §13).

---

## Decisions summary

| # | Question | Decision |
|---|---|---|
| 1a | Where reference texts live | A **sibling library root**, not the synced library: `<referenceRoot>/<workId>/<slug>/` — default `$APPDATA/references/<workId>/<slug>/`, never under the synced `libraryRoot`. New `settings.referenceRoot` (optional, mirrors `libraryRoot`). |
| 1b | File format | One `manifest.json` per reference edition + one **verbatim** `chapter-<b2>-<c2>.md` per assigned chapter (front-matter + raw OCR body, preserved byte-for-byte modulo Stage-0 line-ending/soft-hyphen normalization). |
| 1c | Multiple references per work | Yes — each edition is its own `<slug>/` dir (`ross`, `bostock`…); the panel has an edition picker. No schema change to support N. |
| 1d | Chapter assignment | **Manual chapter-picker at import** is the shippable default (John's OCR shape is unknown). Offer an optional "split on Markdown headings / `[book.chapter]` markers" pre-pass that pre-fills the picker but is always editable. Assignment shape = ASK JOHN. |
| 2 | Sync interaction | **Excluded from the synced folder.** Reference texts are local-only per machine (each person OCRs their own copy). They never enter `libraryRoot`, so conflicted-copy semantics never apply to them. |
| 3 | Copyright hygiene | Invariant: reference text lives ONLY under `referenceRoot` (user-data), never `src-tauri/resources/**`, never the repo. Enforced by (a) a `.gitignore` guard even though the dir is outside the repo, (b) a resource-path assertion test, (c) `referenceRoot` defaulting away from `libraryRoot`, (d) a one-line doc-comment invariant on the storage module. |
| 4 | Panel placement | **Right side-panel**, same slot family as FootnotePanel (a `.side-panel` flex sibling in `.body`), toggled by a new topbar icon. Footnotes and Reference are mutually exclusive occupants of the right rail (only one right panel at a time in Phase 1). Chapter auto-selected; absence is silent (§12 invisibility). |
| 5 | Import flow | Rail action "Import reference…" (Tauri) → dialog: pick edition (new/existing) → paste-or-file → chapter assignment table → write. Re-import replaces one chapter or the whole edition with an explicit confirm. Reuse `norm`-adjacent Stage-0 normalization (line endings, soft hyphens) — NOT diacritic `norm`. |
| 6 | Upgrade path | Store body **verbatim** with stable per-paragraph ids computed at read time from position (`p0,p1,…`); keep raw text so a later aligner can re-tokenize freely. Panel reads through a `ReferenceView` seam that returns whole-chapter today and a matched slice later — same stored bytes. |
| 7 | Modules | New `src/lib/reference/{types,storage,manifest,assign,normalize,view}.ts` (pure/DI, vitest node env) + `src/components/ReferencePanel.svelte` + `ReferenceImportDialog.svelte` (Tauri-coupled). |
| 8 | Failure modes | Table below; every degradation is one plain English sentence. Minimal first slice = manual-assign import + whole-chapter display, one edition. |

---

## 1. Data model & storage

### 1a. Location — a sibling root, deliberately NOT the synced library

The chapter library (`storage.ts`) is the synced, collaborative unit. Reference
translations are the opposite: **private, per-person, copyright-sensitive OCR**.
Co-locating them under `libraryRoot` would (i) push copyrighted text into the
Drive/Dropbox folder the collaborator's machine also syncs (a redistribution the
importing user did not intend), and (ii) entangle them in conflicted-copy logic
they have no business in. So references get their own root:

```
Tauri default:  $APPDATA/references/<workId>/<slug>/…
Custom (rare):  <settings.referenceRoot>/<workId>/<slug>/…   (absolute, no baseDir)
Browser (dev):  localStorage["workbench:reference:<workId>/<slug>/<file>"]
```

Add `settings.referenceRoot?: string` to `WorkbenchSettings`, sanitized and
merged exactly like `libraryRoot` (settings.ts pattern — one array entry, one
sanitize line). **Default is `$APPDATA/references`, and it is a hard rule that
the default is never derived from `libraryRoot`.** A custom `referenceRoot` is
offered only as an escape hatch (e.g. John keeps his OCR on an external disk);
the collaborator never sets it and never sees reference text unless he does his
own OCR import on his own machine.

Directory layout per edition:

```
<referenceRoot>/metaphysics/ross/
  manifest.json
  chapter-07-17.md
  chapter-07-16.md
<referenceRoot>/metaphysics/bostock/
  manifest.json
  chapter-07-17.md
```

Filenames mirror the existing zero-padded convention (`chapterFileName`), reused
via a small `referenceChapterFileName(book, chapter)` helper so both storage
layers agree on shape.

### 1b. File format — manifest + verbatim per-chapter Markdown

`manifest.json` (one per edition):

```json
{
  "schemaVersion": 1,
  "workId": "metaphysics",
  "slug": "ross",
  "displayName": "Ross (Oxford, 1924)",
  "importedAt": "2026-07-03T...Z",
  "chapters": [{ "book": 7, "chapter": 17, "file": "chapter-07-17.md" }]
}
```

`chapter-07-17.md`:

```markdown
---
work: metaphysics
book: 7
chapter: 17
edition: ross
---
We have to inquire what substance is, and once more, making
as it were a fresh start, let us state what kind of thing...
```

The body is the OCR text **preserved verbatim** aside from Stage-0
normalization (§5). It is NOT re-lineated to Bekker lines, NOT split into the
`[GREEK]/[ENGLISH]` positional format, NOT parsed into ProseMirror. It is prose,
kept as prose, because chapter-level display shows it as prose and the future
aligner needs the raw tokens intact.

`displayName` is user-supplied at import (defaulting to a title-cased slug); it
is what the panel's edition picker shows and what a future citation could name.

**Rejected — reuse the chapter-file `[ENGLISH]` positional format.** That format
carries per-Bekker-line positional meaning we do not have (the OCR isn't
line-matched yet) and would force us to invent fake line breaks now, destroying
the raw text the aligner wants. Rejected.

**Rejected — one big `<slug>.md` for the whole work with heading-delimited
chapters.** Simpler to import but couples every read to a full-file parse and a
re-scan for the right chapter, and makes re-importing one chapter a whole-file
rewrite (a bigger conflict surface if references were ever synced). Per-chapter
files match the library's own "small, chapter-scoped unit" reasoning (§3/§11).
Rejected in favor of per-chapter files + a thin manifest index.

### 1c. Multiple references per work

Native: each edition is a `<slug>/` directory with its own manifest. The panel
lists all editions found under `<referenceRoot>/<workId>/` and offers a picker
(Ross | Bostock). Adding a third is a new directory, no code or schema change —
the same "config addition not code change" discipline the citation schemes use.

### 1d. Chapter assignment — manual picker default, optional heading pre-pass

John's OCR output shape is **unknown** (ASK JOHN). The robust default that works
for *any* shape is: at import, show the pasted/loaded text and a **chapter
assignment table**; the user says "this block is book 7 ch 17." For a
single-chapter paste that's one dropdown. For a multi-chapter paste, offer a
pre-pass that proposes splits from either:

- Markdown headings (`## 17`, `### Chapter 17`, `# Book 7`), or
- explicit inline markers (`[7.17]`, `1041a`-style Bekker anchors if his OCR
  carries them).

The pre-pass only **pre-fills** the editable table; the user confirms. If no
structure is detected, the table is one row (whole paste → one chosen chapter).
This keeps Phase-3 shippable without knowing his format, and upgrades cleanly if
his format turns out regular.

**Assumptions to confirm (ASK JOHN):** does his OCR come one-chapter-per-file, or
one-work-per-file with headings? Are Bekker numbers present in the OCR? Does he
want to assign at book+chapter granularity (yes, matches the library) or finer?

---

## 2. Sync interaction — excluded from the synced folder

**Decision: reference texts are local-only and never enter `libraryRoot`.**

Rationale:
- The importing user OCR'd *their personally-held copy* for *their own* private
  study. Pushing that text into a folder Google Drive/Dropbox replicates to the
  collaborator's machine is exactly the redistribution §13 is careful to avoid.
- The collaborator "doesn't troubleshoot" and "doesn't poke at software." If he
  ever wants a reference, he does his own OCR import locally — symmetric, and no
  copyrighted bytes cross the wire through this app.
- Because references never live in `libraryRoot`, the entire conflicted-copy /
  placeholder / reload-on-focus machinery in `sync.ts` **does not apply to
  them** — no new sync surface, no new failure modes. sync.ts stays untouched.

**Rejected — include references in the synced library so both collaborators see
them.** Tempting for convenience, but it turns a private-study import into a
two-party distribution and drags copyrighted text into a shared cloud folder.
Even setting copyright aside, it would require reference files to grow the same
conflicted-copy handling as chapters for no workflow benefit (references are
imported once, rarely co-edited). Rejected.

**Consequence for the panel:** the panel simply shows nothing for a chapter with
no local reference (§4 absence handling). On the collaborator's machine that's
the normal state and is unremarkable — exactly the §12 invisibility principle.

---

## 3. Copyright hygiene — the invariant and its guards

**Invariant:** OCR'd reference text exists ONLY under `referenceRoot` (user
data). It never appears in (a) a git commit, (b) `src-tauri/resources/**`, or
(c) any packaged-app resource.

Why this needs active guards: `tauri.conf.json` bundles
`resources/reference.docx` and `resources/corpus/`, and the capability grants
`fs:allow-resource-read-recursive`. A careless future change could stage
reference text next to those. Guards:

1. **Root separation (primary):** `referenceRoot` defaults to
   `$APPDATA/references`, a user-data location the packager never touches.
   `stage-corpus-resources.mjs` and `tauri.conf.json` `resources` never reference
   it. (Same category as the library — user data, not bundled.)
2. **`.gitignore` belt-and-suspenders:** the dir is outside the repo, but add
   `references/` and `src-tauri/resources/references/` to `workbench/.gitignore`
   so that if anyone ever symlinks or copies OCR into the tree it cannot be
   committed. Mirrors the existing `.dev-corpus/` and `resources/corpus/` guards
   that already say "TLG-derived text must NEVER be committed."
3. **Resource-path assertion (test):** a vitest that reads `tauri.conf.json`
   `bundle.resources` and asserts no entry contains `reference` other than the
   PD `reference.docx` template (name collision: the Pandoc *reference.docx* is
   an unrelated Word-styling template — the test allowlists that exact path and
   fails on any `references/` resource). Cheap regression tripwire.
4. **Doc-comment invariant** at the top of `reference/storage.ts`, in the same
   ORCHESTRATOR-PINNED-CONTRACT voice as `storage.ts`: "Reference text is
   private-study OCR of copyrighted works. It lives ONLY under referenceRoot
   (user data). It must never be bundled, synced, or committed."

No text is bundled or redistributed, so no license question arises — the guards
exist to keep that true under future edits.

---

## 4. Panel UX

### Placement — right side-panel, one right-rail occupant at a time

The current chrome has exactly two docking idioms: FootnotePanel as a right
`.side-panel` (320px, `border-left`), and LexiconDrawer as a bottom drawer in
`.center-col`. The reference panel is a **reading companion to the whole
chapter**, tall and scrollable — that is the footnote panel's shape, not the
lexicon's short bottom drawer. So it docks as a **right side-panel**, following
FootnotePanel's precedent exactly (same `.side-panel` skin, `.panel-head` with an
uppercase title + close button).

Phase-1-of-Phase-3 simplification: **Footnotes and Reference share the right
rail and are mutually exclusive** — opening one closes the other. Reason: two
320px right panels + a 260px rail + the two-column editor is too tight on a
laptop, and the row-lock editor needs horizontal room. A new topbar toggle
(a "book/quote" glyph) sits in `.panel-toggles` next to the footnote and lexicon
toggles; `class:active` when open, `aria-pressed`, exactly like its siblings. If
John later wants both visible at once, widen to a stacked right rail — a layout
change, not a data change.

**Rejected — a second bottom drawer** (alongside the lexicon). Reference prose is
long; a short bottom drawer would need constant scrolling and would fight the
lexicon for the same bottom space. Rejected.

**Rejected — a persistent third column in the grid** (Greek | English |
Reference). It breaks the row-lock grid's two-column height-sync mechanism (d1),
competes for the width the editor needs, and can't degrade to "invisible when
absent." Rejected. The right-panel dock is the correct precedent-following call.

### What "chapter-level display" shows

- The **whole reference chapter** for the currently open (work, book, chapter),
  as scrollable prose, in `--font-english` at a comfortable reading size.
- The **current chapter is auto-selected**: the panel derives (workId, book,
  chapter) from `App.svelte`'s `selection`, exactly as the breadcrumb does.
  Changing chapters in the rail re-targets the panel with no user action.
- An **edition picker** at the panel head when >1 edition exists (Ross |
  Bostock); hidden when only one exists. Selection persists per work
  (localStorage, LexiconDrawer's height-persistence pattern).
- Optional light affordance: a small "the chapter opposite" caption showing the
  edition's `displayName` and the chapter locus, so the reader knows which
  translation they're looking at.

### Absence handling (§12 invisibility)

When no reference exists for the current chapter/edition, the panel body shows a
single quiet italic line in `--text-light`, matching the lexicon's placeholder
voice:

> "No reference translation for this chapter yet."

And when the whole work has no imported reference at all, the **toggle itself
stays available but the panel opens to**:

> "Import a reference translation to read it alongside your work."

with the import action inline (Tauri only). On the collaborator's machine — who
will never import — this is simply an empty, unremarkable panel he has no reason
to open. No badge, no nag, no greyed-out demand for attention. Absence is
unremarkable, per §12.

---

## 5. Import flow

Entry point: a rail action **"Import reference…"** per work (Tauri only, and
dev-harness only in the browser — mirror `onImportChapter`'s gating in
`LibraryRail`). Opens `ReferenceImportDialog`:

1. **Edition step.** Pick an existing edition for this work or "New edition…"
   (enter `displayName`; slug auto-derived, collision-guarded).
2. **Source step.** Paste text into a textarea **or** pick a `.txt`/`.md` file
   via the native dialog (same `dialog:allow-open` capability import already
   uses). Plain text and Markdown both accepted.
3. **Assignment step.** Show the assignment table (§1d): detected/《manual》
   chapter rows, each a `{book, chapter}` picker bound to this work's manifest
   book/chapter list + the text block assigned to it. Editable. A single-chapter
   paste is one row. Blocks with no assignment are dropped with a visible count
   ("2 sections not assigned to a chapter — they won't be imported").
4. **Write step.** For each assigned block: normalize (below) → write
   `chapter-<b2>-<c2>.md` → upsert the manifest `chapters[]` entry. Then close
   and, if the imported set includes the currently open chapter, the panel
   refreshes to show it.

### Stage-0-style normalization (reuse, don't reinvent)

Reference OCR needs the *text-shaping* half of Stage 0, NOT the diacritic `norm`
(that's for Greek matching and would destroy English). Concretely reuse/extract
the existing soft-hyphen + line-ending handling from the scrivener-md Stage-0
path (`scrivenerMd.ts` normalization) into a shared
`reference/normalize.ts::normalizeReferenceText`:

- CRLF/CR → LF (as `parseImportFile.normalizeLineEndings` does).
- Strip OCR **soft hyphens** (U+00AD) and rejoin end-of-line hyphenation
  (`word-\nbreak` → `wordbreak`) — the same hyphen-rejoin the corpus spine and
  Scrivener Stage 0 already perform.
- Collapse hard-wrapped OCR lines into paragraphs on blank-line boundaries
  (single `\n` inside a paragraph → space; blank line → paragraph break), so the
  panel reflows naturally rather than showing OCR's fixed column width. **Keep
  the raw pre-collapse text too** (see §6) — the paragraph collapse is a display
  convenience, the aligner may want the raw form.
- The U+2028 fragility noted in the chapterfile TODO does not apply (references
  are never round-tripped through the `[FOOTNOTES]` parser).

### Re-import / replace semantics

- Re-importing a chapter that already exists in the edition → explicit confirm
  ("Replace the Ross text already imported for book 7, chapter 17?"), same
  Replace/Cancel duplicate-guard idiom the Scrivener `ImportDialog` already uses.
- "Remove edition" and "Remove this chapter" available from the panel head
  (delete the file(s) + manifest entry). Plain confirm; local-only so no sync
  consequence.
- Never silently overwrites; never silently drops assigned blocks.

---

## 6. Upgrade path to line-matching (no migration)

§13 wants the *option* to later line-match the reference to the Bekker range in
view via TF-IDF + monotonic DP (the Reader's approach). This memo does **not**
design that aligner. It only guarantees the stored format is sufficient for it,
so line-matching is an additive read-time feature, never a data migration.

What the stored format preserves NOW to make that safe:

1. **Verbatim raw body.** Because the `.md` body is the OCR text kept
   byte-for-byte (modulo line-ending/soft-hyphen normalization), a future
   aligner can re-tokenize, re-segment on sentences, and compute TF-IDF over the
   exact original words — nothing is pre-chunked into fake Bekker lines that
   would corrupt token statistics. (This is the concrete reason for rejecting the
   positional `[ENGLISH]` format in §1b.)
2. **Stable paragraph ids computed from position at read time** (`p0, p1, …`),
   not stored. The panel already needs paragraph structure to render; exposing
   `{ id, text }[]` from `reference/view.ts` gives a future aligner stable units
   to map onto Bekker rows without adding a stored field. Ids are positional and
   deterministic, so they're identical on every read — no migration when
   alignment arrives; the aligner just starts consuming the same `{id,text}[]`.
3. **A `ReferenceView` seam.** The panel reads through
   `reference/view.ts::referenceForSelection(workId, edition, book, chapter,
   viewRange?)`. Phase-3-now returns `{ mode: 'chapter', paragraphs }`. A later
   phase returns `{ mode: 'aligned', segments }` for the same stored bytes when a
   `viewRange` (the Bekker lines currently on screen) is passed and an aligner
   exists. The panel renders whichever mode it gets; the storage format is
   identical in both.
4. **The manifest carries `schemaVersion: 1`** so any genuinely new field a
   future aligner might want to *cache* (e.g. a precomputed alignment index) can
   be added as an optional sibling file (`.align-<edition>.json`, dot-prefixed
   like the regenerable footnote index) that is derived, disposable, and never
   part of the canonical text — so still no migration of user data.

The Bekker-range-in-view signal the aligner will need is already available: the
d1 grid tracks which rows are on screen (scroll anchoring), and `App.svelte`
holds the `selection`. Passing a `viewRange` later is wiring, not a data change.

---

## 7. Module boundaries

All logic pure and dependency-injected where it touches the filesystem, so it
tests under vitest's `environment: 'node'` (no jsdom) like the rest of the lib.

```
workbench/src/lib/reference/
  types.ts        # ReferenceEdition, ReferenceManifest, ReferenceChapter,
                  # ReferenceView union. PURE.
  manifest.ts     # parse/serialize/upsert manifest.json; slug derivation +
                  # collision guard. PURE (string in / string out).
  normalize.ts    # normalizeReferenceText (line endings, soft hyphens,
                  # hyphen-rejoin, paragraph collapse; keeps raw). PURE.
                  # Extract the shared half from import/scrivenerMd.ts.
  assign.ts       # chapter-assignment: heading/marker detection → proposed
                  # split; manual table model. PURE.
  view.ts         # referenceForSelection(...) → ReferenceView; paragraph-id
                  # derivation. PURE (takes chapter text + optional viewRange).
  storage.ts      # ReferenceStorage interface + Tauri/Browser impls, mirroring
                  # library/storage.ts. THE ONLY Tauri-coupled module here.
                  # Carries the copyright invariant doc-comment (§3).

workbench/src/components/
  ReferencePanel.svelte        # right-rail panel; edition picker; renders a
                               # ReferenceView; absence copy. UI.
  ReferenceImportDialog.svelte # the §5 flow. Tauri-coupled (dialog/fs). UI.
```

Settings: add `referenceRoot?` to `WorkbenchSettings` (one sanitize line, one
merge-key entry) — no new module.

App.svelte wiring: one new `$state referenceOpen`, a toggle in `.panel-toggles`,
the mutual-exclusion with `footnotesOpen`, and a `ReferencePanel` block in the
right `.side-panel` slot. `LibraryRail` gets an `onImportReference` prop gated
like `onImportChapter`.

### Test strategy & acceptance gates

- **Pure units (vitest node):** manifest round-trip; slug derivation +
  collision; `normalizeReferenceText` (soft hyphen strip, hyphen rejoin,
  paragraph collapse, CRLF); `assign` heading/marker detection incl. the
  no-structure single-row fallback; `view` paragraph-id determinism (same input
  → same ids across calls) and the chapter vs aligned mode shape.
- **Storage:** an in-memory `ReferenceStorage` (mirror `__tests__/memStorage.ts`)
  drives storage-shaped tests without Tauri.
- **Copyright regression:** the `tauri.conf.json` resource assertion (§3.3) and a
  test asserting `referenceRoot` default never equals/derives from `libraryRoot`.
- **Acceptance gate (with John, real OCR):** import one real OCR chapter of Ross
  Metaphysics Z.17 → panel shows it opposite the editor, auto-selected, correct
  chapter; switching chapters updates it; a chapter with no reference shows the
  quiet line; second edition (Bostock) appears in the picker. All logic- and
  browser-harness-verifiable except the native file picker (John at keyboard,
  same carried-forward pattern as Phase 2).

---

## 8. Failure-modes table (each degradation = one plain sentence) + phasing

| Situation | What the user sees (one sentence) |
|---|---|
| No reference imported for this work | "Import a reference translation to read it alongside your work." (with the import action; Tauri only) |
| Reference exists for the work but not this chapter | "No reference translation for this chapter yet." |
| Collaborator's machine (never imports) | Empty, unremarkable panel; toggle present, no badge or nag. |
| Import file unreadable / empty | "This file was empty — there was nothing to import." |
| Some pasted sections left unassigned | "2 sections weren't assigned to a chapter, so they won't be imported." |
| Re-importing an already-imported chapter | "Replace the Ross text already imported for book 7, chapter 17?" (Replace / Cancel) |
| Reference file on disk is corrupt / unparsable manifest | "This reference edition couldn't be read — try importing it again." (edition hidden from picker; canonical chapter files untouched) |
| Import attempted in the browser dev harness (no Tauri fs) | Dev-only sample path; no native picker — same gating as `onImportChapter`. |

### Phasing — minimal first slice

**Slice 1 (ship):** `referenceRoot` + storage + manifest + `normalize` +
manual-assign import (single edition, chapter-picker only, no heading pre-pass) +
right-panel whole-chapter display with auto-selected chapter + absence copy +
copyright guards + tests. This is a complete, useful §13 feature.

**Slice 2 (fast-follow, same phase):** multi-edition picker; the heading/marker
assignment pre-pass; remove-edition/remove-chapter.

**Slice 3 (later, no migration):** wire the TF-IDF + monotonic DP aligner into
the `ReferenceView` seam behind a `viewRange`; stored bytes unchanged.

---

## ASK JOHN

1. **OCR output shape** — one chapter per file, or one work per file with
   headings? Are Bekker numbers or chapter headings present in the OCR text? This
   decides how much the assignment pre-pass can automate (§1d).
2. **First imports** — which work + which editions first (Ross for Metaphysics?
   Bostock? something for Posterior Analytics)? Drives the acceptance fixture.
3. **Confirm local-only** — agreed that references stay off the synced folder and
   the collaborator would do his own OCR import if he ever wants one? (§2)
4. **Panel exclusivity** — OK that opening the reference panel closes the
   footnote panel (one right-rail occupant at a time in the first slice), or is
   simultaneous display wanted from the start? (§4)
5. **Line-matching appetite** — is chapter-level display enough for the
   foreseeable future, or should the aligner slice be scheduled soon? (Affects
   only sequencing; the data model already accommodates either.)
