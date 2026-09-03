# Handoff: the flag stream loses word and line boundaries, and three modules pay for it

Hand this whole file to a fresh session. It is self-contained. Everything here
is a **code** task with a reproducible failure and a machine-checkable success
condition. Nothing here requires reading the 400 dpi scans or judging Greek.

    repo    /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz
    branch  main
    tip     e2beb5f

⚠ **ALL COMMITS GO TO THE PRIVATE REPO ONLY.** `GIT_DIR=~/Developer/bonitz-text.git`.
This worktree shares a directory with the aristotle-reader site; committing to
the wrong repo mixes two projects.

⚠ `uv run pytest` IS BROKEN — pytest is not a declared dependency. Use
`uv run --with pytest pytest`. Some tests also want `--with pyarrow --with pillow`.
Baseline before you start: **1853 pass, 2 skip**. Do not finish below that.

⚠ Clear `__pycache__` before trusting a mutation test: a same-length edit
restored inside one filesystem second keeps the stale `.pyc`.

---

## The one defect underneath all three tasks

`bonitz_pipeline/compare3.build_spine` + `normalize.canonical` produce the
stream that `batch4` diffs across four readers. That stream has **whitespace
and newlines removed**. Disagreement regions are recorded as `spine_off`, an
integer offset into it.

Consequently a region can begin in one word and end in the next, or begin on
one printed line and end on the following one. Measured on pages 63-102:

* **32 of 80** adjudication cards spanned a word boundary. One asked about an
  elision apostrophe and the next word's breathing *as a single question*.
* **1 of 80** spanned a line boundary: the region ran from `820b5.` at the end
  of page-072-L line 41 into `(ὑγίεια` at the start of line 42.

A human ruling is an answer about a **word**. Splicing a word-level answer into
a token-level span writes nonsense. On 2026-08-17 the seven adjudicated edits
for pages 63-102 were therefore applied at line level by hand rather than
through `reconcile.py`, and that is why the module is currently unused for the
new pages. See §9 of `BONITZ_HANDOFF.md` and `work/audit/rulings-063-102.tsv`.

---

## Task 1 — `filter_kraken_lines.py` rule 4 eats real lines at the head

**File:** `bonitz_pipeline/filter_kraken_lines.py` (291 lines)

Rule 4 drops "a short stub at head or foot set off by a gap > 1.15× median
lead". At the **foot** that is right: it is the printer's signature (the volume
mark `V.` for Band V of the Berlin Aristotle, on an exact 8-page gathering
interval). At the **head** it is wrong often enough to matter, because Bonitz's
citations run across the column break and a continuation line is legitimately
short.

**Reproducible failure**

```
page-090-R line 1 is `364a29.`
page-090-L line 61 ends `ἀποβιασθείς μβ6.`
```

`μβ6.` is a citation with no Bekker number; `364a29.` is its other half. The
filter dropped it under `head_short`, leaving 60 lines where the column has 61.
It is the **only** line-count disagreement between Opus and kraken across all
80 columns of pages 63-102.

**What to do**

The two cases are not symmetric and the rule treats them as if they were. A
foot stub completes nothing. A head stub completes the previous column, which
the filter does not currently read.

Either give the filter the previous column's last line and keep the drop only
when the head stub does *not* continue it, or — if that plumbing is too
invasive — **report `head_short` and stop dropping it**. Reporting a phantom is
cheap; deleting a real line is not, and nothing downstream notices.

**Acceptance**

1. Re-running the filter over `work/kraken400/read/alto-r5` for pages 63-110
   yields **96 of 96 columns at 61 lines** (currently 95 of 96).
   ```
   uv run --with pillow python -m bonitz_pipeline.filter_kraken_lines \
     --alto-dir work/kraken400/read/alto-r5 \
     --txt-dir  /tmp/txt-r5-check \
     --cols-dir work/kraken400/read/cols \
     --pages 63-110 --target 61 --report /tmp/filter-check.json
   ```
2. `page-090-R` line 1 is `364a29.` in the output.
3. Foot signatures are STILL dropped: no column in 63-110 ends with a bare
   `V.` or a single Latin capital.
4. A new test in `tests/` covers both directions — a head stub that continues
   the previous column is kept, a foot stub is dropped.
5. Full suite ≥ 1853 pass, 2 skip.

**Blast radius:** `bonitz_pipeline/filter_kraken_lines.py` and a new test file.
Do not modify anything under `work/`; write check output to `/tmp`.

---

## Task 2 — `batch4` should record where a region actually is

**File:** `bonitz_pipeline/batch4.py` (162 lines), and whatever it calls in
`compare4`.

