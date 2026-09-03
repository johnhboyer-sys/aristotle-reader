# Codex-Sol audits — 2026-08-22

Findings-only reviews of the day's work. Reports kept verbatim; what was DONE about each is in the commit that follows them.

# Codex-Sol — audit of the two-engine apply (2026-08-22)

## VERIFIED SOUND — the corpus is correct
- All 26 engine verdicts landed (0 missing engine spans).
- All 71 corpus-verdict spans remain at their ruled sites (0 clobbered).
- All 91 final ruled lines match an atomic reconstruction from their originals.
- No `corpus_line` ambiguous within its column; every `corpus_span` occurred
  exactly once in its original line.
- All six shared-line groups are consistent with all their rulings at once,
  including the two hand-completed swaps (`ἑτερον ἕτέρῳ`, `λαιμαργὸς`).
- `page-096-R:28` had already landed under the 2026-08-21 citation sitting.

## FINDING 1 (HIGH) — 70 keep entries carry `line: 0`, so verify never looks
Every `kind: keep` row sourced `two-engine sitting 63-102` has `line: 0`.
`john_rulings.check()` treats a missing line as SUCCESS, so
`--verify`'s "all 955 checkable rulings hold" is true by the program's rules
and proves nothing about these 70. The guard will not catch a later change to
any of these approved readings. (Codex checked all 71 by a site-aware test of
its own: they do hold now.)

## FINDING 2 (HIGH) — two page-098-L rulings collapsed into one ledger row
Ledger IDs are `col:line:form`. With `line: 0`, these two distinct verdicts
produced the same ID `page-098-L:0:ῃ` and one overwrote the other:
  - page-098-L:38  `ῃ → η` rejected  (πλείστῃ κ6...)
  - page-098-L:46  `ῃ → η` rejected  (ἀποστεγάσῃ (Emped 356)...)
69 distinct ledger IDs for 70 ruling records. John ruled two sites; the ledger
remembers one.

## FINDING 3 (MEDIUM) — four text entries verifiable at the wrong position
Form occurs more than once in its named line, so a later change could undo the
ruled occurrence while another copy lets verification pass:
  page-063-R:33 `ο` ×3 · page-087-R:18 `ȣ` ×3 ·
  page-090-R:27 `,` ×3 · page-091-L:23 `ή` ×2
(The current text is correct at all four; the fault is in the check.)

## ON THE PRIMITIVE
`str.replace(span, repl, 1)` was safe here only because line and span were
unique at the moment of replacement. It is NOT safe generally: re-test
uniqueness against the unchanged source immediately before each replacement,
and apply lines carrying more than one ruling from ONE unmodified source line
(by recorded offsets or as a single checked whole-line result), never
sequentially.

---

# Codex-Sol — the rotted-test fix (2026-08-22)

Task: rewrite two count-based assertions in tests/test_extra_sweep_mappers.py so
they pin the MECHANISM and cannot rot when John rules more sites.

⚠ Codex COULD NOT RUN THE SUITE: `uv` failed to write its cache outside its
sandbox (`/Users/johnboyer/.cache/uv ... Operation not permitted`). It ran the
assertions directly against the available Python instead. The orchestrator must
re-run `uv run --with pytest pytest tests/test_extra_sweep_mappers.py -q`.

## The regression it says the new pin catches

In `bonitz_pipeline/adjudication.py`, changing

    _within(b, addr) or (_within(pd, b) and _within(b, cluster))
to
    _within(b, addr) or _within(pd, b)

would let a whole-line card (which contains `pd`) answer 018-L:22, and the new
`is None` assertion would fail.

## Other count-based assertions liable to rot the same way (not rewritten)

- test_the_fragment_ruling_reaches_the_bekker_finding
- test_a_siglum_card_alone_does_not_answer_a_quotation_finding
- test_no_sweep_reads_not_mapped_on_63_102

Exempt: test_mapper_totals_match_the_dashboard_counters — compares two live
counts against each other rather than pinning a fixed number.

# Codex-Sol — round-6 holdout integrity (task-mt4rb59s-9vaw7v)

No held-out image or line reached `train.arrow`. The round-6 result is sound for its stated 722-line holdout.

## Findings

### Moderate — `stage_verify()` overstates its text-only check

[kraken_corpus.py](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/bonitz_pipeline/kraken_corpus.py:626) opens both Arrow files and reads `lines[*].text`; it does not trust a manifest. But it removes any holdout text also found in the training GT before checking for leaks. Two holdout rows have text also found in training: `b19.` and `b21.`. Thus “no held-out line is in train.arrow” directly checks only the other 720 texts.

