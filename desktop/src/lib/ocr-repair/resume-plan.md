# Goal-A OCR-repair pipeline — RESUME PLAN (written 2026-07-07, pre-wipe)

State at stop: **stages 0–2 complete and verified on both Clarendon corpora;
stopped at the stage-3 checkpoint, stage 3 not started.** Branch
`claude/ocr-repair`, pushed to origin. Companion history/log:
`implementation-notes.md` (same directory — read it first; it has the pinned
baselines, per-stage grader deltas, the OCR quirk table, and the stage-7
held-out-corpus facts).

## What exists and works (all committed on this branch)

- `corpus-config.ts` — per-corpus config contract (slice patterns, Bekker
  range, divisions, placeholder head). No corpus literals in stage code.
- `grade.ts` — wraps the FROZEN converter (`../pdf-import`, zero diff — keep
  it that way) as the sole grader; summary + delta printing.
- `changelist.ts` — ChangeRecord JSONL audit trail; rules: slice, head-insert,
  heading-normalize, folio-repair, spacing-collapse, tic-reseat, bekker-digit,
  emdash-restore, ligature, word-identity (Tier 2 only), no-witness-span, flag.
- `slice.ts` (stage 1) — pattern-driven page-boundary slicing (BOOK+CHAPTER
  pair rule, preamble trim). `skeleton.ts` (stage 2) — head-insert on headless
  book-opening pages, heading-normalize (garbled chapter numerals repaired
  only when sequence-forced; Greek book ordinals ALPHA→ONE etc., John-approved;
  keyword→numeral gap collapsed to defeat trailing-tic capture), folio-repair
  (cadence-anchored). 25 vitest tests green (`cd desktop && npx vitest run
  src/lib/ocr-repair`).
- `desktop/scripts/ocr-repair.ts` — CLI:
  `npx tsx desktop/scripts/ocr-repair.ts --config <dir>/config.json --through N`
  Prints grader deltas per stage; writes stages/, reports/, changes-*.jsonl
  into the corpus dir.

Current grader state (see implementation-notes for full tables):
PA seams 0, 4 books/51 chapters ✓; APo 2 books/53 chapters ✓. Remaining
non-division counters await stages 3–5: PA tics 47 emitted/144 suppressed,
486 displayBlocks, 92 side-ambiguous; APo 83/89, 11, 59.

## MUST BE BACKED UP BEFORE WIPE (not in the repo, unrecoverable otherwise)

- `~/Documents/aristotle-ocr/` — both corpus dirs: backbone.txt,
  witness-genie.txt, config.json, chapter-map.json (PA), stages/, reports/,
  changes-*.jsonl. The stage outputs are re-derivable from inputs; the INPUTS
  are not re-derivable without re-extraction.
- `~/Downloads`: the two source PDFs (Lennox PA Clarendon 2001; Barnes APo
  z-library), `PA - Lennox-2.txt` (Genie witness), `Barnes - Posterior
  Analytics (Clarendon).txt` (Genie witness), the pdftotext backbones
  (`Aristotle-On the Parts of Animals-2001-Clarendon Press.txt`, `Posterior
  Analytics (...z-library...).txt`), `PA - Lennox-chapter-map.json`,
  **all "Apostle" files (stage-7 held-out corpus — deliberately never opened;
  keep them unopened)**, and the two handoff docs `goal-a-session-handoff.md`
  + `goal-a-assets-manifest.md`.

## Reconstructing the working dirs after re-provisioning

```
mkdir -p ~/Documents/aristotle-ocr/{pa-lennox,apo-barnes}
# copy backbone → backbone.txt, Genie txt → witness-genie.txt into each;
# PA also: chapter map → chapter-map.json
# then write the two config.json files verbatim:
```

`~/Documents/aristotle-ocr/pa-lennox/config.json`:
```json
{
  "id": "pa-lennox",
  "workTitle": "Parts of Animals",
  "runningHeadPlaceholder": "PARTS OF ANIMALS",
  "bekkerStart": "639a",
  "bekkerEnd": "697b",
  "divisions": { "books": 4, "chaptersPerBook": [5, 17, 15, 14] },
  "slice": {
    "bodyStart": "^\\s{5,}BOOK\\s+([A-Z]+|\\d{1,2})\\s*$",
    "bodyStartNextLine": "^\\s{2,}CHAPTER\\s+\\S{1,4}\\s*$",
    "trimBodyStartPreamble": true,
    "backMatterStart": "^\\s*COMMENTARY\\s*$"
  },
  "backbonePath": "backbone.txt",
  "witnessPath": "witness-genie.txt",
  "chapterMapPath": "chapter-map.json"
}
```

