# ocr-repair implementation notes

Working log for the Goal-A repair pipeline (OCR layout text → the
`../pdf-import/ocr-target-format.md` contract). Modeled on the Goal-B log.
Governing spec: `~/Downloads/goal-a-session-handoff.md` (v2) as amended
2026-07-07: two build corpora from stage 0 (Lennox PA + Barnes APo, both
Clarendon), corpus-agnostic stage code with per-corpus `config.json`, sign-off =
both books imported + hand-verified, plus a held-out non-Clarendon third corpus
as the edition-neutrality gate before the PR.

Corpus files are John's copyrighted material: they live in
`~/Documents/aristotle-ocr/<corpus>/` (backbone.txt, witness-genie.txt,
config.json, stage outputs, reports, change-lists) and are never committed,
uploaded, or quoted beyond minimal fragments in test pins.

## Phase 0 — harness + pinned baselines (2026-07-07)

Stage-0 grader harness: `desktop/scripts/ocr-repair.ts` (tsx CLI) →
`grade.ts` wraps the frozen converter (`pageLevelOnly` fallback when the
first pass returns needs-choice; summary status records the fallback so it
can't read as a clean pass) + `corpus-config.ts` (config loading; paths
resolve against the config file's directory).

### pa-lennox baseline (raw backbone) — matches the manifest pin ±0

| counter | value |
|---|---|
| status | collapsed-fallback (1 collapsed page) |
| pages | 425 |
| ticsEmitted | 51 |
| ticsSuppressed | 205 |
| droppedLines | 56 |
| displayBlocks | 1369 |
| side-ambiguous | 364 |
| seams | 2 |
| divisions | books 6, chapters 39 |
| footnotes | notes 0, unmatched 13942 |

### apo-barnes baseline (raw backbone) — NEW pin

| counter | value |
|---|---|
| status | ok |
| pages | 326 |
| ticsEmitted | 106 |
| ticsSuppressed | 182 |
| droppedLines | 88 |
| displayBlocks | 152 |
| side-ambiguous | 283 |
| seams | 0 |
| divisions | books 0, chapters 52 |
| footnotes | notes 0, unmatched 8079 |

Open observations for later stages:

- APo `books 0`: the converter detects no book headings in the raw APo
  backbone (PA detects 6, inflated by commentary). Investigate at stage 1/2 —
  either the print's book headings aren't centered/keyword-shaped in the
  extraction, or front matter/commentary noise is absorbing them. APo
  `chapters 52` vs the print's 53 (34 + 19).
- APo has no collapsed pages and far fewer display blocks (152 vs 1369) —
  the APo extraction is cleaner than PA's; expect corpus-relative, not
  absolute, stage targets.
- Both fnUnmatched counts are commentary marker storms; they should collapse
  at stage 1 (slice).
- Backbone/witness page-record counts: PA 416 `\f` vs 424 Genie `---`;
  APo 325 `\f` vs 354 Genie `---`. Pairing must anchor on running heads /
  Bekker anchors, never raw index (handoff data fact, confirmed for APo too).

## Stage 1 — slice (2026-07-07)

Pattern-driven page-boundary slice (`slice.ts`): bodyStart regex plus an
optional bodyStartNextLine PAIR rule (the body opens where a centered BOOK
heading is followed by a centered CHAPTER heading — necessary because PA's
recto running heads literally read `BOOK ONE` etc., so a single-line BOOK
pattern misfires), first match front-to-back; backMatterStart searched
strictly after the body start (the same BOOK+CHAPTER pair reappears where the
commentary opens). `trimBodyStartPreamble` removes front-matter prose printed
between the body-start page's head and the opening heading (PA prints an
8-line note on the translation there), logged with the removed lines in the
change record's evidence.

Boundaries (0-based `split('\f')` segments; deep-reasoner report, seam pages
eyeball-verified): PA keep 16–133 (back matter from 134 `COMMENTARY`; 133 is
a harmless blank); APo keep 27–100 (back matter from 101 `SYNOPSIS` — a
COMMENTARY-only pattern would wrongly keep the 4-page synopsis).

Grader deltas (baseline → post-slice):

| counter | PA | APo |
|---|---|---|
| pages | 425 → 118 | 326 → 74 |
| seams | 2 → 0 | 0 → 0 |
| collapsedPages | 1 → 0 | 0 → 0 |
| ticsEmitted | 51 → 49 | 106 → 82 |
| ticsSuppressed | 205 → 150 | 182 → 95 |
| droppedLines | 56 → 44 | 88 → 62 |
| displayBlocks | 1369 → 498 | 152 → 22 |
| side-ambiguous | 364 → 87 | 283 → 57 |
| books / chapters | 6/39 → 1/31 | 0/52 → 0/33 |
| fnUnmatched | 13942 → 584 | 8079 → 294 |

Stage-1 target met: seams=[], boundary cuts only, sliced material on disk.
Divisions completeness explicitly MOVES to stage 2 — three measured causes:

1. **Book-opening pages print no running head**, so the converter strips the
   real `BOOK TWO/THREE/FOUR` (and APo `BOOK ALPHA`) heading as the page
   head — the missing-head silent-loss mode the spec warns about. Stage-2
   head-insert must treat "first non-blank line is a centered division
   heading" as a headless page and insert the placeholder above it.
2. **APo names books in Greek-letter ordinals** (`BOOK ALPHA`/`BOOK BETA`),
   which the frozen converter's number vocabulary (Arabic/Roman/spelled
   English) cannot parse. Repair-side Tier-1 normalization ALPHA→ONE,
   BETA→TWO planned; per-record before/after preserves what the print says.
   FLAGGED to John at the stage-1 checkpoint (it re-spells a printed word).
3. **Chapter numerals are OCR-garbled** in both translations (`CHAPTER IO`,
   `I I`, `I3`, `IS`, `2 I`, `3I` for 10/11/13/15/21/31 …) — Tier-1
   letter-for-digit normalization on heading lines only, stage 2.

### OCR quirk table (John 2026-07-07, verified in both corpora)

- Adobe backbone: geometry trustworthy; Bekker column letters garbled —
  a→`3`/`h`, b→`6`, glued (`766` = 76b) or spaced (`76 3` = 76a); dashes
  flattened; polytonic Greek always garbled. Measured APo line-final tics:
  33 `…3`-forms + 18 `…6`-forms vs 27 clean `a`/`b`.
- History Genie witness: wording/em-dashes/punctuation/Greek trustworthy;
  column letters generally right; LaTeX-ish apparatus artifacts around Bekker
  numbers and note marks (`73^a`, `$^b$`, `76$^b$`, `**639ᵃ**`, `<sup>`,
  unicode superscripts); silent whole-page dropouts (`--- [blank] ---`);
  no geometry (reflowed).
- Consequences: stage-3 Bekker repair takes digits+position from the
  backbone, expectation from the monotonic cadence, column letter from Genie
  as evidence; Greek tokens are always Tier 2 (witness reading attached as
  evidence, never auto-applied); witness normalization decodes apparatus
  encodings for MATCHING only.
