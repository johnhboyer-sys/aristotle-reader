=== grok delegate result ===
mode:    read-only (plan)
effort:  high
stop:    end_turn
session: 019feb74-3ae7-7421-9b1c-dce9969708b9

I'll review the adjudication rules in depth—read-only—against the governing principle and the specific sites you named.Next I’ll pull the tests, the open findings queue, and the specific sites in the corpus so the 8 forced / 18 judged split can be checked against the code.I have the 26-site queue; next I’m stress-testing the 8 forced cases, the ς/ϛ corpus claim, and ranking failure modes with targeted checks.John’s existing rulings already contradict some “forced” auto-fixes — I’m verifying those against the corpus lines and the preserve path.# Review: adjudication force vs judgment

Evidence from `numeral_fix.py`, `siglum_review.py`, `siglum_check.py`, `book_spans.py`, `book_apply.py`, the two test files, `work/reconciled/`, `work/rulings/john.json`, and `work/sweeps/siglum-rulings.json`. Live queue: **26 sites**; the 8 with exactly one generated candidate match your list.

---

## Findings, worst first

### 1. The governing rule is unsafe for a diplomatic corpus (Q1)

**Failure mode:** “Impossible as held + exactly one *of our* candidates” erases the third branch the pipeline itself documents: **Bonitz printed the impossible thing**. That is `preserve` → corrigenda, not auto-fix.

What the code treats as “possible” is not paleographic possibility. It is:

| Filter | Where | Circular dependency |
|--------|--------|---------------------|
| Work spans | `siglum_check.inventory` / `Work.holds` | Our key |
| Book spans | `book_spans` / `_SPANS` in `holds()` | Derived from `build/dist`, not Bonitz |
| Candidate generator | `near`, 1-char `ALPHABET` subs, `CONFUSIONS`, **owner injection** | `siglum_review.py:217–302` |
| Cap | `MAX_CANDIDATES = 4` | Truncation can hide a fifth |

So “exactly one candidate” often means “exactly one survivor of **our** search,” including the always-on owner injection:

```285:299:bonitz_pipeline/siglum_review.py
    # ⚠ ALWAYS OFFER THE WORK THE PAGE NAMES, however far it is from the token.
    owner = [w for w, wk in works.items() if wk.holds(page)]
    if len(owner) == 1:
        w = owner[0]
        ...
        out.add(w + (bk[0] if bk else ''))
```

That is circular in the strong sense: **absence of an alternative in our generator is treated as evidence there is none.** It is also the wrong question for diplomatic work. The right split is:

- **Encoding / identical glyph** (ς vs ϛ): position can force a codepoint without the scan.
- **Distinct glyphs** (Π/Ρ, χ/κ, digits): ink can match what we hold even when Aristotle cannot; only a human (or a crop) chooses fix vs preserve.

**Decisive evidence the force list is wrong as policy:** John already ruled **preserve** on three of the eight “forced” sites (`work/sweeps/siglum-rulings.json`):

| Site | Tool’s only candidate | John |
|------|----------------------|------|
| `Πβ:1391` | `Ρβ` | **preserve** |
| `οβ:1374` | `Ρα` | **preserve** |
| `σ:73` | page `973` | **preserve** |

Auto-applying the force rule would have **overwritten explicit human rulings** and moved the diplomatic text away from the ink.

---

### 2. Of the 8 “forced,” only a minority are genuinely forced (Q2)

Live state: each has `len(sigla)+len(pages)==1`. That is a property of the generator, not of the page.

