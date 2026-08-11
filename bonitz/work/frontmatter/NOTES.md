# Front matter — how it was read, and what it cost

The reference document is `docs/front-matter.md`, generated from the sigla
files. This holds the provenance and the measurements, which belong nowhere
near a reference table.

## Source

**1870 Berlin original**, archive.org `aristotelisopera05arisuoft`, leaves 261
(printed VII), 262 (printed VIII), 264 (the work key). 3042×4082 px, ~415 ppi —
the same scan and dimensions as `work/scan400/`. Held in `scan1870/`.

⚠ **`book.pdf` is the 1955 Graz reprint**, not the original: `SECUNDA EDITIO
1955 … Unveränderter photomechanischer Nachdruck … Berlin 1870`, embedded page
images 2204×3135 = **300 ppi**. The first pass here rendered it at "400 dpi",
which only interpolated. That is the same trap that put the 53–62 Opus reads on
the reprint.

⚠ **Genie is not an independent edition.** `raw/genie/Bonitz 1-200.docx` covers
these leaves, but its header names `indexaristotelic0000boni` — that same 1955
reprint. A third reader, not a second edition.

⚠ `work-sigla.json` cited the key as "leaf n263"; the IIIF index is 264. Leaf
263 is the half-title, 260 is printed VI. Corrected in the file.

The 1870 scan trades cleanliness for resolution: toned paper, heavy
show-through — the half-title ghosts through behind the key table.

## Leaves surveyed

| PDF leaf | printed | content |
|---|---|---|
| 7–10 | I–VI | preface, continuous prose, no tables |
| 11 | VII | fragment editions; editor sigla; Vahlen/Eucken conventions |
| 12 | VIII | zoological and botanical authorities |
| 14 | — | the work sigla key |

Printed V ends *quibus siglis … usi simus, infra indicatur*, pointing forward
to VII. That is the page's own statement that there are no further sigla lists,
and it is why the survey stops.

## Readers

Columns were cut and verified by eye before anything read them (`split_fm.py`).
`bonitz_pipeline.split_columns` raises on all three leaves — it is tuned for
the index's dense pages — and its thresholds were left alone rather than
widened to admit three leaves at the cost of 76 index columns.

| reader | KEY | VII | VIII |
|---|---|---|---|
| LlamaParse (premium, `do_not_unroll_columns`) | good | good | **exact** |
| kraken `m-best-epoch09` | unusable | 10.7% CER | unusable |
| Opus, every column at ~415 ppi | **reader of record** | | |

What Opus changed: restored two ligatures llama flattened (`Ἀκȣστῶν`,
`ἀκȣσμάτων`); restored `Aristetolicorum`, which llama silently normalised;
restored the circumflex on `ἰατρȣ͂` and the close quote after `‘Eucken I’`;
found the bare `Ηθικὰ`. On VIII llama was exact on all 25 entries and Opus
changed nothing.

## kraken, measured

| | result |
|---|---|
| sigla reproduced exactly | **19/48 = 40%** |
| — 1-character sigla | 3/24 = **12%** |
| — 2-character | 14/21 = 67% |
| — 3-character | 2/2 = 100% |
| Latin, printed VII | **10.7% CER** |
| Greek characters intruding into that Latin page | **168** |

Recall scales with how much ink is on the line, so this is a **segmentation**
result, not a recognition one: a lone letter never survives baseline detection
and is never passed to the recogniser. Kraken emitted 78 lines for a page
holding 96 cells.

On Latin the errors are systematic — a Greek-first prior firing on roman type:
`Α`→A, `Ν`→N, `Μ`→M, `Ρ`→P, `Τ`→T, `Χ`→X, `Ζ`→Z, `Η`→H, plus `s`→8, `i`→1.
`Editores`→`ditores`, `A, Aub.`→`4, 4ub.`, `Entwicklung`→`Entvicklung`.

**For the next training round.** VII and VIII are worth including: the index
body is 8.57% Latin and all short abbreviations, and `U Y ä ç Ü Ö Ä ß` appear
**zero** times in 241k training characters. The homoglyph confusion they would
fix is a live defect in the other direction — `siglum_check.HOMOGLYPH` exists
because 67 corpus citations carry Latin letters where Greek belongs. Cheap
too: 79 lines across four columns.

⚠ **The key page will not fix the sigla by training alone.** Its problem is the
segmenter. Train on it as it stands and 18 of 96 cells are silently absent from
the ground truth — a check reading a column that is not there, in a new place.

## Errors made and caught

- **Ligature rule applied instead of reading.** I wrote `Ἀριστοτέλȣς` twice —
  in `Fr, Fritzsche.` (the ink reads `Ἀριστοτέλης`, eta, nominative, no
  ligature) and in `P, Pik.` (the ink reads `Ἀριστοτέλους`, spelt out). The
  same `P, Pik.` line then prints `Πικκόλȣ` and `ἰατρȣ͂` **with** the ligature.
  One line of a quoted 1863 title mixes both, and no rule predicts which.
- **`Trdllbg` was nearly "corrected" to `Trdlbg`.** The double l is on the
  page; the existing file was right and a small crop had misled me. Checked
  before writing, which is the only reason it was not broken.
- **`bekker.py` carried a guessed 22-entry work table** while
  `work-sigla.json` held 47 verified sigla. Written 2026-07-25, fifteen days
  before the key was transcribed, and honestly flagged as guessed — but never
  retired once the real key existed. Still open.
- **An empty API response was written to disk as a reader file.** LlamaParse's
  `load_data` swallows the error and returns `text == ''`. `read_llama.py` now
  refuses to write an empty read.

## Corrections pushed back into the sigla files

- 9 titles had a **bare ϗ**; the page always sets a grave. Corpus agrees
  760/785. Now `ϗ̀` throughout.
- `περὶ Οὐρανȣ͂` used U+0303 combining tilde; the corpus uses U+0342
  perispomeni after `ȣ` 544 times and U+0303 zero times.
- Four rows gained a `printed` field where the leaf differs from the reference
  form — three em dashes and the bare `Ηθικὰ`.
- `apparatus-sigla.json`: added `P`/`Pik`, absent entirely from the reprint
  pass; re-keyed `Prantl` to its printed siglum `Prtl`.

## Files

```
scan1870/     the three leaves, ~415 ppi — the source
crops-key/    key column crops, sub-cut check, the bare-Ηθικὰ zoom
read/         llama and kraken readings (kraken-reprint/ = the superseded run)
split_fm.py   regenerates every crop, from scan1870/
read_llama.py
```

## Re-fetching the leaves

The scans are deliberately NOT committed. They are 5 MB of a public-domain
edition that archive.org already hosts, and this repo is public. Fetch them:

```sh
for pair in 261:VII 262:VIII 264:KEY; do
  leaf=${pair%%:*}; name=${pair##*:}
  curl -sL -o "work/frontmatter/scan1870/fm-${name}.jpg" \
    "https://iiif.archive.org/iiif/aristotelisopera05arisuoft%24${leaf}/full/full/0/default.jpg"
done
```

Each is 3042×4082, ~415 ppi. `split_fm.py` regenerates every crop from them.
⚠ The leaf numbers are the IIIF index and were verified by eye — 260 is
printed VI and 263 is the half-title, so an off-by-one silently gives you the
wrong page.
