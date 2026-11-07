Findings-only check. Repository: /Users/johnboyer/Developer/aristotle-reader/.claude/worktrees/nice-mclaren-754ffd (branch claude/ocr-vol6-61fe7b). Do not edit, create or delete tracked files; do not commit.

Your earlier review of commit fedd31a20f is in docs/spurious-works/vol6-codex-review-1.md (findings 1-12). Commit 00c83a376c claims to fix findings 1-8 and 10 in pipeline/tools/vol6_genie.py and pipeline/tests/test_vol6_print_reads.py. Read `git show 00c83a376c`.

For each of findings 1-8 and 10: re-run your original failing scenario (in memory, as before; the second OCR read is at /Users/johnboyer/Developer/aristotle-reader/sources/genie-oxford/Oxford Aristotle VI 1913 Opuscula.txt) and say FIXED or NOT FIXED with the evidence. Then look for new holes the changes introduced: `stray()`, `key()` with WORDS (module-level state set by diff()), BODY_START trimming (what if the pinned words are not found?), `_margin_number` per-work rule, the hyphen rule, digest allowances, NOTE_SEGMENTS/DROPPED (module-level state across calls). Give a concrete failing input for each new hole.

If uv is blocked in your sandbox, run with the repository's pipeline/.venv/bin/python directly, as you did before; never report a blocked command as a pass.

Return a numbered list: finding id, FIXED/NOT FIXED or NEW, file:line, evidence, severity (blocker / should-fix / nit). No praise.
