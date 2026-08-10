=== grok delegate result ===
mode:    read-only (plan)
effort:  high
stop:    end_turn
session: 019fe917-a8b9-7240-9746-62c205c0506a

I'll adversarially review the post-review work: read the pipeline modules, tests, and the data artifacts you named, then attack Q1–Q6 with evidence.Next I'll verify the six corpus edits in git and inspect the corrigenda, ledger, and critical line for the ambiguous 679→673 case.Digging into the ambiguous page-vs-letter cases, book-span derivation, candidate ranking, and the epoch comparison claim.# Adversarial review — afternoon work after the two earlier reports

Read: `book_apply.py`, `book_review.py`, `book_spans.py`, `siglum_review.py`, `checkpoint_compare.py`, `siglum_check.py` (via imports), the four named tests, `work/sigla/book-spans.json`, `work/corrigenda/entries.json`, `work/rulings/john.json`, `work/sweeps/book-rulings.json`, the six reconciled diffs in `af730a842`, train log metrics, and live candidate/anchor simulation. No files edited.

---

## Ranked findings (worst first)

### 1. Corrigenda `correct` fields assert a policy, not a case-by-case judgment (Q2) — many of the 21 are contestable

**File:** `bonitz_pipeline/book_apply.py:119–131` (template), `work/corrigenda/entries.json:59–289`

Every preserve gets the same authority:

> “The page is taken as the sound member … so the correction moves the letter.”

John’s ink ruling only settles **what is printed**. The revised-edition `correct` is a separate claim. It is not defensible as a blanket rule.

**16 of 21 preserves** admit a one-digit page change that would put the page inside the **named** book’s span (letter right, page wrong). Strongest near-boundary cases:

| Site | Printed | Named span | Page | One-digit pages that validate the **letter** |
|------|---------|------------|------|-----------------------------------------------|
| `page-016-L:8:ηεδ:1231` | ηεδ … 1231 | δ 1234–1246 | 1231 (3 off) | 1234–1239, 1241 |
| `page-052-R:16:Ρβ:1407` | Ρβ … 1407 | β 1378–1404 | 1407 (3 past) | 1400–1404 |
| `page-039-R:53:Πη:1318` | Πη … 1318 | η 1323–1337 | 1318 (5 off) | 1328 |
| `page-049-L:8:Μβ:1008` | Μβ … 1008 | β 995–1003 | 1008 (5 past) | 1000–1003 |
| `page-027-L:57:Ηγ:1126` | Ηγ … 1126 | γ 1109–1119 | 1126 | 1116 |
| `page-028-L:12:Ζμγ:688` | Ζμγ … 688 | γ 661–676 | 688 | 668 |
| `page-020-L:54:Πδ:1279` | Πδ … 1279 | δ 1288–1301 | 1279 | 1289, 1299 |
| `page-038-L:34:Ηι:1129` | Ηι … 1129 | ι 1163–1172 | 1129 | 1169 |
| `page-049-L:24:Ζιθ:575` | Ζιθ … 575 | θ 588–608 | 575 | 595 |
| `page-015-R:7:κ:1050` | κ … 1050 | κ 1059–1069 | 1050 | 1059, 1060 |

Those are exactly the sites where a compositor (or reader) one-digit slip is as plausible as a wrong book letter. Banking “always move the letter” into the revised edition without a per-line argument is the softest part of the afternoon’s work.

**Secondary defect in the same entries:** bare inherited letters get a stem stuffed into `correct`:

- `κ1. 1050` → `Μθ1. 1050` (`entries.json:74–75`) — inserts `Μ` the ink never had  
- `η4. 1276` → `Πγ4. 1276` (`entries.json:96–97`) — inserts `Π`

That comes from `repair(..., 'fix-letter', f.owner)` using `f.stem + detail` (`book_apply.py:63`, `122`). Fine as a fully expanded citation; wrong as “what the printed form should become.”

**Could not break:** the 21 preserves as **transcription** decisions (ink matches held text). The defect is the corrigenda target, not the diplomatic hold.

---

