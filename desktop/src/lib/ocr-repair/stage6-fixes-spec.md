# Stage-6 fix batch — John's read-through findings (specs pre-verified 2026-07-08)

Four defect classes found by John reading the imported books; three Opus
designs, each measured on the real corpora and verified through the frozen
converter. This file is the implementation contract.

## A. Bracketed-bare recovery (gutter-reseat.ts)

Garbled/missed bare Bekker line-markers left in body text ('IO We think…',
'5 first, and then later…'). 86 fires measured across both corpora, all
genuine, ZERO false positives (proof over ~15,564 edge tokens).

- `decodeBareLetters(raw)`: per-char map via the stage-2 charset
  (I/l/|/r→1, O/o→0, S/s→5, Z/z→2, digits self); succeed iff ALL chars map,
  value 1..99. No arabic-digit precondition.
- `recoverBracketedBares(lines, side, accepted, excluded, incoming, config,
  page, nextId)` — called in `reseatGutter` right after `chooseSide`, before
  `ambiguousBekkerRecords`; merges into `decision.accepted` (sorted by
  lineIdx) so `relayoutPage` seats recovered tics normally.
- Per non-excluded, non-blank, non-display, non-heading, non-accepted line:
  edge token of the DECIDED side only. VERSO gate: token startCol
  ≤ modalMargin − 2 (modalMargin = the `mode(alphaCols)` relayoutPage already
  computes — body words sit AT the margin, tics strictly left; this is the
  false-positive guard). RECTO: trailing token, startCol ≥ 30, gap ≥ 1.
  Token length ≤ 2.
- Claim iff unique full-charset decode n AND `isPlausibleBare(n,{line:prev})`
  (%5 or col-start 4/5) AND strictly bracketed prev < n < next by accepted
  marks of the SAME running column (page-crossing allowed for next; BOTH
  must exist) AND n not already accepted in the column.
- On claim: synthesize AcceptedCandidate (repaired:true, canonical=String(n))
  + Tier-1 `bekker-digit` record, evidence
  `{kind:'bracketed-bare-recovery', bracket:{prev,next}, confusions}`.
  Recovered lineIdx/startCol join the `claimed` set (no Tier-2 duplicate).
- Expected: droppedLines APo 43→0, PA 16→2 (658b15 comma-garble + 676a20
  true loss stay flagged); ticsEmitted APo 411→454, PA 838→~880;
  books/chapters unchanged.

## B. Approved Bekker decisions apply at STAGE 3

