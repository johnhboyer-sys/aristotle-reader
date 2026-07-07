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
   English) cannot parse. Tier-1 normalization ALPHA→ONE, BETA→TWO;
   per-record before/after preserves what the print says. **JOHN APPROVED
   2026-07-07** ("we repair these as you suggest" — he keeps the Greek-letter
   convention only for Metaphysics).
3. **Chapter numerals are OCR-garbled** in both translations (`CHAPTER IO`,
   `I I`, `I3`, `IS`, `2 I`, `3I` for 10/11/13/15/21/31 …) — Tier-1
   letter-for-digit normalization on heading lines only, stage 2.

## Stage 2 — skeleton repair (2026-07-07)

`skeleton.ts`, three ordered passes, all Tier 1 + logged:

1. **head-insert** — a page whose first non-blank line is a BOOK heading with
   CHAPTER 1 as the next non-blank line is a book-opening page that printed no
   running head; insert the config placeholder + blank above it (5 pages: PA
   15/46/76, APo 0/47). The CHAPTER-1 condition is what spares PA's recto
   running heads (`BOOK ONE` over chapters 2/3/4/10).
2. **heading-normalize** — document-order walk (book, chapter), skipping each
   page's first non-blank line. Greek book ordinals rewritten (ALPHA→ONE,
   BETA→TWO; John-approved). Garbled chapter numerals repaired ONLY when the
   confusion-map value equals the expected next chapter (12 PA + 18 APo, all
   sequence-forced); otherwise Tier-2 flag.
3. **folio-repair** — last-non-blank-line candidates in the confusion charset;
   cadence constant inferred from clean folios; garbles rewritten only when
   shape-map == cadence expectation; conflicts flagged (APo p57 `ss`, cadence
   58 vs shape 55, left + flagged).

**Discovery — heading numerals get eaten as gutter tics.** Wide keyword→
numeral gaps (`CHAPTER      10`) put the numeral at col ≥40 behind a ≥4-space
run — exactly the converter's trailing-tic shape — so the gutter scanner
claimed it and the heading lost its number (PA emitted only 36/51 chapters
on the first stage-2 run; the missing 15 were position-, not numeral-,
dependent). Fix: collapse the keyword→numeral gap to one space on every
ACCEPTED division line (`heading-spacing` records; unresolved lines left
untouched). This is a general Clarendon/pdftotext hazard worth remembering
for any future corpus.

Grader deltas (post-slice → post-skeleton):

| counter | PA | APo |
|---|---|---|
| books / chapters | 1/31 → **4/51** ✓ | 0/33 → **2/53** ✓ |
| ticsEmitted | 49 → 47 | 82 → 83 |
| ticsSuppressed | 150 → 144 | 95 → 89 |
| displayBlocks | 498 → 486 | 22 → 11 |
| side-ambiguous | 87 → 92 | 57 → 59 |

Chapter tag sequences verified complete and monotonic against the print
structure (PA 5/17/15/14 per the chapter map; APo 34+19). Tic/side counters
are stage-3's business (the small movements here come from heading numerals
leaving the tic-candidate pool).

## Stage 3 — gutter re-seat + Bekker repair (2026-07-07)

`gutter-reseat.ts` + `witness-anchors.ts` per `stage3-spec.md` (dual-design
synthesis). Review fixes on the Codex build: uniqueness gate made airtight
(a garble whose lone decode isn't cadence-expected is never rewritten — no
unlogged edits), spaced VERSO garbles extractable (leading two-token,
digit-guarded). Post-run diagnosis (deep-reasoner, verified) added three
more: (H) division-heading lines never donate their numeral to the gutter
(`parseHeadingResidual` guard — re-padding `CHAPTER 4` had made the
converter eat the 4 as a tic: PA chapters 51→48→51); (A) display-guard
restricted to genuinely tabular residuals (<3 alpha or ≥2 wide runs) —
Lennox justified prose has incidental wide runs on 14.6% of lines vs
Barnes 1.4%, which was the whole PA tic gap; (B1/B2) cadence-state recovery:
state-advance past Tier-2-pending garbled openers (state moves, token
stays raw+logged) and unmarked column rolls for clean low bares.

Grader (post-skeleton → post-gutter):

| counter | PA | APo |
|---|---|---|
| ticsEmitted | 47 → **819** | 83 → **411** |
| ticsSuppressed | 144 → 30 | 89 → 13 |
| side-ambiguous | 92 → **0** | 59 → 1 |
| droppedLines | 44 → 15 | 60 → 43 |
| collapsedPages | 0 | 0 |
| books/chapters | 4/51 intact | 2/53 intact |
| fnUnmatched | 569 → 21 | 292 → 115 |

The residual suppressed counts (30/13) sit in the shadow of Tier-2-pending
garbled openers — the converter can't parse the raw garble we correctly
refused to auto-rewrite; they clear when John's accepted Tier-2 decisions
apply at stage 6. APo droppedLines 43 vs the 5–20 estimate — re-examine at
stage 5 with witness evidence (may be genuine Genie-visible gaps).

## Stage-7 held-out corpus — Apostle, Posterior Analytics (John's description only; files untouched)

John vendored a third, non-Clarendon pair: Apostle's APo — files are in
~/Downloads with "Apostle" in the filenames (per John; not listed, not opened).
Per the held-out protocol we do NOT read, sample, grep, or even `ls` them
before stage 7 — all facts below are John's description (2026-07-07), recorded
so stages 2–5 stay general:

- Rough scan: some pages' Bekker tics are partially CUT OFF; History Genie
  missed some tics entirely; the `$` apparatus encoding is INCONSISTENT —
  witness normalization must handle encodings per-instance, never assume a
  corpus-uniform quirk.
- ALL Bekker tics sit in a VERSO (leading) gutter — no recto pages. Stage-3
  re-seat must not assume alternation (the converter itself is fine with
  one-sided).
- Apostle's chapter headings are BARE NUMERALS (`7`, `31`). Known spec
  collision: ocr-target-format §5 accepts bare centered numerals as chapter
  headings for SINGLE-BOOK works only, and Apostle's APo has two books. If
  config-only fails at stage 7, the general fix candidate is a config-declared
  chapter-style mapping in heading-normalize (bare centered numeral →
  keyword form, Tier 1, logged) — corpus-agnostic because the style comes
  from config.
- Cut-off tics = marks lost by the scan, not by print: cadence repair can
  only fix garbles that are present; wholly missing tics stay as flagged
  droppedLines gaps (witnesses are reflowed and carry no line geometry, so
  they cannot re-seat a tic; at most they corroborate a value).

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
