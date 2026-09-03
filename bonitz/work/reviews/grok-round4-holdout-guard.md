# Grok adversarial review — round-4 holdout guard

sessionId: 019ff38d-e5ae-71a3-84cf-0f8ec429c62f

---

I'll attack this as a read-only adversarial review: read the three files under review, the holdout/split/compile paths, and the tests, then try to break the guards with concrete failure scenarios.Next I'll trace every path into training and every place the guards can be skipped or satisfied without looking.Checking one more wiring gap and whether `stage_split` can be made to put a holdout into train without the unit-tested guards firing.# Adversarial review: kraken holdout guards

**Verdict on the claimed defect:** For the path that matters — `split` writing `train.txt`, then `compile` building `train.arrow` — a held-out column under a normal stem **cannot** reach training without a refusal. That part is sound. The old failure mode (Python constant + `stage_split` rewriting `holdout.txt`) is closed.

What remains are residual paths *around* those gates, weak spots in what is *not* checked, and tests that do not pin the wiring you think they pin.

All findings below are from reading the code and small read-only probes (including the test run: **17 passed**).

---

## CONFIRMED — ranked by severity

### 1. Medium — `train.arrow` is never checked against the ruling

**What is gated:** `train.txt` at `compile` time (and at `split` write time).

**What is not:** the artifact training actually consumes.

Training is outside this module:

- `work/kraken/train.sh` / `resume.sh` / `train96.sh` → `ketos train … train.arrow`
- ad-hoc `ketos train -f binary train.arrow`

None of that calls `refuse_holdout_in_training`.

**Failure scenario:**

1. Before this change (or via hand `ketos compile` of a bad list), `work/kraken400/train.arrow` was built while `page-055-L` (etc.) were in training.
2. This fix lands; ruling JSON is correct; tests pass.
3. Operator runs `ketos train` on the **existing** arrow without `split` + `compile`.
4. Model trains on held-out pages. No guard runs.

Same shape after the fix: correct `split` rewrites `train.txt`, operator forgets `compile`, trains on the old arrow.

**Why this is not a false alarm:** the comment on `stage_compile` says it is “the last gate before ketos sees a single line,” but that is only true for **`ketos compile`**. Recognition training never re-enters this module.

Current on-disk `train.txt` / `holdout.txt` look clean (82 / 12, empty intersection). That does not make the **path** safe for a stale or out-of-band arrow.

---

### 2. Medium — `compile` only polices train membership, not that the holdout *is* the ruling

`stage_compile` checks:

1. both lists exist and are non-empty  
2. `refuse_holdout_in_training(train)`  
3. `train ∩ holdout` (file ∩ file) is empty  

It does **not** check:

- `set(holdout.txt) == set(ruling) ∩ corpus`  
- every ruled column is in `holdout.txt`  
- `holdout.txt` is a subset of the ruling  

**Failure scenario (hollow evaluation, not train leak):**

```text
train.txt    = page-015-L   # clean w.r.t. ruling
holdout.txt  = page-016-R   # not a ruled holdout column
```

Then:

```text
python -m bonitz_pipeline.kraken_corpus compile --work <that-tree>
```

Probed: **succeeds**, ketos would be invoked twice. Train is not contaminated; scoring is not on John’s twelve.

**Failure scenario (partial undo of the hand-edit, still “green”):**

1. Stale `train.txt` still omits 055/061 (good).  
2. `holdout.txt` was trimmed back to the round-3 eight only.  
3. `compile` succeeds.  
4. Round-4 pages are neither trained nor evaluated — independence is preserved only in the weak sense “not in train,” not “scored on the ruled pages.”

The original defect was train contamination; this is a different failure mode, but it is real and the compile gate advertises more than it does.

---

### 3. Low — exact string match; case-mismatched stems bypass refuse on this volume

`refuse_holdout_in_training` does `set(holdout_columns()) & set(train)` with no normalisation.

Probed on this machine (APFS, case-insensitive):