`~/Documents/aristotle-ocr/apo-barnes/config.json`:
```json
{
  "id": "apo-barnes",
  "workTitle": "Posterior Analytics",
  "runningHeadPlaceholder": "POSTERIOR ANALYTICS",
  "bekkerStart": "71a",
  "bekkerEnd": "100b",
  "divisions": { "books": 2, "chaptersPerBook": [34, 19] },
  "slice": {
    "bodyStart": "^\\s{5,}BOOK\\s+([A-Z]+|\\d{1,2})\\s*$",
    "bodyStartNextLine": "^\\s{2,}CHAPTER\\s+\\S{1,4}\\s*$",
    "backMatterStart": "^\\s*(SYNOPSIS|COMMENTARY)\\s*$"
  },
  "backbonePath": "backbone.txt",
  "witnessPath": "witness-genie.txt"
}
```

Sanity check after reconstruction: `--through 2` must reproduce the
implementation-notes stage-2 table exactly (PA 4/51, APo 2/53; PA stage-0
baseline 51/205/56/1369/364).

## Session rules that govern the remaining work (from the locked handoff, amended)

1. CHECKPOINT protocol: delegation plan at each stage top → stop for John's
   go-ahead. 2. `desktop/src/lib/pdf-import/` FROZEN — zero diff; the
   converter's honesty report is the ONLY grader. 3. Tier 1 = mechanical,
   auto+logged; Tier 2 = changes which word the text says — review file, never
   auto-applied; Greek/diacritic tokens always Tier 2. 4. Every edit in the
   JSONL change-list. 5. Corpus files local-only, never committed/uploaded;
   quote at most a line in test pins. 6. Never delete running heads.
   7. Witnesses never add/remove tokens/lines/breaks. 8. Two-corpus
   development (both graded at every stage); sign-off = BOTH books imported +
   John hand-verified. 9. Orchestration: high-stakes → dual-dispatch
   (deep-reasoner ∥ Codex) and synthesize; reasoning-heavy → deep-reasoner;
   mechanical → Codex (via codex:codex-rescue agent; it launches a background
   task — poll `node ~/.claude/plugins/cache/openai-codex/codex/<ver>/scripts/
   codex-companion.mjs status <task-id>` from the MAIN thread, then `result`,
   then verify claims yourself).

## Remaining stages

### Stage 3 — gutter re-seat + Bekker digit repair (HIGH STAKES, dual-dispatch design)

