# Calamari five-model ensemble — 2026-08-14

The models themselves are **not in this repository**. 71 MB of TensorFlow
SavedModels is exactly the dead build output that put 920 MB of history into
this repo once already, and they are reproducible from the training data.
What is here is the evidence: what was claimed, what was checked, and the
digests that say the store on disk is the archive that arrived.

    models   ~/Developer/bonitz-models/ensemble5-2026-08-14/
    arrived  ~/Downloads/bonitz-ensemble5-final-2026-08-14.tar.gz
             sha256 1351bc690949f43ba2e27f34aa4f91c153dd4989d706facb6890c725f0
                    78e5f4

`SHA256SUMS` in this directory is a copy of the one written beside the models;
`shasum -a 256 -c SHA256SUMS` inside the store checks all 45 files.

## What GPT reported

Five-model voted ensemble, `best_models/0.ckpt` … `4.ckpt`, each with its
matching `.ckpt.json`. calamari-ocr 2.3.1, ocrd-fork-tfaip 1.2.7, Python 3.11.
Models 3 and 4 carry "restored character maps copied from the matching shared
fold vocabulary". Holdout: 722 line images, 37,527 characters, 306 errors,
CER 0.82%.

> "Please inspect the archive before changing anything. Preserve the five
> model directories and their matching .ckpt.json files. Tell me what you plan
> to do before retraining, converting, or overwriting any model."

Nothing has been retrained, converted or overwritten. The archive was
extracted verbatim, AppleDouble entries and all.

## What was checked, and holds

**The numbers are exactly as reported.** `ensemble5.log`: mean normalized
label error rate 0.82%, 306 errors, 37,527 total chars, 308 sync errs, and
`0/722 lines could not be matched during the evaluation` — nothing was
silently dropped from the denominator.

**It is our holdout.** 722 lines, and `work/calamari/run1-96px-holdout_
predictions.tsv` is 722 rows with no header. Same set, line for line.

**The restored character maps are benign.** All five codecs are
byte-identical — the same 245 characters in the same order, one sha across
`0.ckpt.json` … `4.ckpt.json`. Calamari's cross-fold training shares one
codec, so "copied from the shared fold vocabulary" is the ordinary thing
rather than a repair that might have guessed. The `.before-codec-fix` and
`.before-normalization` snapshots of models 3 and 4 have **no codec block at
all**: that was the broken state, and it is genuinely mended. Do not
regenerate these JSON files.

**The folds did not train on the holdout.** `fold_3.json` and `fold_4.json`
both draw 3,755 training and 938 validation images, every one of them from
`calamari-export/train/`. No holdout path appears in either config.

## The codec question, settled without a rerun

The one real doubt was models 3 and 4, whose `.ckpt.json` had to be repaired:
if the restored character map did not match the output layer it was restored
onto, every prediction would be systematically mislabelled and a voted number
could not show it.

It matches. Every model's output layer is a Dense named `logits` with
**units = 245**, and every codec is **245 entries with the CTC blank at index
0**. Output width equals codec length on all five, and the five codecs are
byte-identical. A foreign or wrong-size vocabulary cannot fit that. Read
straight out of `keras_metadata.pb` and the JSON — no TensorFlow, no rerun.

    for i in 0 1 2 3 4; do strings $i.ckpt/keras_metadata.pb \
      | grep -o '"name": "logits"[^}]*"units": [0-9]*'; done

Model 3 has a further check the others lack: its `.before-restore` charset is
**identical to the live one**, so the restore reproduced what normalization
had dropped rather than guessing at it.

## Why there is no per-model CER, deliberately

GPT, 2026-08-14, and it is right on both counts:

> "Per-model CER would tell us whether one fold is weaker than the others.
> That is useful diagnosis, but it is not required to validate the ensemble
> result or call it a five-model ensemble. All five models loaded and took
> part in the vote."
>
> "We should not use per-model holdout scores to choose or remove a model,
> because that would turn the holdout into tuning data."

⚠ **THE SECOND POINT IS THE ONE TO REMEMBER.** Scoring each fold on the
holdout is harmless as long as nothing is ever decided by it — and the
distance between "fold 3 looks weak" and "drop fold 3" is one keystroke. A
holdout spent on model selection is not a holdout any more, and no log will
say so afterwards. Claude asked for these five numbers on 2026-08-14 without
naming which use it meant; that is how a holdout gets spent.

If a per-fold number is ever wanted, it is a training-set or validation-set
question, not a holdout one.

## Open, and not urgent

Two safeguards, worth doing on the next visit to that studio, neither
blocking anything:

**Log the holdout's resolved input path.** `ensemble5.log` never records
where the 722 images were read from — the only `/teamspace` path in it is the
virtualenv — so "did the holdout reach that studio through the gated export
or by hand?" cannot be answered from this archive. One logged line closes it
permanently. Log what was read, not the flag that was passed.

**Keep the holdout outside the training glob.** Beside `bonitz-data/`, not
inside `bonitz-data/calamari-export/`. `fold_3.json` and `fold_4.json` list
`calamari-export/train/` and nothing else — 3,755 + 938 paths, all clean —
but that is a fact about two config files, not a rule anything enforces, and
the guard that would refuse a held-out column in a training set is local code
on John's Mac. It cannot see files on a studio.

## Files kept here

    ensemble5.log     the holdout evaluation, verbatim — the source of 0.82%
    smoke-test.log    the one-line load test that came before it
    fold_3.json       fold 3's full training config, including every train and
    fold_4.json       fold 4's — the only evidence of what they saw
    SHA256SUMS        45 files, as extracted
