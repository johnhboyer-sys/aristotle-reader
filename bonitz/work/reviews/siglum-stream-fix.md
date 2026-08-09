=== grok delegate result ===
mode:    read-only (plan)
effort:  high
stop:    end_turn
session: 019fe6b2-99e3-7101-bcb2-baae32e405a5

I'll attack the fix in commit 89ecdf24e, not the original diagnosis. Reading the change, the prior review, and the files you named.Next I'll compare stream vs line-local parses on the real corpus, then probe `book_ok`, page-inferred, and the Ζι/Ζμ boundary.Digging into false positives among the 769 new matches, then attacking `book_ok`, page-inferred, and per-book ranges.Noticing `Ππ`/`Πο` as explicit nonsense books and `Τδ` as a case issue. Digging into false stream joins, page-inferred chains, and per-book violations.# Adversarial review of `89ecdf24e` (the fix, not the diagnosis)

Read: `bonitz_pipeline/siglum_check.py`, the three new tests, `work-sigla.json`, full `siglum-check.tsv` / live resolve (26 unresolved), and the reconciled stream. No files edited.

Measured corpus under current code: **4886** cites → 4342 explicit / 489 inherited / 20 latin / **9 page-inferred** / **26 unresolved**.

---

## Ranked findings (worst first)

### 1. `book_ok()` gates **all** of step 2 — including `by_page` — and so blocks legitimate Meta bare books after a non-Meta `last`

**File:** `bonitz_pipeline/siglum_check.py:254–286` (`book_ok` at `:183–194`, `by_page` at `:197–217`)

```254:286:bonitz_pipeline/siglum_check.py
        if last and all(ch in BOOK_LETTERS for ch in c.token) \
                and book_ok(last, c.token):
            if works[last].holds(c.page):
                ...
            guess = by_page(c.token, c.page, works)
            if guess and guess[0] != last:
                ...
                last = c.work
```

`book_ok(last, token)` is evaluated **before** inheritance, stem-hop, **and** page inference. For non-`Μ` works, bare `μ`/`ν` are numeral 40/50 > `MAX_BOOK`, so the whole branch is skipped. `by_page` never runs, even when the page uniquely names the Metaphysics.

**Constructed (runs under current code):**

| Sequence | Result |
|----------|--------|
| `Φθ` @260 → bare `μ` @1080 | **unresolved** as Meteorologica (`μ` 338–390), not page-inferred `Μ/μ` |
| `πκ` @923 → bare `μ` @1080 | same |
| `Φθ` @260 → bare `ν` @1090 | **unresolved** `'ν' is not one of Bonitz's sigla` |
| `Μλ` @1070 → bare `μ` @1080 | **inherited** `Μ/μ` (NAMED_BOOKS path works only when `last` is already `Μ`) |

Contrast: bare `κ` @1050 after `Φ` **does** page-infer (`book_ok(Φ,'κ')` is true, 20≤38) → `Μ/κ`. So the high Meta letters are specially broken; low ones are not.

**Live corpus:** every bare `μ`/`ν` in the Meta page band currently has `last=Μ` already (13 inherits) — no live victim yet. The hole is real; the next time a Meta stretch opens with a bare `μ`/`ν` after Physics/EN/etc., page-inference will not save it. That is exactly the path change 4 claimed to open.

**Related hole (inverse):** `book_ok` is **not** applied on the explicit path. So these resolve as healthy Politics:

- `page-027-R:21` `Πο4. 1290 b` → explicit `Π/ο` (book “70”)
- `page-039-L:14` `Ππ14. 1285 a` → explicit `Π/π` (book “80”)

Page 1290 is Politics book **δ**, not ο; 1285 is book **γ**/δ territory, not π. `book_ok` was written for this class of garbage and then not applied where the garbage is most often complete (`Π`+tail).

**Q3 answer:** I did **not** find a live, legitimate citation with book numeral >38 that `book_ok` refuses. Observed max among accepted multi-letter books is `πλη` = 38; no work but Meta uses name-letters. The break is the **gating**, not the constant 38: it refuses the **page-inferred Meta μ/ν** case by construction, and fails to refuse absurd **explicit** books.

---

### 2. Per-book Bekker still silent (the thing you did not fix) — 7 hard Meta misses, including both of yours

**Evidence (reconciled + resolve):**

