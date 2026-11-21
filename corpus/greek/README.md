# corpus/greek

The Greek text the site is built from: one file per work, one printed line of
the edition per row. The build reads these files for a work's Greek (two works
are read from `sources/` instead; see below). This folder holds them and this
page, and nothing more.

## Format

UTF-8, tab-separated, one row per printed line, in reading order.

```
# work: Cat
# edition: Minio-Paluello, Aristotelis Categoriae et Liber de Interpretatione (OCT, 1949)
# columns: Bekker-page	n	text
1a	1	Ὁμώνυμα λέγεται ὧν ὄνομα μόνον κοινόν, ὁ δὲ κατὰ τοὔ-
```

- The `# columns:` line names the fields. Most works have a Bekker column
  (`1a`), the line's number, and the line. The Isagoge has Busse's page in
  place of the column. The Athenian Constitution has chapter and section. The
  Magna Moralia has book, chapter, and section, and takes its Bekker lines from
  `sources/mm-bekker/bekker-lines.yaml` at build time.
- `n` is the line's number as printed: `12`, `5a`, a doubled `8,9`, or a
  heading's `23t`. It is empty where the line has none.
- The text is the line as the edition prints it, with runs of white space made
  one space. Hyphens at line ends, `|` line-break marks, editors' brackets, and
  Greek punctuation are kept; `pipeline/aristotle_pipeline/stage1_greek.py`
  parses them.
- `APr.tsv` and `APo.tsv` hold the same lines: the edition prints the two
  Analytics as one text, and each work's manifest takes its own columns.

De Plantis and the Rhetoric to Alexander are not here. Their Greek is under
`sources/` (`plant-greek/`, `rhetal-greek/`).

## Editions

Each file's second line names its edition, taken from the work's manifest
(`manifests/<Work>.yaml`, `work.greek_edition`).

## Licence

These files are released under CC0 1.0 Universal
(https://creativecommons.org/publicdomain/zero/1.0/). The texts are
ancient; the files add no claim of their own.

## Making the files

`python -m aristotle_pipeline.extract --all` (in `pipeline/`) writes them from
the digital source texts, on a machine that holds those. The source's own
files are never committed to this repository.
`pipeline/tests/test_corpus_greek.py` checks every file here on each test run:
every letter of every line must be Greek.
