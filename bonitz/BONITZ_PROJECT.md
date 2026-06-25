# Bonitz Index Aristotelicus — Project File

**Goal:** Produce a fully machine-readable, web-integrated digital edition of Bonitz's *Index Aristotelicus* (Berlin 1870) within the aristotle-reader project, with every Bekker citation linked back to the reader's text.

---

## What Has Been Done (Sessions 2026-06-15)

### 1. Page Range Confirmed
- **Source PDF:** `~/Downloads/book.pdf` (896 pages, 109 MB, color scan, PDF 1.5)
- Front matter: pages 1–13
- Abbreviation table: page 14 ← high-value; parse this in Stage 4
- **Index body: pages 15–885** (871 pages, two columns each = 1742 column images)
- Addenda et Corrigenda: pages 886–890
- Blank/back: pages 891–896

### 2. Pipeline Built and Validated (Pilot: page 15, left column)

Full pipeline from PDF to web:

```
PDF → pdftoppm → TIFF → split_columns.py → column TIFF
    → transcribe.py (Opus 4.8) → XML
    → compare.py (Kraken verifier) → flag report
    → xml_to_json.py → JSON
    → bonitz.astro (web display)
```

All pipeline modules are in `bonitz/bonitz_pipeline/`.

### 3. Pilot Results (page 15 left column, scored against hand-keyed gold)

| System | CER vs gold | Bekker recall | Bekker precision |
|---|---|---|---|
| **Opus 4.8** | **9.2%** | **95.9%** | **95.9%** |
| Sonnet 4.6 | 13.5% | 75.5% | 84.1% |
| Kraken (verifier) | 19.7% | 79.6% | 95.1% |

**Conclusion:** Opus 4.8 is the primary transcriber. Kraken is the verifier (flags the ~4% of citations that genuinely differ). Sonnet 4.6 is not viable as primary.

### 4. Web Pilot Live (dev server)
- Page: `/aristotle-reader/bonitz` in the Astro app
- Cards with collapse/expand per entry
- Latin/English toggle for work title abbreviations
- Beta Code + Greek lemma search
- Source: `app/src/pages/bonitz.astro`, data: `app/src/data/bonitz-pilot.json`

---

## Pipeline Modules

### `split_columns.py`
Splits a full-page TIFF into left/right column TIFFs using a darkness-profile gutter detection algorithm.

```bash
python3 -m bonitz_pipeline.split_columns page-015.tif --out /tmp/cols/
# → page-015-L.tif  page-015-R.tif
```

Margins trimmed: top 4%, bottom 3%, outer 2.5%, inner 0.5%. DPI preserved.

### `transcribe.py`
Calls Claude Opus 4.8 (vision) via the Anthropic API to transcribe a column image to structured XML.

```bash
ANTHROPIC_API_KEY=sk-ant-... python3 -m bonitz_pipeline.transcribe \
    page-015-L.tif --model claude-opus-4-8 --out page-015-L.xml
```

Requires `ANTHROPIC_API_KEY`. Auto-converts TIFF → PNG for the API (which only accepts JPEG/PNG/GIF/WebP). Output format:

```xml
<column page="15" col="left" section="Α">
  <section_head>Α</section_head>
  <entry>
    <lemma>ἀάζειν</lemma>
    <text>θερμόν μβ8.<cit>367b2</cit>. opp φυσᾶν πλδ7.<cit>964a11</cit>.</text>
  </entry>
  ...
</column>
```

The prompt is embedded in `transcribe.py:PROMPT`. Key rules: `<cit>` wraps every Bekker citation verbatim, `<unclear>` for illegible passages, no running heads.

### `digit_guard.py`
Normalizes Kraken's systematic misreading of column letters (a/b → digits) for comparison.

```bash
python3 -m bonitz_pipeline.digit_guard   # runs validation smoke test (6/6 ✓)
```

The verifier Kraken reads `1456b27` as `1456227`. The digit-guard parses both sides as `(page, line)` integer pairs and compares those rather than raw strings. Two-pass hint-aware parsing: strict regex first, then heuristics on uncovered digit runs. Supports Latin a/b and Greek α/β column letters.

### `compare.py`
Scores a Claude XML transcript against Kraken output (and optionally a hand-keyed gold file).

```bash
python3 -m bonitz_pipeline.compare \
    --claude page-015-L.xml \
    --kraken page-015-L-kraken.txt \
    --gold   page-015-L-gold.txt
```

