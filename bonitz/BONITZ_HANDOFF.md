# Bonitz *Index Aristotelicus* — OCR Handoff Instructions

Hand this whole file to your Claude Code session. It is self-contained: it explains
the project, the exact transcription rules, the file formats, and the step-by-step
workflow. Read it top to bottom before starting.

---

## 0. TL;DR for the human

You're digitizing pages of Hermann Bonitz's ***Index Aristotelicus*** (Berlin, 1870) —
a 19th-century Greek/Latin scholarly index to Aristotle's works. A teammate (John) has
already done printed pages **15–60**; **your job is the entire remainder — printed pages
61 through 890** (see §13). It's a big corpus (~825 pages); work in page order, a few at a
time, sending batches as you go.

**The transcription is done in TWO explicit passes, producing three files per column:**

1. **Pass 1 — Diplomatic transcription** (`diplomatic/page-NNN-L.txt`): a *verbatim,
   character-for-character* record of exactly what is printed — including the raw `ϗ` and
   `ȣ` ligatures with their printed marks, exact line breaks, exact hyphenation. No
   expansion, no tagging. This is the **archival base layer**: a faithful record we can
   fall back on if the tagged version has an error, and a ready source for a
   character-accurate reprint.
2. **Pass 2 — Tagged, normalized XML** (`output/page-NNN-L.xml`): built *from* the Pass-1
   text plus the image. Here you expand/accent the ligatures and tag the structure
   (lemma, senses, Bekker citations, Latin prose) per our schema.
3. **JSON** (`json/page-NNN-L.json`): produced from the XML by a script — the web format.

**Critical point about your Max plan:** both transcription passes are done by **Claude
Code itself using its vision** (the `Read` tool opens PNG images), *not* by calling the
Anthropic API. Do **not** run any script that imports the `anthropic` SDK
(`transcribe.py`, `batch.py`) — those bill per-token against an API key. Everything here
uses your subscription.

The only scripts you run are pure-Python helpers (no API): `split_columns.py` (cuts a
page into two column images) and `xml_to_json.py` (converts your XML to the web JSON).

---

## 1. What Bonitz looks like

- Two columns per page, dense.
- Each **entry** starts at the hard left margin with a **lemma** (a Greek headword, often
  bold), followed by a run of Greek text interspersed with **Bekker citations** (e.g.
  `1094a1`, `1456b27`) and Latin scholarly abbreviations (`opp`, `cf`, `sim`, …).
- Big entries (e.g. ἀγαθόν, αἴσθησις, λόγος) are subdivided into numbered/lettered
  **senses** and can run across multiple columns and even multiple pages.
- Bekker citations are the single most important data to get right — they are the
  references into Aristotle's text. **Transcribe them exactly; never "correct" them.**

---

## 2. What you've been given

```
book.pdf                       ← the clean scan (the source of truth)
bonitz_pipeline/               ← run scripts from the PARENT dir as `python3 -m bonitz_pipeline.X`
  __init__.py                  ← makes it an importable package (must be present)
  split_columns.py             ← page PNG → two column images (pure PIL/numpy, no API)
  xml_to_json.py               ← your XML → web JSON (pure Python, no API)
  expand_abbrevs.py            ← helper imported by xml_to_json.py (no API)
BONITZ_HANDOFF.md              ← this file
```

These four files are all you need from `bonitz_pipeline/`. You will **not** receive (and
must **not** use) `transcribe.py` or `batch.py` — those call the paid API. If a script is
missing, you (Claude Code) can recreate the helpers from §5/§8, but ask John first.

---

## 3. How transcription works on a Max plan (read this carefully)

**You (Claude Code) are the OCR engine.** You open each column image with the `Read` tool
and transcribe it yourself — twice, in two distinct passes. Opus is strong at reading
polytonic Greek and 19th-century print; that's why this works. The two passes have
*different goals* and must not be collapsed into one:

- **Pass 1 is faithful, not smart.** Reproduce exactly what the page shows — including the
  raw ligatures and the original line breaks. Do **not** expand, normalize, or tag.
