# Kraken training — run notes

Session of 2026-08-06, worktree `aristotle-worktrees/bonitz-40`, branch
`claude/loving-agnesi-ca09ab`.  Companion to `bonitz/KRAKEN_TRAINING_HANDOFF.md`;
where the two disagree, this file is the later measurement.

Build the corpus with `python3 -m bonitz_pipeline.kraken_corpus <stage>`:
`cols` → `segment` → `pair` → `split` → `compile`.  Each stage skips work
already on disk.  Train with `work/kraken/train.sh`.  Evaluate with
`python3 -m bonitz_pipeline.kraken_eval --model …`.

## Corrections to the handoff

- **Recognition training cannot use `--device mps`.**  torch 2.13 has no
  `aten::_ctc_loss` for MPS.  `PYTORCH_ENABLE_MPS_FALLBACK=1` runs but is
  *slower than plain CPU* — 0.60 lines/s against 1.04 — because the loss goes
  back to the CPU every batch.  Segmentation inference on MPS is fine and was
  used for all 76 columns.
- **Stage A is not on the critical path.**  Stock `blla` on a pre-split column
  is exact on the left column and exact on the right after the marginal
  numbers are filtered, so the corpus is built in column coordinates and no
  baselines are mapped back to full-page coordinates.  John chose recognition
  first on that evidence.
- **The 7.1 default architecture is too big for this machine.**  Measured on
  465 lines, one epoch:

  | config | lines/s |
  |---|---|
  | 7.1 default (120px, 3×Lbx200, 4.1M params), MPS+fallback | 0.60 |
  | 7.1 default, CPU | 1.04 |
  | 7.1 default, CPU, batch 8 | 0.48 |
  | **classic 48px spec (763K params), CPU** | **15.75** |

  `--arch ppocrv6 --variant tiny` errors out on CPU and crawls on MPS; not
  pursued.  Batching past 1 loses more to padding than it gains.

## The corpus

76 reconciled columns → **73 paired, 3 quarantined, 4,132 lines**, of which
3,667 train and 465 (8 whole columns) are held out.  Held-out columns are
`page-{017,027,037,047}-L` and `page-{022,032,042,052}-R`.

Images are re-rendered at 600 PPI from `book.pdf` and re-split with
`split_columns.split_page()` — the same crops the readers saw, before
`batch3 prep` downscaled them to 1400px strips.  Line height is ~85px rather
than the ~57px the handoff expected from the strips.

### Marginal line numbers — the whole difficulty

