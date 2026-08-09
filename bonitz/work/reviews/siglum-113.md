=== grok delegate result ===
mode:    read-only (plan)
effort:  high
stop:    end_turn
session: 019fe699-f1a4-74e0-a6a6-6bcff36bcab4

I'll start from the real TSV, the resolver, and the reconciled lines around each unresolved citation—not from summaries.Next I'll load the sigla inventory, any prior review notes, and the reconciled lines that actually surround the 113.I need wider line context for inheritance-boundary cases and a structured pattern breakdown of the 89.Next pass: silent CITE misses, the `πο`/`πκ` book-letter trap, and real line context for the 13 named-outside cases.# Adversarial report: 113 unresolved sigla

Read: `siglum_check.py`, `work-sigla.json`, full TSV, reconciled lines around every hit. No files edited.

Corpus totals match: **4121** cites → 3659 explicit / 340 inherited / 9 latin / **113 unresolved** (89 + 13 + 11).

---

## Ranked findings (worst first)

### (i) WRONG in Claude’s model

| Rank | Finding | Evidence |
|------|---------|----------|
| **1** | **`Ζι` range hi=633 is wrong; HA runs through book κ to 638b** | Inventory: `486a-633b`. Bonitz himself cites `Ζικ1. 633b` (accepted), then `Ζικ3. 636a`, `κ5. 637a`, `Ζικ6. 637b` ×4, `Ζικ7. 638a`. Standard Bekker HA ends **638b**. This alone manufactures **7** false “errors” (6 named + 1 inherited). |
| **2** | **Bare-book resolve refuses page-adjudication when `last` fails** | Docstring says the page decides; code only tests `works[last].holds(page)`. **87/89** inherited-outside have a **unique** work family for that page. e.g. `β1.731b` → only `Ζγ`; `ε18. 550a` → only `Ζι`. They should resolve, not pile into the 113. |
| **3** | **Line-broken citations never set `last` (~292+)** | CITE requires `[ab]` on the **same** match. Real shapes that die: `Ζγα4. 717` ‖ `a16. β1.731b…`; `ΜΑ1. 981` ‖ `b10… β4. 999b`; `Ζιδ1.` ‖ `525a5. ε18. 550a` (chapter only, page next line). Direct cause of `page-015-R:22` and ~34 of the 89. |
| **4** | **Work tokens that are pure book-letters fall through to “inherited” messaging** | When `split` finds a work but page misses, step 2 still treats the token as a book of `last` if every char ∈ `BOOK_LETTERS`. So `πο8. 1408b`, `πκ34. 726b`, `χ7. 401b` are reported as “book of last work”, not “named work, page outside”. Taxonomy lies. |

### (ii) UNSUPPORTED (need scan / undecidable from text alone)

| Item | Why |
|------|-----|
| `πκ34. 726b30` | πκ = Problemata book 20 elsewhere (pages 923–926). 726 is GA; line is about ἀγγεῖα περιττώματος (GA-ish). Siglum wrong **or** page digit wrong — content favors 726=GA, so siglum is the suspect. |
| `μη 100a` | Token is not a clean book string; page sits on Αδ/Topics boundary. |
| `Οβ13. 259a29` | 259 is Physics; Cael starts 268. Could be `Φθ13` or a digit error (e.g. 289) — glyphs not similar enough to call without ink. |
| `Ζιβ1. 449a19, 500b10…` | 500b is good HA; 449 is Sens/Mem. Multi-page attach after one siglum — first page likely bad, rest fine. |
| Slice of the ~47 “stale last” | Some are line-breaks of the `siglum+chap.` ‖ `page` shape (not in the 292); some are Bonitz dropping the work in a multi-work list; cannot split without the scan. |

### (iii) Verified correct (model or corpus, as labeled)

| Item | Verdict |
|------|---------|
| Inheritance **when the prior cite is visible** | 340 inherited; **0** where page-unique family ≠ inherited family. Analytics/Topics stem-hop works. |
| `πκϛ` ×9+ as Problemata | Explicit `π`, pages 941–945. |
| Refusing `πκς` / final **ς** as 6 | Correct; ς is a reader error for ϛ. |
| Settled items | MA×24; GB→Γβ; I→ι; `Α4. 985a` = bare Meta book gap. |

---

## Q1 — Real scope of inheritance

**`resolve()` carries `last` across the whole column.** It does **not** reset on headword, full stop, em-dash, or entry boundary.

### Did that produce a wrong answer in real text?

**Silent wrong success (inherited + accepted, but wrong work): not found.**  
Among 340 successful inheritances, whenever the page sits in a unique work family, that family matches `last`. Crossing a headword line with no new explicit also produced **0** hits under a gloss-line heuristic.

**Flagged wrong inheritance (the 89): yes, but the usual cause is not “entry boundary philosophy” — it is invisible priors and a weak fallback.**

