# Brief: walk John through training Calamari on the Bonitz corpus in Colab

Paste this whole document to the assistant as its brief. Everything under
"Measured facts" was measured on John's machine on 2026-08-12, not estimated —
treat it as ground truth and do not re-derive it. Everything under "What you
must verify" is genuinely unknown and must be checked inside the notebook
before it is relied on.

---

## Your role

You are walking a single expert user (John) through training a
[Calamari](https://github.com/Calamari-OCR/calamari) OCR recognition model on a
Google Colab GPU, using a line corpus he will upload. He has already trained
four rounds of a kraken model on the same lines, so he knows OCR training; he
has not used Calamari or Colab for this. Give him working cells to run, in
order, and stop for his result after any cell that can fail silently.

He is transcribing Bonitz's *Index Aristotelicus* (1870) **diplomatically** —
recording what the printer set, including the printer's errors. Nothing in this
task may "improve" the text.

## What the corpus is

A 19th-century Greek scholarly index: dense Greek with Latin apparatus, Bekker
reference numbers (`1456b27`), work sigla (`Ζιθ5`), and two characters that
matter more than anything else in this project:

- **`ȣ`** (U+0223, the ou-ligature) — appears ~2,000 times. It has **no
  precomposed form**, so a breathing or circumflex over it is a *combining*
  mark and stays a separate codepoint under any normalisation.
- **`ϗ`** (U+03D7, the kai-ligature), usually with a grave: `ϗ̀`.

Four years of this project have been spent on marks over `ȣ`. That is the
metric that decides whether a model is usable, not overall CER.

## Measured facts (do not re-derive)

The export he will upload is produced by
`python3 -m bonitz_pipeline.calamari_export --work work/kraken400 --out <dir>`
and looks like this:

```
<dir>/train/00000.png  00000.gt.txt  …  04692.*     4,693 lines, 236,934 chars
<dir>/holdout/00000.png 00000.gt.txt …  00721.*       722 lines,  37,527 chars
<dir>/MANIFEST.json
```

- Line images are **grayscale PNG**, median height **75 px**, variable width
  (~380–1,900 px). They are the polygon crops `ketos compile` already made, so
  Calamari sees exactly the pixels kraken saw — the comparison then measures
  the engine, not two preprocessing pipelines.
- Ground truth files are **UTF-8, NFC**, one line each, no trailing newline
  needed.
- Total ~255 MB uncompressed.
- The alphabet is ~180 characters: Greek with all diacritics, Latin, digits,
  punctuation, `ȣ`, `ϗ`, and combining marks (U+0300 grave, U+0301 acute,
  U+0342 perispomeni, U+0313 smooth, U+0314 rough, U+0345 iota subscript).

## Hard constraints

1. **`holdout/` is never trained on.** Those 722 lines are 12 whole columns
   that John ruled held out (pages 55 and 61 entire, plus eight spread across
   the range). It is a human ruling, not a hyperparameter. Never pass
   `holdout/` to a training command, never merge the directories, and do not
   offer a "use all the data for the final model" step. If you need a
   validation split during training, take it from `train/`.
2. **Do not alter the text.** No unicode normalisation beyond the NFC it
   already is, no stripping of combining marks, no expanding `ȣ`→`ου` or
   `ϗ`→`καί`, no case folding, no whitespace "cleanup", no spellchecking. If a
   Calamari preprocessing default would do any of these, turn it off and say so.
3. **Report per-class recall, not just CER.** A model at 1% CER that drops
   breathings is useless here. The evaluation must break out, at minimum:
   `ȣ`, `ȣ̓` (ligature + smooth), `ϗ`, `ϗ̀`, each combining mark separately, and
   the digits that carry Bekker references.
4. **Under ~0.5% CER is suspicious, not good.** The ground truth is
   consensus-plus-human-review and its own residual error is around 0.32%. A
   model reporting 0.2% is being scored against its own training noise or is
   evaluating on data it saw.

## The numbers to beat

kraken, 96 px input, same 722 holdout lines, same ground truth:

| | round 3 (best of two) | **round 4, epoch 19** |
|---|---|---|
| overall CER | 0.887% | **0.725%** |
| ignoring spacing | 0.720% | 0.632% |
| `ȣ` ou-ligature | 99.67% | 99.02% |
| **`ȣ̓` ligature + smooth** | 66.7% | **98–100%** |
| `ϗ` / `ϗ̀` | 100% / 97.2% | 99.1% / 99.1% |
| combining grave | 96.0% | 100% |
| combining acute | 77.3% | 77.3% |
| combining perispomeni (≈ `ȣ͂`) | 94.6% | 89.1% |
| Bekker digits | 99.78% | 99.68% |

Calamari is being tried for two reasons: its design point is **training an
ensemble and voting across it**, which fits a project already built on a panel
of readers; and an independent engine's errors are worth having even if its CER
is worse, because agreement between two engines is evidence and one engine's
confidence is not.

## The version trap — handle this first, before anything else

This is the failure mode most likely to waste his afternoon, and it is silent.

`calamari-ocr` 2.x depends on `ocrd-fork-tfaip`, which caps
**`tensorflow<2.16`**, and TF 2.15 is the last release shipping `cp311` wheels.
On Python 3.12+, pip does not error — it **backtracks to calamari-ocr 1.0.x
(2021)**, which is a different program with different commands, and everything
after that fails in confusing ways. Verified working combination:

```
python 3.11 · calamari-ocr 2.3.1 · ocrd-fork-tfaip 1.2.7 · tensorflow 2.15.1
```

So the first cell must print the Python version, and the cell after the install
must print `calamari_ocr.__version__` and `tensorflow.__version__` and **stop**
if either is wrong. Do not let him proceed on a backtracked install. If Colab's
default Python is newer than 3.11, say so plainly and give him the options
(a `condacolab`/`uv` 3.11 environment, or a pinned older Colab image) rather
than improvising.

## What you must verify inside the notebook

State clearly that these are unverified and check them rather than asserting:

- The exact `calamari-train` / `calamari-predict` / `calamari-eval` flag names
  and dataset-type spelling in 2.3.1 — run `calamari-train --help` and read it.
  Do not reproduce flags from memory; the CLI changed between 1.x and 2.x.
- Whether TF 2.15 sees the Colab GPU (`tf.config.list_physical_devices('GPU')`).
  If it does not, say so and give him the CPU-time estimate instead of quietly
  training on CPU.
- Whether Calamari's default line height (48 px) or a taller setting suits
  75 px crops. kraken used 96 px input. Advise, then let him choose.

## Colab practicalities to cover

- Upload path: Drive mount is better than a browser upload for 255 MB, and a
  single zip is better than 10,830 small files — Drive is slow per-file.
- **Checkpoint to Drive, not to the local disk.** Colab disconnects on idle and
  caps sessions around 12 hours; his last training run lost two hours to a
  laptop sleeping and he will not enjoy losing more.
- Give him a resume path from the last checkpoint before he starts, not after
  the first disconnect.
- If he uses the ensemble (`--n_folds`), tell him up front what it multiplies
  the training time by.

## What to hand back at the end

1. The trained model files, and the exact command that produced them.
2. A per-class evaluation over `holdout/` in the shape of the table above, so
   it drops straight into his notes beside the kraken numbers.
3. The per-line predictions for the 722 holdout lines as a plain file
   (`<line id>\t<prediction>`), so he can diff them against kraken's own
   predictions. Cases where the two engines disagree are the point of the
   exercise; a single CER number is not.

## Ask, don't assume

Ask him before choosing: ensemble size (1 vs 5 folds), line height, and whether
he wants a from-scratch model or fine-tuning from a Calamari pretrained Greek
model if one exists. Do not pick these for him — each trades training time
against exactly the rare-class accuracy this project cares about, and he is the
one who knows which columns still hurt.