Bonitz numbers every fifth line of each column.  `split_columns` cuts at the
gutter's darkness valley, so **which crop keeps the number strip changes from
page to page** (page 20's numbers are in the right crop, page 15's in the left,
page 35's are halved between both).  kraken segments most numbers as their own
short lines, but merges roughly a third of them into the adjacent text line's
polygon — where they become a leading digit the transcription does not have.
Training on those teaches the model to swallow leading numbers, which in a text
built out of Bekker references is the worst thing it could learn.

Three rules, in order:

1. **Numbers segmented alone** are dropped: narrow, hard against either margin,
   and *sharing a baseline with a text line*.  That last clause matters —
   Bonitz ends entries with one-character lines (`v.`, `V.`) that are just as
   narrow and just as far left, but stand in a line slot of their own.
2. **The printer's signature and catchword** at the foot are dropped by width
   against the transcription: a two-character line is ~100px of type, a full
   line ~1900px.  Geometry alone cannot do this — the signature and a real
   `v.` line have the same width, the same position, and the same extra
   leading, and the *real* line has the larger gap.
3. **Numbers merged into a text line** are found structurally, not by position.
   Position fails: the scans carry a fraction of a degree of skew, so on page
   38-R an outdent at the foot of the column reaches further into the margin
   than a number at its head.  Instead, in a crop that holds the strip, a
   numbered line with no digit segmented beside it has the digit inside it, and
   is excluded.  On the five pages where no strip is detected anywhere
   (15/21/29/35/37/46 — the cut halved the digits), every numbered line in both
   columns is excluded.  Cost: 297 lines, 6% of the corpus.

Verified by extracting kept numbered lines from the compiled dataset: no
leading digit, text matches, and excluded lines are absent.

### Bekker spacing — John's ruling, 2026-08-06

**Bekker references are unspaced: `1456b27`, never `1456 b27`.**  The printed
gap is justification, not meaning — the same setting gives `1456ᵇ27` tight on
page 15-L and `941 ᵃ33` open on page 42-R.  The readers could not agree and the
corpus splits **3,549 spaced against 1,966 unspaced, by column**, so the model
is being trained on a coin flip; this is most of its whitespace error class,
which was 39% of all its errors.  `normalize.canonical` already strips
whitespace before diffing readers, so nothing downstream sees the change.

Applied in `kraken_corpus.emit_xml` (`BEKKER_SPACE`), not to
`work/reconciled/*.txt`, which stays the diplomatic record.

⚠ **Not yet in effect.** Re-running `pair` would rewrite `work/kraken/gt/*.xml`
unspaced while the models now training learned the spaced corpus, and
`kraken_eval` scores against those same files — the mismatch would read as a
regression that is not there.  Rebuild at the retrain round, not before.

### Gold columns — breaking the circularity

The corpus was reconciled from Opus, LlamaParse and Genie, so scoring any of
them against it measures agreement, not accuracy.  Measured that way Opus reads
these columns at 0.38% CER, which is a floor on its apparent error, not its
real one.

**Blind keying was tried and abandoned, on evidence.**  On the first fifteen
lines of page-042-R it found **no** corpus errors and introduced four of its
own — 0.6% of characters, the same order as the corpus's own noise:

| keyed | corpus | the ink says |
|---|---|---|
| ἀλ**ȣ**́μενος | ἀλ**ύ**μενος | υ — corpus |
| ἀληλεσμένο**σ** | ἀληλεσμένο**ς** | ς — corpus |
| 1106b1 | 1106b1**.** | the stop is there |
| μιγν**θ**μένων | μιγν**υ**μένων | υ — corpus |

Three of the four are the Greek keyboard, not the reader: `u` carries θ where
`y` carries υ, and an unshifted breathing key gives a smooth for a rough.
Auditing a filled box cannot make that class of error at all.

So `gold_sheet.py` fills each box with the transcription and the reader
corrects only what the ink contradicts.  Each line is masked to its own
polygon; the typed line is mirrored underneath in colour (rough blue, smooth
red, each accent its own hue) because a wrong breathing is a few pixels at
reading size; lines where the three readers disagreed carry a badge, and the
disputed words are underlined in place — the flag files store canonical text,
so `ȣσινὄνȣ` has to be turned back into `φρίττȣσιν ὄνȣ` before it can be
found by eye.  Warnings cover the standalone `῾` (never in this book), `᾽`
before a vowel, Greek β in a Bekker reference, and any word attested nowhere
in the corpus.

`--blind` still builds the empty version, under a separate storage key.

Started with the two held-out columns richest in contested glyphs:
`page-042-R` (45 `ȣ`, 9 `ϗ`, 6 `ιι`, 17 disputed lines) and `page-037-L`
(33 `ȣ`, 13 `ϗ`, 7 breathings).

### Quarantined columns — real segmentation defects, left out

- `page-029-R`, `page-046-L`: one printed line segmented as two pieces at the
  same baseline (merging them would need a polygon union; not worth it for two
  columns).
- `page-037-R`: kraken missed a line outright — a double-width gap sits between
  kept lines 57 and 58.

A column whose line count disagrees with its transcription is never trained on.
Mispairing is silent and would poison everything downstream.

## Results, 2026-08-06

### 48px model — finished, 28 epochs, best val 0.9798

Measured on the eight held-out columns, against the corpus as it then stood:

| | |
|---|---|
| overall CER | **2.02%** |
| ignoring spacing | **1.01%** |
| pilot baseline, generic model | 19.7% |

| class | recall | | class | recall |
|---|---|---|---|---|
| `ȣ` ou-ligature | **98.58%** | | combining grave | 91.03% |
| `ϗ` kai | **100%** | | combining acute | 55.56% |
| `ϗ̀` kai + grave | **100%** | | combining perispomeni | 44.19% |
| Bekker digits | **99.98%** | | **combining smooth** | **15.00%** |
| Bekker column letters | 99.48% | | `ȣ̓` ligature + smooth | 15.00% |
| `Ζιι` double iota | 90% | | `ȣ̃` ligature + perispomeni | 40% |

It reads everything this project has historically lost — the ligature, the kai,
the sigla, the Bekker numbers — at 98–100%, and drops the smooth breathing 85%
of the time.  Fifteen of its errors are one pattern, `ȣ̓ → ȣ`: it sees the
ligature and discards the breathing above it.  At 48px that breathing is about
four pixels after downscaling, which is the case for the 96px run.

### 96px model — epoch 4 (val 0.9815), evaluated 2026-08-06 17:50

| | 48px | 96px |
|---|---|---|
| overall CER | 2.02% | **1.85%** |
| ignoring spacing | 1.01% | **0.85%** |
| combining acute | 55.56% | **88.89%** |
| combining perispomeni | 44.19% | **76.74%** |
| combining grave | 91.03% | 89.74% |
| combining smooth | 15.00% | 25.00% |
| `ȣ` ou-ligature | 98.58% | 98.58% |
| `ϗ` kai | 100% | 100% |

**The "smooth breathing" class was misnamed, and the misnaming hid the real
problem.**  In NFC every smooth breathing over a plain vowel composes to a
single codepoint (`ἀ` = U+1F00), so it never reaches the combining-mark
counter.  The only *combining* smooth marks in the corpus are the ones over
`ȣ`, which has no precomposed form.  `combining smooth` and `ȣ̓` are therefore
the same 20 characters, and score identically.  Precomposed breathings are read
at ~99.9% — seven swaps in 24,506 characters.

So the model does not drop breathings.  It drops **the breathing over the
ou-ligature**, a sequence occurring 20 times in the held-out columns.  That is a
rare-class problem, not a resolution problem, and doubling the input height
moved it 15%→25% while acute and perispomeni — marks with the same pixel
budget — went up by 33 and 32 points.  Had it been pixels, all three would have
moved together.

### Resolution is spent — the scan is the ceiling

`book.pdf` embeds a **300 DPI** scan (2204×3135 per page) as an MRC composite:
lossy JPEG2000 background plus a **JBIG2** bilevel mask carrying the text.
Rendering at 600 PPI is therefore a 2× upsample of the only pixels that exist.
Median line polygon is 102px at 600 PPI = **~51 real pixels of line height**, so
48px trains just under native and 96px is already interpolating; 128px would be
2.5× native.  Both specs also pool to the same 12-row feature map before the
LSTM (`S1(1x12)`), so extra input height never reaches the recurrent layers.

⚠ JBIG2's symbol mode has a documented history of silently substituting
visually similar glyphs.  If this file uses it, the ink the readers are checking
against may not be what the printer set — unfalsifiable from inside the project.
Worth confirming against an unmasked original.

### A better scan exists — `aristotelisopera05arisuoft`

archive.org item [`aristotelisopera05arisuoft`], the University of Toronto scan
of volume 5 of the Berlin Academy edition (fragmenta + scholia supplement +
the Index).  Public domain, unrestricted, 1,150 leaves, **400 ppi RGB JP2**.
Full page 2996×4082 against our 2204×3135 — 1.36× linear, 1.85× the pixels —
and a true photographic scan, no bilevel mask.  Real line height goes 42px →
57px.  The two IA copies that turn up first (`indexaristotelic0000boni`,
`…0000hbon`) are the 1955 photomechanical reprint *and* lending-restricted;
Makhankov's `Arst0004Titel` is bilevel and noisy (John, from direct knowledge).

Leaf mapping, the one we actually use: **IA leaf = our `page-NNN` + 249**
(equivalently, printed Index page + 261; our PDF page 42 is printed page 30).
Verified by content at both ends of the corpus, 27 pages apart — leaf 264 opens
`α φωνῆεν (cf h v) πο20. 1456ᵇ27`, line 1 of `page-015-L`, and leaf 301 closes
`ἄμωμον f105. 106. 1494ᵇ43.`, the last line of `page-052-R`.  Do not derive this
from arithmetic on printed page numbers; the Index's α entries begin on printed
page 3, so the two offsets differ by 12 and it is easy to be off by that much.
**The whole Index is now on disk at 400 dpi**: `work/scan400/page-015.jpg` …
`page-890.jpg`, 876 pages, 1.8 GB, named by `book.pdf` page number so every
existing convention still applies.  Offset verified at pages 15, 42, 52, 500
and 880, with covers aligning at 896/1145; it does **not** hold below page 15,
where the two sequences differ in front matter (our page 1 is a cover, leaf 250
is *Corrigenda et Addenda*).  Leaves 1140-1145 are back matter and covers.

Delivered to `iCloud Drive/bonitz-hi-res/` as nine chunks on round hundreds —
`bonitz-hi-res-p015-p099.pdf` … `p800-p890.pdf`, 1.5 GB — for uploading to
Genie.  Built with `img2pdf --imgsize 400dpi`, which embeds the JPEG streams
untouched (2938×4074, 400 ppi, correct 7.34×10.18in page geometry).  `qpdf`
splits PDFs but cannot build one from images; without `--imgsize` img2pdf
assumes 96 dpi and yields 30-inch pages.  Note zsh does not word-split unquoted
variables — build the file list as a bash array or the whole list arrives as
one filename.

Single pages come from
`https://archive.org/download/aristotelisopera05arisuoft/page/nNNN_w4000.jpg`
(the IIIF endpoint 404s for this item).  Line bands on a column: text block
runs y=230..3702, pitch (3702-230)/61 ≈ 56.9, line *n* starts at `230 + n*pitch`.

**The typesetting is identical** — page 30 line 48 breaks after `σχιζόπτερον`
in both, as it must, the 1955 issue being a photomechanical reprint of these
plates.  So a scan swap costs re-render, re-segment and re-pair; **the 76
reconciled transcriptions stay valid and nothing needs re-reading by hand**.
Genie, LlamaParse and kraken re-read for free; only Opus is metered.

⚠ **The damage ruling on page-042-R needs revisiting.**  Line 48's `ἐπίγειον`
was recorded as a failed impression on the strength of our scan, where the ε is
a fragment and the ι is simply absent.  At 400 ppi the ε is thin but whole and
**the ι carries ink**.  The impression is genuinely light in the edition; our
scan is what destroyed it.  Line 7's worn ligature is queued for the same check.
General lesson: a damage ruling made against a JBIG2-masked 300 ppi scan is a
statement about the scan, not about the ink.

To re-evaluate a 96px checkpoint:

```sh
cd work/kraken
best=$(ls model96/archive/*.ckpt | sed 's/.*-//;s/.ckpt//' | sort -rn | head -1)
ketos convert -o /tmp/m96.safetensors $(ls model96/archive/*-$best.ckpt | head -1)
cd ../.. && python3 -m bonitz_pipeline.kraken_eval --model /tmp/m96.safetensors \
    --device cpu --out work/kraken/eval96
```

### page-042-R audited — the method works

John audited the column against the ink; ten lines changed, and **ten of the
model's 93 errors on that column were the corpus, not the model** — 11% of its
apparent error, on one column.

- six `ὠ` → `ᾠ`, the egg words (lines 30, 31, 33, 34, 37, 61).  Confined to
  this column; every other column writes them right, including `ἐπῳάζειν`
  three times on this very page.  The model read `ᾠ` in all six, unprompted,
  on a column it had never seen.
- `τὸ` → `τὶ` on line 47, confirmed against the ink — the corpus was wrong and
  the parallel with line 16 would have talked anyone out of it.
- `AZγ` → `ΑΖγ` on lines 44 and 45, Latin capitals to Greek.  Homoglyphs, so
  the ink cannot settle it; John's ruling.
- `ἀλύμενος` → `ἀλȣ́μενος` on line 7.  The glyph images as a upsilon, but the
  word is `ἀλέω`/`ἀλούμενος`, "being ground" — the sort is worn.  Recorded as
  print damage, not as a reading.

Damage sites go in `work/kraken/gold/<column>.damage.json`: the impression
failed, so neither reader is wrong and the line is unlearnable.  They leave the
training corpus — a line teaching that a blank is `ει`, or that a upsilon-shaped
glyph is the ligature, teaches invention — and they leave the error count.

## The scan swap, done 2026-08-06 evening

Built as a **parallel tree, `work/kraken400/`** — the old corpus is untouched,
so the two are directly comparable and `page-037-L.html` still matches the
ground truth it was generated from.

```sh
python3 -m bonitz_pipeline.kraken_corpus cols --work work/kraken400 --pages work/scan400
python3 -m bonitz_pipeline.kraken_corpus segment --work work/kraken400   # 16 min, MPS
python3 -m bonitz_pipeline.kraken_corpus pair    --work work/kraken400
python3 -m bonitz_pipeline.kraken_corpus split   --work work/kraken400
python3 -m bonitz_pipeline.kraken_corpus compile --work work/kraken400
```

| | 300 dpi MRC | 400 dpi JP2 |
|---|---|---|
| columns paired | 73 | **75** |
| quarantined | 3 | **1** (`page-033-R`, 63 kept vs 62) |
| training lines | 3,667 | **3,823** |
| holdout lines | 465 | **480** |
| excluded as digit-contaminated | 297 | **247** |
| pages with no digit strip detected | 6 | **3** (21, 31, 35) |

The three old quarantines — `page-029-R`, `page-046-L`, `page-037-R` — were
defects of the old images and segment cleanly here.  The marginal numbers now
come out as their own lines rather than merging into the adjacent text polygon
(`page-042-R`: 61 + exactly 12, one per numbered line), which is where most of
the recovered 50 lines come from.  Ink measures **darker** on the new scan, not
lighter: 2nd percentile 69 against 100, background 251 against 239.  The
bleed-through visible on the grayscale pages does not dominate.

Three code changes, all small:

- `kraken_corpus` takes `--work` (build in a second tree) and `--pages`
  (split page images instead of rendering `book.pdf`).
- The gutter-digit thresholds are fractions of column width
  (`GUTTER_MAX_X1_FRAC`, `GUTTER_MAX_WIDTH_FRAC`) rather than pixel constants
  calibrated at 600 PPI, so one calibration serves any resolution.
- **Print-damage exclusion is now actually wired in.**  It never was — the
  `.damage.json` file existed and nothing read it.  Rulings live in
  `work/damage/<column>.json`, outside any corpus tree, because they are
  statements about the edition rather than about a scan of it.

Verified before training: Bekker references **9,950 unspaced, 0 spaced** in the
new ground truth; both `page-042-R` damage lines absent; three line crops from
three columns match their paired text exactly, one of them opening on `ȣ̓`.

Retrained with the byte-identical 96px spec.  Ran the full 30 epochs, best at
**epoch 9, val 0.9908**, converted to `work/kraken400/m-best-epoch09.safetensors`
(ketos prunes to the ten best checkpoints, so convert early — epochs 0-6, 8, 10,
14, 15, 20, 21 are already gone).

### ⚠ The result, read honestly: the scan bought almost nothing measurable

| | 300 dpi 48px | 300 dpi 96px | **400 dpi 96px** |
|---|---|---|---|
| overall CER | 2.02% | 1.85% | **0.921%** |
| **ignoring spacing** | 1.01% | **0.85%** | **0.813%** |
| non-whitespace edits | — | **209** | **203** |
| `ȣ` ou-ligature | 98.58% | 98.58% | 98.13% |
| `ϗ` kai | 100% | 100% | 100% |
| `ϗ̀` kai + grave | 100% | 98.33% | 100% |
| combining grave | 91.03% | 89.74% | 89.16% |
| combining acute | 55.56% | 88.89% | 55.56% |
| combining perispomeni | 44.19% | 76.74% | 67.44% |
| **combining smooth (= `ȣ̓`)** | 15.00% | 25.00% | **10.53%** |
| digits | 99.98% | 99.85% | 99.90% |

Overall CER halved, and **that is nearly all the Bekker unspacing**, exactly the
confound flagged before the run.  Whitespace edits fell 245 → 27; real character
errors went 209 → 203, which is noise.  On the class this whole exercise is
about, the ligature is flat and **the breathing over it got worse**.

So: the 400 dpi scan did *not* improve machine recognition.  What it did improve
is separate and still real —

- **human adjudication.**  `Ζιθ28` was unreadable at 300 dpi and obvious at 400.
  That is the scan's actual value, and it is a value to John's eye, not to CTC.
- **the corpus.**  75 columns paired instead of 73, 3,823 training lines instead
  of 3,667, 247 exclusions instead of 297, 1 quarantine instead of 3.
- **provenance.**  We now read the 1870 original rather than a 1955 reprint.

The lesson for the next round: a model at ~0.8% ex-spacing CER against ground
truth whose own noise is ~0.32% is not obviously limited by its input images.
Chasing pixels further is the wrong lever; the corpus and the rare-class
imbalance are the right ones.  `ȣ̓` occurs 19 times in the entire holdout —
no amount of resolution fixes a class that rare, only more examples of it will.

### ⏳ Pending at the next rebuild: reverse the line-48 damage ruling

`page-042-R` line 48, `ἐπίγειον`, was ruled print-damaged on 2026-08-06 against
our scan, where there is γ, a fragment of ε, blank paper, then ο.  At 400 dpi
the ε is still broken — weak middle bar, printed as a dot — but a clear short
vertical stroke follows it.  John, seeing the 10× crop: *"Look like epsilon
iota."*  The ε breaks in **both** copies, which is the type; the ι is whole in
one and wholly absent in the other, which fits reproduction loss rather than a
failed impression.  (The two are different physical copies, possibly different
printings, so this is inference and not proof.)

**Not applied yet, deliberately.**  Training began 19:00 on a corpus with line
48 excluded; editing `work/damage/page-042-R.json` now would leave the ruling
disagreeing with the data the running model saw.  Remove `48` from that file at
the next rebuild — keep `7`, which is a different question and still open.

The general rule this establishes: *record the printer's errors as printed*
means the printer's, not the photocopier's.  A damage ruling is only as good as
the reproduction it was made against, so re-check every damage site when the
scan changes.

## Genie re-read on the 400 dpi scan — `raw/genie400/`

Nine docx chunks, renamed to match the uploaded PDFs and verified contiguous by
running head (each file's last lemma is the next file's first): p015-p099,
p100-p199, … p800-p890.  John's downloads arrived as "bonitz hi 1-10" with
**"hi 6" a byte-different but content-identical duplicate of "hi 2"** (2,486
paragraphs, zero differing) and **"hi 10" out of order** — it is p100-p199,
confirmed against `work/scan400/page-100.jpg`, whose running head reads
`88 ἀπȣσία ἀποφυτεία`.  19,894 cleaned lines total.

**`book.pdf`'s provenance is now confirmed, not inferred.**  The old Genie
output's front matter carries `https://archive.org/details/indexaristotelic0000boni`
and "Digitized by the Internet Archive in 2019 … Trent University Library" — so
our 300 dpi source is the **1955 photomechanical reprint**, and the new scan is
the 1870 original.  A reprint of a reprint is exactly why thin marks like the
ι of `ἐπίγειον` are gone in ours and present at 400 dpi.

### ⚠ Genie cannot see the ou-ligature, at any resolution

**Zero `ȣ` in 5.7M characters** of the new output, and zero in 6.0M of the old;
`ϗ` appears 3 times against 663 in 76 columns of ground truth.  The better scan
changed nothing here, because it is not a resolution problem — Genie has no ȣ
in its output repertoire and silently writes υ (page 100's head is `ἀπȣσία` in
the ink and `ἀπυσία` in the docx).  kraken reads the same glyph at 98.58%.
That is the complementarity argument in one number: on the character this
project has always lost, one reader is perfect and the other is blind, so
neither can replace the other and a vote between them is worth having.

### ✅ First flag adjudicated by the 400 dpi scan — page 54-L line 7

`Ζιθ28. 606b12` — theta, ruled by John against the crop, 2026-08-06.  Opus read
`β`, Genie `6`, LlamaParse `6`; the majority vote recorded `6` and **all three
were wrong**.  `compare3` did flag it (`majority-other`, one of the 331 open
flags for pp.53-62) — the machinery worked, it simply had no correct reading to
choose from.  Only the ink settled it.

Internal evidence condemns `β` independently: `Ζιβ` is *Historia Animalium* 2,
Bekker 497b-509b, and the citation is 606b12.  ⏳ The Bekker-range check that
caught 9 bad `Ζμ`/`Ζι` sigla should have caught this one — find out why it
did not.

This is the template for the whole pp.53-62 flag queue: crop at 400 dpi, rule,
move on.  Apply the same to `ἀπόπλ[?]ς` and `ξηρκν`.

### ✅ Sweep result: the 3-0 blind spot is small — 14 candidates in 4,303 lines

Run 2026-08-07 04:05 with `m-best-epoch09.safetensors` over all 75 paired
columns, 0 skipped.  `work/kraken400/sweep/ligature-candidates.tsv`.

Two bugs found in the first pass, both worth remembering.  Recognition failed
on every column because the model path was relative and `recognise()` runs
kraken with `cwd=cols/` — the same trap as `--out` in `kraken_eval`, now fixed
in both.  Then the first clean run returned **515** candidates, 513 of them
`other`, because `suspect_pair` fired whenever the words disagreed after
expansion — including when the corpus **already had the ligature** and the two
differed only over a diacritic (`τȣ̃` vs `τȣ͂` is combining tilde against
combining perispomeni).  Guarded; 515 → 14.

Of the 14, four look like genuine corpus errors, two decidable on grammar
alone without consulting the ink:

| column | corpus | model | reading |
|---|---|---|---|
| 051-L | `ἐκ τῷ σταιτός` | `ἐκ τȣ͂` | **ἐκ never takes the dative** — `τοῦ` is required |
| 051-L | `ἐκ τῆς ἀμπέλυ` | `ἀμπέλȣ` | `ἀμπέλυ` is not a word; `ἀμπέλου` is the genitive |
| 048-R | `πῶς βοηθῆσι` | `βοηθȣ͂σι` | `βοηθοῦσι`, contracted 3pl of βοηθέω |
| 052-R | `τέρἑ κατέρȣμέρȣς` | `τέρȣ` | garbled; cf the `ἑκατέρȣ` splice already known on this column |

Ambiguous, needs the ink: `νῦν`/`νȣ͂ν` on 037-R (both real words), and `κ.`
against `ϗ` on 029-L in `σὰρξ ἐρυθρὰ κ. αἱματώδης`, where the sense wants καί.

The rest are the model erring, and they are legible as such: `τὰς` → `τȣ̀ς`
four times (α read as the ligature — and `τὰς ἐνδόξȣς` is right as printed,
ἔνδοξος being two-termination), `ὅθεν` → `ȣθὲν`, and `αὐτῷ` → `αὐτȣ̃` where the
line's own parenthesis reads `(codd αὐτὸ)` and confirms the dative.

**So the silent 3-0 loss is roughly four characters in 4,303 lines, ~0.09%.**
The reconciliation held up far better than the discovery of Genie's blindness
suggested it might.  Worth keeping in proportion when deciding how much a
fourth reader is worth.

⚠ kraken trained on 67 of these 75 columns, so its *agreements* here prove
nothing — only the disagreements above are evidence, which is exactly what the
sweep lists.  A clean independent test still needs pages 53+.

### ★ kraken read `Ζιθ28` correctly, unprompted, on an unseen page

2026-08-07.  Pages 53-62 split from the 400 dpi scan, segmented and read with
`m-best-epoch09` — pages kraken never trained on, so this is a genuine
independent vote.  On page 54-L line 7:

| reader | read |
|---|---|
| Opus (spine) | `Ζιβ28` |
| Genie | `Ζι628` |
| LlamaParse | `Ζι628` |
| **kraken** | **`Ζιθ28`** ✓ |

Its whole line matches the ink John adjudicated by eye: `934b27, 31.
ἀνάγεσθαι, i e ἀναπλεῖν Ζιθ28. 606b12. —`.  Three language-model readers
converged on a wrong answer, two of them on a *digit* — not a possible value in
that slot — and the reader with no language model to be talked into plausible
Greek read what was printed.

This is the case for the fourth slot, made on the one flag we have independently
verified against the page.

Artifacts: `work/kraken400/read/cols/` (20 columns), `.../read/txt/` (readings).
Command that works — the combined form; `-a ocr` silently produces nothing:

```sh
kraken -d cpu -i col.png out.txt segment -bl ocr -m m-best-epoch09.safetensors
```

### ✅ compare4 — four readers, 2-2 always flags

`bonitz_pipeline/compare4.py`, new module rather than a rewrite of `compare3`,
which still has 331 live flags depending on it.  Generalises the vote to N
readers.  John's ruling, 2026-08-07: **a 2-2 split always flags** — a genuine
deadlock deserves a human, and a tiebreak rule would be guessing dressed as
arithmetic.

Two behaviours worth noting:

- **`spine-outvoted` no longer casts a vote.**  compare3 recorded
  `majority-other` with `vote: "6"` and moved on, which is how `Ζιβ28` got a
  wrong value written into the corpus.  compare4 flags with `vote: None`.
- **kraken is muted below page 53** (`KRAKEN_INDEPENDENT_FROM`).  It trained on
  the reconciled text of 15-52, so its agreement there is recitation, not
  evidence.  The record still shows its reading, marked `kraken_muted`.

### ★★ Opus lost all 18 — but the test is confounded

John ruled the 18 Opus lone-dissent cases against the 400 dpi crops on
2026-08-07.  **The ink agreed with the other three every single time.**

Read alongside the lone-dissent tally on pp.53-62 — Opus 18, kraken 83, Llama
121, Genie 259 — the profile looks like a reader that is *rarely* wrong but
**never uniquely right**.

⚠ **John's objection, 2026-08-07, and it is correct: Opus read the 1955
reprint at 300 dpi.**  kraken, Genie400 and Llama400 all read the 1870 original
at 400 dpi.  So 18-0 may be measuring the scan rather than the reader — the
same confound that made `Ζιθ28` illegible in the first place, and the same
mistake as crediting the 400 dpi retrain for a gain that was Bekker unspacing.

**Scored against John's rulings** (`work/verdicts/verdicts-053-062-full.json`):

| reader | exact | fold-only |
|---|---|---|
| **LlamaParse** | **18/18** | — |
| kraken | 16/18 | 2 |
| Genie | 14/18 | 4 |
| **Opus** | **0/18** | 0 |

**The cost argument survives the confound.**  Grant John's objection in full —
assume Opus would have read all 18 correctly at 400 dpi, which it does; reading
those same crops here produced `θ`, `ὡς` and `ȣ` without difficulty — and it
still changes no verdict.  LlamaParse alone matched the ink 18 times out of 18.
The question is not whether Opus reads well; it is whether a fourth opinion
moves an outcome, and on this evidence it does not.

**Genie's four fold-only misses are precisely the ligature cases** (items 4, 5,
6, 14), every one an `ȣ` expanded to `ου` — 22% of the hard cases, and
invisible to the comparator because `fold()` normalises ligature and expansion
together (`fold('ὡςȣ̓') == fold('ὡςοὐ')`).  Correct for deciding *who dissents*,
but it means "the other three agreed" can mean "agreed after the ligature was
normalised away".

