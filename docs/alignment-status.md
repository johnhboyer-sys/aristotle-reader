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
| Prior Analytics (`APr`) | A. J. Jenkinson (Oxford, 1928) | 73 | 791 | 790 confirmed · 1 reliable | [Bk 1](../alignment-results/jenkinson/review/book-01.html) · [Bk 2](../alignment-results/jenkinson/review/book-02.html) · [index](../alignment-results/jenkinson/index.html) |
| Categories (`Cat`) | E. M. Edghill (Oxford) — **partial spike** | ch 1–2 only | (not persisted) | n/a | [ch 1–2](../alignment-results/edghill/review/categories-ch1-2.html) |

- **APr / Jenkinson** — Phase A complete (2026-06-21), not yet wired into the site or
  committed-to-live. Glossing = sonnet sub-agents (std logic terminology); verification
  = opus sub-agents. The lone `reliable` tick is `37b20` (Bk 1 ch 18 — Jenkinson
  condenses that line, so it kept its lexical placement). 0 non-monotonic offsets; every
  confirmed phrase found verbatim. After verification, wire via the **anchors.yaml**
  route (archive-primary work, like Pol/Jowett): convert `build/align/verify_out/APr/*.json`
  → `sources/apr-jenkinson/anchors.yaml`, add `anchors:` under `english.primary` in
  `manifests/APr.yaml`, then rebuild.
- **Cat / Edghill** — early spike, only Book/ch 1–2 rendered to a review page; no
  persisted map yet. Needs a full run (all chapters) before verification.

## ✅ Verified & shipped live

| Work | Translation | Chapters | Real ticks | Confidence | Review |
|------|-------------|---------:|-----------:|------------|--------|
| Nicomachean Ethics (`EN`) | W. D. Ross (secondary) | 116 | 1293 | 1288 confirmed · 5 uncertain | [Bk 1–10](../alignment-results/ross/review/) |
| Politics (`Pol`) | B. Jowett (public primary) | 102 | 1555 | 1538 confirmed · 13 uncertain · 4 reliable | [Bk 1–8](../alignment-results/jowett/review/) |

- **EN / Ross** — every tick read-and-checked (2026-06-17); shipped, reader consumes
  the combined gloss map via `stage1_ross`.
- **Pol / Jowett** — shipped live `d322247` after a 2nd Greek-grounded audit round;
  wired via `sources/pol-jowett/anchors.yaml` (archive primary).

## Not gloss-aligned (different method, for completeness)

- **NE / Ostwald** — per-line Bekker gutter comes from the source's inline Bekker markers
  (`stage1_ostwald`), not the gloss-aligner; no review page in this tracker.

## How to verify a work

1. Open each `review/book-NN.html` in a browser.
2. For each tick decide **Spot on** / **Early** (matching content is *after* the ▸) /
   **Late** (it's *before* the ▸); add notes as needed. Verdicts auto-save in the browser.
3. Click **Export JSON** to save the verdicts; the Early/Late ones drive a re-gather +
   re-verify pass on those chapters (`tools/verify_gather.py <book> 4000 <chapters>`).
4. When clean, do Phase B wiring (see each work's note above) + commit/deploy.
