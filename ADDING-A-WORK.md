# Adding a work to the corpus

The reader is a registry-driven complete-works site. Adding an Aristotelian work
is a configuration exercise — **no frontend code changes**. These are the steps,
using *De Anima* (slug `DA`) as the worked example.

## 1. Vendor the sources (`sources/`)

- **Greek**: nothing to fetch if the TLG author export is already cached — the
  Diogenes verse-mode export emits one file per work (`tlg0086<work>.xml`) for the
  whole author. Confirm the work's file has `type="Bekker-page"` divs with numeric
  `<l n="…">` lines (the spine relies on this).
- **Chapter structure** (only if the work has no Bekker-milestoned English TEI):
  vendor the First1KGreek Greek TEI, e.g.
  `sources/tlg0086.tlg002.1st1K-grc1.xml`. Its `subtype="chapter"` divs are
  text-aligned onto the spine to recover each chapter's Bekker (column, line).
- **English** (chapter-anchored archive translation): one HTML file per book in
  `sources/<slug>-<translator>/book-0N.html`, e.g. `sources/da-smith/book-01.html`
  from the MIT Internet Classics Archive (the `TheMITTech/classics` GitHub mirror
  is the reliable source). Chapter markers are bare numbers (`1`) or `Part N`.

## 2. Write the manifest (`manifests/<SLUG>.yaml`)

Copy `manifests/DA.yaml` and set:

- `work.id` = the slug (= URL + data dir), `tlg_work`, Bekker range, editions.
- `chapters.source: grc_tei` + the grc TEI filename (or omit for the Perseus-TEI
  path that EN uses).
- `english.primary` (and optional `secondary`): `model: archive`, the `dir`,
  `books` count, and `chapter_marker` (`number` or `part`).
- `books`: each book's Bekker `start`/`end`. Run `stage1`/`stage2` once and let
  the validator tell you the exact boundary lines (mid-column book starts and any
  edition line-number quirks go in `mid_column_book_starts` / `expected_line_gaps`).
- `proper_names` (optional): a cross-language spot-check list, or omit to skip it.

### (optional) Hand-keyed Bekker anchors

The archive English gutter is interpolated. To pin specific Bekker lines to the
true place in the translation, add `english.primary.anchors:
"<slug>-<translator>/anchors.yaml"` — a YAML list of
`{ bekker: "412a10", at: "a verbatim phrase from the translation" }`. Each
resolved anchor becomes a real gutter tick; interpolation only fills the gaps
between anchors. Zero anchors = all estimates; full anchors = Rackham-grade.

## 3. Run the pipeline

```bash
cd pipeline && uv run python -m aristotle_pipeline all --work <SLUG>
```

Emits `build/dist/<SLUG>/` (books, chapters, columns, analyses, LSJ, search).
Spot-check chapter placement against a couple of canonical Bekker anchors.

## 4. Register the work (`app/src/lib/works.ts`)

Add one `Work` entry to `WORKS`: `id` (= slug), `title`, `abbr`, `books`,
`bookLabels`, `greekEdition`, `translations` (each with a display `name`/`short`
and `slot`: `english` = primary parallel chunk, `ross` = secondary overlay), and
a one-line `blurb`. The home index, routing, reader work-switcher, and unified
search pick it up automatically.

## 5. Build

```bash
cd app && npm run build      # Node 22; getStaticPaths enumerates the new work
```

That's it — the new work appears on the home page, gets `/SLUG/book/N` routes, and
joins unified search. No component code is touched.
