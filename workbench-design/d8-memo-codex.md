# D8 memo — Codex — corpus-free documents + view modes

*Independent design opinion; see d8-memo-deep-reasoner.md for the other. Synthesis in d8-view-modes.md.*

## Decisions summary

1. **Document-owned synthetic spine**, not a loosened/no-spine editor. Corpus works keep "corpus
   owns row count". Corpus-free documents get rows owned by the saved document, synthetic opaque
   addresses from new schemes `paragraph` (¶1, ¶2) and `plain-line` (1, 2). Paragraph split/merge
   may change row count only for free docs; Bekker/D6 splits remain intra-row.
2. **Reuse `splitOffsets`/`english2`** as persisted source-side subdivision inside one row, meaning
   keyed by row unit: Bekker rows = D6 paragraph splits; paragraph rows = sentence boundaries.
   Sentence splitting computed at import, persisted, manually fixable via existing gestures.
   English never auto-split: paragraph-level English stays in `english`; `english2` sentence fields
   exist only when the user types at sentence granularity. Rules: `. ! ? ; ·` + closing
   quotes/brackets, pluggable table.
3. **View projections** over the same editor core. Paragraph view = same left-original/right-English
   grid, one row per paragraph, taller wrapping cells. Interpolated view = different projection:
   each editable English unit followed by its display-only original underneath in one column stack.
   Column-DOM-grouping invariant required for two-column views; interpolated can relax it because
   source is display-only — but copy/selection handlers must still scope source vs English.
4. **Corpus-free import path** (paste/file): asks lines vs paragraphs, preselecting from blank-line
   detection. Paragraph import: blank-line blocks → rows. Line import: nonblank lines → rows,
   blank-line grouping stored as `paragraph_starts`; manual grouping later edits `paragraph_starts`,
   not row text. Corpus import unchanged.
5. **Assist + export row-unit aware.** Context ±6 translation units. Prompt/provider copy renames
   "line" → unit-appropriate wording ("line"/"paragraph"/"sentence") while keeping row-index keyed
   implementation. Export: no Bekker stamps for non-bekker rowUnit (existing suppression is the
   precedent); untranslated gaps keep single `…`.
6. **Migration:** absent new frontmatter fields ⇒ current Bekker behavior, byte-identical; schema v1
   additive-optional precedent (`line_splits`). Pin existing goldens before adding corpus-free cases.

## File-format deltas (Codex variant)

- Frontmatter: `document_kind: corpus|free`, `row_unit`, `input_mode`, plus `title`, `author`,
  `source_language` for free docs; `paragraph_starts: "1,5,12"` for line-based free docs;
  `line_splits` reused for sentence boundaries; per-document view default persisted.
- `ChapterModel` gains `documentKind`, `rowUnit`, `viewDefaults?`, `paragraphStarts?`.

## Distinct points vs deep-reasoner

- Adds `document_kind` + `input_mode` frontmatter (deep-reasoner derives kind from scheme/row_unit).
- `paragraph_starts` (start indices) vs deep-reasoner's `paragraph_groups` (start@length runs).
- Persists per-document view default in the file (deep-reasoner: localStorage store only).
- Treats unit-aware assist PROMPT wording as in-scope, with golden tests (deep-reasoner: cosmetic
  follow-up).
- Flags export `compile.ts` book/chapter-heading + manifest-gap logic as assuming books/chapters —
  free standalone docs need a routed single-document export path.
- Risk: synthetic addresses leaking as real citations — schemes should format structural labels,
  export suppresses stamps.

## Test plan highlights

Old-file byte-identical round-trips; free-doc round-trips; citation tests mirroring
busseParagraph; scheme-id isolation; import detection + override; sentence splitter table; expandRows
sentence expansion preserving paragraph English; paragraph-English-read-only-in-sentence-view test;
autosave/export/prompt tests patterned on existing suites.

## Top risks

1. Semantic overload of `line_splits` for sentences — gate by row_unit, rename internal helpers to
   "source subdivisions".
2. Row-count-changing split/merge vs undo/autosave assumptions — free docs only, structural undo
   entries.
3. Export heading/gap logic assumes books/chapters — separate free-doc export path early.
4. Line-locked AI prompt wording misleads paragraph/sentence modes — unit-aware prompt goldens.
5. Synthetic addresses leaking as citations — structural labels + stamp suppression.
