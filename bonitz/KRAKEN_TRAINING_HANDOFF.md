# Bonitz × Kraken — training handoff

*Self-contained. Hand this whole file to a fresh session. Goal: train a
Kraken segmentation model and a Kraken recognition model on Bonitz's* Index
Aristotelicus *(Berlin 1870), so that pages can be read locally for free
instead of at ~250k API tokens per column.*

Prepared 2026-08-06. Everything below was verified on this machine today
unless marked UNVERIFIED.

---

## 0. Why

Reads currently cost **170k–310k tokens per column** (measured across 22
columns). The book is **1,742 columns**. That is not affordable at any
cadence, and a session limit already destroyed nine in-flight reads in one
night.

A trained Kraken model runs **locally and free**. It is also a genuinely
independent reader: it has no language model talking it into plausible Greek,
which is exactly how Haiku, Codex/`gpt-5.6-sol` and Sonnet each failed
(they confabulate the ou-ligature into whatever word fits).

Target use: Kraken as the primary/bulk reader, with Opus adjudicating only
where Kraken disagrees with LlamaParse/Genie — or as a fourth reader in the
existing three-reader vote.

---

## 1. Environment (all verified today)

| thing | value |
|---|---|
| kraken / ketos | **7.1** (NOT the 6.0.3 in old notes) |
| binaries | `~/.local/bin/kraken`, `~/.local/bin/ketos` |
| python | `/Users/johnboyer/Library/Application Support/pipx/venvs/kraken/bin/python` |
| package dir | `…/pipx/venvs/kraken/lib/python3.13/site-packages/kraken` |
| torch | **2.13.0, MPS available** (`cuda: False`) — train with `--device mps` |
| stock segmenter | **`blla.mlmodel`, 4.9 MB, bundled in the package dir** |
| stock recogniser | **none** — no bundled model, no `~/Library/Application Support/kraken/` cache |

### Corrections to stale notes — read these

- **`segment -bl` is CORRECT in 7.1.** The old "do NOT use `segment -bl`"
  note was a kraken-6.0.3 + legacy-box-model constraint. In 7.1 baseline
  segmentation is the working path; the *legacy* `segment` (no `-bl`) now
  fails outright with `Image … is not bi-level`.
- **`~/kraken-env/` and `~/OCR-kraken-models/` no longer exist.** Lost in the
  machine wipe, same casualty as the Diogenes downgrade. The
  `greek-german_serifs_sophokle1v3soph` model from the pilot is gone.
- **`kraken list` returns an EMPTY table.** The Zenodo model repository gave
  0 results today, so no polytonic Greek base recognition model could be
  pulled. Retry it; if it stays empty, see §4 for the from-scratch path.

---

## 2. What was proven today

### 2a. Segmentation on a PRE-SPLIT column — exact

Stitched `page-056-R` from its strips (1400×3631) and ran:

```bash
~/.local/bin/kraken -i col-056-R.png seg.json segment -bl
```

**Found exactly 61 lines; the transcription has exactly 61.** Baselines
evenly spaced y=58 → y=3574. Cutting line 17 from that segmentation produced
exactly the `ξηρκν ϗ̀ θερμὴν ἀναθυμίασιν significat…` line. **Ordering pairs
1:1 with the transcription file.** This is the whole feasibility question and
it passed.

### 2b. Segmentation on a RAW FULL PAGE — good, not exact

`pdftoppm -r 300` page 56 (2204×3135), same command:

| | found | truth |
|---|---|---|
| left column | 63 | 61 |
| right column | 66 | 61 |
| total | 129 | 122 |

**It separates the two columns unaided** — gutter cleanly between x=1177 and
x=1115, and **zero** lines start in one column and end in the other. The 7
extras are the running head, the printer's signature, and 10 short fragments
that are the marginal gutter numbers.

(An earlier reading of mine claimed 43 cross-gutter merges. That was wrong —
a bad x-threshold on my part, not a kraken failure. Ignore it if you see it
quoted anywhere.)

**Implication:** kraken does not need `split_columns.py`, but on raw pages it
picks up marginalia. That is precisely what a Bonitz-trained segmenter should
fix, and why stage A exists.

---

## 3. The training data

### 3a. Recognition ground truth — 4,612 lines

`bonitz/work/reconciled/*.txt` — **76 columns, 4,612 lines**, one printed
line per text line.

| line count | columns |
|---|---|
| 61 | 68 |
| 62 | 6 |
| 46 | 2 (page 15, the pilot page) |

Character inventory (248 distinct), including the glyphs that matter:

| char | count |
|---|---|
| `ȣ` LATIN SMALL LETTER OU | **1,784** |
| `ϗ` GREEK KAI SYMBOL | **663** |
| combining grave | 705 |
| combining perispomeni | 247 |
| combining comma above (smooth) | 145 |
| combining acute | 131 |
| combining reversed comma (rough) | 10 |

**This is the point of the whole exercise.** No off-the-shelf Greek model
knows `ȣ` or `ϗ`; a model trained here will.

### 3b. Quality caveat — state it, don't hide it