⚠ Sample bias, stated plainly: these 18 are the set where Opus already stood
alone, so it is the sample least favourable to Opus.  ⏭ The fair follow-up is
the reverse — sample 20 from the 83 kraken-alone or 259 Genie-alone cases and
check whether Opus's agreement with the majority was doing real work there.

**Consequence: Opus moves out of the reader slot and into adjudication only.**
Reading a column costs 170k-310k tokens, so pp.53-62 alone was 3.4M-6.2M;
adjudicating 354 flagged snippets is ~200k.  Roughly **20-30× cheaper**, and
Opus still decides every case that is actually in doubt.

Two things make this newly safe, both from 2026-08-06/07:

- **kraken can be the spine.**  `compare3`'s comment justifies Opus as spine
  because "it is the only reader with per-column files".  kraken now has them
  (`work/kraken400/read/txt/`), so the structural reason is gone.
- **The 400 dpi re-read repaired Genie and LlamaParse where it mattered.**  On
  `Ζιθ28` both previously read `6`; both now read `θ`.  A panel of kraken +
  Genie400 + Llama400 gets that right *without* Opus — which read `β`.

⏭ Production config to build: three free readers with kraken as spine, Opus on
flags only.  `compare4` is already N-way, so it is a call with three readers,
not a rewrite.

### ⏭ The ligature sweep — `bonitz_pipeline/ligature_sweep.py`

Written and unit-checked 2026-08-06; **not yet run**, because it needs the CPU
the retrain is using and the best model to point it at.  One command once
training stops:

```sh
cd bonitz
best=$(ls -t work/kraken400/model96/checkpoint_*.ckpt | head -1)
ketos convert -o work/kraken400/m-best.safetensors "$best"
python3 -m bonitz_pipeline.ligature_sweep --model work/kraken400/m-best.safetensors \
    --work work/kraken400 --device cpu
```

It runs the model over **every paired column** — not just the holdout — and
writes `work/kraken400/sweep/ligature-candidates.tsv`.  It applies nothing; the
ink decides.  Words repeating across columns are the interesting rows: either a
real corpus error made the same way many times, or the model wrong the same way
many times, and which one is obvious on sight.

Comparison is **word-level, not character-level**, because there are two
failure modes and a character diff only catches one.  The readers substitute
(`ȣ` → `υ`) but they also **expand** (`ȣ` → `ου`, `ϗ` → `και`), so `τȣ͂` in the
ink arrives as `τοῦ` — one character against two, which no character alignment
will pair up.  John caught this omission.  Accents are stripped before
matching, so `τούς`/`τȣ̀ς` matches on `ου`.  Rows are bucketed by what the
corpus wrote — `υ`, `ου`, `κ`, `και`, or `other` — and `other` means the model
read a ligature the corpus cannot be explained as, which is usually the model
inventing one and is worth keeping separate from the clean cases.

This sizes the **3-0 blind spot** — the case `_spine_missed_ligature` cannot
catch, where Opus, Genie and LlamaParse all missed the same ligature so nothing
flagged.  Expect it to be small (the corpus does hold 1,785 ligatures), but
"small" is a measurement we do not have yet.

### LaTeX repair

Genie encodes Bekker column letters differently per chunk.  Fixed in
`normalize._latex_to_plain`: the `\text{}` unwrap now runs **before** the
superscript rules, because `$^{\text{b}}$` has nested braces that `[^}]*`
cannot span, so both superscript rules missed and left a bare `\b`.  Took
p400-p499 to 3 residues and p600-p699 to 0.

⏳ **Still outstanding**: 2,104 LaTeX commands and 1,202 braces remain, almost
all in p300-p399, p100-p199 and p700-p799, and they are the *same* forms
appearing **outside** `$…$` delimiters — `681^{b} 10.`, `\theta\rho\epsilon…`
as running text.  `_latex_to_plain` only rewrites `$…$` runs.  The fix is a
second pass over undelimited text, which needs care not to mangle real prose.

Latin `o` for omicron is **not** a problem: it is pre-existing (17.4% of
omicrons in the old output, 14.0% in the new) and `normalize.canonical`
already folds it before anything is compared.

## LlamaParse re-read — `bonitz_pipeline/llama400.py`, 2026-08-07

Pilot on three of the worst-flattened pages, three ways.  `ȣ` counts:

| page | 300 dpi base | 400 dpi base | 400 dpi **strict** |
|---|---|---|---|
| 047 | 34 | 0 (`ου`×25) | 12 (`ου`×11) |
| 106 | 30 | 43 | **0** |
| 152 | 28 | 5 (`ου`×7) | **72** |

**Run-to-run variance swamps both the scan and the prompt.**  Page 106 went
30 → 43 → 0; page 152 went 28 → 5 → 72.  Nothing about the input explains that.

Page 152's 72 is genuine, not hallucinated — `βȣ́λεσθαι`, `Βορυσθένȣς`, `ȣ̓κ`,
`τȣ͂`, `ἐνιαυτȣ͂`, `οἰνȣ͂τταν`, `πολύπȣς`, `καράβȣ`, `βȣβαλίδος`, breathings and
circumflexes correctly placed.  The ceiling is high when the roll lands.

**Why the old health note said retries were byte-identical: LlamaParse caches by
file hash.**  Re-running the same PDF returns the cached result, so retrying a
bad page did nothing.  A *different* file — the hi-res page — is a fresh roll.
That reframes "re-running past the first retry is wasted credits": it was wasted
because of caching, not because the model had converged.

⇒ **Strategy: best-of-N, not prompt engineering.**  Parse each page 2-3 times
and keep the run with the most ligatures.  Missing them is common and inventing
them appears rare, so the count is a usable gate.  Two new failure modes to
record, both distinct from flattening:

- **EXPANSION** (`ȣ` → `ου`, page 47 base did it 25 times).  Less destructive
  than flattening — the reading survives and the comparator sees a disagreement
  rather than a silent 3-0 agreement — but still wrong diplomatically, and
  indistinguishable from a genuine printed `ου`.
- **Empty result reported as success.**  LlamaParse swallows credit-exhaustion
  and event-loop errors and returns an empty document instead of raising, which
  the first version of this runner wrote out as five clean files reporting
  `0lig/0flat` — indistinguishable from a perfect parse.  Guarded now (<200
  chars is refused).  Also: construct a fresh parser per page, or every page
  after the first fails with "Event loop is closed".

## A second engine, if one is ever wanted

**PyLaia is blocked on this machine.**  It hard-depends on
`nnutils-pytorch-cuda`, which has no macOS build at any version, and its older
releases pin `torch>=1.13,<1.14` against our 2.13.  That is a platform problem,
not a Python-version one: it means a separate venv *and* building
`nnutils-pytorch` from source on Apple Silicon.

Also a design objection worth settling before any install: PyLaia's real edge
over kraken is **LM-boosted decoding**, which is exactly the property the
handoff argued against — kraken is valuable as a reader precisely because
nothing can talk it into plausible Greek.  Run it LM-free to keep it a genuine
fourth reader, or put it in the adjudicator slot deliberately.  Decide which.

**Calamari works, on a pinned Python 3.11.**  Verified 2026-08-06:

```sh
uv venv --python 3.11 ~/.venvs/calamari
uv pip install --python ~/.venvs/calamari/bin/python calamari-ocr
```

resolves `calamari-ocr 2.3.1` + `ocrd-fork-tfaip 1.2.7` + `tensorflow 2.15.1`,
83 packages, with a native `tensorflow-2.15.1-cp311-cp311-macosx_12_0_arm64`
wheel — no Rosetta, no source build.

The version ceiling is not Calamari's, and the docs' "Python3.7 or later" will
mislead you: `ocrd-fork-tfaip` caps `tensorflow<2.16`, and 2.15 is the last
release shipping cp311 wheels.  On 3.13 pip silently backtracks to Calamari
1.0.5 (2021); on 3.14 to 1.0.2 (2020); on 3.7 the era's TensorFlow has *no*
Apple Silicon wheel at all, so 3.7 is the worst choice available, not the
safest.  Calamari's own design point is training an ensemble and voting across
it, which fits the reader-panel shape of this project.

## What to check when the model comes out

`ketos test` gives one CER; it is not sufficient.  `kraken_eval.py` reports
recall for `ȣ` (1,784 in the ground truth), `ϗ` (663), each combining mark, and
the digits that carry Bekker references, plus the top confusions.  A model at
1% CER that drops breathings is not usable.  The pilot baseline for a generic
model was 19.7% CER on page 15-L.  Under ~0.5% is suspicious rather than good:
the ground truth is consensus-plus-spot-review, and its noise is the ceiling.

## Codex (gpt-5.6-sol) as a reader — measured 2026-08-07

Codex budget turned out to be ample, so the fourth-reader question got tested
directly.  `work/codex/` holds the prototype: `reader-prompt.md` (60 lines, the
first third on ȣ and ϗ), `read-column.sh` (book.pdf strips), and now
`read-column-400.sh` + `make_strips400.py`, which cut the 1870 archive.org
columns to the same geometry `batch3.make_strips` used, so the scan is the only
changed variable.  Scored with `work/codex/score.py`.

| column | scan | CER | edits | folded | ȣ | ϗ | tokens |
|---|---|---|---|---|---|---|---|
| 052-L | book.pdf | 2.162% | 56 | 1.653% | 14/23 | 1/4 | 43.5k |
| 052-L | 400 dpi | **1.042%** | 27 | 0.538% | **22/23** | 4/4 | 26.6k |
| 015-L | 400 dpi | 1.573% | 27 | 1.451% | 5/6 | **0/5** | 20.5k |
| 020-L | 400 dpi | 1.238% | 33 | 0.970% | 7/9 | 7/7 | 15.5k |
| 030-R | 400 dpi | 1.665% | 47 | 1.480% | 12/14 | **0/9** | 28.3k |

