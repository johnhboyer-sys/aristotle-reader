# Bekker gloss-alignment status — by work & translation

Tracks every translation that has had real Bekker line-ticks placed by the
gloss-aligner ([recipe](gloss-aligner-recipe.md)). The **Review** links open the
per-book HTML pages (Greek window · gloss · translation prose with a ▸ at the placed
offset; Spot-on / Early / Late buttons + JSON export) for works **still awaiting human
verification**. Already-verified, shipped works are kept for the record.

Tick counts are real ticks (`column` + `five_line` tiers); `chapter`/`line`-tier
anchors are structural/interpolated and not counted.

## ⚠ Needs verification

| Work | Translation | Chapters | Real ticks | Confidence | Review |
|------|-------------|---------:|-----------:|------------|--------|
| Meteorology (`Mete`) | E. W. Webster (Oxford, 1923) | 41 | 773 | 773 confirmed | [Bk 1](../alignment-results/webster/review/book-01.html) · [Bk 2](../alignment-results/webster/review/book-02.html) · [Bk 3](../alignment-results/webster/review/book-03.html) · [Bk 4](../alignment-results/webster/review/book-04.html) · [index](../alignment-results/webster/index.html) |
| On Generation and Corruption (`GC`) | H. H. Joachim (Oxford, 1922) | 21 | 362 | 362 confirmed | [Bk 1](../alignment-results/joachim/review/book-01.html) · [Bk 2](../alignment-results/joachim/review/book-02.html) · [index](../alignment-results/joachim/index.html) |
| Sophistical Refutations (`SE`) | W. A. Pickard-Cambridge (Oxford, 1928) | 34 | 316 | 316 confirmed | [Bk 1](../alignment-results/pickard/review/book-01.html) · [index](../alignment-results/pickard/index.html) |
| Categories (`Cat`) | E. M. Edghill (Oxford) — **partial spike** | ch 1–2 only | (not persisted) | n/a | [ch 1–2](../alignment-results/edghill/review/categories-ch1-2.html) |

- **Mete / Webster** — aligned 2026-06-24 (sonnet gloss · opus verify ×1 · **two-tier
  targeted correction**). 773 real ticks, all confirmed; wired via
  `sources/mete-webster/anchors.yaml` (713 anchors, 3 unresolved `357b30`/`368a5`/`368b5`)
  + `anchors:` in `manifests/Mete.yaml`. stage2 PASS, app build clean, 809 prose marks.
  **Targeted correction (new this work):** pass-2 was 65% exact / 86% early-late (Webster
  paraphrases more than Joachim). Instead of a full ~1M-token Opus re-judge, ran a cheap
  Sonnet Tier-1 over all 41 ch → flagged 117 ticks whose phrase moved >30 chars from the
  persisted offset → Opus Tier-2 confirmed only those (109 moves, 85 folded). Result:
  **80% exact, 99% within 30 chars, sentence-misses eliminated** (1 tick >30). Still wants a
  human review pass before shipping live, but materially better than the raw verify output.
- **GC / Joachim** — aligned 2026-06-23 (sonnet gloss · opus verify ×1, schema-judged).
  362 real ticks, all confirmed; wired via `sources/gc-joachim/anchors.yaml` (336 anchors,
  1 unresolved `327a35`) + `anchors:` in `manifests/GC.yaml`. stage2 PASS, app build clean.
  **Correction pass skipped after a 4-chapter sample probe:** the Opus verifier marked ~90%
  early/late, but a sample check showed 82% of pass-2 placements are already exact and the
  early/late verdicts are a `current_placement` lead-in artifact (the judge is shown a clause
  before the true offset). Quality is comparable to Ross-EN; **needs a human review pass**
  (watch for clause-level early drift on the ~18% harder ticks) before promoting to shipped.
- **SE / Pickard-Cambridge** — aligned 2026-06-23 (sonnet gloss · opus verify ×2 + human
  review pass). 100 ticks human-reviewed (60 ok, 24 early, 16 late; 51 word-clicked to pin
  exact phrase). Remaining 216 ticks verified by Opus — **Opus marked 87% early/late on
  the unreviewed chapters, which is high vs the human rate of 40%; the unreviewed chapters
  need a further human pass before shipping.** Phase B wired via
  `sources/sr-pickard/anchors.yaml` + `anchors:` in `manifests/SE.yaml`; not yet committed.
- **Cat / Edghill** — early spike, only Book/ch 1–2 rendered to a review page; no
  persisted map yet. Needs a full run (all chapters) before verification.

## ✅ Verified & shipped live