- `page-055-l` is **not** caught by refuse  
- `work/kraken400/gt/page-055-l.xml` **opens** the real `page-055-L.xml`  

**Failure scenario:**

1. Hand-edit `train.txt` to list `page-055-l` (wrong case).  
2. `compile` → refuse passes.  
3. `ketos compile … ../gt/page-055-l.xml` opens the held-out GT via the FS.  
4. Contaminated `train.arrow`.

`stage_split` will never emit wrong case (stems come from pairing/reconciled). This only matters for **hand-edited** lists on a case-insensitive FS. Correct-case hand-edits (`page-055-L`) **are** refused — that path is sound.

Same shape for BOM-prefixed first token or `page-055-L.xml`: refuse misses; ketos usually fails on a bad path (BOM / double `.xml`), so those are weaker than case.

---

### 4. Low — missing ruled columns in the corpus are only a warning

```469:485:bonitz_pipeline/kraken_corpus.py
    missing = sorted(set(ruled) - set(usable))
    if missing:
        print(f'⚠ {len(missing)} held-out column(s) are not in this corpus '
              ...
    ...
    if not holdout:
        raise HoldoutError(...)
```

Refusal only when **zero** held-out columns survive pairing.

**Failure scenario:**

1. `page-055-L` quarantined (`match: false`); 055-R and both 061 columns match.  
2. `split` warns, writes train without 055-L, holdout without 055-L.  
3. Build continues.  
4. “Pages 55 and 61 **entire**” is not met for evaluation; train is still clean of those stems.

Not train contamination; it does mean the ruling’s “entire page” intent is not enforced as a hard gate.

---

### 5. Low — structural JSON errors fail closed, but not as `HoldoutError`

Probed:

| Input | Result |
|--------|--------|
| `"columns": null` | `TypeError` |
| `[{}]` (no `column`) | `KeyError` |
| missing file / `[]` / bad stem / dupe | `HoldoutError` |

Still blocks training (uncaught exception → non-zero exit). Not the “answered nothing without looking” shape. Only matters if a caller catches bare `Exception` and continues — this CLI does not.

---

## Sound (explicit)

| Mechanism | Assessment |
|-----------|------------|
| `holdout_columns()` missing / empty / bad stem / duplicate | Fails closed; empty ≠ clean |
| `stage_split` selection (`train = usable − ruled`) | Cannot put a ruled stem that is in `usable` into `train.txt` |
| `refuse` at `compile` vs live ruling | Catches stale/hand-edited `train.txt` with normal stems (the bug you fixed) |
| `WORK` / `--work` | Only moves corpus tree; ruling stays `ROOT/work/rulings/kraken-holdout.json` (intentional) |
| `--only` | Affects cols/segment/pair only; split reads full `pairing.json`; pair-without-holdouts → empty surviving holdout → refuse |
| Partition + refuse inside `stage_split` | Redundant with current selection; defense-in-depth if selection is later rewritten |
| Trailing newlines / blank lines in `*.txt` | `.split()` is fine for stems written by `stage_split` |

I did **not** find a path where a correctly spelled ruled stem in `train.txt` reaches `ketos compile` through `stage_compile`.

---

## Tests that cannot fail (under the mutations that matter)

### If `refuse_holdout_in_training` body becomes `return`

| Test | Still passes? | Why |
|------|----------------|-----|
| `test_a_held_out_column_in_training_is_refused` | **No** | Direct |
| `test_every_ruled_column_is_refused_individually` | **No** | Direct |
| `test_compile_refuses_before_ketos_sees_anything` | **No** | Only refuse blocks `page-042-R` in train |
| `test_a_clean_training_set_passes` | **Yes** | Happy path only |
| All ruling / dossier pins | **Yes** | Data, not guard |
| Empty/malformed ruling tests | **Yes** | Hit `holdout_columns` |
| All `stage_split` tests | **Yes** | Assert selection outcome; selection still correct |
| Partition unit tests | **Yes** | Other function |
| `test_compile_refuses_lists_that_share_a_column` | **Yes** | Shared-list check, not refuse |
| `test_compile_refuses_a_missing_or_empty_list` | **Yes** | Empty/missing files |