| Site | Held | Sole candidate | Genuinely forced? | Second reading |
|------|------|----------------|-------------------|----------------|
| **Πβ18. 1391b** | `Πβ` | `Ρβ` | **No** | **Preserve** (John did). Π≠Ρ in type; 1-edit Π→Ρ *and* owner-injection both produce `Ρβ`. Line `page-020-L:7` sits among Politics/Rhetoric mixture; ink can be Π. |
| **οβ1374a** | `οβ` | `Ρα` | **No** | **Preserve** (John did). `οβ→Ρα` is **edit distance 2**; `Ρα` enters **only** via owner injection, not via `near`/substitution. Not even a one-edit repair. |
| **σ9. 73a** | `σ` @73 | page **973** | **No** | **Preserve** (John did). 73 is a real Bekker page (Analytics); σ is a real one-page work at 973. Page-wrong vs Bonitz-wrong vs distant siglum misread are all live. |
| **Πγ7. 1408b** | `Πγ` | `Ργ` | **No** | **Preserve / Politics neighbourhood.** `page-038-R:50–53` is wall-to-wall Politics (`Πε8`, `Πβ7`, bare `ε5`, then `Πγ7. 1408b`, then `Πβ7` again). Page names Rhetoric; **context names Politics**. Tool offers no Politics page repair (`page_candidates(1408, 1274–1288)` is empty), so it presents a false singleton. |
| **Τδ3. 123b** | `Τδ` | `τδ` | **Mostly yes (case)** | Only soft alternative: preserve if capital Tau is a real sort Bonitz used (inventory has only `τα…τθ`). Unlike Π/Ρ, this is case of the same letter; `edit_rank==1`. No second holding siglum. |
| **χ7. 401b** | `χ` | `κ` | **No** | **Preserve.** χ and κ are different letters; 401 is uniquely de Mundo in our tables, but the ink may still be χ (Bonitz error). Twin site `χ:393` correctly has **two** options (`κ` and page `793`) and is judged. |
| **Ηε10. 1835b** | `Ηε` @1835 | page **1135** | **Yes** | Held page is in **no** work. Book ε span is 1129–1138; only one 1-edit lands there. Line is self-proving: `Ηε10. 1835 b12-1136 a3` — the range end is already 1136, so the start is 1135 with a stray `8`. |
| **Πζ5. 1820a** | `Πζ` @1820 | page **1320** | **Almost** | 1820 in no work; book ζ is 1316–1323; only 1320. Second reading is preserve-as-Bonitz with an impossible page — real in principle, weak next to a unique digit fix that keeps book ζ. Still not “glyph-identical encoding.” |

**Bottom line on the 8:** treat **Ηε→1135** (and arguably **Πζ→1320**, **Τδ→τδ**) as force-eligible; **do not force** Πβ, οβ, σ, Πγ, χ. Forcing those would fight John’s own preserves and the diplomatic rule.

---

### 3. Numeral-slot `ς→ϛ` is sound as encoding policy; process and guard still bite (Q3)

**Policy (sound):** A book numeral is a number. Stigma = 6; final sigma has no value. Same shape in this type → codepoint choice, not ink adjudication. Matches the Latin-homoglyph argument (`siglum_check.HOMOGLYPH`).

**Corpus check (not just the rule):**

- After apply, `find() == []`; stigma citations present (`πκϛ`, `κϛ`, `πιϛ`, `πϛ` — 16 hits).
- No work siglum in `work-sigla.json` ends in `ς` or `ϛ`.
- Of ~4654 final-sigma tokens, the only citation-shaped `…ς` + chapter.page forms were the three numeral_fix rewrote. Words like `πολλάκις`, `αἴσθησις`, `φύσεως` next to numbers are **not** citation tokens; the trailing Bekker pattern is what separates them.

**So: no corpus evidence of a legitimate final sigma standing in a citation numeral slot.**

**Process defect (serious):** John had already **preserved** those three sites in `siglum-rulings.json` (`πκς:946`, `κς:946`, `πκς:944`). `numeral_fix --apply` rewrote the corpus and pinned `numeral-slot/applied` in `john.json` **without clearing or reconciling those preserves**. The rule may be right and the **override of an explicit preserve still wrong as process**.

**Guard audit** (`numeral_fix.py:50–52`, same family as `CITE`):

| Case | Result |
|------|--------|
| `πολλάκις 31. 181 b` | Safe now (`ά` U+03AC is inside `Ͱ-Ͽ`) |
| Accented / combining before `ς` | Blocked in corpus sample (`unblocked non-[Α-Ωα-ω]` before `ς` was empty) |
| `·κς`, `cf κς`, `(κς` | **Still match** — lookbehind does not treat middle dot, Latin, digits, or punctuation as blockers |
| `πκς  56` (double space) | **Misses** — pattern wants `\s?` once then digits |
| `κς 946 b` (no chapter stop) | Misses — good for words, means incomplete cites need the review path |
| `πκςς 1. 900a` | Hits as a blob — toy case |

