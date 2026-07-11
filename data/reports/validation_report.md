# Stage 2 validation report

Overall: PASS

## Columns
- 133/133 columns, monotonic: True
- missing: none; extra: none

## Line gaps
- 2 gaps, 0 unexpected
  - 1377b: 12 -> 16 (expected (book boundary))
  - 1403b: 3 -> 6 (expected (book boundary))

## Alignment
- 135 pairs; unmatched segments: ['1:1378a', '2:1404a']; english-only: ['2:1377b', '3:1403b']

## Length ratios (english chars / greek chars)
- mean 1.41, sd 0.205, 4 outliers > 1.5 SD
  - 2:1403b: ratio 0.068 (grc 1813, eng 123)
  - 2:1378a: ratio 2.63 (grc 1018, eng 2677)
  - 1:1377b: ratio 0.531 (grc 1602, eng 850)
  - 1:1377a: ratio 1.758 (grc 1829, eng 3216)

## Proper names
- γοργ / Gorgias: grc in 8 cols, eng in 8 cols — ok
- ισοκρατ / Isocrates: grc in 10 cols, eng in 10 cols — ok
- περικλ / Pericles: grc in 5 cols, eng in 5 cols — ok

## Non-Greek character inventory
- U+0387 '·' GREEK ANO TELEIA x1303 (e.g. 1354a1)
- U+0022 '"' QUOTATION MARK x447 (e.g. 1363a6)
- U+003C '<' LESS-THAN SIGN x97 (e.g. 1356a11)
- U+003E '>' GREATER-THAN SIGN x97 (e.g. 1356a11)
- U+037E ';' GREEK QUESTION MARK x32 (e.g. 1375a13)
- U+2020 '†' DAGGER x10 (e.g. 1374b32)