Hard case that is **not** an entry-boundary issue:

```text
page-015-R:21| … Ζγα4. 717
page-015-R:22| a16. β1.731b23, 21. 4. 738b1. cf φύσις 2 c. …
```

True work-setter is `Ζγα4. 717a16` (GA). CITE never sees it (no `[ab]` on line 21). `last` stays `Φ` from `Φθ7. 260b22`. Bare `β1.731` is reported as “book β of Φ” and fails. **731 is uniquely GA.** If line-joining or page-fallback ran, this would be inherited `Ζγ`, correct.

Same mechanism: `ΜΑ1. 981` ‖ `b10… β4. 999b` (`page-032-R:40–41`) — Meta broken, bare books inherit Topics `τβ`.

**Entry / full-stop carrying:** I did **not** find a case where a **correctly parsed** prior work, then a new entry’s bare book, is accepted under the stale work. If Claude tightens inheritance to “entry” without fixing line-breaks and page-fallback, the 89 mostly stay broken and the 340 stay fine.

**Plain result for Claude:** Column-wide `last` is not the smoking gun. The smoking gun is (1) line-broken cites not updating `last`, (2) no page-unique fallback when `last` fails. Do not “fix” inheritance scope until those two are fixed; you will not clear the 89.

---

## Q2 — The 89: patterns with counts

| # | Pattern | Count | Class | Evidence lines |
|---|---------|------:|-------|----------------|
| A | Bare book letter(s); page uniquely IDs a work ≠ `last`; **prior work-cite line-broken** | **~34** | **Parser gap** | `015-R:22` β1.731 (Ζγα broken); `019-R:7` κ36.927 (πι broken); `020-L:22` β26.868 + ια31.902 (πκζ broken); `023-L:5` ι6.1056 (Μγ broken) |
| B | Bare book; page unique; **no recovered prior of true work in stream** | **~47** | **Parser gap primary** (page should win); subset may be corpus-dropped work or `siglum.` ‖ `page` breaks | `017-L:13` ε18.550 after `Ζιδ1.` / `525a5`; `018-R:3` θ2.1155 (cf EN after ηε); `021-L:55` α14.1375; `030-L:31` **`oβ1351`** Latin `o` not joined → token `β` only |
| C | HA book κ page 634–638 under inherited `Ζι` | **1** | **Model (inventory)** | `026-R:50` κ5. 637a |
| D | `πκ` + page not in Problemata | **1** | **Corpus** (siglum or page) | `017-L:25` πκ34. 726b |
| E | `αχ` for `ακ` (De Audibilibus 800–804) | **1** | **Corpus** | `017-L:27` αχ800a |
| F | `μυ` for `μν` (De Memoria) | **1** | **Corpus** | `033-R:29` μυ1. 450a |
| G | `πο` with Rhetoric page | **1** | **Corpus** | `040-L:44` πο8. 1408b (should be ~Ργ8) |
| H | Word-fragment false cite | **1** | **Parser gap** | `024-R:18` `θέσιν 32. 88a` → token `σιν` |
| I | Column-start drop of `π` | **1** | **Corpus / line artifact** | `027-R:1` λβ8. 961a (≈ πλβ, Pr. 32; col opens mid-stream) |
| J | `μη 100a` | **1** | **Undecidable** | `031-R:34` |

**87/89** pages sit in exactly one work family. **1** in none (637 with hi=633). **1** multi (`μη` at 100).

---

## Q3 — Does the parser miss citations entirely?

**Yes. Under-reporting is large and is worse than the 113.**

| Missed class | Est. count | Notes |
|--------------|----------:|-------|
| Line-broken full cites (page EOL, `[ab]` next line) | **~292** | Never enter `cites`; never set `last` |
| Continuation `N. PPPc` without siglum | **~626** outside CITE (**~321** would pass under then-`last`, **~171** would fail if checked; rest noise/fragments) | Real Bonitz “same work, next chapter” |
| `fN. page` fragments | **~42** | By design out of work ranges |
| Latin `MA3. 983a` etc. | **9** | Parallel to Greek `ΜΑ`; do not set `last` when only Latin form appears |
| Editor pins `Bz. 7.988b9` | **~4–12** | Not work-cites; correctly out of scope if ignored |
| Latin `o` for ο | **≥1** | `030-L:31` `oβ1351 b19` → Oeconomica β, parsed as bare `β` |

**Loose Greek siglum+page scan found 0 extras beyond CITE** for complete same-line shapes. The miss is almost entirely **structural** (breaks, continuations, Latin), not “CITE’s character class forgot a letter.”

**Hidden error class in the misses:** continuation pages attributed to stale `last` are **never range-checked**. ~171 of those look out-of-range under current `last` — same disease as the 89, invisible in the TSV.