John's approved `66Ia→661a` respelled the token in place at stage 5 but left
it unseated (1-space gap → converter reads prose: 'teeth in 661a animals').
Fix: `reseatGutter` gains an optional `decisions` param (the parsed
ReviewDecisions). A Tier-2-ambiguous garble whose pattern
(`bekker-opener|<before>|<after>` — match on before/after strings) is in the
approved set is ACCEPTED at stage 3 with the approved decode: claimed,
repaired:true, seated by relayout, column state advances (unlocking its
column's bares). CLI threads --decisions into stage 3 as well as stage 5.
vote.ts's stage-3 fold-in keeps generating the review CARD; its in-place
respell apply path for bekker-opener records is REMOVED (stage 3 owns apply).

## C. Paragraph fidelity (vote.ts + review.ts, stage-5 campaign)

Two directions, witness-gated, geometry-only (leading whitespace; never
tokens). Measured: lost breaks 144 APo / 118 PA; spurious jitter paragraphs
29 APo / 23 PA. Converter-verified on John's exact examples.

- `classifyParagraphs(pages, pairing, witnessParaStarts)` after
  `classifyGaps`: records rule `paragraph-indent`, evidence.kind ∈
  {paragraph-break-lost, paragraph-break-spurious}, evidence.support ∈
  {dual-blank, page-top, under-indent, jitter}, page/line/offset/modal/side +
  witness context phrase. Witness paragraph starts = normalized first-4-words
  after blank-line breaks in the witness body window.
- Decision rule (offset o = firstCol − TARGET margin, after tic-blanking; on
  verso the baseline is the stage-3 target margin 11, NOT a recomputed page
  modal — John's 642a25 page has body at 13 vs tics' 11 and the modal would
  invert the offsets):
  INSERT +4 iff o ≤ 1 AND witness breaks here AND (mid-page blank precedes OR
  page-top body line OR o == 1).
  SNAP to margin iff o ∈ {1,2} AND no witness break AND previous body line
  does not end a sentence (.?!"'′)). o==2 is the class that changes converter
  output.
  FLAG (no action) iff o == 2, sentence-boundary, witness-unmatched.
- Apply primitive `setLeadingIndent(line, targetCol, side)` beside
  replaceInLine: verso rewrites leading spaces; recto re-pads to the fixed
  tic column, refusing (flag `paragraph-indent-skipped-geometry`) if the tic
  gap would drop below 4. Existing document invariants assert (token count
  unchanged — leading spaces add none).
- review.ts: NEW DECIDABLE category 'Paragraph breaks' (not in
  DIAGNOSTIC_CATEGORIES); group by evidence.support → three batches:
  dual-blank (render CHECKED by default — dual evidence: the print's own
  blank line + witness), page-top (unchecked), jitter snaps (unchecked).
- Old spurious-break disease stays dead: blanks alone never create breaks;
  inserts only on witness-positive evidence.

## D. Footnote normalization — NEW stage 6 `footnotes` (footnote-repair.ts)

Runs AFTER stage 5 on the vote output (preserves John's applied Greek on
note lines; keeps vote line-addressing stable). Measured on APo:
notes 0→49 (52 with the degarble), pairs 0→42; PA byte-identical no-op.

`normalizeFootnotes(text, config) → {text, changes}`, per page, running
note counter (scope detection: reset to 1 after a high value = per-book).

Pass A — heads (rule `footnote-head`, Tier 1):
1. Find trailing folio (/^\s{4,}\d{1,4}\s*$/); collect the block above it,
   stopping at the first blank whose upper neighbour is plain body. GATE:
   block must contain a note-signature line
   (/Reading|Omitting|Retaining|Placing|Adding|Deleting|OCT|MSS/).
2. Classify lines: NUM (lone int), NUMTXT (/^\s*\d{1,3}\s+\S/ with
   signature), TXT.
3. Pair each NUM with the adjacent TXT — prefer following, else preceding
   (superscripts land above OR below) → rewrite TXT as `{indent}{N}. {text}`
   and DELETE the NUM line. NUMTXT → insert the period only.
4. Trim block top to the topmost paired element; INSERT a blank line above
   the block if the line above is non-blank (converter's sawGap); REMOVE
   interior blanks between notes (unless adjacent to display-shaped lines).
5. Roman-garbled heads (`I Reading…`, `II Omitting…`): degarbleNumeral +
   note-sequence-continuity gate → Tier 1; else Tier-2 card.
6. Invariants (own assertion — NOT vote.ts's token guard): form-feed count
   and running heads byte-identical; exactly one line removed per NUM join;
   net line-count delta per page == (blanks inserted − NUM lines removed −
   interior blanks removed).

Pass B — in-body marker glue (rule `footnote-marker`):
1. Body lines (skip note block, CHAPTER/BOOK headings — mandatory, measured
   2 false hits without): /(\S)( +)(\d{1,2})(?=[\s).,;:\]]|$)/.
2. Tier-1 conjunction: digit ∈ the page's note-number set (from Pass A) AND
   the witness shows a superscript at the aligned position (<sup>N</sup>,
   ^N, $^{N}$, unicode — per-instance decode via witness-anchors machinery)
   AND not gutter/Bekker (not line-edge tic position, gap < 4, not followed
   by a/b/digit).
3. Rewrite: delete the space(s) → `word8`; evidence.joinedTokens = 1 (the
   vote.ts-style delta accounting).
4. Tier-2 card when witness can't confirm, and for markers detached onto
   their own line (ambiguous reattachment; ~7 in APo).

CLI: register { n: 6, name: 'footnotes' } after vote; the FINAL import file
becomes stage6-footnotes.txt. Stage 6 needs the witness text for Pass B.

## Verification (whole batch)

- All existing 76 tests green + new fixtures per class: (A) blob recovery
  incl. margin-relative gate + bracket + no-claim-at-margin word; (B)
  approved opener seated at stage 3 with state advance; (C) insert/snap/flag
  each, page-top insert, recto re-pad refusal, dual-blank default-checked
  rendering; (D) two-line head join (above + below), one-line head period
  insert, blank-separator insert, marker glue with witness gate, CHAPTER
  exclusion, Roman head degarble, PA no-op (synthetic PA-shaped page).
- `npm run check` clean; `git diff --stat -- src/lib/pdf-import` EMPTY.
- Full runs both corpora with --decisions: expected counter movement per
  class specs above; books/chapters unchanged (4/51, 2/53).
