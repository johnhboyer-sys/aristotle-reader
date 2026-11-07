You are an adversarial reviewer. FINDINGS ONLY: do not edit, create or delete any tracked file. Scratch output only under `build/prob-ocr/work/review6/` (create it). No network, no uv, no pytest, no pipeline package; run everything with `python3 -B` from the worktree root.

## What it is
A Greek/English Aristotle reader; this branch adds the pseudo-Aristotelian *Problemata*. Its English (Forster 1927) is rebuilt from two archive.org OCR scans by `pipeline/tools/build_prob_forster.py` (stdlib only) into `sources/prob-forster/book-NN.html` and `sources/prob-forster/anchors.yaml`. Inputs in `build/prob-ocr/`: scan A and B OCR text and hOCR, and every page image of scan A as `img/A<n>.jpg` (2418×4160; check the page text before trusting a leaf↔image match).

History you should know: the script's own `--verify` passed broken text for four rounds because it shared rules with the build or allowed findings wholesale. You implemented rounds 3–4; a Claude Opus reviewer then found 20 of 51 planted defects missed and ~50 live slips (`docs/spurious-works/opus-review-5.md`). Round 5 was done by Claude Sonnet (not you): `git diff 4bdf8a3368 24dbee48d0 -- pipeline/tools/build_prob_forster.py sources/prob-forster/`, report `docs/spurious-works/sonnet-round5-report-part2.md` (and `-part1.md`). You are the cross-family check on round 5.

Commands:
- `python3 -B pipeline/tools/build_prob_forster.py --ocr-dir build/prob-ocr --verify` (and `--books <dir>`, `--selftest`). Never run it without `--verify`/`--selftest` (that rewrites the sources).
- Opus's planted defects: `zsh build/prob-ocr/work/runmut.sh <outdir>` (uses `docs/spurious-works/opus-review/m*.json`, with four re-pinned copies `build/prob-ocr/work/m1-pinned.json`…`m4-pinned.json`).

## Questions
1. **Plant your own defects** (at least 20, none from Opus's or the selftest's sets), spread across books and kinds, especially where the new rules act: a stray full stop mid-sentence; a comma turned to a full stop before a lowercase word; a mid-sentence capital at a line start; a lost word inside a one-scan stretch (verify prints them; 23.6–23.12, 10.4–10.12, 31.13–31.19); an added quote mark; an unclosed quote; a lost "?" at a problem end beside a call-out; a doubled word; a changed number; a Greek word changed (19.20, 19.28, 30.14). Copy the books to scratch, mutate, run `--verify --books`. Report CAUGHT/MISSED with the line, and say for each CAUGHT whether the line names the planted defect (not an unrelated allowance breaking).
2. **VERIFY_ALLOW** has 971 entries, 432 new in round 5 (reasons for (c), (d), (f), (g) were generated). Sample at least 30 of the NEW ones, stratified by letter, and check each against the page image at that place. Wrong if the reason misstates the print or ours differs from the print there.
3. **PRINT_READS** has 120 entries, ~66 new in round 5. Check at least 15 new ones against the images.
4. **Rules Sonnet added** (case rule "a capital stands only at a sentence start", the comma/full-stop fixes, the `missing_region` change, the unused-allowance check): can any of them silently alter correct text elsewhere — e.g. lowercase a proper noun or a real capital after a colon, or turn a correct comma into a stop? Sweep all 38 books for such changes against the HEAD~ books (`git show 4bdf8a3368:sources/prob-forster/book-NN.html`) and classify every word-level change: correct (image) / wrong / unsure.
5. **Unsettled:** 23.9 "ing" → "in" rests on no image (scan A lacks the page). Is there any other evidence in scan B's hOCR?

## Return
Findings, most severe first: place, what is wrong, evidence (ours, both scans, what the image shows), severity (blocker / should-fix / nit). Then the mutation table, and what you checked and found clean with counts. Write it to `build/prob-ocr/work/review6/review.md` as well.
