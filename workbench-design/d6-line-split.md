# D6 — Splitting a Bekker line at a paragraph boundary — SYNTHESIZED DECISION

Status: **synthesized 2026-07-03** by orchestrator from two independent design memos
(`d6-memo-deep-reasoner.md`, `d6-memo-codex.md`), per the high-stakes protocol
(this changes the canonical chapter-file format and amends D1's row model).
Canonical spec for implementers once John answers §4. Deviations need orchestrator
sign-off.

John's settled decisions (2026-07-03, do not reopen): the English side splits too
(each half-row gets its own English cell); the split is a real paragraph boundary
in the compiled docx (both modes); the gutter repeats the address on both rows,
continuation Greek indented (~1.5em, reader-site precedent).

## The invariant, amended precisely (both memos, identical move)

D1 said: *one row = one Bekker line; row count owned by the Greek spine; nothing
the user does creates or destroys a row; no merging, ever.* The amendment names
two ownership layers:

- **The spine still owns Bekker lines.** `model.rows.length` remains the
  Bekker-line count; no user action creates or destroys an address.
- **The user owns intra-line paragraph splits.** A split subdivides ONE line into
  segments sharing one address. It creates grid rows, never model rows.
- **Un-splitting a user split is not the forbidden merge.** The ban is on joining
  two *distinct addresses* (1b8+1b9); rejoining two segments of 1b8 destroys no
  address. The rowKeymap "Bekker lines can't be merged" guard stands unchanged.

## Convergences (settled — both memos independently)

- **Model**: one `RowModel` per Bekker line; splits live inside the row
  (`splitOffsets?: number[]` + continuation English docs, normalized via a
  `segments` helper). The display layer expands a split row into two grid tracks
  via a pure `expandRows`/`DisplayRow` derivation — the ONLY place "one line =
  two rows" exists. Autosave spans, columnStarts, sync hashing, footnote index,
  citation endpoints all keep iterating line-addressed rows unchanged.
- **File format**: optional frontmatter metadata following the `column_starts`
  precedent — `line_splits: "1b8@14,1b8@31,…"`, comma-separated
  `<rawAddress>@<offset>` pairs (address opaque, validated only via
  `scheme.parseAddress`; offsets ascending per address). `[GREEK]` stays the
  verbatim one-physical-line-per-Bekker-line spine — a split never copies or
  marks Greek text. `[ENGLISH]` stays 1:1 too; a split line's English stores
  its segment markups joined by a delimiter in the one physical line.
- **Multiple splits per line**: allowed in model + format now (list of offsets,
  N delimiters); Phase-1 UI is single-split. Costs nothing, avoids a future
  canonical-file migration.
- **Offset validation**: against the file's OWN `[GREEK]` line (canonical,
  travels with the file), never the live corpus.
- **Display**: both gutter cells show the same raw address; continuation Greek
  indented ~1.5em; continuation English flush (the paragraph break is the
  signal). No new gutter ticks or stamps — a split is not a new line.
- **Export**: paragraph break (`\n\n` group boundary in the pandoc markdown) at
  each split, in single-chapter + whole-work, English + bilingual. Bekker stamp
  fires ONCE per address, on the first non-empty segment. Compile still never
  mutates stored files (reasserted with a split fixture).
- **Copy-as-citation + AI-assist**: a split line is ONE citable/context line —
  one address, English = segments joined. The ±6 assist window counts Bekker
  lines, not segments. Pure functions unchanged; only ChapterEditor call sites
  fold segments per address.
- **Split gesture lives on the Greek** (the offset is the durable datum);
  un-split rejoins the English cells with a single space (the app's existing
  join convention), confirm-guarded when both are non-empty; split and un-split
  are each ONE app-undo entry that restores focus.
- **Codex detail adopted**: a footnote anchor never splits — it stays whole on
  the side holding its marker.
- **Phasing — format first**: Slice 1 = format + round-trip tests + compat
  guard, NO UI (the canonical format is proven safe before a split can be
  authored). Slice 2 = display expansion + split/un-split UX + undo. Slice 3 =
  export + golden tests + citation/assist folding.

## Divergences — adjudicated

