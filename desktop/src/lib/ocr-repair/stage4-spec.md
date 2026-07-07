# Stage-4 spec — prose spacing normalization (`spacing.ts`)

Pre-verified on the real stage-3 files (deep-reasoner, 2026-07-07): the policy
below gives PA displayBlocks 468→3, APo 7→2 with ZERO movement on tics
(819/411), suppressed (30/13), dropped (15/43), side-ambiguous (0/1),
divisions, footnotes. All 5 survivors are genuine non-prose edge cases.

`normalizeSpacing(raw: string, config: CorpusConfig): { text; changes }` —
pure TS, no fs, `desktop/src/lib/ocr-repair/spacing.ts`.

## Key measured facts

- Alpha count of a display-shaped line's residual is cleanly BIMODAL: prose
  ≥27 letters, furniture ≤14, the 15–19 band empty → a single
  `PROSE_ALPHA_FLOOR = 20` gate is airtight on both corpora.
- Every multi-line display block in both corpora is justification noise, not
  a table. Neither corpus body contains a genuine table/diagram.
- Stage-3's `isTabularResidual` (≥2 wide runs branch) OVER-preserves as a
  stage-4 keep rule (~30 false survivors) — do NOT reuse it; do NOT add a
  column-alignment escape (measured: keeps 5 prose blocks).
- Expected survivors (hand-check list): PA p33 L1 (leaked folio+head pair),
  p54 L1 (`BOOK THREE` + trailing bare `66`), p94 L1 (`BOOK FOUR` + `685`);
  APo p29 L3-4 (centered bare chapter numeral `18` — converter refuses
  bare-numeral chapters in 2-book works), p51 L44-45 (numeral `4`).

## Scope

Body lines only. Per page, exclude: first non-blank line (running head),
everything from the footnote/bottom-furniture boundary down (reuse the
`pageExcluded`/`findBottomFurnitureStart` approach in gutter-reseat.ts),
blank lines. Excluded lines are BYTE-IDENTICAL in output (note-internal
diagrams keep their spacing per contract §6).

## Per-body-line policy (in order)

Blank the tic in place (`ticSpanOnLine(line,'recto')` then `'verso'` from
`../pdf-import/line-shape`; stage-3 output has at most one). Split:
- recto tic line: `indent · body · ticTail(gap+token at absolute col ticStart)`
- verso tic line: `ticHead(token+gap) · body(residual)`
- plain: `indent · body`
`residual = body.trim()`, `alpha = count of \p{L}`.

a. **Heading**: `parseHeadingResidual(residual)` non-null → byte-identical.
   If it still carries an internal ≥4-space run, emit flag record
   `heading-residual-wide-run` (tier 2), no edit.
b. **Preserve as display** iff `isDisplayShapedLine(residual)` AND
   `alpha < 20` → byte-identical + flag record kind `preserved-display`
   (tier 2, evidence { alpha, runs, sample: first chars }). These are exactly
   the lines that stay in report.displayBlocks.
c. **Collapse** otherwise: every internal run of ≥2 spaces in `body` → one
   space. Geometry-safe reassembly:
   - plain → `indent + collapsed` (indent/paragraph +2..+8 deltas intact)
   - verso → `ticHead + collapsed` (tic col 0 + residual start unchanged)
   - recto → `indent + collapsed + pad to ticStart + ticToken` — the tic
     stays at its EXACT original absolute column (stage 3 fixed all of a
     page's tics at one col → band MAD stays 0). Guard: if the recomputed
     gap were <4 (can't happen from space-removal), leave byte-identical.
   Record per collapsed line: rule `spacing-collapse`, tier 1, before/after,
   evidence { runsCollapsed, side, ticColPreserved? }.

Hyphenated ends unaffected (spaces only; flattened em-dashes are stage 5).

Known limitation (document): a hypothetical high-alpha genuine table would
collapse. Zero exist in PA/APo. Corpus-agnostic escape if Apostle has one:
`config.preserveDisplayLines?: {page,from,to}[]` checked before (b) — add
the optional field to CorpusConfig now, checked first, no heuristics.

## Expected post-stage-4 counters (assert: ONLY displayBlocks moves)

PA: displayBlocks 468→3; APo: 7→2. Everything else byte-stable:
819/411 tics, 30/13 suppressed, 15/43 dropped, 0/1 side-ambiguous,
4/51 + 2/53 divisions, 21/115 fnUnmatched.

## Fixtures (synthetic)

1. Verso-margin prose line w/ two ≥4 runs collapses; paragraph line at +4
   keeps its indent; converter emits body, no display block.
2. Recto tic line `body␣×5 word␣×8 639a` (tic col fixed): body run collapses,
   tic at same absolute col, gap ≥4, converter re-emits; second tic line on
   the page without runs → both tics same col.
3. Verso `0␣␣␣␣residual␣␣␣text`: tic + residual start unchanged, run collapsed.
4. Low-alpha 2-row table (`hot␣␣␣␣cold␣␣␣␣dry` / `wet␣␣␣␣warm␣␣␣␣moist`):
   byte-identical, still a display block via converter, preserved-display
   records.
5. Footnote-block line w/ wide run below the blank gap: byte-identical.
6. One-wide-run high-alpha prose line: collapses, runsCollapsed:1.
7. TWO-wide-run high-alpha prose line: still collapses (stage-3-gate
   regression guard).
8. Centered bare numeral `18` (alpha 0): preserved + preserved-display record.
9. `BOOK␣␣␣␣FOUR` (heading grammar hits) → heading-residual-wide-run, no edit;
   `BOOK␣␣FOUR␣␣␣685` (grammar defeated by trailing number) → preserved-display.
10. Running head byte-identical; hyphenated end unchanged; blanks unchanged.