### 2. Checkpoint classifier systematically mis-buckets the errors it was built to expose (Q5)

**File:** `bonitz_pipeline/checkpoint_compare.py:52–98, 119–132`

#### (a) Breathing errors are asymmetric

Classifier uses the class of the **expected** character:

| Confusion | Class assigned | Reality |
|-----------|----------------|---------|
| ἀ → α (drop breathing) | `breathing` | counted |
| α → ἀ (add breathing) | `greek letter` | **hidden** |
| α → ά (add accent) | `greek letter` | hidden under base letter |

So the headline “e10 is worst on breathings” only measures **gold-has-breathing** failures. Gold-bare + model-adds-breathing never enters that bucket. That undercuts any e10-vs-e22 decision that rests on the breathing column alone.

#### (b) Ligature checks run **before** mark checks (`checkpoint_compare.py:75–80`)

```text
'ȣ' in expected  → ou-ligature   # before marks
'ϗ' / 'ϛ'        → kai / stigma
```

So `ȣ̓` (ou + smooth) is always `ou-ligature ȣ`, never `breathing`. The module docstring’s own worry — “missing every breathing over an ou-ligature” — is filed under ligature, not breathing.

#### (c) Greek **punctuation / spacing diacritics** classified as `greek letter`

Because `re.fullmatch(r'[Ͱ-Ͽἀ-῿]', …)` covers the whole Greek block:

| Character | Unicode | Classified as |
|-----------|---------|---------------|
| ᾿ GREEK PSILI | U+1FBF | greek letter |
| ῾ GREEK DASIA | U+1FFE | greek letter |
| · GREEK ANO TELEIA | U+0387 | greek letter |
| ; GREEK QUESTION MARK | U+037E | greek letter |
| ʹ GREEK NUMERAL SIGN | U+0374 | greek letter |

Any ketos row whose expected side is one of those names is mis-assigned.

#### (d) `spurious *` does **not** double-count

`checkpoint_compare.py:128–132` **reclassifies** space→nonspace rows; it does not add a second count. `by_class` totals still match confusion-table rows. That part is sound.

#### (e) Insertions of precomposed letters are mislabeled

`{ } - { ἀ }` → `spurious breathing` (whole letter+breathing insertion treated as a mark hallucination). Real “invented combining grave” and “invented ἀ” land in the same bucket.

**Bottom line for Q5:** the Unicode-name fix (`as_char`) is real and necessary. The class table still lies in systematic ways that bias the breathing and ligature columns — exactly the columns used to prefer a later epoch.

---

### 3. “e22 over e10 because spaces are cheap and breathings are free” does not hold (Q6)

**Evidence actually read:**

- Train log `work/kraken400/train96-round3b.log`:  
  - epoch 10: `val_accuracy 0.992`, **`val_word_a 0.953`**  
  - epoch 22: `val_accuracy 0.992`, **`val_word_a 0.947`**  
  (matches your 95.31 vs 94.66 within rounding / ketos-vs-train metric)
- Trainer itself: *“Converting best model … checkpoint_10-0.9920.ckpt”*
- `best_0.9920.safetensors` MD5 ≠ `round3-e22-0.9920.safetensors` (e22 is a later manual export)
- Commit `62b737b3b` argues e10 is worst of the **top four on breathings vs epoch 15** (44 vs 36). It does **not** show e22 beats e10 on that table.

**Attacks on the reasoning:**

1. **“Nothing catches a dropped breathing” is false in this repo.**  
   `bonitz_pipeline/breathing.py:1–9` exists specifically because lexcheck strips diacritics and breathing is the signal it recovers. You also have diacritic sweeps and the diplomatic/ledger path. Costly, noisy, not “nothing.”

2. **Word-accuracy gap is not “mostly spaces.”**  
   Word accuracy fails on any wrong character inside a token. A 0.6pp gap at ~95% is many holdout words. Without a class split of *word* failures, blaming spaces is a guess.