- **Pass 2 is editorial.** Now you expand/accent the ligatures and add the structural tags,
  working from your Pass-1 text and the image.

Workflow per page, which you can drive in a loop with Bash + Read + Write:

1. Render the page to a PNG (Bash: `pdftoppm`).
2. Split into left/right column PNGs (Bash: `split_columns.py`).
3. **Pass 1 (diplomatic):** `Read` the left column PNG, transcribe verbatim per the §6A
   prompt, `Write` `diplomatic/page-NNN-L.txt`. Repeat for the right column.
4. **Pass 2 (tagged):** `Read` your `diplomatic/page-NNN-L.txt` *and* the column PNG,
   produce the schema XML per the §6B prompt, `Write` `output/page-NNN-L.xml`. Repeat -R.
5. Convert both XMLs to JSON (Bash: `xml_to_json.py`).
6. Delete the page/column PNGs (they're large; the `.txt`, `.xml`, `.json` are the keepers).

Do a few pages at a time and **spot-check** both passes against the image before moving on
(see §10). Accuracy matters far more than speed.

> **Why two passes?** The diplomatic `.txt` is an archival base layer. If the tagged XML
> has an error, the verbatim original is right there to re-derive from — and it doubles as
> a character-for-character source for a faithful reprint. Pass 2 is built *from* Pass 1,
> so the two stay consistent.

---

## 4. Setup / prerequisites

```bash
# Poppler provides pdftoppm (PDF → image). On macOS:
brew install poppler
# Python deps for the two helper scripts (NO anthropic SDK needed):
python3 -m pip install pillow numpy
```

Put `book.pdf` somewhere stable (e.g. `~/bonitz/book.pdf`). Create working dirs:

```bash
mkdir -p diplomatic             # Pass 1 verbatim .txt   (keep permanently — archival)
mkdir -p output                 # Pass 2 tagged .xml     (keep permanently)
mkdir -p json                   # generated .json        (this is what John imports)
mkdir -p /tmp/bonitz/cols       # scratch images (deleted after each page)
```

> **Page numbering:** `-f N -l N` in `pdftoppm` is the **PDF page index**, which may differ
> from the printed Bonitz page number. John's range refers to **printed Bonitz pages**;
> the α section ran printed pages 15–60. Confirm the offset on your PDF by rendering one
> page and checking the running head against the printed number, then apply that offset
> consistently. Name your output files by the **printed** page number.

---

## 5. Per-page workflow (exact commands)

Let `PAGE=061` (zero-padded, printed page number; adjust for PDF offset in `-f/-l`).

```bash
# 5a. Render the page at 600 PPI to PNG (PNG, not TIFF — Read opens PNG directly)
pdftoppm -png -r 600 -f $PAGE -l $PAGE book.pdf /tmp/bonitz/pg
#   produces /tmp/bonitz/pg-<something>.png ; rename to a clean name:
mv /tmp/bonitz/pg-*.png /tmp/bonitz/page-$PAGE.png

# 5b. Split into two columns (outputs page-$PAGE-L.png and page-$PAGE-R.png)
python3 -m bonitz_pipeline.split_columns /tmp/bonitz/page-$PAGE.png --out /tmp/bonitz/cols/
```

`split_columns.py` grayscales the page, finds the lowest-ink vertical strip in the
center 30–70 % (the gutter), crops left/right, and trims running heads (top 4 %, bottom
3 %) and outer margins (~2.5 % each side). It preserves DPI. If a particular page splits
badly (skew, a figure, a wide table), open the full page image yourself and crop by eye,
or transcribe the full page in reading order (left column fully, then right).

```bash
# 5c. PASS 1 — DIPLOMATIC transcription (this is YOU, not a script).
#   Read /tmp/bonitz/cols/page-$PAGE-L.png, transcribe VERBATIM per the §6A prompt,
#   Write to:  diplomatic/page-$PAGE-L.txt
#   Then the same for -R → diplomatic/page-$PAGE-R.txt

# 5d. PASS 2 — TAGGED XML (this is YOU, not a script).
#   Read BOTH diplomatic/page-$PAGE-L.txt AND /tmp/bonitz/cols/page-$PAGE-L.png,
#   produce the schema XML per the §6B prompt, Write to:  output/page-$PAGE-L.xml
#   Then the same for -R → output/page-$PAGE-R.xml

# 5e. Convert each XML to JSON
python3 -m bonitz_pipeline.xml_to_json output/page-$PAGE-L.xml --out json/page-$PAGE-L.json
python3 -m bonitz_pipeline.xml_to_json output/page-$PAGE-R.xml --out json/page-$PAGE-R.json

# 5f. Clean up scratch images
rm -f /tmp/bonitz/page-$PAGE.png /tmp/bonitz/cols/page-$PAGE-*.png
```

> **A note on reading the column image:** transcribe the column **top to bottom in a single
> reading order**. Don't skip lines. In Pass 1, render an unreadable character as your best
> guess; in Pass 2, wrap a genuinely uncertain passage in `<unclear>…</unclear>`.

---

## 6A. PASS 1 PROMPT — Diplomatic (verbatim) transcription

> Use this as your spec for Pass 1. Produce **only** the transcribed text — no commentary,
> no tags, no XML. Write it to `diplomatic/page-NNN-L.txt`.

```
You are making a DIPLOMATIC transcription of one column from a scan of Bonitz's
*Index Aristotelicus* (Berlin 1870). "Diplomatic" means: reproduce exactly what is
printed, character for character. Do NOT normalize, expand, correct, or tag anything.

Rules:
1.  Transcribe every character exactly as printed, reading top to bottom, left to right.
2.  PRESERVE THE LIGATURES VERBATIM. Bonitz uses two special letters — do NOT expand them:
      - ϗ  (the kai symbol, a stylized κ) — type it as the literal character ϗ (U+03D7),
        with whatever accent/breathing mark sits on it.
      - ȣ  (the ou digraph, a joined ο+υ) — type it as the literal character ȣ (U+0223),
        with whatever mark (macron/overline, acute, grave, breathing…) sits on it.
    Reproduce the marks you actually see on these glyphs; do not add or remove any.
3.  Preserve ALL polytonic diacritics exactly as printed (acute, grave, circumflex,
    smooth/rough breathing, iota subscript, diaeresis). Unicode NFC.
4.  Preserve the line structure: one line of output per printed line in the column.
5.  Preserve end-of-line hyphenation exactly. If a word is broken across two printed lines
    with a hyphen, keep the hyphen and the break exactly as printed — do NOT rejoin the word.
6.  Type Bekker citations, Latin words, and abbreviations exactly as printed. No tags.
7.  If a character is genuinely illegible, give your best single-character guess and mark
    it by enclosing just that character in ⟨angle brackets⟩, e.g. ⟨α⟩. Do not omit text.
8.  Output PLAIN TEXT only. No XML, no markup, no headers, no commentary.

The column image has already had the running head and outer margins cropped, so transcribe
everything you see in the image.
```

---

## 6B. PASS 2 PROMPT — Tagged, normalized XML (use this verbatim as your spec)

> For Pass 2 you are given your **Pass-1 diplomatic `.txt`** (your authoritative character
> source) **and the column image** (for layout cues: lemma boundaries, sense divisions,
> bold, continuation). Produce **only** the XML. No prose before or after. Start with
> `<column`. This is where you EXPAND and ACCENT the ligatures and add the tags.

```
You are producing a TAGGED, NORMALIZED XML edition of one column from Bonitz's
*Index Aristotelicus* (Berlin 1870). You have two inputs: the diplomatic (verbatim)
transcription of this column, and the column image. Use the diplomatic text as your
character source; use the image to resolve structure (lemma boundaries, sense divisions,
bold headwords, where an entry is cut off). Unlike the diplomatic pass, here you DO expand
and accent the ligatures (Rule 13) and add the tags.

Produce an XML transcription following this schema:

  <column page="N" col="left|right" section="LETTER">
    <section_head>Α</section_head>

    <!-- Simple entry (single sense): -->
    <entry>
      <lemma>ἀάζειν</lemma>
      <text>θερμόν μβ8.<cit>367b2</cit>. opp φυσᾶν πλδ7.<cit>964a11</cit>.</text>
    </entry>

    <!-- Entry with multiple senses (use <sense> children directly under <entry>): -->
    <entry>
      <lemma>ἀγαθός</lemma>
      <sense n="1"><text>primary sense… <cit>1094a1</cit>.</text></sense>
      <sense n="2">
        <text>second sense…</text>
        <sense n="2a"><text>sub-sense a… <cit>1097a15</cit>.</text></sense>
        <sense n="2b"><text>sub-sense b…</text></sense>
      </sense>
    </entry>

    <!-- Entry cut off at column boundary: -->
    <entry continues="next">
      <lemma>ἀγαθός</lemma>
      <text>…text that continues in next column…</text>
    </entry>
  </column>

If the column BEGINS mid-entry (continuation from the previous column):
  <column page="N" col="right" section="LETTER">
    <entry type="continuation">
      <text>…continuation text, no lemma…</text>
    </entry>
    <!-- remaining entries follow normally -->
  </column>

Rules:
1.  Each <cit> tag wraps a Bekker citation verbatim as it appears in the scan (e.g.
    1456b27, 964a11, 1022b32). Do NOT resolve or standardize them.
2.  Use <unclear>TEXT</unclear> for any passage you cannot confidently read.
3.  Preserve the Greek text exactly, including polytonic diacritics (acute, grave,
    circumflex, smooth/rough breathings, iota subscript, diaeresis). Use Unicode NFC form.
4.  Latin abbreviations (e.g. opp, cf, ie, sim, dist, act, pass) appear as-is.
5.  The first entry in a column that begins with no lemma (opening line is a section
    header gloss, not a continuation) uses <entry type="header_gloss"> with a <text> child.
6.  For the section header line (the big Greek capital letter at the top of a new
    section), use <section_head>Α</section_head>.
7.  Do NOT include running heads (page number / section letter printed at the top margin).
8.  Entries are separated by a hard left margin. Continuation lines are indented.
9.  Entry text may contain cross-references (Xref_abbrev N. CITATION) — transcribe as
    plain text; only the Bekker number+column+line gets a <cit> tag.
10. Sense divisions: Use <sense n="1">, <sense n="2"> etc. when an entry has clearly
    distinct senses or usage clusters, signalled by:
      - Em-dashes (—) introducing a new sub-topic or contrast
      - Arabic numerals (1. 2. 3.) Bonitz has printed in the entry
      - act / pass marking distinct active/passive sense clusters
      - Nested sub-senses use n="1a", n="1b" etc.
    Simple entries with no internal divisions use <text> directly (no <sense> wrapper).
    *** Place <sense> elements as DIRECT children of <entry>. Do NOT wrap them inside a
        <text> element. (A <text>…</text> holds running text; <sense> is a sibling of
        <lemma>, not nested in <text>.) This is true for continuation entries too:
        <entry type="continuation"><sense n="1">…</sense><sense n="2">…</sense></entry>. ***
11. Cross-column continuation: If the last entry of the column is cut off (continues into
    the next column), add continues="next" to that <entry> tag. If the column opens
    mid-entry, use <entry type="continuation"> with no <lemma>.
12. Latin prose: Bonitz writes descriptive Latin phrases inline (e.g. "signa terminorum
    in prima syllogismorum figura", "de vi atque usu huius vocis", "quaeritur an", "pro
    eo quod"). Wrap any Latin phrase longer than a single scholarly abbreviation in
    <lat gloss="English translation">Latin text</lat>. Short fixed abbreviations (opp, cf,
    ie, sim, dist, act, pass, al, veluti, hoc loco, cum codd, e cod, scripsit) do NOT need
    <lat> tags — they are handled automatically. Everything else that is Latin prose gets a
    <lat> tag with your best English rendering as the gloss attribute.
13. 19th-century printing ligatures: Bonitz uses two special characters not in standard
    Greek Unicode. Recognise them in any diacritical form and expand to standard
    polytonic Greek:
      - ϗ (the kai symbol, looks like a stylized κ) — always the word καί ("and"). Apply
        the oxytone grave rule: write καὶ (grave) before a following word, καί (acute)
        before punctuation or a pause.
      - ȣ (the ou digraph, looks like a joined ο+υ) — the vowel cluster -ου-. Expand to ου.
        Never render ȣ as υ or ῦ.
      - CRITICAL — fully accent the expanded word. Bonitz often prints the ȣ ligature BARE
        (no visible accent) even when the ου-syllable carries the accent. Never reproduce a
        bare unaccented ου: supply the correct polytonic accent/breathing the word needs in
        context. Examples: bare τȣ → τοῦ (gen. article, circumflex); ȣκ → οὐκ, ȣ → οὐ,
        ȣχ → οὐχ (negative, smooth breathing); ȣτω → οὕτω (rough breathing); νȣς → νοῦς;
        τȣτο → τοῦτο but τȣτων → τούτων (accent shifts by case); αὐτȣ → αὐτοῦ; contract
        endings → -οῦσι / -οῦνται / -οῦν (circumflex); contract participles where ου is the
        antepenult → -ούμεν- (acute, e.g. καλούμενον); genitives of oxytone stems → -οῦ
        (e.g. ἀγαθοῦ, ξηροῦ). When a mark IS printed on the ligature (overline = circumflex
        οῦ, acute = ού, breathing…), honour it. The result must always be a correctly
        accented Greek word — never bare ου.

Output ONLY the XML, starting with <column. No prose before or after.
```

> **Why rule 10 has the extra `***` note:** an earlier batch occasionally nested `<sense>`
> inside `<text>`, which silently dropped the content during JSON conversion. The converter
> has since been hardened to recover both shapes, but please still emit `<sense>` as a
> direct child of `<entry>` — it's the canonical form.

---

## 7. The XML format — every tag explained

| Tag | Meaning |
|---|---|
| `<column page="N" col="left\|right" section="X">` | Root. `page` = printed page #, `col` = which column, `section` = the alphabet letter this column falls under (e.g. `Α`, `Β`). |
| `<section_head>Α</section_head>` | The big capital letter that opens a new alphabetic section. Only on the page/column where a new letter begins. |
| `<entry>` | One Bonitz entry. |
| `<entry type="header_gloss">` | Opening gloss line under a section head, with no lemma. |
| `<entry type="continuation">` | Column opens mid-entry (continued from previous column); no `<lemma>`. |
| `<entry continues="next">` | Entry is cut off at the bottom of this column and continues in the next. |
| `<lemma>…</lemma>` | The Greek headword. |
| `<text>…</text>` | Running entry text. Holds plain Greek plus inline `<cit>`, `<unclear>`, `<lat>`. |
| `<sense n="1">…</sense>` | A distinct sense/usage cluster. Direct child of `<entry>`. May nest further `<sense n="1a">`. Contains a `<text>` child. |
| `<cit>1094a1</cit>` | A Bekker citation, verbatim. **Most important data.** |
| `<unclear>…</unclear>` | Best-guess reading of an illegible passage. |
| `<lat gloss="English">Latin</lat>` | A Latin prose phrase, with your English translation in `gloss`. |

Encoding: **UTF-8, Unicode NFC**. Polytonic Greek must keep all diacritics.

---

## 8. The JSON format — what `xml_to_json.py` produces

Run `xml_to_json.py` on each XML; it emits one JSON object per column:

```json
{
  "page": "61",
  "col": "left",
  "section": "Α",
  "entries": [ /* array of entry objects, in column order */ ]
}
```

Each **entry object** is one of these shapes:

```jsonc
// Section head
{ "type": "section_head", "content": "Α" }

// Simple entry (single block of text)
{ "type": "entry", "lemma": "ἀάζειν", "segments": [ /* segment list */ ] }

// Multi-sense entry
{ "type": "entry", "lemma": "ἀγαθός",
  "senses": [
    { "n": "1", "segments": [ … ] },
    { "n": "2", "segments": [ … ], "children": [ { "n": "2a", "segments": [ … ] } ] }
  ] }

// Continuation entry (column opened mid-entry; no lemma). May carry "segments" or "senses".
{ "type": "continuation", "senses": [ … ] }

// Cut-off entry (continues into next column)
{ "type": "entry", "lemma": "ἀγαθός", "continues": true, "segments": [ … ] }

// Header gloss
{ "type": "header_gloss", "segments": [ … ] }
```

A **segment** is one token of rendered content. `xml_to_json.py` (via `expand_abbrevs.py`)
auto-expands work-reference abbreviations and Latin abbreviations into structured segments
so the website can show Greek / Latin / English. The kinds:

```jsonc
{ "kind": "text",       "content": "θερμόν " }                 // plain Greek/text
{ "kind": "cit",        "content": "367b2" }                   // Bekker citation
{ "kind": "unclear",    "content": "…" }                       // illegible best-guess
{ "kind": "wref",       "abbr": "Μδ", "book": "δ", "chap": "22",
  "latin": "Metaphysica", "english": "Metaphysics" }           // work reference, auto-expanded
{ "kind": "latin_abbr", "abbr": "opp", "english": "opposite of" } // auto-expanded abbreviation
{ "kind": "lat",        "latin": "signa terminorum…",
  "english": "symbols for the terms…" }                        // from your <lat> tag
```

You don't author the JSON by hand — it's generated. But understanding the shape helps you
sanity-check: if a column's JSON has an entry with `"segments": []` and no `"senses"`, you
probably mis-nested something in the XML (see §7/§10).

---

## 9. File naming & layout (must match exactly)

```
diplomatic/page-061-L.txt  diplomatic/page-061-R.txt  ← Pass 1, keep (archival base layer)
output/page-061-L.xml      output/page-061-R.xml      ← Pass 2, keep
json/page-061-L.json       json/page-061-R.json       ← generated, this is what John imports
```

- Page number is the **printed Bonitz page**, zero-padded to 3 digits.
- Column suffix is `-L` or `-R`.
- **Three files per column** (`.txt`, `.xml`, `.json`). Send John the `diplomatic/`,
  `output/`, and `json/` directories.

---

## 10. Quality checks before you call a page done

**Pass 1 (diplomatic `.txt`):**

1. **Ligatures PRESENT.** The raw `ϗ` and `ȣ` characters *should* still be there — Pass 1
   is verbatim. If they're missing, you normalized too early (that's Pass 2's job).
2. **Line count matches.** Roughly one `.txt` line per printed line; hyphenation at line
   ends preserved.

**Pass 2 (tagged `.xml`) and JSON:**

3. **No empty entries.** Scan the JSON: any entry with `"segments": []` and no `"senses"`
   is a red flag — re-open the image and check you didn't nest `<sense>` inside `<text>`
   or drop the text.
4. **Citation count sanity.** Glance at the column image; count roughly how many Bekker
   numbers there are; make sure your `<cit>` count is in the same ballpark.
5. **Ligatures gone AND accented.** Search your XML for the raw ligature characters `ϗ`
   and `ȣ` — they should **not** appear here (this is the opposite of Pass 1). Then check no
   **bare unaccented `ου`** slipped through: every expanded word must carry a real accent
   (acute/grave/circumflex), e.g. `τοῦ` not `του`, `οὐκ` not `ουκ`, `καλοῦσι` not
   `καλουσι`. A bare unaccented `ου` means you expanded the glyph but forgot to accent the
   word (see Rule 13).
6. **XML matches the diplomatic text.** The tagged text should be the same words as your
   `.txt` (modulo expanded ligatures + rejoined line-end hyphens + tags). If they diverge,
   one of the two passes misread something.
7. **Greek diacritics intact.** Spot-check a few words against the image.
8. **Valid XML.** `python3 -c "import xml.etree.ElementTree as ET; ET.parse('output/page-061-L.xml')"`
   should not error.

Quick empty-entry scan across everything you've produced:

```bash
python3 - <<'PY'
import json, glob, os
for f in sorted(glob.glob('json/page-*.json')):
    d = json.load(open(f, encoding='utf-8'))
    for i, e in enumerate(d.get('entries', [])):
        if not e.get('senses') and not e.get('segments'):
            print(f"{os.path.basename(f)} entry#{i} EMPTY ({e.get('type')})")
PY
```

(An empty `continues`/`continuation` marker at a column edge can be legitimate, but an
empty entry that *should* have a lemma or text is a bug — re-transcribe it.)

---

## 11. The two ligatures (the easiest thing to get wrong)

> **This section is about PASS 2 only.** In Pass 1 (diplomatic) you keep `ϗ` and `ȣ`
> exactly as printed. The expansion/accenting below happens when you build the tagged XML.

19th-century German Greek typesetting uses two glyphs that are NOT modern Unicode Greek:

- **ϗ** — the **kai symbol** (a stylized κ). It is the word **καί** ("and"). Write **καὶ**
  (grave) before a following word, **καί** (acute) before a pause/punctuation.
- **ȣ** — the **ou digraph** (joined ο+υ), the **-ου-** vowel cluster. Expand to **ου** and
  never write `υ` or `ῦ`.

**The trap: accent the word, even when the ligature is printed bare.** Bonitz often prints
`ȣ` with no visible accent on words whose ου-syllable *should* be accented. Supply the
accent the word needs — do not leave a bare `ου`:

| Bonitz prints | wrong (bare) | correct |
|---|---|---|
| τȣ | του | **τοῦ** (gen. article) |
| ȣκ / ȣ / ȣχ | ουκ / ου / ουχ | **οὐκ / οὐ / οὐχ** (negative) |
| ȣτω | ουτω | **οὕτω** |
| νȣς | νους | **νοῦς** |
| τȣτο / τȣτων | τουτο / τουτων | **τοῦτο / τούτων** (accent shifts by case) |
| αὐτȣ | αυτου | **αὐτοῦ** |
| καλȣσι (contract) | καλουσι | **καλοῦσι** |
| καλȣμενον (participle) | καλουμενον | **καλούμενον** |
| ἀγαθȣ (oxytone gen.) | αγαθου | **ἀγαθοῦ** |

When a mark *is* printed on the ligature, honour it: `τȣ̄` → `τοῦ`, `ἀθρόȣ` → `ἀθρόου`,
`τȣ̀ς` → `τοὺς`, `λόγȣ` → `λόγου`.

---

## 12. What to send back to John

- All three directories: **`diplomatic/`** (Pass 1 `.txt`), **`output/`** (Pass 2 `.xml`),
  and **`json/`** (generated). The `diplomatic/` files are the archival base layer — don't
  skip them.
- A note of **which printed pages** you covered and **any pages you flagged** (bad split,
  unreadable patches, anything you marked `⟨…⟩` in Pass 1 or `<unclear>` in Pass 2).
- Do **not** send the rendered PNG/TIFF images (huge; John has the PDF).

---

## 13. Your assignment — all remaining pages

**You're processing the entire rest of the index.** John has done the α section through
printed page 60; you take it from there to the end.

- **Already done — do NOT redo:** printed pages **15–60** (α through ἀναμιγνύναι).
- **Your range — everything else:** printed pages **61 through 885** (the rest of the index
  body, α continues mid-word at page 61 and runs through Ω), **plus the *Addenda et
  Corrigenda* on pages 886–890.** That's ~825 printed pages, ~1,650 columns.
- Front matter (pages 1–13) and the abbreviation table (page 14) are **not** your job —
  skip them.

**How to manage a job this size:**
- Work **in printed-page order**, a handful of pages at a time, completing both passes and
  the JSON for each before moving on. Don't batch hundreds blind — spot-check as you go
  (§10), because a systematic misread caught at page 65 saves you 800 pages of it.
- The work is resumable: name files by printed page (§9), and you can always tell where you
  stopped by the highest page number in `output/`.
- Send John batches as you finish them (e.g. every ~50 pages) rather than holding the whole
  corpus to the end — that lets him catch any issue early.
- Flag, don't agonize: if a page is badly skewed, has a table/figure, or a stretch you
  can't read, mark it (`⟨…⟩` / `<unclear>`), note the page, and keep going.

---

*Questions to John, not guesses:* the printed-page↔PDF-page offset for your copy. The page
range is the whole remainder (61–890); everything else is specified above.