Literal output:

```text
train_rows=9185
holdout_rows=722
train_distinct_texts=9182
holdout_distinct_texts=722
common_distinct_texts=2
holdout_rows_whose_text_occurs_in_train=2
train_rows_whose_text_occurs_in_holdout=2
multiset_intersection_occurrences=2
common[1] train_count=1 holdout_count=1 text='b19.'
common[2] train_count=1 holdout_count=1 text='b21.'
```

The two rows are distinct source lines and distinct images:

```text
common_distinct_image_sha256=0
image_multiset_intersection_occurrences=0
common_distinct_text_image_pairs=0
text_image_multiset_intersection_occurrences=0
text='b19.'
  train_gt_columns=[('page-099-R', 1)]
  train_arrow_image_sha256=['6a125145db33baff5e1b9870000bcc13853b274ffbfecbc23e246c0e3dbe1cf8']
  holdout_gt_columns=[('page-047-L', 1)]
  holdout_arrow_image_sha256=['7e7e3a5a5f135ba77a96d381792df5eb971be01ef53fd4dcdae13bbdc431f000']
text='b21.'
  train_gt_columns=[('page-056-L', 1)]
  train_arrow_image_sha256=['a9c41de27d830b014d14d6ebc4f4c7e0df9abd56f8af894839125b575aef4ab1']
  holdout_gt_columns=[('page-037-L', 1)]
  holdout_arrow_image_sha256=['48a36628983b4ceddca68d5aa546f8af8755be01332bd8281efa37c6c4452807']
```

This gap matters to the guard: a held-out image substituted for a training image with the same text could pass its text checks. It does not affect these artifacts because the full image-level check below passed.

### Low — `stage_verify()` does not rerun `check_partition()`

`check_partition()` runs only during `stage_split()`. `stage_verify()` calls `read_lists()` but does not prove that train plus holdout still covers every paired or GT column. A later reduced `train.txt` and matching reduced Arrow could pass verification. This cannot create a holdout leak, but the verifier does not guard the full partition after `split`.

Literal call-site search:

```text
501:def check_partition(train: list[str], holdout: list[str],
545:    check_partition(train, holdout, usable)
```

The current partition is sound:

```text
pairing_reports=173
pairing_columns=173
pairing_duplicate_columns=[]
pairing_matched_columns=173
pairing_unmatched_columns=[]
listed_not_usable=[]
usable_not_listed=[]
```

### Informational — the current ruling is not wholly within pages 15–52

It contains eight columns from pages 15–52 plus both columns of pages 55 and 61. This range error does not affect the result.

```text
holdout_count=12
ruling_count=12
ruled_not_held=[]
held_not_ruled=[]
same_order=True
holdout=page-017-L,page-022-R,page-027-L,page-032-R,page-037-L,page-042-R,page-047-L,page-052-R,page-055-L,page-055-R,page-061-L,page-061-R
ruling=page-017-L,page-022-R,page-027-L,page-032-R,page-037-L,page-042-R,page-047-L,page-052-R,page-055-L,page-055-R,page-061-L,page-061-R
```

## Verified SOUND

The built-in verifier passed:

```text
train.arrow:   9185 lines from 161 columns ✓
holdout.arrow: 722 lines from 12 columns ✓
no held-out line is in train.arrow ✓  (720 lines are unique to the holdout and none of them is there)
```

I independently re-extracted every line image from every listed XML with Kraken’s compile code and compared `(text, image SHA-256)` multisets against the Arrow rows:

```text
train_arrow_rows=9185
train_reextracted_rows=9185
train_missing_text_image_pairs=0
train_extra_text_image_pairs=0
train_listed_columns_absent_from_arrow=[]
train_listed_columns_partly_present=[]
train_all_listed_columns_fully_present=True
holdout_arrow_rows=722
holdout_reextracted_rows=722
holdout_missing_text_image_pairs=0
holdout_extra_text_image_pairs=0
holdout_listed_columns_absent_from_arrow=[]
holdout_listed_columns_partly_present=[]
holdout_all_listed_columns_fully_present=True
```

The symlink merge is sound. There are no source-name collisions, broken links, wrong targets, unlisted GT files, or XMLs pointing at the wrong source image:

