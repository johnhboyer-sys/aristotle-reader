# Round 2: the boundary guard is right, its ordering is not

Follows `HANDOFF-GPT-offsets.md`. Reviewed commit `e0048a0` on top of `e2beb5f`.
Grok audited it; three High findings are confirmed against the code.

⚠ **My earlier acceptance numbers were WRONG and you were right to report the
mismatch.** `HANDOFF-GPT-offsets.md` said 32 word-spanning and 1 line-spanning.
An independent recount gives **32 word-spanning and 3 line-spanning** (pages
63-L, 84-R, 96-L); Grok counted 33 and 4. Three answers, no agreement. **Do not
treat any of them as a target.** Measure, report the number you get, and say how
you derived the card set — the disagreement is probably in that derivation, not
in the data.

---

## The contract, now decided

The previous brief said "a `spans_word` record must never edit text" and also
"all seven edits apply". Those conflict, which is my error. The rule is:

1. **`spans_line` is a hard refusal.** Always queue. An edit across a printed
   line cannot be made mechanically.
2. **`spans_word` is NOT a refusal when the verdict names a whole word.**
   Attempt whole-word replacement FIRST, and refuse only if it cannot be
   verified. This is the whole point of the word scoping: a human ruling is an
   answer about a word, and a region that straddles a space is exactly the case
   the word-level path exists to serve.
3. Verification before replacing, unchanged from `e0048a0`: locate the word
   boundaries around the region start, and refuse as `word-mismatch` if the text
   there is not the recorded `word`.
4. Everything else still queues.

So the order becomes: cross-column → `spans_line` → whole-word attempt →
`spans_word` refusal → token splice.

## Task A — reorder the guard

`bonitz_pipeline/reconcile.py`, currently lines ~168-210. The `spans_word` /
`spans_line` check `continue`s before the whole-word branch at ~193, so no
spanning record can ever reach it. Split the two conditions and move the
word-level attempt above the `spans_word` refusal.

## Task B — the acceptance test must use the real file

`tests/test_reconcile_rulings_063_102.py` hardcodes a `RULINGS` literal, never
opens `work/audit/rulings-063-102.tsv`, forces `spans_word=False` and
`spans_line=False` on every synthetic flag, and shortens the real `opus` values
(card 61 `όπκα` → `ό`; card 77 `ὴΠ` → `ὴ`).

That test cannot fail for the reason the guard exists. Rebuild it to:

* read the verdicts from `work/audit/rulings-063-102.tsv`
* build flag records from the real comparison regions, with real `opus` strings
  and real boundary fields
* assert byte-for-byte equality with `work/reconciled/page-*.txt` at `e2beb5f`

⚠ **If it cannot reproduce those columns, that is the finding — report it.** Do
not adjust the fixture until it passes. The committed corpus is correct; it was
produced by hand and verified line by line.

### The two hard cases, stated plainly

```
card 61  page-078-L:6   opus 'όπκα'  word 'αὑτό'  TSV verdict 'αὑτὸ'
card 77  page-063-L:44  opus 'ὴΠ'    word 'μεταβλητικὴ'  TSV verdict 'ή'
```

Card 61 works under the new contract: the verdict is the whole word.

**Card 77 does not, and the TSV is what is wrong.** `ή` is a button value, not a
word. The corpus edit John actually ruled is `μεταβλητικὴ` → `μεταβλητική`.
Fix the TSV row to carry the word-level verdict `μεταβλητική`, note the change
in the file's header comment, and say so in your report. Do not special-case it
in code.

## Task C — `_continues_previous` does not test continuity

`bonitz_pipeline/filter_kraken_lines.py:134-136, 219-225`. It matches
`^\d{2,4}[ab]\d+` on the head and only checks that the previous line is
non-empty. So a Bekker-shaped phantom after any line is kept, a short
continuation of another shape is dropped, and the first column of a run keeps
every short head because `previous_line is None`.

**Take the safe fallback from the original brief: report `head_short` and never
drop it.** Deleting a real line is unrecoverable and silent; keeping a phantom
is visible and cheap. If you would rather implement real continuity, it must
read the previous column's last line and prove the join, and it must be tested
on a non-Bekker continuation.

Also fix the stale-state bug: when a column is skipped for missing ALTO or PNG,
set `previous_line = None` rather than carrying the last successful column's.

## Task D — the source-slice invariant is false as advertised

`bonitz_pipeline/compare4.py:67-106` documents
`cleaned_line[char:char+len(opus)] == opus`, and it fails on **89** non-boundary
records: 76 typographic apostrophes (`’` vs canonical `'`) and 13 Latin/Greek
folds (`o`/`ο`, `I`/`Ι`). `char` indexes cleaned NFC text; `opus` is canonical
folded text.

Either emit a raw NFC slice alongside, or restate the invariant in folded terms
and test it that way. Whichever you choose, the docstring and the test must
agree with the code — an invariant that is documented and false is worse than
none, because the next consumer will rely on it.

## Tests to add

* `previous_line=None` on the first column
* a non-Bekker short continuation
* a Bekker-shaped phantom that should be dropped
* skipped-column stale state
* the full 96/96 columns-at-61 check for pages 63-110
* `compare4.compare()` called for real, not hand-built records
* empty `opus`, insertion at column end, width-changing folds
* card 61 as a real boundary fixture: `opus='όπκα'`, `word='αὑτό'`,
  `spans_word=True`, `verdict='αὑτὸ'` — it must APPLY under the new contract

## Rules

Baseline `uv run --with pytest pytest` (add `--with pyarrow --with pillow` where
needed) must not fall below **1853 pass, 2 skip**. Commits go to
`GIT_DIR=~/Developer/bonitz-text.git` only. **Never write to
`work/reconciled/`** — it is the corpus and it is correct; compare against it.
Report any number that comes out differently from this document rather than
making the code match it.
