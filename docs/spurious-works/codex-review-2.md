1. **Should-fix — `anchors.yaml`: all 15 lost ticks are regressions.** The target text remains, and scan B reads the stated marginal number on its row. None of these losses follows from a bad reading.

   In this table, the quoted words occur in both scans; B also supplies the listed tick. Ours retains the words but drops the anchor.

   | Lost tick | Target words in A and B |
   |---|---|
   | 878a30 | “and flesh which is coming into being)” |
   | 881a15 | “some external or by some internal agency” |
   | 883b35 | “the body is still being purged” |
   | 885b15 | “Why is it that sitting down” — B reads the tick as `1s` |
   | 899a15 | “Why do the deaf always speak through their nostrils” |
   | 905b25 | “is unchanged? Is it because their voice” |
   | 907b25 | “is dry is less liable to putrefaction)” |
   | 915a30 | “the fact that in natural movement” |
   | 921a25 | “they do not do the same thing, terminate together” |
   | 922a15 | “to the voice covers up many of the mistakes” |
   | 924b15 | “Why are plants watered at dawn” |
   | 934b25 | “hotter than the depths? So, too” |
   | 948b15 | “they are chilled, and thirst because they are heated” |
   | 962b15 | “be expected to sneeze … more often” |
   | 967a15 | “drained off with the perspiration and breath” |

2. **Should-fix — `build_prob_forster.py:1592–1614`: “16 agreed gaps” does not measure all agreed missing words.** `_agreed()` requires the *whole unmatched stretch* from A and B to have identical joined text. One differing OCR word—or differing book headings—can hide real words both scans share.

   I tested this without changing files: removing **“Why is it that great excesses cause disease?”** from 1.1 in memory still produced **zero findings**. A’s unmatched stretch begins:

   > “book problems connected with medicine why is it that great excesses cause disease”

   B’s begins:

   > “book i problems connected with medicine whyisit that great excesses cause disease”

   Their headings differ, so the check misses the shared body words. The separate exemption at lines 1698–1700 can also treat up to 40 missing opening words as a title without checking their content.

   The **207 re-spacings** have another gap: `_matched()` first marks every equal-letter re-spacing as matched. Later checks cover only one-to-many and many-to-one changes, subject to dictionary rules. Many-to-many changes, unknown words, and number or figure-label joins can pass without a finding.

3. **Should-fix — `VERIFY_ALLOW`, especially the Book 19 `None` entries, permits wrong repairs.** These entries bind neither the source reading to its correct replacement nor the allowance to one occurrence.

   A concrete test passed with zero findings: I changed **19.39**, in memory, from:

   > ours: “as nete is from **hypate**”

   to:

   > “as nete is from **nete**”

   Both scans read **“hyfate”** there. The `a` allowance accepts losing `hyfate`; the `b` allowance accepts adding either `hypate` or `nete`. Thus it cannot check which note the repair should produce.

   Other entries also exceed their stated location: `5.38` permits any unsupported `at` or `other`, `9.6` any unsupported `and`, and `19.35` any unsupported `3/2` in that Part. They do not enforce context or occurrence counts.

4. **Should-fix — punctuation repairs introduce new losses which `--verify` accepts.**

   | Place | Ours now | Scan A | Scan B |
   |---|---|---|---|
   | **19.18**, line 77 | “used in **singing For** in ‘magadizing’” | “singing **?? For**” | “singing **?? For**” |
   | **11.30**, line 125 | “letter or **syllable hesitancy**” | “syllable **;'** … hesitancy” | “syllable **;?** … hesitancy” |
   | **19.4**, line 21 | “[For one **must with** a consciousness” | “must **...** with” | “must **. . .** with” |
   | **15.3**, line 17 | “‘one-five’, **two-five,** just as” | “‘one-five’, **‘two-five '**” | “‘one-five’, **‘two-five ’**” |

   The page image confirms the quotes around **‘two-five’**. Their loss is separate from the excluded number-spacing issue.

   Further punctuation errors remain in the current text, though they predate this diff:

   - **5.42** ends “they are more careful”; both scans have **“careful ?]”**.
   - **24.11** has **“‘That cold, pure and simple,’ produces”**. A has those stray marks; B lacks the opening mark but retains the closing one.
   - **26.30** retains **“becomes cold.?,”**.
   - **1.6** retains **“Is it. because”**; **36.2** retains **“the head has. these characteristics”**.

   Edge-punctuation stripping hides these errors. I found no remaining `”` in ours.

