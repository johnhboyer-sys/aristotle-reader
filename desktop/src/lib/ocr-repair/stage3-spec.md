# Stage-3 spec — gutter re-seat + Bekker digit repair (synthesized)

Synthesis of two independent designs (deep-reasoner, measured on PA first-hand;
Codex gpt-5.5, from pinned facts), 2026-07-07. This is the implementation
contract for `gutter-reseat.ts` + `witness-anchors.ts`.

## Measured grounding (PA stage-2 file; APo re-measure at build time — files
were iCloud-evicted during design)

- PA alternates 58 recto / 58 verso / 1 blank (do NOT rely on alternation —
  the held-out corpus is all-verso).
- Verso defect = body margin: modal first-alpha col 6/5/4/3 per page — all in
  the converter side-decision dead zone [2,7]. Verso tics themselves sit at
  col 0–3. This is the whole side-ambiguous count.
- Recto defect = gap: 502 line-final candidates, 464 with a 1-space gap
  (converter needs ≥4). Start cols 61–78 and scatter ±30 within a page (the
  tic floats with line width). Start col ≥40 is never the problem.
- **Most genuine tics are INVISIBLE, not suppressed**: a <4-space recto gap
  means `ticSpanOnLine` returns null and the tic is counted nowhere. PA has
  ~850 genuine tics (356 verso bares + 397 recto bares + ~100 full-form
  openers) vs 47 currently emitted.
- Full-form garble tally (PA): column `b`→`6` 59×; `a` mostly survives
  (`3`→a 2×); no `h` seen. APo (pinned): a→`3` 33×, b→`6` 18× — the DOMINANT
  confusion flips per corpus, so repair logic tries all classes per instance
  and never assumes a corpus style. Digit confusions inside numbers are the
  stage-2 charset: I/l/|/r→1, O/o→0, S/s→5, Z/z→2.
- Bare cadence clean and dense: 5/10/15… ~6–7 per page side.

## Module shape

```
witness-anchors.ts:
  extractWitnessAnchors(witnessText: string): WitnessAnchor[][]  // per '---' page
gutter-reseat.ts:
  reseatGutter(raw: string, config: CorpusConfig,
               witnessPages?: WitnessAnchor[][]): { text; changes }
```

Pure TS, no fs. CLI loads the witness file and threads anchors in.
`CorpusConfig` gains optional `side?: 'verso' | 'recto' | 'alternating'`
(declared hint for one-sided corpora; default behavior must not need it).

## 1. Relaxed extraction (edge positions only)

Converter gates are TARGETS, not input filters. Own extractor; reuse
`classifyTicToken` only to confirm canonical outputs post-repair.

- Digit class `D=[0-9IlrOoSsZz|]`, column class `C=[abAB36h]`.
- Relaxed full-form: `D{1,4}` + optional ONE internal space + `C` + `D{0,2}`.
  Relaxed bare: `D{1,2}` (value 1–99 after digit-normalize).
- Verso candidate: FIRST non-space token of a line, token start col ≤3,
  followed by non-empty body text. Recto candidate: LAST token (or last
  two-token spaced garble), gap ≥1, start col ≥30, body text before it.
- NEVER mid-line tokens (a number after an internal wide run is diagnostic
  only → flag `midline-candidate`). Excluded lines: the page's first
  non-blank line (running head), lone-integer bottom lines (folios),
  footnote-block lines (identified as in the converter: below the last
  body-blank separator with `N.`-prefix starts), dash-ranges (`9–11`).
- Run BOTH side extractions on every page, side-agnostically.

## 2. Validation = value sequence

Normalize each candidate (digit map + column map 3/h→a, 6→b) into
interpretation SETS: `{kind:'full', page, col, line?}` / `{kind:'bare', n}`.
Clean canonical tokens (per `classifyTicToken`) have a singleton set and are
NEVER rewritten — a clean off-cadence value passes through with flag
`clean-off-cadence` at most.

