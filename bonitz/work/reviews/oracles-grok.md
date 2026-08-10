=== grok delegate result ===
mode:    read-only (plan)
effort:  high
stop:    end_turn
session: 019febd0-027a-7c80-8b78-3c5f298deea5

I'll adversarially review the three arbitration modules at high effort: read the sources, John's rulings, and the corpus evidence, then attack each claim with concrete counterexamples.Next I'll run the three modules and probe the corpus for false positives, John's rulings, and the 23 locate proposals.Strong leads on αὐτοί and οἶα. Digging into those and the locate proposals that look wrong.The file gained new guards since the first read. Re-checking `decide()` and the strip-collapses-ἢ/ἡ locate bug.# Adversarial review: breathing_oracle · locate · ngram_check

Read-only. Evidence from the modules, `work/rulings/john.json`, `work/reconciled`, and `build/dist`. Ranked worst first.

---

## 1. WORST — `locate.strip` erases ἢ/ἡ and invents a unique match  
**`locate.py:44–48`, used at `119–128`; concrete false proposal `page-015-R:18`**

Bonitz prints:

```text
βέλτιον ϗ̀ θειότερον ἡ ἀρχὴ ἢ κινȣ͂σα Ζγβ1. 732a3, 7
```

That is ἡ ἀρχὴ **ἢ** κινοῦσα (principle **or** the moving…). After `strip()`:

```text
η αρχη η κινουσα
```

Aristotle at **GA 788a5** (voice after castration) has ἡ ἀρχὴ **ἡ** κινοῦσα. Same stripped string. Unique in the corpus → locator proposes **788a5**.

What is actually at 732a3 is different Greek (“βελτίονος δὲ καὶ θειοτέρας τὴν φύσιν…”). The hit is another formula, another book-section, manufactured by diacritic loss.

**Uniqueness is not enough.** A unique *stripped* phrase can still be the wrong passage when:
- particles/relatives collapse (ἢ/ἡ/ἥ/ᾗ → η),
- Bonitz paraphrases or drops a word,
- Aristotle reuses a short formula.

This is the fifth “authority claims more than evidence” pattern: **a unique match under a lossy key is still a guess**.

---

## 2. `breathing_oracle.decide` still decides when the skeleton is one word and the page is another  
**`breathing_oracle.py:120–151` (exact-form short-circuit + skeleton majority)**

The ἐξ/ἕξ fix only silences when **both** breathings appear under the skeleton, **or** (new) when the **exact** form is already in Aristotle. If Aristotle has only one of two real lemmas, the other is condemned.

| Input | `decide()` | Why wrong |
|--------|------------|-----------|
| **αὑτοί** (reflexive nom.pl.) | `smooth` via αὐτοὶ 153× | Corpus has **no** rough nom.pl.; αὑτοῖς/αὑτούς exist, but **αὐτοί** skeleton is all smooth → legitimate αὑτοί is “wrong” |
| **οἶα** (from οἶος “alone”) | `rough` via οἷα 39× | οἷον/οἶον both attested → silent; **οἶα** only has rough οἷα → forces rough |
| **ἁρά** (curse) | `smooth` via ἄρα 541× | Real rough lemma, unattested in corpus |
| **ἅιδης** (lowercase Hades) | `smooth`, LSJ ἀϊδής | Proper-noun guard is only `word[:1].isupper()` at **160–161**; lowercase name falls through LSJ |
| **ἀλή** / **ἡμι** / **ἡμαρ** | LSJ ἁλή / ἠμί / ἦμαρ | Line-end **hyphenation** (`ἀλή-` / `θείαν`, `ἡμι-` / `πόνηρος`, `ἡμαρ-` / `τημένη`) treated as whole words |

`--check` reports ~5,919 confirm / 51 disagree. Many of the 51 are real smooth→rough OCR errors (ἁφή, ἁπτόμενον, ἕκαστον). The structural holes above still mean **decide() will auto-“fix” legitimate forms** if they ever appear in a dispute.

Recent exact-form short-circuit (`120–123`) fixes ἕκτος/ἐκτός when LSJ has both, and makes `decide('ἐξ')` return smooth by identity — but **breaks the module’s own tests** (`test_it_refuses_a_word_aristotle_writes_both_ways` — 6 failures). Contract and code no longer agree.

Hapax skeleton votes: **10,622** deciding skeletons rest on a single token. One edition choice becomes law for every Bonitz form with that skeleton.

---

## 3. Work-range + adapted quote: SE 172a “found” at Phys 184a  
**`locate.py:143`; `page-045-L:50`**

Bonitz: `ἀλλὰ τά γε πρῶτα ϗ̀ τὰς ἀρχάς τι11. 172 a19`

Our SE 172a19: `ἀλλὰ τά γε πρῶτα καὶ τὰς **οἰκείας** ἀρχάς`  
Phys 184a13: `τὰ πρῶτα καὶ τὰς ἀρχάς` (no οἰκείας)

