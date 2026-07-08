# D8 memo — deep-reasoner (Opus) — corpus-free documents + view modes

*Independent design opinion; see d8-memo-codex.md for the second. Synthesis in d8-view-modes.md.*

## Load-bearing discovery

The D2/D6 work already did 80% of this feature:

1. **The spine is not the row source at load time.** `hydrateFromFile(file, spine, scheme)`
   builds `RowModel[]` from the file's own arrays; the spine only supplies addresses when
   `column_starts` is absent. The file is canonical — its Greek wins over the corpus spine.
2. **Export already branches unit-agnostically.** `pandocMarkdown.ts` `useAddresses`/`useStamps`
   key on `scheme.gutter.rowUnit === 'bekker-line'`; the Busse paragraph scheme
   (`gutter.rowUnit: 'paragraph'`) already ships and is tested.
3. **Assist context is already unit-agnostic.** `buildAssistContext` windows ±N over model rows,
   whatever a row is.

So: (a) new citation scheme family, (b) corpus-free load/save/import path, (c) D6
`splitOffsets`/`english2` reused verbatim for sentence division, (d) view-layer rendering.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Corpus-free data model | Synthetic spine generated at import. One `RowModel` per paragraph (paragraph docs) or per line (plain-line docs). New schemes `paragraph` + `plain-line`. Keep field name `greek` (semantically "source text"); rename would be churn. |
| 1 | Row-count ownership | For corpus works the spine owns row count (unchanged). For corpus-free docs **the user owns row count**: paragraph split/merge creates/destroys model rows. New invariant scoped strictly to corpus-free schemes, gated on `gutter.rowUnit` (never scheme id). |
| 1 | File format | Frontmatter `row_unit: 'bekker-line'\|'paragraph'\|'plain-line'`, optional, absent ⇒ `bekker-line` (existing files byte-identical). Reuse `line_splits` verbatim for sentence offsets (ref = synthetic `¶N`). No `column_starts` for corpus-free; addresses derived from ordinal. |
| 2 | Sentence division | Reuse `splitOffsets`+`english2` unchanged. A sentence = a D6 split within a paragraph row. Auto-segment **at import, persisted** as `line_splits`; manual fix-up = existing split/merge gestures. |
| 2 | Granularity switch | `splitOffsets`/`english2` are stored truth. Paragraph-granularity = offsets ignored for editing (one field). Sentence-granularity = `expandRows` expansion. Switching never rewrites English. Paragraph-typed English shows in sentence mode as segment-0 text above empty sentence fields — exactly D6's drift case, which already renders. |
| 3 | View layer | Same grid, three render modes via new `viewMode` store (zoom.svelte.ts pattern). Paragraph view = current grid, `white-space: normal`, taller rows. Interpolated view = different DOM template; source is read-only ⇒ column-DOM-grouping isolation NOT needed there (document: making source selectable would re-require it). Pure `legalViews(rowUnit)` + `defaultView(rowUnit)` as single source of truth. |
| 4 | Import | New `buildCorpusFreePlan` in plan.ts: no window/align/corpus. New pure modules `segmentDetect.ts` (unit auto-detect + row split + blank-line groups) and `sentenceSegment.ts` (pluggable punctuation rules: . ! ? ; ano-teleia + trailing quotes/brackets; word-boundary snapped via `isValidSplitOffset`). Blank-line groups for plain-line docs stored as frontmatter `paragraph_groups` (start@length runs, display metadata — NOT line_splits; grouping joins rows, splitting subdivides one). |
| 5 | Assist + export | No core changes. Export already stamp/address-free for non-bekker. Untranslated gap → existing `…` paragraph. Prompt wording "line"→"unit" cosmetic follow-up. |
| 6 | Migration | Bekker path byte-identical, locked by row_unit-absent default + Z.17 golden round-trip. |

## Module-by-module

- `citation/types.ts` — extend `SchemeId`; `GutterSpec.rowUnit` gains `'plain-line'` ( `'sentence'` union member stays as-is, dead).
- `citation/schemes/paragraphScheme.ts`, `plainLineScheme.ts` — new, ~40 lines each; registry +2.
- `chapterfile/types.ts` + `parse.ts` — `row_unit`, `paragraph_groups?`; capability guard for unknown row_unit.
- `library/autosave.ts` — **most delicate edit**: extract `rowAddressSource(meta, spine, scheme)` with three arms (column_starts / spine / ordinal-synthetic); unit-test in isolation first.
- `library/sync.ts` — skip `loadCorpus` for corpus-free schemes (empty spine).
- `import/plan.ts` — corpus-free branch; the `rowUnit !== 'bekker-line'` refusal becomes corpus-requiring-only.
- `import/segmentDetect.ts`, `import/sentenceSegment.ts` — new, pure.
- `editor/viewMode.svelte.ts` — new store; per-document default from row_unit.
- `editor/gridRows.ts` — `expandRows` gains granularity param (paragraph-granularity: one DisplayRow per row, offsets ignored).
- `editor/ChapterEditor.svelte` — viewMode branches; row-level paragraph split/merge for corpus-free; merge guard scheme-conditional.
- `editor/plugins/rowKeymap.ts` — Backspace-at-start merge gated on rowUnit.
- `export/*` — no logic change; add goldens.

## Derived vs persisted

Persisted: `row_unit`; source text; English segments (¶-joined); sentence offsets (`line_splits`); `paragraph_groups`; scheme + span. Derived: synthetic addresses; DisplayRows; granularity rendering; legal views; export breaks/gaps. Import auto-detect resolves to `row_unit` then is discarded.

## Test plan

Round-trip byte-stability (absent row_unit = today, Z.17 golden); corpus-free hydrate w/ empty spine → synthetic addresses; drift reuse; table-driven segmentDetect + sentenceSegment; expandRows granularity; row-merge/split undo + Bekker-refusal regression; export goldens; contract.test.ts over new schemes; schemeIdIsolation (key on rowUnit, not id); full suite green with zero edited expectations.

## Top risks

1. `autosave.ts`/`sync.ts` address-source coupling — wrong arm silently corrupts addresses on save→reload. Mitigate: isolated `rowAddressSource` + unit tests first.
2. Row-count-ownership leaking into Bekker path — gate on `gutter.rowUnit`; regression test Bekker merge-refusal; keep row-merge separate from `mergeSegments`.
3. Interpolated view selection — safe only while source is strictly non-editable/display-only; document.
4. Sentence auto-segmentation over-splitting (abbreviations, decimals) — conservative defaults, persisted at import so fix-up sticks, pluggable rules.
5. View-legality matrix drift — single pure `legalViews`/`defaultView` used by store + toggle + guards, unit-tested.

## Flagged for John

- **Corpus-free paste/new-document ceremony**: no frontmatter exists on paste — needs a minimal "new document" dialog (title + unit + language). UX unspecified; confirm rather than guess.
- **Keep `greek` field name** (my call, reversible; a rename to `source` would be a separate mechanical PR).
