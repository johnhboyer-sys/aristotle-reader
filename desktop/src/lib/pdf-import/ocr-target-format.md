# Target format for OCR output — the Goal-B input contract

What a scanned-and-OCR'd translation must look like for `convertLayoutExtraction`
to import it cleanly. This is the SPEC the Goal-A (OCR cleanup) pipeline aims at:
every requirement below is enforced by a named gate, audit, or pinned test in this
module — nothing here is aspirational. Where a number appears, it is the actual
constant the code uses.

The one-sentence version: **reproduce what `pdftotext -layout` would have emitted
from a born-digital PDF of the same pages** — pages separated by form feeds, geometry
carried in spaces, furniture in its printed place.

## 0. The grader

Run the converter and read its report. That IS the acceptance test for Goal-A
output; iterate until:

| Report field | Target | Meaning if missed |
|---|---|---|
| refusal | none | no usable gutter numbers at all |
| collapsedPages | 0 | a page's tic geometry is pooled/stacked |
| droppedLines | ~0 (only genuine print gaps) | cadence holes — usually OCR lost a marginal number |
| ticsSuppressed | ~0 | corrupted Bekker values (non-monotonic etc.) |
| footnotes.unmatched | ~0 | marker/note pairing failing |
| divisions | every book + chapter, titled where the print titles them | heading geometry wrong |
| displayBlocks | only REAL tables/diagrams | fake wide gaps inside prose |
| seams | none | more than one work in the file — slice it |

## 1. File shape

- **One work per file.** Front matter, endnote commentary, indexes, and any second
  work must be sliced out. (The audits survive violations but flag storms result;
  the seam warning tells the user to slice.)
- **Pages separated by form feed `\f`** — this byte is also the detection signal
  that routes a file into the converter at all. No `\f` → the file is treated as
  ordinary tagged/plain text and the converter never runs.
- Plain UTF-8 text; lines end `\n` (`\r` tolerated and stripped). Polytonic Greek
  in notes/body is fine and preserved verbatim.
- A trailing or doubled `\f` (empty page record) is harmless.

## 2. Per-page skeleton (top to bottom)

```
<running head — ALWAYS the first non-blank line>
<blank>
<body block: prose lines with gutter tics, division headings, titles>
<blank gap (≥1 fully blank line)>
<footnote block, if the page has notes>
<folio (bare page number) — lone integer on its own line>
```

- **The first non-blank line of every page is stripped unconditionally as the
  running head.** Consequence for cleanup — the single most important rule in this
  document: **never delete running heads.** If OCR lost one, line 1 of the page
  becomes body text and will be silently discarded. If a page genuinely has no
  head, insert a placeholder line (e.g. the work title). Content of the head is
  never trusted (Bekker ranges like `1094a–1095a`, lone Bekker pages, chapter
  refs are all fine there).
- **Folio**: a lone integer on its own line near the bottom. Never glue it to text.
- Do not place any other lone-number lines in the body (they read as furniture or
  stray candidates).

## 3. The gutter (Bekker line numbers) — the heart of the format

Geometry is carried ONLY in character columns (spaces). Per page:

- **Verso-style (leading) tics**: at column 0–1, followed by ≥1 space, then the
  body text of that line. Body block indented to a consistent left margin
  (Reeve uses col 11; any consistent indent ≥8 works — the side decision reads
  the modal body indent, threshold ≥8 → verso).
- **Recto-style (trailing) tics**: line-final token, preceded by a run of
  **≥4 spaces**, starting at column **≥40**. Body at column 0.
- Pick ONE side per page and keep every tic on that page in a tight vertical
  band: start columns within ±6 of each other (the scanner keeps candidates
  within max(3×MAD, 6) of the page median; a scattered band → collapse).
- **One tic per line, each on a line that carries body text.** Pooled or stacked
  tics (adjacent lines, no text) trip the collapse detector.
