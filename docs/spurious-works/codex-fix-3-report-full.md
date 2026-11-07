All requested checks pass. No work remains, and no required site is NEEDS-IMAGE.

| Selftest mutation | Before | After |
|---|---|---|
| 1. Delete 1.1 opening sentence | MISSED | CAUGHT |
| 2. Change 19.39 hypate to nete | MISSED | CAUGHT |
| 3. Delete movement in 7.4 | CAUGHT | CAUGHT |
| 4. Insert never in 12.1 | CAUGHT | CAUGHT |
| 5. Remove 7.9 opening question mark | MISSED | CAUGHT |
| 6. Insert it. in 12.1 | MISSED | CAUGHT |
| 7. Change 19.41 ratio 3 to 2 to 3 to 4 | CAUGHT | CAUGHT |
| 8. Delete 5.41 page-top sentence (A98) | MISSED | CAUGHT |
| 9. Drop animals’ possessive apostrophe in 23.40 | CAUGHT | CAUGHT |

The initial selftest exited 1. The final selftest exits 0. It compares each mutated copy with the baseline findings, so an existing defect cannot make a mutation count as caught.

| Gate and books | (a) | (b) | (c) | (d) | (e) | (f) | (g) | Exit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Original gate, pre-fix current books | 0 | 0 | 0 | 0 | 0 | absent | absent | 0 |
| Original gate, 6885509b36 books | 27 | 12 | 9 | 9 | 10 | absent | absent | 1 |
| First strengthened gate, before build fixes | 34 | 20 | 0 | 6 | 1 | 17 | 10 | 1 |
| Final gate, pre-fix current books from HEAD | 26 | 8 | 0 | 1 | 2 | 20 | 10 | 1 |
| Final gate, final books | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Final gate, 6885509b36 books | 63 | 26 | 9 | 1 | 15 | 20 | 18 | 1 |

The final gate examines 889 Parts and 109,534 comparison words; A has 109,271 words and B has 108,277. Its call graph has no vocab(), _UNI, known_word(), clean_word(), repair_terms(), or split_run_together(). Numeric/alphabetic token boundaries keep every digit. Quote pairing has no confidence cutoff or word-distance cap. Word gaps compare shared words within unmatched stretches. Re-spacings include many-to-many changes; agreement with the other scan settles supported spacing. Titles exempt only actual heading words. Punctuation checks report shared missing marks and unsupported marks, including ellipses and brackets. The footnote cut requires size plus a gap or a small raised leading mark; raised alphabetic words remain evidence.

| Fix | Cause and printed reading | Image |
|---|---|---|
| 19.18 | Low-confidence standalone punctuation was discarded; singing? For now survives | A215 |
| 11.30 | Same cause; syllable; hesitancy now survives | A155 |
| 19.4 | Ellipsis and closing brackets were lost; must … with, purpose.], music?] | A210 |
| 15.3 | Detached low-confidence closing quote lost its mate; ‘two-five’ restored, numbers read 2, 3, 4, 5 | A182 |
| 5.42 | Standalone question/bracket discarded; careful?] restored | A98 |
| 24.11 | Call-out 3 became quotation/comma debris; That cold, pure and simple produces | A271 |
| 26.30 | Call-out 2 became punctuation debris; becomes cold. One | A294 |
| 1.6 | OCR speck became full stop; Is it because, | A17 |
| 36.2 | Same cause; head has these | A369 |
| 4.19 | Both scans assign a body row a footnote x_size; actual letter height and body pitch restore sexual intercourse? Is it because the ducts become full? | A76 |
| 19.7, 19.32 | General note repair changed trite to nete; image-specific repairs restore trite | A211, A219 |
| 19.12 | Same repair dropped the plural; two netes restored | A212 |

Other image-based repairs and their exact causes appear in the PRINT_READS table in entries.md. Keeping standalone punctuation also restores missing body words beside damaged marks, including know in 19.5 and up in 11.43. The final word-map in PRINT_READS now aligns each old word with its replacement; insertions no longer move a later tick one word early.

Book 15 label audit: every body-label site occurs in 15.5 (A184–A185), 15.9 (A188), or 15.10 (A189). All appear in PRINT_READS. 15.5 now reads Θ, Α, Θ, ΘΛ, Λ, Β, Β, ΘΛ, Γ, ΑΒ, ΒΓ, Δ, Δ, ΛΕ, ΕΖ, ΛΘ, in print order; it omits diagram-only A 8 ΑΕ 4. 15.9 reads ΑΒ, Γ, Δ, Γ, ΓΖ, ΔΕ, ΒΕ, ΒΖ; it omits diagram-only A Z Ee B. 15.10 reads ΑΔ, Β, Γ, ΒΖ, ΔΖ, ΓΕ, ΔΕ; it omits r B ve si A. Book 19 has no body figure labels or diagram debris. Its digits are ratios in 19.23, 19.35, and 19.41; these remain numbers. The stacked 3/2 readings in 19.35 are confirmed at A220. Book 15.3’s 10 and 2, 3, 4, 5 are numbers, not labels (A182).

Greek body text now appears in exactly these other places: 19.20 τε and καί (A216); 19.28 νόμοι twice (A218); 30.14 ἐπιστήμη and ἵστησι (A338). The Book 15 capitals above are figure labels. No other Greek remains in the English body. The cleaner no longer deletes lowercase Greek, and Greek scan readings win over Latin OCR approximations when the other reading is not a known English word. PRINT_READS removes Greek-shaped OCR debris after image checks.

Anchors: 1,438 → 1,460, with no removals. All 15 requested ticks are present:

878a30 881a15 883b35 885b15 899a15 905b25 907b25 915a30 921a25 922a15 924b15 934b25 948b15 962b15 967a15

All phrases occur once in their own book, no two entries share a place, and all entries follow Bekker order. Twelve old phrases were lengthened: 872a20, 872b15, 874a5, 882a10, 900b15, 904b30, 909b25, 915b10, 931a35, 941b5, 946b30, 949b10.

Two existing ticks now begin at the restored first word of the printed line: 937a15 starts “of heat” rather than “heat” (A271); 956b40 starts “(ἐπιστήμη) seems” rather than “seems” (A338). All other existing ticks retain their source places. This comparison uses the old script’s actual (Book, Part, word) placements, rather than choosing the first occurrence of an ambiguous old phrase.

The tick reader no longer lets OCR confidence discard a competing reading before it checks sequence and chapter bounds. A often loses the first digit of 15/25/35. Competing readings at one place are judged together and can advance the sequence only once. A337 confirms the collision example: print 20, A reads 20, B reads 30. The 15 restored rows were also read in images A75, A84, A93, A99, A144, A164, A172, A199, A223, A226, A235, A264, A310, A358, A375. The seven additional ticks are 914a30, 914a35, 939a25, 941a35, 955a30, 955a35, 955a40 (A196, A278, A286, A332–A333); these rows were image-checked too.

All Part counts remain unchanged: 889 total. The build table marks only Books 1 and 3 as differing from First1KGreek. git diff --check passes. git diff --stat touches only pipeline/tools/build_prob_forster.py and sources/prob-forster/. No commit, network, uv, pytest, or pipeline package command ran.

Every PRINT_READS and VERIFY_ALLOW entry, with its reason, is listed in [entries.md](entries.md). Machine-readable copies: [print-reads-final.json](print-reads-final.json), [verify-allow-final.json](verify-allow-final.json). All 549 allowances now have an exact Book, Part, finding, context, and count of one. Book 19 note allowances include the actual garbled A/B tokens and the one printed note to which each maps. No wildcard Part or interchangeable note list remains.