```text
gt_source_a_count=95
gt_source_b_count=78
gt_source_name_collisions=[]
gt_merged_count=173
gt_merged_vs_source_union_missing=[]
gt_merged_vs_source_union_extra=[]
gt_broken_symlinks=[]
gt_wrong_or_non_symlink_targets=[]
cols_source_a_count=96
cols_source_b_count=80
cols_source_name_collisions=[]
cols_merged_count=176
cols_merged_vs_source_union_missing=[]
cols_merged_vs_source_union_extra=[]
cols_broken_symlinks=[]
cols_wrong_or_non_symlink_targets=[]
listed_columns=173
merged_gt_columns=173
listed_without_gt=[]
gt_not_listed=[]
cols_without_gt=['page-057-L', 'page-073-R', 'page-093-R']
xml_image_source_counts={'kraken400': 95, 'kraken-cold': 78, 'other': 0}
xml_missing_images=[]
xml_wrong_stem_or_source_images=[]
xml_images_resolving_inside_merged_tree=[]
```

The three extra PNGs have no GT XML, so the explicit XML argument list cannot compile them. `stage_compile()` passes only `../gt/<listed-column>.xml`. Each XML points to the matching source-tree PNG.

The 12 cold-tree holdout columns are all in merged training, but they belong to the separate `kraken-holdout-063-102.json` ruling. This does not affect the round-6 headline, which scores only the main ruling. It would make a future round-6 score on those 12 cold columns non-independent.

```text
cold_holdout_count=12
cold_holdout=page-067-L,page-072-R,page-077-L,page-082-R,page-087-L,page-092-R,page-097-L,page-102-R,page-065-R,page-080-L,page-090-R,page-099-L
cold_holdout_matches_cold_ruling=True
cold_holdout_in_main_ruling=[]
cold_holdout_in_merged_train_count=12
cold_holdout_not_in_merged_train=[]
cold_holdout_in_merged_holdout=[]
```

Downstream files and prediction folders use only the merged holdout:

```text
train_files=['train.arrow']
eval_files=['holdout.arrow']
eval-e08-0.9961: pred_columns=12 missing=[] extra=[]
eval-e11: pred_columns=12 missing=[] extra=[]
eval-e13-0.9963: pred_columns=12 missing=[] extra=[]
eval-e14-0.9963: pred_columns=12 missing=[] extra=[]
eval-e17-0.9963: pred_columns=12 missing=[] extra=[]
eval-e19-0.9962: pred_columns=12 missing=[] extra=[]
```

I recomputed the headline from `eval-e11` against those exact columns:

```text
columns_scored=12
columns=page-017-L,page-022-R,page-027-L,page-032-R,page-037-L,page-042-R,page-047-L,page-052-R,page-055-L,page-055-R,page-061-L,page-061-R
lines_scored=722
characters_scored=37538
edits=124
overall_CER=0.3303%
combining_smooth_recall=53/54=98.15%
```

The audited Arrows also match their recorded hashes:

```text
work/kraken15-102/train.arrow: OK
work/kraken15-102/holdout.arrow: OK
```

No files or Git state were changed. Audit time: about 8 minutes.

Codex session ID: 01a02ae4-ccb6-78c1-a5d0-8e40aff2357e
Resume in Codex: codex resume 01a02ae4-ccb6-78c1-a5d0-8e40aff2357e

# Codex-Sol — audit of the reader-comparison measurements (task-mt4rc0ab-0cabrv)

Run label: `Sonnet→Codex-Sol: audit the reader-comparison measurements`

## Findings

1. **Claim B — high severity: the reported recall rates do not match the project harness’s class meaning. The “do not retrain” decision does not stand on these figures alone.**

The hand method correctly computes recall after NFD decomposition. Its values reproduce:

| Class | Hand method, NFD | Project harness, stored NFC |
|---|---:|---:|
| `ȣ` | 1731/1740 = 99.48% | 1731/1740 = 99.48% |
| acute | 9775/9863 = 99.11% | 128/156 = 82.05% |
| perispomeni | 3622/3727 = 97.18% | 582/633 = 91.94% |
| smooth | 7618/7686 = 99.12% | 289/300 = 96.33% |
| rough | 2077/2204 = 94.24% | 21/37 = 56.76% |

NFD makes every Greek accent a separate character. The high rates therefore cover all accented Greek letters, most of which Calamari reads well. The stored NFC text leaves separate marks chiefly on `ȣ` and `ϗ`, which have no precomposed accented forms. Those are the hard cases that matter to the retraining decision.

The hand alignment itself is not the main fault. Against a true Levenshtein alignment in NFD, it gives identical hits for every listed class except smooth, where it misses one extra occurrence: 7618 rather than 7619. The main fault is presenting broad NFD recall as equivalent to the narrower NFC classes in [kraken_eval.py](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/bonitz_pipeline/kraken_eval.py:30).

Whole-sequence results also weaken the claim that Calamari “was never broken on ligature marks”:

- `ȣ̓`: 288/300 = 96.0%
- `ȣ̔`: 19/37 = 51.35%
- `ȣ͂`: 568/607 = 93.57%

There is also a project-harness fault: its probe asks for `ȣ̃`, with U+0303 COMBINING TILDE, while this corpus stores `ȣ͂`, with U+0342 PERISPOMENI. The probe finds zero targets in these 4,444 lines, so it silently omits that sequence. See [probe_report](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/bonitz_pipeline/kraken_eval.py:58).

**Decision:** reopen “do not retrain.” These results do not prove retraining is needed, but Claim B does not support the decision as stated.

2. **Claim A — medium severity: `SequenceMatcher` is not a valid CER distance and overstates errors. The gate decision still stands.**

On all 4,444 pairs, using NFC as required by the project:

- `SequenceMatcher`: 1,467 edits / 221,023 chars = **0.66373%**
- True Levenshtein: 1,409 / 221,023 = **0.63749%**

`SequenceMatcher` adds 58 errors, or 4.12% over the true edit count. Only six lines differ between the methods, but one badly read line accounts for 43 of the extra errors. It never understated distance in this set.

Under NFD:

- `SequenceMatcher`: 1,598 / 247,631 = **0.64532%**
- True Levenshtein: 1,533 / 247,631 = **0.61907%**

Thus no version of the described method reproduces **0.649%** exactly from the current files. If “mean CER” means the mean of line-level rates, the true NFC result is **0.62811%**, not 0.649%.

The correct project-style CER is **0.6375% NFC**. That is slightly better than the stated result, so the overall two-engine gate remains satisfied.

3. **Claims A and B — Unicode did not create false mismatches, but NFD lowers the reported CER through its denominator.**

All 4,444 references and all 4,444 predictions are NFC. There are zero raw-unequal pairs that become equal after NFC normalization. Claims C and D also use NFC throughout.

NFD raises the reference count from 221,023 to 247,631 code points because ordinary accented Greek letters split into bases and marks. It lowers true CER from 0.63749% to 0.61907%, despite increasing the edit count from 1,409 to 1,533. That is a **0.01842 percentage-point deflation**, about 2.9% relative.

`ȣ` itself does not decompose. Its accents stay combining in both forms.

4. **Claim C — low severity: Bekker spacing explains almost none of 2.52%. The decision still stands for this read.**

The stated score reproduces exactly as a raw whole-file comparison:

- 84 edits / 3,340 reference characters = **2.51497%**
- `SequenceMatcher` and true Levenshtein both give 84 here.

Only two of the 84 errors are whitespace-only. Just one is the unspaced-Bekker convention:

- Corpus: `ακ803b28`
- Codex: `ακ803 b28`

Removing that convention error gives 83/3,340 = **2.485%**. Removing both whitespace errors gives **2.455%**. The conclusion is therefore not due to spacing.

The ligature figures are also sound as aligned recall, not just raw counts:

- `ȣ`: 11/27, with no spurious `ȣ`
- `ϗ`: 3/12, with no spurious `ϗ`

One small bias favors Codex: the 3,340-character denominator includes 61 matching newline characters. Excluding line separators gives 84/3,279 = **2.562%**. The project’s whitespace-free canonical scorer gives **2.614%** for this file.

**Decision:** rejecting this page-103-L read as a competitive reader still stands. One column alone does not prove that every Codex setup lacks value, but the spacing convention is not the cause.

5. **Claim D — no harmful join ambiguity found. The review-card decision stands.**

Across the 4,444 corpus lines:

- One distinct text is non-unique.
- It is `a24.`, appearing twice.
- Thus two lines carry duplicated text, with one duplicate beyond the first.

None of the 541 manifest rows uses `a24.`. Every manifest corpus value has exactly one match in `lines.json`. The “first match” rule therefore selected the only possible line for all 541 rows and could not have made a false agreement card.

The reported totals reproduce exactly:

- 159 exact full-line Calamari/Kraken agreements against the corpus
- 68 whitespace-only
- 91 substantive
- 97 generated cards
- 382 lines where the engines differ

Calling the 159 items “sites” is slightly loose: they are exact full-line agreements. This rule can miss a local agreement when the engines also differ elsewhere on that line, but it cannot create a false card among the 159.

**Decision:** the join did not taint the 97 hand-review cards or the edits that followed.

## Verified as sound

- `lines.json` matches the arrow texts exactly: 3,758 train plus 686 holdout, with zero order or text mismatches.
- All 4,444 PNG files match the image bytes stored in the arrows.
- All 4,444 prediction files exist.
- Exact lines: 3,506/4,444 = **78.8929%**, which supports the stated 79%.
- Claim C’s 2.52% raw score and ligature hits reproduce.
- Claim D’s 159/68/91 split and 97-card count reproduce.
- The Claim D text join was safe on this dataset.