The next action at resume. Both corpora's tic geometry is out of converter
tolerance (that's most of ticsSuppressed + side-ambiguous): recto tics print
with a 1-space gap (converter needs ≥4 at col ≥40, ±6 band); verso body
margin ~col 6 (converter side threshold ≥8).

- Dual-dispatch the DESIGN to deep-reasoner ∥ Codex; synthesize before
  implementing: (a) re-layout algorithm — verso: body remargined to col 11,
  tic at col 0–1; recto: body at col 0, tics re-padded to one fixed start
  col ≥40, ≥4-space gap, band ±6; paragraph indents preserved RELATIVE to the
  new margin; one tic per line on text-bearing lines only. (b) Bekker-digit
  policy — validate against the monotonic column sequence (PA 639a→697b, APo
  71a→100b from config) + 5-cadence of bares; repair garbled full-forms ONLY
  when cadence-unique (rule bekker-digit, Tier 1, logged with cadence state);
  ambiguous → left + Tier-2 record with the Genie column anchor as evidence.
- Adobe confusion classes (measured): column letter a→`3`/`h`, b→`6`; glued
  (`766`=76b) or spaced (`76 3`=76a). Genie is RIGHT about column letters —
  extract its `NNNa/NNNb` anchors (decode `$^b$`/`^`/`<sup>`/unicode-sup
  per-instance, never assume a uniform encoding) as corroborating evidence
  only. Reuse `classifyTicToken`/`findTrailingToken`/`findLeadingToken`/
  `RECTO_MIN_GAP` from `../pdf-import/line-shape.ts`.
- Fixtures BEFORE full-file runs, especially the verso col-6→11 re-layout.
- Targets: ticsSuppressed → ~0, side-ambiguous → 0, collapsedPages = [],
  droppedLines shrink to genuine print gaps (Apostle will later keep real
  gaps — scan-cropped tics stay flagged, that's correct behavior).

### Stage 4 — prose spacing normalization

Collapse internal ≥2-space runs on prose-shaped lines; preserve leading
indent and +2..+8 paragraph deltas; lines still display-shaped after
normalization stay wide and surface in report.displayBlocks for hand review
(NEVER auto-flatten a real table/diagram; PA has anatomical passages worth
eyeballing). deep-reasoner settles the prose-vs-display edge policy on the
real files; Codex implements. Target: PA displayBlocks 486 → ~0 survivors
all hand-checked; APo 11 → same.

### Stage 5 — witness alignment + token vote

- Page pairing by running-head/Bekker anchors, never raw index (PA 424 Genie
  seps vs 416 backbone FFs; APo 354 vs 325). Produce a pairing
  reconciliation report per corpus BEFORE trusting any votes (deep-reasoner).
- Genie dropout pages (`--- [blank] ---`) → no-witness-span flags.
- Token LCS per page (~300 words; jsdiff diffArrays with custom comparator
  or hand-rolled LCS): normalized tokens for MATCHING, raw forms for VOTING.
  Witnesses may only re-spell characters WITHIN matched tokens — never
  add/remove tokens or breaks (assert this invariant in vote.ts).
- Vote classes: mechanical (em-dash restore — Adobe flattened all dashes,
  ligature damage, in-word spacing) → Tier 1 auto+logged; word-identity and
  ALL Greek/diacritic tokens → Tier 2 records (backbone garbles Greek; Genie
  reads it right — expect a large cluster here).
- Paragraph-break positions diffed vs Genie's paragraphs → Tier-2
  diagnostics only (the prior pipeline's ~90 spurious mid-sentence breaks
  class — must be structurally impossible now, verify).
- Tier-2 REVIEW FILE (one per corpus, markdown): disagreements GROUPED BY
  PATTERN (same before→after pair = one decision), sorted by instance count
  desc, checkbox per group, ±1 line backbone context per instance, stable
  ids; apply step parses decisions and re-runs the vote stage.
- Targeted Claude-vision arbitration ONLY for: Genie-dropout/badly-paired
  pages; pages over a Tier-2 density threshold; cadence-ambiguous Bekker
  lines. Verdicts attach as evidence; still John-reviewed.

### Stage 6 — final grade → import → hand-verify (both corpora)

Clean honesty report per the ocr-target-format §0 table; John imports both
in the desktop app (ImportDialog) and hand-verifies at the Reeve-NE bar;
accepted Tier-2 decisions applied by re-running stage 5 with the decision
file; re-grade. Also spot-check the old defect catalog: no spurious
mid-sentence paragraph breaks, no stray `I I`/page-number body paragraphs.

### Stage 7 — held-out edition-neutrality test (GATES THE PR)

Apostle's Posterior Analytics (files in ~/Downloads, "Apostle" in names —
NEVER opened so far; keep it that way until this stage). Protocol: copy to
`~/Documents/aristotle-ocr/apo-apostle/`, write ONLY a config.json, run
stages 0–6 with zero code changes. Pass = clean report config-only. Any
forced code change = logged generality defect, fixed corpus-agnostically,
then re-grade ALL THREE corpora. John's description (details in
implementation-notes): rough scan, some tics cut off (those stay flagged
gaps — correct, not a failure); Genie missed tics + inconsistent `$`
encoding; ALL tics verso; chapters are BARE NUMERALS in a 2-book work —
known spec collision (converter accepts bare-numeral chapters only for
single-book works); if config-only fails on this, the sketched general fix
is a config-declared chapter style in heading-normalize (bare centered
numeral → keyword form, Tier 1, logged).

### Then: PR

PR from `claude/ocr-repair` → main. Before opening: full desktop test suite
green; `git diff main -- desktop/src/lib/pdf-import/` EMPTY; acceptance
checklist from the handoff walked (baselines pinned ✓, every edit logged ✓,
Bekker cadence-unique only, no wording changes outside accepted Tier-2,
Greek never Tier-1, witness token/line invariant, real tables preserved,
heads on every page, pairing report before votes, one work per file ✓,
corpus files never committed ✓).
