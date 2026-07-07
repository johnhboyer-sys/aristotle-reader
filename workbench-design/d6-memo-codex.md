| Area | Decision | Rationale | Rejected alternatives |
|---|---|---|---|
| Model shape | Keep one `ChapterModel.rows[]` entry per Bekker line; add ordered intra-line split metadata and segment English docs inside that row. | Reconciles D1: the Greek spine still owns Bekker lines; John owns paragraph cuts inside a line. Minimizes blast radius for row-address identity. | Turning `rows[]` into display segments; copying split Greek into new rows. |
| File syntax | Add optional frontmatter `paragraph_splits`, storing `<address>@<graphemeOffset>` entries; `[GREEK]` stays one physical line per Bekker line; `[ENGLISH]` stores segment docs per row with an escaped intra-row delimiter. | Split is data about a line, not copied Greek. Old files load unchanged. | Duplicating Greek half-lines; adding extra `[GREEK]` rows; embedding split markers in Greek text. |
| Multiple splits | Allow multiple splits per line, ordered and unique by offset. | A Bekker line can reasonably contain more than two paragraph starts; forbidding this would create a second migration later. | Exactly one split per line. |
| Identity | Add `SegmentKey = { row: number; segment: number }`; keep legacy row index/address for line-level systems. | Footnotes, autosave spans, sync, export stamping, and grid row math stay mostly line-based while English cells/focus become segment-aware. | Global synthetic row indexes as durable IDs. |
| UX | Greek cell offers split points from read-only selection/caret; English at split time is divided at the nearest proportional text offset, then editable. Un-split rejoins adjacent English segments after confirmation. | The user chooses the boundary in the Greek spine, but Greek remains read-only. English division is useful and reversible. | Prompting for manual English redistribution first; making split from English caret. |
| Display | Expanded display rows repeat the same gutter address; continuation Greek is indented about 1.5em; English remains flush; no new gutter ticks. | Matches John's confirmed visual decision and keeps gutter semantics line-level. | Blank continuation gutter; `1b8a/1b8b` labels. |
| Export | In English-only and bilingual compile, segment boundary renders as a real paragraph break; Bekker stamp appears once per address, on the first non-empty segment. | The split represents a paragraph boundary, not a visual wrap. Stamps identify Bekker lines, not segments. | Stamping every segment; preserving split only in bilingual mode. |
| Copy/assist | Treat segments of one address as one line for default copy-as-citation and AI context; preserve paragraph breaks only when the selected range explicitly spans segments. | Citations and model prompts should not imply a new Bekker line. User-selected paragraphs should remain paragraphs. | Always treating segments as independent rows in citations/prompts. |
| Schema version | Bump saved files that contain `paragraph_splits` to `schema_version: 2`; v1 remains fully supported. | New files are self-describing; old app behavior is explicit. | Keeping schema_version 1 with a new unknown field; mandatory migration rewrite. |

# D6 - Intra-Bekker Paragraph Splits

This amends D1's invariant, not by weakening row lock but by naming two ownership layers:

- The Greek spine owns Bekker lines. Its row count and addresses are not created or destroyed by user editing.
- The user owns paragraph boundaries inside a Bekker line. A split creates display segments inside one line; un-splitting removes that user boundary. It is not cross-line merging.

## 1. Data Model And Chapter File

Decision: keep `ChapterModel.rows: RowModel[]` as one model row per Bekker line, and extend `RowModel`:

```ts
interface ParagraphSplit {
  offset: number;       // Unicode grapheme offset in row.greek, before the segment start
}

interface RowSegment {
  english: PMDocJSON;
}

interface RowModel {
  address: Address;
  greek: string;
  english: PMDocJSON;          // compatibility alias for segment 0 during migration
  splits?: ParagraphSplit[];
  segments?: RowSegment[];     // length = splits.length + 1 when present
}
```

Canonical in-memory code should normalize to `segments` on load. `row.english` may remain during the transition as `segments[0].english` for compatibility with narrow call sites, but new code should use helpers like `segmentsOf(row)` and `englishDocAt({ row, segment })`.

Split offsets are grapheme offsets in the Greek string, using `Intl.Segmenter` where available with a deterministic code-point fallback in tests. The split at "ἡ γὰρ" is stored as the offset before `ἡ`, never by copying "ἔνια..." or "ἡ γὰρ...".

Multiple splits per line: yes. Store them as strictly increasing unique offsets, excluding `0` and the end of the Greek line. This costs little now and avoids a later format expansion for lines with more than one paragraph boundary.

Exact chapter-file syntax:

```yaml
---
schema_version: 2
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041b33"
column_starts: "1041a6@1,1041b1@29"
paragraph_splits: "1041b8@27,1041b8@54,1041b13@11"
---
[GREEK]
<one physical line per Bekker line>

[ENGLISH]
<one physical line per Bekker line; split segment markup joined by \p>
```

