# Handoff to GPT — out-of-fold predictions over the training set

2026-08-14. This supersedes the earlier per-model-CER ask, which is withdrawn
(see MANIFEST.md: the codec question closed without a rerun, and per-model
holdout scores would have turned the holdout into tuning data — your point,
and it was right).

**This is a different job and a much more useful one.**

## Why

The corpus is 5,832 lines across 96 columns. Calamari has read **722** of
them — the holdout. Kraken's audit covers 524 disagreement rows. So roughly
**5,100 lines have exactly one machine reader**, and we have direct evidence
that the corpus carries a systematic, one-directional defect in precisely the
kind of thing a second reader catches:

Measured over John's own rulings on 2026-08-14 —

| the dispute | how he ruled |
|---|---|
| corpus LACKS a mark an engine read | **engine, 18 of 18** |
| corpus HAS a mark no engine read | corpus, 8 of 9 |

By mark: **52 perispomeni, 9 grave, 1 acute**. It is overwhelmingly one
defect — *the corpus drops the circumflex over the ou-ligature `ȣ`* — and
kraken recovers it. Not once has an engine invented a mark he rejected. One
of those rulings was a 46-crop bundle from which he excluded exactly one
site, so it is not rubber-stamping.

If that defect is in the 12% two engines have seen, it is in the 88% they
have not.

## What to run

**Out-of-fold predictions over the 4,693 training lines.**

Your fold configs prove proper 5-fold cross-validation — I checked:
`fold_3.json`'s val set (938) and `fold_4.json`'s val set (938) are disjoint,
and fold 4's val sits **entirely inside** fold 3's train. So every training
line is held out by exactly one model.

That means: for each line, predict it with **the one model that never saw
it**. That is an honest, unbiased second read on all 4,693 lines — no holdout
spent, no circularity, nothing selected.

The five-model vote would not do this. On a training line, four of the five
voters were fitted to reproduce that exact ground truth, so their agreement
with the corpus is memory rather than evidence.

**Also worth having, and cheap: the five-model vote on the same 4,693
lines**, as a second file. It means something *different* and complementary:
where the vote disagrees with the corpus **despite** having memorised it,
that is an unusually strong signal. Where OOF and vote both disagree, that is
the strongest tier we can build.

Rough cost, from your own log (722 lines voted in 78 s CPU): OOF ≈ 2 minutes,
vote ≈ 8 minutes. This is not a two-hour session.

## Output format — already fixed, please match it exactly

`bonitz_pipeline/calamari_score.py` consumes this shape today; matching it
means the results are usable the hour they land.

    <index>\t<prediction>

One line per image. Two files:

    train-oof.tsv     the prediction of the fold that HELD OUT that line
    train-vote.tsv    the five-model vote on the same line

`<index>` is the 5-digit export index — `train/00000.png` is index `0`, and
so on to `04692`.

⚠ **THE INDEX IS POSITIONAL AND IT IS THE ONLY LINK BACK TO THE CORPUS.** The
arrow rows carry `im`, `language`, `text` and nothing else: no page, no line
number. Which page and line an image came from is recoverable *only* from its
position in the export. So:

- every index 0–4692 present, none missing;
- no sorting, no renumbering, no deduplication, no skipping a failed line
  silently — if one fails, emit the index with an empty prediction and say so
  in the report;
- predictions NFC-normalised, as `calamari_export` writes the targets.

For `train-oof.tsv`, also hand back the fold→val-index map you used
(`fold_N.json` → `gen.val.images`), so the out-of-fold claim can be checked
rather than trusted. Five lists, 938-ish each, partitioning 0–4692.

## What NOT to do

- **Do not touch the holdout.** No predictions, no scores, no evaluation. It
  is not part of this job.
- **Do not use any number from this run to choose, drop, retrain or reweight
  a model.** OOF predictions are for finding errors in the *corpus*, not for
  ranking folds. The moment a fold is selected on them they stop being clean.
- Nothing retrained, converted, or overwritten. The five model directories
  and their `.ckpt.json` files stay exactly as they are — the codecs are
  verified correct (all five 245 entries, matching a `logits` layer of 245
  units) and regenerating them would undo that.

## Still open, still not urgent

From the last handoff, worth doing while you are in the studio:

1. **Log the holdout's resolved input path** whenever anything reads it.
   `ensemble5.log` never recorded where the 722 images came from, so "gated
   export or by hand?" is unanswerable from the archive.
2. **Keep the holdout outside the training glob** — beside `bonitz-data/`,
   not inside `bonitz-data/calamari-export/`. The guard that would refuse a
   held-out column in a training set is local code on John's Mac; it cannot
   see files on a studio.

## What happens on this side

I build the ingest against the format above: join by export index to
`column:line_id` (the same verified positional join `calamari_score` already
does for the holdout, which raises rather than guesses if the arrow text and
the gt XML disagree), diff against `work/reconciled`, and tier the
disagreements — OOF-only, vote-only, both. Those become audit cards, split
one question per card and bundled where the same substitution repeats.

John's queue currently stands at 120 unruled cards. A second engine over
5,100 unread lines will add to that, so he decides when it lands, not me.
