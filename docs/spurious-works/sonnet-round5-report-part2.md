# Round 5 part 2 (Sonnet 5.5), summary as reported — not yet checked by the orchestrator

- verify exit 0, (a)-(g) all 0; VERIFY_ALLOW 971 entries (a 89, b 115, c 66, d 74, e 66, f 455, g 106); 0 unused; one-scan totals A 1540 / B 905 / neither 262 words.
- selftest 12/12; old books (6885509b36) exit 1; Opus harness 67/67 CAUGHT (4 re-pinned in build/prob-ocr/work/m*-pinned.json; run `zsh build/prob-ocr/work/runmut.sh <outdir>`).
- Gate fix: a word ours lacks next to a one-scan gap now counts (23.6 "not" was caught only by accident before). Verify exits 1 if an allowance matches nothing.
- 382 findings judged on images: 24 (g) fixed in text, rest allowed. Plus fixes both scans share: 9 comma-for-stop, doubled stops, 13 mid-sentence capitals at line starts, 11 garbled words. PRINT_READS 57 -> 123.
- anchors: 1460, unique, ordered; 17 `at` lines changed with their words. Pipeline overall PASS, key_failures=0. Parts unchanged.
- Not settled: 23.6-23.12 page missing from scan A (23.9 "ing"->"in" unchecked; 23.11, 23.7 rest on B). 19.9 "y a flute" is John's call. Old (f) allowances only 3 of 13 sheets re-viewed. A printed full stop both scans read as a comma before lowercase is invisible to the gate.