The corrected guard fixes the **πολλάκις** class. Residual risk is not “Greek word → stigma” under normal Bonitz spacing; it is **over-match after non-Greek left context** (usually desirable for real cites) and **under-match** on odd spacing. Tests pin the word cases (`test_numeral_fix.py:29–38`) and `find()==[]` after apply; they do **not** pin “do not override a preserve ruling.”

---

### 4. None of the 18 judged is a hidden force under *your* cardinality rule (Q4)

Classification of all 26: every judged site has **≥2** generated options (siglum and/or page). None is `auto=True` with a single candidate.

You are **not** spending attention on pure singletons among the 18. You **are** spending it on sites where the tool already commits to `sigla[0]` while a second live theory remains — that is correct for judgment.

Near-misses that *feel* forced but are not:

| Site | Why it stays judged |
|------|---------------------|
| `ΓΒ:331` | Case-fold like Τδ, but `Γ` **and** `Γβ` both `holds()` — bare work accepted when book table exists (`holds` returns True when `b` is empty). |
| `Α:985` / `Ι:1166` | `ΜΑ`/`Μ`, `Ηι`/`Η` — book vs bare work. |
| `Ζυ:616/619` | `Ζιι` vs `Ζι` (both hold). |
| `πκ:726`, `υ:485`, `μυ:450`, … | One far owner-injected siglum **plus** a page digit option. |
| `χ:393` | `κ` **or** `793` — the honest twin of forced `χ:401`. |

So: **no, you are not wasting John on something the cardinality rule already settles.** You may still be wasting him on weak second candidates (bare `Γ`, bare `Μ`) that `holds()` over-admits.

---

### 5. Permissive predicates that degrade ranking without erroring (Q5)

**The regression you named** is documented and fenced:

```186:199:bonitz_pipeline/siglum_review.py
def holds_or_inherits(...):
    """…or is a bare book letter of the work that owns the page.
    ⚠ KEEP THIS OUT OF `holds`. Folding it in ... made EVERY single
    Greek letter a valid candidate everywhere...
```

Simulation: `Α@985` good `['ΜΑ','Μ']` vs bad `['α','θ','δ','κ']` — recommendations become nonsense, **no exception**.

**Why no test failed:** existing tests check set membership and a few tops (`Ζιι`, `πκϛ in list`), not “top candidate is the historically right repair” for bare capitals / owner-injected forms.

| Silent degrade | Mechanism | File:line | Symptom |
|----------------|-----------|-----------|---------|
| Fold `by_page` into `holds` / unrestricted bare branch | Every letter inherits some owner | `siglum_review.py:186–199`, bare branch `250–265` | Ranking collapses; tests still pass |
| **Owner injection at any edit distance** | Always add unique page owner | `285–299` | `οβ→Ρα` at distance 2 looks like a “candidate”; becomes sole “forced” answer |
| **Frequency without `edit_rank`** | Historical | fixed `78–93`, `301–302` | `πκγ` before `πκϛ` (test only asserts `πκϛ in got`, not first) |
| **`MAX_CANDIDATES = 4` truncation** | Sort then cut | `45`, `302` | Right answer rank 5 vanishes with no error (no overflow test on live queue today) |
| **`holds` bare work ignores books** | `if b and table` skipped when `b==''` | `158–183` | `Γ` competes with `Γβ` at 331 |
| **Problemata has no book table** | `π not in _SPANS` → work-level only | `book_spans` note; `holds` | `πκβ@900` “holds” without book check |
| **`recommend` always trusts `sigla[0]`** | Neighbourhood only for prose reason | `405–444` | Politics-neighbour `Πγ@1408` still recommends `Ργ` |
| **Reason text slices works to `[:2]`** | `n.split('= ')[1][:2]` | `440` | `Ζιε`→`Ζι`, `ημβ`→`ημ` — cosmetic, wrong labels |
| **Work-only `holds` (historical)** | All Politics books pass for `Πο@1290` | fixed by book spans | `Πε` frequency-ranked over `Πδ` (docstring `161–167`) |

**Test that would have caught the bare-inheritance fold** (minimal oracle):

```python
def test_bare_letters_do_not_outrank_real_sigla():
    # Regression: folding by_page into holds() made every Greek letter
    # a candidate; Α@985 recommended α instead of ΜΑ.
    assert siglum_candidates('Α', 985, WORKS, SEEN)[0] == 'ΜΑ'
    assert siglum_candidates('Ι', 1166, WORKS, SEEN)[0] == 'Ηι'
    assert 'α' not in siglum_candidates('Α', 985, WORKS, SEEN)
```

