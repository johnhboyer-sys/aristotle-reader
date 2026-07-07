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