| Work | Translation | Chapters | Real ticks | Confidence | Review |
|------|-------------|---------:|-----------:|------------|--------|
| Nicomachean Ethics (`EN`) | W. D. Ross (secondary) | 116 | 1293 | 1288 confirmed · 5 uncertain | [Bk 1–10](../alignment-results/ross/review/) |
| Politics (`Pol`) | B. Jowett (public primary) | 102 | 1555 | 1538 confirmed · 13 uncertain · 4 reliable | [Bk 1–8](../alignment-results/jowett/review/) |
| Prior Analytics (`APr`) | A. J. Jenkinson (public primary) | 73 | 791 | 790 confirmed · 1 reliable | [Bk 1](../alignment-results/jenkinson/review/book-01.html) · [Bk 2](../alignment-results/jenkinson/review/book-02.html) · [index](../alignment-results/jenkinson/index.html) |
| Physics (`Phys`) | R. P. Hardie & R. K. Gaye (public primary) | 71 | 1200 | 1199 confirmed · 1 reliable | [index](../alignment-results/hardie/index.html) · Bk [1](../alignment-results/hardie/review/book-01.html) [2](../alignment-results/hardie/review/book-02.html) [3](../alignment-results/hardie/review/book-03.html) [4](../alignment-results/hardie/review/book-04.html) [5](../alignment-results/hardie/review/book-05.html) [6](../alignment-results/hardie/review/book-06.html) [7](../alignment-results/hardie/review/book-07.html) [8](../alignment-results/hardie/review/book-08.html) |
| Poetics (`Poet`) | W. H. Fyfe (Loeb, 1932) — primary | 26 | 233 | 232 confirmed · 1 uncertain | [Bk 1](../alignment-results/fyfe/review/book-01.html) · [index](../alignment-results/fyfe/index.html) |

- **EN / Ross** — every tick read-and-checked (2026-06-17); shipped, reader consumes
  the combined gloss map via `stage1_ross`.
- **Pol / Jowett** — shipped live `d322247` after a 2nd Greek-grounded audit round;
  wired via `sources/pol-jowett/anchors.yaml` (archive primary).
- **APr / Jenkinson** — Phase A aligned 2026-06-21 (sonnet gloss · opus verify; lone
  `reliable` tick `37b20`, Bk 1 ch 18, where Jenkinson condenses the line). Phase B wired
  same day via `sources/apr-jenkinson/anchors.yaml` (774 `chapter`+`five_line` entries,
  generated by `tools/gloss_map_to_anchors.py`) + `anchors:` under `english.primary` in
  `manifests/APr.yaml`. `column`-tier (line-1) ticks are omitted — `add_bekker_gutter`
  pins each column's first line structurally. Build: stage2 PASS, 1 unresolved (`32b40`,
  a column-end straddle → interpolated); gutter renders 858 real vs 5 interpolated ticks.
  Deploys on the next gh-pages push.
- **Phys / Hardie & Gaye** — aligned + reviewed + shipped 2026-06-22 (sonnet gloss · opus
  verify + one opus correction pass; lone `reliable` tick in Bk 7 where the phrase wasn't
  located verbatim). Phase B wired via `sources/phys-hardie/anchors.yaml` (1105
  `chapter`+`five_line` entries from `tools/gloss_map_to_anchors.py`) + `anchors:` under
  `english.primary` in `manifests/Phys.yaml`. Build: stage2 PASS, key_failures=0, 8
  unresolved column-end/`*35` straddles → interpolated; reader gutter renders 1249 real vs
  7 interpolated ticks.
- **Poet / Fyfe** — aligned + human-reviewed + shipped live 2026-06-24 (gh-pages `b6cff15`;
  sonnet gloss · opus verify ×1 + one scoped opus correction pass + 8 word-exact human
  anchor pins). 233 real ticks, **232 confirmed · 1 uncertain** (`1458b10`, ch 22, where Fyfe
  condenses the line). **First gloss-aligned work whose primary was converted from the Perseus
  `perseus_tei` path to archive:** Fyfe's prose was extracted from the eng TEI to
  `sources/poet-fyfe/book-01.html` by `tools/extract_fyfe_poetics.py` (footnotes + Bekker
  milestones stripped, inline Greek kept), and `manifests/Poet.yaml` `english.primary` switched
  to `model: archive` + `anchors: poet-fyfe/anchors.yaml` (231 anchors, **0 unresolved**).
  Reader gutter renders **257 real ticks, 0 interpolated**. NB Fyfe's footnotes are dropped by
  the archive conversion (a content tradeoff vs the old `perseus_tei` build).

## Not gloss-aligned (different method, for completeness)

- **NE / Ostwald** — per-line Bekker gutter comes from the source's inline Bekker markers
  (`stage1_ostwald`), not the gloss-aligner; no review page in this tracker.
  **2026-07-02:** fixed 37 stray page-boundary blank lines in `sources/ostwald/ostwald-ethics.md`
  that rendered as spurious mid-sentence paragraph breaks in the reader (plus one footnote,
  `[^277]`, truncated mid-sentence with its continuation orphaned into the Book VI body text).
  See `ocr_translations/CLAUDE.md` Step 4.4 for the automated scan that should catch this on
  future translations.

## How to verify a work

1. Open each `review/book-NN.html` in a browser.
2. For each tick decide **Spot on** / **Early** (matching content is *after* the ▸) /
   **Late** (it's *before* the ▸); add notes as needed. Verdicts auto-save in the browser.
3. Click **Export JSON** to save the verdicts; the Early/Late ones drive a re-gather +
   re-verify pass on those chapters (`tools/verify_gather.py <book> 4000 <chapters>`).
4. When clean, do Phase B wiring (see each work's note above) + commit/deploy.