Reports:
- Column-level CER (full text joined as one string; line alignment artifacts avoided)
- Bekker citation recall and precision (Counter multiset comparison)
- Missed-by-each breakdown

### `expand_abbrevs.py`
Tokenizes Bonitz text segments, tagging work-reference abbreviations (`μβ8.` → `{kind: wref, latin: "Meteorologica", book: "β", chap: "8"}`) and Latin scholarly abbreviations (`opp` → `{kind: latin_abbr, english: "opposite of"}`). Used by `xml_to_json.py`.

Work abbreviation table: see `WORK_TABLE` in `expand_abbrevs.py`. Currently covers ~25 works. **Needs expansion** as new sections of the index are processed.

### `xml_to_json.py`
Converts column XML to JSON for the web app.

```bash
python3 -m bonitz_pipeline.xml_to_json page-015-L.xml \
    --out ../../app/src/data/bonitz-pilot.json
```

Calls `expand_abbrevs.tokenize_segments()` on every text segment. Output is consumed directly by `app/src/pages/bonitz.astro`.

### `align.py`
Monotonic line aligner (difflib SequenceMatcher). Used internally by `compare.py` for flag_digit_mismatches() but not for CER (which uses column-level comparison).

---

## Kraken Verifier

```bash
# Binarize
~/kraken-env/bin/kraken -i page-015-L.tif bw.png binarize

# OCR
~/kraken-env/bin/kraken -i bw.png page-015-L-kraken.txt segment ocr \
    -m ~/OCR-kraken-models/kraken-models/greek-german_serifs_sophokle1v3soph/
```

**Do NOT use:**
- `greek-german_serifs_bsb10234118` — near-total noise
- `segment -bl` (baseline mode) — incompatible with the sophokle model

Kraken output is plain UTF-8 text, one physical scan line per line.

---

## Abbreviation Tables (Open Task)

The abbreviation table in `expand_abbrevs.py` was built from the pilot column only. The full index uses many more abbreviations. The authoritative source is **page 14 of the PDF** (the abbreviation key printed by Bonitz himself).

**To do:** render page 14 and parse the full abbreviation table, then update `WORK_TABLE` in `expand_abbrevs.py`. This is a one-time task that will cover the entire index.

Known uncertain mapping:
- `ξ` — mapped to *De Xenophane Zenone Gorgia* based on Bekker page range (978b); verify against page 14
- `δ`, `ι` (bare) — used as shorthand for the previous work's next book; context-dependent and currently not resolved by `expand_abbrevs.py`

---

## Running the Full Pipeline at Scale

### Setup
```bash
cd ~/Developer/aristotle-reader/bonitz
pip3 install Pillow numpy anthropic   # if not already installed
```

### Per-page workflow
```bash
PAGE=015   # three-digit zero-padded page number
PDF=~/Downloads/book.pdf

# 1. Render page from PDF at 600 PPI
pdftoppm -tiff -r 600 -f $PAGE -l $PAGE $PDF /tmp/bonitz/page

# 2. Split columns
python3 -m bonitz_pipeline.split_columns /tmp/bonitz/page-$PAGE.tif \
    --out /tmp/bonitz/cols/

# 3. Transcribe with Opus 4.8 (both columns)
ANTHROPIC_API_KEY=sk-ant-... python3 -m bonitz_pipeline.transcribe \
    /tmp/bonitz/cols/page-$PAGE-L.tif \
    --model claude-opus-4-8 --out output/page-$PAGE-L.xml

ANTHROPIC_API_KEY=sk-ant-... python3 -m bonitz_pipeline.transcribe \
    /tmp/bonitz/cols/page-$PAGE-R.tif \
    --model claude-opus-4-8 --out output/page-$PAGE-R.xml

# 4. Kraken verification (optional but recommended)
~/kraken-env/bin/kraken -i /tmp/bonitz/cols/page-$PAGE-L.tif bw-L.png binarize
~/kraken-env/bin/kraken -i bw-L.png output/page-$PAGE-L-kraken.txt \
    segment ocr -m ~/OCR-kraken-models/kraken-models/greek-german_serifs_sophokle1v3soph/

# 5. Score and flag
python3 -m bonitz_pipeline.compare \
    --claude output/page-$PAGE-L.xml \
    --kraken output/page-$PAGE-L-kraken.txt

# 6. Convert to JSON for web
python3 -m bonitz_pipeline.xml_to_json output/page-$PAGE-L.xml \
    --out ../app/src/data/bonitz/page-$PAGE-L.json
```