Bonitz’s shorter wording is unique as stripped text at Physics.  
`works['τι']` is SE **lo=164, hi=184**, so `holds(184)` is **True**. Physics also starts at 184. Same-work guard **does not separate** SE’s last page from Physics’ first.

So the locator proposes a “same-work” move that is really **cross-work at the Bekker seam**, for an **abridged** quote. Do not show this to a human as a fix.

---

## 4. Most of the 23 “near” proposals should not be auto-proposed  
**`locate.py:119–146`; all 23 rechecked against reconciled + dist**

### Do **not** propose (wrong, redundant, or edition/formula)

| Site | Bonitz | Proposes | Why reject |
|------|--------|----------|------------|
| **015-R:18** | Ζγβ1. 732a | GA 788a5 | strip ἢ/ἡ; wrong passage (voice) |
| **045-L:50** | τι11. 172a | Phys 184a13 | abridged quote; SE/Phys page 184 overlap |
| **017-L:44** | Ργ9. 1409b32 | Rhet 1419b25 | Bonitz **already** cites `19. 1419b25` next line |
| **022-L:20** | 1384a23 | 1383b13 | already lists `1383 b14` |
| **024-L:3** | Φδ4. 212a12 | Phys 189b7 | already lists `Φα6. 189b7` next line (212a is wrong, but human already has the right parallel) |
| **027-R:4** | 837b26 | 839b21 | already lists `839 b20` |
| **031-R:59** | ψγ7. 431a5 | DA 417b7 | already lists `β5. 417b2` |
| **032-L:4** | ψγ8. 431b | DA 424a18 | already lists `β12. 424 a18` |
| **037-R:21** | 421b4 | 422a23 | already lists `10. 422a23` |
| **045-L:41** | Αα29. 45a | APr 27b19 | already lists `27 b19`; formulaic Prior Analytics language |
| **046-L:8** | Αβ5. 57b | 59a32 | already lists `7. 59 a32` |

Pattern: **Bonitz multi-cites; exact modern text sits at one of them.** Treating the first number as an error and “relocating” duplicates work Bonitz already did and trains a human to rubber-stamp uniqueness.

### Plausible digit / a↔b slips (weaker objection; still not auto-apply)

015-R:8 (191a→192a), 015-R:38 (1094a→1095a), 029-R:3 (**529a→521a**, real 2/9-style slip for αἱμορροΐς/ἕδρα), 030-R:62, 031-R:26 (798b→793b), 032-L:20 (454b / phrase starts 454a32), 032-R:6, 035-L:10, 036-L:51, 039-L:23/26, 045-R:56. These are the only ones worth a human queue — as **suggestions**, not settlements.

**Uniqueness alone is not enough.** Guards missing: digit distance, “already listed nearby,” diacritic-sensitive match, and non-overlapping work ranges at Bekker seams.

---

## 5. `quoted()` takes analytical / multi-lemma Greek as if it were the quotation  
**`locate.py:75–83`**

Cut is only `[.;·]|[A-Za-z]{2,}`. Greek-lettered sigla do not cut by themselves (periods after full cites usually do).

Wrong-span / non-quotation examples:

- **`page-016-L:32`**: `ἵππος ἀγαθὸς δραμεῖν, μαθεῖν Ηβ5…` → quoted `ιππος αγαθος δραμειν μαθειν` — headword-style lemma list, not one continuous quote.
- **`page-016-L:47`**: `φίλος, ὀρεκτὸς αὐτὸς αὑτῷ` — same.
- **`page-019-R:25`**: `…τεροι, Ξενοφάνης ϗ̀ Μέλισσος ΜΑ5…` — proper names as subjects of the entry, not a citation span of one passage.
- **`page-015-R:18`**: after `Κ12.14b4.` cut is correct, but the remaining Greek is **Bonitz’s own analytical** phrasing, not a continuous Aristotle sentence (then strip makes it look like one).

I could **not** show bleed *across* two Greek cites with **no** period between them on these pages (shown=0); the period after `…a17.` usually saves multi-cite lines. The failure mode that bites is **“everything since last Latin/stop is the quote,”** including headwords and analytical Greek.

---

## 6. Q2 — John’s 18 breathings, independent check

All 18 with `'breathing' in ruled`:

| Result | Count |
|--------|-------|
| `decide(form)` breathing matches form | **17** |
| No match | **1**: `αλλα` at 032-L:1 |

**αλλα** (`kind: declined`, preserve printer error, no breathing/accent): `decide` → smooth via ἀλλὰ 2996×. Linguistically right; John forbade repair. **Properly excluded from auto-apply**, not a quiet wrong ruling.

There is **no** second failure under the Aristotle index. Docstring claim *“16 of 18 … eighteenth LSJ has no headword”* (`breathing_oracle.py:9–12`) is **stale**. Reality: **17/18**, one intentional decline.