3. **Lexical checks do not cleanly rescue e22.**  
   - Space errors that yield two still-lexical Greek words stay invisible.  
   - Breathing errors where both forms are lexical (common) need `breathing.py`, not the bare lexicon — and that checker is deliberately conservative (STRONG/WEAK, LSJ vs TLG).  
   So “spaces are free, breathings are fatal” overstates both sides.

4. **The class metric used to demote e10 is the same metric that mis-buckets breathings (finding 2).**  
   Preferring e22 on a biased breathing column is circular.

5. **Char accuracy is tied (0.9920).**  
   The only hard number that differs is word accuracy, and it favors e10. Choosing e22 needs a class table that actually names e22 — not e15 — as the breathing winner. I did not find that table saved in-repo.

**Could not fully break:** the *idea* that aggregate accuracy is too coarse. That stands. The specific “e22 > e10” conclusion is under-evidenced.

---

### 4. Frequency ranking promotes the wrong candidate on known error modes (Q4)

**File:** `bonitz_pipeline/siglum_review.py:107–120, 174–175`

Live queue (`sites()` → 29 cards):

| Token@page | Offered (freq order) | Likely right | Rank of right |
|------------|----------------------|--------------|---------------|
| `πκς@946` | **πκγ(17)**, πκϛ(13), πκη(9), πκθ(9) | πκϛ (ς→ϛ) | **2nd** |
| `πκς@944` | same | πκϛ | **2nd** |
| `κς@946` | **κε(3)**, κζ(2), κϛ(2), κα(1) | κϛ | **3rd** |
| `ΓΒ@331` | **Γα(29)**, Γβ(17), Γ, Γγ | Γβ (case) | **2nd** |
| `Ζυ@616` | Ζιι(100), Ζι(1) | Ζιι | 1st (frequency helps) |

The test only asserts `πκϛ in got` (`tests/test_siglum_review.py:93–98`), not that it leads. The docstring’s own story — alphabetical order cut πκϛ off the row — is fixed, then recreated as “frequent near-miss leads.”

Self-reference is real: a form the misreader produces often (or a sibling book letter Bonitz uses often) outranks the visually tighter repair. `MAX_CANDIDATES = 4` still keeps πκϛ visible here; κϛ is one more wrong button away from the edge.

---

### 5. Latent `fix-page` bug: `replace(page, detail)` hits chapter digits first (Q1 latent)

**File:** `bonitz_pipeline/book_apply.py:64–65`

```python
return printed.replace(str(f.page), str(detail), 1)
```

Demoed:

```text
line   'foo Ζμγ12. 12 bar'
anchor 'Ζμγ12. 12'
becomes 'Ζμγ13. 12'   # chapter 12 rewritten, page untouched
```

**Not triggered** on today’s only fix-page (679→673). Still a landmine for any future page==chapter-digit citation.

---

### 6. Q1 main case: the six corpus edits — **could not break**; 028-R proved

**Commit:** `af730a842` — exactly six lines, one character each; nothing else in those files moved.

| Edit | Before → after | Why right |
|------|----------------|-----------|
| 025-L:23 | Ηκ2. 1095 → **Ηα**2. 1095 | EN α = 1094–1103 |
| 040-R:43 | Ηκ1. 1095 → **Ηα**1. 1095 | same |
| 044-L:5 | Ηκ8. 1098 → **Ηα**8. 1098 | same |
| 029-L:20 | Ζιθ7. → **Ζιδ**7. (page 532 on next line) | HA δ = 523–538; wrap handled |
| 029-R:57 | Ζιθ30. 618 → **Ζιι**30. 618 | HA ι = 608–633 |
| 028-R:24 | Ζμγ9. **679** → **673** | PA γ = 661–676 |

#### `page-028-R:24` — right occurrence moved

Pre-edit line (from parent of `af730a842`):

```text
ἥπατι Ζμγ12. 673b26, ἐν νέφροις Ζια17. 497 a10. Ζμγ9. 679
```

- `token` occurs **twice** (`tok_n=2`).
- `anchor()` first pattern is `token + chapter + page` → match is **`Ζμγ9. 679`**, not `Ζμγ12. 673…`  
  (`book_apply.py:49–54`)
