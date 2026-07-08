# Stage-5 spec — witness alignment + token vote (pre-verified 2026-07-07)

All numbers measured on the real stage-4 files. Grader sees ~nothing move:
deliverables are the change-list, review file, pairing report, dropped report.
Modules (pure TS, no fs): witness-pairing.ts, align.ts, vote.ts, review.ts.

## Headline measurements (drive the design)

- ZERO genuine word-identity disagreements in both corpora (99.2% tokens match).
- Em-dash restore: 147 PA / 147 APo — Adobe DELETED dashes (backbone has zero
  `—`/`–`/`--`); witness sets them CLOSED (`things—whenever`). Norm-stripped,
  they align 1:1 to a single backbone token (`thingswhenever`) → insertion is
  a re-spelling WITHIN a matched token → Tier 1.
- Spaced dashes (0 PA / 42 APo, `case — e`): restoring would ADD a token →
  Tier-2 diagnostic, never applied. INVARIANT (code assertion): whitespace-
  token count and line-break count per edited line unchanged; any Tier-1
  candidate failing it demotes to Tier-2 diagnostic (kills `t he`→`the` too).
- Ligature: 0/0 (pdftotext decomposed them) — rule kept for Apostle.
- Diacritic/macron (`mekon`→`mēkōn`): 8 PA → Tier 2. Greek-script gap pairs:
  ~100 APo / 0 PA → Tier 2 grouped. Punct-only (102/377) + case-only: IGNORED
  (no records; one aggregate counter) — backbone authoritative.
- Stage-3 fold-in: the 30/13 suppressed are non-monotonic(6/2)+unmarked-roll
  (24/11) interior-marker cadence noise, NOT pending openers. Exactly 1 real
  bekker-ambiguous: PA `66Ia`→661a (id p46-L6-c66-1, witness 661a). Fold
  stage-3 bekker-ambiguous records into the review file.
- droppedLines: PA 15/15, APo 43/43 are `dropped-line:*` interior line-marker
  losses with witness-confirmed complete columns → class 'markerLost'; zero
  genuine print gaps. Classifier: 'genuineGap' only when the column is absent
  in the witness (Apostle contingency). Report reports/stage5-dropped.json.

## 1. Pairing (witness-pairing.ts)

Do NOT feed raw extractWitnessAnchors into pairing (evidence-grade; PA
'pages 1–1999'; commentary heads carry in-range refs). Segment the witness
into [front|body|back] first:
- commentaryIdx = first witness page whose first non-empty line matches
  /^COMMENTARY\b/ — exclude ≥ it.
- bodyLo = first i < commentaryIdx whose HEAD decodes to an in-range Bekker
  ref AND ≥4 of pages i..i+4 also do (density gate vs front-matter heads).
- Head-ref decoder = witness-anchors decoding on the head line only; extend
  for `**71<sup>b</sup>**`, `81ª`/`83ᵃ`, TRANSLATION/BOOK/title contexts.
Backbone page span = ordered canonical in-range full tics per \f page.
Pair monotonically on Bekker column value: witness body pages whose head-ref
∈ span (+neighbors as alignment window); no-tic backbone pages interpolate.
Measured: PA window ≈[17..135], 1:1≈101, 1:2≈4, interpolated 9; APo
≈[30..133], 1:1≈43, 1:2≈12, interpolated 17, 1 blank dropout →
no-witness-span. Report reports/stage5-pairing.{json,md}: window+method,
counts, ordered map rows {backbonePage, bekkerSpan, witnessPages,
witnessHeadRefs, pairKind}, no-witness-span list. Emitted BEFORE votes.

## 2. Alignment (align.ts)

Anchored GLOBAL alignment, not per-page-boundary (columns start mid-page;
naive per-page LCS matched only 76% APo): concatenate body tokens (backbone
with {page,line,col} provenance) and body-window witness tokens; hard sync
at Bekker column openers; LCS within each opener→opener segment (~150–380
tokens). Normalization for MATCHING: NFD → strip combining marks → lowercase
→ strip \P{L}; pure-punct tokens drop from match stream (retained raw). RAW
forms vote. Output AlignOp[] {t:'match'|'aOnly'|'bOnly', aRaw?, bRaw?, aProv?}.

## 3. Vote (vote.ts) — vote(backbone, witness, config, decisions?)

On match ops (aRaw≠bRaw), in order:
1. emdash-restore T1: bRaw has interior —/–, aRaw dashless, norm-equal,
   insert keeps one token → rewrite; evidence {witnessRef, dashChar}.
2. ligature T1: norm-equal ﬁﬂﬀﬃﬄ/broken-fi restore.
3. word-identity T2 (record only): hasGreek (/[Ͱ-Ͽἀ-῿]/) or hasDiacritic
   (changes under NFD-strip) or norm differs; before/after + evidence.
4. punct/case-only: no record; aggregate punctCaseDiffs counter.
Gap ops: 5. bOnly Greek adjacent to aOnly gibberish → paired T2 word-identity
{witnessGreek:true}. 6. standalone bOnly dash → flag 'spaced-dash-diagnostic'.
7. other runs → flag 'alignment-gap'.
Tic-line edits re-emit via the stage-4 recto re-pad reassembly (fixed tic
col); if +1 char would hit the tic col → byte-identical + flag
'emdash-skipped-geometry'. Paragraph-break diff vs witness → T2 diagnostics
only (spurious-break class structurally impossible: stage 5 inserts interior
chars only). Assertions: token count + line breaks per edited line, \f count,
running heads byte-identical.

## 4. Review file (review.ts) + apply

review-<corpus>.md: groups by before→after pattern, sorted count desc,
checkbox per group, ±1 backbone line context per instance, stable ids =
changeRecord ids. Sections: Bekker openers (stage-3 fold-in), diacritic,
Greek, spaced-dash/alignment-gap diagnostics (unchecked default), paragraph
diagnostics. renderReview(model), parseDecisions(md) reads `[x]`.
Apply: vote(..., decisions) re-runs and applies checked patterns with the
same geometry-preserving re-emit + invariant assertions; resolves the PA
66Ia→661a opener. Writes stages/stage5-vote.txt + changes-stage5.jsonl.

## 5. CLI

Stage 5 in STAGES: thread witnessText (already read for stage 3); add
--decisions <file>. Outputs: stage5-vote.txt, stage5-pairing.{json,md},
stage5-dropped.json, changes-stage5.jsonl, review-<corpus>.md (outDir root).

## Expected counters (assert)

Byte-stable vs stage 4 except ~147/147 interior `—` insertions: tics 819/411,
suppressed 30/13, dropped 15/43, side-amb 0/1, divisions 4/51+2/53,
displayBlocks 3/2 all UNCHANGED.

## Fixtures (synthetic)

1. Closed em-dash within-token insert; on a recto tic line, tic col preserved.
2. Spaced dash → no edit, diagnostic (token-count guard).
3. Macron → T2, not applied. 4. Greek gap pair → T2 grouped.
5. Punct-only/case-only → no records. 6. Pairing: COMMENTARY stop, density
gate, blank dropout, 1:2 span, interpolated no-tic page.
7. `t`+`he`→`the` merge refused. 8. Apply: checked macron group + 66Ia→661a
→ both applied, geometry intact. 9. Review render/parse round-trip.
10. dropped classifier: markerLost vs synthetic genuineGap.