| Loc | Cite | Book claims | Page actually is | How |
|-----|------|-------------|------------------|-----|
| `page-015-R:7` | `κ1. 1050a` | Meta Κ (1059–1069) | **Θ** (1045–1052) | inherited `Μ` |
| `page-015-R:12` | `Μδ2. 1031b` | Meta Δ (1012–1025) | **Ζ** (1028–1041) | explicit |
| `page-031-L:16` | `Μθ7. 1084 b` | Θ | **Μ** (1076–1087) | explicit |
| `page-035-L:12` | `Μν8. 1065a` | Ν | **Κ** (1059–1069) | explicit (stream wrap) |
| `page-040-L:14` | `Μα1. 1053 a` | α-minor (993–995) | **Ι** (1052–1059) | explicit |
| `page-046-R:42` | `Μγ4. 1044 b` | Γ | **Η** (1042–1045) | explicit |
| `page-049-L:8` | `Μβ4. 1008 a` | Β | **Γ** (1003–1012) | explicit |

Meta with book letter: **261** OK (±1 page), **7** hard fails, 11 with no book. Yield of Meta-only per-book ranges: **~7 new true findings** on 279 Meta resolves — small but high-value (exactly the class you care about in τὸ ἀγαθόν).

**Other multi-book works (hard fails, ±1 excluded, traditional ranges):**

| Work | Hard fails | Notes |
|------|----------:|-------|
| EN `Η` | 7 | e.g. `Ηκ2. 1095b`, `Ηκ1. 1095a`, `Ηκ8. 1098b` (book κ pages are book α); `Ηθ2. 1115b` (θ vs γ) |
| Pol `Π` | 3 | `η4. 1276b`, `Πδ13. 1279a`, `Πη7. 1318a` |
| HA `Ζι` | 5 | book/page letter swaps (θ@532, θ@575, δ@607, …) |
| GA `Ζγ` | 1 | `Ζγα5. 785a` (page is book ε) |
| Rhet `Ρ` | 1 | `Ρβ5. 1407b` (γ territory) |
| Phys `Φ` | 0 | |
| Cael `Ο` | 0 | once book α is 268–**283** (not 279) |
| EE `ηε` | many if ranges wrong | Bonitz `ηεη` @1235–1245 is **his** book η; standard EE book maps are easy to get wrong |

**Rough total yield** for careful per-book tables on **Μ, Η, Π, Ζι, Ρ, Ζγ**: on the order of **~24** new unresolveds — comparable to today’s entire pile (26), almost all real reader/OCR book-letter or digit errors.

**Risk vs reward:**

- **Worth it now:** Metaphysics (named books, 7 clear misses, your two specimens), EN (7, same pattern of letter/digit swaps), Rhetoric (3 books, sharp boundaries, 1 miss).
- **Worth it with care:** Politics (8/9 books; θ is real in Bonitz at 1337–1342), HA (10 books; boundaries blur by a page or two).
- **Defer / high risk of self-inflicted noise:** EE (`ηε` lettering ≠ a naive α…η map), MM, anything where Bonitz’s book letters are non-standard. A wrong EE table would dump dozens of false alarms (`ηεη2. 1236b` × many is correct under Bonitz).

**Bottom line:** per-book ranges for **Μ + Η + Ρ** are high yield, low invention risk. Full 48-work book tables would re-open the “inventing data” problem you avoided with `MAX_BOOK=38`. Do three works well.

---

### 3. `guess[0] != last` is dead; `last = inferred` is live — wrong inference can poison what follows

**File:** `siglum_check.py:256–286`, test pin at `tests/test_siglum_inheritance.py:174–179`

After `works[last].holds(c.page)` has already failed, `last` is not among page holders, so `guess[0] == last` is impossible. All 9 live page-inferred cases have `last ≠ inferred`. The guard never filters.

**What does matter:** page-inferred **sets `last`** (`:285`). Documented and tested as intentional.

**Live page-inferred (all 9 read in context):**

