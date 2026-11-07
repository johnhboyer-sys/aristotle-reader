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

### 2026-11-06 19:36 — independent OCR pass requested

All 11 shipped spurious works and the 4 being built rest on one archive.org
OCR read each. John is having Grok bot run History Genie on the six Oxford
volumes (VI worksofaristotle0001unse_r3i1; III workstranslatedi03arisuoft;
IX worksofaristotle0009wdro_l1v5; X worksofaristotle0010wdro_x8m2; XI
worksofaristotle0000wdro_n4o7; VII worksofaristotle07arisuoft). Output lands
in ~/Downloads. Genie writes whole-book .docx files, not per-page text, so a
page glob reports it absent. Next: diff each work's text against Genie's read,
judge differences on the page images.

### 2026-11-06 20:36 — John's sequence for the rest

1. Genie OCR lands in ~/Downloads (six Oxford volumes, see 19:36 entry).
2. New sessions run the correction pass per work: diff our English against
   Genie's read, judge every difference on the page image (the Problemata
   method: two witnesses, PRINT_READS, bound allowances, planted-defect
   self-test, cross-family review).
3. Once each work's English is good, aligned and every gate passes: new
   sessions confirm the search index, lexicon (LSJ) pages and phrase/ngram
   indexes are rebuilt to include the new works. `build:public` already
   rebuilds stage6 search, the shared LSJ and stage8 phrases per work, so
   this step needs the work branches merged together first (John's call),
   then proves each index holds every new work (counts per work, not a
   green exit).

Note: several sessions running stage8 at once crawl (35+ min each) and one
was SIGTERMed; run stage8 one at a time.

### 2026-11-07 07:30 — appendix retitled

John chose the retitle over moving the marked works into Bekker order: the home-page group is now **"Doubtful and Spurious Works"** (`shared/lib/works.ts`). This closes Codex review 9's P2. Shared vitest 648/648, app build 7,080 pages, 0 broken links.

### 2026-11-07 08:25 — Genie OCR landed; paused for a reboot

The six Genie volumes (whole-book .txt + .docx) landed in ~/Downloads at 08:18 and are
copied to the main checkout's `sources/genie-oxford/` (untracked; *.txt is gitignored).
Pages are split by `---` lines. Where each work sits (line numbers in the .txt):

| Volume file | Works |
|---|---|
| `Oxford Aristotle III 1931.txt` | DM (~3447), Spir (~9396) |
| `Oxford Aristotle VI 1913 Opuscula.txt` | Col, Aud, Phgn, Plant, Mirab, Mech, Lin, Vent, MXG |
| `Oxford Aristotle VII 1927 Problemata.txt` | Prob |
| `Oxford Aristotle IX 1925.txt` | MM (~5619), VV (~8253) |
| `Oxford Aristotle X 1921.txt` | Oec (~6114), Ath. Pol. / Kenyon (~6960) |
| `Oxford Aristotle XI 1924.txt` | RhAl (~4670) |

Plan (John's sequence, step 2): one correction session per volume, at most two at once
(the Mac has 8 GB; memory ran out at 08:19). The Problemata pass runs in the orchestrator
session. Paused at 08:25 so John can reboot; ath-pol and rhet-alex were asked to checkpoint.

### 2026-11-07 — Problemata checked against Genie's read

Genie's whole-volume read (`sources/genie-oxford/Oxford Aristotle VII 1927 Problemata.txt`,
untracked) diffed word by word against `sources/prob-forster/`, then again with case and
punctuation kept; every real difference judged on scan A's page image. The diff scripts
live in the session scratchpad (footnote segments dropped by marker, running heads dropped,
French spacing joined, `$?^2$` kept as `?`).

Word diff (case and punctuation ignored): 106 ops after cleaning = 74 noise (footnote
text the filter missed, running heads, call-out marks, diagram labels), 15 Genie gaps,
5 Genie errors, 12 ours wrong. The case-and-punctuation diff found 13 more punctuation
errors of ours, 1 case error, 21 capital Hypate/Paranete/Lichanos (print: italic lower case),
and 6 pairs of Forster's pointed brackets that our text had as parentheses (now ⟨ ⟩).
57 `PRINT_READS` entries, 73 bound `VERIFY_ALLOW` entries (39 stale ones removed), tests in
`test_prob_forster_clean.py`.

- Genie gaps (not ours): 941 words from the middle of 23.6 on; 5.23-5.25 replaced by
  unrelated text about Virgin Galactic (~700 words of ours not checked by Genie).
- Genie errors: 2.30 stifling, 16.5 traveling, 29.14 henceforth, 26.12 drops "so",
  26.41 "other other", 10.59 full stop (print has the comma, our entry stands).
- Genie reads `$?^2$` as the question mark plus note number; read every "?" difference
  on the leaf, because Genie sometimes drops a printed "?" and sometimes adds none.
- Not covered: wording both scans and Genie share wrongly; Genie's read of Books 15 and 19 figure labels.