- `apply` requires `line.count(printed) == 1` then replaces once (`100–103`).
- After: early `673b26` unchanged; only `679`→`673`.

So: same citation shape twice does **not** grab the wrong hit **when the long pattern matches**. The short fallback (`token` alone) would be unsafe on this line; the page-including pattern saves it. Guard is the count check, not the replace.

Ledger: all 27 `form` values still present on their lines (`work/rulings/john.json`, date 2026-08-09).

---

### 7. Q3 book_spans lettering / HA order — **could not break**

**Files:** `book_spans.py:53–65, 68–99`, `work/sigla/book-spans.json`, live `build/dist` HA books.

- Plain alphabet / Meta named series / Problemata numerals: as documented; Problemata correctly absent from the table.
- Regenerated spans match standard Bekker starts for Phys, Cael, GC, Mete, HA, PA, GA, EN, EE, Pol, Rhet, Meta (column-granular ±1).
- **HA books VII/VIII/IX:** `build/dist/HA/book-07..09` are 581–588 / 588–608 / 608–633 — Bekker order. Bonitz cites:

  - η: 29/29 inside 581–588  
  - θ: 86/87 inside 588–608 (only outlier is the preserved error at 575)  
  - ι: 131/131 inside 608–633  

  Modern *reading* reorderings do not affect a Bekker-keyed index. **HA dispute does not affect us.**

- DA book γ starting at 424b (not 427) matches the corpus split and Bonitz’s own ψγ citations at 424–426; not a false-positive factory.
- Missing HA κ is intentional and tested (`test_book_spans.py:76–83`).

---

## What I could not break

| Claim | Verdict |
|-------|---------|
| Six corpus edits correct and minimal | **Holds** (with latent fix-page bug unused) |
| 028-R 679→673 hits the right site despite earlier 673 | **Holds** — proved |
| book_spans letter systems + HA order | **Holds** against the attacks tried |
| `spurious *` double-counting rows | **Does not double-count** |
| 21 preserves as ink/diplomatic holds | **Hold** as transcription; corrigenda `correct` does not |
| Class-based checkpoint comparison as a concept | **Sound idea**; implementation and e22 choice do not fully support the conclusion drawn |

---

## Shorter answers to the six questions

**Q1.** Edits are correct and minimal. On 028-R, `anchor` matches `Ζμγ9. 679` (long pattern), not `Ζμγ12. 673b26`. Right digit moved. Latent risk: short-pattern anchors and `replace(page)` when chapter digits equal page digits.

**Q2.** Not defensible for every one of the 21. Worst: ηεδ/1231, Ρβ/1407, Πη/1318, Μβ/1008, and the other one-digit-into-named-book cases above. Plus κ→Μθ and η→Πγ stem insertion.

**Q3.** Could not break. HA VII/VIII/IX ordering dispute does not affect Bekker-derived spans; corpus and Bonitz agree.

**Q4.** Yes: `πκς` offers **πκγ** first over **πκϛ**; `κς` offers **κε** before **κϛ**; `ΓΒ` offers **Γα** before **Γβ**.

**Q5.** Yes: systematic mis-assignment (asymmetric breathings, ligature-before-mark, Greek punctuation as “greek letter”). `spurious *` reclassifies, does not double-count.

**Q6.** Reasoning is weak: breathings are not uncaught; word-gap is not shown to be spaces; class metric is biased; trainer and char-acc still point at e10; e22 lacks a saved class win over e10 in-repo.

---

**Highest-priority fixes if you act on this:** (1) stop auto-writing corrigenda `correct` from “page always wins” — flag near-boundary / one-digit-page-plausible sites for a separate revised-edition pass; (2) fix `classify` priority and α→ἀ under-count before using it to pick a checkpoint; (3) rank siglum candidates by visual edit type (ς↔ϛ, case, ιι↔υ) before raw corpus frequency; (4) make `fix-page` replace only the page field of the anchor, not the first digit string.

Continue this thread: grok -c   (in /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz)
