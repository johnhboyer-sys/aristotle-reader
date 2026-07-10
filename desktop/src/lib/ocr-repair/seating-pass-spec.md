# Bekker tick-seating pass — SPEC / RESUME (for a fresh post-compact session)

Goal: seat the Bekker ticks the OCR failed to yield, drop the phantom ones,
and re-attach leaked footnote markers — from John's ground-truth manifests.
This is the last structural piece before Goal-A sign-off; TEXT is already
clean (all garbles/word-breaks fixed via the FIX/DROP directives in each
corpus's `review-<corpus>-decided-2026-07-09.md`).

## Ground truth (DURABLE — read these first)
- `~/Documents/aristotle-ocr/apo-barnes/missing-ticks-ground-truth.md`
  — 27 `SEAT <ref> => <anchor>`, 13 `NOTICK` phantom-40s, 4 leaked footnotes
    (18/19/20 on prove/that/then in I.31; 22 on "not" in II.19), `ss` at 94a.
- `~/Documents/aristotle-ocr/pa-lennox/missing-ticks-ground-truth.md`
  — 9 `SEAT` (689a 1→30, 658b15, 676a).
- Every SEAT anchor verified to resolve UNIQUELY (except 80b10/80b20 which
  pin by POSITION — the in-column occurrences are lines 1089/1101, the stray
  matches are outside the 80b file-line region).

## The three sub-problems (each different; do NOT conflate)

1. **SEAT — inject/repair layout ticks.** Ticks are GEOMETRIC (no explicit
   tag syntax). Verso format: tick token at col 0, body at col 11
   (`71b        of everything…`, `10         We think…`). Column-start =
   `NNNa/NNNb`; 5-line = bare number. classifyTicToken (line-shape.ts, FROZEN)
   reads `\d{1,4}[ab]?\d{0,2}` or `\d{1,2}`.
   - APo dead columns 80b/88a: body sits at col 0 AND splits across a scan
     page-break (^L TRANSLATION) with inconsistent margins (80b1 at col 11
     BEFORE the break, 80b5 at col 0 AFTER). Seating = re-lay-out the column:
     tick at col 0, body re-indented to col 11, on the anchor lines.
   - PA 689a is EASIER: ticks are already in the layout but UNPARSED — column
     tick glued (`689ato` → needs `689a to`), 5-line ticks present. Un-glue +
     verify the converter reads them.
   - Single-tick seatings in otherwise-fine columns: 80a1, 77a30, 100a1/5,
     100b5/10/15, 81a1 (81a1 already tagged — verify no dup).
   - The leaked-tick seatings 100a10/100a15/100b1 ALSO clean the body: the
     word-rejoins for those are ALREADY DONE (FIX `in a deter- IO`, FIX
     `IOOb ticulars`), so seating just adds the gutter tick at those lines.

2. **NOTICK — drop phantom line-40s (13 APo cols).** These are NOT layout
   tokens; they're `fillChapterTail` extrapolations in
   `desktop/src/lib/aligner/import-align.ts` (app-side; engine.ts is parity-
   locked, don't touch). fillChapterTail extends interpolated ticks to the
   chapter's last Greek line, inventing a 40 the print doesn't have. Cap it:
   don't extrapolate a 5-line tick past the column's last REAL (tagged) tick
   + a small margin. Corpus columns that legitimately reach 40 must keep it —
   so the cap needs per-column awareness (drive from a config/manifest list of
   "columns with no line 40", NOT a blanket cap).

3. **Footnote-marker re-attach (4 in APo).** Inline attach WORKS:
   `prove18` → converter emits `[^1.18]` (verified). `that 9`→`that19`,
   `then`→`then20`, `not`→`not22` likewise. BUT the orphaned standalone
   marker lines ("18","20","2") must be cleared with CONTEXT-anchored removal —
   the `DROP <token>` directive (review.ts/vote.ts, already built) is UNSAFE
   here: DROP-by-bare-number also deletes footnote DEFINITION number-lines
   ("18\n<note text>"), which regressed fnNotes 52→46. So extend DROP to
   `DROP <token> <== <prev-line-substring>` (remove only when preceded by the
   given text), or detect footnote-block context. Test fnNotes stays 52.

## Mechanism/architecture notes
- All directives live in the per-corpus decided file (DATA, not code) so
  stage-7 Apostle generality is untouched. SEAT/NOTICK will need new parse +
  apply, parallel to FIX/DROP (parseDecisions in review.ts; apply in vote.ts
  or a new post-stage-5 layout pass — ticks must be in the layout BEFORE the
  frozen converter runs).
- VERIFY every seated tick via `convertLayoutExtraction` (grade.ts wraps it):
  the tick must appear as `{NNNa}` / `{N}` at the right offset, grades must
  not regress (APo 453 tics/1 dropped/1 display/0 seams/2bk 53ch 0 titled/52
  notes; PA 888/2/3/0/4bk 51ch 0 titled). pdf-import stays ZERO-DIFF.
- Re-cut both FINALs, John re-imports both, hand-verifies. Then: stage 7
  Apostle held-out gate (files STILL never opened), then PR.

## Session state at handoff
Branch `claude/ocr-repair` head ~`3d93de6f`. Text-clean; 236 desktop + 69 app
tests green; pdf-import zero-diff. Corpus decided files hold the full FIX/DROP
correction lists. Worktree `~/Developer/aristotle-worktrees/ocr-repair`.