Stronger: assert `recommend` on those `Site`s, and that no single-letter cand appears unless the **token** is bare-book-shaped (`BARE.issuperset(token)`).

---

### 6. `fix-siglum-and-record` on `Ζυ6. 700b` — right outcome, wrong model shape (Q6)

**Facts (verified):**

- Line `page-032-R:50–51`: Greek *φαντασία / αἴσθησις / νοῦς* + `Ζυ6. 700 b20`.
- That is De motu 700b20 → work **`Ζκ`** (698–704).
- HA ends ~638; **`Ζιι` cannot hold 700**.
- Ink (John): **double iota** → `Ζιι`, not `Ζυ`.
- Candidates: `['Ζιι', 'Ζκ']`; `recommend` → `fix-siglum-and-record` / `Ζιι` because `edit_rank==0` (ιι/υ) and `not holds(Ζιι, 700)` (`siglum_review.py:416–423`).

**Compound is the right *button* so that:**

1. `preserve` cannot bank **our** `Ζυ` as Bonitz;
2. plain `fix-siglum` to `Ζιι` alone would leave Bonitz’s wrong work unrecorded;
3. fix to `Ζκ` alone would walk **away from the ink**.

**Simpler account (architecture):** two independent facts, one pipeline order:

1. **Transcription:** ink is `Ζιι` → edit reconciled (`fix-siglum` only).  
2. **Edition:** `Ζιι` @ 700 disagrees with spans / quoted Greek → **new** book/work finding → corrigenda (`preserve` of the *corrected* form).

The compound exists because the review UI is **one shot** and `recommend` must not leave either half on the floor. A two-pass model (fix-to-ink, then re-run `siglum_check` / `book_spans`) is simpler and avoids a special verdict. The special verdict is a **UI compression of that sequence**, not a third kind of truth.

Only this site fires compound today — the rank-0 confusion that fails `holds` is essentially the `ιι`/`υ` family after `ς`/`ϛ` was siphoned to plain `fix-siglum`.

---

## Extra defect (related, not in Q1–6)

**20 Latin-homoglyph citations** (`how=='latin'`: `Pα`, `Hε`, `MA`, …) are **neither** in the 26 nor auto-applied. `resolve` labels them; `sites()` only queues `unresolved` + missing-book gaps. Same “identical ink, wrong codepoint” logic as `ς→ϛ`, but stranded.

---

## Rules I could not break

1. **Final sigma in a book-numeral slot has no numeric reading** — corpus agrees; stigma is the only numeral-6 encoding. Policy holds. (Process of overriding preserves does not.)
2. **`Ηε10. 1835b12–1136a3` → 1135** — impossible page, unique 1-edit in book ε, range end already printed. Force is justified.
3. **`Τδ` → `τδ` as sole holding case-fold** — under current inventory/spans, no second holding form.
4. **Compound needed at `Ζυ@700` so `preserve` cannot bank our misread** — outcome correct even if two-pass is cleaner.
5. **Cardinality split of the 18** — none is a one-candidate force under the generator as written.
6. **Keeping inheritance out of `holds()`** — the docstring’s warning is real; re-folding still destroys ranking.

---

## Rules that do break (summary)

| Rule | Break |
|------|--------|
| Force whenever held is impossible and \|cands\|==1 | Ignores **preserve**; circular on our generator; John already preserved 3/8 |
| Treat owner-injected singleton as forced | `οβ→Ρα` at distance 2 |
| Treat Π/Ρ and χ/κ singletons as forced | Distinct glyphs; ink can match held form |
| `numeral_fix` apply after human preserve | Corpus/rulings diverge on authority |
| “One candidate ⇒ nothing to adjudicate” for page digits generally | True only when the page is non-Bekker **and** siglum is not in doubt (Ηε stronger than σ) |

**Practical force set I would trust without a crop:** `Ηε→1135`, maybe `Πζ→1320`, `Τδ→τδ`, and **ς→ϛ as encoding** (with preserve-ledger reconciliation). **Not** Πβ, οβ, σ, Πγ, χ.

Continue this thread: grok -c   (in /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz)