5. **Should-fix — 15.5 and 15.9 retain OCR debris rather than restore figure labels.** Keeping digits prevents number loss, but these digits are damaged labels, not valid readings.

   - **15.5**, line 25: ours **“makes the shadow 4”**; A **“makes the shadow O4A”**; B **“makes the shadow ©4”**.
   - Same Part: ours **“At the same time it is clear A 8 ΑΕ 4 that the shadow…”** inserts diagram labels into the sentence.
   - **15.9**, line 41: ours **“I’ and 4 two positions”** retains an OCR reading of a label.
   - Labels still lose characters elsewhere: **15.10** has **“the shadow will be Z”**, while both scans read **“4Z”**.

   The blanket digit-preservation fix leaves these passages unreadable and, in places, adds diagram material to prose. These need page-based repairs.

   The targeted Book 19 check also found an older body-text loss in **19.20**: ours **“such as and”**; A **“such as τε and καί”**; B **“such as ve and xai”**. The image confirms **τε** and **καί**. `clean_word()` still deletes lower-case Greek from genuine body text.

6. **Should-fix — the verifier’s claim of independence is too strong.** It no longer calls `clean_word()`, `repair_terms()`, or `split_run_together()` on witnesses, but:

   - `_real()` calls the build’s **`vocab()`** and uses its **`_UNI`** counts, alongside substantially the same dictionary/stem test that protects words in the build.
   - `witness_book():1521–1523` deletes digits by spelling pattern, not position or type size. It repeats the build’s assumption that digits attached to letters are call-outs. A damaged figure label such as `4Z` can consequently lose its first character on both sides.
   - The verifier repeats the confidence-based quote policy and 120-word pairing limit. Those rules can discard evidence for a real mark.

   Position filtering has its own unchecked risks:

   - At **1473–1476**, a final body row of four or more words whose OCR type size falls below the threshold starts the footnote zone.
   - At **1484–1486**, the verifier can remove a short last body row based on its gap, without requiring small type.
   - At **1460–1463**, it drops any sufficiently small raised word; it does not exclude alphabetic body words from that rule.
   - **24.19 proves the reverse error:** the three-word footnote **“Or, perhaps, ‘vitriol’.”** survives the positional filter in both scans. An allowance suppresses it. The image confirms that it is a footnote attached to 24.18’s “alum.”

   I found no further confirmed current English body-word loss caused by these positional rules; the rules nevertheless permit it.

The first review’s findings now stand as follows:

| Review 1 item | Status and current evidence |
|---|---|
| 1. Deleted numbers | **Fixed at the cited places:** “3 to 2”, “4 to 3”, and twice “3/2 to 1”. |
| 2. 1.50 page-break loss | **Fixed:** “stomach,—namely, both dissolved and heated—these processes”. |
| 3. `verge` → `nete` | **Fixed:** “the points which **verge** towards either end”. |
| 4. Broken words/names | **Fixed:** “sheared”, “Attica”, “Messina”, “informs”, “betake”, “abounds”. |
| 5. Verification exemptions | **Partly fixed:** the word-shape exemption and four-word cap are gone; findings 2, 3 and 6 remain. |
| 6. Duplicate anchor place | **Fixed:** 956b30 now starts “Furthermore, the prize ought to be better than the contest”. |
| 7. Unsupported text | **Fixed:** “which is pleasanter”; “garments? For water”; “early morning”. |
| 8. Plural possessive | **Fixed:** “Hence animals’ hoofs”. |
| 9. Greek numeral skip | **Fixed in current code:** `_not_a_word()` returns `False` when `had_sigla` is true. That file is outside this diff; I did not repeat the corpus audit. |

Checks completed: **38 books, 889 Parts**, with **109,526 tokens** under my independent tokenizer; both full raw text witnesses (**149,285 / 148,137 tokens**, including notes and headings). I used inline `python3 -B` standard-library scripts without importing the builder for that alignment. I found no further confirmed English word additions or deletions after checking the OCR, notes, hyphenation and known exclusions.

I checked all **1,438 anchors** for order and presence. All eight new entries have unique target phrases in their books, and the duplicate 956b20/956b30 place is gone. The broader “each `at` occurs once” claim remains false for **12 unchanged entries**, including 872a20, 882a10 and 909b25; I have not counted those as new regressions.

I found no further stacked body fractions in the OCR checks of Books **15, 19 and 23**. The image confirms both **3/2** repairs in 19.35. `PRINT_READS` and `print_read()` handle the four current replacements correctly: three preserve word count; 1.18 drops the final call-out, and later indices shift by −1.

The requested restored quotations show no further confirmed error. Image checks confirmed **11.33, 15.2, 34.3**, and **‘Orthian songs’**; the other requested groups received OCR checks only, so those image checks remain incomplete.

I changed no files. Git status remains clean. I ran neither `uv`, the pipeline, nor the network.

Codex session ID: 01a1b1f2-2602-7362-980a-78150fa4429c
Resume in Codex: codex resume 01a1b1f2-2602-7362-980a-78150fa4429c
