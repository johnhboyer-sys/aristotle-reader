# D6 — Splitting a Bekker line at a paragraph boundary (deep-reasoner memo)

Status: **design proposal**, deep-reasoner agent, 2026-07-03. Amends D1's row-lock
invariant. John's three decisions (English splits too; the split is a manuscript paragraph
boundary in export; gutter repeats the address, continuation Greek indented) are taken as
settled and are not reopened.

---

## Decisions summary

| # | Question | Decision | Key rationale |
|---|----------|----------|---------------|
| 1a | Model representation | **One `RowModel` per Bekker line stays canonical; add `english2?: PMDocJSON` for the continuation cell and `splitOffset?: number` (Greek char offset).** The model row count is STILL the spine count. | Preserves D1's "row count owned by the spine, nothing the user does creates/destroys a row." A split is data *about* one line, not a new line. |
| 1b | File representation | New optional frontmatter field **`line_splits: "1b8@14,…"`** — pairs of `<rawAddress>@<greekCharOffset>`. English continuation stored **inline in the existing `[ENGLISH]` row** with a `¶` split token in the row markup. Greek is NEVER copied. | Mirrors the proven `column_starts` pattern (opaque address + integer, additive, optional). Offset is validated against the on-disk Greek; on mismatch the line loads UNSPLIT with a plain-sentence notice. |
| 1c | Multiple splits per line | **Allowed in the model and file** (offset is a list per address, English carries N `¶` tokens). Phase 1 UI offers only single-split; the format is N-ready so we never migrate again. | Cheap to make the data model general now; expensive to migrate canonical files later. |
| 2 | Round-trip + migration | `schema_version` stays **1**. Old files load unchanged (no `line_splits`, no `¶`). New file in old app: the `¶` token is unknown markup → **fails the row round-trip self-check loudly**, and old app lacks the parse for `line_splits` → we add a forward-compat guard NOW (see §2). Round-trip tests assert `parse(serialize(x)) ≡ x` including split lines and offset-validation failure paths. | Splits are additive to a v1 file that older builds already tolerate *structurally* (extra frontmatter key ignored); the danger is the `¶` token, handled by the loud self-check. |
| 3 | Identity plumbing | **Model keeps one entry per Bekker line (segments live inside the row); the DISPLAY layer expands one split row into two grid tracks.** Everything keyed by row index/address is unchanged; only the `{#each}` render and caret/focus plumbing learn about a `segment: 0|1`. | Minimal blast radius. Autosave/sync/undo/footnote-anchoring/copy-citation all continue to think in Bekker-line rows. |
| 4 | Split/un-split UX | Split is placed in the **Greek cell** (right-click a word gap → "Start new paragraph here"); the offset is what's stored. English divides at the **English caret** if the caret is in that cell, else the second cell starts empty. Un-split rejoins the two English cells with a single space, confirm-guarded only when both cells are non-empty. Each is ONE undo entry. | Greek offset is the durable anchor; English division follows the translator's intent at split time. |
| 5 | Display | Two grid rows, both gutter cells show the same raw address; continuation Greek indented ~1.5em (reader-site precedent); continuation English renders flush as a new paragraph. Bekker stamps / gutter ticks unaffected (same address, no new line). | Matches John's confirmed visual + the docx paragraph semantics. |
| 6 | Export | `buildBody`/`renderRowsParagraph` emit a **paragraph break** at a split (both single-chapter and whole-work; english and bilingual). Bekker stamp fires **once per address** (on the first segment only). Stored files untouched (existing invariant reasserted by test). | The one real behavioral change downstream: the "join all rows with spaces into one paragraph" assumption becomes "join within a paragraph; new paragraph at a split." |
| 7 | Copy-as-citation & AI-assist | Copy-citation treats the two segments of one address as **one row** (full English = both halves joined by space; one address for start/end). AI-assist treats a split line as **one context line** (address appears once; English = both halves joined). | An address is the citable/contextual unit; segments are a manuscript-layout detail, not a citation or context boundary. |
| 8 | Phasing | Slice 1 = data model + file format + round-trip tests (no UI). Slice 2 = display expansion + split/un-split UX + undo. Slice 3 = export paragraph break + golden tests. | Canonical-data format lands first, fully tested, before any UI can write it. |

---

## 0. The precise reconciliation with D1's invariant

