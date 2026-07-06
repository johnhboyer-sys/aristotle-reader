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