Test only requires `>= 14` of 18 (`test_breathing_oracle.py:68`) — too weak to guard the claim.

---

## 7. Q5 — ngram_check: not just bad chunking; class is only partly separable

Measured: **4,451 hit / 4,516 miss = 50.4%** miss on 3-grams (pages 15–52).

Of first 2,000 misses: **~71%** have every word in Aristotle separately; the **sequence** never occurs. Sample pages 15–29: **~58%** of misses touch line-wrap/hyphen fragments (`επεκ`, `αβρω`, …).

What is mixed into “quotation” chunks today:

| Kind | Signal | Example |
|------|--------|---------|
| Continuous quote | Greek run before a full cite | often real 3-grams |
| Headword + place | Capitals, entry start | `Ἄβα ἡ Φωκική` |
| Analytical pairs | Bonitz’s own collocations | `ἀβελτερία καὶ νωθρότης` |
| Latin editorial | `sim/cf/opp/dist/act/pass` | BREAK catches many; not structure of entries |
| Hyphen wraps | line ends `-` | manufactures non-words |
| Abbreviated sigla | `φ 2`, bare book tokens | CITE needs fuller cite form |
| Paraphrase | fluent Greek, no cite on same line | looks like Aristotle |

**Reliable structural positives (partial):** em-dash sense breaks, Latin editorial lexicon, full Bekker cites, comma-separated lemma lists (commas already break).

**Not reliable:** “continuous Greek between breaks” — that is exactly Bonitz’s analytical Greek. John’s design (chunk so snippet joins do not invent sequences) is right; **identifying which chunks are quotations is not solved by better windows alone.** Without a human or a much richer entry grammar, this class is **only semi-machine-separable**. A 50% miss rate is not a threshold bug; it is the prior that most Bonitz Greek runs are not continuous Aristotle.

---

## 8. Q6 — Fifth overclaim (and cousins)

| # | Pattern | Where |
|---|---------|--------|
| 1–4 | (your four: LSJ-only, first occurrence, cross-work relocate, accept-every-letter) | prior |
| **5** | **Unique match under a lossy key treated as identity** (strip; skeleton majority; LSJ single headword) | `locate.strip` + uniqueness; `decide` skeleton vote; lowercase LSJ |
| 6 | **Exact form in corpus confirms itself** even when skeleton is ambiguous — tests still demand silence | `decide` 120–123 vs tests |
| 7 | **Same-work = Bekker page in [lo,hi]** treats SE 184 and Phys 184 as one work | `locate` 143 + inventory |
| 8 | **“16 of 18” / “decides 5919”** sold as settled authority | module docs / `--check` framing |

---

## What I could **not** break

- **ἐξ/ἕξ-style silence when both breathings are attested under the skeleton** — works for αὐτόν/αὑτόν, εἰς/εἷς, ὅρος/ὄρος, etc.
- **LSJ multi-breathing refuse** (ἕκτος/ἐκτός) — `decide('ἕκτος') is None` after the new guard.
- **Uppercase proper-noun LSJ block** — `Ἅιδης` → None (lowercase still broken).
- **Cross-work relocate filter** when ranges do not share pages — still holds for the Politics/HA class of mistake you already fixed.
- **Common-phrase non-uniqueness** — `ὡς ἐπὶ τὸ πολύ`-type phrases correctly stay unplaceable rather than first-hit guessing.
- **Majority of high-count rough lemmas** (ἁφή, ἁμαρτία, ἕκαστον as OCR flags) — disagree list is mostly real ink errors, not ghosts.

---

## Plain recommendations (no code written)

1. **Do not auto-apply** breathing or locate without a human for anything that is not “exact form already in Aristotle” or “digit ±1 same work and phrase diacritic-aware.”
2. **locate:** match with breathings/accents at least for ἢ/ἡ/ἥ; require digit proximity; suppress if found page already appears in ±2 lines of cites; split work ranges so 184 is not both SE and Phys.
3. **breathing_oracle:** refuse skeleton vote when LSJ has multiple heads **or** when only one lemma is attested but another exists in LSJ; reject hyphen-final tokens; fix proper-noun test to skeleton/lemma, not `isupper()`; align tests with exact-form semantics.
4. **ngram_check:** treat as exploratory noise until quotations are marked (or only score chunks that sit immediately before a resolved cite and pass a min length without entry-initial capitals). Do not use miss rate as an error rate for Bonitz.

**Bottom line:** the shared idea (outside authority settles the dispute) is sound for Bekker-unique sigla. For these three, **false positives are still cheap to generate and expensive to trust** — especially `locate`’s 23 and `decide` on non-attested homographs.

Continue this thread: grok -c   (in /Users/johnboyer/Developer/aristotle-worktrees/bonitz-40/bonitz)
