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
