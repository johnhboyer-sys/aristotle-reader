# UGARIT word-aligner spike — 2026-07-31

Can an open Ancient-Greek word-alignment model place our Bekker line-ticks, and
replace the Sonnet-gloss + Opus-verify pipeline described in
[gloss-aligner-recipe.md](gloss-aligner-recipe.md)?

**Verdict: no, but it beats the interpolated fallback 2–4×.** It cannot locate a
passage; it only sharpens a position that proportional interpolation already
supplies. Useful for translations that have no anchors file at all — not a
replacement for the gloss pipeline on anything we intend to ship.

Harness: [`pipeline/tools/ugarit_align.py`](../pipeline/tools/ugarit_align.py).

## What it is

- **Model** — [`UGARIT/grc-alignment`](https://huggingface.co/UGARIT/grc-alignment),
  XLM-RoBERTa fine-tuned on 12M monolingual Ancient Greek tokens plus 45k parallel
  sentences (32.5k grc–eng), by Tariq Yousef / Leipzig. **CC-BY-4.0**, so
  attribution is required on anything derived from it. Reported AER 19.73% for
  grc–eng. Last touched 2023.
- **Method** — IterMax (Jalili Sabet et al. 2020) over cosine similarity of layer-9
  subword embeddings. The tool reimplements the ~50 lines it needs rather than
  depending on the archived `simalign` package.
- **Also from the same group, unused so far** — `UGARIT/grc-ner-bert` and
  `grc-ner-xlmr` (Ancient Greek named-entity recognition), CC-BY-SA grc–eng
  alignment gold standards, and a live manual alignment editor at
  `ugarit.ialigner.com`. The public auto-aligner at `ugarit-aligner.com` is a
  5-sentence / 50-token demo with a broken certificate — the model is the usable part.

## Results

Scored against `sources/<dir>/anchors.yaml`, with proportional interpolation as
the control (what the reader falls back to when a work has no anchors). Whole
works run in **20–60 seconds** on an M-series GPU, at zero token cost.

| | Poet / Fyfe (230 ticks) | HA Bk 1 / Thompson (154) | DA / Smith (420) |
|---|---|---|---|
| median error | **15c** (interp 31c) | **18c** (interp 66c) | 31c (interp 63c) |
| within 30 chars | **71.7%** (49.1%) | **61.7%** (26.6%) | 49.5% (27.1%) |
| within 60 chars | **87.8%** (74.8%) | **81.8%** (48.7%) | 70.0% (48.8%) |
| beats interpolation | 67.4% of ticks | 77.3% | 71.7% |

For scale, the gloss pipeline on Mete/Webster after its two-tier correction was
80% exact and 99% within 30 chars. This is below that everywhere.

**Answer-key caveat.** None of these keys is gold. Per
[alignment-status.md](alignment-status.md), no human verdict export survives for
any work — DA/Smith's key in particular is unreviewed Opus output, which is the
likely reason it scores worst. Poet/Fyfe is the closest thing to ground truth
(shipped, and the only work with a committed human correction, `63d41aa2`).
Read these as agreement with existing anchors, not as accuracy.

## The finding that decides it

Widening `--margin`, the English search slack in words, degrades accuracy
monotonically and steeply:

| margin | Poet median | HA Bk 1 median |
|---:|---:|---:|
| 15 | 15c | 18c |
| 30 | 19c | 24c |
| 60 | 30c | 45c |
| 150 | 92c | 130c |
| 300 | 294c | 708c |

At ±300 words on HA it is worse than doing nothing. The model is not finding the
passage — it is refining a position proportional interpolation hands it. Since
locating the passage is the whole problem the gloss pipeline solves, this cannot
replace it.

Tuning note: layer 9 is load-bearing. SimAlign's default layer 8 scored *worse*
than interpolation (median 82c on DA); layer 11 was also worse. Tuned on DA, it
transferred cleanly to both other works, so it doesn't look overfit.

## Where it could pay off

1. **Unanchored translations** — works on `model: archive` with no anchors file
   run on pure interpolation today (DA's Wallace secondary, for one). For those
   this is a 2–4× improvement for under a minute of compute and no tokens.
2. **Seeding the gloss pipeline** — handing the Opus verify pass a start point
   15–18 chars off instead of 31–66 might cut real work out of aligning a new
   translation. **Untested.**

Not worth pursuing: replacing the gloss pipeline, or improving existing
hand-checked ticks.

## Reproducing

```bash
cd pipeline && uv sync --extra ugarit
uv run python tools/ugarit_align.py Poet poet-fyfe 1 --device mps
uv run python tools/ugarit_align.py HA ha-thompson 9 --book 1 --device mps
uv run python tools/ugarit_align.py HA ha-thompson 9 --book 1 --margin 150  # the degradation
```

The model (~1.1GB) downloads from HuggingFace on first run.