`paragraph_splits` is optional frontmatter, following the existing optional `column_starts` precedent. Entries are comma-separated `<rawAddress>@<graphemeOffset>` pairs. The address is the line's raw address as displayed in the gutter. The parser validates it against derived row addresses when `column_starts` is present; otherwise it may validate only against the loaded row address map supplied during hydration.

For `[ENGLISH]`, one physical line remains one Bekker line. Segment docs are serialized with the existing row markup and joined by an escaped delimiter, recommended `\p` as a reserved top-level separator. Existing row markup already reserves backslash escapes; the chapterfile serializer must escape literal top-level `\p` in row text so round-trip is constructional. Example:

```text
[ENGLISH]
some English for the first paragraph\pand this begins the second paragraph
```

Validation on drift: on load, every split offset must land at a grapheme boundary and inside the current saved Greek line. If saved Greek differs from corpus Greek, validate against the saved file's Greek because the file is canonical today. If an offset is now invalid, load should fail with a single plain sentence and autosave blocked, consistent with current unreadable-file policy:

`Saved paragraph split for 1041b8 no longer matches the Greek line, so this chapter was opened read-only until the split is fixed.`

Rationale: frontmatter keeps split metadata near other addressing metadata, preserves `[GREEK]` and `[ENGLISH]` row counts, and gives a clean migration story. Offsets are compact and reviewable; storing copied Greek halves creates drift and makes the spine non-canonical.

Rejected alternatives:

- Extra `[GREEK]` and `[ENGLISH]` rows for continuations: violates the canonical 1:1 section invariant and breaks old parsers hard.
- Store the Greek prefix/suffix text: duplicates corpus/user Greek and creates merge conflicts when Greek is corrected.
- Store UTF-16 offsets: matches JS internals but is fragile around Greek combining marks.
- Store split markers inline in Greek: makes read-only spine data user-editable by side effect.

## 2. Round-Trip And Migration

Decision: support v1 and v2 parse; write v1 when there are no splits and v2 when any split exists. Do not rewrite old files just because the new app opened them.

Old files load unchanged. Absence of `paragraph_splits` means every row has one segment and its single English doc is parsed exactly as today. The existing autosave self-check should compare the normalized shape: parse -> model -> file -> parse preserves meta, Greek lines, per-row segment markup, footnotes, and split metadata.

New app reading old file: no notice needed. It is the normal v1 path.

Old app reading new file: old parser currently ignores unknown frontmatter fields but still expects `[GREEK]` and `[ENGLISH]` counts to match. It would see literal `\p` inside an English row. That means it will not preserve segment semantics and may display both paragraphs inside one editable row. Therefore v2 files must be considered readable-but-degraded in old apps, not safely editable. If practical, add a top-level comment in docs/release notes: old app can open v2 files but must not be used to edit them. If we want hard failure instead, the only reliable mechanism is `schema_version: 2` plus updating current parser to reject versions greater than supported; old already-shipped code cannot be changed retroactively.

Schema version implications: current `parseFrontmatter` accepts any integer `schema_version`. Change it so supported versions are explicit. New app accepts `1` and `2`; future versions fail plainly. Serializer writes `2` only when split data is present, so unsplit chapters remain maximally compatible.

Executable vitest assertions, node environment only:

- `parseChapterFile` accepts v1 without `paragraph_splits` and serializes back with no split field.
- v2 with `paragraph_splits` round-trips exactly, including multiple offsets for one address.
- English split delimiter round-trips with escaped literal `\p` in content.
- Invalid duplicate, unsorted, zero, end-of-line, non-grapheme, unknown-address, and out-of-range offsets throw `ChapterFileError` with one plain sentence.
- `serializeModel` self-check rejects any mismatch before storage write.
- v2 with no splits is either normalized to v1 on next save or rejected as non-canonical by serializer; pick normalize-to-v1.

Rationale: canonical user data must stay diffable and repairable. The app already treats parse failure as a reason to block autosave, which is correct for split drift too.

Rejected alternatives:

- One-time migration rewriting every v1 file to v2: needless churn and sync risk.
- No schema bump: hides a semantic compatibility break from older apps.
- Hard fail on all v1 files until migrated: hostile to existing user data.

## 3. Identity Plumbing

Decision: one model row per Bekker line with internal segments; display-layer expansion creates `DisplayRow[]`:

```ts
interface DisplayRow {
  row: number;
  segment: number;
  address: Address;
  greekText: string;
  english: PMDocJSON;
  continuation: boolean;
}
```

The flat CSS grid should render display rows, not model rows. Each display row gets its own English TipTap instance and grid track. The first segment renders the Greek prefix before the first split; continuation segments render their Greek slice indented. The gutter raw address is repeated for every segment.