Each flag record currently carries `page`, `col`, `spine_off`, `ctx`,
the four readings, `cls`, `vote`, `flag`, `citation`. To locate a region on the
page a consumer must re-derive `canonical(clean_opus(column_text))`, find `ctx`
in the stream, and walk the offset table back — which is exactly what went
wrong this session, twice.

**What to do**

Add to every emitted record:

* `line` — 1-based printed line number of the **start** of the region
* `line_end` — printed line of the end (equal to `line` in the normal case)
* `char` — 0-based character offset of the region start **within that printed
  line of the cleaned Opus text**
* `word` — the whitespace-delimited word of the cleaned line containing the
  region start
* `spans_word` — bool, true when the region crosses a space
* `spans_line` — bool, true when `line_end != line`

`canonical()` already returns `(stream, offsets)` where `offsets[i]` is the
index of `stream[i]` in `NFC(cleaned)`. That is all you need; do not invent a
second alignment.

**Acceptance**

1. Re-running `batch4 63-99` and `batch4 100-102` reproduces the same region
   count as the committed output — **3,869 and 374 regions** — with the new
   fields present on every record.
2. For every record, `cleaned_line[char : char+len(opus)]` equals `opus`
   whenever `spans_word` and `spans_line` are both false. Assert this over the
   whole output; it must hold for every such record with no exceptions.
3. Known-good spot checks:
   ```
   page 69, col L, opus 'ȣ͂'      -> line 56, word 'χαλκȣ͂'
   page 72, col L, opus '.12.(ὑ' -> spans_line True
   page 90, col L, opus "'αὐ"    -> spans_word True, word 'αὐτό,'
   ```
4. `spans_word` is true for 32 of the 80 diacritic cards' regions and
   `spans_line` for 1. (The card set is derivable; if your count differs,
   say so rather than adjusting the number.)
5. Full suite ≥ 1853 pass, 2 skip.

**Blast radius:** `bonitz_pipeline/batch4.py`, `compare4.py`, new tests.
Regenerate `work/flags4-*` only if you are confident; otherwise write to `/tmp`
and report the diff. Do not touch `work/reconciled/` or `raw/`.

---

## Task 3 — `reconcile.py` must refuse what it cannot safely splice

**File:** `bonitz_pipeline/reconcile.py` (183 lines)

It converts `spine_off` to a column-local position and replaces the span with
the verdict. It already has one guard — a region running past the column end
goes to the human queue as `cross-column` — but nothing stops it splicing a
verdict into a span that crosses a word or line boundary *inside* the column.

Given Task 2's fields, this is a small change with a large payoff.

**What to do**

* When `spans_word` or `spans_line` is set, do **not** splice. Route the
  verdict to the human queue with `confidence: 'spans-boundary'`, exactly as
  `cross-column` is handled now.
* Accept a **word-level** verdict as well as a token-level one: if the verdict
  equals a whole word of the line, replace that word rather than the recorded
  span. This is the form a human ruling actually takes — see
  `work/audit/rulings-063-102.tsv`, where the answers are `καρπȣ́ς`, `αὑτὸ`,
  `ἄντικρυς.`, `μεταβλητική`.

**Acceptance**

1. Given the seven rulings in `work/audit/rulings-063-102.tsv`, `reconcile`
   reproduces `work/reconciled/page-*.txt` for pages 63-102 **byte for byte**
   against what is committed at `e2beb5f`. This is the whole test: the correct
   answer already exists in the repo, produced by hand.
2. A region with `spans_word` never edits text; it appears in the queue.
3. `tests/test_reconcile_matching.py` and `test_reconcile_freshness.py` still
   pass unmodified.
4. Full suite ≥ 1853 pass, 2 skip.

**Blast radius:** `bonitz_pipeline/reconcile.py`, new tests. **Never write to
`work/reconciled/`** — that is the corpus, and it is correct as committed.
Compare against it; do not regenerate it in place.

---

## Rules that bind this work

1. **Diplomatic transcription.** The corpus records what the compositor
   printed, errors included. No task here changes text; if one seems to, stop
   and report rather than "fixing" Greek.
2. **Surgical changes.** Touch only what the task requires. Do not refactor
   working code, do not restyle, do not "improve" neighbouring functions.
3. **A test before a fix.** Each task names a reproducible failure. Write the
   test that reproduces it, then fix, then run the test.
4. **Report uncertainty as uncertainty.** If an acceptance number does not come
   out as stated, say so with the number you got. Do not adjust the code until
   it matches a number in this document — the document may be wrong, and a
   silent accommodation destroys the evidence.
5. **No silent caps.** If you skip a case, log it.

## What is NOT in scope

* The 23 `alphacheck` order violations, and every other sweep finding. Those
  are questions for the 400 dpi ink and for Bonitz's conventions.
* Anything under `work/reconciled/`, `raw/opus/`, `work/audit/`.
* Retraining, re-reading, or regenerating training targets.