### Chunking strategy
Process in Greek-letter sections (~100 pages each) to manage disk space:
- α: pages 15–60 (approx)
- β–γ: pages 61–150
- etc.

Disk: ~83 MB per page at 600 PPI × 871 pages ≈ **72 GB** raw TIFFs. Delete TIFFs after XML is confirmed good. Keep XMLs (~10 KB each) permanently.

### Cost estimate (Opus 4.8 API)
- 1742 columns × ~$0.10–0.15 per call ≈ **$175–260 total**
- Tokens: ~600 input (image) + ~1500 output per column

---

## Sense Divisions in Major Entries

**Critical for long entries:** Bonitz distinguishes multiple senses or uses of a term within a single entry. These are currently transcribed as a single run-on `<text>` paragraph. For major entries (ἀγαθός, λόγος, εἶδος, ψυχή, κίνησις, etc.) this makes the web display unreadable — some entries run for multiple columns.

### Bonitz's sense-division markers
Bonitz uses a consistent hierarchy of dividers within entries:

1. **Em-dash (—)** — the primary sense separator; introduces a new sub-sense, a new grammatical construction, or a new philosophical context. Already visible in the pilot: `— φαντάσματα ἀβέβαια (veluti λαμπάδες…)` marks a new sub-topic within ἀβέβαιος.
2. **Arabic numerals** (1. 2. 3.) — top-level sense divisions in very long entries.
3. **Latin structural words** — `act` / `pass` (active/passive sense), `dist` (distinguishes from), `opp` (opposed to a prior sense), `cf` (compare) — these introduce sub-senses or contrasts.
4. **Greek quoted phrases** — a new lemma-like phrase in italics begins a sense cluster.

### XML schema change required

The `<text>` element should be replaced with structured `<sense>` children for complex entries. Update the transcription prompt and XML schema to:

```xml
<entry>
  <lemma>ἀγαθός</lemma>
  <sense n="1">
    <text>…primary sense with <cit>…</cit>…</text>
  </sense>
  <sense n="2">
    <text>…second sense…</text>
    <sense n="2a">
      <text>…sub-sense…</text>
    </sense>
  </sense>
</entry>
```

For simple entries (one sense, no em-dash divisions) the flat `<text>` form is fine and should remain as the default. Opus 4.8 should emit `<sense>` blocks only when it detects actual sense divisions.

### Prompt update needed in `transcribe.py`

Add to the PROMPT:

> For entries with multiple senses (signalled by em-dashes —, Arabic numerals 1. 2. 3., or act/pass markers introducing distinct usage clusters), wrap each sense in `<sense n="1">`, `<sense n="2">` etc. rather than a single `<text>` block. Simple entries with no internal divisions use `<text>` directly. Nested sub-senses use `<sense n="1a">`, `<sense n="1b">`.

### Pipeline changes

- **`xml_to_json.py`:** parse `<sense>` children recursively; emit `{"kind": "sense", "n": "1", "segments": [...], "children": [...]}` in the JSON
- **`xml_to_json.py:_segments()`:** already handles `<cit>` and `<unclear>` children; extend to handle `<sense>` recursion
- **`bonitz.astro`:** render senses as `<ol>` or indented `<details>` within the card body, preserving the em-dash structure visually as numbered outline items

### Web display target

Collapsed card: shows lemma only (unchanged).  
Expanded card:
```
ἀγαθός
  1. [primary sense text with citations]
  2. [second sense]
     a. [sub-sense]
     b. [sub-sense]
  3. act [active sense citations]
     pass [passive sense citations]
```

### Note on the pilot

The pilot entry ἀβέβαιος already has sense divisions (em-dashes) but is rendered as a run-on paragraph. This is acceptable for the pilot but must be fixed before scaling. Use ἀβέβαιος as the test case for the sense-division feature.

---

## Cross-Column and Cross-Page Entries

**Critical:** Entries in Bonitz are not bounded by column or page breaks. A major entry (e.g. ἀγαθός, λόγος) can span the right column of one page, the entire left and right columns of the next page, and continue further. This has structural implications at every stage of the pipeline.

### In the XML (transcribe.py)
The transcription prompt already instructs Opus to add `<!-- entry continues in right column -->` when an entry is cut off. The reverse — an entry that *begins* as a continuation — arrives with no `<lemma>` tag; it should be marked with `type="continuation"` on the `<entry>` element.