| # | Question | deep-reasoner | Codex | DECISION |
|---|----------|---------------|-------|----------|
| A | Offset basis | JS code units (the file's own `.length`/`.slice` basis, documented) | Grapheme offsets via `Intl.Segmenter` + fallback | **Code units**, with word-boundary discipline replacing grapheme machinery: split creation snaps to a Greek word gap, and load-time validation requires the offset to sit at a word boundary in the file's Greek (whitespace/punctuation before it) — otherwise it's drift (→ E). Combining-mark safety falls out of never splitting mid-word; no environment-dependent segmenter, and code units match every other offset in the file format. |
| B | English segment delimiter | `¶` (U+00B6) structural token, `\¶` escape | `\p` backslash sequence | **`¶`** — chapter files are John's canonical, diffable data; a pilcrow IS a paragraph mark and reads as one in a diff. Escape a literal `¶` on serialize so round-trip is by construction (it will never occur in practice). |
| C | Compat mechanism | `schema_version` stays 1; parser gains a capability guard NOW: `line_splits` present but unsupported → plain-sentence refusal | Bump to `schema_version: 2` when splits exist; parser rejects unknown versions | **Stay v1 + capability guard** (deep-reasoner). The guard does exactly what a version bump would (a stale build refuses split-bearing files with one plain sentence: *"This chapter uses paragraph splits, which this version of the app can't open yet — update the app to edit it."*) without version-flapping as splits come and go, and unsplit files stay byte-identical. Since no build has ever been distributed, guard and feature ship together; no vulnerable build will exist. Codex's version-discipline point is noted for a future format change that ISN'T additive. |
| D | Dividing existing English at split time | At the English caret if the caret is in that cell; else continuation starts empty | Proportional ratio (Greek offset → English word boundary) | **Caret-else-empty** (deep-reasoner). Proportional Greek→English position mapping is a guess about word order — the very thing that makes English split points non-derivable and explicitly stored. A wrong guess creates silent cleanup work; an empty continuation is honest and one paste away. (Confirm with John — §4.2.) |
| E | Invalid/drifted offset at load | Line loads UNSPLIT + one-sentence notice; English `¶` segments rejoined with a space — nothing lost, re-split is one gesture | Chapter opens read-only, autosave blocked, until fixed | **Degrade with notice** (deep-reasoner) — matches the existing hydration drift policy, and a read-only chapter is hostile to the non-technical collaborator. The notice is honest: *"A paragraph split in line 1b8 didn't line up with the Greek and was removed — re-split if you still want it."* English is never dropped; on any English-count/offset-count skew, the English count wins (prose over metadata, always). |
| F | Backspace at a continuation start | Offers the un-split affordance | Navigation only (caret moves to previous segment end); joining requires the explicit command | **Navigation only** (Codex). "Backspace never merges anything" stays absolutely true — one rule, no exceptions, no accidental joins. Un-split is only the explicit context-menu command (confirm-guarded per above). |

## Module boundaries (union of both memos)

- `chapterfile/types.ts` + `parse.ts` — `LineSplit` type, `line_splits`
  parse/serialize + validation + capability guard + drift notices.
- `editor/serialize.ts` — `¶` structural token, `parseRowSegments`/
  `serializeRowSegments` (thin wrappers over parseRow/serializeRow), escape.
- `editor/model.ts` — `splitOffsets`/segment English on `RowModel`;
  segment-order footnote walk.
- `editor/gridRows.ts` (new, pure) — `expandRows` display derivation, stable
  keys that don't remount unrelated rows.
- `editor/ChapterEditor.svelte` + `GreekCell`/`RowGutter`/`RowEditor` +
  `plugins/rowKeymap.ts` — grid expansion, per-segment views keyed
  `(row, segment)`, Greek context-menu split, un-split command, navigation over
  grid rows, undo entries carrying the row's segment bundle.
- `library/autosave.ts` — emit `line_splits` + `¶`; hydrate segments + notices;
  self-check passes on split models (the last line of defense on user data).
- `export/pandocMarkdown.ts` + `compile.ts` — paragraph grouping, stamp-once.
- Copy-citation + assist ChapterEditor call sites — fold segments per address.

## Acceptance gates

1. Round-trip by construction (no splits / one / two-on-one-line / empty
   continuation / escaped `¶` / drift cases / capability guard) — passes before
   any UI exists.
2. `serializeModel` self-check green on split models.
3. Export golden tests: paragraph at the split, one stamp per address, both
   modes, footnotes across the split, two splits → three paragraphs.
4. Browser-functional verification (no screenshots): split → two gutter rows
   with equal addresses; caret-divided English; un-split confirm + rejoin;
   stored file contains `line_splits` + `¶`; reopen restores; export contains
   the break.

## §4 John's answers (2026-07-03 — all settled)

1. **Gesture**: right-click a Greek word gap → "Start new paragraph here". ✔
2. **English at split time**: divide at his caret when it's in that row's
   English cell; otherwise the continuation starts empty. Proportional guess
   rejected. ✔
3. **Bilingual export parity**: YES — the Greek block also paragraph-breaks at
   the split. ✔
4. Adopted defaults (presented, not objected to): un-split confirms only when
   both halves have text; stale-build refusal sentence as in (C); Backspace
   never joins segments — un-split is an explicit command. ✔
5. Build go-ahead: all three slices, sequential, format first. ✔