`Bz. 7.988b9` is editor reference into Meta, not a work siglum — fine to skip for work inventory; it must not poison `last` (it currently does not match CITE, so it does not).

---

## Q4 — `π` + numeral (`πκ…`)

**`π` = Προβλήματα (859–967).** Book numerals are ordinary Greek alphabetic numbers:

- `πκ` = Problemata book **20** (κ=20) — **6** hits, pages ~923–926 when healthy  
- `πκα`…`πκθ` = books 21–29  
- `πκϛ` = book **26** (stigma) — **9** explicit, all in range  
- `πλ…` = books 30+

**Parser can get it right** when:

1. Token is `π` + book letters including **ϛ** not **ς**, and  
2. Page ∈ 859–967 → `split` → explicit `π`.

**It cannot get it right when:**

| Form | Count in 113 | Why |
|------|-------------:|-----|
| `πκς` / bare `κς` | 2+1 | Final **ς** ∉ `BOOK_LETTERS` (correct refusal); reader meant **ϛ** |
| `πκ34. 726b` | 1 | Page not in π; after explicit fails, whole `πκ` treated as multi-letter **book of previous work** (`Ζι`) — wrong message and wrong theory |
| Column-start `λβ8. 961` | 1 | Likely `πλβ` with `π` lost at column edge |

**Bottom line:** `πκ` is not mysterious. Healthy `πκ*` already resolve. The wrecks are stigma OCR (`ς`), one bad 726, and the inherit-as-book-letters trap for failed explicit `π`.

---

## Q5 — The 13 “work named, page outside”

| # | Location | Cite | Judgment |
|---|----------|------|----------|
| 1–6 | `018-R:28`, `029-R:50`, `030-L:50`, `040-R:18`, `040-R:21`, `042-R:27` | `Ζικ…` 636–638 | **Model wrong.** HA book κ; extend `Ζι` hi → **638**. Not Zith28-class. |
| 7 | `026-R:50` is in the 89, not 13; same range fix | `κ5. 637a` | **Model wrong** (inventory). |
| 8 | `041-R:10` | `Ζκ7. 638b` | **Corpus:** almost certainly **`Ζικ7`** (dropped ι). Uteri / HA X content, not De Motu (698–704). Range fix alone is not enough. |
| 9 | `020-L:7` | `Πβ18. 1391b` | **Corpus:** page is Rhetoric → **`Ρβ`**. Π/Ρ ink confusable. Following bare `γ1. 1403b` is then Ρ book γ (also in the 89). |
| 10 | `038-R:52` | `Πγ7. 1408b` | **Corpus:** same Π/Ρ; **`Ργ7`**. Context is ἄκος / prose style (Rhet. 3). |
| 11 | `027-L:5` | `Ζιβ1. 449a19, 500b…` | **Corpus (page):** 500b is HA; **449** is not. Multi-page list after one siglum — treat 449 as bad or foreign attach. Not a range-table bug. |
| 12 | `035-L:22` | `Οβ13. 259a` | **Corpus.** 259 ∈ Physics (184–267), not Cael (268–313). Prefer bad siglum/page over model. Needs scan (`Φθ13` vs digit). |
| 13 | `049-L:51` | `Ηε10. 1835b12–1136a3` | **Corpus, obvious.** Range **1135b12–1136a3**; leading `1` duplicated. EN ε is fine. |
| 14 | `050-R:31` | `Πζ5. 1820a` | **Corpus.** Impossible Bekker; Politics ζ is ~1316–23 (e.g. **1320a**?). |

**Zith28-class genuine misreadings among the 13:** **Π/Ρ ×2**, **Ζκ for Ζικ ×1**, **digit garble ×2**, **449 attach ×1**, **Οβ ×1**.  
**False alarms from Claude’s table:** **Ζικ ×6** (and the related inherited κ).

---

## Master table — all 113

