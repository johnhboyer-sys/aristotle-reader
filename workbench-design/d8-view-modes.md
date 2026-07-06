# D8 — View modes: paragraph-by-paragraph + interpolated (generalizing beyond line-numbered texts)

**Status:** requirements confirmed with John 2026-07-06 (interview); design in progress.
**Branch:** `claude/workbench-paragraph-views` (off `claude/blissful-rubin-d64797` @ `39849421`, the open PR #20 head).

## Why

The workbench today assumes line-by-line originals with line numbers (Aristotle /
Bekker convention). To serve other authors, languages, and input sources where
line numbers don't exist or don't matter, we add two translation views and a
paragraph-based document type. Goal: broaden the tool into a general translation
workbench. Aristotle's own paragraph-grouping is explicitly **out of scope** for
now — this is about new imports.

## Requirements (confirmed with John)

1. **Two new views.**
   - **Paragraph view:** original paragraph in one column, translation typed in
     the other, segmented by paragraph. Column order: **original LEFT,
     translation RIGHT** — same orientation as the current line view (the
     "original right" phrasing in the first brief was a slip; confirmed).
   - **Interpolated view:** the original text displays **underneath** the field
     where you type the English. Two granularities, **user-switchable**:
     - *paragraph chunks* — unit is a paragraph (original divided into
       sentences within the chunk);
     - *line-by-line* — unit is a line (for line-based texts).
2. **Document segmentation type chosen at import.** Import dialog asks
   lines-vs-paragraphs with a smart pre-selected default from auto-detection
   (blank-line-separated long blocks ⇒ paragraphs). Stored as a per-document
   setting.
3. **View availability by document type.**
   - Paragraph-based documents → paragraph view (default) or
     interpolated-with-sentence-division-in-paragraph-chunks.
   - Line-based documents → current grid view (default) or interpolated
     by line; also viewable in paragraph chunks.
4. **Paragraph grouping for line-based texts** comes from **both**: blank lines
   in the source at import, plus a manual grouping gesture in the editor
   afterwards. (Aristotle/existing corpus: deferred, do not solve now.)
5. **Interpolated granularity switch never destroys or guesses text.**
   Translations stay attached to the unit they were typed at. Switching to
   sentence granularity when a paragraph-level translation exists shows it as a
   read-only paragraph block until manually distributed; sentence fields start
   empty. No auto-splitting of English.
6. **v1 feature parity** in the new views: the AI right-click suite
   (Translate / Check / Reference / Ask), pandoc export (paragraph breaks +
   untranslated-gap marks), and split/merge editing (split a paragraph, merge
   paragraphs, fix bad automatic sentence splits).
7. **Language-agnostic.** No specific anchor text; pick sensible defaults.
   Sentence segmentation must work for standard European punctuation and Greek
   (ano-teleia); design for pluggable rules, not hardcoded Greek.

## Non-goals

- Paragraph-grouping the existing Aristotle corpus (later).
- RTL scripts, footnote-bearing paragraph imports beyond what current import
  already does.
- Auto-splitting English translations across sentences.

## Design (synthesis of d8-memo-deep-reasoner.md + d8-memo-codex.md)

The two independent memos converged on the core: **corpus-free documents get a
document-owned synthetic spine**, expressed as new citation schemes; **D6's
`splitOffsets`/`english2` machinery is reused verbatim for sentence division**;
views are projections over the same editor core. Divergences resolved below
(resolution noted where the memos differed).

### 1. Citation schemes carry everything — no new mode frontmatter

*(Resolution: both memos proposed `row_unit`/`document_kind`/`input_mode`
frontmatter; both are redundant — `citation_scheme` is already in frontmatter
and the scheme's `GutterSpec.rowUnit` already says what a row is. The Busse
paragraph scheme is the shipped precedent.)*

- New schemes: **`paragraph`** (addresses `¶1`, `¶2`, …, `gutterMode:
  'structural'`) and **`plain-line`** (addresses `1`, `2`, …). ~40 lines each,
  mirroring `busseParagraph.ts`. `SchemeId` union extended (the sanctioned d2
  additive extension). `GutterSpec.rowUnit` gains `'plain-line'`.
- **d2 contract amendment**: `CitationScheme` gains `spineSource: 'corpus' |
  'document'`. Existing four schemes: `'corpus'`. The new two: `'document'`.
  General code branches ONLY on `rowUnit`/`spineSource`/`gutterMode`
  capabilities, never scheme id (`schemeIdIsolation.test.ts` enforces).
- Addresses for document-spine works are **derived from row ordinal** (never
  persisted); `span_start`/`span_end` = `¶1`/`¶N` etc.

### 2. Row-count ownership (the one new invariant)

- `spineSource: 'corpus'` → corpus owns row count (unchanged, D6 semantics
  intact, Bekker merge-refusal regression-tested).
- `spineSource: 'document'` → **the user owns row count**: paragraph split and
  paragraph merge create/destroy `RowModel`s. These are NEW row-level
  operations, separate functions from D6's intra-row segment split/un-split
  (both coexist on paragraph rows: row ops = paragraphs, segment ops =
  sentences). Undo entries are structural (row bundle), same AppHistory.

### 3. Sentence division = D6 splits inside a paragraph row

- `splitOffsets` on a paragraph row = sentence boundaries into the original;
  persisted as `line_splits` (refs are synthetic addresses). Same word-boundary
  validation, same drift-degrade hydration.
- Auto-segmented **at import** (persisted so manual fix-up sticks) by a new
  pure `import/sentenceSegment.ts`: default rule table `. ! ? ; ·`(ano-teleia)
  + trailing closing quotes/brackets; language-pluggable; conservative;
  abbreviation over-splits accepted and fixed with the existing split/merge
  gestures.

### 4. Two translation layers per paragraph row ("text stays at its unit")

*(Resolution: neither memo fully solved the storage collision — segment 0
cannot be both "the paragraph translation" and "sentence 1's translation".)*

- `RowModel` gains **`englishPara?: PMDocJSON`** — the paragraph-granularity
  translation. Sentence-granularity translations live in `english` +
  `english2` (segment i ↔ sentence i), exactly as D6.
- Paragraph view & interpolated-paragraph-granularity edit `englishPara`.
  Interpolated-sentence-granularity edits the sentence segments.
- The other layer, when non-empty, renders as a **read-only block** (copyable,
  for manual distribution) — nothing is ever auto-split, moved, or destroyed
  by a view/granularity switch.
- Persistence: new optional `[ENGLISH.PARA]` section, one physical line per
  row (blank = absent), only written when any row has one. Absent section ⇒
  old files byte-identical.
- **Export precedence per row**: any non-empty sentence segment ⇒ sentence
  layer wins; else `englishPara`; else untranslated gap (`…`).

### 5. Views (projections; store follows the zoom.svelte.ts pattern)

- Modes: `grid` (current line grid) · `paragraph` (original left / English
  right, one visual unit per paragraph, wrapping cells, same CSS grid) ·
  `interpolated` (each English field with its display-only original stacked
  beneath it; granularity sub-mode paragraph|sentence for paragraph docs,
  line for line docs).
- Pure `legalViews(scheme)` + `defaultView(scheme)` module is the single
  source of truth (store, toolbar toggle, guards all call it). Paragraph docs
  default to `paragraph`; line docs default to `grid`.
- `viewMode.svelte.ts` store, localStorage per-work key. Not persisted in the
  chapter file. *(Resolution: Codex wanted file-persisted view defaults;
  view choice is UI preference, not document content.)*
- **Paragraph-chunk view of line docs**: `paragraph_starts` frontmatter
  (comma list of 1-based row ordinals that begin a paragraph; from blank
  lines at import + manual grouping gesture later) drives visual GROUPING
  only — rows and their per-line English fields are unchanged (grouping is
  pure display metadata; the doc stays losslessly line-based).
- Interpolated originals are **strictly non-editable/display-only**, so the
  column-DOM-grouping selection-isolation invariant is not needed there; it
  remains mandatory for the two-column views. Making interpolated originals
  selectable later requires the same DOM-ordering discipline (documented).

### 6. Import (corpus-free path)

- New-document flow (paste or text/markdown file): dialog collects title,
  language, and unit (lines vs paragraphs) — unit preselected by a new pure
  `import/segmentDetect.ts` (blank-line-separated long blocks ⇒ paragraphs),
  user override wins. Creates a free work in the library (single document,
  one chapter file, v1).
- Paragraph unit: blank-line blocks → rows; sentence auto-segmentation seeds
  `line_splits`. Line unit: non-blank lines → rows; blank lines →
  `paragraph_starts`.
- Existing corpus import path untouched; its `rowUnit !== 'bekker-line'`
  refusal becomes "corpus-requiring scheme without corpus".

### 7. AI assist + export

- Assist stays keyed by (row, segment) — already unit-agnostic. Context
  window = ±N units. **Prompt wording becomes unit-aware**
  ("line"/"paragraph"/"sentence") with golden tests *(Codex position adopted;
  cheap, affects output quality)*.
- Export: non-Bekker suppression of stamps/addresses already exists. Free
  docs route to a **single-document export** (no book/chapter headings, no
  manifest gap logic). Gap `…` behavior kept; precedence rule from §4.

### 8. Delivery order & risk mitigations

Phase A: schemes + `spineSource` + `legalViews` (+tests) → Phase B: chapterfile
(`[ENGLISH.PARA]`, `paragraph_starts`, `line_splits` reuse) + model
(`englishPara`) + `rowAddressSource(meta, spine, scheme)` extracted with three
arms (column_starts / spine / ordinal) and unit-tested BEFORE touching
hydrate/sync → Phase C: import (segmentDetect, sentenceSegment, new-document
flow) → Phase D: views (store, paragraph, interpolated) + row-level
split/merge → Phase E: assist prompts + export routing → Phase F: full
verification (suite green with zero edited expectations; Z.17 golden
byte-identical; svelte-check).

Top risks tracked: address-source arm bug (silent corruption on save→reload —
isolated function + tests first); row-ownership leak into Bekker (gate on
`spineSource`, regression test); over-aggressive sentence splitting
(conservative rules, persisted+fixable); view-legality drift (single pure
module); `line_splits` semantic overload (internal helper naming: "source
subdivisions").

### Deliberately NOT doing

Paragraph-grouping Aristotle/existing corpus works; auto-splitting English;
editable interpolated originals; multi-chapter free documents (v1 = single
document); `greek` field rename (kept, semantically "source text"); persisted
view mode in files.