**The scan halves Codex's error rate.**  On the one column comparable both ways,
CER 2.162% → 1.042% and ȣ recall 61% → 96%.  This was predicted *not* to help —
the book.pdf failures looked generative, not perceptual (`ἀκηκοέναι` →
`διακονεῖν` shares three letters; `περὶ τȣ͂ δικαίȣ` → `περὶ τὸ δίκαιον`).  Wrong:
legible ink removed most of the substitution too.  It was guessing because it
could not see.  It is also cheaper — 15–30k tokens per column, not 43k.

**The ϗ failure is per-column all-or-nothing, and only sometimes recoverable.**
Recall was 0/5, 7/7, 0/9, 4/4 — never partial.  That is one decision made per
read and held consistent down the column, not a perception limit, so it should
vary between samples.  It does, but unevenly:

    030-R:  0/9,  0/9,  9/9   <- best-of-3 recovers it (r3: CER 1.311%, folded 0.634%)
    015-L:  0/5,  0/5,  0/5   <- stuck

Adjudicated against the 400 dpi ink at line 17 of 015-L: the glyph is plainly
`ϗ̀`, kappa with the descending tail under a grave, no eta bowl and no
breathing.  **Gold is right; Codex is wrong, deterministically, on that
column.**  The substitution it reaches for is `ἢ` — a connective for a
connective, the same semantic-neighbour move as `ἀκηκοέναι` → `διακονεῖν`.

