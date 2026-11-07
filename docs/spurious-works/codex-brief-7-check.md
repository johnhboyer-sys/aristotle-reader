You are a reviewer. FINDINGS ONLY: do not edit, create or delete any tracked file. Scratch only under `build/prob-ocr/work/review7/` (create it). No network, no uv, no pytest; run everything with `python3 -B` from the worktree root.

## What changed
Your review 6 (`docs/spurious-works/codex-review-6.md`) found five items in round 5. Claude (the orchestrator) fixed them by hand in HEAD: `git diff HEAD~1 HEAD -- pipeline/tools/build_prob_forster.py sources/prob-forster/`.

1. 3.16 back to "that Wine mingles" (the PRINT_READS entry and its (c) allowance removed).
2. `--verify --books <dir>` now also reports VERIFY_ALLOW entries that matched nothing, and fails on them.
3. The 10.5 (f) allowance reason rewritten to say the print reads `leprosy?¹ Is`.
4. Leaf references: 1.47 now A33, 4.8 now A72.
5. 3.14 "Diluted wine" kept lower case (the orchestrator read A58: "wine" begins a line, lower case).

## Questions
1. Is each of the five fixes right? Check 3.16, 3.14 (A58), 1.47 (A33), 4.8 (A72) and 10.5 (A119) against `build/prob-ocr/img/A<n>.jpg`.
2. Re-run your two missed plants (10.7 "locality, Whereas"; 23.16 "extends Over Open") on a copy of the books with `--verify --books <copy>`: both must exit 1 and name the planted word. Plant three more case defects of your own (mid-sentence capital in a one-scan stretch, a lowercased proper noun, a lowercased sentence start) and report CAUGHT/MISSED.
3. Does making `--books` check unused allowances break anything that was right before (a legitimate `--books` use that now fails for no reason)?

Commands: `python3 -B pipeline/tools/build_prob_forster.py --ocr-dir build/prob-ocr --verify` (and `--books <dir>`, `--selftest`). Never run it without `--verify`/`--selftest` (that rewrites the sources).

## Return
Findings most severe first (place, what is wrong, evidence, blocker / should-fix / nit), then the plant table. Short. Write it to `build/prob-ocr/work/review7/review.md` as well.