D1: *"one row = one Bekker line. Row count is owned by the Greek spine; NOTHING the user does
creates or destroys a row. No merging, ever."*

State it precisely for this feature:

- **The spine still owns Bekker lines.** The number of *Bekker lines* in a chapter is fixed by
  the corpus/file and no user action changes it. `model.rows.length` remains the Bekker-line
  count. `spansFromModel`, `columnStartsFromModel`, `rowAddress`, hydration, sync — all keep
  counting Bekker lines.
- **The user now owns intra-line paragraph splits.** A split is a *display+manuscript* subdivision
  of one Bekker line into ≥2 visual/paragraph segments that all share the one raw address. It
  creates **grid rows**, not **model rows / Bekker lines**.
- **Un-splitting is NOT the forbidden "merging."** The forbidden operation is merging two *distinct
  Bekker lines* (1b8 + 1b9) into one — that would destroy an address the spine owns. Un-splitting
  rejoins two *segments of the same address* (both are 1b8) that the user themselves created. No
  address is created or destroyed; the Bekker-line count is invariant across split/un-split. This
  is categorically different and safe. The D1 guard rails in `rowKeymap.ts` (Backspace-at-row-start
  "Bekker lines can't be merged") remain exactly as written — they fire at *segment* start too and
  never touch un-split (un-split is an explicit command, not a Backspace).

This is the whole conceptual move: **splits are a property of a Bekker line, stored as data about
the line, expanded by the view — never a new line.**

---

## 1. Data model

### 1a. In `ChapterModel` / `RowModel` (`src/lib/editor/model.ts`)

Keep exactly one `RowModel` per Bekker line. Extend it:

```ts
export interface RowModel {
  address: Address;          // unchanged — one address per Bekker line
  greek: string;             // unchanged — full spine line
  english: PMDocJSON;        // the FIRST segment's English (unchanged field name)
  /** Paragraph-split points as Greek character offsets into `greek`, ascending,
   *  0 < offset < greek.length. Absent/empty = unsplit (the common case). */
  splitOffsets?: number[];
  /** English of continuation segments, parallel to splitOffsets (segment k+1's
   *  English is english2[k]). Length === splitOffsets.length when present. */
  english2?: PMDocJSON[];
}
```

Rationale for **segments-inside-a-row** rather than **sibling row entries with a segment index**:
- Every module that iterates `model.rows` (autosave, sync, copy-citation, assist, span/columnStarts
  math, footnote index) keeps seeing one entry per Bekker line with zero change. Sibling entries
  would force every one of those loops to special-case "is this a real row or a continuation" —
  large blast radius, exactly what we're avoiding.
- The address is unique per entry, so `columnStartsFromModel`'s per-row-address arithmetic and the
  sync/autosave key logic are untouched.

**Multiple splits: yes, in the model.** `splitOffsets` is a list. A single Bekker line rarely needs
two paragraph breaks, but the cost of a list vs a scalar is ~0 and it removes any future migration.

### 1b. In the chapter file (`chapterfile/parse.ts` + `types.ts`) — the high-stakes part

Two coordinated additions, both additive and optional (identical spirit to `column_starts`):

**(i) Frontmatter `line_splits`** — the Greek offsets, keyed by address:

```
line_splits: "1b8@14,1b8@31,1b12@22"
```

Grammar: comma-separated `<rawAddress>@<greekCharOffset>` pairs. `rawAddress` is an **opaque raw
string** (validated only by `scheme.parseAddress`, never compared with `<`, per D2). `greekCharOffset`
is a positive integer, a JS string index into that row's `[GREEK]` line (code-unit offset — the same
`.length`/`.slice` basis the whole file uses; documented explicitly so a future contributor doesn't
"fix" it to code points). Multiple pairs may share an address (multiple splits). Parser adds a
`ChapterFileMeta.lineSplits?: LineSplit[]` field (`{ ref: string; offset: number }`), validating:
each `ref` parses under the scheme; `0 < offset`; refs appear in `[GREEK]`/address order; offsets for
a shared address strictly increasing. **New `LineSplit` type in `types.ts`.**

Why frontmatter and not an inline Greek token: the Greek spine text is **never stored as editable
content** — `[GREEK]` lines are the verbatim spine, and a split must be "data about the line," so the
offset lives in metadata exactly like `column_starts`. Putting a marker inside the `[GREEK]` line
would (a) mutate spine text on disk, violating the TLG-derived-text rule, and (b) break the 1:1
`[GREEK]`/`[ENGLISH]` line-count invariant the parser enforces.

