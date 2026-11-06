Done. [Full report and allowance audit](build/prob-ocr/work/report-4.md).

| Selftests | Result |
|---|---|
| 1–9: existing mutations | 9/9 CAUGHT |
| 10: 24.11 comma | CAUGHT |
| 11: question beside call-out | CAUGHT |
| 12: Book 21 comma | CAUGHT |

Selftest exits 0.

| Counts | a | b | c | d | e | f | g |
|---|---:|---:|---:|---:|---:|---:|---:|
| Final, exit 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Old books, exit 1 | 61 | 24 | 9 | 1 | 31 | 20 | 14 |
| Allowances: 549 total | 59 | 104 | 0 | 5 | 63 | 314 | 4 |

Geometry thresholds, in x-height units:

| Scan | Max height | Min top lift | Min bottom lift | Tokens removed |
|---|---:|---:|---:|---:|
| A | 1.07 | 0.39 | 0.44 | 86 |
| B | 1.05 | 0.20 | 0.32 | 117 |

Restored the 24.11 comma from A271. New tests use A215 and A243. Remaining punctuation allowances cite the printed fragments; repeated reasons remain only for Book 15 figure labels.

Anchors are byte-for-byte unchanged; no ticks moved. All 889 Parts remain. The diff touches only the two allowed tracked paths. No image sites remain unsettled.

Codex session ID: 01a1b224-4cd3-7b00-a357-c36be09d23a7
Resume in Codex: codex resume 01a1b224-4cd3-7b00-a357-c36be09d23a7