Minimal blast radius:

- `ChapterModel.rows` remains line-addressed for autosave spans, sync snapshots, compile ordering, footnote count, and citation range endpoints.
- `views` becomes keyed by `SegmentKey`, not row number. A simple flat array can still work if derived display indexes are rebuilt, but durable state should carry `{ row, segment }`.
- `UndoEntry.RowEdit` becomes `{ key: SegmentKey; before; after }`; split/un-split entries also carry `rowBefore`/`rowAfter` or a small structural patch for `splits` and `segments`.
- `SelRef` becomes `{ row, segment, anchor, head }`.
- Focus helpers become `focusSegmentEnd`, `focusSegmentAtX`, with Enter/Tab moving to next display segment, not next Bekker line.
- Footnote anchors remain inside English segment docs. Footnote display order is display order within `rows[]`.
- Autosave `spansFromModel`, `columnStartsFromModel`, and sync hashes remain line-level and unchanged except serialization includes segments.
- `data-row` DOM attributes should distinguish `data-line-row` and `data-display-row` or carry `data-row` + `data-segment`; copy/citation selection resolution must not assume display index equals model row index.

Rationale: model rows becoming segments would force every line-level system to relearn that two rows can have the same address. Keeping rows line-based preserves the strongest invariant and isolates segment behavior to editor/render/export helpers.

Rejected alternatives:

- Make `rows[]` become segments: simpler grid loop at first, but every address comparison, footnote row pointer, sync reload, undo selection, and autosave span becomes suspect.
- Keep one TipTap per Bekker line and fake paragraph segments visually inside it: cannot give each half-row its own English cell, focus, undo target, or paragraph export cleanly.

## 4. Split And Un-Split UX

Decision: split gesture starts from the read-only Greek cell. The user selects text or places a caret in Greek and invokes "Split line here" from a context menu/toolbar command. The command snaps to the nearest grapheme boundary before the selected text/caret and previews the boundary. It is disabled at line start/end and on whitespace-only ambiguity; status message: `Choose the Greek word where the new paragraph starts.`

How existing English divides: at split time, compute `ratio = greekOffset / greekGraphemeCount` and split the current English segment at the nearest word boundary to `ratio * englishPlainTextLength`, preserving marks by slicing the ProseMirror doc. If the English segment is empty, create an empty continuation segment. If the English has footnote anchors crossing the split point, keep the entire footnote anchor with the side containing its marker; do not split a single footnote anchor across segments.

Un-split: a continuation row exposes "Join with previous paragraph" from the gutter or row command. It requires confirmation when both English segments are non-empty:

`Join these two English paragraphs into one cell?`

Rejoin semantics: concatenate previous English + a single space + current English, preserving marks and footnote markers in order. Empty-side joins are silent. The split offset is removed. This is not merging Bekker lines because both segments share the same address.

Undo: split and un-split are single app undo entries. They include row structural before/after, affected segment docs, and selection before/after. Redo restores the same focus.

Rationale: John is deciding a Greek paragraph boundary, so the gesture belongs on Greek. The English heuristic is a convenience, not a claim of correctness, because both resulting English cells remain editable.

Rejected alternatives:

- Split from English caret: can create paragraph boundaries not grounded in the Greek spine.
- Require the user to select matching Greek and English split points: precise but too heavy for common use.
- Auto-split English at the same character count: poor for different language lengths.

## 5. Display

Decision: render expanded display rows in the same flat CSS grid. For a split line:

- First segment gutter: `1b8`
- Continuation segment gutter: `1b8`
- First Greek segment: normal left edge
- Continuation Greek segment: `padding-left: 1.5em` or equivalent text indent
- English cells: flush left in both segments
- No extra tick marks, suffixes, bullets, or continuation labels

Display rows should have stable grid rows and keys like `${address.raw}:${row}:${segment}:${splitOffsetBefore}`. The key must avoid remounting unrelated rows when one line gains a split.

Rationale: repeated address tells John this is still the same Bekker line; indentation tells him it is a continuation paragraph. English flush-left matches compiled paragraphs.

Rejected alternatives:

- Blank gutter on continuations: loses the confirmed "both gutter-labeled 1b8" behavior.
- New gutter ticks or `1b8.2`: invents a citation scheme outside `src/lib/citation/`.

## 6. Export

Decision: export treats segment boundaries as real paragraph breaks in both modes. In `chapterToPandocMarkdown` and `compileWorkMarkdown`, line rendering should become segment rendering:

- English-only: each non-empty English segment is its own paragraph contribution.
- Bilingual: Greek segments render as separate Greek paragraphs, then English segments render as separate English paragraphs, preserving the existing stacked mode.
- Bekker stamp appears once per address, on the first rendered segment for that Bekker line. If the first segment is untranslated/empty but a later segment has text, stamp the later segment once.
- Compile never mutates stored files; namespace footnote ids in generated strings only, as today.