| Pattern | Count | Verdict | Evidence |
|---------|------:|---------|----------|
| Bare book; page-unique; line-break hid true work | 34 | **Parser gap** | `015-R:22` β1.731; `020-L:22` β/ια Problemata |
| Bare book; page-unique; stale/`last` only | 47 | **Parser gap** (page fallback); some corpus | `018-R:3` θ2.1155; `030-L:31` oβ→β |
| `Ζικ` / κ with page 636–638 | 7 | **Model: `Ζι` hi=633→638** | `018-R:28` etc.; `026-R:50` |
| `Ζυ` unknown | 3 | **Corpus** misread (→Ζιθ / Ζκ by page) | `016-L:32–33` 616/619; `032-R:51` 700 |
| `πκς` / `κς` (ς for ϛ) | 3 | **Corpus**; parser right to refuse | `025-L:43,46`; `025-R:27` |
| `Πβ`/`Πγ` + Rhet. page | 2 | **Corpus** Π/Ρ | `020-L:7`; `038-R:52` |
| Impossible page (18xx) | 2 | **Corpus** digits | `049-L:51` 1835; `050-R:31` 1820 |
| `πκ` + non-π page | 1 | **Corpus** / undecidable | `017-L:25` 726b |
| `αχ` → `ακ` | 1 | **Corpus** | `017-L:27` |
| `μυ` → `μν` | 1 | **Corpus** | `033-R:29` |
| `πο` + 1408 | 1 | **Corpus** (~Ργ) | `040-L:44` |
| `Ζκ7. 638b` | 1 | **Corpus** (Ζικ) | `041-R:10` |
| `Ζιβ1. 449a` multi-list | 1 | **Corpus** (449) | `027-L:5` |
| `Οβ13. 259a` | 1 | **Corpus** / scan | `035-L:22` |
| Word-fragment (`κις`, `σιν`, `ς`) | 3 | **Parser gap** false positive | `022-L:7`; `024-R:18`; `026-L:48` |
| `λβ` col-start (~πλβ) | 1 | **Corpus**/break | `027-R:1` |
| `μη 100a` | 1 | **Unsupported** | `031-R:34` |
| `Α4. 985a` | 1 | **Parser gap** (settled) | `035-L:48` |
| `Ι4. 1166b` | 1 | **Parser gap** (upper book) | `039-R:9` |
| `ΓΒ4. 331a` | 1 | **Parser gap** (Γβ) | `046-R:12` |
| **Total** | **113** | | |

---

## What Claude should do next (priority only)

1. **Fix `Ζι` hi to 638** — instant, evidence-backed, clears ~7.  
2. **Join line-broken cites** before `resolve` (at least page‖`[ab]` and `siglum+chap.`‖`page[ab]`).  
3. **When bare book fails under `last`, fall back to unique page-family** (keep stem-hop for Analytics). That is what the module’s own docstring promised.  
4. **If `split` finds a work and page misses, stop; report named-outside** — do not rebrand as inherited.  
5. **Only then** dig corpus OCR (`Ζυ`, Π/Ρ, ς/ϛ, 1835, 1820, `αχ`, `μυ`).  
6. **Do not** shrink inheritance to “same entry” first — no silent cross-entry failure was found; you will not buy clearance of the 89 that way.

**Adversarial bottom line:** Of the 113, on the order of **~80–90 are checker/inventory false alarms**, **~15–20 are real corpus misreadings**, **~2–4 need the scan**. The 13 “genuine-error candidates” are **not** mostly Zith28; **half are a one-line range bug in Claude’s own table.**

Continue this thread: grok -c   (in /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz)
; 030-L:50; 040-R:18,21; 042-R:27 |
| Named: `Ζκ` @638 | 1 | Corpus (`Ζικ`) | 041-R:10 |
| Named: `Ζιβ` @449 | 1 | Corpus/OCR | 027-L:5 |
| Named: `Π` @1391, 1408 | 2 | Corpus (`Ρ`) | 020-L:7; 038-R:52 |
| Named: `Ο` @259 | 1 | Corpus | 035-L:22 |
| Named: `Η` @1835 | 1 | Corpus digits | 049-L:51 |
| Named: `Π` @1820 | 1 | Corpus digits | 050-R:31 |
| Unknown `Ζυ` | 3 | Corpus | 016-L:32–33; 032-R:51 |
| Unknown `πκς`/`κς` | 3 | Corpus stigma | 025-L:43,46; 025-R:27 |
| Unknown `κις`/`ς` | 2 | Parser false token | 022-L:7; 026-L:48 |
| Unknown `Α`/`Ι`/`ΓΒ` | 3 | Settled parser/case gaps | 035-L:48; 039-R:9; 046-R:12 |

*(Named rows 6+1+1+2+1+1+1 = 13; unknown 3+3+2+3 = 11; inherit bins ≈ 89.)*

---

## What Claude should do next (priority)

1. **Fix `Ζι` range to 486a–638b** (or verify against Bonitz’s own key page if it really prints 633 — I am skeptical of 633 for HA book 10). Re-run; expect ~6 named + 1 inherited to clear.
2. **Join citations across line (and column) breaks** before `resolve`, or run `CITE` on a soft-wrapped stream. This is the highest-leverage parser fix for the 89.
3. **On bare-book miss:** optional second pass — if exactly one work owns the page, report `page-inferred` instead of dumping into the 89; keep strict mode for the Zith28 hunt.
4. **Reset or re-seed `last` at column starts** from a reconstructed split cite, not from the previous file’s last Rhetoric.
5. **Do not treat the 89 as a misreading queue.** After (1)+(2), the remainder is the real corpus-error list (OCR χ/κ, Π/Ρ, impossible pages, `Ζυ`, etc.).

I did not edit any files.

Continue this thread: grok -c   (in /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz)
