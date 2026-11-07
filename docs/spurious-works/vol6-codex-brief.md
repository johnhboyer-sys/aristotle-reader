# Codex review brief: vol. VI second-read pass (findings only)

You are reviewing one commit in the git repository at
/Users/johnboyer/Developer/aristotle-reader/.claude/worktrees/nice-mclaren-754ffd
(branch claude/ocr-vol6-61fe7b). Do not edit, create or delete any tracked file. Do not commit.
Write your findings to build/vol6-ocr/codex-review-1.md (build/ is git-ignored) and print them.

## What the commit does

`git show fedd31a20f` (plus the uncommitted doc docs/spurious-works/vol6-genie-pass.md, which explains it).
Our English for nine translated works came from one OCR read each. `pipeline/tools/vol6_genie.py`
word-diffs it against a second OCR read (History Genie, a Markdown file outside the repo at
/Users/johnboyer/Developer/aristotle-reader/sources/genie-oxford/Oxford Aristotle VI 1913 Opuscula.txt).
Each difference was judged by eye on page images. Our errors became PRINT_READS (old -> new, applied
to sources/*/book-*.html by `apply`, guarded by `check`). The second read's errors became VERIFY_ALLOW
entries; `verify` must fail on any unruled difference and on any allowance used other than exactly once.
`selftest` plants defects. Tests: pipeline/tests/test_vol6_print_reads.py.

## Look for (in this order)

1. Ways `verify` can pass while our text has a real error the second read lacks: normalisation in
   `norm()`, `key()`, `_clean_line()`, `genie()` segment/footnote rules, `is_note_line`, `_margin_number`
   (it drops every bare numeral from the second read), the hyphen rejoin in `genie_tokens`, the
   front-matter trim in `diff`. Name a concrete text change that would slip through.
2. Allowances: can one entry match a difference other than the one it was written for? Can an entry
   whose `genie` ends in "…" hide a later, different difference?
3. `apply`, `_shift_paragraphs`, `_carry_anchors`: can they silently write a wrong offset or a wrong
   anchor phrase? Compare the anchors.yaml and paragraphs.yaml hunks in the commit against the text.
4. PRINT_READS: any `old` whose replacement changes text other than the judged spot (look at
   `git show fedd31a20f -- sources` word by word). Any entry where `check` would pass with the defect
   back (e.g. `old` a substring of `new`).
5. `selftest` and the tests: would they still pass if `verify` or `check` were broken in an obvious way?
6. build_plant_forster.py / verify_plant_forster.py hunks: consistent with the HTML change?

## Run (allowed; read-only)

From pipeline/: `uv run python tools/vol6_genie.py verify`, `... selftest`, `... check`, and
`uv run --with pytest pytest -q tests/test_vol6_print_reads.py`. If uv is blocked in your sandbox,
say so and continue statically; do not report a blocked command as a pass.

## Return

A numbered list. Each finding: file:line, the defect in one sentence, a concrete failing input or
scenario, severity (blocker / should-fix / nit). No praise, no summary of what works. If you find
nothing in an area, say "nothing found" for it.
