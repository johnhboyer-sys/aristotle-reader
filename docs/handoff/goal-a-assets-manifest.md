# Goal-A Assets Manifest — Lennox PA corpus + tooling inventory

Compiled 2026-07-07 from verified on-disk exploration. The Goal-A build session
trusts this file over re-exploration (Phase 0 confirms existence with `ls`, nothing
more). Companion to `goal-a-session-handoff.md` (same directory).

**All corpus files are John's copyrighted material — local-only, never committed,
never uploaded, never quoted beyond minimal fragments in test pins.**

---

## 1. Source PDFs

| Path | Size | Notes |
|---|---|---|
| `~/Downloads/Aristotle-On the Parts of Animals-2001-Clarendon Press.pdf` | 11 MB | 424 pp, scanned; the authoritative source |
| `~/Downloads/Aristotle-On the Parts of Animals-2001-Clarendon Press copy.pdf` | 12 MB | duplicate/backup (2026-07-05) |

## 2. Pipeline inputs (the two live sources)

### Backbone — geometry source
`~/Downloads/Aristotle-On the Parts of Animals-2001-Clarendon Press.txt` — 1.1 MB,
`pdftotext -layout` over the Adobe-OCR'd text layer. **416 form feeds** (vs 424 PDF
pages). Line structure, gutter tic positions, and page boundaries are reliable;
dashes flattened to `-`; column superscripts garbled (b→`6`/`3`, e.g. `639 6` for
`639b`); recto tics separated by a SINGLE space (converter needs ≥4); verso body
margin at col ~6 (converter side-threshold ≥8). This file is what stages 1–4 repair.
John can re-extract from Adobe if a fresh copy is ever needed.

### Witness — wording source
`~/Downloads/PA - Lennox-2.txt` — 1.1 MB, History Genie (LLM vision) OCR, raw.
No form feeds, but **424 `---` page separators** with running heads inline
(`BOOK ONE $639^{\mathrm{b}}$`). Best wording fidelity (em-dashes preserved, clean
punctuation); worst structure (reflowed); chaotic apparatus encodings (`$^a$`,
`<sup>`, `**639ᵃ**`, unicode superscripts); silent whole-page dropouts logged as
`--- [blank] ---`. Page pairing to the backbone must anchor on running heads/Bekker,
never raw index (416 ≠ 424).

## 3. Prior outputs (reference / regression material — NOT pipeline inputs)

| Path | Size | What it is |
|---|---|---|
| `~/Downloads/PA - Lennox.txt` | 1.1 MB | earlier raw Genie export (pre-normalization) |
| `~/Downloads/PA - Lennox-normalized.md` | 1.0 MB | Genie cleaned by `normalize_lennox_pa.py`: YAML frontmatter, `[[639a]]`/`[[639a5]]` anchors, heads stripped |
| `~/Downloads/PA - Lennox - desktop-import-v2.md` | 284 KB | the retired Python pipeline's merged output; **carries the defect catalog** (below) |
| `~/Downloads/PA - Lennox - desktop-import.md` / `.cleaned.md` | 283 KB each | earlier merge iterations |
| `~/Downloads/PA - Lennox.docx` | 436 KB | Word export (punctuation check) |
| `~/Downloads/PA - Lennox - IMPORT HANDOFF.md` | — | 2026-07-02 handoff for the retired pipeline (historical) |
| `~/Downloads/lennox parts of animals pdftotext.rtf` | 1.2 MB | pdftotext output in RTF wrapper (rarely used) |
| `~/Downloads/clean_lennox_pa.py` | 9 KB | one-off boundary-repair testbed (prior art only) |

**Defect catalog in desktop-import-v2.md** (regression checklist — the new pipeline
must make these structurally impossible): ~90/491 spurious mid-sentence paragraph
breaks (page-break-between-sentences rendered as `\n\n`); stray OCR'd chapter
numeral `I I` (= "II") as a body paragraph before `{1.4}`; stray page number `83` as
a body paragraph.

## 4. Metadata

| Path | Size | What it is |
|---|---|---|
| `~/Downloads/PA - Lennox-by-chapter.json` | 614 KB | commentary segmented by chapter (51 entries: book, chapter, bekker_start/end, paragraphs) |
| `~/Downloads/PA - Lennox-chapter-map.json` | 4.9 KB | same 51 chapters, Bekker ranges only — the slice/divisions cross-check for stage 1 |

## 5. Prior art in the repo (branch `claude/lennox-pa-scripts` — RETIRED, knowledge only)

`git show claude/lennox-pa-scripts:<path>` to read; do not resurrect as a live
pipeline.

- `scripts/normalize_lennox_pa.py` — Genie apparatus normalization + head stripping
- `scripts/desktop-import-hybrid.py` — difflib word-alignment of Genie text onto
  pdftotext lines; **the gutter rule lives here** (verso/leading tic → next word;
  recto/trailing tic → first word of line), ~99% match rate
- `scripts/desktop-import-prep.py` — anchor→`{...}` tag conversion + import-gate checks
- `scripts/pa_chapter_map.py` — commentary→chapter assignment by Bekker ref
- `ocr_translations/CLAUDE.md` — Claude-vision OCR recipe (vision Read IS the OCR;
  single-reader and 2-blind-readers+reviewer modes; macOS specifics; qpdf/pdfinfo/
  pandoc stack). Used for D5 targeted arbitration only.
- `ocr_translations/history-genie/ocr-hybrid-workflow-spec.md` — the prior hybrid
  strategy + gotchas (dash unrecoverability, superscript garble, head gluing, Genie
  dropouts, monotonic flooring, no stranded tags)

## 6. The grader (frozen — zero diff this session)

On main after PR #24 merges: `desktop/src/lib/pdf-import/`
- `index.ts` (`convertLayoutExtraction(raw, opts)` — pure TS, no Tauri deps),
  `pages.ts`, `gutter.ts`, `line-shape.ts` (reusable: `classifyTicToken`,
  `findTrailingToken`, `findLeadingToken`, `RECTO_MIN_GAP`), `divisions.ts`,
  `footnotes.ts`, `emit.ts` (ConvertReport built here)
- Specs: `ocr-target-format.md` (the input contract), `importer-acceptance.md`,
  `implementation-notes.md`
- Tests: `__tests__/` — 112 cases across 10 core files + env-gated real-slice
  integration suites (`ARISTOTLE_REEVE_SLICE`, `ARISTOTLE_REEVE_CAT_SLICE`)
- Consumer: `desktop/src/components/ImportDialog.svelte`

**Honesty-report fields** (the only quality metric): `pages`, `ticsEmitted`,
`ticsSuppressed[]` (by flag), `droppedLines[]`, `collapsedPages[]`,
`divisions{books,chapters,titled}`, `footnotes{scope,notes,markers,unmatched[]}`,
`displayBlocks[]`, `dehyphenation`, `seams[]`, `flags{}`. Plus refusal
(`anyTicSeen===false`) and needs-choice (collapsed pages) results.

## 7. Pinned baseline (raw Adobe txt through the converter, 2026-07-06 smoke)

| Counter | Value |
|---|---|
| ticsEmitted | 51 |
| ticsSuppressed | 205 |
| droppedLines | 56 |
| displayBlocks (false) | 1,369 |
| side-ambiguous flags | 364 |
| seams | present (commentary/back matter in file) |

Stage 0 of the build session re-runs this and must reproduce it (±0) before any
repair work begins.

## 8. Working directory convention

Create `~/Documents/aristotle-ocr/pa-lennox/`; copy the backbone + witness inputs
there; all stage outputs, change-lists, review files, and reports are written there.
Nothing under the repo.
