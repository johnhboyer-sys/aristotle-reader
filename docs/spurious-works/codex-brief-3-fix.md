You are implementing fixes in a git worktree. You may edit ONLY these paths:
- `pipeline/tools/build_prob_forster.py`
- `sources/prob-forster/` (written by that script; never hand-edit the book files — change the script and regenerate)
- new scratch files under `build/prob-ocr/work/` (ignored by git)
Do not touch anything else (no manifests, no pipeline package, no tests directory, no docs). Do not run git commit; the orchestrator commits. Do not use the network.

## Background (zero assumed context)

The repo is a Greek/English Aristotle reader. This branch adds the pseudo-Aristotelian *Problemata* (work id `Prob`). Its English is E. S. Forster's 1927 translation, rebuilt from two archive.org OCR scans by `pipeline/tools/build_prob_forster.py` (stdlib only) into:
- `sources/prob-forster/book-NN.html` (NN = 01..38): `Part N` line, then `<p>…</p>` per problem.
- `sources/prob-forster/anchors.yaml`: Bekker line ticks, entries `- bekker: "860a5"` / `at: "<the first words at that printed line, as in our text>"`.

Inputs, all in `build/prob-ocr/`:
- scan A `worksofaristotle07arisuoft.txt` and `worksofaristotle07arisuoft_hocr.html`
- scan B `worksofaristotle0007unse_o7n4.txt` and `worksofaristotle0007unse_o7n4_hocr.html`
- `img/A<n>.jpg`: every page image of scan A (n = 0..405). The script's "leaf" numbers for scan A are meant to equal n, but CHECK the page text before trusting a leaf↔image match (scan B was off by one). Use your image-viewing tool to read them. If you cannot view images, mark the site NEEDS-IMAGE in your report instead of guessing.

Commands (run from the worktree root; all stdlib, use `python3 -B`):
- build: `python3 -B pipeline/tools/build_prob_forster.py --ocr-dir build/prob-ocr` (uses `build/dist/Prob/chapters.json`, which exists; ~1 min)
- verify: `python3 -B pipeline/tools/build_prob_forster.py --ocr-dir build/prob-ocr --verify` (exit 0 clean, 1 findings, 2 examined nothing)
- verify an older build: add `--books <dir of book-NN.html>`
- the old pre-fix books for a positive control: `git show 6885509b36:sources/prob-forster/book-NN.html`