I made no edits. I did not audit whether all claimed 25 corpus edits landed correctly; the current ruling store contains 26 `engines` verdict cards, so that apply count needs its own audit.

Codex session ID: 01a02ae5-696b-7f73-b84b-07d0cfaca345
Resume in Codex: codex resume 01a02ae5-696b-7f73-b84b-07d0cfaca345

# Codex-Sol — adversarial review of the B4 sweep design (task-mt4rcrjy-t7f3pt)

1. **Critical — Tier 3 is not “genuinely independent,” and the corpus already rejects OCR dissent as strong evidence.**

   Round 6 trained on 161 columns from pages 15–102, with only 12 held out. Thus 161 of the proposed sweep’s columns supplied the labels that the model would later challenge. The project’s own notes call Kraken agreement on trained pages “recitation, not evidence” and mute it for that reason. [BONITZ_HANDOFF.md](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/BONITZ_HANDOFF.md:11) [NOTES.md](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/kraken/NOTES.md:542)

   Independence from the Claude model family does not give independence from Claude-derived labels. Kraken learned from reconciled text made by Opus, LlamaParse, Genie, and later rulings. Round 4 even trained on 205 restored ligature marks so it would reproduce the corpus’s policy for marks on `ȣ`. A dissent on a training column may still merit a look, but it has a strong bias toward the corpus label. An agreement proves nothing.

   The best direct calibration is adverse: when Kraken and Calamari, two separately trained OCR engines, agreed against the corpus on 97 cards, John found the engines wrong 71 times, or 73%; only 25 corpus fixes followed. One trained engine cannot rank as “the strongest single piece of evidence” without class-specific proof. [BONITZ_HANDOFF.md](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/BONITZ_HANDOFF.md:57)

   The cited `786 marked / 480 bare over 60 sampled columns` is also weaker than stated. Those figures reproduce exactly by taking the first 60 filenames in sorted `work/kraken400/read/txt`: four isolated columns (`015-L`, `020-L`, `030-R`, `052-L`), then every column from 53-L through 80-R. This is not a random or balanced sample, and it mixes trained and cold columns. It measures Kraken’s output mix, not its disagreement count.

   A strict token alignment on those 60 files found only one corpus-bare/Kraken-marked site among 390 aligned bare corpus sites: `062-R:9 στερητικȣ` versus `στερητικȣ͂`. Across all 108 stored columns from 53–106, the result stayed one among 814 aligned bare sites. Tier 3 therefore looks tiny, but its cited count does not show that.

2. **High — Tier 1’s flagship arithmetic compares unlike units and its premise has real counterexamples.**

   The current corpus contains 57 exact standalone bare `τȣ` tokens, not 69. It contains 563 exact standalone `τȣ͂`, plus 14 `τȣ̃` and 2 `τȣ̀`. The cited 689 is the raw substring count for `τȣ͂`; 126 of those occur inside longer tokens such as `αὐτȣ͂`. It is not the count of the same standalone token. The claimed ratio cannot support the stated rule.

   Of the 57 bare `τȣ`, 50 are genuine missing-accent suspects by grammar. Seven are valid enclitic or indefinite `του` in `ἕνεκά του`, not genitive `τοῦ`:

   - `049-L:45`
   - `054-R:20`
   - `055-R:2`, `:7`, `:10`
   - `103-L:27`, `:43`

   The accented Aristotle data confirms `ἕνεκά του` throughout Physics, Parts of Animals, Generation of Animals, and other works. These seven would be known false positives under the flagship ratio. [page-049-L.txt](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/reconciled/page-049-L.txt:45) [page-055-R.txt](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/reconciled/page-055-R.txt:2)

   A second actual countercase is `πȣ`:

   - `070-L:18 ἄνθρωποί πȣ`
   - `096-L:44 ἐπιθυμȣ͂ντά πȣ`

   Both are valid enclitic `που`; elsewhere `πȣ͂` is interrogative `ποῦ`. [page-070-L.txt](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/reconciled/page-070-L.txt:18) [page-096-L.txt](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/reconciled/page-096-L.txt:44)

   Across the corpus, 118 bare sites in 39 exact token families have a marked twin. Since B4 leaves the ratio floor unset, its output can vary sharply:

   - Floor above 0.90: 63 sites
   - Above 0.85: 69
   - Above 0.75: 80
   - Above 0.50: 93
   - Any marked twin: 118

   At the flagship 0.90 level, the seven valid `ἕνεκά του` cases remain. Ratio alone cannot remove the homograph problem.

