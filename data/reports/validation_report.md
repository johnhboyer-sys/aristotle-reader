# Stage 2 validation report

Overall: PASS

## Columns
- 60/60 columns, monotonic: True
- missing: none; extra: none

## Line gaps
- 2 gaps, 0 unexpected
  - 89b: 20 -> 23 (expected (book boundary))
  - 97b: 25 -> 27 (expected (book boundary))

## Alignment
- 61 pairs; unmatched segments: none; english-only: none

## Length ratios (english chars / greek chars)
- mean 1.571, sd 0.157, 9 outliers > 1.5 SD
  - 1:73b: ratio 2.03 (grc 2123, eng 4309)
  - 1:79b: ratio 1.179 (grc 2145, eng 2528)
  - 2:89b: ratio 1.929 (grc 926, eng 1786)
  - 2:99b: ratio 1.88 (grc 2085, eng 3919)
  - 1:81a: ratio 1.268 (grc 1999, eng 2534)
  - 2:100a: ratio 1.288 (grc 934, eng 1203)
  - 1:74a: ratio 1.844 (grc 2159, eng 3981)
  - 2:90a: ratio 1.831 (grc 1993, eng 3649)
  - 1:80b: ratio 1.323 (grc 2048, eng 2710)

## Proper names

## Chapter English-offset coverage
- 0 chapter(s) rendering BLANK with English text still following (reader/print corruption)
- 0 chapter(s) past the translation's last covered chapter (coverage gap — Greek only, no English to place)
- 0 chapter(s) with no own section marker; offset interpolated from the Greek line and de-collided (renders in order, boundary approximate)

## Non-Greek character inventory
- U+0387 '·' GREEK ANO TELEIA x426 (e.g. 71a3)
- U+037E ';' GREEK QUESTION MARK x87 (e.g. 71a27)
- U+0022 '"' QUOTATION MARK x8 (e.g. 92a16)
- U+003C '<' LESS-THAN SIGN x7 (e.g. 73b7)
- U+003E '>' GREATER-THAN SIGN x7 (e.g. 73b7)
