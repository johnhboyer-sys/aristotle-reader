1. **Finding 1 — FIXED** — `pipeline/tools/vol6_genie.py:188`. Changing Mech’s `Let AB be a lever,` to `Let Ab be a lever,` now produces an unallowed `Ab`/`AB` difference. **Severity: should-fix (original).**

2. **Finding 2 — FIXED** — `pipeline/tools/vol6_genie.py:694`. Adding the separate Col witness segment `This body sentence must not disappear.` now reports a segment “dropped unexamined”. **Severity: should-fix (original).**

3. **Finding 3 — FIXED** — `pipeline/tools/vol6_genie.py:257`. Inserting `123` into the Col witness’s `From what has been set forth in 123 this treatise` now produces an unallowed insertion. Other numerals still escape; see finding 16. **Severity: should-fix (original).**

4. **Finding 4 — FIXED** — `pipeline/tools/vol6_genie.py:234`. Replacing all 50 `Not-being` occurrences with `Notbeing` in our MXG prose now produces unallowed differences against the unchanged witness. **Severity: should-fix (original).**

5. **Finding 5 — FIXED** — `pipeline/tools/vol6_genie.py:286`. Deleting Col’s first 20 whitespace-separated words, through `when`, now reports the missing opening against the unchanged witness. **Severity: should-fix (original).**

6. **Finding 6 — FIXED** — `pipeline/tools/vol6_genie.py:679`. Changing Plant’s `moist food and dry food` to `moist food dry food` now produces an unallowed difference and an unused allowance. Adding `changed` after the allowed witness note’s `heavenly bodies` also fails. No further digest failure found. **Severity: should-fix (original).**

7. **Finding 7 — FIXED** — `pipeline/tools/vol6_genie.py:648`. With Aud’s actual correction and an in-memory source containing `when they are revelling, / when they are revelling`, `apply()` returns `when they are revelling, / when they are revelling,`. It edits the later defect. No further `stray()` failure found in these probes. **Severity: should-fix (original).**

8. **Finding 8 — FIXED** — `pipeline/tools/vol6_genie.py:662`. Undoing each of all 100 reads separately makes `check()` report that defect. In-memory `apply()` also restores all 13 shortening corrections exactly, including Plant’s `made by dissimilar parts?`. **Severity: should-fix (original).**

9. **Finding 10 — FIXED** — `pipeline/tests/test_vol6_print_reads.py:41`. The first-entry-only `check()` mutant fails 93 of the negative checks. Line 52 now calls `verify()`. The suite returns **113 passed**, using `pipeline/.venv/bin/python` with system pytest, bytecode and cache writes disabled. **Severity: should-fix (original).**

10. **Finding 13 — NEW: word-shaped figure labels still lose case** — `pipeline/tools/vol6_genie.py:188`. In real Mech prose, change the first `ΓΔ and BE in the large circle` to `ΓΔ and Be in the large circle`. `verify()` returns `[]`: lowercase `be` elsewhere permits folding `BE` to `Be`. **Severity: should-fix.**

11. **Finding 14 — NEW: `key()` and note detection depend on the last work compared** — `pipeline/tools/vol6_genie.py:278`. After `diff("Col")`, `key("ꜱɪᴍᴘʟᴇ")` returns `Simple`; after `diff("Mech")`, it returns `simple`. With the same input and grams, `is_note_line("¹ SIMPLE colours are the proper", {("Simple", "colours", "are")})` changes from `False` to `True`. A prior call can therefore change whether a caller drops the line. **Severity: nit.**

12. **Finding 15 — NEW: missing `BODY_START` does not fail verification** — `pipeline/tools/vol6_genie.py:288`. In memory, remove Col’s witness front matter and opening through `when`, leaving its first body line at `pure are by nature…`; remove the same first 20 words from our prose. `verify()` returns `[]`, with coverage about **99.98%**, although the pinned opening is absent. **Severity: should-fix.**

13. **Finding 16 — NEW: the numeral rule still hides body numbers** — `pipeline/tools/vol6_genie.py:257`. Insert `10` or `800` after Col’s `From what has been set forth in`: verification returns `[]`. Insert `123` there after a newline: it also passes because the number starts a line. Insert `7` after Plant’s `properly requires moist food`: it passes under the per-work rule, while an inline Col `7` fails. **Severity: should-fix.**

14. **Finding 17 — NEW: split-token hyphens bypass the new halves check** — `pipeline/tools/vol6_genie.py:228`. In the in-memory witness, replace `Not-being` with `Not-\nbeing`; in our MXG prose, replace all `Not-being` with `Notbeing`. Full-work verification returns `[]`. The earlier join branch removes the hyphen before reaching the halves check. **Severity: should-fix.**

15. **Finding 18 — NEW: note pins bind only five words** — `pipeline/tools/vol6_genie.py:158`. Insert `This body sentence must not disappear.` immediately after the Plant witness line beginning `¹ The argument is that there`. Verification returns `[]`; all three expected pins still occur once. The unchanged opening permits dropping any added suffix or body line in that segment. Repeated `verify()` calls clear `DROPPED`; no stale-state failure found there. **Severity: should-fix.**

Codex session ID: 01a1b6c4-8772-7e21-8f69-b6a2435f5784
Resume in Codex: codex resume 01a1b6c4-8772-7e21-8f69-b6a2435f5784