Pages 15–51 went through three-reader consensus, Opus adjudication, and
John's review of ~101 queue items with ~44 line corrections applied. That is
**consensus-plus-spot-review, not line-by-line human verification.** Expect
residual label noise. OCR training tolerates this well, but it means the
model's ceiling is the ground truth's accuracy, and a CER below ~0.5% should
be treated as suspicious rather than celebrated.

Page 52 is reconciled but its two medium-confidence items are still
undispositioned. Pages 53–62 are read but **not adjudicated** — they are NOT
ground truth yet.

### 3c. Images

All 76 columns have strips at
`bonitz/images/strips/page-NNN-{L,R}/strip-NN.png` (1400px wide, 700 tall,
110 overlap). Stitch with `bonitz/work/make_review_crops.py::stitch()`.

Line height works out to ~57px, which is adequate (kraken normalises to 48px)
but not generous. **If CER plateaus, re-render at 600 PPI** — `pdftoppm -r
600` then `split_columns.py` — rather than fighting the model.

---

## 4. The plan (John's sequence: segmentation first, then recognition)

### Stage A — segmentation model

`ketos segtrain` takes **`-f xml|alto|page` only** — no simple path format.
So it needs PageXML/ALTO with baselines.

Bootstrap, which avoids hand-annotating anything:

1. For each of the 76 reviewed columns, run stock `blla` on the **pre-split
   column** (proven exact in §2a) and keep only columns whose line count
   equals the transcription's line count.
2. Map those baselines back into **full-page** coordinates using the crop
   offsets from `split_columns.split_page()` (deterministic — re-run it to
   recover the offsets; the column TIFFs were deleted by `batch3 prep`).
3. Emit one PageXML per full page. By construction it contains **only real
   text lines** — head, gutter numbers and signature are excluded, because
   the splitter had already cropped them.
4. `ketos segtrain -i <pkg>/blla.mlmodel -f page --device mps …` to fine-tune
   the stock segmenter rather than start cold.

⚠ **Verify the coordinate mapping before training.** If the offsets are off,
you train a segmenter on baselines that sit in the wrong place and everything
downstream inherits it. Check by drawing the mapped baselines back onto a
rendered full page and looking at it.

Optional and valuable: label two line types, `headword` (outdented) vs
`continuation`. Bonitz's lemma detection currently leans on Genie's bold runs
in `alphacheck.py`; a segmenter that marks outdents would give lemma
structure directly.

### Stage B — recognition model

1. Cut lines using the stage-A segmenter (or the verified stock segmentation
   on pre-split columns) and pair each with its transcription line.
   `ketos train` accepts `-f path` — line image `X.png` + `X.gt.txt`.
2. **Hold out whole pages, not random lines** — adjacent lines share an entry
   and leak. Suggest holding out ~8 columns (~500 lines).
3. No base recognition model exists (§1), so either:
   - **from scratch** — viable here because this is *one book, one font, one
     layout*; single-font models on 3–5k lines commonly reach 1–2% CER; or
   - **`ketos pretrain` first** on unlabeled lines from all 871 pages
     (self-supervised), then `ketos train` on the 4,612 labeled lines. This
     is the stronger recipe and uses the ~99% of the book that has no
     transcription.
4. Train with `--device mps`.

### Stage C — evaluation, and the only number that matters

- `ketos test` for overall CER, against held-out pages.
- Compare to the pilot baseline: generic model scored **19.7% CER** on
  page 15-L.
- **Then measure the ligature and diacritic classes separately.** Overall CER
  can look excellent while every `ȣ̓`/`ȣ͂` breathing is wrong — and those marks
  are the single most-missed class in this project's whole history. A model
  that gets 1% CER but drops breathings is not usable.
- Real acceptance test: run it as a fourth reader over pages 53–62, where
  331 flags already exist in `work/flags-by-col/`, and see whether it breaks
  any current 2–1 split. Known targets: `Ζιβ28` (Genie+Llama read `6`,
  likely `θ`), `ἀπόπλ[?]ς`, `ξηρκν`.

---

## 5. Where everything is

- Worktree: `/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40`,
  branch `claude/loving-agnesi-ca09ab`, committed at `060239516`.
- `bonitz/work/reconciled/*.txt` — the 4,612-line ground truth.
- `bonitz/images/strips/page-NNN-{L,R}/` — column strips, pages 15–91.
- `bonitz/book.pdf` — symlink to the real 109 MB scan.
- `bonitz/work/make_review_crops.py` — `stitch()` and `text_extent()` helpers.
- `bonitz/bonitz_pipeline/split_columns.py` — `split_page()`, needed for the
  stage-A coordinate mapping.
- `bonitz/work/RUN-NOTES-52-91.md`, `READER-REPORTS-52-91.md` — this run.
- `bonitz/work/REVIEW-52-62.html` — John's open review page (also in iCloud
  as `Bonitz-REVIEW-52-62.html`).

## 6. Standing rules that still apply

- **Diplomatic transcription**: record the printer's errors as printed. A fix
  is legitimate only when it moves toward the ink. This governs the ground
  truth too — do not "clean" it before training.
- **`raw/` is write-once.**
- **Max 5 agents at once** (readers and adjudicators) — irrelevant to local
  training, but still in force for the OCR pipeline.
- Bonitz work is uncommitted-by-default; commit gate is John's.
- `/bonitz` must stay 404 on live.