3. **High — Tier 2 has real accented data, but its match rule is missing and that choice changes the queue.**

   The data source is real, so the tier is not fiction. The linked `app/dist/data` contains 117 book files for 41 works and about 848,740 accented tokens. It does not contain accented text for 49 works; B1/B2 already admit that eight works lack Greek text. B4 must say “41 of 49 works” and report those eight as skipped.

   `work/aristotle-forms.json` does support B4’s warning: it has 56,053 lowercase forms and no surviving accent or breathing marks. `lexcheck.bare()` strips them. The cache also mixes corpus forms with LSJ heads, so it cannot stand in for accented Aristotle text. [lexcheck.py](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/bonitz_pipeline/lexcheck.py:42)

   B4 does not define how it joins a bare Bonitz token to accented variants. Two reasonable readings produce different results:

   - Preserve every non-ligature mark and ignore only the missing mark on `ου`: 1,369 of 1,623 sites match; 254 skip; 145 have some marked source form; 59 are ambiguous; 86 have only marked source forms.
   - Use the `lexcheck.bare()` skeleton implied by the text: 1,388 match; 235 skip; 171 have some marked form; 80 are ambiguous; 91 have only marked forms.

   Accent-blind matching creates false joins between different words and forms, including:

   - Eight `ὅπȣ` = `ὅπου`, joined to one `ὀποῦ`
   - Seven `νόμȣς` = `νόμους`, joined to `νομοὺς`
   - Three `Ἄργȣς` = proper-name `Ἄργους`, joined to common `ἀργοὺς`
   - `ποίȣς` = `ποίους`, joined to `ποιούς`
   - `βȣλή` / `βȣλὴ` = noun `βουλή`, joined to verbal `βούλῃ`

   The phrase “the attested accentuation” is false for these skeletons: several distinct accentuations are attested. B4 needs an explicit `ambiguous` state and must not flag on “any marked variant.”

4. **High — As written, the combined queue is too large by this project’s own standard.**

   Tier 1 yields up to 118 sites. Tier 2 yields 145 under the safer key or 171 under the accent-blind key. Their unions contain about 148 or 173 sites. The current stored Kraken evidence adds only one, already found by both text tiers.

   The repository’s own test calls more than six findings “a queue, not a card.” B4 proposes no precision gate before creating roughly 150–170 cards. [test_division_check.py](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/tests/test_division_check.py:252)

   A workable gate already appears in the measurements: require both exact self-inconsistency and a Tier 2 match for which every source form marks the same `ου`. That leaves 56 sites under the safer match key. An exact cited-address match could cut it further.

5. **Medium — B4 asserts the standing rules but does not define enough data to obey them.**

   “Report volume” lacks required fields for:

   - Tier 1’s chosen ratio floor, minimum support, ambiguous homographs, and exact token-versus-substring counts.
   - Tier 2’s 41 loaded works, eight absent works, matching key, marked/unmarked variant counts, and ambiguity skips.
   - Tier 3’s model checkpoint, training/holdout status per column, lines skipped by segmentation, tokens that failed alignment, and aligned bare sites examined.

   “Column not segmented” is not enough. The Kraken notes state that stored predictions can omit every fifth line and must not align by line number. [NOTES.md](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/kraken/NOTES.md:1466)

   “Claim no more than the evidence” also fails in three places: Tier 1 is called the strongest signal despite valid homographs; Kraken is called genuinely independent despite label reuse; and Kraken dissent is called the strongest evidence despite the 71/97 adverse calibration.

6. **Medium — The tilde by-product is incomplete and conflicts with the finder-only rule.**

   The corpus has 32 U+0303 marks on `ȣ`, not 17. Seventeen is only the literal `τȣ̃` substring count; the other 15 occur in forms such as `ἑαυτȣ̃`, `καλȣ̃`, `ποιȣ̃σι`, `ἀγαθȣ̃`, and `πλȣ̃τος`.

   U+0303 does not contaminate the missing-mark sweep if the code tests Unicode combining class and counts both U+0303 and U+0342 as “marked.” It does contaminate ratios if variants get counted by literal spelling, as the `57/689` flagship arithmetic appears to do.

   The encoding issue should be a separate 32-site report. “Worth normalising in the same pass” makes the sweep a fixer and contradicts the standing rule. Canonicalize only the comparison key; do not change the diplomatic corpus without a separate ruling.