- **Forms**: full-form = 1–4 digit Bekker page + `a`/`b` + optional 1–2 digit
  line (`1094a1`, `676a`, `16a`, `1181a25`). Bare = 1–2 digits (1–99), meaning a
  line of the current column. NO dash ranges (`9–11` is refused by design and
  will surface as a flagged unmatched item — acceptable, but don't create them).
- **Sequence**: bare tics at the 5-cadence (5, 10, 15…), monotonic within a
  column; a new column opens with a full-form. First tics of a physical page may
  be bare (they inherit the column from the previous page).
- **Digit fidelity matters most here.** A single corrupted full-form
  (`1029a1` for `1129a1`) is refused AND costs every following bare tic its
  position until the next valid full-form. If Goal-A cleanup fixes only one
  class of OCR error, fix Bekker digits.

## 4. Body prose

- **Hard-wrapped lines** within a paragraph, wrapped at a consistent measure.
  Ordinary wraps: just break at a space. Hyphenated breaks: keep the hyphen as
  the last character (`differ-`), continuation starts the next line; a lowercase
  continuation is rejoined without the hyphen, uppercase keeps it (compound).
- **Paragraph openings are marked by indent**: first line of a new paragraph
  indented **+2 to +8 columns** beyond the body's left margin (print uses ~+4).
  Blank lines inside the body do NOT create paragraphs (deliberately — page-break
  blanks are a classic OCR artifact). Verse quotations: indent each verse line
  within the same +2..+8 window and each keeps its own line.
- **Single spaces inside prose.** An internal run of ≥4 spaces makes a line
  display-shaped; ≥2 such adjacent lines (or one such line alone) become a
  preserved display block. That is exactly right for REAL tables/diagrams
  (keep their wide spacing!) and exactly wrong for OCR spacing noise inside
  ordinary sentences — the OCR'd Clarendon PA showed 1,369 false display blocks
  from this. Normalize prose spacing; preserve tabular spacing.
- **Footnote markers**: glued directly to the preceding word or punctuation
  (`sciences,1`, `equal.6`), 1–3 digits, NOT followed by a period, digit, or
  `a`/`b`. Never space-separated (a space-preceded number is prose). `*`/`†`
  markers only in running heads / heading lines (work-level notes).

## 5. Division headings

All centered: standalone line whose text starts **≥15 columns** past the body's
left margin, with nothing else on the line (a gutter tic on the same line is fine
— it stays in the gutter system).

- **Book**: `Book 5` / `BOOK FOUR` / `BOOK IV` (keyword + Arabic/Roman/spelled-out).
- **Chapter**: bare dotted `5.1` (Reeve style), or `CHAPTER I` / `Chapter 12`
  (keyword style), or — single-book works only — a bare centered numeral `4`
  that continues the 1, 2, 3… sequence.
- **Title** (optional, captured verbatim): the very next non-blank line, centered
  so its midpoint sits within **±4 columns** of the heading's midpoint, ≤70
  characters, no digits-only content. Don't re-center titles; long titles
  naturally start near the margin and that is fine — midpoint is what counts.
- Order: `Book N` (if any) → chapter heading → title → body. Chapter 1 should
  follow each book heading (a different first chapter is flagged, not fatal).
- Numbers verbatim — never renumber to "fix" the edition.

## 6. Footnote block (page bottom)

- Separated from the last body line by **≥1 fully blank line**.
- OPTIONAL explicit divider: a line containing exactly `<<notes>>` between the
  blank gap and the first note makes the block bounds ground truth — the
  converter skips its block-shape heuristics (including the bottom-40%-of-page
  extent guard). Use it when notes are commentary-length (endnote house
  styles): such blocks legitimately dominate the page and the heuristics
  refuse them. Without the divider, detection is heuristic exactly as before.
- The divider may DECLARE the numbering scheme: `<<notes scope=per-chapter>>`
  (also `continuous` / `per-book`). A declaration is document-sticky and
  trusted over the importer's scope inference — reconstruction pipelines know
  the edition's scheme, and reconstructed blocks (gap-filled notes without
  markers, garbled duplicate markers) otherwise feed the inference machine
  phantom observations.
- Each note starts `N. text` (1–3 digit printed number, period, space) at the
  body's left margin; `* text` / `† text` for symbol notes.
- Wrapped note text continues on following lines WITHOUT the `N.` prefix.
  A note-internal diagram keeps its wide spacing (display lines preserved).
- Note numbers follow the edition's own scheme (continuous or per-chapter
  resets); the importer infers and states the scope — don't renumber.
- Notes must pair with same-page body markers by the printed number.

## 7. What you do NOT need to clean (the converter already handles it)

Running-head Bekker ranges and lone pages; folios; hyphenation rejoining;
recto/verso alternation and mixed tic sides across pages; tics printed on
heading lines (forward-bound); the work-opening translator `*` note;
1–2-digit Bekker pages (Categories `1a`); columns opening mid-line (MM
`1181a25`); doubled form feeds; blank lines inside the body; glued endnote
digits on headings (`Book 7300`); genuinely missing printed marks (flagged).

## 8. Known failure modes (measured, not hypothetical)

| Input defect | What happens |
|---|---|
| No `\f` (flattened OCR text) | converter never runs; file goes down the tagged-text path |
| Gutter numbers pooled / no per-line geometry | page flagged collapsed → user chooses re-extract or page-level-only |
| OCR multi-space runs inside prose | false display blocks (prose emitted line-by-line) |
| Corrupted Bekker digits | tic refused + following bares lost until next valid full-form (all flagged) |
| Commentary/back matter left in | seam warnings, marker storms, bogus book restarts |
| Running heads deleted | first body line of every page silently lost — the worst silent failure available; keep heads |