**(ii) English continuation: a `¶` split token inside the existing `[ENGLISH]` row markup.**

The `[ENGLISH]` section stays 1:1 with `[GREEK]` (one physical line per Bekker line). A split line's
English is stored as `firstSegmentMarkup ¶ secondSegmentMarkup` (N `¶` for N splits). `¶` (U+00B6) is
added to `editor/serialize.ts` as a **structural token**: on parse it does NOT become text; it splits
the row markup into segment docs. It is escaped (`\¶`) if it ever appears as literal text (it won't in
practice; the escape keeps round-trip total). This keeps the English half of a split co-located with
its line — the parser reads one `[ENGLISH]` line and yields `{ english, english2[] }`.

**Why `¶` in `[ENGLISH]` rather than a parallel `[ENGLISH2]` section or offset-only:** English split
points are NOT derivable from the Greek offset (English word order ≠ Greek), so the English division
must be stored explicitly. Co-locating it in the row keeps the "one physical line per Bekker line"
mental model and the existing hydration path (`parseRow(englishLines[i])`) almost intact — it becomes
`parseRowSegments(englishLines[i])` returning 1..N docs.

### Offset validation and the plain-sentence failure (the load-time contract)

The Greek spine is TLG-derived and can differ across machines/exports (hydration already handles
"saved Greek differs from corpus"). A stored offset could therefore land mid-nonsense on another
machine. Rule, mirroring hydration's existing "file is canonical, notice on drift" policy:

- The offset is validated against **the file's own `[GREEK]` line** (which is canonical and travels
  with the file), NOT the live corpus spine. So a normal open on any machine is fine: the offset and
  the Greek it indexes are in the same file.
- If a `line_splits` offset is out of range for its `[GREEK]` line (`offset >= greekLine.length` or a
  hand-edit corrupted it), that line **loads UNSPLIT** and a single plain sentence surfaces:
  *"A paragraph split in line 1b8 didn't line up with the Greek and was removed — re-split if you
  still want it."* Never a crash, never silent data-shape corruption. The English `¶` for that line
  is then rejoined with a space (the un-split rejoin, §4) so no English is lost.