| Loc | Cite | Inferred | Prior `last` | Follow-on inherit? |
|-----|------|----------|--------------|--------------------|
| `018-R:3` | `θ2. 1155b` | `Η/θ` | `ηε` | no (next explicit `Ηι5`) |
| `020-L:7` | `γ1. 1403 b` | `Ρ/γ` | `πο` | no |
| `023-L:19` | `α15. 34 b` | `Αα/α` | `τθ` | no |
| `027-L:5` | `ε30. 556 a` | `Ζι/ε` | `Ζγ` | **yes** → `ζ12. 567 a` inherits `Ζι` |
| `027-R:1` | `λβ8. 961 a` | `π/λβ` | `Ρ` | no |
| `030-L:31` | `β1351 b` | `ο/β` | `μ` | no |
| `037-L:15` | `γ5. 1010a` | `Μ/γ` | `Φ` | no |
| `043-R:44` | `β7. 1108 a` | `Η/β` | `Αα` | no |
| `048-R:49` | `α7. 344 b` | `μ/α` | `κ` | no |

Every one of these is a **correct** work assignment on the page. The only inheritance-after-inference (`027-L:5→6`) is also correct HA.

**Constructed poison (not in corpus, but the mechanism is real):**

1. Typo page that uniquely IDs the wrong work → page-inferred sets `last` to that work.
2. Following bare books with pages still in that work inherit silently.

Example shape: last=`Φ`, bare `β` @731 (meant 261) → inferred `Ζγ`, then bare `δ` @765 inherits `Ζγ` and never raises. Work-level check is happy; the first page was the only error signal and it was spent on “fixing” context.

**Is `guess[0] != last` the right guard?** No. The useful guards would be: (a) do not update `last` on page-inferred (treat as non-context, like unresolved), or (b) update `last` only when the prior work-setter was line-broken / missing, not when an explicit prior simply disagreed. Right now the code confuses “context was invisible” with “context was wrong.”

---

### 4. Stream read alone is dangerous; stream **+** lookbehind is nearly clean — measured FP rate on the 769

**File:** `siglum_check.py:315–352` (stream `read`), `:104–109` (lookbehind)

**Counts:**

| Mode | Line-local | Stream | Stream-only |
|------|----------:|-------:|------------:|
| Old lookbehind | 4121 | 4891 | **770** |
| New lookbehind | 4117 | 4886 | **769** |

Net vs pre-fix line-local baseline: **4886 − 4121 = 765** (your “765 net”). Commit’s “790 wraps” ≈ old stream-only 770; the extra story is lookbehind removing same-line fragments.

**Q2 — does join ever *change* an existing cite?**  
**No.** Same-start group diffs: **0**. Stream spans overlapping a different line-local match: **0**. Line-local starts missing from stream: **0**. Joining only **adds**.

**Q1 — false citations among the new 769?**

All 769 new matches are preceded by **whitespace** (no mid-word start under the new guard).

**Word-fragment joins the stream *would* have added without change 3** (present under old CITE stream, absent under new) — these are the real “line ends in letters+digits, not a Bekker cite” cases:

| Loc | Old stream match | True text |
|-----|------------------|-----------|
| `022-L` | `κις 31. 181 b` | `πολλάκις` + page |
| `024-R` | `σιν 32. 88 a` | `θέσιν` (the original bug) |
| `026-L` | `ς 609 a` | `αἰγωλιός` |
| `030-R` | `αι 1281 b` | `ἀρχαιρεσίαι 1281` / `b33` — **classic wrap FP** |
| `031-R` | `μη 100a` | `μνήμη` |

So: **stream alone invents junk; lookbehind is what stops it.** With both applied, those five are gone.

**Among the 769 that remain (new lookbehind + stream):**

| Class | n | Verdict |
|-------|--:|---------|
| Resolve explicit, page in work | 677 | Real wraps (both shapes) |
| Inherited | 80 | Real bare books after recovered setters |
| Latin homoglyph wraps | 11 | Real cites, encoding issue |
| Unresolved | 1 | `041-L:3` `Τδ3. 123 b` — **real Topics** δ@123, uppercase `Τ` not in inventory (`τα-θ` expands to lowercase `τδ`) |
| Page owned by no work | 0 | |
| Random sample 50 | 50/50 | All legitimate shapes |

**Per-book mismatches inside the 769** (corpus errors, not join artifacts):  
`η4. 1276 b` (inherited `Π/η`, page is Pol γ), `Ζιθ7. 532 a`, `Μν8. 1065a`, `Ζιθ21. 575 a`. The match is a real citation; work-level resolve is too coarse (→ finding 2).

**False-positive rate for “junk join” among the 769: 0 / 769** on exhaustive structural checks + 50-sample + per-book flag review.  
**Counterfactual rate if stream shipped without lookbehind: 5 known fragment FPs** (and those are the ones you can point at), i.e. ~0.6% of wraps, all the same disease.