So the compile integration test and the two refuse unit tests are the real refuse net. Everything else is compatible with a neutered refuse.

### If `check_partition` body becomes `return`

Only the two partition failure unit tests die. **No `stage_split` test fails**, because current selection always builds a valid partition — those tests never force `check_partition` to fire through `stage_split`.

### Wiring deletion (related, stronger than body-`return`)

Removing only these lines from `stage_split`:

- `check_partition(...)`  
- `refuse_holdout_in_training(train, 'split')`  

…with function bodies left intact: **the full file still passes.**  
Refuse at compile and the partition unit tests remain; split’s own defense-in-depth is unenforced by tests.

### Data tests that never exercise a guard

- `test_the_ruling_on_disk_is_johns_twelve`  
- `test_pages_55_and_61_are_held_out_entire`  
- `test_the_ruling_matches_the_dossier`  

Last one is especially weak: only asserts substrings `055-L` … `061-R` appear in `HOLDOUT-53-62.md`. It does not pin the twelve, does not require those strings to mean “held out,” and still passes if refuse is deleted.

### Mutations you already bit (agree)

- Nulling `leaked` → refuse unit tests + compile leak test fail.  
- Deleting round-4 columns from the ruling → `test_the_ruling_on_disk_is_johns_twelve` / `test_pages_55_and_61…` fail.

### Mutation worth trying that you did not mention

- Delete **only** the `refuse_holdout_in_training(...)` call inside `stage_compile` (keep the function): `test_compile_refuses_before_ketos_sees_anything` should fail; that is the load-bearing compile wiring test.  
- Delete **only** the same call inside `stage_split`: suite still green (see above).

---

## Ruling file fragility

Code depends on:

- top-level `columns` array  
- each element’s `column` string  
- non-empty, unique, `^page-\d{3}-[LR]$`

Ignored (no validation): `round`, `ruled`, `source`, `why`, `_`, `why_whole_columns`.

**Edit that weakens the holdout in production without a `HoldoutError`:**

1. Remove `page-055-L` (or any subset) from `work/rulings/kraken-holdout.json`.  
2. Run `split` / `compile` without tests.  
3. That column enters training; the pipeline is happy.

If tests run, `test_the_ruling_on_disk_is_johns_twelve` fails. The exact twelve are **test-pinned**, not **runtime-pinned**. That matches “ruling is data,” but it means an accidental edit is only caught when the suite is run.

There is **no** edit that both (a) puts a currently ruled column into training and (b) keeps the current test file green, short of also changing `RULED` in the test — the pin is tight for the column list.

Metadata-only edits do not weaken the holdout and do not fail tests.

---

## Bottom line

| Claim | Result |
|-------|--------|
| Can a held-out stem still reach `train.txt` via `stage_split`? | **No** (selection + optional refuse) |
| Can it reach `ketos compile` via `stage_compile` under normal stems? | **No** (`refuse` on live ruling) |
| Can it still reach **training**? | **Yes**, via pre-existing or out-of-band `train.arrow` / raw `ketos compile` — outside these gates |
| “Check answered nothing without looking”? | **Not in `holdout_columns` / `refuse` for the empty-ruling case** — those refuse. Closest relative: compile success with a non-ruling `holdout.txt` (looked at train, never checked holdout against ruling) |
| Guard tests load-bearing for refuse? | **Three** (two unit + compile leak); several others cannot catch a neutered refuse |

I would not invent a silent train-leak through `split`/`compile` for ordinary stems. I would treat **(1) arrow never re-checked** and **(2) compile’s one-sided check** as the real residual holes, and the test gaps around split wiring / dossier substring as confidence limits, not as open contamination bugs.