Selection by ligature count (`llama_best.py`'s rule) picks r3 on 030-R
correctly, so best-of-N is the right harness here as it was for LlamaParse.  It
does not rescue 015-L.

**Prompt defect, not yet fixed:** on 052-L Codex wrote `ϗ̀` at all four sites
where the ink has bare `ϗ`.  `reader-prompt.md` lists `ϗ̀` in its
correct-examples block and the model copied the grave, so the 4/4 above
overstates.  Cut the accented example, and state the ban on emitting `ου`/`ἢ`
for a ligature rather than teaching it by example.

**Caveat on every number here.**  Gold is the Opus spine with adjudicated
verdicts applied (`reconcile.py`), so it cannot be used to score Opus at all —
Opus "scores" 0.039% on 052-L by construction.  Codex never saw it, so its CER
is fair, but gold's own residual error is the floor, and Codex has already
caught real gold errors: `ἀμφιφαής`→`ἀμφιφανής`, `1270b89`→`b39`,
`(int εἰσὶν)`→`(inf εἰσίν)`.  Some of the 27–47 edits above are Codex being
right.

### Codex's ϗ vote is noise; its ȣ vote is sound (2026-08-07, later)

Prompt v1 said "Type ϗ, never καί or κ" and listed `ϗ̀` among the correct
examples.  It under-produced (0/5 and 0/9 on two gold columns) and copied the
example's grave onto bare `ϗ`.

Prompt v2 tried to fix that by banning `ἢ` outright and restating "never καί".
**That overcorrected into the opposite error.**  On 053-L, sample r2 wrote `ϗ̀`
and `ϗ́` over `καὶ`/`καί` SPELLED OUT IN FULL — verified against the 400 dpi ink
at lines 29 and 32 (`tamen καὶ εἰ, veluti ψβ3.` / `ubi καί pertinet ad
vocabulum`).  Bonitz prints both forms, often on one page, and for a diplomatic
edition manufacturing the ligature is as wrong as dropping it.

Three samples of one column, same prompt, gave **ϗ = 5, 1, 0 where the truth is
2**.  So the earlier "all-or-nothing per column" reading was wrong: it is not a
policy held consistently down a column, it is instability, and v2 made it
bidirectional.

ȣ behaves completely differently and well:

| | codex samples | kraken | opus |
|---|---|---|---|
| 053-L ȣ | 9, 7, 8 | 9 | 10 |
| 053-L ϗ | **1, 5, 0** | 2 | 2 |
| 053-R ȣ | 15, 15 | 15 | 17 |
| 053-R ϗ | **1, 1** | 2 | 2 |

Consequences, all applied:

- `codex_best.py` ranks on **ȣ only**.  Ranking on ϗ, or on ȣ+ϗ, would have
  picked r2 on 053-L — the sample that invented three ligatures.
- Prompt v3 states that both forms occur and the printed one governs, with a
  letter-count test (three letters = καί, one tailed glyph = ϗ).
- **Codex's ϗ vote should be muted in the panel**, the way `compare4` mutes
  kraken below page 53.  Not yet implemented — needs John's call, since it
  means the fifth reader abstains on the character the panel most cares about.
- The `ϗ == 0` escalation signal in `adaptive.py` still works as a *detector*
  (kraken and Opus see 2-14 ϗ in every column of 53-62 and agree everywhere but
  057-R), but it cannot detect over-production, so it is a half-measure.

Cost so far on 53-62: 5 reads, 144,788 tokens, **mean 28,957/read** — well above
the 22k projected from gold.  Full best-of-3 on the 20 columns would be ~1.74M.

### Prompt v3, and the ruling on Codex's ϗ vote

v3 replaces v2's absolutism ("never καί") with the fact: both forms are printed,
often on one page, and the printed one governs — plus a letter-count test
(three letters = καί, one tailed glyph = ϗ).

| | v2 | v3 | truth |
|---|---|---|---|
| 053-L ϗ | 1, **5**, 0 | 1, 1 | 2 |
| 053-R ϗ | 1, 1 | 1, **2** | 2 |
| 053-L ȣ | 9, 7, 8 | 8, 7 | 9-10 |
| 053-R ȣ | 15, 15 | 15, **16** | 15-17 |

**Invention is gone** — no v3 sample exceeds the true count.  What remains is
under-counting at hard sites: both v3 samples read `ἢ` at 053-L line 58, where
the ink plainly shows a kappa-form dropping below the baseline (the `κη-`
immediately after it does not).  kraken and Opus are both right there.

This restores the premise best-of-N needs, and it matters for the panel: a
**miss** costs Codex a vote and lets the other four settle the character, while
an **invented** ϗ actively outvotes correct readers.  Misses are the safe
failure; inventions are not.

**John's ruling, 2026-08-07: Codex's ϗ vote stays UNMUTED.**  This run is its
evaluation as a reader in the mix, and muting the character it is weakest on
would grade it on a curve.  No code change — `compare4` mutes only kraken, and
only below page 53.

v2 samples are kept in `work/codex/v2/` as the evidence for the invention
finding; the best-of pool globs only the live directory, so prompt versions
never mix in one selection.

## The five-way run, pages 53-62 (2026-08-07)

Codex read all 20 columns at best-of-1 (19 of 20 columns had a single sample;
053 had two from the v3 validation).  **22 reads, 605,967 tokens, mean 27,543.**
Line counts matched Opus 61/61 on every column — zero strip-boundary errors.

### Cost, extrapolated

| reader | tokens for the full 1,742-column Index |
|---|---|
| Codex, best-of-1 | **~48M** |
| Opus, at 170k-310k/column | ~296M-540M |

Codex is **6-11x cheaper than Opus per unit of coverage.**

### Head-to-head on John's 18 rulings

| reader | exact | fold-only | wrong |
|---|---|---|---|
| llama | 18 | 0 | 0 |
| **codex** | **17** | 0 | 0 (+1 correct inside a wider region) |
| kraken | 16 | 2 | 0 |
| genie | 14 | 4 | 0 |
| opus | **0** | 0 | **18** |

Codex's item 12 has no matching five-way region — its span is wider
(`ΐωνὡ` against Opus's `ίωνυἱ`) and the `υἱ`->`ὡ` ruling is answered correctly
inside it, alongside an unrelated diacritic slip (`ΐ` for `ί`).  Genie's four
fold-only results are all ligature expansions (`ὡςοὐ`, `οῦβελ`, `ου`, `ὁμοῦ`) —
the repertoire gap, not a misread.

### What the fifth vote did to the panel

| class | four-way | five-way |
|---|---|---|
| 2-2-split | 46 | **18** |
| all-differ | 7 | **0** |
| spine-outvoted | 26 | 41 |
| majority-spine flagged | 275 | 357 |
| **total flagged** | **354** | **416** |

**It broke 28 of 46 deadlocks and resolved all 7 all-differ regions** — 35 cases
that carried John's "no majority, no guess" rule and therefore required hand
adjudication against the ink.  It cost +62 flags, most of them lone-dissent
ligature regions where four readers agree and Codex is outvoted 4-1.  Those are
far cheaper to dismiss than a 2-2 deadlock is to resolve.

### Lone-dissent rate — the reliability ranking

Regions where one reader disagrees and the other four agree, out of 1,197:

| reader | alone | flagged | ligature-involved |
|---|---|---|---|
| **opus** | **18** | 18 | 3 |
| kraken | 82 | 38 | 1 |
| llama | 102 | 79 | 11 |
| codex | 124 | 71 | 10 |
| genie | 224 | 88 | 0 |

Genie's 224 solo dissents involve **zero** ligatures — `fold()` masks the
expansion entirely, so its repertoire gap never shows up here.

### The Opus question, answered

Opus's 0/18 is NOT evidence that Opus reads badly, and the earlier framing of it
was too loose.  That sample is BY CONSTRUCTION the set where Opus dissents alone
— the sample maximally biased against it.

The right statement is sharper, and it comes from the two tables together:
**Opus is alone in only 18 of 1,197 regions, four times less often than the next
most reliable reader — and John's rulings say it was wrong in all 18.**  Those
18 are every solo dissent Opus makes in the whole 20-column range.  So across
53-62 there is not one region where Opus alone was right.

Its unique contribution to the panel over this range is zero, at 6-11x the cost
of the reader that replaced it.  That is the answer to the cost question that
opened this work.  Caveat that keeps it honest: regions are diffed against the
Opus spine, so the region structure is Opus-anchored, and 20 columns is 1.1% of
the book.

## Two Bonitz sigla, and why a citation parser must tell them apart

From the book's own list of editors (`book.pdf` p. VII, "Editores et interpretes
librorum Aristotelicorum his siglis significavimus"):

> **Bz.**  Aristotelis Metaphysica, rec. etc H. Bonitz. Berol. 1848.

That is an EDITION siglum, so it appears only where his edition is the text.
Confirmed empirically: all 32 citation-adjacent `Bz` in the Opus reads follow a
Metaphysics siglum (Μι3, Μγ4, Μδ5, ΜΑ1, Μλ6, Μθ4, Μμ8 …) and not one follows
any other work.  It also marks Alexander of Aphrodisias' Metaphysics commentary
in Bonitz's 1847 edition: `Alex Aphr ad Metaph 34, 2. 45, 20 Bz` (062-L).

Distinct and easy to confuse: **`Bz Ar St`** / **`Bz Ar Stud`** = Bonitz,
*Aristotelische Studien*, cited by volume and page — `St I 99`, `St II 36`,
`St IV 410`, `St II, III 1-129`, and spelled out at 057-R as `cf Bz Ar Stud I
p 70`.  This one ranges over every work because the Studien do, and it carries
his conjectures: `ci Bz Ar St I 99`, `fort ἄπειρον Bz Ar St I 67`, `scribendum
ὑποχωρεῖ Bz Ar Stud IV 401`.

**Parser hazard:** `Bz Ar St IV 402` has the shape of a citation and is not one
— no work siglum, no Bekker number, just modern scholarship.  Same failure
class as the Bekker-range check that missed `Ζιβ28`.  A third list exists for
the zoological entries ("In parte zoologica et botanica…", p. VIII) where
`Ar.` alone means *Petri Artedi Synonymia piscium* — so a bare `Ar` and the
`Ar` inside `Bz Ar St` are different things.

Front matter is NOT in `work/scan400/`, which starts at page 015.  It is in
`book.pdf` (896 pages, the 1955 reprint): PDF p. 11 = printed p. VII (editors),
PDF p. 12 = printed p. VIII (zoology/botany), PDF p. 13-14 = title and the work
sigla.  The PDF's text layer is garbage OCR; render with `pdftoppm` and read.

## The comparator is blind to the iota subscript (2026-08-07)

John's hand audit of page-037-L lines 1-37 found two corrections, both
`ζώων` -> `ζῴων`.  Chasing the class across the corpus turned up something
worse than two typos.

**`fold()` erases the iota subscript.**  `fold('ζώων') == fold('ζῴων')` and
`fold('ζώῳ') == fold('ζῴῳ')`, so the four- and five-reader panels treat the
two spellings as the same reading.  The disagreement never becomes a region,
never gets flagged, and never reaches a review page.  This whole error class
is invisible to the adjudication apparatus.

It survived because the panel is the only check and the panel cannot see it.
LlamaParse had it right **every time** — 146 `ζῴων`, 101 `ζῷα`, 38 `ζῷον`, and
not one `ζώων` or `ζώῳ` in the entire best-of run.  Opus dropped the subscript
8 times, and gold inherits Opus's error because gold IS the Opus spine with
verdicts applied.

Seven instances found and fixed in `work/reconciled/`, each verified against
the 400 dpi ink first:

    page-037-L:28,30   page-027-L:27   page-029-L:1
    page-032-L:48      page-035-R:33   page-038-L:37

`ζώντ` (2 occurrences) is correct as printed and was left alone — `ζώντων` is
the participle of ζάω and takes no subscript, while `ζῴων` is gen. pl. of
ζῷον and does.  John drew that distinction correctly by hand on 037-L, keeping
line 27's `ζώντων` while correcting lines 28 and 30.

### Consequences not yet acted on

- **Four of the seven columns are TRAINING data** (027-L, 029-L, 032-L, 038-L;
  035-R and 037-L are holdout).  The model was taught to drop the subscript at
  those four sites.  `train.arrow`/`holdout.arrow` and the `kraken400/gt/*.xml`
  PageXML are now stale by seven characters — rebuild with `kraken_corpus.py`
  before the next training run.  Seven characters in 4,303 lines will not move
  CER measurably; the point is that the ground truth should not teach an error.
- **Sweep the rest of the diacritic space.**  Iota subscript was found only
  because a human read 37 lines.  Anything else `fold()` normalises away is
  equally invisible: it strips all accents and breathings on the folded copy.
  A dedicated subscript/breathing sweep against LlamaParse — which is the
  strongest reader on marks — would find these without human time.
- Do NOT "fix" `fold()` to keep the subscript without measuring first: it
  exists to stop spacing and ligature-expansion noise from flooding the flag
  set, and tightening it will raise flag volume everywhere.

## Smyth as a validator: gold that needs no reader (2026-08-07)

Every other check here compares readers, which cannot find an error they share
and cannot find one `fold()` erases.  The accent laws need no reference at all:
some placements are impossible, so a word violating one is wrong however many
readers agree.  `bonitz_pipeline/accent_law.py` implements the deterministic
subset.

    §166   long ultima bars acute on antepenult, circumflex on penult
    §167c  short ultima + long penult accented -> circumflex, not acute
    §163   nothing accented before the antepenult

Deliberately NOT implemented, because they are contextual and this file must
produce no false positives: §154 (final acute -> grave before a following
word, so acute-vs-grave is never decidable from the word alone — John's point,
and the reason a dictionary lexicon cannot referee accent), §183a (enclitics
add a second accent; only the first is tested), §171 (contraction explains
where a circumflex sits but needs the uncontracted form).

**Encoding the exceptions is most of the work.**  153 raw violations fell to 7:

| exception | source | false positives removed |
|---|---|---|
| §163a nouns in -εως/-εων/-εω, Attic -ως | Smyth, quoted verbatim in the module | 65 |
| ὥσπερ/ὥστε/μήτε/ἤτοι — accent belongs to the first element | §186 | ~40 |
| a diaeresis forbids the diphthong (Κά-ϊ-κον) | §8 | 4 |
| line-end hyphen leaves half a word | this edition's layout | 2 |
| optative final -αι/-οι are LONG | §169 | 1 (not yet coded) |

Quantity is asserted only where certain — η/ω long, ε/ο short, diphthongs long
except word-final -αι/-οι.  α, ι, υ are ambiguous and any verdict resting on
one is skipped rather than guessed.  That is why the yield is small and every
row is worth reading.

### The six, all adjudicated against the 400 dpi ink

| column | corpus | ink | class |
|---|---|---|---|
| 021-R:37 | `ζῷων` | **ζῴων** — acute, not circumflex | misread |
| 023-R:59 | `ἄηθεις` | **ἀήθεις** — accent on η | misread |
| 050-L:1 | `αἱματώδες` | **αἱματῶδες** — circumflex | misread |
| 029-R:59 | `οἴες` | `ὄϊες`? diaeresis over the ι | misread, wants zoom |
| 033-L:54 | `δίμερῆ` | `διμερῆ`? mark may be an ink speck | misread or misprint |
| 028-L:42 | `γίνεταιὁ` | line ends `γίνεται`, `ὁ` begins the next | line-join defect |

None is a variant reading.  All five readers agreed on every one, or `fold()`
erased the difference — which is precisely why nothing else in the pipeline
could reach them.

### Where this sits in the edition

John's ordering, 2026-08-07: **diplomatic transcription first; mechanical
correction against TLG later, for a separate "revised and corrected" edition.**
So a violation that proves to be Bonitz's own misprint is RECORDED and
PRESERVED, never silently fixed.  Three classes, and only one of them is ours
to correct:

    (a) misprint in Bonitz      -> preserve; bank as corrigenda for later
    (b) misread by our readers  -> fix now, this is a defect in our work
    (c) Bonitz quoting a variant -> preserve; signposted by vl/ci/codd/fort/Bk/Bz

`accent.py` already does the TLG comparison that (a) will eventually need.
`accent_law.py` sits upstream of it, catching OUR errors before any question
of correcting Bonitz arises.

## Smyth as a battery: sixteen validators, and what the ink said (2026-08-08)

`accent_law.py` proved that a rule making a form IMPOSSIBLE needs no reference
text, so it reaches errors every reader shares and errors `fold()` erases.
`bonitz_pipeline/smyth_sweep.py` generalises that to the rest of the
deterministic space — mark placement, breathing presence, word shape — as
sixteen hard rules and two advisory ones, each with its own output file so a
rule that turns out noisy can be dropped without contaminating the others.

    python3 -m bonitz_pipeline.smyth_sweep --all      # work/sweeps/smyth/*.tsv

**First run: 545 hits.  After the false-positive pass: 13 hard, 5 advisory.**

### The 532 that vanished were four WRONG RULES, not tuning

This is the finding worth keeping.  Each of these reads as obvious Greek until
the corpus contradicts it, and three of the four were caught by putting the
rule statements to a second model (Grok) before trusting the output:

| written as | actually | cost |
|---|---|---|
| a word carries one accent | **§183c** — a proparoxytone or properispomenon takes the enclitic's acute onto its own ultima, inside its own token: `εἶναί`, `αἷμά`, `ῥάχεώς` | 124 |
| marks stand on vowels | **§13** — initial ρ is always rough, and medial ῤῥ carries two breathings on two consonants | 43 |
| a breathing on the first vowel of a diphthong is wrong | **§11 read backwards** — `ἀίδιος` is ἀ-ΐ-διος, and the breathing's position on the α is ITSELF the proof that αι is two syllables, since a real diphthong takes it on the second | 51 |
| crasis writes a smooth coronis, never a rough | **§68a** — crasis keeps the rough of the SECOND word: τοῦ αὐτοῦ is `ταὑτοῦ`, mark on the υ, two clusters in | — |

**§179 was removed outright.**  All 187 hits of "a proclitic carries no accent"
were the relative `ὅ`/`ὃ` and the disjunctive `ἤ`, which fall onto the article
`ὁ`/`ἡ` the moment accents are stripped.  Telling a relative from an article
needs the sentence, not the word, so the rule cannot work at this altitude.

### The guards, and what each one costs

- **siglum** — a Greek letter-run with a number after it, space allowed, because
  this book sets `Ζμγ4` and `Ζμδ 5` on the same page.
- **label** — a run of ≤4 letters with neither accent nor breathing is not a
  word but a work-siglum, a term-letter (`ΑΒΓ signa terminorum`), or a lemma
  ending being declined (`ἄκρος, α, ον`).  Price: `αλλα` at 032-L:1 is a real
  defect and is now silent.
- **truncated / continues** — a word broken at a line end is two fragments and
  neither is a word.  ⚠ This has to cross the COLUMN boundary too: page-020-R
  ends `ἀδιανοητό-` and page-021-L opens `τερον`, which the ink check exposed
  as a false positive before the fix.
- **apos** — this typeface sets the breathing as its own sort before a capital,
  and the token regex opens on a Greek letter, so `'Αλκμαίων` matches from the
  alpha and leaves its breathing behind.  Nine proper names looked breathless.

### Adjudicated against the 400 dpi ink, 2026-08-08 — 8 of 9 confirmed

| site | corpus | ink | rule |
|---|---|---|---|
| 033-L:40, :59 | `ȣ̈δὲν` | **`ȣ̓δὲν`** — a smooth breathing, not a diaeresis | A3 §8 |
| 036-L:48 | `ῥόδόν` | **`ῥόδον`** — second ο bare; and `ἐστί` after it carries its own accent | A6 §183c |
| 021-L:57 | `τὰδική-` | **`τἀδική-`** — the mark is a CORONIS, the same glyph as the smooth on `ἀδικεῖν` beside it: crasis of τὰ ἀδικήματα | A6, B1 |
| 033-L:54 | `δίμερῆ` | **`διμερῆ`** — the ι is bare | A6 §183c |
| 028-L:42 | `γίνεταιὁ` | **`γίνεται ὁ`** — plainly spaced | A7 |
| 019-L:15 | `δηλȣ͂σ ίτ ιϗ̀` | **`δηλȣ͂σί τι ϗ̀`** — the word boundaries slipped one character | A8, C1, D1 |
| 052-R:26 | `ττȣ̀ςς` | **`τȣ̀ς`** — τ and ς both doubled | A8 |
| 027-R:36 | `αἰθριαζει` | **`αἰθριάζει`** — the acute is there | E1 §170 |
| 032-L:1 | `πασχει` | **`πάσχει`** — faint but present | E1 §170 |
| 026-L:7 | `Ἰῳ` | **`Ἴῳ`** — two marks set before the capital, breathing AND acute | E1 §170 |
| 026-L:61 | `αἰδε` | the ink has **`αἰδε-`**; the corpus dropped the line-end hyphen | E1 (indirect) |
| 031-R:10 | `ὑς` | ⏳ **UNRESOLVED** — the glyph reads υ + ι-with-rough + ς, which is no word; the known `υἱ`/`ὡ` confusion of this face makes `ὡς` likely.  Wants John or wider context. | E1 |

**`τἀδική-` and `διμερῆ` are the two that matter.**  The first settles a
coronis misread as a grave — and `fold()` strips both, so no panel of any size
could have surfaced it.  The second closes the `δίμερῆ` question left open on
2026-08-07 as "mark may be an ink speck": it is not there, and §183c proves it
could not be, since acute-plus-circumflex is not a shape an enclitic produces.

### What this buys over the reader panel

Every hit above is a place where all five readers agreed, or where `fold()`
erased the difference.  The panel could not have reached one of them.  Cost:
one afternoon, no tokens per column, and it runs over all 1,742 columns for
free — where the five-reader panel costs ~48M tokens for the cheapest reader
alone.  The rules do not scale with the book; they are a fixed cost.

⚠ Sixteen rules over 26,254 Greek tokens returning 13 hits is a claim about
the CORPUS, not proof the rules are right.  76 columns is 4% of the Index, and
a rule can be clean here and wrong at scale — dialect quotations (Empedocles,
Alcman), capitals with adscript iota, and Bonitz's Latin are the places to
expect it.  `tests/test_smyth_sweep.py` holds every counter-example found so
far as a regression, 66 of them.

### Cross-model check of the rulings (Grok, 2026-08-08)

The nine rulings went to a second model on GRAMMAR AND SENSE alone, without the
image — the point being to catch a reading that is plausible on the page and
impossible in Greek.  Eight agreed.  Two results are worth recording.

**⚠ The one disagreement was the reviewer's error, and the ink settles it.**
Grok called `ῥόδον` proparoxytone and therefore expected `ῥόδόν ἐστι` by §183a.
ῥόδον is **two** syllables — ῥό-δον, paroxytone — and §183 gives the extra
acute only to a proparoxytone or a properispomenon.  A paroxytone receives
none, and a DISYLLABIC enclitic then keeps its own accent.  Which is exactly
what the page shows: `ῥόδον ἐστί`, the ἐστί accented.  So the accented ἐστί is
positive evidence for the correction rather than, as the review supposed, a
separate typesetting inconsistency.  General lesson, and it cuts both ways with
the ligature work: **verify the reviewer's claim before acting on it.**

**✅ 031-R:10 resolved by the source, not by the scan.**  The glyph reads
υ + ι-with-rough + ς, which is no word; the sense wanted something the ink
would not give up.  *An. Pr.* II.21, 67a39-b3 reads

> οὐδὲν γὰρ τῶν αἰσθητῶν ἔξω τῆς αἰσθήσεως γενόμενον ἴσμεν … ἀλλ' οὐχ ὡς τῷ ἐνεργεῖν

so Bonitz is excerpting that collocation and the word is **`ὡς`**.  This is the
`υἱ`/`ὡ` confusion of this face that John already ruled on once (verdict item
12, pp.53-62).  ⏳ Left UNAPPLIED: the reading rests on the parallel and on a
known glyph confusion, not on the ink, which I could not read either way.
John's call.

Also confirmed against `syllables()`: `δηλοῦσι` is δη-λοῦ-σι, properispomenon,
so `δηλοῦσί τι` at 019-L:15 takes its second accent by §183a — the corrected
reading is right for a reason the corrupt one could not have been.

### Adversarial code review (Codex, 2026-08-08) — five behaviour bugs

Codex was given the module and the corpus and told to attack it.  Twelve
findings; the five that changed behaviour, and one thing the fixes then taught:

- **Capital rho.** `Ῥήτωρ` decomposes to a CAPITAL Ρ, and A4/A7 special-cased
  only lowercase ρ.  Every capitalised rho-word in the book would have flagged
  — and an index is mostly proper names.
- **Capital finals.** `FINAL_OK` held uppercase vowels but not Σ Ν Ρ Ξ Ψ, and
  D1 compared the raw character rather than its lowercase.  `ΛΟΓΟΣ` was
  impossible Greek to the rule.
- **`ῥινοῤῥαγία`.** A5's ῤῥ exception was written as "exactly two adjacent
  marked rhos", so an initial rough ON TOP of the pair — three breathings, all
  correct — still flagged.  A5 now counts breathings on VOWELS and leaves rho
  to A4.
- **The siglum guard was far too broad.**  Any Greek token before a number
  became a label, so `ἀλώπηξ 1.` — a fully accented lemma before its sense
  number — was silenced, and this index numbers senses throughout.  A siglum
  is a LABEL: the guard now also requires the token to be unaccented and
  unbreathed.  **That narrowing surfaced `ἀν7` at 047-R:20**, a siglum wearing
  a breathing the same siglum lacks 20 times elsewhere in the corpus.
- **Line numbers pointed into a filtered text.**  `clean_opus` drops running
  heads and signatures, and the sweep enumerated the RESULT — so every row
  below a dropped line would have sent the reader to the wrong line of the
  scan.  It drops nothing in the present 76 columns, which is exactly why it
  had to be fixed before it silently mattered.

**⚠ Fixing the siglum guard created a new false-positive class, and only the
ink showed it.**  `φόνοιΠβ4.1262a26.` and `θερμότητοςΖμβ2` were then flagged as
words ending in β.  The 400 dpi page shows the printer sets them exactly that
tight, no space at all — the same justification-not-meaning finding as the
Bekker spacing.  So the corpus is faithful and the rule was wrong.  Handled at
the tokenizer: **a capital behind a lowercase letter is a word boundary the
setting lost**, so the token splits, and `ΑΒΓ`/`ΑΖγ` stay whole because their
capitals do not follow a lowercase letter.

Also from the review, and worth keeping as method: **the sweep now writes
`_labels.tsv`** — 986 tokens the label guard hides from every rule.  A sweep
that bounds its own coverage has to say what it bounded, or a clean report
reads as "nothing there" when it means "nothing looked at".  And three hard
rules had only NO-flag tests, so replacing their bodies with `return None`
would have passed the suite; every hard rule now has a positive case.

### State after the corrections

12 corrections applied to `work/reconciled/`, each verified against the 400 dpi
ink and cross-checked on grammar by a second model.  **All sixteen hard rules
now report zero over the corpus.**  Two left for John, neither applied:

- `031-R:10` `ὑς` -> **`ὡς`**, on the *An. Pr.* II.21 parallel and the known
  `υἱ`/`ὡ` confusion of this face.  I could not read it from the ink.
- `047-R:20` `ἀν7` -> **`αν7`**, condemned by the corpus's own 20-to-1 usage
  rather than by the page; the line-match against the PageXML failed on that
  column, so no crop was made.

⚠ The kraken corpus is now **69 characters** behind `work/reconciled/`, not 57.

## The ligature exclusion lifted, and the adjudication record put to work (2026-08-08, later)

### ⚠ A correction to this morning's entry

`αλλα` on 032-L:1 is NOT "a real defect the label guard hides".  **John ruled
it on 2026-07-25** — *"the print has no breathing AND no accent, a printer's
error, recording as printed"* (`tests/fixtures/john-rulings.json`,
`breathing/declined`).  The guard was protecting a ruling, and had the guard
been lifted the sweep would have overwritten it.  Comment and note corrected.

### The accent rules now reach the ligature words

`expand()` rewrites `ȣ`->ου and `ϗ`->και in NFD with the marks moved onto the
diphthong's second vowel (§11), so `syllables()` and `quantity()` work
unchanged.  A6, B1, B2, B6 and the new **B7** (accent_law's §163/§166/§167c,
reached on ligature words) no longer abstain.  This recovered **2,138 words,
1,920 of them accented — 9.5% of the corpus**, and it is exactly the vocabulary
the project exists to get right.

Five defects found and confirmed against the 400 dpi ink:

| site | corpus | ink |
|---|---|---|
| 018-R:56 | `δῆμȣ` | **`δήμȣ`** — plain acute on the η.  §166: δήμου's ultima is long, so the penult cannot take a circumflex |
| 025-L:51 | `δȣ̀ναι` | **`δȣ͂ναι`** — the mark is wavy, against the straight graves on `τὰς τιμὰς` beside it |
| 032-L:26 | `ȣ̀δὲν` | **`ȣ̓δὲν`** |
| 032-L:55 | `ȣ̀κ`, `ȣ̀δὲ` | **`ȣ̓κ`, `ȣ̓δὲ`** — both carry the smooth, same glyph as the smooth on `ἔστιν` in the same line |

⏳ Not applied: `κατέρȣμέρȣς` on 052-R:21, part of the `τέρἑ κατέρȣμέρȣς`
splice already known on that column and wanting a wider repair than one word.

**A false positive the extension exposed:** Bonitz SPACES his ellipsis —
`ἅμα ϗ̀ . . ϗ̀ μδ9` on 049-L:1 — so B2's unspaced `..` test missed it and the
grave looked like it stood before a full stop.  Guarded.

### ⏭ The C1 ligature exemption is hiding ~200 dropped breathings

C1 skips ligature-initial words on the authority of `work/codex/reader-prompt.md`
("it routinely carries an accent with NO breathing").  That is true of `τȣ͂`,
which is not word-initial.  A WORD-INITIAL `ȣ` is always an οὐ-/οὑ- word and
§9 gives it a breathing without exception.  The evidence:

| | breathing | none |
|---|---|---|
| `work/reconciled` | 126 | **200** (170 bare, 9 acute, 8 grave, 13 circumflex) |
| LlamaParse, strongest reader on marks | 625 | 96 |

and the ink has it at every site checked — 024-R:17 twice (`ȣ̓σία` … `ȣ̓σία`),
032-L:55 twice.  The bare ones are οὐδείς, οὐσία, οὔτε, οὐδεμίαν, οὕτως, οὗτος.
**John's call**, because lifting it contradicts the reader prompt and
`breathing.py`'s `test_silent_on_ligature_initial_words`, and it is a ~200-site
batch rather than a dozen.

## The adjudication record is a corpus of its own — `verdict_drift.py`

Three stores, none of which was being checked against the text after the fact:

| store | size | what it is |
|---|---|---|
| `work/adjudicated/*.json` | **1,663** rulings, 84 columns | ctx + verdict + note, per region |
| `tests/fixtures/john-rulings.json` | 44 | John's hand rulings, 2026-07-24/25, INCLUDING declined ones |
| `work/verdicts/verdicts-053-062-full.json` | 18 | the five-way range |

`reconcile.py` applies the 1,663 once at build time and nothing looks at them
again, so any later pass over `work/reconciled/` can overwrite a place a human
already decided and leave no trace.  **`bonitz_pipeline.verdict_drift` checks
whether each ruling still holds.**  Of 1,550 checkable:

    1138  intact
     368  context moved, ruling intact
      26  ruling honoured, marks differ
      11  deletion ruling — not checkable this way
       7  RULING LOST

⚠ **Two false signals had to be removed before that number meant anything**, and
both are worth remembering.  Comparing the verdict without `canonical()` called
every ligature ruling lost, because the verdicts were written with combining
TILDE and the corpus uses perispomeni.  And most verdicts rule the ligature
IDENTITY — the notes read "ϗ raw", "kai-ligature ϗ" — and record it without its
grave, so `ϗἀπαθ` looks lost where the corpus has `ϗ̀ἀπαθ` and is honouring the
ruling exactly.  82 -> 33 -> 7.

**Separately, `test_john_rulings` is FAILING on two of the 44**, and has been
since before this session: `ἀλίσκεται` (044-R:15) and `ἀλίζειν` (044-R:26) were
both ruled KEPT — different roots that merely sit in a ἁλι- entry — and both
have since been given a rough breathing.  A correction moved away from the ink.

## Diplomatic discipline restored, and the corrigenda register (2026-08-08, evening)

**Reverted, on John's instruction.** `ἀλίσκεται` (044-R:15) and `ἀλίζειν`
(044-R:26) were ruled KEPT in July — different roots that merely sit in a ἁλι-
entry — and had since been given a rough breathing.  Restored; all 42
`test_john_rulings` cases pass again.

**`work/corrigenda/`** now exists, with the (a)/(b)/(c) contract written down
where the next agent will find it.  A sweep hit is not a licence to edit: the
ink decides, class (b) is fixed, class (a) is PRESERVED and banked for the
revised edition.

### The 25 non-diacritic sites, worked against the ink

| site | outcome |
|---|---|
| 052-R:21 `τέρἑ κατέρȣμέρȣς` | **(b) fixed** -> `τέρȣ μέρȣς`; the ink reads `ἑκα-`/`τέρȣ μέρȣς` and the corpus had duplicated the line-break fragment |
| 029-R:59 `οἴες` | **(b) fixed** -> `οἶες`; the ι carries the same smooth+circumflex as `αἶγες` beside it.  Closes the last accent_law violation, and the July guess `ὄϊες`/diaeresis was wrong |
| 047-R:20 `ἀν7` | **(b) fixed** -> `αν7`; bare alpha in the ink, as this siglum is written 20× elsewhere |
| 035-L:39 `κακȣ͂ν` | **(a) PRESERVED + RECORDED** — see below |
| 017-R:30 `αιϗἄφθαρτα` | **no action**; the ink reads `ȣ̓σίαι ἀγένητοι ϗ̀ ἄφθαρτοι` and the corpus agrees.  The recorded verdict is an imprecise transcription of the span, not a ruling to restore |
| 035-R:19 `ὑπολείποι` | **dismissed**; §169 optative final -οι is long, a known false positive |
| 031-R:10 `ὑς` | ⏳ John — `ὡς` on the *An. Pr.* II.21 parallel, unreadable from the ink |
| 5 drift + 13 ligature | ⏳ not yet worked |

### ⚠ First corrigendum, and it revisits a July ruling

`035-L:39` prints **`κακȣ͂ν`** where the sense requires `κακῶν` (gen. pl. of
κακόν; the ligature spells ου, which is no word here).  John ruled "κακῶν
(omega)" in July — but that was against the 300 dpi 1955 reprint.  At 400 dpi
the glyph is **identical to the ligature in `τȣ̀ς` on the same line** and unlike
the ω of `ἀνωλέθρον`.  The compositor set the ligature where an omega belongs.

So it is the printer's error, not ours: **preserved as printed, recorded in
`work/corrigenda/entries.json` for the revised edition.**  This is the general
case of the rule already established for damage rulings — *a ruling made
against the 1955 reprint is a statement about that scan, not about the ink* —
and it is the first time it has reversed a reading rather than a damage call.

## ⚠ The siglum blind spot — John's question, 2026-08-08

**Do the rules except Greek abbreviations?  Only two of eighteen.**  D1 (§133
final consonant) and E1 (§170 accent presence) skip a token followed by a stop,
because an index abbreviates its headword (`ἀδ.` for ἀδύνατον).  A8 and the
accent rules have no such guard.  Latent, not live: of the 158
abbreviation-shaped tokens in the corpus none ends in medial σ and none carries
an accent, so nothing fires today.  It will at scale.  ⚠ The naive fix is worse
than the gap — 319 of the period-followed tokens are ordinary sentence-final
words (`αἴσθησις.`), and guarding on the stop alone silences every one.  The
real discriminator is that an abbreviation is a truncation of its ENTRY's
headword, which `alphacheck.reconciled_headwords` already knows how to find.

**But the deeper hole is the opposite one, and John named it: `Ζιι` does not
get flagged — and neither does a misread siglum.**  `siglum` and `label` exempt
ANY siglum-shaped token, so the guard that correctly protects `Ζιι` blinds
every rule to `Ζμ`/`Ζυ` in its place.  That is precisely the `Ζιβ28` failure of
2026-08-06: three readers wrong, no check fired.  A blanket exemption cannot be
fixed by more exemptions; it needs a POSITIVE inventory.

### The inventory now exists — `work/sigla/work-sigla.json`

Bonitz's own list, transcribed from `book.pdf` PDF p.14 at 300 dpi: 48 work
sigla.  A citation siglum is **WORK + BOOK NUMERAL**, so every vowel inside one
is accounted for in exactly two ways — as part of the work siglum (αι, ακ, αν,
αρ, ατ, εν, ε, ηε, ημ, ο, υ …) or as a Greek alphabetic book numeral.  Anything
else is a misread.  Case is Bonitz's own and is significant: Ζι/ζ, Μ/μ, Ο/ο,
Π/π, Ρ/ρ, Φ/φ, Κ/κ are different works.

First pass over 5,015 citation sigla: 4,261 parse, 754 do not.  Most of that
754 is the parser, not the corpus, and each gap is a real feature of the
notation to model:

- **bare book letters** (δ×95, γ×94, β×82, ι×49, α×48 …) — a continuation
  citation drops the work siglum and inherits the previous one
- **`Ααβ` / `Αγδ` / `τα-θ` are RANGES**, so Αα Αβ Αγ Αδ and τα…τθ are all valid
- **Metaphysics books are LETTER NAMES**, not numerals — ΜΑ, Μμ, Μν

### ✅ Two real finds already

- **`Ζυ` ×3**, the misread NOTES warned about.  The Bekker number decides which
  correction: `Ζυ15. 616a11` and `Ζυ34. 619b31` are both in HA book ι, so they
  are **`Ζιι`**; `Ζυ6. 700b20` is 698a-704b, *de motu animalium*, so it is
  **`Ζκ`**.  All three want the ink before applying.
- **stigma read as final sigma**: `πκς` ×2 and `κς` ×1 against `πκϛ` ×14 and
  `κϛ` ×2.  The numeral 6 is ϛ; ς is a misreading of it.

⏭ Build `siglum_check.py` on this inventory — work must be in the list, book
numeral must be valid, and the Bekker number must fall in that book's range.
That last clause is what would have caught `Ζιβ28`.

## Provenance: a private git for the text, and what kraken can and cannot tell us

**The history was there all along.**  `work/reconciled` IS tracked by the
aristotle-reader repo (commit `4400f3b4a`, "track the transcription, which
.gitignore was silently swallowing").  An earlier check this session ran from
inside `bonitz/` with a doubled path prefix and found nothing — my error.  So
every edit since HEAD is recoverable: **35 columns, 75 word-level changes, and
no column changed its line count.**  57 diacritic-only, 8 word-boundary, 7
letters, 2 deletions, 1 insertion.

**`/Users/johnboyer/Developer/bonitz-text.git`** now holds the text record on
its own, per John: separate git dir, work tree pointing at `bonitz/`, so
nothing is nested inside the aristotle-reader checkout and main is not
carrying an OCR project's working state.  370 files, 1.8 MB — transcription,
verdicts, corrigenda, sigla, the pipeline, its tests and NOTES.md.  The 3.4 GB
of scans, models and derived corpora stay out.

    git --git-dir=~/Developer/bonitz-text.git \
        --work-tree=<...>/bonitz status

### ⚠ kraken DOES skip lines — and the preds on disk are not a full read

John's question, and the answer is worse than it looks.  Comparing every
`work/kraken400/sweep/*.pred.xml` against its column: **42 of 75 disagree, the
worst by 12 lines**, and the -12 is systematic — a 61-line column reads 49, a
62-line column reads 50.

That is not kraken failing.  **12 is exactly the count of Bonitz's marginal
line numbers in a 61-line column** (every fifth line, 5 … 60), and the `pair`
stage drops those as digit-contaminated.  So the sweep's predictions cover the
PAIRED subset, not the column: they omit every fifth line by construction.

Consequences, both of which matter for the siglum work:

- **A siglum sweep must not reuse these preds.**  It would silently skip ~20%
  of lines, and the numbered lines are exactly where a marginal number sits
  next to a citation — the highest-risk position in the book.
  Re-read whole columns instead:
  `kraken -d cpu -i col.png out.txt segment -bl ocr -m m-best-epoch09.safetensors`
- **Never align kraken to the corpus by line index.**  Match on text, the way
  `review4.crop` and `crop_sites.py` already do.

Why kraken is nonetheless the right reader for sigla: a siglum is meaningless
to a language model, so Opus, Genie and LlamaParse get talked into a plausible
one — that is exactly how `Ζιθ28` was lost by all three and read correctly by
kraken alone.  On the classes a siglum is made of, kraken measures 99.90% on
Bekker digits and 99.48% on column letters.

## ⚠ The family propagation, reverted — 38 corrections nobody had checked (2026-08-08)

John's question — *have we fixed all the possibly wrong corrections?* — and the
answer was no.  Two had been caught only because a test happened to watch them.

**38 more smooth->rough changes were found by diffing `work/reconciled` against
HEAD**, spread over 12 columns.  **None of them is one of John's rulings.**  His
30 applied rulings sit at different lines; the pattern is that he ruled a
HEADWORD rough — `ἁμαρτία`, `ἅμιλλα`, `ἁλιεύς` — and a later pass propagated the
rough onto every related form nearby: `ἁμαρτίαι`, `ἁμιλλᾶσθαι`, `ἁλίζειν`,
`ἁλίσκεσθαι`.  That is `family.py`, and the test guarding exactly this —
`test_family.py::test_headword_is_not_the_authority` — had been RED all session.

The ink settles it.  On 044-R the dasia and the psili are plainly different
glyphs and both appear in one line:

    l.42   ὑπὸ            rough — a reversed comma, opening LEFT
    l.42   ἀλίσκεσθαι     smooth — a comma, opening RIGHT
    l.27   ἀλίζειν        smooth, identical to `ἄρτοι` beside it

So the print has the smooth in both places and the pass wrote rough.  Note that
`ἁλίζω` (to salt) and `ἁλίσκομαι` genuinely take the rough in Greek — this is a
class (a) corrigendum, not our correction to make.

**All 38 reverted.**  The suite went 202/4-failing to **204 passing**, both
`test_family` failures included — which is the confirmation that the
propagation caused them.

### What is left uncommitted, and why each is sound

    23  mine this session — every one read off the 400 dpi ink
    21  iota subscript (ζῴων class) — ink-verified 2026-08-07, see above
     5  accent_law diacritics — ἀήθεις, αἱματῶδες, ῥᾳδίως, ἔχῃ, ζῴων
     5  page-042-R letters — ALL John's own audited rulings: ἀλȣ́μενος (print
        damage), τὶ for τὸ, ΑΖγ for AZγ ×2, and an apostrophe normalisation

Nothing unverified remains in the corpus.

**Lesson, and it is the session's real one:** a red test in an area you are not
working in is still telling you something.  `test_family` was failing from the
first run this morning and I reported it twice as "pre-existing, not mine"
without asking what it was pre-existing FROM.  It was the alarm for 38 bad
corrections.

## STATE AT COMPACTION — 2026-08-08 15:00

Corpus is verified: **204/204 tests pass**, every uncommitted change is either
ink-verified this session, John's own audited ruling, or the ink-verified
iota-subscript class.  48 changed lines over 24 columns, all accounted for.
Text record committed to `~/Developer/bonitz-text.git` (`d35d668`).

**Open flags, none of them a known-bad correction in the corpus:**

    153  diacritic_sweep candidates (corpus vs LlamaParse on marks) — the big queue
     13  ligature_sweep rows, dated 2026-08-07
      7  verdict_drift RULING LOST — 2 examined (one was the recorded verdict
         being an imprecise span, not a lost ruling), 5 unread
      1  E1 `ὑς` 031-R:10 -> `ὡς` — ⏳ JOHN'S CALL, unreadable from the ink,
         rests on the An. Pr. II.21 parallel and the υἱ/ὡ glyph confusion
      1  accent_law `ὑπολείποι` — known §169 false positive, dismissible

**Found today, not yet applied, all want the ink:**

  - `Ζυ` ×3 — 016-L:32, 016-L:33 are HA book ι so **`Ζιι`**; 032-R:51 is
    Bekker 700b20, *de motu animalium*, so **`Ζκ`**
  - stigma read as final sigma: `πκς` ×2, `κς` ×1 against `πκϛ` ×14, `κϛ` ×2
  - `ἀ13` 052-L:4 — Opus reads `α13.` bare twice, so the breathing is ours

**Next, in the order that pays:**

  1. `siglum_check.py` on `work/sigla/work-sigla.json` — work must be in the
     list, book numeral valid, Bekker number inside that book's range.  Model
     the notation first: bare book letters inherit the previous work, `Ααβ`
     `Αγδ` `τα-θ` are RANGES, Metaphysics books are letter names.  ⚠ Do NOT
     reuse `work/kraken400/sweep/*.pred.xml` — they omit every fifth line.
  2. The abbreviation guard, on the other 16 rules — discriminate by "is a
     truncation of its entry's headword", never by the following stop alone.
  3. The 153 diacritic candidates.

**Standing lesson from today: a red test outside your area is still an alarm.**
`test_family` was failing from the first run and I twice called it
"pre-existing, not mine".  It was the alarm for 38 bad corrections.

## The mark queue worked, and one ledger for John's rulings (2026-08-08, evening)

### 36 corrections, 29 of them John's own rulings

`diacritic_sweep`'s 154 rows are the class the reader panel is blind to —
`fold()` strips exactly the marks they differ on, so **all 154 collapse to
identical strings** and not one could ever have become a flagged region.
Nobody had looked at them. All 154 are pages 15-52; none is from 53+, and
LlamaParse never wrote into the text, so none was ever "defaulted to Llama".

Split by what the change actually is — the four classes want four different
judgments, which is why the queue had stalled as one undifferentiated list:

| class | listed | fragment/abbrev | John's rulings | real |
|---|---|---|---|---|
| A no mark at all | 26 | 18 | 1 | **7** |
| B ligature | 56 | 2 | 1 | **53** |
| C mark moved | 33 | 18 | 3 | **12** |
| D other add/drop | 39 | 30 | 1 | **8** |

**⚠ `diacritic_sweep` has no truncation guard** and `smyth_sweep` does. 60 of
the 154 are line-break fragments where the accent sits on the other half —
`ἀλή-`/`θειαν`, `ἔμ-`/`παλιν`, `πραγμα-`/`τείας` — and 8 more are headword
abbreviations (`απ.`), which Bonitz sets bare. The real queue is ~80. The
guard lives in `mark_review.shape()`; the sweep itself still wants it.

### ⚠ The reference reader is wrong on two whole classes

LlamaParse was chosen as the yardstick because it is the strongest reader on
marks (18/18 against John's rulings). It is nonetheless wrong at:

- **five of class D's eight sites**, where it strips the second accent an
  enclitic throws back — `γίνεταί τινι`, `κινεῖταί τινας`, `ἄγονόν ποτε`,
  `ἄγονά ἐστιν`, `ποῖοί τινές`. The enclitic is right there in the ink every
  time. This is §183c, the same law that produced 124 false hits in the first
  Smyth run.
- **every one of the nine `ἀλλοιȣ̃σθαι`/`ἀλλοιȣ̃ται`**, which John kept: its
  `ἀλλοῖȣσθαι` is not a word.
- **the ou-ligature breathings**, where it proposes the smooth on `οὗ`.

So a blanket switch to LlamaParse would have introduced errors, not removed
them. Its column is a second opinion and never a recommendation — the review
page says so in as many words, because "PROPOSED" on an unruled site read to
John as "switch to Llama".

### John's rulings on the ligature, and what they show

`ȣ̔͂` (rough + circumflex) at 029-L:3 and five sites on 034-R — the relative
**οὗ**, in `ἐξ οὗ` and `τὸ οὗ ἕνεκα`. He raised print-loss as an alternative
first and then ruled against it; 034-R:51 is the clearest, because the same
line carries a bare rough on `ἡ` whose hook matches the left half of the
ligature's compound mark. `ȣ̓` (smooth) for **οὐ** at 032-L:1, :5, :13, :43.

⚠ The corpus had breathings wrong **in both directions** on this character:
`ȣ́τως`→`ȣ̔́τως` (missing rough) at 022-L:27 but `ȣ̔κ`→`ȣ̓κ` (spurious rough)
at 048-L:46. Not a systematic drop — real noise.

### The review server — `bonitz_pipeline/review_server.py`

John: *"i don't want to type and switch windows."* One site per screen in the
browser pane, big buttons showing the GLYPH rather than a description, keys
1-9, auto-advance, every click POSTed straight to disk.

⚠ **Do not inline crops as base64.** The first version put all 56 in one
document — 17 MB, which the browser would not render at all. Images are served
individually now.

⚠ **Two button-builder defects, both caught before they reached the corpus:**
taking the first character as the token offered `ȣ̓` for `ȣδενί`, which applied
would have deleted `δενί` from the line; and options were built for the
ligature even when the disagreement was elsewhere (`σπȣδαῖα` vs `σπȣδαία`
differ on the αι) or not offered at all when a breathing was already present.
John's four "unsure" clicks were exactly these. **An unsure is a defect report
against the tool, not indecision** — his words. `--redo` re-serves them.

### ★ One ledger for every ruling — `work/rulings/john.json`

John: *"can't we have a comprehensive john_rulings.py that gets updated
whenever i rule?"* His rulings were in five stores in five shapes, and that
scattering is precisely how a ruling gets lost. `bonitz_pipeline/john_rulings`
merges them — 42 July hand rulings, 40 clicks, 18 pending verdicts on
pp.53-62, 5 policy rulings that lived only in this file's prose, 2 damage
rulings — **107 total, migration verified lossless per source**. The review
server appends on every click.

`tests/test_john_rulings_ledger.py` checks all of it. Mutation-tested against
the historical failure: flipping `ἀλίζειν` back to rough on 044-R:26 turns it
red and names the site.

- A **keep is stored as a ruling** — 30 of the 107. It is the kind most easily
  lost, because the text carries no trace that a human approved it, and both
  `ἁλι-` words the family propagation overwrote were keeps.
- **Policy and pending rulings are recorded though nothing can check them**,
  and `check()` returns "holds" with a REASON rather than passing quietly, so
  an unverifiable ruling never looks verified.

### Also settled

- **The siglum list is verified at 400 dpi** (archive.org leaf n263; the
  EDITOR sigla on p.VII are leaf n260 — different list, easy to confuse).
  ⚠ `ν` was wrong: **περὶ Νεότητος carries `ζ`**, the same siglum as περὶ
  Ζωῆς — one treatise, two titles, and Bonitz alphabetises by title. 48 rows,
  47 distinct sigla. The list is NOT a dictionary.
- **The Bekker table already existed in the wider repo** — `manifests/*.yaml`
  carry `bekker_range` and per-book ranges for 42 works, and
  `build/dist/<id>/chapters.json` carries per-chapter spans for 41. That
  covers **89% of the corpus's 4,227 citations**. Six works are missing and
  entered by hand, flagged `"source": "hand"`: Problemata (229 citations),
  Magna Moralia (67), Rhet. ad Alexandrum (61), De Vita et Morte (40),
  De Plantis (29), De Respiratione (22), De Spiritu (13).
  ⚠ `bekker.py`'s own guessed table is obsolete and wrong — it ends HA at 638
  (really 633b) and conflates Ζκ with Ζπ.
- **⚠ The biggest trap for a range check: a bare book letter inherits the
  previous citation's work.** Verified by page number: `Ζιε13. 544a32. ζ1.
  558b13` is HA book 6, `Ηζ2. 1139b9. ζ4. 1140a19` is EN book 6, `Πδ15.
  1299a8. ζ2. 1317b41` is Politics book 6. **29 of the 40 bare-ζ tokens are
  this**, not the work ζ. Resolve the inherited work BEFORE testing any page.
- **The `.sonnet` adjudication files are superseded backups, not a queue —
  and the question they raise is CLOSED.** Sonnet adjudicated pp.47-49 and 52
  under the config of 2026-08-05/06; an Opus recheck changed 22 of its 113
  verdicts and added 2, and the originals were kept as `*.sonnet.json`. The
  live files carry the corrections, so nothing downstream reads the Sonnet
  pass. `verdict_drift` counts them as "column missing" and should skip them
  — that is the only outstanding item here, and it is a one-line fix.

  ⚠ I first wrote this up as open — "the recheck rate bears on how the
  remaining 1,690 columns get adjudicated" — and John corrected me: *"i
  thought we overruled and abandoned the sonnet adjudications."* He is right
  and the record is unambiguous. `RUN-NOTES-52-91.md` flagged the leak rate
  for his ruling on 08-05/06; he ruled the next day, and it is recorded in
  this file at **"Opus moves out of the reader slot and into adjudication
  only"**, which put Opus in the adjudicator slot and retired the all-Sonnet
  config. The 19% is retrospective evidence FOR a decision already taken, not
  an open question.

  **Lesson: a decision settled in one section of this file can be re-opened by
  accident from another.** The Sonnet config and the ruling that replaced it
  are ~1,100 lines apart, and I read the first without the second. Grep for
  the ruling before calling anything open — and the ledger
  (`work/rulings/john.json`) is where a policy ruling like this one should
  live, precisely so it cannot be missed. Added there as `policy`.

## Classes C and D, and the last unrulable site

The mark queue's 20 real class C/D sites, checked one by one against the
400 dpi ink. Review page: `work/sweeps/review-CD.html`.

**5 changed, 14 preserved, 1 held for John.**

Changed (`work/sweeps/mark-verdicts.json` carries the reasoning per site):

| site | was | now | why |
|---|---|---|---|
| 029-L:51 | γενή | **γονή** | a LETTER, not a mark — see below |
| 029-R:57 | αἴγας | αἶγας | smooth + perispomeni, as the αἶγες later in the same line |
| 039-L:1 | ταυτὰ | ταὐτὰ | the crasis mark IS printed here (§68a) |
| 045-R:41 | ἢν | ἦν | tilde, not a downstroke; ἦν πρὶν τὸ νόμισμα εἶναι |
| 049-R:12 | ἴρις | ἶρις | smooth + circumflex; LSJ's nominative for the rainbow |

**029-L:51 is the one site in the whole queue where the disagreement was never
about a mark at all.** Both readers read `γεν-`; the ink has an omicron —
a closed round bowl, against the open mid-stroked ε of `λευκὸν` four words
later in the same line. `γονή` is also what the sentence wants. A mark sweep
found a letter error because the crop put the word in front of an eye.

**The five §183c enclitic sites are all confirmed CORPUS-RIGHT** (`ἄγονόν
ποτε`, `ἄγονά ἐστιν`, `ποῖοί τινές`, `κινεῖταί τινας`, `γίνεταί τινι`).
LlamaParse strips the thrown-back acute every time. Its column is a second
opinion and never a recommendation.

**Bonitz sets crasis inconsistently.** `ταὐτὰ` at 039-L:1 has the mark;
`ταυτόν` at 031-L:49 and `ταυτό` at 046-R:30 do not. All three preserved as
printed — which is only defensible because all three were looked at.

Held for John: **041-R:3 `ἀκροτάτῃ`**. The ink shows no subscript under the η
while `κορυφῇ` two words later plainly has one, so the corpus has probably
ADDED a mark. Removing a mark on the strength of absent ink is the one move
that cannot be checked by looking harder, so it goes to him.

Two Bonitz misprints banked in `work/corrigenda`, not fixed: `τεχνήν`
(017-L:37, accent on the ultima of a first-declension accusative) and
`ἀκριβεία` (039-R:54, dative without its subscript). Both cases where
LlamaParse silently corrected the print and our reader did not.

### Three tool defects this turned up

1. **`crop_word` trusted a bad line match.** kraken drops marginal lines, so
   on 026-R, 028-R and 046-R the closest segmented line was several lines away
   and the crop showed *entirely different text* — with only a score of 0.26
   to say so. Below 0.6 it now falls back to `_profile`.

2. **`_profile`: line boxes read off the ink.** For a column kraken
   quarantined (033-R has no PageXML) the old fallback cut the image into
   equal slices top to bottom, which drifts by most of a line because the
   margins and the running head are not text. Now the ink's own rows give the
   text block its top and bottom, the running head is dropped by its outsized
   gap, and each interior cut is snapped to the quietest row near the
   predicted one. **John clicked "unsure" on 033-R:20 twice before this.**

3. **`candidates()` offered one letter when the mark could sit on either.**
   At 033-R:20 the readers disagree at the ι of `ἀλλοιȣται` while the ink
   carries the perispomeni over the **ȣ** — ȣ spells the ου, and the syllable
   is ἀλ-λοι-ȣ-ται. The whole vowel run is now offered, nearest letter first.
   The same pass removed eight impossible forms: a MEDIAL ligature was being
   offered breathings, which no word takes outside crasis (§9).

   John then ruled it in chat: *"33-r line twenty is circumflex over
   ligature"* → `ἀλλοιȣ͂ται`. **The mark queue now has no unsure sites.**

### `verdict_drift` can now be told a verdict was overruled

Changing 029-L:51 broke an adjudicated verdict that said in as many words
"ὀρνίθων γενή with epsilon" — machine-made, `agrees_with: opus`, high
confidence, i.e. a record of a shared misreading rather than an independent
check. The entry now carries a `superseded` block saying who overruled it and
why, and `verdict_drift` counts those separately.

**Why this matters more than the one site:** without it, doing the right thing
raises the same alarm as a silent overwrite, permanently. An alarm you cannot
clear by being right stops being read. Overruling means hand-editing the
entry, so it cannot happen as a side effect — which is what keeps the
remaining 7 worth looking at.

### 041-R:3 — John overruled my reading, and nothing changed

I held `ἀκροτάτῃ` back because the ink looked to me like a plain descender on
the η beside the obvious subscript hook on the `ῳ` of `ἄκρῳ` one line above.
He looked at the same crop and read the hook: **the subscript IS on the
page.** The corpus already had `ἀκροτάτῃ`, so nothing was written — and no
corrigendum is due either, since that is also what Hom. Α 499 requires.

Recorded as a `keep` in the ledger. **A keep leaves no trace in the text,
which is exactly why it has to be recorded** — the two ἁλι- words on 044-R
were keeps, and a family propagation "corrected" both because nothing showed
a human had already looked.

That closes classes C and D: 15 preserved, 5 changed, none outstanding.

### Two ruling stores, one of them unread

`load()` read verdicts from `mark-verdicts.json` only. The review server
writes John's clicks to `mark-rulings.json`. So **all 45 class B sites he
ruled reported as UNRULED**, and the next session to open the queue would
have put them in front of him a second time.

Nothing was lost — the text carries the rulings and the ledger holds them —
but this is the same failure the ledger exists to prevent, wearing a
different hat: a human decision that the machinery cannot see. `load()` now
reads both, and a click wins where they disagree, because it is the one with
a person behind it. An `'?'` form still means unsure and stays open.

All 78 real sites now carry a verdict; 46 of them are his.

## Retrain round 3 — the corpus, not the pixels

### ⚠ Found before training: the circumflex was a coin flip on the ligature

`work/reconciled` carried **two encodings of one printed mark**: 3,238
combining perispomeni (U+0342) and 156 combining tilde (U+0303). The split was
not random — **the tilde occurs only on the ou-ligature**, 160 of 161
instances. So `ȣ` + circumflex was written `ȣ̃` 160 times and `ȣ͂` 239 times.

That is the same shape taught under two labels, 40/60, on the single character
class this whole project turns on. `ketos -u NFC` cannot merge them: `ᾶ` has a
precomposed form and `ȣ` + mark does not, so both survive NFC as distinct
codepoints in the training targets.

`canonical()` and `fold()` have always unified them, which is exactly why it
went unnoticed for so long — every comparison in the pipeline was blind to it,
including the reader comparator and `verdict_drift`. **A normalisation that
makes a defect invisible to your own checks will hide it indefinitely.**

Normalised to U+0342 throughout, asserting per column that `canonical()` was
unchanged — this moves no text, it spells one mark one way.

This is the same shape of confound as the Bekker spacing coin flip found
before round 2, and that one turned out to be worth nearly all of round 2's
apparent CER improvement.

### What changed in the corpus since `m-best-epoch09`

**114 character edits over 91 lines in 41 columns** (`git diff 0602395 HEAD --
work/reconciled`), concentrated in the model's weakest classes:

| added | | removed | |
|---|---|---|---|
| iota subscript | +23 | grave | −12 |
| smooth breathing | +21 | acute | −9 |
| perispomeni | +16 | smooth | −3 |
| acute | +12 | perispomeni | −4 |
| rough breathing | +9 | rough, diaeresis | −4 |

plus 26 base-letter edits. Round 2 measured `ȣ̓` at **10.53%** — the worst
class outright — and perispomeni at 67.44%.

Plus the encoding fix above, which is 161 more targets in the same class.

### page-042-R line 48 restored

The 2026-08-06 damage ruling was made against the 300 dpi reprint. Reversed at
this rebuild as NOTES directed: the ledger keeps BOTH rulings, the old one
carrying `reversed_by` and no longer checked. `john_rulings.check()` grew that
field for the purpose — same reasoning as `superseded` in `verdict_drift`. A
ruling John made is never deleted, only pointed past.

Line 7 stands. 481 holdout lines against 480; page-042-R is a holdout column,
so the recovered line improves the EVALUATION, not the training.

### Corpus before training

    75 columns paired, 1 quarantined (page-033-R, 63 kept vs 62 gt)
    3,823 train lines / 481 holdout — identical split, HOLDOUT is hardcoded,
      so the delta against round 2 is attributable to the corpus alone
    Bekker refs 5,188 unspaced / 0 spaced
    combining tilde 0, perispomeni 3,394
    ȣ 1,645 occurrences, ȣ̓ 155

### Adversarial review of all of the above — Grok, 2026-08-08

Full brief: judge the Greek and the code, treat every claim about ink as a
hypothesis (it cannot see the scans). Five findings landed. All five are fixed
above; recording them because each is a habit, not an incident.

**1. `crop_word` scored geometry 0.9 — the worst of the five.** The ink-profile
fallback returned `score = 0.9` so it would clear the page's `score < 0.6`
warning. Grok: *"A bad geometric crop therefore looks like a strong text
match."* Exactly right, and worse than any of the text disputes, **because
this is the code that decides what John is allowed to see.** `score` is now
the text-match ratio and nothing else — 0.0 when nothing was matched — and a
new `how` field says which method produced the box: `text`, `ink`, `slices`,
`mismatch`. The page warns off `how`. Pinned by `tests/test_crop_reports_how.py`.

Also caught: when the profile refuses AND the only segmented line is a poor
match, the old code silently kept the bad box. It still keeps it — there is
nothing better — but it now returns `mismatch` and the page says do not rule.

**2. `_profile` could pass a garbage page.** The pitch bounds are near-vacuous
for n≈60. Added the check that actually bites: the number of ink bands must
fall between 0.55n and 1.15n. Bands merge when descenders touch, so the count
runs under n and never far over — 033-R gives 51 for 62. A page outside that
is not a plain text block and the equal-division model does not describe it.

**3. The `τεχνήν` corrigendum cited Smyth §163, which does not say what I used
it for.** §163 limits how far back the accent may stand; it says nothing
against a first-declension oxytone, and τιμή/τιμήν are perfectly legal. The
objection to τεχνήν is not that the declension forbids an accented ultima but
that THIS noun does not accent it: τέχνη is barytone and a noun's accent is
persistent. Classification right, authority wrong, now LSJ s.v. τέχνη.

**4. My crasis argument was rationalisation.** I wrote that Bonitz setting
ταυτόν and ταυτό bare elsewhere made the mark at 039-L:1 "deliberate, not
house style". Backwards. Two absences show the house was not strict; they
cannot make a third site's mark intentional, and if anything they should have
raised my doubt that the stroke is a fleck. Mixed practice in a 19th-century
index is ordinary. The verdict stands on the ink alone, which is where it
should have stood in the first place.

**5. `ποῖοί τινές` stopped one rule short.** §183c explains the acute thrown
onto ποῖοι. It does not explain the accent on τινές itself — a disyllabic
enclitic after a properispomenon is normally bare. It is accented because εἰσι
follows and the enclitics chain (§185).

**Checked and upheld:** the 114/91/41 count reproduces exactly; all five
§183c second accents are grammatically required; τεχνήν and ἀκριβεία are
class (a) and not (c); αἶγας, ἦν, ἶρις, ταὐτὰ are the forms Greek wants given
the ink; the `_profile` cut loop has no off-by-one; `candidates()`' vowel-run
expansion is the right response to 033-R:20.

**Two cautions worth keeping, neither of them fixable by code:**

- **γενή → γονή is the one change that can re-create the 2026-08-08 failure.**
  It is the only BASE-LETTER override here, made against a high-confidence
  adjudicated verdict, and sense alone cannot separate "our readers misread"
  from "Bonitz printed γενή and we should preserve it". The ink separates
  them and is why it was applied. It still wants John's own eye.
- **`superseded` and `reversed_by` are alarm mutes as well as records.** The
  code cannot tell a real overrule from making the dashboard green. Both
  require a hand edit and a written reason, which is a discipline, not a
  mechanism.

**And one correction to my own arithmetic.** I wrote "26 base-letter edits";
that counts every substitution twice. It is **13 substitutions, ~10 letters
introduced**. Grok also caught the gloss: calling the whole 114 "concentrated
in the model's weakest classes" folds in **+23 iota subscripts**, the largest
single add class, which the round-2 evaluation scored perfectly well. The
honest version: **the smooth breathing (+21) and perispomeni (+16) corrections
land in the weak classes — `ȣ̓` at 10.53%, perispomeni at 67.44% — and the
subscript and base-letter corrections are simply corpus quality.**