- If the English row has a different `¶` count than `line_splits` has offsets for that address
  (hand-edit skew): take the **English `¶` count as authoritative for how many segments exist** (it's
  the user's actual prose), pair offsets positionally, and if offsets run short, the extra English
  segments render with **no Greek indent anchor** (they still display, flush) plus the same one-line
  notice. English is never dropped; that's the invariant that dominates every tie-break.

---

## 2. Round-trip + migration

**`schema_version` stays 1.** `line_splits` is additive-optional exactly like `column_starts` (which
was added without a bump). A bump would force old builds to reject *every* new file including
unsplit ones — far too broad.

**Compatibility matrix:**

| | reads OLD file (no splits) | reads NEW file (has a split) |
|---|---|---|
| **OLD app** | fine (baseline) | **fails loudly, safely** — see below |
| **NEW app** | fine (no `line_splits`, no `¶`; loads unsplit) | fine (the feature) |

*NEW app / OLD file:* no `line_splits` key, no `¶` tokens → every line unsplit. Zero change. ✔

*OLD app / NEW file* is the one that needs deliberate handling, and it is naturally loud:
- The unknown frontmatter key `line_splits` — the old parser's `parseFrontmatter` reads named fields
  and ignores extras, so it does NOT reject the file on that key alone. (Confirmed: it pulls specific
  keys, doesn't fail on unknowns.)
- BUT the `¶` token in an `[ENGLISH]` row is unknown markup to the old `parseRow`, which treats it as
  **literal text**. On the old app's autosave round-trip self-check (`serializeModel`), the re-parse
  will not reproduce the `¶` as a structural token (it's literal there too), so the shapes actually
  *match* and it would NOT throw — meaning the old app would silently show `1b8 … ¶ …` as one row with
  a stray pilcrow in the English. That is a quiet corruption risk.
- **Mitigation (do this in Slice 1, before any file can carry a split):** add a forward-compat guard
  to the **current** parser now — if `line_splits` is present, and the running build does not
  implement splits (a build-level `SUPPORTS_LINE_SPLITS` capability flag, false on today's build),
  `parseChapterFile` throws a plain `ChapterFileError`: *"This chapter uses paragraph splits, which
  this version of the app can't open yet — update the app to edit it."* This turns a silent pilcrow
  into a clear, honest refusal on stale builds. Because we ship this guard in the SAME release that
  introduces the feature, the very first split-bearing file any deployed old build encounters already
  refuses cleanly. (John's collaborator runs an installed build; the turn-taking + reload-on-focus
  convention from `sync.ts` means a stale build is the realistic risk, and this covers it.)

**What the executable round-trip tests assert (`chapterfile/__tests__` + `serialize.test.ts`):**
1. `parse(serialize(file)) ≡ file` for a file with: no splits; one split; two splits on one line;
   splits on non-adjacent lines; a split whose second English segment is empty (untranslated
   continuation) — the empty-tail case that the structural-blank logic already guards.
2. `serializeRuns`/`parseRow` round-trip with `¶` tokens and with an escaped literal `\¶`.
3. Offset out-of-range → loads unsplit + returns the notice (assert the notice string and that
   English is rejoined, not lost).
4. English `¶` count ≠ offset count → English-count wins, notice returned, no English dropped.
5. `serializeModel`'s existing round-trip self-check still passes for split models (it must, or
   autosave aborts — this is the last line of defense on user data).
6. Forward-compat guard: a file with `line_splits` throws the plain sentence when the capability
   flag is off.

---

## 3. Identity plumbing (one Bekker line → two grid rows)

**Chosen approach: model keeps one entry per Bekker line (segments inside); the DISPLAY layer expands
a split row into two grid tracks.** Enumerated impact, smallest-blast-radius:

- **`ChapterEditor.svelte` `{#each model.rows as row, i (...)}`** — today one iteration = one grid row
  (`GreekCell` + `RowGutter` + `EnglishCell`, all `style="grid-row: {index+1}"`). Change: derive a
  flat **`gridRows`** array from `model.rows`, expanding each split row into `{ rowIndex, segment,
  address, greekSlice, englishDoc, indent }` entries. The `{#each}` iterates `gridRows` with key
  `` `${rowIndex}.${segment}:${address.raw}` ``. `grid-row` becomes the running grid-track index, not
  `rowIndex+1`. **This is the only place the "one line = two rows" fact lives.**
- **`RowGutter`** — now rendered once per segment, all segments of a line pass the **same** `raw`
  (John's confirmed "repeat the address"). No parsing change (it already treats raw as opaque).
- **`GreekCell`** — receives `greekSlice` (the segment's substring) + an `indent` flag for
  continuation segments (segment > 0). Splitting the string is a pure `greek.slice(offsets…)`.
- **`EnglishCell` / `RowEditor` (one TipTap per cell)** — a split line mounts **two** TipTap instances
  (one per segment). This is the substantive editor change: focus/goal-column/commit must key on
  `(rowIndex, segment)` not just `rowIndex`.
- **`rowKeymap.ts` `RowContext`** — its index-based methods (`focusRowEnd(k)`, `isRowEmpty(k)`,
  `focusRowAtX`, `flash`) need a segment dimension for split rows. Minimal way: make the *view registry*
  in ChapterEditor key on a composite `viewId = rowIndex*BASE + segment` (or a `{row,seg}` tuple map),
  and have `RowContext` operate on **grid-row ordinals** for navigation (Enter/Tab/Arrow advance to the
  next *grid* row, which may be the second segment of the same address). The D1 muscle memory (Enter
  advances one visual line) is preserved and actually improved: Enter from segment 0 lands in segment 1.
  The "Bekker lines can't be merged" guard still fires at grid-row boundaries between *distinct
  addresses* only; between two segments of one address, Backspace-at-start should instead offer the
  un-split affordance (see §4) — a deliberate, non-destructive difference.
- **Autosave (`spansFromModel`, `columnStartsFromModel`, `chapterFileFromModel`)** — **unchanged.**
  They iterate `model.rows` (one per Bekker line). `chapterFileFromModel` gains: serialize each row's
  English as `serializeRowSegments(row)` (joins segment docs with `¶`) and emit `line_splits` from
  `row.splitOffsets`. Span/columnStarts arithmetic never sees a segment.
- **`sync.ts` content hashing** — unchanged (hashes the serialized string, which now includes
  `line_splits` + `¶`; that's correct — a split IS a content change).
- **Undo (`history.ts` `UndoEntry`)** — entries are keyed by `rowIndex`. A segment edit is still a
  single-row edit (`before/after` are the whole row's `{english, english2, splitOffsets}` snapshot,
  which are "bytes not KB" per D1). Split/un-split is one entry that captures the row's before/after
  (offsets + both English docs). **`UndoEntry.edits[].before/after` broaden from `PMDocJSON` to the
  row's segment bundle** — a contained change, since undo already snapshots whole row docs.
- **Footnote anchoring** — `fnRef` marks live inside a TipTap doc; each segment is its own doc, so
  anchors ride along automatically per segment (ProseMirror maps them). `markerIdsIn` /
  `anchoredFootnoteCount` / display-number order must walk **segments in order** (segment 0 then
  segment 1 of each row) so document order is correct. This is a small loop change in
  `autosave.ts`/`model.ts`, not a data-model change.
- **CSS grid explicit tracks** — `grid-template-rows` isn't enumerated (rows flow); `grid-row: N`
  becomes the running grid ordinal. `align-items: start` + `max(Greek,English)` per track still holds
  per grid row. No subgrid, no measured spacers — consistent with D1's flat-grid decision.

**Rejected: model rows become segments (flatten splits into `model.rows`).** This would make the
model a list of segments and re-introduce "which entries are real Bekker lines" everywhere — breaking
the clean one-address-per-row contract that autosave/sync/copy-citation/assist rely on, and forcing
`columnStartsFromModel`'s arithmetic to skip continuation entries. Far larger blast radius; rejected.

---

## 4. Split / un-split UX

**Placing the split (Greek is the durable anchor):** the stored datum is a Greek char offset, so the
user places the split **in the Greek cell**. Interaction: right-click a whitespace gap between Greek
words (or click a caret position in the read-only Greek and use a "Split here" toolbar/menu action) →
context item **"Start new paragraph here"**. The offset = the char index of that word boundary. We snap
to the nearest word boundary (no mid-word splits) and reject offset 0 or `>= length`. This matches the
example (split 1b8 at "ἡ γὰρ" → offset before "ἡ").

**Dividing the English at split time:**
- If the English cell of that line currently has the caret in it, divide the English **at the caret**:
  content before caret → segment 0, content after → segment 1 (a ProseMirror slice; footnote
  marks/markers ride along with their text). This is the natural case — John reads, decides "the
  paragraph breaks here," and his cursor is where he wants the English to break.
- If the caret is not in that English cell (e.g. he right-clicked Greek without touching English), the
  **second English cell starts empty** and the first keeps all existing English. He can move text later
  by ordinary editing; nothing is lost.

**Un-split:** an explicit command (context menu "Merge paragraph back" on either segment, or the
non-destructive Backspace-at-segment-start affordance from §3 offering it). Behavior:
- Remove the offset; **rejoin the two English cells' content with a single space** (`docA` + space +
  `docB`, concatenating their inline content into one row doc; footnotes preserved).
- **Confirm-guarded only when BOTH English cells are non-empty** (rejoining could visually merge two
  real paragraphs of prose — worth a one-line confirm: *"Merge these two English paragraphs back into
  one line?"*). If either cell is empty, rejoin silently (nothing to lose).
- Rejoin uses a single space to match the paste-flatten and copy-citation join convention already used
  across the app (`flattenSegments`, `buildCitationClipboardText` both join with ' ').

**Undo:** split is **one** `UndoEntry` (before: unsplit row; after: two-segment row). Un-split is one
entry (the inverse). One Cmd-Z reverses either completely, re-focusing the affected row/segment, per
D1's undo-restores-and-refocuses rule.

**ASK JOHN candidates** (kept minimal): (a) confirm the Greek-cell right-click is the primary gesture
vs. a caret-in-Greek + toolbar button; (b) whether un-split of two non-empty English paragraphs should
confirm (recommended yes) or just be undoable.

---

## 5. Display

Per John's confirmed decisions and the reader-site precedent:
- **Two grid rows.** Both gutter cells render the **same raw address** (e.g. `1b8` / `1b8`).
- **Continuation Greek indented ~1.5em** (`GreekCell` gets an `indent` flag for segment > 0; reuse the
  reader site's `class:cont` ~1.5em precedent noted in memory). First segment flush.
- **Continuation English renders flush as a new paragraph** — same left edge as segment 0's English,
  visually a paragraph break, matching the docx semantics (§6). No extra English indent (the paragraph
  break is the signal; docx will render it as a new `\n\n` paragraph).
- **Bekker stamps / gutter ticks unaffected:** both segments share one address and no new Bekker line
  exists, so the every-5 / column-transition stamp logic sees the same line once (it operates on the
  Bekker-line row, §6 handles emitting the stamp on segment 0 only). No new gutter tick is created by a
  split; the second segment's gutter is the *repeated* address, purely visual, not a new line marker.

---

## 6. Export (the one real downstream behavior change)

Today `buildBody` (`pandocMarkdown.ts`) and `renderRowsParagraph` (`compile.ts`) push each row's
rendered markup into `parts[]` and `parts.join(' ')` — **one paragraph for the whole chapter/body**.
Splits require a **paragraph boundary**.

Change (both single-chapter and whole-work; english AND bilingual):
- Render **per segment**. When a row has `splitOffsets`, its English produces multiple segment
  markups. Between segments of a split line, and at the split point, emit a **paragraph break** (`\n\n`
  in the Pandoc markdown — a new paragraph). Concretely: accumulate `parts` as before *within* a
  paragraph, but a split forces a new `parts` group; groups are joined by `\n\n`, non-split rows
  continue to flow within the current group joined by ' '. (John's chapters are otherwise one flowing
  paragraph per chapter; a split is the ONLY intra-chapter paragraph break, which is exactly the
  feature.)
- **Bekker stamp fires once per address**, on **segment 0** only. `stampFor` already keys on the
  Bekker-line row index; the continuation segment carries the same address and MUST NOT re-stamp
  (would duplicate `[1b8]`). Implementation: iterate Bekker-line rows for addressing/stamping (one
  address per row, unchanged), and within a row iterate its segments for text — the stamp prefixes the
  first non-empty segment; later segments of the same row get no stamp.
- **Bilingual mode:** the Greek block is a separate stacked block per chapter today. A split affects the
  ENGLISH block's paragraphing; the Greek block MAY also break at the same point for parity (John
  confirmed the split is a paragraph boundary in bilingual mode too). Recommend: the Greek block
  paragraph-breaks at the same split (its segment 0 / segment 1 Greek slices become two paragraphs),
  keeping Greek and English manuscript structure parallel. Greek carries no footnotes (unchanged).
- **Assert stored files untouched by compile** — reassert the existing `compile.ts` invariant test
  (functions take `ChapterFile` values, return strings, never write back) with a split-bearing fixture.

**Golden tests:** add `¶`/`line_splits` fixtures to `pandocMarkdown.test.ts` + `compile.test.ts`
asserting: the paragraph break appears exactly at the split; the stamp appears once (on segment 0);
english-only and bilingual both break; footnotes still resolve across the split; a two-split line yields
three paragraphs.

---

## 7. Copy-as-citation and other row-consuming features

- **Copy-as-citation (`copyCitation.ts`):** a split line is **one citable row**. `CitationRowInput`
  stays one-per-address; its `englishDoc` for a split line is the **concatenation of both segment docs**
  (or, when a selection covers only part, the selected text as today). Start/end addresses use the one
  address. Segments are a manuscript-layout detail with no citation meaning — a reader citing "1b8"
  wants the whole line's English, not "the first paragraph of 1b8." So the DOM→row-range resolver in
  `ChapterEditor.svelte` must map both segment cells of a split line back to the single
  `CitationRowInput`. No change to `copyCitation.ts`'s pure logic.
- **AI-assist (`assistController.ts` / `buildAssistContext`):** treat a split line as **one context
  line** — address appears once, `greek` is the full spine line, `english` (draft) is both segments
  joined by space. Rationale: the assist prompt is Bekker-line-addressed (`rowAt(i)` returns one
  address); presenting two "rows" for one address with the same address would confuse the model's
  line-to-translation mapping and break the ±6-row window's meaning (6 *lines*, not 6 segments). The
  `requestAssist` target is still a Bekker-line row; if the caret is in a continuation segment, the
  suggestion targets that segment's English cell but the context is assembled per address. `plainRowText`
  gains a "join this row's segments" wrapper at the call site; the pure function is unchanged.
- **Footnote index (`library/footnoteIndex.ts`)** — walks rows for markers; extend to walk segments in
  order (same as §3 footnote-order note). No index-shape change.

---

## 8. Module boundaries, test plan, phasing

**Files touched (and the nature of the change):**
- `editor/model.ts` — add `splitOffsets`/`english2` to `RowModel`; segment-aware footnote-order helper.
- `chapterfile/types.ts` — add `LineSplit` type + `lineSplits?` on `ChapterFileMeta`.
- `chapterfile/parse.ts` — parse/serialize `line_splits`; offset validation + notice; segment split of
  `[ENGLISH]` rows; forward-compat capability guard.
- `editor/serialize.ts` — `¶` structural token; `parseRowSegments`/`serializeRowSegments` (thin wrappers
  over existing `parseRow`/`serializeRow`, splitting/joining on `¶`); escape `\¶`.
- `library/autosave.ts` — `chapterFileFromModel` emits `line_splits` + `¶` English; `hydrateFromFile`
  returns segmented rows + the drift notice; footnote-order walks segments. (spans/columnStarts
  unchanged.)
- `editor/ChapterEditor.svelte` — derive `gridRows`; expand `{#each}`; composite view-registry key;
  Greek/English split UI + context menu; un-split command; DOM→row mapping folds segments per address.
- `editor/GreekCell.svelte` / `RowGutter.svelte` / `RowEditor.svelte` — segment slice, indent flag,
  repeated address, per-segment TipTap.
- `editor/plugins/rowKeymap.ts` — `RowContext` navigation over grid rows; segment-boundary
  Backspace → un-split affordance (non-destructive).
- `editor/history.ts` — `UndoEntry` edit payload broadens to the row's segment bundle.
- `export/pandocMarkdown.ts` + `export/compile.ts` — paragraph break at splits; stamp once per address.
- `editor/copyCitation.ts` call site (in ChapterEditor) + `assistController.ts` call site — fold
  segments per address (pure functions unchanged).

**New pure logic (all node-env unit-testable, no jsdom):** `parseRowSegments`/`serializeRowSegments`;
`line_splits` parse/serialize + validation; `gridRows` derivation (extract as a pure
`expandRows(model.rows)` in a new `editor/gridRows.ts` so it's testable without mounting Svelte);
export paragraph-grouping.

**Acceptance gates:**
1. **Round-trip by construction** (§2 tests) — the format gate; must pass before any UI writes splits.
2. **Compile golden tests** (§6) — english + bilingual, single + whole-work, stamp-once, footnotes.
3. **`serializeModel` self-check** passes for split models (autosave safety).
4. **Browser-verifiable steps** (functional, per John's no-screenshots rule): right-click Greek gap →
   "Start new paragraph here" produces two gutter rows with the same address (assert DOM `data-row`s +
   two gutter texts equal); English caret-split moves the after-caret text to the second cell (assert
   cell text); un-split with both non-empty prompts, then rejoins with a space (assert one cell, joined
   text); autosave writes `line_splits` + `¶` to storage (assert stored file string); reopen restores
   the split (assert two segments); export contains the paragraph break (assert `\n\n` at the split and
   one `[1b8]` stamp).

**Minimal first slice (Slice 1 — no UI):** land `LineSplit` type + `line_splits` parse/serialize + `¶`
token + `parseRowSegments`/`serializeRowSegments` + offset validation/notice + forward-compat guard +
all §2 round-trip tests, plus `chapterFileFromModel`/`hydrateFromFile` handling splits round-trip. At
the end of Slice 1 the format is fully specified, tested, and safe on old builds, but nothing in the UI
can create a split yet — the canonical data format is proven before a single split can be authored.
Slice 2 = `gridRows` display expansion + split/un-split UX + undo. Slice 3 = export paragraph break +
golden tests.

---

## ASK JOHN (short — the three big decisions are settled)

1. **Split gesture:** right-click a Greek word gap → "Start new paragraph here" as primary, OR
   caret-in-Greek + a toolbar "Split" button? (Recommend right-click; both storable identically.)
2. **Un-split of two *non-empty* English paragraphs:** one-line confirm (recommended) vs. silent-but-
   undoable?
3. **Bilingual export:** should the **Greek** block also paragraph-break at the split for parity
   (recommended, keeps Greek/English manuscript structure parallel), or only the English block breaks?
4. **Forward-compat wording** on stale builds — confirm the plain sentence: *"This chapter uses
   paragraph splits, which this version of the app can't open yet — update the app to edit it."*
