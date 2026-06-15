# Translation aligner

Maps an unmarked translation (e.g. Ross 1925) onto the Greek spine, so any
Bekker citation resolves to a position in that translation. The translation is
never mutated — this produces a standoff **alignment map** of
`{citation, offset, tier, confidence}` records.

## Approach (option 2: Rackham as reference)

The build spec's default engine translates each Greek chunk with the Claude API
("translate-then-match"). We instead use the **already spine-anchored Rackham
translation as the reference**, because for the NE it's free accuracy and needs
no API key:

1. **Chapter-scoped.** Chapter boundaries are clean sentences in both
   languages, so each chapter aligns independently (drift can't cross chapters).
   Ross is already split by chapter (it prints chapter numbers); Rackham is
   split at its `section` markers.
2. **Match incipits, not spans.** Each Rackham real Bekker anchor (column start
   = line 1, and ~line 20 — the only points Rackham itself is anchored) is
   fingerprinted by its *incipit* (the text right after it). A monotonic DP over
   the cosine matrix maps each incipit to the Ross sentence that begins the same
   content. Confidence = cosine margin (best − second-best).
3. **Interpolate single lines** within each anchor pair by cumulative Greek
   word-count (labelled `interpolated`, never model-placed).

### Granularity ceiling

Solid anchors at the **chapter** and **column / half-column** tiers; single
lines interpolated. Matching Ross against Rackham can be no finer than Rackham's
own anchoring (column start + line 20). The per-5-line tier in the spec needs
from-Greek glosses (the API path) — swap the reference provider for that.

## Similarity backends

Both sides are English, so a zero-dependency **lexical** (TF-IDF cosine) backend
already aligns well and is the default. `sentence-transformers` is optional
(`--backend fast|quality`, imported lazily) for marginal cases.

## Usage

```bash
cd pipeline
python -m aristotle_pipeline.align --books 1            # align Ross, Book 1
python -m aristotle_pipeline.align                      # whole corpus
python -m aristotle_pipeline.align --eval               # offset-error harness
python -m aristotle_pipeline.align --backend quality    # use mpnet embeddings
```

Output → `build/align/<work>_<version>_map.json` (the alignment map) and
`build/align/<work>_<version>_review.json` (flagged anchors with context).

### Eval

Ross has no gold anchors, so the harness treats **Rackham** as the unmarked
target, realigns its own anchor incipits, and reports offset error per tier — an
upper bound on accuracy and a regression guard. Current (lexical, full corpus):
chapter ≈ 7 chars mean (100/114 exact), column / half-column ≈ 55 chars median.
The column/half-column residual is fundamental: those Bekker lines fall
mid-sentence, so snapping to a sentence boundary costs up to half a sentence —
which is why single lines are interpolated rather than placed.
