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

John vendored a third, non-Clarendon pair: Apostle's APo — files have
"Apostle" in the filenames and were originally in ~/Downloads; **John moved
Downloads' contents into iCloud (2026-07-07)**, so at stage 7 fetch them from
iCloud Drive (they may be dataless stubs locally — `brctl download` first, or
ask John to re-stage them). Not listed, not opened.
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

## Stage 4 — prose spacing normalization (2026-07-07)

`spacing.ts` per stage4-spec.md. Grader: ONLY displayBlocks moved —
PA 468 → 3, APo 7 → 2 (everything else byte-stable vs stage 3, asserted by
the delta printer). Survivors = the 5 enumerated hand-check items (PA p33
leaked furniture pair, p54/p94 BOOK headings w/ trailing bare page numbers;
APo p29/p51 centered bare chapter numerals — converter refuses bare-numeral
chapters in multi-book works). 51 tests green; pdf-import zero-diff.
`config.preserveDisplayLines` escape added for a hypothetical high-alpha
real table (none exist in PA/APo; Apostle contingency).

## Stage 5 — Tier-2 proposal audit + run-pairing fix (2026-07-08)

John spot-checked the review page 2-for-2 wrong → full Opus audit: 12/48
proposals (25%) wrong or junk. Root causes fixed: (1) footnote-marker digits
paired with footnote Greek (≥2-letter garble gate, subsumed by content-token
filtering); (2) multi-token Greek runs paired off-by-one (adjacent-pair →
REGION WALK: contiguous garble-run vs clean-Greek-run, equal content-token
counts → per-token records grouped as one run pattern; mismatches →
'greek-run-unpaired' diagnostics); (3) Genie markup (*…*/$…$/<sup>) could
enter proposals/edits — stripped everywhere; (4) checked gap-records were
never wired into edits — apply now works. Discovery: ALL APo body Greek is
Barnes's own translator footnotes (MS-reading notes); the proposals are
de-garbles of footnote Greek, zero edition disagreements. Post-fix: APo 85
greek + 2 diacritic proposals in 68 review groups, ZERO wrong per audit;
13 unpairable → diagnostics; PA just the 66Ia→661a opener. 73 tests green.

## Stage 6 — decisions applied, final grade (2026-07-08)

John approved ALL 68 APo groups + PA 661a ("approve all and proceed");
decision files preserved as review-*-decided-2026-07-08.md. Apply run:
APo fnUnmatched 115→105 (repaired footnote Greek parses as notes), PA 21→20
+ 661a opener in text. Final grader state:
PA: 838 tics / 30 suppressed (cadence noise) / 16 dropped / 0 side-amb /
4 books/51 chapters / 3 display / seams 0.
APo: 411 / 13 / 43 (all markerLost) / 1 / 2/53 / 2 / 0.
Import files: ~/Documents/aristotle-ocr/<corpus>/FINAL-<corpus>-import.txt.
Remaining stage-6 work: John imports both in the desktop app + hand-verifies
(Reeve-NE bar), then stage 7 (Apostle, held-out).

## Stage-6 fix batch landed (2026-07-08)

All four read-through classes implemented (stage6-fixes-spec.md), 84 tests.
Full reruns w/ decisions: APo tics 453 / dropped 60→1 / fnNotes 0→36 /
fnUnmatched 61 / display 1. PA tics 861 / suppressed 15 / dropped 15 /
stage-6 no-op held (0 records). OPEN: fnNotes 36 vs design's 49 (head-pass
gap); PA dropped 15 vs static prediction 2 (new column context exposes more
holes — re-diagnose); paragraph cards now in regenerated review files
awaiting John's second sitting (dual-blank pre-checked).

## Stage 6 COMPLETE — John's decisions applied, final grade (2026-07-08, pre-wipe)

Second sitting applied: all paragraph batches both corpora + John's 7 spot
decisions (2 PA + 5 APo), each verified as a real paragraph in the frozen
converter's tagged output. New decisions-file directives: `EXCLUDE <id>`
(per-record excision from an approved batch) and `BREAK p<N>-L<M>`
(John-mandated manual paragraph break, support 'john-manual') — used for
APo #120 where a jitter snap would have flattened a print-verified break.

FINAL grades: PA 888 tics / 7 suppressed / 2 dropped (both genuine) /
3 display / 0 side-amb / 4 books 51 chapters 20 titled.
APo 453 / 14 / 1 / 1 / 1 / 2 books 53 chapters 14 titled / 52 notes
(scope per-book) 41 unmatched (mostly pre-existing converter furniture
artifact). Import files: FINAL-<corpus>-import.txt in each corpus dir.