Implementation direction: build a pure `chapterSegments(chapter)` helper in export code that derives `{ address, segment, greek, english, isFirstSegmentForAddress }` from `ChapterFile`. Existing `rowAddress`, `stampFor`, and `markupToPandoc` remain the shared primitives.

Rationale: the feature is specifically a paragraph boundary in docx. Stamping every segment would make one Bekker line look like multiple cited lines.

Rejected alternatives:

- Join segments with spaces during export: defeats the feature.
- Only split English export, not bilingual Greek: bilingual would contradict the editor's Greek paragraph boundary.

## 7. Copy-As-Citation And AI Context

Decision: default semantics treat all segments of one address as one Bekker line. Copy-as-citation over a whole split line should produce one citation span with one address and Greek joined from the line's segments in order. If the native selection starts/ends inside specific segments, preserve paragraph breaks in the copied English only when multiple selected segments are touched; otherwise join with spaces as current code does.

AI assist context should also be line-based by default: target row = Bekker line address, Greek = full Greek line, English draft = segment-aware only for neighboring context. For a target segment, include `target.segmentIndex` internally if useful to the prompt, but do not present it as a new citation line. Context window of +/-6 should count Bekker lines, not display segments, so one heavily split line does not crowd out context.

Rationale: citations and AI context are grounded in source lines. Segmenting a line is paragraph structure, not textual extent in the citation scheme. Preserving explicit selected paragraph breaks is still useful for clipboard fidelity.

Rejected alternatives:

- Treat every segment as its own row for AI and citation: overweights split lines and suggests fake addresses.
- Ignore segments entirely in copy: loses user-intended paragraphs when copying a selected split passage.

## 8. Module Boundaries, Tests, And Phasing

Decision: keep split logic in three narrow layers:

- `chapterfile`: parse/serialize `paragraph_splits`, split English row syntax, schema-version validation, offset validation helpers.
- `editor`: model normalization, display-row derivation, split/un-split commands, segment-aware focus/undo.
- `export` and `copyCitation`/assist adapters: consume normalized segment views; no mutation and no citation parsing outside `citation/`.

Avoid adding split parsing to `citation/`. Addresses remain opaque outside citation; the split field uses raw strings only to associate metadata with existing row addresses, following `column_starts`' presentation-level precedent.

Test plan, all vitest/node:

- `chapterfile` table tests for v1/v2 compatibility, multiple splits, delimiter escaping, schema-version rejection, and invalid offsets.
- Pure model tests for `displayRowsFromModel`, including repeated address, Greek slices, continuation flags, and stable keys.
- Pure command tests for split/un-split structural edits and single undo entry shape; no DOM required.
- `rowKeymap` tests updated so Enter/Tab/Arrow move through display segments while Backspace/Delete only block cross-line merge. Backspace at start of continuation should move to previous segment end on second press, not join.
- Autosave tests assert `serializeModel` includes split metadata, round-trips, and leaves v1 unsplit files unchanged.
- Export tests assert two Pandoc paragraphs from one address, one stamp only, footnotes preserved, and bilingual Greek/English both split.
- Copy-as-citation tests assert same-address segments produce one citation span and selected multi-segment English can include paragraph breaks.
- Assist context tests assert +/-6 counts Bekker lines and target address remains unchanged for segment 1.

Phasing:

1. Minimal first slice: chapterfile v2 parse/serialize plus pure model/display helpers. No UI command yet. Tests prove old files load and split fixtures export.
2. Editor slice: render display rows from normalized model with segment-aware TipTap views, focus, commit, undo shape, and autosave.
3. Split/un-split UX: Greek selection command, English heuristic split, confirmation join, single-step undo.
4. Export/copy/assist polish: paragraph breaks in compile, one-stamp behavior, citation and prompt semantics.
5. Cleanup: remove transitional `row.english` direct use where helpers cover all call sites.

Rationale: the first slice de-risks the canonical file format before touching the largest UI surface. Export can be tested against parsed files early, but editor wiring should wait until segment identity is stable.

Rejected alternatives:

- Start with UI-only ephemeral splits: creates demo behavior before the canonical data contract is safe.
- Change every module to segment identity in one pass: high regression risk with autosave/sync and app undo.

## Ask John

- Should the split command snap to the first selected Greek word, or should it require placing the caret exactly before the new paragraph?
- When English already has text, is the proportional auto-split acceptable, or should the new continuation English cell start empty by default?
- For old apps opening v2 files, is readable-but-degraded acceptable, or should current apps begin rejecting future `schema_version` values now so the next release fails closed?
- In copy-as-citation, should selected multi-segment English preserve paragraph breaks, or always flatten to one sentence-like citation string?
