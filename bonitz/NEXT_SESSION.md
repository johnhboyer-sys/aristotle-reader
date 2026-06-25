# Next Session: Pipeline More of Bonitz

## Paste this at the start of your next Claude Code session

---

We are digitizing Bonitz's *Index Aristotelicus* (Berlin 1870) for the aristotle-reader project. The pipeline is fully built and validated. This session picks up from where we left off.

**Read `bonitz/BONITZ_PROJECT.md` first** — it is the authoritative reference for the full pipeline, all open items, and design decisions.

**Key memory:** `bonitz/bonitz_pipeline/` contains all pipeline modules. The pilot (page 15, left column) is complete and scored. Opus 4.8 is confirmed as primary transcriber (9.2% CER, 95.9% Bekker recall vs hand-keyed gold).

---

## State at end of last session

### Pipeline modules (all in `bonitz/bonitz_pipeline/`)
- `split_columns.py` — PIL gutter-detection column splitter
- `transcribe.py` — Opus 4.8 vision transcription → structured XML
- `digit_guard.py` — Kraken a/b→digit normalization
- `compare.py` — column-level CER + Bekker recall/precision scorer
- `expand_abbrevs.py` — work-ref and Latin abbreviation tokenizer
- `xml_to_json.py` — XML → JSON for the web app

### Web pilot
`app/src/pages/bonitz.astro` — live pilot page with:
- Collapsible entry cards (lemma + bold inline text)
- Latin/English toggle for work titles and abbreviations
- `<lat gloss="...">` support for Opus-tagged Latin prose
- Numbered sense outline for multi-sense entries
- Cross-column continuation markers (`continues="next"` / `type="continuation"`)
- Beta Code + Greek lemma search

### What the transcription prompt now handles
See `transcribe.py:PROMPT` (rules 1–12). Key additions from last session:
- `<sense n="1">`, `<sense n="2">` for multi-sense entries (major terms like ἀγαθός, λόγος)
- `continues="next"` on cut-off entries; `type="continuation"` on continuation entries
- `<lat gloss="English">Latin prose</lat>` for Latin phrases longer than fixed abbreviations

---

## Immediate next steps

### 1. Parse the abbreviation table (page 14 of PDF)
Render page 14 and expand `WORK_TABLE` in `expand_abbrevs.py`. This is the authoritative source for all Bonitz abbreviations and should be done before processing more columns.

```bash
pdftoppm -tiff -r 300 -f 14 -l 14 ~/Downloads/book.pdf /tmp/bonitz/abbrev-page
# Then transcribe or manually read the table
```

### 2. Run the next batch of columns (pages 15–60, α section)
Use this workflow for each page:

```bash
PAGE=016   # zero-padded

# Render at 600 PPI
pdftoppm -tiff -r 600 -f $PAGE -l $PAGE ~/Downloads/book.pdf /tmp/bonitz/page

# Split columns
python3 -m bonitz_pipeline.split_columns /tmp/bonitz/page-$PAGE.tif \
    --out /tmp/bonitz/cols/

# Transcribe left and right columns
ANTHROPIC_API_KEY=sk-ant-... python3 -m bonitz_pipeline.transcribe \
    /tmp/bonitz/cols/page-$PAGE-L.tif --model claude-opus-4-8 \
    --out output/page-$PAGE-L.xml

ANTHROPIC_API_KEY=sk-ant-... python3 -m bonitz_pipeline.transcribe \
    /tmp/bonitz/cols/page-$PAGE-R.tif --model claude-opus-4-8 \
    --out output/page-$PAGE-R.xml

# Kraken verification
~/kraken-env/bin/kraken -i /tmp/bonitz/cols/page-$PAGE-L.tif bw.png binarize
~/kraken-env/bin/kraken -i bw.png output/page-$PAGE-L-kraken.txt \
    segment ocr -m ~/OCR-kraken-models/kraken-models/greek-german_serifs_sophokle1v3soph/

# Score
python3 -m bonitz_pipeline.compare \
    --claude output/page-$PAGE-L.xml \
    --kraken output/page-$PAGE-L-kraken.txt

# Convert to JSON
python3 -m bonitz_pipeline.xml_to_json output/page-$PAGE-L.xml \
    --out ../app/src/data/bonitz/page-$PAGE-L.json
```

### 3. Stitch cross-column entries
When loading adjacent column JSONs, detect `continues: true` on the last entry of column N and `type: "continuation"` on the first entry of column N+1. Merge their text segments into one card under the original lemma. Implement this in the data-loading layer (`xml_to_json.py` or a new `stitch_columns.py`).

### 4. Add letter-section navigator to the web page
Once multiple columns are loaded, add an Α Β Γ … nav at the top of the Bonitz page.

---

## Critical design decisions already made (do not re-litigate)

- **Opus 4.8 is primary transcriber.** Sonnet 4.6 failed the pilot (75.5% Bekker recall).
- **Kraken is verifier only**, not primary. Run it to flag mismatches; don't use its output as the source of truth.
- **Column-level CER** (full text joined as one string) — not line-by-line. Line alignment is unreliable across different transcription styles.
- **`<sense>` tags for multi-sense entries** — do not collapse them back to `<text>`.
- **`<lat gloss="...">` for Latin prose** — Opus tags it; the web toggle shows one or the other. Do not enumerate all Latin phrases in `LATIN_TABLE` (that approach doesn't scale).
- **Entries can span multiple columns and pages.** The web layer stitches them; the XML marks boundaries with `continues="next"` and `type="continuation"`.

---

## Files to check before starting

```
bonitz/BONITZ_PROJECT.md          ← full project spec and open items
bonitz/bonitz_pipeline/transcribe.py   ← current prompt (rules 1–12)
bonitz/bonitz_pipeline/expand_abbrevs.py  ← current abbreviation tables
bonitz/pilot/PILOT_REPORT.md      ← pilot scorecard and error analysis
bonitz/pilot/p15_left_opus48.xml  ← reference output format
```