REMAINING (post-wipe): John imports+hand-verifies both books (stage-6 human
half; prior read-through defects all fixed); then stage 7 Apostle (files in
iCloud, "Apostle" in names, still NEVER opened) config-only neutrality gate;
then PR. Improvement queued: short-previous-line as backbone-side paragraph
evidence (John's insight) — would upgrade many page-top cases to dual.

## Page-top paragraph gate (2026-07-09, post-restore)

John's first PA read-through hit a mid-sentence paragraph break at 639b25
("present in the | eternal things") — record p2-L2-c0-1, support page-top.
Root cause: at page tops the witness paragraph evidence is confounded (the
reflowed Genie routinely opens a fresh paragraph at print page turns), and
the page-top insert rule required nothing else. Measured against the
backbone's own cross-seam evidence: PA 70/85 page-top inserts provably false
(previous page's last body line ends mid-sentence), APo 23/57.

Fix (vote.ts `pageTopSupport`, John-approved): page-top insert candidates now
gate on the previous page's last body line — mid-sentence → candidate killed
outright; sentence-final AND short of the page's body width (John's queued
short-previous-line insight, promoted) → new support `page-top-dual`,
rendered pre-checked; sentence-final at full width → stays `page-top`,
unchecked ambiguous card. Distribution after fix: PA 8 dual + 7 ambiguous,
APo 26 dual + 8 ambiguous. 94 tests green; pdf-import zero-diff.

Decisions lineage: `review-<corpus>-decided-2026-07-09.md` = the 07-08b file
with the page-top batch unchecked + `page-top-dual` batch checked
(EXCLUDE/BREAK directives preserved). FINAL-<corpus>-import.txt re-cut
(= copy of stages/stage6-footnotes.txt — note the CLI does not write FINAL;
cutting it is a manual cp). Final grades identical to the pinned tables
except APo titled 14→13: the removed false indent right after Book 2
CHAPTER 15 had been read by the converter as a spurious chapter title —
13 is correct. The 15 ambiguous page-top cards await John's per-instance
decisions (apply = check them in a decisions file and re-run stage 5–6).

Post-wipe restore facts (same session): full corpus state recovered from
John's flash drive; old-code rerun with the 07-08b decisions reproduced both
pre-wipe FINALs byte-identical (stage6-footnotes.txt vs drive FINAL).

## Fix batch 2 — John's PA/APo read-through (2026-07-09)

Eight classes per stage6-fixes-2-spec.md, all landed in one pass (Codex was
down post-wipe — see below — so implemented directly):

- **A/B wrap-joins** (`wrap-join` rule, new): witness-arbitrated line-wrap
  rejoins. Tier-1 applied: PA 29 compounds + 6 dash joints, APo 5 + 9 (2
  safely refused: shape/geometry). 33 ambiguous → 'Line-wrap diagnostics'.
  Regression caught in first run: slicing w2 out of a tic-bearing line
  shifted the recto tic column (dropped 662b10/681b10) — removal now goes
  through replaceInLine, which re-pads the tic to its original column.
- **C/D page-top jitter + footnote-aware cross-seam evidence**: jitter/
  under-indent branches use the previous page's last TEXT line at page tops;
  `lastTextBody` sheds trailing apparatus (gap+bare-note-head lines AND
  deep-indented note text ≥ modal+6 — Barnes prints a lone marker digit then
  the note at col ~20, which the note-head regex alone can't see). John's
  73a20 `opposites` now snaps to margin. Page-top verdicts re-derived under
  the better evidence: PA 1 dual + 6 ambiguous, APo 10 dual + 3 ambiguous.
- **E chapter-first lines**: config `chapterTitles` (default false) → stage-4
  de-indent of the first body line after BOOK/CHAPTER (13 PA + 8 APo), plus
  stage-5 never INSERTS on a division-first line (this also collapsed the
  contaminated dual-blank batch: PA 17→1, APo 61→41 — most were chapter-first
  title bait). **divisions.titled → 0 for BOTH corpora; the 33 relocated
  body lines are back in the stream.**
- **F bottom-folio strip** (skeleton, after folio repair): cadence-consistent
  bottom page numbers removed outright — 90 PA + 62 APo; kills the ~23
  numbers the converter was gluing into Barnes prose ("many terms 31 are
  predicated"). APo fnUnmatched 41→14 (page numbers had polluted the count).
- **G aligner snap** (app-side, `snapWordImport` in import-align.ts; engine.ts
  untouched, parity-locked): paragraph-boundary tags snap FORWARD; candidates
  never cross '\n'. Fixes stored 83b1→"truly."-class anchors (240 paragraph-
  start tags across the two books).
- **H reader tick attachment** (Reader.svelte `attachTicks`): ticks render
  nested as the first child of the FOLLOWING text run, pinning their static
  position to the line they mark (a standalone absolute tick attaches to the
  END of the previous rendered line — John's width-invariant 83a20/25). Also
  restores `.para-br + .bk-seg` paragraph indents when a tick lands on a
  paragraph start. Offset walkers exclude .bk-num via closest() — depth-safe.
  Functionally verified in the browser: DA book 1, 134/134 ticks nested,
  0 misattached.

FINAL grades: PA 888/7/2 dropped (both genuine)/3 display/0 side-amb,
4bk/51ch/**0 titled**; APo 453/14/1/1/1, 2bk/53ch/**0 titled**, 52 notes /
**14 unmatched** (was 41). 98 ocr-repair + 230 desktop + 69 app tests green;
pdf-import zero-diff. Decisions: review-<corpus>-decided-2026-07-09.md
(= 07-08b minus page-top batch + page-top-dual checked); FINALs re-cut.

AWAITING JOHN: re-import both books; 9 ambiguous page-top cards (6 PA + 3
APo) + 33 wrap diagnostics in the regenerated review files.

KNOWN pre-existing (NOT batch-2, confirmed present in the 07-08 FINAL too):
dashRestorationAfter mis-seats a restored em-dash inside a token containing
an apostrophe — PA has `'rock plant—'-it` (should be `'rock plant'—it`).
Letters-count insertion ignores non-letters. Candidate class I for a next
batch.

Codex post-wipe: gpt-5.6-terra (John's "GPT 5.6", config default) is
code-mode-only and /opt/homebrew/bin/codex-code-mode-host is missing → codex
exec can't run ANY command. Fix is John's one-liner:
`ln -s "/Applications/ChatGPT.app/Contents/Resources/codex-code-mode-host" /opt/homebrew/bin/codex-code-mode-host`

## Batch-2 adversarial review (Codex gpt-5.6-terra, 2026-07-09)

Nine findings; each verified by hand before acting. Fixed: (1) cross-page
wraps now emit Tier-2 'wrap-cross-page' cards per the spec — found exactly 2:
PA `four-|footed` (REAL compound gluing to "fourfooted" at a page seam,
awaiting John) + APo `l-|first?` (OCR junk, correctly parked); (2)
`record.before` refreshed at apply time when a respell already restored the
dash; (3) preserveDisplayLines no longer skew the stage-4 modal margin; (4)
bottom-folio strip requires ≥2 cadence candidates (never strips on singleton
evidence); (5) Reader attachTicks hops over a single paragraph-break part so
a boundary-coincident tick attaches to the paragraph OPENER (browser-verified:
DA 134/134 nested, NE 130/133 nested + 3 flow-final standalone by design,
0 misattached, paragraph indents intact).

Declined as moot (documented): "CHAPTER as a page's first non-blank line"
shapes (stage-2 head-insert guarantees a running head on every page, and the
frozen converter eats line 1 regardless); notes-only-page modal pollution in
lastTextBody (no such pages in these corpora; affects only cross-seam
evidence quality); sparse-page chapter-first deindent when the opener is the
page's ONLY prose line (no margin evidence exists to re-seat against —
empirically zero: titled is 0/0). Re-entrancy of wrap classification with
same-token respells: a miss degrades to a logged skip flag, never a wrong
edit. Grades after all review fixes: byte-stable vs the batch-2 run.

## Class J — footnote marker orphaned at line wraps (2026-07-09)

John's read-through, APo 72a10: "pair, | ¹ one thing" — the superscript
wrapped alone. Backbone/FINAL are correct ("pair,1" glued); the reader's
marker is a <button> (an atomic inline box), and engines — WKWebView
especially — may take the break opportunity at an atomic inline's edge even
with no space. Fix: renderThird wraps the marker AND its preceding word run
in <span class="fn-anchor"> (white-space: nowrap); the capture stops at
whitespace/tag-brackets/entities so it can never swallow highlightEng
markup. Reader-side only — no re-import needed. Browser-verified: 48/48
Ostwald markers anchored, zero orphans under a forced 240px measure.
Offset walkers unaffected (they exclude .fn-marker by closest(); the
anchor span's own text is body text and still counts).