Running state: `currentColumn`, `lastAccepted (page,col,line)`, seeded from
`config.bekkerStart`, bounded by `config.bekkerEnd`. Full-forms must be
in-range (this kills prose false positives like `15 all…` parsing as page
15 on a 639–697 corpus). Bares must be 1–99, monotonic in the current
column, cadence-shaped (multiples of 5; first mark of a column may sit at
+4/odd offset; page-opening bares inherit the previous page's column).

## 3. Side decision (per page, from evidence)

```
V = validated leading candidates, R = validated trailing candidates
if |R|≥2 and |V|<2 → recto;  if |V|≥2 and |R|<2 → verso
if both ≥2 → longer validated run wins; tie → full-form-bearing side wins;
             still tied → side-conflict: leave page geometry UNTOUCHED,
             emit no tics, Tier-2 'side-conflict' with both runs
if both <2 → sparse page: side = one validated full-form's side if present,
             else inherit last decided side (config.side if never decided);
             flag 'side-inherited-no-tics' when the page had body text
```

No alternation assumption anywhere. After re-layout the converter's own
`decideSide` reads modal indent 0 (recto) / 11 (verso) and agrees — that is
what zeroes side-ambiguous.

## 4. Bekker repair (rule `bekker-digit`)

Expectation: after accepting `639a`, next opener expected `639b`; after
`639b` → `640a`; bares continue the current column at the 5-cadence.

```
cands = all decodings of a GARBLED token (column classes × digit classes ×
        glued/spaced segmentations), range-filtered
repair iff cands ∩ expectedSet == exactly one value
       AND raw was not clean canonical
       AND result is converter-canonical and in range
→ rewrite token to canonical form, Tier-1 record with before/after,
  confusion classes applied, cadence state, witness anchor if one matches
else → leave token, Tier-2 record (kind 'bekker-ambiguous') with candidate
  set + cadence state + nearest witness anchor as evidence
```

Glued (`6456`→645b): column glyph occupies a digit position — try each
segmentation. Spaced (`639 6`→639b, `76 3`→76a): the internal space splits
page from column glyph. NEVER fabricate missing columns: expected `646a` but
next observed opener `648a` → accept it (monotonic, in range), Tier-2
`column-jump:646a→648a`, intervening unresolvable bares stay as genuine
droppedLines.

## 5. Witness anchors (evidence ONLY)

Per witness `---` page, decode PER INSTANCE (encodings vary within one
corpus): `639a` plain, `639^a`, `639$^b$`/`$^{b}$`, `639<sup>a</sup>`,
`639ᵃ/639ᵇ` (also inside `**…**`), column-only continuations (`^b` alone →
inherit page). Output ordered anchors with `ref` (`639a`), `raw`, ordinal,
char offset, a few before/after words (context for stage-5 pairing and
review evidence). Tolerate `--- [blank] ---` dropout pages (zero anchors).
Backbone↔witness pairing for evidence lookup is by Bekker VALUE proximity,
never page index (416 vs 424; 325 vs 354).

## 6. Re-layout (whitespace-only; the only token change is a §4 repair)

Untouched always: running head (first non-blank line, byte-identical),
folios, blank lines. Hyphenated line ends unchanged. Display/tabular lines
move as whole blocks — internal spacing byte-identical (stage 4 owns prose
spacing; a validated-value candidate on a display-shaped residual is NOT
claimed — flag `tic-candidate-on-display-line`).

Verso page: `delta = 11 − modalBodyCol` (page's own modal first-alpha col of
non-head/non-folio/non-tic-residual lines). Every body/footnote line shifts
uniformly by `delta` (preserves paragraph +2..+8 and heading centering
relative to the margin). Tic lines re-emit: canonical tic at col 0 + spaces
so the residual's first char lands at its original col + delta.

Recto page: body already at col 0 — body lines untouched. Per page:
`T = max(40, maxBodyEndAmongTicLines + 4)`. Each tic line re-emits:
rstripped body + spaces to col T + canonical tic. All tic start cols == T →
band MAD 0 → converter band trivially satisfied; if one long line forces T
far right, keep it and flag `long-body-for-recto-tic`.

## 7. Change records

- `tic-reseat`: ONE record per page — `{side, margin:{from,to,delta} |
  {ticCol:T, gap:4}, linesShifted, ticLines:[{lineIdx, oldStartCol,
  newStartCol, raw}], flags}`. (850 per-line records would bury the audit;
  the per-page transform is a single uniform operation and each tic line's
  before/after is embedded.)
- `bekker-digit`: one record per repaired token (Tier 1) or per ambiguous
  garble left in place (Tier 2, `candidates` + `witnessAnchor`, no `after`).
- `flag` records for: `side-conflict`, `side-inherited-no-tics`,
  `column-jump`, `clean-off-cadence`, `midline-candidate`,
  `two-candidates-line`, `tic-candidate-on-display-line`,
  `long-body-for-recto-tic`.

## 8. Expected post-stage-3 counters

PA: ticsEmitted 47 → ~800–850; ticsSuppressed 144 → ~0; side-ambiguous
92 → 0; collapsed 0; droppedLines 44 → ~10–25 (genuine gaps; crude cadence
probe ≈ 12). displayBlocks unchanged (~486, stage-4 property).
APo: emitted 83 → ~450–550; suppressed 89 → ~0; side-ambiguous 59 → 0;
droppedLines 62 → ~5–20. Verify APo by re-measurement at build time.

## 9. Fixtures (synthetic only; converter is the grader where practical)

1. Verso re-margin: body col 6 → 11, tics → col 0, +4 paragraph opening →
   col 15; converter reads side=verso, no side-ambiguous.
2. Recto re-pad: three tic lines of widths 20/45/66, 1-space gaps → all tics
   at one col T, gaps ≥4; converter emits all three, no collapse/band flags.
3. Glued repair `6456`→645b (state 645a); record classes [glued, 6→b].
4. Spaced repairs `639 6`→639b and APo-style `71 3`→71a (opener).
5. Ambiguous garble → unchanged + Tier-2 with synthetic witness anchor
   (`67I$^a$`-style page).
6. All-verso 3-page run, `config.side:'verso'` — no alternation, no flips.
7. Real table rows: shifted by delta, internal spacing byte-identical, not
   claimed as tics, still a display block through the converter.
8. Guards: `25 all…` bare kept only when cadence-consistent; full-form range
   gate rejects out-of-range pages; `So`/`Is` never candidates; folio and
   footnote-block lines never candidates; dash-range rejected.
9. Column jump 645a→648a: no fabrication, Tier-2, bares in the hole become
   droppedLines.
10. Clean off-cadence canonical tic NOT rewritten (flag only).
11. Page-opening bare inherits previous page's column.
12. First non-blank line byte-identical on every page; hyphenated line ends
    unchanged.
13. Witness extractor matrix: `73^a`, `$^b$`, `76$^{b}$`, `<sup>b</sup>`,
    `**639ᵃ**`, bare `^b` continuation, `--- [blank] ---` page → ordered
    refs correct, blank tolerated.