I did **not** find a surviving catchword, running page number, or column artifact that the new pair of changes still promotes to a citation.

---

### 5. `Ζι` hi=638 does **not** swallow `Ζμ`

**File:** `work/sigla/work-sigla.json` (Ζι `486a-638b`), test `tests/test_siglum_inheritance.py:46–59`

- `Ζι` resolves: 716 cites, pages **486–638** only; **0** with page ≥639  
- `Ζμ` resolves: 247 cites, pages **639–697** only; **0** with page ≤638  
- Book κ HA cites all sit 633–638 (`Ζικ1. 633b` … `Ζικ7. 638a`, bare `κ5. 637a`)  
- `page-041-R:10` `Ζκ7. 638b` stays **unresolved** as De Motu (698–704) — correctly *not* absorbed into HA; it is still the dropped-ι corpus error (`Ζικ`)

Boundary is tight and clean. **Could not break change 2.**

---

## Per-change verdict

| # | Change | Broke it? |
|---|--------|-----------|
| 1 | Stream `read()` | **Not in the shipped pair** with lookbehind. Stream *alone* would reintroduce the five wrap-fragments (esp. `ἀρχαιρεσίαι → αι 1281b`). Q2 is solid: adds only. |
| 2 | `Ζι` hi 633→638 | **Could not break.** No `Ζμ` leakage. |
| 3 | Accented lookbehind | **Could not break** on the known fragment class; it is load-bearing for (1). No evidence it drops real same-line cites beyond the four fragment removals (4121→4117). |
| 4 | `page-inferred` + `book_ok` | **Broke.** (a) `book_ok` prevents page-inference for bare Meta `μ`/`ν` when `last` is non-Meta; (b) `book_ok` skipped on explicit → `Πο`/`Ππ` silent; (c) `guess[0]!=last` is dead; (d) setting `last` from inference is a propagation footgun (constructible; one live inherit-after is luckily correct). |

---

## Short answers to the six questions

**Q1.** Of the **769** new wraps under the shipped code, **0** are junk joins I can exhibit. Rate **0/769** for false *matches*. The scary cases (`αι 1281b` from `ἀρχαιρεσίαι`, `σιν` from `θέσιν`, etc.) exist only if you keep stream and drop the lookbehind. A few recovered cites are still *wrong as readings* at book level (`η4.1276b`, two `Ζιθ…` pages) but they are real citation shapes, not glue artifacts.

**Q2.** **No.** Zero changed groups, zero consumed line-local matches.

**Q3.** No live legitimate book >38 refused. Meta is the only named series; `πλη` really is the ceiling. The real refuse-path bug is **bare Meta `μ`/`ν` after non-Meta `last`** (page-inference blocked). Also `book_ok` never runs on explicit `Πο`/`Ππ`.

**Q4.** Yes, wrong inference can propagate because `last` is updated. No live poisoned chain found (9 inferences, 1 follow-on inherit, both correct). `guess[0]!=last` is **not** the right guard; it never fires. Prefer not setting `last` on page-inferred, or only when the missing setter was structural.

**Q5.** **No.** 638 stops where `Ζμ` begins; book κ is admitted; `Ζκ7.638b` is not laundered into HA.

**Q6.** Hard per-book misses on multi-book works with careful ranges: **Meta 7, EN 7, Pol 3, HA 5, GA 1, Rhet 1** (~24). Worth doing **Μ, Η, Ρ** immediately; **Π, Ζι** next; **not** a blanket EE/48-work table until Bonitz’s lettering is checked work-by-work. Risk of bad ranges is real for EE and fuzzy HA edges; for Meta/EN/Rhet the standard Bekker book map is stable enough that the 7+7+1 are almost certainly corpus/reader errors, not table errors.

---

## What still looks right

- Stream recovery of the two wrap shapes and the `015-R:21–22` `Ζγα` → `β1.731` inheritance fix.  
- Lookbehind killing word tails (including cross-line).  
- HA κ range.  
- `page-inferred` *outcomes* currently in the TSV are sound work assignments.  
- The remaining 26 are still the right kind of pile (Ζυ, πκς, Π/Ρ, impossible pages, αχ/μυ, Ζκ, Latin/case junk).

Continue this thread: grok -c   (in /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz)
