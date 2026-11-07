Could not write `build/vol6-ocr/codex-review-1.md`: the read-only sandbox rejected the write. Findings follow.

1. **should-fix — pipeline/tools/vol6_genie.py:163:** `key()` folds figure labels as though they were small capitals. Changing Mech’s “Let AB be a lever,” to “Let Ab be a lever,” makes `verify` pass despite the wrong label.

2. **should-fix — pipeline/tools/vol6_genie.py:139:** `genie()` discards any segment whose first line contains lowercase letters, even without a footnote mark. Adding a separate body segment containing “This body sentence must not disappear.” to an in-memory Col witness leaves verification passing while our text lacks that sentence.

3. **should-fix — pipeline/tools/vol6_genie.py:220:** `_margin_number()` drops body numerals along with margin numbers. Changing the Col witness to “From what has been set forth in 123 this treatise” leaves verification passing against our version without “123”.

4. **should-fix — pipeline/tools/vol6_genie.py:207:** Hyphen removal changes the witness to match errors in our vocabulary. Replacing all 50 occurrences of “Not-being” with “Notbeing” in MXG’s in-memory prose makes `verify` pass while the witness retains the hyphens.

5. **should-fix — pipeline/tools/vol6_genie.py:239:** Front-matter trimming hides lost opening text. Deleting Col’s first 20 whitespace-separated words, from “SIMPLE” through “when”, makes `verify` pass because it trims the same passage from the witness.

6. **should-fix — pipeline/tools/vol6_genie.py:601:** A prefix allowance can absorb missing body text after the judged footnote. Changing Plant’s “moist food and dry food” to “moist food dry food” passes verification: the allowance at line 399 consumes the missing “and” along with the footnote and still counts once.

7. **should-fix — pipeline/tools/vol6_genie.py:576:** `apply()` counts matches with corrected text masked, then replaces a match in the unmasked text. Given an earlier corrected “when they are revelling,” and a later uncorrected “when they are revelling”, it counts one defect but adds a second comma to the earlier passage and leaves the later defect.

8. **should-fix — pipeline/tools/vol6_genie.py:590:** Masking `new` hides undone fixes whenever `new` is a substring of `old`; `apply()` shares this fault at line 571. Restoring Plant’s “made by dissimilar parts?” makes `check` pass, and `apply` skips the defect as already fixed. Probes found the same false pass for 12 other undone fixes, including Mech’s “a balance, if A” and MXG’s “by the circular process.).”.

9. **PRINT_READS replacement scope and committed metadata:** nothing found in the source changes beyond the judged replacements, or in the committed anchor phrases and paragraph offsets.

10. **should-fix — pipeline/tests/test_vol6_print_reads.py:38; pipeline/tools/vol6_genie.py:667:** Negative checks cover only the first Lin and Mech entries. An in-memory version of `check` that inspects only each work’s first entry still passes all 13 pytest tests and `selftest`. The pytest file also never calls `verify`.

11. **build_plant_forster.py / verify_plant_forster.py hunks:** nothing found.

12. **Run status:** All four requested `uv` commands failed because the sandbox blocked uv’s cache. Direct Python calls returned no baseline findings for `verify`, `check`, or `selftest`. All 13 pytest tests passed using the local environment with system pytest, with capture and cache writes disabled.

Codex session ID: 01a1b6b9-fcc2-7873-9f8e-3d9950cb4760
Resume in Codex: codex resume 01a1b6b9-fcc2-7873-9f8e-3d9950cb4760