**Convention to enforce in the prompt:**
- Last entry of a column that continues: `<entry type="entry" continues="next">`
- First entry of a column that is a continuation: `<entry type="continuation">` (no `<lemma>`)

The lemma for a continuation entry must be retrieved from the previous column's closing entry. The stitching happens at the JSON/web layer, not in the XML.

### In xml_to_json.py
When converting a column XML to JSON, emit a `"continues": true` flag on the last entry if it is cut off, and a `"continuation": true` flag on the first entry of the next column if it has no lemma. The web layer uses these flags to stitch the two fragments into one logical entry.

### In the web display (bonitz.astro / future multi-column loader)
When loading adjacent column JSONs (L then R of the same page, or last column of page N and first column of page N+1), detect a `continues/continuation` pair and merge the text segments into a single card under the original lemma.

### In compare.py / scoring
The Bekker citation counter already works at column level (not line level), so split entries don't break scoring. No changes needed there.

### Practical note
For the pilot (page 15, left column) the last entry is ἀγαθός, which continues into the right column. The pilot web page shows it truncated — this is expected and acceptable for the pilot. Fix it when loading multiple columns together.

---

## Web Integration — Current State

The pilot web page (`app/src/pages/bonitz.astro`) renders a single JSON file. For the full index, the data model needs to scale:

### Short-term (next session)
- Load multiple JSON files (one per letter section) and combine them on the page
- Add a letter-section navigator (Α, Β, Γ… sidebar or top nav)
- Add the page 14 abbreviation table as a separate reference page

### Stage 3: Citation Linking (not yet started)
Every `<cit>` Bekker citation in the index should link to the corresponding passage in the aristotle-reader. Requirements:
1. A Bekker-range lookup table mapping page numbers to works (e.g., 1094–1181 = EN)
2. The reader's existing `#Bekker-NNNN` URL hash scheme for navigation
3. Link format: `/aristotle-reader/EN/book/1?#Bekker-1094a1` (or equivalent)

The reader already tracks Bekker position in the URL hash as you scroll. The link just needs to point to the right work + approximate position. A static range table (JSON file) is all that's needed to power this.

### Stage 4: Abbreviation Reference Page
Render page 14 of the PDF as a standalone `/aristotle-reader/bonitz/abbreviations` page showing Bonitz's own abbreviation key. This is high-value for readers and provides the authoritative source for `expand_abbrevs.py`.

---

## Pilot Files

| File | Description |
|---|---|
| `pilot/p15_left_opus48.xml` | Opus 4.8 transcription — the gold-standard output format |
| `pilot/p15_left_claude.xml` | Sonnet 4.6 transcription (pilot comparison only) |
| `pilot/p15_left_kraken.txt` | Kraken sophokle verifier output |
| `pilot/p15_left_gold.txt` | Hand-keyed gold (46 lines, 49 citations; note: line 1 had typo `145b27` → corrected to `1456b27`) |
| `pilot/PILOT_REPORT.md` | Full pilot report with three-way scorecard |

---

## Open Items by Priority

### High (before scaling)
1. **Parse page 14** (abbreviation table) and expand `WORK_TABLE` in `expand_abbrevs.py`
2. **Write a batch script** wrapping the per-page workflow above (loop pages 15–885, skip already-processed, log failures)
3. **Review flagged citations** from the pilot (~4%) — are they genuine OCR errors or scan problems?

### Medium (during scaling)
4. **Bekker range table** (JSON mapping page ranges to work IDs) — enables Stage 3 citation linking
5. **Letter-section navigator** in the web page
6. **Abbreviation reference page** (page 14 rendered and linked from the index)

### Low (post-scaling)
7. **Kraken fine-tuning** on garbled sections (ἄβρωτος area in pilot; may appear elsewhere)
8. **Full-text search** within Bonitz entries (currently lemma-only)
9. **Addenda et Corrigenda** (pages 886–890) — integrate corrections into affected entries

---

## How to Resume This Work

1. Read `pilot/PILOT_REPORT.md` for pilot results and methodology
2. Check `bonitz_pipeline/expand_abbrevs.py` for current abbreviation table state
3. Start a new Opus 4.8 run on pages 16–60 (next α-section pages) using the per-page workflow above
4. Run `python3 -m bonitz_pipeline.compare --claude X.xml --kraken Y.txt` to validate each batch
5. Convert to JSON and add to the web app

The pipeline is fully operational. The pilot validated all critical decisions. Scale when ready.
