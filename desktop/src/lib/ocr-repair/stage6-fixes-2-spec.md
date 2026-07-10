# Stage-6 fix batch 2 — John's PA/APo read-through (approved 2026-07-09)

Eight classes from John's post-restore hand-verification, each pre-measured on
the real corpora (counts in implementation-notes). A–F are pipeline-side (the
converter stays FROZEN); G–H are app-side (aligner + reader), outside the
freeze but with their own tests. Every pipeline edit lands in the change-list.

## A. Line-final flattened em-dashes (Tier 1, witness-corroborated)

Print `kind—e.g.` wraps with the em-dash at line end; the scan flattens it to
`kind-`; converter §3.4 (lowercase continuation → drop hyphen and glue) yields
`kinde.g.`. Instances: PA 5, APo ~9.

- Detection (stage 5, new pass in vote.ts): body line ending `/[A-Za-z]-$/`
  (tic-stripped), next body line on the SAME page starts with word `w2`.
- Witness evidence: the paired witness contains `w1<dash>w2` INTRA-LINE (dash
  not at a witness line end; markup stripped via stripWitnessMarkup; case-
  insensitive). Dash char ∈ {—, –}.
- Repair: replace `w1-` with `w1—w2` on line 1 (replaceInLine enforces the
  recto tic-gap ≥4; refusal → flag) and remove `w2` from line 2's body start,
  re-seating the remainder at w2's original column. New rule `wrap-join`,
  evidence kind `emdash-joint`, declared cross-line token delta −1 asserted
  by a dedicated applier (applyWrapJoins) with the document invariants.
- Refuse (→ Tier-2 card): cross-page wraps, line 2 emptied, geometry refusal.

## B. Line-wrapped lexical compounds (Tier 1, witness-corroborated)

Same wrap shape but the hyphen is lexical (`split-footed`): converter glues to
`splitfooted`. Witness evidence: `w1-w2` (plain hyphen) intra-line. Repair:
join as `w1-w2` (hyphen kept), same machinery/rule, evidence kind
`lexical-compound`. Instances: PA ~29, APo ~9.

Ambiguous line-final hyphens (witness shows BOTH joint and solid forms, or
neither — usually because the witness wrapped at the same point): Tier-2
review cards, rule `wrap-join`, grouped by pattern (`w1-|w2`). ~16 PA + ~14
APo. Solid-form-only = genuine soft wrap → no record (converter handles).

## C. Page-top spurious indents (Tier 2, jitter batch)

A page's first body line at offset +1/+2 can't be jitter-snapped today —
previousBodyLine resets per page (John's 73a20 `opposites—e.g.`). Extend the
jitter/under-indent branches to use the cross-page previous body line (from D)
when pageTop: offset ∈ {1,2} + no witness break + prev page's last TEXT line
mid-sentence → snap (support `jitter`, evidence.crossPage true); offset 2 +
sentence-final prev → under-indent flag. Joins the approved jitter pattern.

## D. Footnote-aware cross-seam evidence (infrastructure)

At stage 5, Barnes's translator notes still sit at page bottoms, so "previous
page's last body line" can latch onto a FOOTNOTE (why C's scan missed 73a20:
the page above ends in a sentence-final note). Rule: when recording a page's
last body line for cross-seam evidence, skip a trailing block that is (a)
separated from the body above by ≥1 blank line AND (b) whose first line
starts with a bare digit head (`^\d{1,2}[.)]?\s+\S`). Applies to
prevPageLastBody (paragraph gate + C). Consequence: the 2026-07-09 page-top
kill/dual verdicts on APo re-derive — re-run and re-diff expected.

## E. Chapter-first lines minted as titles (Tier 1, config-declared)

Both editions indent chapter-opening lines; converter §5 captures an indented,
centered-enough first line after CHAPTER as a chapter TITLE and removes it
from the body stream — 20 PA + 13 APo lines of Aristotle relocated into fake
headings. Neither Lennox nor Barnes has chapter titles.

- corpus-config: new optional `chapterTitles?: boolean` (default false).
- stage 4 (spacing.ts): when !chapterTitles, the first non-blank line after a
  BOOK/CHAPTER heading line is re-seated to the body margin (setLeadingIndent;
  rule `heading-normalize`, evidence kind `chapter-first-line-deindent`,
  Tier 1). Expected: divisions.titled → 0 for both corpora; the 33 lines
  return to the body.
- vote.ts: never emit a paragraph-break-lost INSERT for the first body line
  after a division heading (the converter opens a paragraph at every chapter
  regardless; the indent is pure title bait — the p29-L29 dual-blank insert
  minted APo I.22's fake title).

## F. Bottom page-number strip (Tier 1, cadence-validated)

Print page numbers sit bottom-center; when no blank line separates them from
the prose (31 APo pages; 0 PA), the converter glues them into the paragraph —
~23 numbers in the Barnes body ("predicated **23** primitively"). John hit
"31 are predicated" at 83b.

- stage 2 (skeleton.ts): if a page's last non-blank line is a bare 1–3-digit
  line, collect (pageIdx, value); accept and REMOVE when the value fits the
  book-page cadence (mode offset of value−pageIdx, tolerance ±1). Rule
  `folio-repair`, evidence kind `bottom-folio-strip`. Strip on ALL pages
  (both corpora), not just glued ones — furniture is furniture.

## G. Aligner: paragraph-boundary anchors snap backward (app-side)

`{83b}` is emitted at the paragraph start of "Either a term…" but the stored
anchor points at "truly." — snapWord picks the nearest space and newlines
don't count, so a tag at a paragraph boundary snaps onto the previous
paragraph's last word. 141 PA + 99 APo anchors sit at paragraph starts.

- Fix in desktop/src/lib/aligner/import-align.ts ONLY (engine.ts is parity-
  locked against align/aligner.py — do not touch): a local paragraph-aware
  snap used at both call sites: candidates must not cross a `\n`; an offset
  at/adjacent to `\n` snaps FORWARD to the next word start.
- Tests beside the existing import-align tests; include the literal
  "truly.\nEither a term" shape.

## H. Reader: marginal tick attaches to the previous rendered line (app-side)

`.bk-num` is position:absolute without `top`; when the marked word begins a
rendered line, the empty marker box's static position is the END of the
previous line — with a short preceding sentence filling one line, the tick
reads a full sentence early at every column width (John's 83a20/25).

- Reader.svelte flow rendering: emit the tick INSIDE the following text
  span as its first child (all transFlow branches), so its static position
  is the first line of the text it marks. Verify the offset walkers
  (annotations.ts proseOffsetAt, emphasis-paint.ts proseText) still exclude
  it (they exclude by class). Cross-view-mode check + app test suite.

## Order & verification

D → C/E(vote) → E(spacing/config) → A/B → F, tests per class (vitest
src/lib/ocr-repair); G, H delegated (Codex gpt-5.6), verified + tested by us.
Then: full re-run `--through 6 --decisions <2026-07-09 file>` both corpora;
regenerate reviews (new wrap-join cards + re-derived page-top batches);
expected grader deltas: titled → 0 both corpora, APo body gains the stripped
page numbers' lines' cleanliness (no counter regression otherwise); FINALs
re-cut; John re-imports and rules on the new cards.
