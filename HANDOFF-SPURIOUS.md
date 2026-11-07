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

The OCR inputs, and scan A's 406 page images (`img/A<n>.jpg`), are in `build/prob-ocr/` (ignored; re-download from archive.org
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
  `task-mw59f4wk-6266om`, landed 11:50, saved as
  `docs/spurious-works/codex-review-2.md`. Review 1's findings confirmed fixed
  (item 5 partly). Six new should-fix findings, NOT yet checked by Claude:
  15 lost anchor ticks are regressions (scan B reads them); verify's "agreed
  gaps" and re-spacing logic can hide shared missing words (it deleted 1.1's
  first sentence in memory and verify stayed green); VERIFY_ALLOW entries are
  unbound to place/count (19.39 hypate->nete passes); punctuation losses
  (19.18, 11.30, 19.4, 15.3 'two-five' quotes; older 5.42, 24.11, 26.30, 1.6,
  36.2); Book 15 figure labels are OCR debris in the prose, and 19.20 loses
  Greek τε/καί; verify still shares vocab()/digit rules with the build.
  All six claims re-checked by Claude and confirmed.
- Fix round 3: Codex GPT-6.1-Sol implemented (brief `codex-brief-3-fix.md`,
  reports `codex-fix-3-report*.md`), committed as `34751dd8a8`. `--selftest`
  plants 9 defects, all caught; Claude planted 10 more, all caught. 15 ticks
  restored (1,460 entries). All uv gates green. Claude found 309 punctuation
  allowances sharing one stock reason, one hiding a real comma (24.11).
- Fix round 4 (running): `codex-brief-4-followup.md`, Codex job
  `task-mw5czk6e-eiq8fv` (resumed session). Decide call-outs by geometry, one
  reason per allowance, restore 24.11 comma, selftest 12/12.
- Round 4 landed as `4bdf8a3368` (selftest 12/12, all gates green).
- Opus 5.5 cross-family review of round 4: `docs/spurious-works/opus-review-5.md`
  (harness `opus-review/mut.py`). Verify still passes broken text: 20 of 51
  planted defects missed, ~50 live defects (stray stops, "?)", "Wuy", stray
  quotes) — all predating round 3. Blockers: re-spacing check skips on the other
  scan's own re-spacing; ~2,300 words checked against one scan only, silently.
  Orchestrator confirmed the live defects by grep. **Waiting on John: go-ahead
  for fix round 5.**

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

### 2026-11-06 17:16 — paused (laptop closed)

Round 5: Codex stopped on its usage window; a Sonnet agent did the text fixes
and stricter gate (WIP commit `c6e5acc65b`, verify exits 1 on purpose). A
second Sonnet agent was finishing it (judge 256 findings on the images,
rebuild VERIFY_ALLOW, run Opus's 67 mutations on a clean baseline, remaining
gates); brief is in this session. Its uncommitted edits at pause:
`build/prob-ocr/work/round5b-snapshot.patch`. If it did not finish: read
`build/prob-ocr/work/report-5b.md` if present, else restart from
`c6e5acc65b` with the same brief. Then Claude checks, then Codex reviews.

### 2026-11-06 17:18 — round 5 finished by Sonnet, committed `24dbee48d0`

Agent reports verify clean, Opus harness 67/67, selftest 12/12, pipeline PASS
(`docs/spurious-works/sonnet-round5-report-part2.md`). NOT yet re-run by the
orchestrator and NOT yet reviewed by Codex. Next: re-run every gate and the
harness, spot-check PRINT_READS against images, then Codex review. Open for
John: 19.9 "y a flute"; 23.6-23.12 has no scan-A page image (23.9 "in"
unchecked); Book 3/19 merges.

### 2026-11-06 18:25 — reviewed and fixed, `fa23728458`; Problemata text done

Orchestrator re-ran every gate on `24dbee48d0`; Codex review 6
(`codex-review-6.md`) found five items, fixed by hand in `fa23728458`: 3.16
back to "Wine" (the print capitalises it), `--books` now fails on unused
allowances (this caught Codex's two missed plants, 10.7 and 23.16), and three
reason/leaf corrections. Codex check 7 (`codex-review-7.md`): no findings, all
five fixes confirmed on the images, 5/5 case plants caught.

Gates at `fa23728458`: verify 0/0, selftest 12/12, Opus harness 67/67,
pipeline PASS, preflight ok, 3,774 tests, 7,080 pages, 0 broken links.

Open for John: Book 3/19 merges (recommend keep); 19.9 "y a flute" (print
reads "y"); 23.9 "in" has no scan-A image; full stops removed at 1.40, 11.15
and 30.1 where scan B lacks them (judged from A's image; low risk). Not done:
the follow-ups listed under Open (desktop corpus.ts, lsj_citation_map, clean
test, DEPLOY-STATUS, dubious-works.md, CLAUDE.md list). Nothing pushed or
merged.

### 2026-11-06 19:00 — follow-ups

- LSJ: `"036": "Prob"` added to `lsj_citation_map.py` (LSJ cites the
  Problemata 1,404 times as 0086,036, 859a-967b; 34 odd forms fail stage5's
  pattern and stay plain text). Test in `test_stage5_lsj.py`, failing first.
- `pipeline/tests/test_prob_forster_clean.py`: Parts, ends, note marks,
  bracket balance, the round-5 specks, the case fixes.
- The bracket check found three live losses verify missed: 11.27 "voice]"
  (the call-out took the ']'; scan A has it), 23.21 "dried up.]" and 26.31
  "pleasant wind.]" (both scans drop it). Fixed by PRINT_READS from A152,
  A261, A295; two (g) allowances bound to the images. Verify gap: a mark
  one scan has and ours lacks is not flagged for brackets.
- Desktop `corpus.ts`: nothing to do — it lists every spurious work as a
  `slot`, Mech and `Probl` alike.
- Left for merge time (four other branches edit the same lines):
  `docs/dubious-works.md` line 83, CLAUDE.md's handoff list, DEPLOY-STATUS.
