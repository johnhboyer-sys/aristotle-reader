1. **Image check: no findings.** Opened A62, A129, A192, A210, A216, A220, A221, A225, A249, A278, A338, and A359. These support the new readings in 10.36, 19.36, 19.42, and 33.15; all six bracket cases; and the lower-casings in 19.4, 19.20, 19.23, and 19.42. None of the old readings checked was right.

2. **Change scope: no findings.** Read the saved script patch and compared every changed book against the parent commit. Applying the 57 new `PRINT_READS` replacements in memory accounts for every HTML change. The seven anchor changes track those same fixes. Found no unexplained text change.

3. **Allowlist: no findings.** All 73 new entries require an exact book, part, kind, reading, and context match, with a limit of one use. Found no duplicate new keys or broad exceptions. The read-only verifier returned **0**, with no findings or unused allowances across 889 parts. None of the 39 removed entries remains needed: 37 have revised contexts; two have revised punctuation keys.

4. **Tests: no findings for text reversions.** From the code, reverting any reported fix in the generated text would fail an assertion: the word and punctuation checks require the new reading and reject the old; the case check rejects each restored capital; the bracket checks pin all six passages. These tests read checked-in output, so removing a script fix alone would require a rebuild before they could detect it. No other test file changed.

No files edited. No build or `uv` run.

Codex session ID: 01a1b6b6-04a1-7bf1-9845-03c41dbf9e5c
Resume in Codex: codex resume 01a1b6b6-04a1-7bf1-9845-03c41dbf9e5c
