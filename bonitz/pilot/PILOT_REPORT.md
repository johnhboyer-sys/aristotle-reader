# Stage 2 Pilot Report — Page 15, Left Column
**Date:** 2026-06-15  
**Source image:** `page-015-L.tif` (PDF-derived 300 PPI TIFF, split by `split_columns.py`)  
**Primary transcriber:** Claude Opus 4.8 (production model)  
**Comparison:** Sonnet 4.6 (proxy), Kraken 6.0.3 + `greek-german_serifs_sophokle1v3soph`  
**Gold:** `p15_left_gold.txt` (46 lines, hand-keyed, one physical scan line per line)

---

## 1. Page Range (Confirmed)

| Range | PDF pages | Notes |
|---|---|---|
| Front matter / title | 1–13 | Includes title pages, preface |
| Abbreviation table | 14 | High-value for Stage 4 |
| **Index body** | **15–885** | **871 pages** (spec said ~878; close) |
| Addenda et Corrigenda | 886–890 | ~5 pages |
| Blank / back cover | 891–896 | |

Page 15 confirmed as α-section start (φωνῆεν…).  
Page 885 confirmed as last index page (ω-section end before Addenda header).

---

## 2. Image Pipeline

`pdftoppm -tiff -r 300 book.pdf page` → `split_columns.py` → `page-015-L.tif`

Column dimensions at 300 PPI: 1049 × 2916 px (left), 1023 × 2916 px (right). Gutter detected cleanly.  
Production run will use 600 PPI; `split_columns.py` is resolution-independent.

---

## 3. Digit-Guard Normalization

All 6 spec examples pass:

| Gold | Kraken | Extracted (both) |
|---|---|---|
| `1456b27` | `1456227` | (1456, 27) ✓ |
| `1458a12` | `1458 412` | (1458, 12) ✓ |
| `1022b32` | `102232` | (1022, 32) ✓ |
| `964a11` | `964 211` | (964, 11) ✓ |
| `277b19` | `277219` | (277, 19) ✓ |
| `1426b32` | `1426 932` | (1426, 32) ✓ |

Strategy: parse Bekker as `(page, line)` integer pairs. Two-pass hint-aware parsing (strict regex first, then heuristics on uncovered digit runs). Supports Latin a/b and Greek α/β column letters.

---

## 4. Three-Way Scorecard

| Metric | **Opus 4.8** | Sonnet 4.6 | Kraken |
|---|---|---|---|
| **CER vs gold** | **9.2%** | 13.5% | 19.7% |
| **Bekker recall** | **93.9%** | 75.5% | 79.6% |
| **Bekker precision** | 93.9% | 84.1% | **95.1%** |
| Total missed citations | ~2* | 13 | 10 |
| Gold citations | 49 | 49 | 49 |

*Opus's one "Missed by Claude only" — `(145, 27)` — is a gold typo: gold reads `145b27` but the correct citation is `1456b27` (Poetics 1456b27). Opus got it right. True Opus misses = 2 (both missed by all three systems).

### Verdict

**Opus 4.8 is the primary transcriber.** It is 4.3 CER points better than Sonnet, 10.5 points better than Kraken, and 18 recall points ahead of Sonnet. Kraken's precision advantage (95.1% vs 93.9%) reflects conservatism, not superiority.

Kraken's role at scale: verifier, flagging the ~6% of citations Opus misses or garbles.

---

## 5. Citation Miss Analysis

### Missed by all three systems (2)

| Citation | Section | Likely cause |
|---|---|---|
| (806, 8) | ἀβέβαιος | Scan difficulty / unusual notation |
| (978, 32) | α header gloss | Same |

### Missed by Opus only (effectively 0 after gold correction)

| Citation | Note |
|---|---|
| (145, 27) | Gold typo — should be (1456, 27); Opus read it correctly |

### Missed by Kraken but not Opus (8)

| Citation | Section | Cause |
|---|---|---|
| (303, 4), (365, 19), (470, 28), (742, 20), (764, 7) | Ἀβδηρίτης | Entire entry garbled/dropped by Kraken |
| (618, 1), (681, 5) | ἄβρωτος | Severely garbled block |
| (1339, 25) | ἀβλαβής | Page-number misread: 1339 → 1359 (genuine digit error) |

---

## 6. Code Deliverables

| File | Status | Notes |
|---|---|---|
| `bonitz_pipeline/split_columns.py` | ✓ | PIL gutter-detection column splitter |
| `bonitz_pipeline/digit_guard.py` | ✓ | Normalization + validation (6/6) |
| `bonitz_pipeline/align.py` | ✓ | Monotonic line alignment |
| `bonitz_pipeline/compare.py` | ✓ | Column-level CER + Bekker recall/precision |
| `bonitz_pipeline/transcribe.py` | ✓ | Anthropic API transcription (vision) |
| `pilot/p15_left_opus48.xml` | ✓ | Opus 4.8 structured markup (49 citations, 18 entries) |
| `pilot/p15_left_claude.xml` | ✓ | Sonnet 4.6 markup (44 citations, 17 entries) |
| `pilot/p15_left_kraken.txt` | ✓ | Kraken sophokle output |
| `pilot/p15_left_gold.txt` | ✓ | Hand-keyed gold (46 lines, 49 citations) |

---

## 7. Gold File Note

Gold `p15_left_gold.txt` line 1 reads `145b27` — almost certainly a transcription typo for `1456b27` (Bonitz cites Poetics 1456b27). This causes the scoring to show one spurious Opus miss. The gold file should be corrected before use as a test fixture.

---

## 8. Next Steps

1. **Fix gold typo**: `145b27` → `1456b27` in `pilot/p15_left_gold.txt` line 1.
2. **Production image pipeline**: render at 600 PPI, split via `split_columns.py`, then pipeline. Disk: ~72 GB for full 871-page run; process in ~100-page chunks.
3. **Scale Opus 4.8**: full index body (pages 15–885, 871 pages × 2 columns = 1742 API calls). Estimated cost: ~$90–260 at current Opus pricing.
4. **Kraken as verifier**: run Kraken on all columns; use `compare.py` to flag Bekker mismatches for human review (~6% of citations).
5. **Stage 3**: resolve Bekker citations back to the aristotle-reader spine.
