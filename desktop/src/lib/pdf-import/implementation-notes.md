# Implementation notes — ambiguities & conservative readings

- pages.ts: doubled form feeds preserved as empty pages (flag-friendly), not merged.

## gutter.ts (Phase 1 gutter-tic scan)

- bare-tic 1–99 with layered defense (A2): empirical — 40/45 common, Physics 7 to 70+.
- verso fragment-skip symmetric (A5): interpretive commitment to "begins on the line".
- recto gate relative (A3): absolute floors rejected the Lennox col-78 fixture.
- Cross-page band EWMA smoothing constant (§7's band-outlier check fixes the 12-col
  threshold but not the smoothing rate): picked alpha=0.3 as a conservative default —
  no test exercises the exact value, only the >12 threshold behavior.
- Header "cadence-consistent in-band tic" guard (§4's strip guard): implemented as a
  best-effort check (does removing header-exclusion yield a candidate whose delta from
  ctx.lastTic is 4 or 5?) since the spec doesn't fully specify the side-agnostic grammar
  to use at a point in the pipeline before side is decided. No fixture exercises this
  path (real running heads never coincide with a genuine tic position); documented here
  rather than silently guessed.
- Collapse-driven display-nulling (§11) is cosmetic only: a bare tic on a collapsed page
  gets `column`/`line` nulled in the OUTPUT Tic (plus `position-unresolved:collapsed`),
  but internally `ctx.lastTic`/monotonic-chain continuity uses the real resolved
  numbers regardless of collapse, so cross-page cadence tracking never loses its place
  just because one page's geometry was too irregular to trust at face value. Spec is
  silent on this; conservative reading favors never discarding real chain data.
- Real-slice honesty run (ne-slice.txt, NE 1094a-1181b + Magna Moralia's opening page,
  176 pages) surfaced three genuine anomalies the scanner correctly caught rather than
  silently absorbing — see the integration test report for full characterization:
  (1) a truly missing printed mark (`dropped-line:1119b20`, page 50) where a chapter
  heading block appears to have displaced the routine gutter mark; (2) a single
  corrupted full-form (`non-monotonic:1029a1`, page 67 — should almost certainly be
  1129a1, the well-known Bekker page NE Book 5 opens on) that the monotonic guard
  correctly refused to trust, costing 6 subsequent bare tics their position until a
  valid `1129b1` re-synced the chain two pages later; (3) a genuine work-boundary
  anomaly (`non-monotonic:1181a25`, page 175) — Magna Moralia's real, historically
  attested Bekker opening mark, which is NOT monotonically after Nicomachean Ethics'
  own ending mark on the previous page. (3) is a real scope limit of the single
  continuous-DocContext design: concatenating multiple works through one DocContext
  will flag a false non-monotonic at every work seam. Not fixed here (out of spec
  scope) — callers should start a fresh `createDocContext()` per work.

## divisions.ts + line-shape.ts (Phase 2 division tagging)

- **Forward-bind stance (spec §7b)**: a tic sitting on a division-heading line binds
  FORWARD past the whole heading block (the `b.c` line and the title line) to the
  section's first body word, flagged `anchor-forwarded-past-heading` — never to the
  heading word "Book". This mirrors the locked paragraph rule ("a break coinciding
  with an anchor binds forward"): a division-adjacent tic marks the onset of the
  section's first line, and heading text renders nothing in the reference stream, so
  binding it would be a silent mis-bind of paratext. The tic itself stays entirely in
  the gutter system (address/cadence/monotonic unchanged). If no body line follows on
  the page, the anchor is left null with `anchor-forwarded-cross-page` for Phase 4 to
  bind on the next page (not observed in the slice). Note that DEMOTED tics forward-
  bind too: Phase 1 keeps a non-monotonic tic in the output with its anchor, so Book
  5's corrupted `1029a1` (on the Book 5 heading line) carries BOTH
  `non-monotonic:1029a1` and `anchor-forwarded-past-heading`, binding to "As" — the
  spec's own verified target list names all four heading tics (Books 5/6/8/9 →
  As/Since/The/In).
- **Title test = center-alignment, NOT a leading-space floor**: a chapter title is
  captured iff its midpoint sits within ±TITLE_CENTER_TOL (4) columns of its `b.c`
  heading's midpoint. A long title ("Natural Virtue, Virtue in the Strict Sense, and
  Practical Wisdom") centers to a leftGap of only ~3 columns, so any meaningful
  left-indent floor would reject real titles; the floor kept (TITLE_LEFT_MIN = 3) only
  excludes flush-left body fragments. Measured max center deviation across all 117
  Reeve titles: 2.0 cols.
- **Doc-level vs division-level flags**: the spec's §10c test table writes e.g.
  "`Book 12` (last 1) → {book:12} + `book-sequence:gap:1->12`", which could be read as
  attaching the flag to the division, but the §9 taxonomy assigns
  `book-sequence:restart/gap` and `preamble-present` doc level. Conservative reading:
  taxonomy wins — sequence restart/gap and preamble go to `DivisionState.flags` only;
  all other audit flags sit on the triggering Division.
- `DivisionState.lastBookDivision` is an implementation-detail field beyond spec §1:
  §4.3 must retroactively flag `book-heading-suspect:no-chapter-1` on the *preceding*
  book division, which may have been emitted from an earlier page/call.
- Keyworded chapter with NO governing book heading and no restated digit (e.g. a doc
  that opens `CHAPTER I` with no `BOOK N` ever): spec is silent. Conservative: book 0
  + `book-heading-missing:unknown`, never a crash.
- **Integration pin update (deliberate, 2026-07-06)**: the real-slice histogram gains
  exactly `anchor-forwarded-past-heading: 4` — the slice's four verified
  tic-on-heading cases (all book headings; no `b.c` line carries a tic). Nothing else
  moved: tic count 1333, full-forms 179, and every Phase-1 flag byte-identical. The
  division invariants pinned alongside were measured on the same run: books
  1..10 + MM restart, 117/117 chapters titled, zero division-level audit flags, no
  preamble, `workOrdinal` 2 after the seam.

## Deferred to Phase 4 (John, 2026-07-06): body diagrams / table-like formatting
Reeve prints occasional diagrams (e.g. the NE 5 proportion diagram — in this work it
sits inside footnote 77, already handled by the note display-line rule). Body-text
diagrams in other works would be scrambled by prose reflow at emission. Phase 4's
emit design must include a body display-block detector (wide internal space runs /
low alpha density, same rule as note display lines): preserve such blocks verbatim
or flag `display-block` with page/line refs in the import summary, and add a review
flag to any tic whose anchor lands on a display line. Detection-side risk is already
bounded: stray diagram numbers that pass the positional gates are caught by the
cadence/monotonic audit (flagged, never silent).

## footnotes.ts + translation-file.ts/imports.ts (Phase 3: footnote separation, scope, format extension)

### AM1-AM4 synthesis decisions (one line each)
- **AM1 (display-line assembly)**: a note's continuation line is DISPLAY (preserved on its own line, spacing verbatim) iff its trimmed content has <3 alphabetic characters OR contains an internal run of >=4 spaces (`isDisplayShapedLine`, line-shape.ts); prose continuations join with a single space, and a source blank line is preserved as an extra line break only when adjacent to a display line, dropped between two prose lines.
- **AM2 (sentinel scope attribute)**: `splitFootnoteBlock` records an explicit `scope=continuous|per-book|per-chapter` attribute on the `<!-- footnotes -->` sentinel when present; absent defaults to continuous. The parser only ever reads this; nothing in this task's scope writes/emits it (emission is a later phase).
- **AM3 (`†` symmetric with `*`)**: both gutter.ts's `FOOTNOTE_LINE_RE` and footnotes.ts's note-starter/marker grammars treat `†` exactly like `*`; a glyph glued to a heading with no matching `† …`/`* …` note anywhere is inert title decoration — dropped silently, never flagged (verified against the real "†Magna Moralia*" case: the leading dagger has no match and is dropped; the trailing star matches the MM star note and becomes a work-level attachment).
- **AM4 (measured, not assumed, counts)**: implemented literally — see "the measured note-count truth" below for the settled 224/228 discrepancy, and the real unmatched set (which contradicts the two designs' 29/42-44 guess — measured honestly instead of copied).

### Phase-1 §4 amendment (coordinated, logged as instructed)
Extended `findBottomFurnitureStart` (gutter.ts) to absorb a wrapped note's continuation lines rather than stopping at the first line that doesn't itself look like a note-starter. The real difficulty: a continuation is encountered BEFORE its own note-opening line when walking upward from the bottom (continuations sit below their opener in the file, but "below" is climbed first), so the walk can't require every absorbed line to be note-shaped, and there is no safe universal blank-run-length threshold to distinguish a TERMINAL body/footnote gap from an INTERIOR gap around a display block (real terminal gaps in the slice run 1-4 blank lines). Resolved with a peek: when a blank line is hit, look at the next non-blank line above it (after stripping a plausible leading/trailing gutter-tic token — `stripLikelyTicEnds` — an ordinary recto/verso body line's own tic is otherwise indistinguishable from a display line, since both have a wide internal gap); if it's display-shaped, the gap is interior (absorb through and keep climbing), else it's terminal (stop). Only commits the climbed span if >=1 note-starter line was actually seen in it. `†` added to the note-line matcher per AM3. footnotes.ts's `computeNoteBlockStart` implements the identical algorithm independently (defensive re-derivation, as instructed), not by importing gutter.ts's version.
- **Bug found and fixed mid-implementation**: an earlier version of the peek gated on `sawNoteLine` already being true, and used "blank-run length >= 2" as the terminal signal. Both were wrong: (1) gating the peek on `sawNoteLine` broke exactly the display-block case AM1 exists for (note 77's diagram) — its interior gap is reached before the note's own opener, so `sawNoteLine` isn't true yet; (2) a real page (the `1096a1`/note-2-and-3 page) has a genuine ONE-blank-line terminal gap, so requiring >=2 blanks over-absorbed real body content (three chapter titles, one real tic) into "furniture," corrupting `chapterDivisions.length` from 117 to 114 and `allTics.length` from 1333 to 1330 in the real-slice integration test. Both bugs were caught BY that same integration test before being committed; the final peek (display-shape test, no `sawNoteLine` precondition) reproduces the original Phase-1/2 pins exactly.

### The measured note-count truth (224 vs 228, AM4)
The two designs counted 224 vs 228 numbered note lines. Measured directly against `ne-slice.txt`: a naive whole-file grep for `^\s*\d{1,3}\.\s+\S` finds exactly **228** lines. Of those, **4** are Magna Moralia's own flush-left BODY section numbers ("1. Since we are deliberately choosing…", "4. Therefore, we must…", "6. It was Pythagoras…", "7. Socrates, coming after him…") that happen to sit at true line-start (three more body section numbers — "2.", "3.", "5." — are mid-line and don't even match that anchored grep, so they were never part of either count). 222 (NE) + 4 (MM false positives) + 2 (MM's real notes "1." and "2.") = 228. Confining note parsing to the bottom-furniture region (as this scanner does, per the base spec's own committed stance) correctly excludes the 4 MM body-section false positives: 222 + 2 = **224**, the true count, now measured and pinned in gutter-slice.integration.test.ts.

Also measured and pinned: 2 star notes (NE's + MM's translator-credit note), 22 continuation lines (rawLines beyond the first, across all 226 notes), 225 body markers found, 226 marker<->note pairs (224 numbered + 2 star, both work-level running-head-glued), zero unmatched notes, and exactly one unmatched marker.

**The real unmatched set does NOT match the two designs' guess.** Both designs' base spec text claims "observed: notes 29, 42-44" as unmatched. Measured and hand-verified against the raw slice text (2026-07-06): every one of notes 29, 42, 43, 44 has a genuine same-page glued marker — "chart.29" (page 26), "noble.42", "earlier43", "waves,\"44" (all three on page 42) — and pairs cleanly with its note. **Zero notes are unmatched in the whole slice.** The one genuinely unmatched item is a MARKER, not a note: page 97, "…the undemonstrated sayings 9–11" prints a Bekker LINE-RANGE apparatus mark (unusual — the ordinary form is a single value) instead of the usual bare tic; gutter.ts's tic grammar has no dash-range form for a bare tic (by design — `RANGE_DASH` exists specifically to keep header-range lookalikes like "1094a–1095a" out of tic recognition), so neither half of "9–11" is ever promoted as a tic, and the second half ("11") survives into `MARKER_RE` exactly as the spec's "never guessed" philosophy predicts — flagged `footnote-marker-unmatched:11` since no note 11 exists on that page, rather than silently paired or dropped. This is reported as a genuine, measurement-settled correction to the base spec's own ground-truth claim, not a bug to paper over.

### Conservative readings / interpretive commitments logged during implementation
- **Scope-scoring position for a numbered note**: §A4 scores transitions "given division boundaries crossed between the two markers' positions" (markers, not notes — notes are always printed at the page bottom, often a full page-turn away from the body they annotate, so using a note's own position would misattribute which chapter/book it belongs to). Implemented literally: `extractFootnotes` uses the MATCHED MARKER's page+lineIdx as the scoring position, falling back to the note's own position only for the rare unmatched case (spec doesn't cover this fallback explicitly; conservative/documented choice, and it never actually fires in the real slice since nothing is unmatched).
- **FootnoteState reset at the work seam**: §A4 says "reset on the book-sequence:restart seam — NE and MM scored independently." This module does not self-detect a restart from `divisions` (it would need `DivisionState`, which isn't part of `extractFootnotes`'s signature) — it follows the SAME established convention already documented above for `DocContext`/`DivisionState` ("callers should start a fresh `createDocContext()` per work"): the caller starts a fresh `createFootnoteState()` per work slice. gutter-slice.integration.test.ts does exactly this at the same seam the division-sequence audit already uses.
- **Heading-glued footnote markers on a division heading** (§A2's "glued to a body-region division heading (`Book 7300`)" case): not exercised anywhere in the real slice (zero division-level flags fire there) or required by any §C1/§C2 test row. Implemented only for the running-head-glued case (`headerGluedMarkers`, real and tested); the division-heading-glued case is a documented, deliberately-deferred gap — divisions.ts currently exposes this only as a flag string on `Division.flags`, not a structured `{label, atDivision, lineIdx}` record, and building that out was judged out of scope for a case with zero test coverage in either the spec's tables or the real corpus.
- **`[^*]` inline body markers collide with emphasis's stray-asterisk cleanup**: scanEmphasis runs BEFORE scanFootnoteMarkers (locked pipeline order, §B2), and a lone `*` inside `[^*]` is indistinguishable to it from a stray emphasis marker — it gets swallowed as OCR-noise-shaped cleanup before scanFootnoteMarkers ever sees it, corrupting the label. Not treated as a gap: per §A3, a star/dagger note is always a WORK-LEVEL attachment (marker lives in the running head, routed straight to front matter) — it is never turned into a literal `[^*]` marker glued into body prose in the first place. `†` (which doesn't collide) is the tested/working glyph for any genuinely inline star/dagger case; `translation-file-footnotes.test.ts` documents the `*` collision inline rather than silently working around it.
- **§B3's overlay-piece marker re-insertion also had to shift Bekker-tick and emphasis piece-local offsets** — the spec's own worked arithmetic only covers the clean-text parse (§B2); emitOverlayPieces' marker splice is the one INSERTION-direction offset carry in the codebase (every other carry in this codebase removes syntax and subtracts). Implemented a `shiftForInsertions` helper (import-align.ts) applied to both Bekker-tick offsets and the emphasis piece-local offsets computed against the piece's pre-insertion text, so neither silently drifts once a piece gains inline `[^label]` syntax. Not spec-mandated in so many words, but a necessary correctness consequence of §B3 as written; covered by aligner/__tests__/import-align-footnotes.test.ts (not part of the spec's own §C tables).

## emit.ts + index.ts + translation-file.ts TAG extension (Phase 4A: emission)

### §3.4 hyphenation — which route was taken and why
The CONVERTER-JOINS route (the spec's "safe default"), not the emit-hyphen-eol-for-
dehyphenate route. dehyphenate.ts's contract was read first, as instructed, and the
`frag-\nfrag` route fails the spec's own cleanliness condition on two independent
paths: (1) ImportDialog.prepare() catches a dictionary-load failure and proceeds on
the RAW text ("line-end hyphens then stay exactly as the source had them") — the \n
survives into the body and renders as a bogus paragraph break, the exact Lennox
defect class; (2) dehyphenate's SITE regex is `/([A-Za-z]+)-\r?\n([A-Za-z]+)/` —
a continuation line that begins with an emitted tag (`direc-\n{1095b1} tion.`)
doesn't match, so that \n leaks even when the dictionary loads. Also the converter
output is legitimately parseable WITHOUT ever passing through ImportDialog (tests,
future callers), which route A would silently corrupt. So emit.ts joins hyphen-eol
pairs itself: fragment starts lowercase → hyphen dropped (compositor break, counted
`joined`); uppercase/other → hyphen kept, glued (likely lexical compound, counted
`kept`). No review queue in 4A; ImportDialog's spellcheck still runs downstream.
Real slice measured: 337 joined, 0 kept (every fragment in NE starts lowercase).

### Conservative readings / decisions logged during implementation
- **Unmatched marker emission**: Phase-3 §A3 says an unmatched marker is "kept
  (renders); popup shows 'Note N not found'" — a parse/Reader-side rule. On the
  EMISSION side, turning flagged, unpaired digits into `[^N]` syntax would DELETE
  them from the clean text stream on the strength of a guess the pairing already
  refused to make. Conservative reading: only PAIRED body markers become `[^label]`;
  an unmatched marker's printed digits stay verbatim in the body and its label is
  reported in `report.footnotes.unmatched`. The slice's one real case ("…sayings
  9–11", the Bekker line-range apparatus mark) stays "9–11" in the text — flagged,
  never guessed. Flagged in the task report as a spec tension, not silently chosen.
- **FootnoteState threading**: spec §2's pipeline threads ONE FootnoteState across
  all pages (no per-work reset), so that is what convertLayoutExtraction does — the
  established "caller resets per work" convention now applies one level up (the UI
  slices per work before import; report.seams is the warning surface). Measured
  consequence on the multi-work slice: the MM seam kills the already-decided
  'continuous' hypothesis → `footnote-scope-conflict` ×2 (once per MM transition
  scored after zero scopes remain alive), verdict stays 'continuous' (the safe
  fallback). Pinned, not papered over.
- **Seam collisions are surfaced, not resolved** (§3.7): across the MM restart,
  chapter key "1.1" collides (MM's title overwrites NE's 'Goods and Ends' in the
  titles map → 116 keys for 117 chapters) and MM's footnote labels 1/2/* shadow
  NE's in the parsed definitions map (226 emitted defs → 223 unique keys). All
  spec-verbatim ('b.c' keys, printed-number labels); the seam warning tells the
  user to slice per work, which makes every collision vanish.
- **displayBlocks in NE measured NOT empty** (spec guessed []): exactly one —
  page 97 line 14, the same "9–11" range-apparatus line as the unmatched marker.
  Its wide internal gap makes the line display-shaped (single line + ≥4-space run
  ⇒ qualifies), so it becomes its own paragraph and surfaces in
  report.displayBlocks for hand review. Two honest review surfaces, one printed
  anomaly.
- **Paragraph rule is spec-literal**: only the 2–8-col indent window, division
  boundaries, and display blocks break paragraphs. Blank lines inside the body do
  NOT (that immunizes against the Lennox page-break-blank defect class by
  construction). Happy measured consequence: Reeve prints verse quotations
  (Margites, Hesiod, Evenus) indented within the window, so each verse line gets
  its own line — all 9 "mid-sentence-looking" breaks in the slice are verse lines
  plus the two around the flagged page-97 display line, each hand-verified and
  pinned in convert-slice.integration.test.ts.
- **Footnote definition emission**: a note's AM1 display-line breaks become
  ≥3-space-indented continuation lines; the §B1 definition grammar has no
  blank-interior-line form, so newline runs collapse to single continuations
  (parseFootnoteDefs joins continuations with a space regardless — the rawLines
  live on the extraction side if verbatim display ever matters, Phase 4B+).
  A document with zero notes gets NO sentinel block (suffix-only extension;
  emitting an empty block would be noise).
- **ticsSuppressed counting**: each suppressed tic is counted once, under the
  first matching base flag in the fixed priority order non-monotonic >
  unmarked-roll > position-unresolved > anchor-unresolved > footnote-tic-ambiguous
  (a tic can carry several, e.g. unmarked-roll + position-unresolved:unmarked-roll).
  The full detailed histogram is report.flags.
- **report.pages counts splitPages pages** — a file ending in \f contributes a
  trailing empty page (177 for the 176-content-page slice), consistent with
  pages.ts's documented doubled-\f behavior.
- **TAG extension legacy nuance**: a suffix-less column tag still leaves scanTags'
  lastLine at 0 (not 1), so a legacy `{1094a}{1}` sequence stays warning-free —
  byte-identical legacy behavior, pinned; a suffixed tag sets lastLine to its
  suffix. The real slice exercises the new form at the MM seam: MM's printed
  1181a25 is refused (non-monotonic), so its 1181b25 becomes the emitted
  `{1181b25}` — plus the one pinned scanTags warning (column {1181b} re-entered).
- **Golden-fixture patches (emit.test.ts only)**: the committed reeve-geometry
  fixture centers page 1's title 6 cols off its heading (an artifact — real Reeve
  titles align within 2.0; Phase 2 rightly rejects it) and jumps 1.1→2.1 with no
  book heading. The emit golden re-centers the title and inserts "Book Two"
  LOCALLY (originals untouched — gutter-reeve.test.ts pins their line indices);
  the remaining 2.1→2.3 gap is kept and pinned as its honest audit flag.

## Phase 4B: ImportDialog wiring + footnote/title render wiring

### Detection + accept-stage wiring
- **Detection rule** (`isLayoutExtraction`, pdf-import/index.ts): a form-feed
  byte (`\f`). pdftotext's page-break marker never appears in a hand-authored
  or already-tagged file, so this is a cheap, reliable, zero-false-positive
  signal — exported as a standalone pure function (not inlined in the Svelte
  component) so it's unit-testable without a DOM (`is-layout-extraction.test.ts`).
- All FOUR accept paths (native picker, browser `<input>`, Tauri drag-drop,
  browser-harness drag-drop) route through one shared `acceptText(name, text,
  opts)` in ImportDialog.svelte. A fifth path — App.svelte's own drag-drop
  handling hands a `{name, text}` straight to this component's `file` prop,
  bypassing all four functions above — is covered too: a synchronous
  top-level `if (file) acceptText(file.name, file.text);` runs the SAME
  pre-stage before first render, so a layout extraction dropped onto the app
  shell gets converted exactly like one dropped onto the dialog's own zone.
- `ConvertNeedsChoice` → `convert-choice` step; "Import with page-level
  anchors only" re-invokes `acceptText` on the SAME held `{name, text}` with
  `{pageLevelOnly: true}` rather than re-prompting for a file.
- **`.original` vs. parse input (conservative reading)**: `ImportRequest.raw`
  already serves three roles simultaneously (parse input, canonical `.md`
  body basis, AND — until now — the literal `.original` safety-net content).
  Splitting all three apart for every caller was out of scope and risked
  regressing non-PDF imports; the minimal correct fix was one new OPTIONAL
  `ImportRequest.original` field, defaulted to `req.raw` in `s.write(...)`
  (`req.original ?? req.raw`). A non-PDF import omits it and is byte-for-byte
  unchanged from before. A PDF import sets `raw` to the converter's tagged
  output (what actually gets parsed/aligned/canonicalized — unchanged
  existing flow) and `original` to the pristine pre-conversion pdftotext
  extraction, so `.original` now holds what its own doc comment always
  claimed ("the untouched raw upload") for this path specifically.
- **Residual, not fixed here**: dehyphenate.ts's `SITE` regex
  (`/([A-Za-z]+)-\r?\n([A-Za-z]+)/`) still runs on the converter's tagged
  output per the existing ImportDialog flow. The converter's own §3.4
  hyphen-eol joins remove essentially every line-end-hyphen site from the
  BODY before dehyphenate ever sees it, but a footnote block's own multi-line
  note continuations (real `\n`, not converter-joined — AM1 display-line
  rule) could in principle still contain a hyphen-before-newline inside a
  note's text. Not observed in the NE slice; if it ever fires, the worst case
  is a spurious dehyphenation-review prompt (user confirms "keep hyphenated"),
  not silent corruption — flagged here rather than silently assumed safe.

### Honesty report (Done step) — which numbers came from where
- The footnote scope/count line reuses `ImportSummary.footnoteSummary`
  (already computed by `runImport` from `parsed.footnotes`/`footnoteScope`)
  rather than recomputing the same phrase from `ConvertReport.footnotes` —
  same underlying data for a PDF import, and this way the line also appears
  for a hand-tagged file with a footnotes block (a generalization beyond
  strict task scope, but harmless and DRY: no second copy of the
  scope-phrase table in the Svelte component).
- Dropped lines / suppressed-tick breakdown / display-block count / seams
  warning all read `ConvertReport` directly and are gated on `convertReport
  !== null` — i.e. this whole sub-section only renders for a PDF-converted
  import, exactly per task scope.

### Titles render (task 2, REVISED 2026-07-06 — see below)
- Original task-2 design merged an imported title INTO the shared
  `chapterTitles` heading map (`getImportTitles`/`mergeChapterTitles`,
  "built-ins win, imports fill gaps"). John reviewed in the real app and
  rejected this: the shared heading row ("BOOK I, CHAPTER 1: …") is
  work-level chrome every translation sees, but an imported title is that
  ONE edition's own editorial paratext (a PDF's running head) — it should
  never appear as if it were the work's title just because one translation's
  source PDF happened to carry a heading.
- **Revised design**: the title now renders as a small unaligned heading
  INSIDE that import's own overlay column, at the start of its chapter —
  never touching the shared `chapterTitles` map at all. `imports.ts`'s
  `getImportTitle(work, id, book, chapter)` (pure core: `resolveImportTitle`,
  mirroring `getImportFootnote`/`resolveImportFootnote`) resolves ONE
  registered import's own title for ONE `book.chapter`, wired through a new
  `__ARISTOTLE_IMPORT_TITLE_HOOK__` window hook — same site-shared pattern as
  `__ARISTOTLE_IMPORT_FOOTNOTE_HOOK__` below. Reader.svelte's `transFlow`
  snippet renders it as a `.ross-chapter-title` div, above the flow content,
  only for the block where `block.chapter` starts AND that transId's own
  `oflows[transId]` is non-empty (i.e. this import actually has a piece
  starting that chapter here) — so it appears exactly once, at the true
  opening of the chapter in that translation's own text. Render-only: the
  title text is never written into `RossPiece.text` or any offset-bearing
  stream, so no anchor shifts; no `.bk-num` gutter tick ever renders beside
  it (it's a plain sibling div, not a `flow` part); excluded from clean-copy
  via `.ross-chapter-title` added to `annotations.ts`'s
  `COPY_EXCLUDE_SELECTOR`, the same way `.fn-marker` already is.
- `App.svelte`'s `chapterTitles` reverts to built-in `chapter-titles.json`
  only — `mergeTitles`/`getImportTitles`/`mergeChapterTitles` are gone.
- **Row-placement fix (2026-07-06, John's review of 631ff971; revised same
  day)**: the title as first child of `.ross-prose` pushed the English prose
  one line below the Greek. First attempt (a separate `.seg-row` above the
  real one) failed: each seg-row is its own grid and the desktop no-rails
  both-view sizes the Greek track `max-content` (desktop.css:40), so the
  title row's EMPTY greek cell collapsed and the title rendered over the
  Greek column. Final shape: the visible title stays in the chapter-opening
  row's own English cell, but as a SIBLING before `.ross-prose` (transFlow,
  same flow-length gate — which also keeps it out of annotations.ts /
  emphasis-paint.ts offset walks, which root at `.ross-prose`); the
  `.greek-col` gets a matching invisible spacer
  (`.ross-chapter-title.ross-chapter-title-spacer`, visibility:hidden +
  width:0/nowrap so it adds one title-height without widening the
  max-content Greek track), gated on the same chapter-start + flow-present
  condition for the on-screen primary (left) translation and on
  view !== 'greek' (no title in greek-only → no stray gap). Both columns
  drop by the same one-line height → Greek line 1 flush with English prose
  line 1, title above, over the English column in every view/rail mode.
  Compare-right's title renders in its own `.ross-col` cell the same way
  (Greek aligns to the LEFT column). The title now carries `.ross-prose`'s
  2.6rem gutter indent itself (global.css; busse override to 0), and the
  spacer carries the `.ross-chapter-title` class, so the clean-copy
  exclusion covers it too. Same title source/hook, render-only, site-inert.

### Footnote render wiring (§B4) — the site-inertness argument
Reader.svelte and FootnotePopup.svelte are the SAME files served by the
static site build (no imports.ts there) and the desktop app. Two changes
touch them:
1. **`fnTransIds` (was singular `fnTransId`)**: generalized from "the one
   footnote-bearing translation" to a `Set`, because an import can now ALSO
   carry footnotes:true (set on its `TranslationRef` by
   `imports.ts`'s `installHooks`, only when `rec.footnotes` is non-empty).
   `thirdSlot` is included unconditionally now (not just as a fallback for
   "nothing else flagged") so a newly-flagged import can never silently
   un-flag an existing built-in (e.g. Ostwald) that relied on the fallback.
   For every work in the corpus TODAY (no imports registered), this set
   reduces to exactly the same single id the old code picked — verified by
   inspection: no work combines an explicitly-flagged translation with a
   different `third`-slot translation.
2. **`renderThird`'s widened marker regex + `data-fn-trans` attribute**: this
   IS a new DOM attribute on every footnote-bearing translation's markers,
   including built-ins on the site (Ostwald, Owen) — not conditional on
   import presence, because `renderThird` can't tell "is this transId an
   import" without the same site/desktop split problem `FootnotePopup` has,
   and the spec (§B4.2) mandates the attribute unconditionally on the one
   shared function. Read "byte-identical" as *behaviorally* identical: the
   attribute is inert (nothing on the site reads it except the sibling
   `showFootnote`, which — for a non-import transId — simply carries it
   through to a `FootnotePopup` that resolves via the untouched
   `fetchFootnotes(work)` path, below). No existing test or build asserts
   exact HTML strings for `.fn-marker` (checked: only CSS-selector consumers
   in `annotations.ts`), so this is a safe, spec-compliant reading.
3. **`FootnotePopup`'s resolver hook pair**: `__ARISTOTLE_IMPORT_HAS_TRANS__`
   and `__ARISTOTLE_IMPORT_FOOTNOTE_HOOK__`, installed by
   `imports.ts`'s `installHooks()` — the SAME window-level-hook pattern
   `__ARISTOTLE_BOOK_HOOK__`/`__ARISTOTLE_EXTRA_TRANSLATIONS__` already use
   for exactly this site/desktop split. Neither hook exists on the site
   build (imports.ts is never bundled there), so `isImportedTrans()` is
   always `false` there and every popup falls through to the untouched
   `fetchFootnotes(work)` branch — inert.
   - **Why TWO hooks, not one**: `getImportFootnote` alone can't distinguish
     "this transId isn't a registered import" from "it IS registered but has
     no definition for this label" (`footnote-note-unmatched`) — both return
     `null`. Folding that into a single fallback-on-null design would let an
     unmatched import label fall through to `fetchFootnotes(work)`, which
     could return a DIFFERENT translation's note text for the same numeric
     label under continuous scope (a real collision risk, not hypothetical —
     Ostwald's `footnotes.json` and an imported translation's labels are both
     plain digits). The separate `__ARISTOTLE_IMPORT_HAS_TRANS__` boolean
     hook makes "is this a registered import at all" an explicit, first-class
     question, so an unmatched import label correctly shows "not found"
     instead of risking a wrong-translation's note.
- `fnDisplay` (printed-number-from-label) is duplicated (Reader.svelte,
  FootnotePopup.svelte) rather than shared: it's two lines, pure, and sharing
  it would mean a new tiny shared module or growing the site/desktop
  boundary discussion for no real benefit.

## Categories 4 gold case for display blocks + bare-numeral chapters (John, 2026-07-06)
Categories ch. 4 (Reeve complete-works extraction, ~line 20260ff. of the full file)
has a genuine BODY table — the ten-categories list ("Substance  human, horse" …) —
that SPANS A PAGE BREAK and carries a real gutter tic on a row ("Where  in the
Lyceum, in the marketplace   2a1"). Unlike headings this is translational content:
the tic anchor ("Where") is positionally right; the harm is reflow-scrambling at
render. This is the gold case for Phase 4's display-block detector (preserve line
structure, keep tic bound, flag `display-block`).
Same pages: Categories chapters are BARE CENTERED NUMERALS ("4" + title "The Ten
Categories") — single-book works have no b.c form; Phase-2 grammar needs a
bare-numeral extension before Categories/De Int can import. Slotted for Phase 5
(edition generality). Also seen: single-digit folio ("2", col 6) and dotless
chapter running head ("Categories (Cat.) .4–.5") — both covered by existing
defenses (furniture position; header line-1 strip).

## Phase 5: bare-numeral chapters + the real Categories slice + Clarendon per-chapter scope

### Bare-numeral chapter grammar (divisions.ts / line-shape.ts) — gating rationale

`parseHeadingResidual` (line-shape.ts) grows a third branch: a standalone trimmed
residual of 1-2 Arabic digits (`^(\d{1,2})$`) parses to
`{kind:'chapter', restatedBook:null, num:{type:'arabic',digits}, bare:true}`. This is
DELIBERATELY permissive at the grammar level — the function is pure/stateless and
cannot know whether a given centered "5" is really a chapter heading or a stray
centered number elsewhere in the body (a folio that slipped past furniture
detection, a table label). `lineShape` therefore marks ANY such line 'chapter'-shaped
once it also clears `leftGap >= LEFT_MIN`; **all the false-positive rejection happens
in divisions.ts's sequence gate**, per the spec's own framing ("ACCEPTANCE is
sequence-gated — this kills false positives").

**Reconciling the spec's own two-part gap rule.** Spec §1 says, in two adjacent
sentences that read as if in tension: (a) "A bare numeral that is NOT sequence-
consistent → not a division"; (b) "if chapters genuinely skip (value==last+2 with no
intervening candidate), flag `chapter-sequence:gap-or-repeat:` … and accept
(consistent with §4.3)". Implemented as the reading that makes BOTH sentences true
without contradiction: bare-numeral acceptance is `value === (lastChapter ?? 0) + 1`
(sentence a's default — this is what "kills false positives" before single-book-work
mode is even established, since a random early number essentially never equals
1 exactly), **except** that once `state.singleBookWork` is already true (mode
established — at least one chapter already legitimately accepted), a value that is
EXACTLY `expected + 1` (a one-chapter forward gap — the spec's own "value==last+2"
worked example) is ALSO accepted, flagged, never a value further out. This keeps the
"kills false positives" goal intact for a document that has NOT yet proven itself to
be a bare-numeral single-book work, while still tolerating the one genuinely-skipped-
chapter case the spec names once the pattern is already trusted. A "b.c mode" check
(`state.book !== null && !state.singleBookWork`) wins silently over BOTH branches, no
flag, per spec ("b.c mode wins") — this is checked first, before any value
comparison at all. All of this is unit-tested in divisions.test.ts's "bare-numeral
chapters (Phase 5 spec §1)" describe block (8 cases: clean sequence, book=1 keying,
the flag firing exactly once, b.c-mode-wins, a stray pre-"1" numeral rejected, the
one-chapter-gap tolerance vs. a wild jump and a backward/repeat value both rejected,
and a free-floating title-candidate after a rejected numeral staying uncaptured).

Title capture for a bare-numeral chapter reuses the IDENTICAL center-alignment rule
as a b.c chapter (factored into a shared `captureTitle` helper in divisions.ts,
called from both branches) — spec §1 calls for exactly this ("Title capture:
identical rule to b.c chapters").

### The measured Categories truths (real 27-page slice, cat-slice.integration.test.ts)

Measured, then hand-verified against the raw slice, then pinned (2026-07-06):
- 15 chapters, `{1.1}`..`{1.15}`, ALL titled, book=1 implicit throughout (the
  `single-book-work` doc flag fires exactly once, on chapter 1's acceptance); ZERO
  Book divisions and ZERO division-level audit flags anywhere in the slice.
- The gutter-flag histogram across all 27 pages is genuinely EMPTY `{}` — no dropped
  lines, no non-monotonic tics, no side-ambiguity, no unmarked rolls. This is the
  cleanest real slice measured in this corpus so far; 236/236 tics detected and bound.
- Footnotes: 43 numbered notes + 1 work-level star (translator-credit, glued to the
  running-head title "Categories*") = 44 definitions, 43 body markers, 44 pairs
  (43 numbered + 1 star), ZERO unmatched notes or markers.
- **Scope verdict is genuinely `null`** (not a bug): a single-book work can never
  cross a BOOK boundary (book is pinned at 1 for the whole document), so
  'continuous' and 'per-book' predict IDENTICAL transitions for every observation —
  no number of observations can ever discriminate between them. 'per-chapter' dies
  normally (footnote numbering doesn't reset per chapter in this edition). Verdict
  stays null after 12 discriminating observations, both `continuous` and `perBook`
  still alive; emission's own documented fallback (`footnoteState.verdict ??
  'continuous'`) is what actually labels the output `scope: 'continuous'` in the
  report. This is a structural fact about single-book works worth stating plainly:
  the scope machine cannot ever "solve" this case, by design, and shouldn't.
- The ten-categories BODY TABLE (ch. 4) genuinely spans a page break, with a
  footnote block, a folio, and a running head printed between its two halves, and
  carries a real gutter tic on one row (`Where … 2a1`, flagged `display-block-
  anchor`). All ten rows land in the emitted text in printed order.
- Gold anchors, all three hand-verified against the raw page before pinning:
  `{1a}` (citation `1a1`) → "Things" (ch.1 opening); the table-row tic `{2a}`
  (citation `2a1`) → "Where"; and ch.4's OWN opening tag — MEASURED as the bare
  line tag `{25}` (kind `'line'`, not a composite `{1b25}`), settling the phase-5
  spec's own tentative "`{1b25}`?" guess: ch.4's heading sits on a VERSO page, whose
  printed tic really is just "25" (a leading bare tic with no page/column digits of
  its own) rolling the column already established by an earlier "1b1" full-form tic
  on the same page. Only the PARSED tag's `citation` field resolves the full
  address ("1b25") via that running column context; the emitted TAG TEXT itself is
  the bare `{25}`. Anchor word: "Each" (of "Each of the things said…").

### Bug found and fixed: furniture-boundary over-absorption of a real body table

Building the Categories integration test surfaced a genuine defect (not merely an
honest-anomaly-to-pin): the shared "climb upward past a blank-line gap, bridging
through if the line on the far side is display-shaped" logic — added in Phase 3
(`gutter.ts`'s `findBottomFurnitureStart`, mirrored independently in `footnotes.ts`'s
`computeNoteBlockStart`) specifically so a footnote's own interior diagram (note 77's,
in the NE slice) wouldn't truncate the furniture walk — was ALSO silently absorbing
the first three rows of Categories ch.4's ten-categories table ("Substance / Quantity
/ Quality") into the footnote/furniture region. Those three rows sit directly above
the real footnote block with only ONE blank line separating them, and each row's wide
internal spacing (`isDisplayShapedLine`'s ≥4-space-run test) makes it display-shaped —
exactly the same shape signature a note's own diagram interior has. The climb bridged
straight through them, past the real body/footnote boundary, and `bottomFurnitureStartIdx`
landed 3 lines too early — those three table rows never reached body-line scanning at
all and were silently DROPPED from the emitted text (confirmed: "Substance", "Quantity"
and their row text were entirely absent from `convertLayoutExtraction`'s output before
the fix, while chapter 4's remaining seven rows — on the next page, correctly bounded —
were present).

Root cause, traced by hand: the climb's boundary was set to `tentative` — however far
upward the bridge-and-climb happened to wander — gated only on "did we see ANY
note-starter ANYWHERE during the whole climb" (`sawNoteLine`). That gate is too weak:
it says nothing about whether the SPECIFIC span just bridged into is actually part of
a note. **Fix**: anchor the boundary on the TOPMOST note-starter line actually reached
(`topmostNoteStarter`, tracked alongside `sawNoteLine`) instead of `tentative`. This is
correct in both directions: nothing legitimate can ever precede a footnote block's own
first printed note (a continuation only ever comes AFTER its opener, which is why the
existing note-77-diagram case still works — climbing bottom-up reaches the diagram
before reaching "77."'s own opener, but "77." itself IS eventually the topmost
note-starter reached, so the boundary still correctly includes the whole diagram); and
nothing that sits ABOVE the topmost note-starter can ever legitimately be furniture,
even if a display-shaped bridge happened to wander that far, because there is no note
content up there to justify including it. Applied identically to both
`findBottomFurnitureStart` (gutter.ts) and `computeNoteBlockStart` (footnotes.ts) —
the two independent, intentionally-duplicated implementations (see the existing Phase-3
note above on why they're not shared). **Verified safe**: the ENTIRE pre-existing
NE-slice pinned suite (gutter-slice.integration.test.ts, convert-slice.integration.test.ts,
177/176 pages, all footnote/division/tic counts) is BYTE-IDENTICAL before and after this
fix — the NE slice has no case where a real body display block sits one blank line above
its own footnote block, so the fix only ever changes behavior for the Categories case it
was built to correct.

### Clarendon fixture: four chapters, not the spec's illustrative three

Spec §3 describes "`CHAPTER I`..`CHAPTER III`". Built with a FOURTH chapter instead
(`fixtures/clarendon-geometry.ts`), because the scope machine's own
`SCOPE_DECIDE_N = 3` threshold (§A4) requires at least 3 DISCRIMINATING
(division-boundary-crossing) observations before it will ever LOCK a verdict, and a
transition only counts as discriminating when it crosses a chapter (or book)
boundary. Three chapters give exactly TWO chapter-boundary crossings — never enough
to lock `per-chapter`, no matter how clean the reset pattern is; the report would
silently fall back to `'continuous'` (the safe default for a null verdict), which
would defeat the entire point of a fixture built to exercise "the per-chapter scope
verdict and scoped labels end-to-end through emission." A fourth chapter (a single
footnote is enough) supplies the third crossing that actually settles the verdict.
Measured consequence, confirmed correct: `continuous` and `per-book` both die at the
VERY FIRST chapter-boundary reset (a single-book document never crosses a book
boundary, so those two hypotheses are behaviorally identical here too, exactly as in
the real Categories slice above) — only `per-chapter` survives from chapter 1→2
onward, and the verdict LOCKS at the third crossing (chapter 3→4), retroactively
scoping every label (including chapter 1's own notes) `<book>.<chapter>.<N>` once
emission reads the final `footnoteState.verdict`.

## Adversarial review adjudications (2026-07-06)

- **Finding 1 (major, confirmed/fixed)** — imported emphasis was silently
  unpainted on any marker-bearing piece: `.fn-marker` (the footnote button
  Reader.svelte renders for `[^label]`) was never excluded from the
  desktop-side TreeWalkers that measure rendered prose text, so
  `emphasis-paint.ts`'s DOM text included the button's rendered text while
  `import-align.ts`'s stored `PieceEmphasis.pieceText` was built from
  `finalPieceText` (the marker-*inserted* literal-`[^label]` text) — two
  different character spaces that could only coincidentally agree, and
  didn't once markers were involved. Fixed by (a) adding `.fn-marker` to
  both TreeWalker exclusion selectors in `emphasis-paint.ts` (`proseText`,
  `locate`) and to `annotations.ts`'s matching walkers (`proseOffsetAt` at
  the capture side, plus `englishRange`'s render-side `locate` and
  sub-range filter — all three needed the same addition to keep
  capture/paint symmetric, not just the one line named in the brief); (b)
  changing `import-align.ts`'s `emitOverlayPieces` to store
  `PieceEmphasis.pieceText`/offsets against the piece's PRE-marker-insertion
  text (`pieceText`, newline-stripped only, no `shiftForInsertions` carry)
  instead of `finalPieceText`. New invariant, documented inline: painter DOM
  text (`.fn-marker` excluded) === marker-free, newline-free piece text.
  Tests: `import-align-footnotes.test.ts` — rewrote the bad pin ("shifts an
  emphasis span after the marker...") into "does NOT shift an emphasis span
  after the marker ('noble')..."; added a new regression describe block
  "PieceEmphasis marker-free invariant (Fix 1 regression)" covering
  `Every good[^1] thing.` end-to-end through `emitOverlayPieces`.

- **Finding 2 (major, confirmed/fixed)** — a footnote marker glued exactly
  at a chapter/piece boundary was dropped (when it was the file's very last
  character) or misattributed to the wrong side, because both
  `translation-file.ts`'s `splitChapters` and `import-align.ts`'s
  `pieceMarkers` slicing used a half-open `[start, end)` filter. A marker is
  glued right after the word it annotates, so a boundary-exact marker is
  always the LAST character of the span it ends, never the first of the
  next one. Fixed by switching both filters to `(offset > start && offset
  <= end)`, with an explicit `offset === 0` admission for the very first
  chapter/piece (whose lower bound would otherwise never admit anything at
  the strict document start). Tests, both in
  `translation-file-footnotes.test.ts`'s new "Fix 2" describe block:
  scenario (a) `{1.1}Last word.[^1]` + block — marker now reaches chapter
  1.1 (previously dropped entirely); scenario (b) `{1.1}A.[^1] {1.2}B.` —
  confirms the marker still correctly lands in chapter 1.1, not 1.2 (this
  case happened to already work under the old rule too — kept as a
  regression guard, not a behavior change). No pinned integration marker
  count changed: the NE-slice (224) and Categories-slice (43)
  `footnoteMarkers` counts in `convert-slice.integration.test.ts` /
  `cat-slice.integration.test.ts` are unchanged — neither real fixture
  happens to glue a marker exactly on a chapter/piece boundary offset.

- **Finding 3 (hardening, confirmed-contained/hardened)** — a `[^*]`
  work-level footnote token had its `*` swallowed by `scanEmphasis`'s
  stray-marker cleanup (it runs before `scanFootnoteMarkers`, per the
  locked §B2 pipeline order, and a lone `*` inside `[^*]` was
  indistinguishable to it from ordinary OCR-noise stray-asterisk shape).
  This was previously a documented, deliberately-untested known limitation
  (see the removed comment in `translation-file-footnotes.test.ts`,
  justified there as "never arises in practice" since star/dagger notes are
  work-level, routed to front matter, not glued into body prose). Genuinely
  fixed rather than left contained: `emphasis.ts`'s `findMarkerRuns` now
  skips a single `*` run whose immediate context is `[^` ... `]`
  (`isFootnoteStarToken`) before it ever becomes an emphasis/stray
  candidate — minimal, local change, no effect on `**`/`_` or on any `*`
  outside that exact token shape. `†` is not in `MARKER_RUN`'s alphabet at
  all, so it was never at risk (confirmed: the fix only needed to handle
  `*`). Tests added to `translation-file-footnotes.test.ts`: `[^*]` body
  marker + block round-trips to `{label:'*', display:'*'}` with clean text
  `Credit.` and no leaked `*`; a control asserts an ordinary stray `*`
  elsewhere in the body is still removed as OCR noise exactly as before.

- **Finding 4 (minor, confirmed-minor/fixed)** — `splitFootnoteBlock` used
  the FIRST sentinel-shaped line it found and split unconditionally; an
  editorial comment mid-body that happened to quote or resemble
  `<!-- footnotes -->` would silently truncate everything after it into a
  bogus "footnote block" of ordinary prose. Fixed by (a) scanning for the
  LAST sentinel-shaped line instead of the first, and (b) validating that
  every non-blank line after it is either a definition (`^\[\^...\]:...`)
  or a >=3-space continuation — if not, the split is abandoned, the whole
  input is returned as `body` unchanged, and a warning
  (`'footnote block sentinel found but content is not definitions — treated
  as body'`) is threaded through `parseTranslationFile`'s `warnings` array
  (via a new `warnings` field on `splitFootnoteBlock`'s return, merged
  ahead of `scanTags`'s own warnings). Tests added to
  `translation-file-footnotes.test.ts`'s new "splitFootnoteBlock hardening"
  describe block: the Codex mid-body-editorial-comment case (not split,
  warning surfaced); a normal emitted file (sentinel at end, valid
  definitions — unchanged behavior, no warning); a file with two
  sentinel-shaped lines (uses the last, still validates its own tail); and
  a re-run of the legacy no-sentinel byte-identical pin (now also asserting
  `warnings` is empty).

**Suite results**: `npm test` — 112/112 passed (3 integration files
conditionally skipped, no Reeve slice env vars). With
`ARISTOTLE_REEVE_SLICE`/`ARISTOTLE_REEVE_CAT_SLICE` set — 133/133 passed,
all previously-skipped integration pins included, no pin changes required.
`npm run build` — clean (pre-existing Svelte a11y/unused-export warnings
only, unrelated to this work).
