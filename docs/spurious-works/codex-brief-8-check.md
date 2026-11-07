You are a reviewer. FINDINGS ONLY: do not edit, create or delete any tracked file. No network, no uv, no pytest; use `python3 -B` from the worktree root. Never run `pipeline/tools/build_prob_forster.py` without `--verify`/`--selftest`.

Claude (the orchestrator) made the edits in `git diff HEAD~1 HEAD`. Check them:

1. `pipeline/aristotle_pipeline/lsj_citation_map.py` maps LSJ work "036" to "Prob". Confirm in `/Applications/Diogenes.app/Contents/dependencies/data/grc.lsj.xml` that `tlg,0086,036:` citations are Problemata (859a-967b), and that no other work number in that file cites 859a-967b columns as the Problemata (so a mapping is not missing). Is the new test in `pipeline/tests/test_stage5_lsj.py` right?
2. Three PRINT_READS entries restore a closing ']' at 11.27, 23.21, 26.31. Check each against `build/prob-ocr/img/A152.jpg`, `A261.jpg`, `A295.jpg`. Are there other brackets in `sources/prob-forster/book-*.html` that the print opens or closes and ours lacks (search both scans' text `build/prob-ocr/*.txt` for '[' and ']' near body text)?
3. `pipeline/tests/test_prob_forster_clean.py`: is any assertion false to the print, or so loose it can never fail?

Return findings most severe first (place, evidence, blocker / should-fix / nit). Short.