7. **Medium — B4 omits the cheapest stronger test.**

   B1/B2 already plan an address-to-Aristotle join. Where a bare `ȣ` sits in a quoted passage with a Bekker citation, compare it with the accented token at that exact address and ±2-line window. This resolves `τοῦ` versus enclitic `του`, `ποῦ` versus `που`, proper names, and most global-form homographs. Global wordform evidence should serve only when no exact address match exists.

   B4 also needs a pilot against the ink before it creates the full queue. Test a fixed sample from each tier, report confirmed precision, and backtest recall by masking known marks from the 2,720 marked sites.

**Verdict: build only with named changes.** Use exact positional token counts; preserve non-ligature accents; add an ambiguous state; prefer exact cited-address evidence; require two text signals before making a card; restrict Kraken evidence to held-out or unseen columns and report model provenance; use Kraken only to rank candidates; and issue a separate, non-mutating 32-site U+0303 report.

Codex session ID: 01a02ae5-f3e4-76f2-8df0-45b2f4c4a36e
Resume in Codex: codex resume 01a02ae5-f3e4-76f2-8df0-45b2f4c4a36e

# Codex-Sol — the first honest kraken-vs-calamari head-to-head (task-mt4s8b5m-4gcv2j)

1. The first honest head-to-head favors Kraken; it does not show complementary strengths.

Both engines read the same 722 NFC holdout lines against identical ground truth. `kraken_eval.align` supplies true Levenshtein alignment.

```text
kraken round 6 e11
lines 722; CER 124/37538 = 0.330332%
U+0223 305/305
U+03D7 108/108
U+0300 128/128
U+0301 20/22 indicative (<30)
U+0342 97/99
U+0313 53/54
U+0314 6/7 indicative (<30)
U+0345 0/0 indicative (<30)

calamari ensemble5
lines 722; CER 380/37538 = 1.012308%
U+0223 303/305
U+03D7 108/108
U+0300 122/128
U+0301 15/22 indicative (<30)
U+0342 80/99
U+0313 53/54
U+0314 5/7 indicative (<30)
U+0345 0/0 indicative (<30)
```

Normalization check:

```text
GT non-NFC 0
Calamari non-NFC after reader 0
Kraken non-NFC after reader 0
```

Kraken has 256 fewer edits over the same 37,538 characters. Calamari wins none of the requested classes; two classes tie, and U+0345 has no test instances.

What this changes: the old “complementary engines” finding does not survive; the saved results show that the current Kraken model performs better on this common holdout.

2. A common holdout does exist: the same 12 columns were withheld from both engines.

The exact trained column sets are:

- Kraken round 6: every L/R column from pages 015–102 except the 12 common holdouts and the absent `page-057-L`, `page-073-R`, and `page-093-R`: 161 columns.
- Calamari ensemble5: every L/R column from pages 015–062 except the same 12 holdouts and absent `page-057-L`: 83 columns.

Evidence from [Kraken’s split lists](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/kraken15-102/train.txt), the merged tree, and [the Calamari export manifest](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/work/calamari-export/MANIFEST.json):

```text
kraken round 6
train 161 holdout 12 overlap 0 listed 173
absent from numeric range page-057-L page-073-R page-093-R
holdout page-017-L page-022-R page-027-L page-032-R page-037-L page-042-R page-047-L page-052-R page-055-L page-055-R page-061-L page-061-R

calamari export
train 83 holdout 12 overlap 0 listed 95
absent from numeric range page-057-L
holdout page-017-L page-022-R page-027-L page-032-R page-037-L page-042-R page-047-L page-052-R page-055-L page-055-R page-061-L page-061-R
```

```text
gt 173 train 161 holdout 12
gt == train union holdout True gt extra [] lists missing from gt []
```

This does not rest on a README sentence. All five archived Calamari model configs retain their own train and validation lists:

```text
model 0: train=3754 val=939 overlap=0 union=4693
model 1: train=3754 val=939 overlap=0 union=4693
model 2: train=3754 val=939 overlap=0 union=4693
model 3: train=3755 val=938 overlap=0 union=4693
model 4: train=3755 val=938 overlap=0 union=4693
validation union 4693 validation sum 4693 pairwise overlap 0
training union 4693 all-model train intersection 0
each val excluded from own train True
each val trained by other four True
```

The two ground-truth trees also agree exactly:

```text
kraken400 sites 722 round6 sites 722 same site set True
ground-truth text differences 0
first []
```

What this changes: a same-line comparison is valid; there is no need to use separate 63–102 scorecards.

3. The Kraken ligature-perispomeni probe is defective, though the stated counts need one qualification.

Across the 184 stored NFC files, raw code-point counts are:

```text
files 184 non-NFC files 0
U+0303 COMBINING TILDE 32
U+0342 COMBINING GREEK PERISPOMENI 1387
U+0313 COMBINING COMMA ABOVE 771
U+0314 COMBINING REVERSED COMMA ABOVE 93
```

For the exact ligature sequences, the claimed 1,311 and 32 counts are correct:

```text
pages 15-102 U+0303 0 U+0342 1345 ȣ+0303 0 ȣ+0342 1271
pages 103-106 U+0303 32 U+0342 42 ȣ+0303 32 ȣ+0342 40
all pages U+0303 32 U+0342 1387 ȣ+0303 32 ȣ+0342 1311
```

Thus `ȣ̃` misses 1,311/1,343 = 97.62% of the two stored ligature-plus-circumflex spellings.

Running [the probe](/Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz/bonitz_pipeline/kraken_eval.py:49) both ways on round-6 e11 gives:

```text
current U+0303 0/0
corrected U+0342 93/93
```

The wider U+0342 class remains 97/99 because six U+0342 instances are not part of the exact `ȣ͂` sequence.

What this changes: the published sequence probe supplied no guard at all; had it used the corpus code point, it would have reported 93/93.

4. No second wrong-codepoint target appears in the sweep modules.

The sweep grep shows U+0303 only as an accepted alternate input or in comments. Executable code folds it to U+0342:

```text
bonitz_pipeline/ligature_sweep.py:41:# so `τȣ͂` in the ink arrives as `τοῦ` — one character against two.  Comparison
bonitz_pipeline/ligature_sweep.py:66:    # something else — nearly always a diacritic, `τȣ̃` against `τȣ͂` being
bonitz_pipeline/diacritic_sweep.py:51:    '̓': 'smooth',
bonitz_pipeline/diacritic_sweep.py:52:    '̔': 'rough',
bonitz_pipeline/diacritic_sweep.py:55:    '͂': 'circumflex',
bonitz_pipeline/diacritic_sweep.py:56:    '̃': 'circumflex',  # combining tilde, same printed mark
bonitz_pipeline/diacritic_sweep.py:69:    return unicodedata.normalize('NFD', w).replace('̃', '͂')
bonitz_pipeline/smyth_sweep.py:70:ROUGH, SMOOTH = '̔', '̓'
bonitz_pipeline/smyth_sweep.py:71:ACUTE, GRAVE, CIRC = '́', '̀', '͂'
bonitz_pipeline/smyth_sweep.py:72:CIRC_ALT = '̃'                      # combining tilde, same printed mark
```

The other whole-tree U+0303 uses follow the same pattern:

```text
bonitz_pipeline/expand_ligatures.py:49:    '̃': '͂',  # tilde          → circumflex
bonitz_pipeline/normalize.py:207:_CHAR_FOLDS['̃'] = '͂'
bonitz_pipeline/john_rulings.py:85:    got = fold(unicodedata.normalize('NFC', (s or '').replace('̃', '͂')))
```

U+0313 and U+0314 map to smooth and rough respectively, matching their Unicode names and the corpus counts of 771 and 93. U+0342 serves as the main circumflex throughout.

What this changes: the defect appears confined to `kraken_eval.PROBES`; the sweeps do not repeat it.

5. The 32 U+0303 occurrences occupy 22 page:line sites, all on pages 104–105.

```text
page-104-L:15
page-104-L:20
page-104-L:30 x2
page-104-L:33
page-104-L:55
page-104-L:58
page-104-L:60
page-104-R:2
page-104-R:8
page-104-R:9
page-104-R:13
page-104-R:17
page-104-R:21 x6
page-104-R:41 x2
page-104-R:55 x2
page-104-R:61
page-105-L:21 x2
page-105-L:23
page-105-L:26
page-105-L:28 x2
page-105-L:43
page-105-L:50
distinct page:lines 22 occurrences 32
```

What this changes: none of the round-6 holdout pages contains U+0303, which explains the shipped probe’s 0/0 result.

6. Test gate blocked.

```text
error: Failed to initialize cache at `/Users/johnboyer/.cache/uv`
  Caused by: failed to open file `/Users/johnboyer/.cache/uv/sdists-v9/.git`: Operation not permitted (os error 1)
```

Verdict: “do not retrain Calamari” is now unsupported. A valid measurement exists, but it shows the current Calamari ensemble behind Kraken and supplies no measured complementary strength. It does not prove retraining will help; it removes the evidence used to rule retraining out.

Codex session ID: 01a02afc-68b7-78f0-ab40-aa7dfb002586
Resume in Codex: codex resume 01a02afc-68b7-78f0-ab40-aa7dfb002586