Do NOT run `uv`, pytest, or `python -m aristotle_pipeline` (the orchestrator runs those). The number of Parts per book must not change (the pipeline's chapters depend on it); if a fix would change it, stop and report.

The review you are fixing is `docs/spurious-works/codex-review-2.md` — read it first. The orchestrator re-checked findings 1–5 and they hold: verify stays green with 1.1's first sentence deleted; all 15 listed ticks are absent from anchors.yaml; the punctuation and Book 15 label sites read as the review quotes.

## Step 1 — make the gate fail first (before any fix)

Add `--selftest` to the script: copy the current books to a temp dir, apply each mutation below, run verify on each copy, and print one line per mutation `CAUGHT`/`MISSED`. Exit 1 if any is MISSED. Mutations (each alone):
1. delete "Why is it that great excesses cause disease? " from 1.1 (book 1, Part 1)
2. in 19.39 change "nete is from hypate" to "nete is from nete"
3. delete one ordinary word mid-sentence somewhere in Book 7 (your choice, fixed in code)
4. insert the word "never" mid-sentence in Book 12
5. remove the final "?" of some problem's opening question (your choice, fixed)
6. insert a stray "." mid-sentence (e.g. "Is it. because" style) in a clean place
7. change a number: in 19.41 "3 to 2" → "3 to 4"
8. delete a whole short sentence that sits at the top of a page (choose one from the hOCR; it must be body text)
9. drop an apostrophe of a plural possessive ("animals’ hoofs" → "animals hoofs")

Run `--selftest` now and record which are MISSED. Then fix verify until all are CAUGHT, and verify on the current books still reports every real defect listed below (the gate must find them before you fix them — record the counts).

## Step 2 — verify fixes (review findings 2, 3, 6)

- Agreed gaps: compare word by word inside unmatched stretches; never require the whole stretch to be identical across scans. The title exemption may skip only words that match that book's printed heading, not "up to 40 opening words".
- Re-spacings: a many-to-many re-spacing, or one involving a non-dictionary word, digit or label, must be judged, not passed.
- Independence: verify must not call `vocab()`, `_UNI`, `known_word`, `clean_word`, `repair_terms`, `split_run_together`, or any build rule that changes text. Digits glued to letters may be dropped only by position/size evidence (raised, small), not by spelling.
- Punctuation: add a check (f): a sentence mark (`? ; : . , ! ( ) [ ] …` and the ellipsis "..." / ". . .") that both scans place at the same word and ours lacks or changes; and (g) such a mark in ours that neither scan has. Report quote marks as (e) does now.
- `VERIFY_ALLOW`: every entry must be bound to its place — book, Part, and a short context string that must match — and to a count. Replace the Book 19 `None` entries with entries that say which garbled scan token maps to which note (so mutation 2 is caught). Each entry must still be justified by a page image (cite `A<n>`) or by the scans' agreement.
- Verify must print what it examined, as now, plus counts for (f) and (g).

## Step 3 — build fixes

1. **Lost ticks (review finding 1).** These 15 are missing: 878a30 881a15 883b35 885b15 899a15 905b25 907b25 915a30 921a25 922a15 924b15 934b25 948b15 962b15 967a15. Find why the tick reader drops them (scan B reads each; a likely cause is the collision rule "higher-confidence reading stands" added in the last round), fix the cause, and restore them. Then: no two entries resolve to the same place; entries in Bekker order; every `at` occurs exactly once in its book's text (the review found 12 old entries that do not, e.g. 872a20, 882a10, 909b25: lengthen their phrase). Report the before/after entry count and list any tick that changed place.
2. **Punctuation (finding 4).** Fix the cause, then the sites: 19.18 "singing For", 11.30 "syllable hesitancy", 19.4 "must with" (Forster prints an ellipsis), 15.3 ‘two-five’ lost its quote marks, 5.42 end "careful", 24.11 "‘That cold, pure and simple,’", 26.30 "cold.?,", 1.6 "Is it. because", 36.2 "head has. these". Settle each from the page image.
3. **Figure labels, Books 15 and 19 (finding 5).** List every place in Books 15 and 19 where ours has a figure label or label debris (single capital letters, digits, Greek capitals, things like "A 8 ΑΕ 4", "shadow 4", "I’ and 4", "be Z"). For each, read the page image and make ours read what the print reads (labels in the sentence where the print has them; nothing where the print has only a figure). Put these in `PRINT_READS` (it already exists: `(book, Part, our words, print's words, "A<n>: why")`; it exits if an entry does not match exactly once).
4. **Greek in the English (finding 5, 19.20).** `clean_word()` deletes lowercase Greek. Ours has "such as and"; the print has "such as τε and καί". Keep Greek words in body text (prefer the scan whose token is Greek script); restore 19.20; list every other place in the 38 books where Greek now appears or changed.
5. Book 15 "2, 3,4, 5" → check the image and fix if the print has "3, 4".

## Success criteria (the orchestrator will re-run every one)

- `--selftest`: all 9 CAUGHT, exit 0.
- `--verify` on the final books: exit 0, (a)…(g) all 0.
- `--verify --books <the 6885509b36 books>`: exit 1 with non-zero (a), (b), (f).
- anchors.yaml: the 15 ticks present; no shared place; Bekker order; every `at` unique in its book.
- Part counts per book unchanged (the build prints a table; only books 1, 3 show "differs", as now).
- `git diff --stat` touches only the allowed paths.

## Return

A short report: the selftest table before and after; verify counts before and after on current and old books; each fix with cause and the image leaf that settled it; every `PRINT_READS` / `VERIFY_ALLOW` entry added, with its reason; the tick list; anything NEEDS-IMAGE or not done, said plainly.
