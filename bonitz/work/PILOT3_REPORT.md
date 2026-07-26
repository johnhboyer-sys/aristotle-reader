# Three-Reader Pilot Report — PDF pages 15–19 (2026-07-21)

## Setup
- Readers: **Opus 4.8 vision** (strip-based, faithful/diplomatic prompt, raw ϗ/ȣ
  incl. printed accents), **LlamaParse Agentic** (one job, 5 pages), **History
  Genie/CHURRO** (slice of John's chunk-1 web-UI docx).
- 10 columns split by the reworked `split_columns.py` (content-extent crops;
  gutter digits handled downstream). 600 PPI → 1400px-wide strips, ~11 lines each.
- Raw reads immutable under `bonitz/raw/{opus,genie,llamaparse}/`.
- Canonical diff streams (whitespace-free, homoglyph/apostrophe/dash-folded,
  hyphenation rejoined) → three-way comparator (`compare3.py`) → flag queue →
  10 Opus adjudicators against the images.

## Headline numbers
- **Opus vs hand-keyed gold (p15-L): 3.6% canonical CER, 2.3% fold-level**
  (old single-pass pilot: 9.2%). Citation recall effectively 100% (all
  apparent misses were gold-file typos).
- Comparator: 486 diff regions → 193 auto-resolved soft (ligature-level),
  **200 flagged** → adjudicated: **194 high confidence, 6 medium, 0 uncertain,
  0 unlocatable**.
- **Human queue for 5 pages: 6 items** (~1.2/page; each a named glyph
  ambiguity with a note).
- Adjudicator agreement: multiple readers 116, **opus alone right 76**,
  llama alone 5, genie alone 1, none 2 (both: all readers dropped a printed
  circumflex on ȣ).

## Reader profile (adds to §4 of the handoff)
- **Opus** (strongest): wins most ligature calls (raw ȣ/ϗ + printed accent) and
  the fused `Ζιι` double-iota. Systematic misses: italic κ read as χ (Ηκ
  sigla), leading chapter-iota read as digit 1 (`ι41`→`141`), occasional
  β/θ and ξ/κ swaps.
- **LlamaParse** (good): kept ȣ raw this run. Systematic: cursive `ϑ` for θ
  (17 of p17-R's 44 flags alone), `'Α` apostrophe-form for Ἀ, spaced-out
  sigla, `Ζιι`→`Ζυ`.
- **Genie** (weakest, still earns its keep): latinizes α→a inside sigla,
  expands ligatures with guessed accents (τὰς for τȣ̀ς), drops iotas,
  occasional entity garble; **page 16 came back as line-by-line two-column
  table rows (`left | right`)** — normalizer now de-interleaves these.

## Normalizer improvements queued for the scale run
1. Fold `ϑ`→`θ` (kills ~9% of all flags at a stroke).
2. Fold apostrophe+bare-capital-vowel → precomposed smooth breathing (`'Α`→`Ἀ`).
3. Both are canonical-stream-only; raw reads untouched.

## Cost / effort projection (871 body pages + 5 addenda, ×2 columns)
- Opus reads + adjudication ran on Claude Code subagents (Max plan) — no API
  spend. ~10 reader + ~10 adjudicator agents per 5 pages → ~350 agent-runs
  per 10-page batch cadence; wall-clock ~15-25 min per 5-page batch with 10
  parallel agents.
- LlamaParse: 5 pages consumed one Agentic job — **John: read credits-used
  off the LlamaCloud dashboard** to project against the ~10k budget before
  committing to 890 pages.
- Genie: chunk-1 covers PDF ≤56 only; **PDF ~57–200 needs re-upload in
  smaller files** (suggest 56–105 / 105–155 / 155–200). Chunks 2–5 look
  complete (verified first/last entries).
- Human triage at pilot rate: ~1.2 medium items/page ≈ **1,000-1,100 items
  for the whole book** — hours of review, as targeted. (Flag→adjudicate is
  automated; only mediums+uncertains reach the human.)

## Key facts fixed this session
- **Printed page = PDF page − 12** (PDF 16 → printed 4; PDF 201 → printed 189).
  Filenames stay PDF-numbered.
- Old α-batch metadata errors explained: the model read the *printed* number,
  the pipeline expected the PDF number.

## Status update (2026-07-22)
- LlamaParse credits measured: **54/page** → ~48k for the book (~5 free
  accounts at 10k each; John OK with multiple accounts, staying on Agentic).
- Genie coverage COMPLETE: re-run "Bonitz 1-200-3.docx" reaches διασπᾶν =
  PDF 200; chunks 2–5 verified. No re-uploads needed.
- ϑ→θ and 'Α→Ἀ folds applied (offset-safe, char-by-char canonical): pilot
  queue 200 → **164** with identical spine.
- `reconcile.py` built and verified: 34 adjudicated corrections applied to
  the spine → `work/reconciled/page-NNN-C.txt`; 6-item `work/HUMAN_QUEUE.md`.
  Loop is now closed end-to-end: raw → canonical → 3-way diff → adjudicate →
  reconciled text + human queue.

## Open items before scaling
1. John reviews `work/HUMAN_QUEUE.md` (6 items).
2. Alphabetical-order check needs lemma detection (entry starts are not
   layout-marked in the raw reads) — Layer-2 territory.
3. Abbreviation key (p14) parse + Bekker range table (Layer 2), per handoff §7.
4. Batch driver for the scale run (render→split→strip→agents→compare→
   adjudicate→reconcile per N-page chunk, resumable).
