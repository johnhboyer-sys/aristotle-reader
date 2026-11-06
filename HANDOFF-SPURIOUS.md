# Handoff — dubious and spurious works

John's goal (2026-11-06): make the site complete for the dubious and spurious
Bekker works. Agreed order: **Problemata** (in progress), De Spiritu (build now,
deploy after 2027-01-01), Rhetorica ad Alexandrum and De Plantis (Greek must come
from outside the tlg0086 export), Magna Moralia (needs a Bekker spine; First1KGreek
has tlg022).

## Problemata (`Prob`) — state at 2026-11-06 11:45

Worktree `.claude/worktrees/agent-a782a5f9d3204d01e`, branch
`worktree-agent-a782a5f9d3204d01e`. Nothing on main, nothing deployed. Main has
someone else's uncommitted redesign work: merging and deploying need John.

Commits on the branch: `5d2568f58e` first pass · `65793a0e1c` cleaner keeps
dropped words · `6885509b36` stage3 numeral skip (narrow: whole numeral, no
sigla; tests in `pipeline/tests/test_stage2_stage3.py`) · `b2b8a9012f` fixes for
Codex review 1, independent `--verify`, `PRINT_READS`.

What it is: Greek from the vendored First1KGreek TEI
(`sources/tlg0086.tlg036.1st1K-grc1.xml`, `manifests/Prob.yaml`), English is
Forster (Oxford 1927, public domain) rebuilt from two archive.org scans by
`pipeline/tools/build_prob_forster.py` into `sources/prob-forster/`.

### Rebuild

The OCR inputs are in `build/prob-ocr/` (ignored; re-download from archive.org
items `worksofaristotle07arisuoft` and `worksofaristotle0007unse_o7n4` if lost).

```
cd pipeline
uv run python tools/build_prob_forster.py --ocr-dir ../build/prob-ocr --pass1   # only if Part counts change
uv run python -m aristotle_pipeline all --work Prob
uv run python tools/build_prob_forster.py --ocr-dir ../build/prob-ocr
uv run python -m aristotle_pipeline all --work Prob
uv run python tools/build_prob_forster.py --ocr-dir ../build/prob-ocr --verify   # must exit 0
```

Positive control: `--verify --books <folder of the books at 6885509b36>` must
fail (it reports 68 findings there). `docs/spurious-works/dropcheck.py
build/prob-ocr` must be run from the worktree root (from elsewhere it reads 0
words and says nothing is wrong).

### Gates passed at `b2b8a9012f`

verify exit 0 · stage2 PASS · stage3 key_failures=0 · 3,774 tests · stage8/9 ·
preflight · app build 7,080 pages · links 0 broken.

### Reviews

- Codex review 1 (GPT-6.1-Sol medium): `docs/spurious-works/codex-review-1.md`.
  All eight findings fixed and checked by hand.
- Codex review 2: brief `docs/spurious-works/codex-brief-2.md`, job
  `task-mw59f4wk-6266om`. Result to be saved as
  `docs/spurious-works/codex-review-2.md`. **John said: pause when it lands —
  report findings, change nothing until he says.**

### Open

- **John's decision:** Book 3 25a/25b and Book 19 35a/35b are each one Part
  (`MERGE`). Recommendation: keep merged; lettered chapter ids are riskier.
- 15.x "2, 3,4, 5" spacing (not image-checked).
- Quote marks restored on the scans' word alone, not image-checked: 4.28, 34.3,
  11.33, 15.2, 26.14, 26.51, 27.3, Book 19 terms.
- Figure labels in Books 15 and 19 now kept as the scans read them — maybe worse.
- verify cannot see punctuation.
- anchors.yaml went 1,445 → 1,438 (15 lost, 8 new); the lost ones are unexamined.
- Follow-ups: `desktop/src/lib/corpus.ts` and
  `pipeline/aristotle_pipeline/lsj_citation_map.py` list Mech but not Prob; no
  per-work clean test like `test_mech_forster_clean.py`; DEPLOY-STATUS and
  `docs/dubious-works.md` not updated; add this file to CLAUDE.md's handoff list.

### Lessons

- Image numbering: for the second scan, hOCR leaf N is roughly image `n(N-1)`;
  check the page text before trusting a crop.
- Both scans misread stacked fractions; the merge cannot see an error both share.
  `PRINT_READS` holds those, read off the image, and stops the build if stale.
