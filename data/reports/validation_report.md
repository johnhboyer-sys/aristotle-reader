# Stage 2 validation report

Overall: PASS

## Columns
- 182/182 columns, monotonic: True
- missing: none; extra: none

## Line gaps
- 7 gaps, 0 unexpected
  - 1260b: 24 -> 27 (expected (book boundary))
  - 1274b: 28 -> 32 (expected (book boundary))
  - 1288b: 6 -> 10 (expected (book boundary))
  - 1301a: 15 -> 19 (expected (book boundary))
  - 1316b: 27 -> 31 (expected (book boundary))
  - 1323a: 10 -> 14 (expected (book boundary))
  - 1337a: 7 -> 11 (expected (book boundary))

## Alignment
- 189 pairs; unmatched segments: ['5:1316a', '5:1316b']; english-only: none

## Length ratios (english chars / greek chars)
- mean 1.227, sd 0.134, 16 outliers > 1.5 SD
  - 5:1315b: ratio 0.222 (grc 2157, eng 478)
  - 2:1274a: ratio 0.672 (grc 2204, eng 1482)
  - 4:1301a: ratio 1.666 (grc 778, eng 1296)
  - 2:1274b: ratio 0.842 (grc 1504, eng 1266)
  - 5:1314a: ratio 0.883 (grc 2180, eng 1925)
  - 3:1288b: ratio 1.518 (grc 282, eng 428)
  - 5:1315a: ratio 0.948 (grc 2209, eng 2095)
  - 2:1260b: ratio 0.972 (grc 822, eng 799)
  - 6:1323a: ratio 0.989 (grc 546, eng 540)
  - 8:1342b: ratio 0.992 (grc 1846, eng 1831)
  - 7:1331a: ratio 0.995 (grc 2158, eng 2148)
  - 5:1313b: ratio 1.002 (grc 2226, eng 2231)
  - 7:1337a: ratio 1.447 (grc 356, eng 515)
  - 2:1261b: ratio 1.441 (grc 2213, eng 3188)
  - 6:1316b: ratio 1.022 (grc 538, eng 550)

## Proper names
- σολων / Solon: grc in 6 cols, eng in 6 cols — ok
- λυκουργ / Lycurgus: grc in 5 cols, eng in 5 cols — ok

## Chapter English-offset coverage
- 0 chapter(s) rendering BLANK with English text still following (reader/print corruption)
- 1 chapter(s) past the translation's last covered chapter (coverage gap — Greek only, no English to place)
- 0 chapter(s) with no own section marker; offset interpolated from the Greek line and de-collided (renders in order, boundary approximate)
  - untranslated: book 5 chapter 12 (1315b)

## Non-Greek character inventory
- U+0387 '·' GREEK ANO TELEIA x1231 (e.g. 1252a13)
- U+003C '<' LESS-THAN SIGN x105 (e.g. 1253b11)
- U+003E '>' GREATER-THAN SIGN x105 (e.g. 1253b11)
- U+037E ';' GREEK QUESTION MARK x74 (e.g. 1255a38)
- U+0022 '"' QUOTATION MARK x66 (e.g. 1252b8)
- U+2020 '†' DAGGER x4 (e.g. 1292b32)
- U+002A '*' ASTERISK x4 (e.g. 1334b4)
- U+2018 '‘' LEFT SINGLE QUOTATION MARK x2 (e.g. 1283b11)
