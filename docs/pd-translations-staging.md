# PD translation expansion — staging plan

Adding additional public-domain English translations to works **already on the
site**. Research compiled 2026-06-27 (source-availability sweep across Perseus,
MIT ICA, Gutenberg, Standard Ebooks, Wikisource, OLL, Internet Archive).

> **Scope.** Second/third translations of existing works only. New works
> (Athenian Constitution, Problems, Magna Moralia, etc.) and dubia/spuria are a
> separate later effort. De Anima/Smith and Poetics/Fyfe stay as-is (grey-area
> copyright accepted; MIT Classics hosts both).

## Key framing — Bekker numbers are NOT the gate

The pipeline gloss-aligns **unmarked** translations onto the Greek spine as its
normal path (Ross, Jowett, Thompson, Mure, etc. carry no inline Bekker). So
"no Bekker numbers" is the **default case**, not a blocker. Inline Bekker
(Ellis, Williams, Welldon margins) only gives the aligner free high-grade
anchors — a bonus.

**The real gate is text cleanliness:**
- **READY** — human-proofread text exists (Gutenberg / Standard Ebooks / MIT ICA
  / curated Wikisource / OLL). Vendor → gloss-align → register. No OCR.
- **CLEANUP** — only raw OCR exists (incl. archive.org `_djvu.txt`), English-only.
  Needs a correction pass but no Greek-script contamination to fight.
- **OCR-HARD** — scan-only, Greek interleaved on the page, OCR badly contaminated.
- **EXCLUDE** — not a verbatim translation (commentary or amplified paraphrase).

archive.org full-text counts as **CLEANUP, never READY** — it is unproofread
auto-OCR (running heads, hyphen breaks, ſ→f, mangled Greek) that *reads* like
text but carries silent errors.

---

## Batch A — READY drop-ins (clean text, no OCR)

Highest value per unit effort. Each is: vendor per-book HTML → run gloss-aligner
→ add manifest `secondary`/`third` + works.ts entry.

| # | Translation | Work(s) | Clean source | Bekker | Notes |
|---|---|---|---|---|---|
| A1 | **O. F. Owen, Organon (1853, Bohn)** | Cat, Int, APr, APo, Top, SE | Wikisource `Organon_(Owen)` (per-work subpages) | none | **Highest leverage: 2nd translation for SIX logic works at once.** ⚠️ flagged "incomplete" — verify all 6 fully transcribed before ingest; fall back to Vol.1/2 djvu for gaps. |
| A2 | **W. Rhys Roberts, Rhetoric (Oxford, 1924)** | Rhet | MIT ICA `Aristotle/rhetoric` (+ `.mb.txt`) | none | The Oxford-Translation Rhetoric. Same MIT-sourced shape as existing `*-smith` etc. Wikisource alt copy exists. |
| A3 | **S. H. Butcher, Poetics (1895)** | Poet | Gutenberg #1974 / MIT / Wikisource (3 clean copies) | none | Cleanest item in the whole set. |
| A4 | **D. P. Chase, NE (1847)** | EN | Gutenberg #8438 (Wikisource mirror) | none | Strip the Everyman J.A. Smith intro. EN already has 3 — adds a 4th classic. |
| A5 | **F. H. Peters, NE (1881)** | EN | Standard Ebooks (Peters) | dropped | Original had Bekker margins; Standard Ebooks omitted them. Clean prose. |
| A6 | **William Ellis, Politics (1776/1912)** | Pol | Gutenberg #6762 | **inline** `[Bekker 1252a]` | Standout: clean **and** inline (page-level) Bekker → best auto-anchor of the set. |
| A7 | **Edwin Wallace, De Anima (1882)** | DA | Wikisource `Aristotle's_Psychology` (English-only transcription) | none | ⚠️ transcribed-not-validated; one fetch truncated mid-Bk II — verify completeness vs scan. |
| A8 | **E. S. Bouchier, Posterior Analytics (1901)** | APo | OLL `bouchier-posterior-analytics` + Wikisource | verify | Short (~145pp), self-contained. (APo also gets Owen via A1.) |
| A9 | **Richard Cresswell, History of Animals (1862, Bohn)** | HA | Gutenberg #59058 (1887 Bell repr.) | none | Human-proofread, complete 10 books. Wikisource is a stub — use Gutenberg. |

## Batch B — CLEANUP (English-only OCR, light correction pass)

Worth doing but each carries an OCR-correction cost. No Greek-script
contamination, so a single proofreading pass per work.

| # | Translation | Work(s) | OCR source | Bekker | Effort flag |
|---|---|---|---|---|---|
| B1 | **W. A. Hammond, De Anima + Parva Naturalia (1902)** | DA + Sens/Mem/Somn/Insomn/DivSomn | IA `aristotlespsycho00aris` djvu | inline (`412b 18`, OCR'd b→6) | **Bonus: also yields a 2nd translation for the 5 Parva Naturalia works.** Split at translation p.145 (PN start). Fix systematic b→6/a→4 suffix errors. |
| B2 | **J. H. M'Mahon, Metaphysics (1857, Bohn)** | Meta | IA `metaphysicsaris01arisgoog` djvu | none | English-only, light cleanup; garbled front matter (skip it), solid body. |
| B3 | **J. E. C. Welldon, Rhetoric (1886)** | Rhet | IA `rhetoricaristot00arisgoog` djvu | **margins** | Has Bekker margins (bonus). De-hyphenate, strip headers, fix Greek mojibake. |
| B4 | **R. C. Jebb (ed. Sandys), Rhetoric (1909)** | Rhet | IA `rhetorictranslat00arisuoft` djvu | verify | English-only (not Greek-facing). Confirm Bekker present in djvu before relying. |
| B5 | **Ingram Bywater, Poetics (Oxford, 1909)** | Poet | IA `aristotleonarto00aris` djvu | margins (print) | Wikisource transcription only ~25% & unproofed — don't use. OCR the IA scan. The canonical Oxford Poetics. |
| B6 | **Robert Williams, NE (1869)** | EN | IA `nicomacheanet00aris` djvu | **margins** | English body clean-ish, Greek corrupted; verify margin numerals are Bekker vs his own divisions. |
| B7 | **J. E. C. Welldon, NE (1892)** | EN | IA `nicomacheanethic009599mbp` djvu | footnotes only | Heavy paraphrase; Bekker lives in footnotes not margins. Lower value (EN already rich). |
| B8 | **J. E. C. Welldon, Politics (1883)** | Pol | IA DLI `in.ernet.dli.2015.216306` | footnotes only | Worst scan quality of the Politics pair (DLI). Lower priority. |
| B9 | **Wicksteed & Cornford, Physics I–IV (Loeb, 1929)** | Phys | IA `in.ernet.dli.2015.183335` djvu | margins | English OCR clean but **facing-page Greek** — filter even/odd pages. Covers only Bks I–IV. Use 1929 ed. (1957 reprint is lending-locked). |

## Batch C — OCR-HARD (defer unless specifically wanted)

| # | Translation | Work(s) | Why hard |
|---|---|---|---|
| C1 | R. D. Hicks, De Anima (1907) | DA | Greek+English facing pages **and** a long Greek-script commentary that bleeds mojibake into the English. Needs page-segmented extraction or re-OCR. We keep Smith anyway → low priority. |
| C2 | Thomas Taylor, Physics / Cael / GC (1806–07) | Phys, Cael, GC | Archaic English, dirty early-19thc scans, bundled multi-treatise volumes (Physics = Works Vol.I 1806; Cael+GC+Meteors = 1807 vol). Hard to isolate clean per-treatise scans. Low value (archaic). |

## Batch D — EXCLUDE (not verbatim translations)

| Item | Reason |
|---|---|
| E. M. Cope, Rhetoric (1877) | Greek text + English **commentary**, no continuous translation to harvest. |
| Lane Cooper, Poetics (1913) | "Amplified version… for students of English" — interleaves paraphrase/pedagogy; not verbatim. |

---

## Coverage gained (if Batches A + B land)

| Work | Currently | Adds | New total |
|---|---|---|---|
| Categories | Edghill, Taylor | Owen | 3 |
| De Interpretatione | Edghill, Taylor | Owen | 3 |
| Prior Analytics | Jenkinson | Owen | 2 |
| Posterior Analytics | Mure | Owen, Bouchier | 3 |
| Topics | Pickard-Cambridge | Owen | 2 |
| Sophistical Refutations | Pickard-Cambridge | Owen | 2 |
| De Anima | Smith | Wallace, Hammond | 3 |
| Sens/Mem/Somn/Insomn/DivSomn | Beare | Hammond | 2 each |
| Metaphysics | Ross | M'Mahon | 2 |
| Physics | Hardie & Gaye | Wicksteed–Cornford (I–IV) | 2 (partial) |
| History of Animals | Thompson | Cresswell | 2 |
| Rhetoric | Freese | Roberts, Welldon, Jebb | 4 |
| Poetics | Fyfe | Butcher, Bywater | 3 |
| Nicomachean Ethics | Rackham, Ross, Ostwald | Chase, Peters (+Williams, Welldon) | 5–7 |
| Politics | Jowett | Ellis (+Welldon) | 2–3 |

---

## Per-translation add recipe (same for every item)

Mirrors `ADDING-A-WORK.md` "two or three translations" path. No frontend code.

1. **Vendor source** → `sources/<slug>-<translator>/book-0N.html`, one file per
   book, `<HTML><BODY>` + `Part N` (or bare-number) chapter markers, plain prose.
   - READY items: fetch the clean HTML/text, split by book, strip apparatus
     (intros, notes, footnote markers).
   - CLEANUP items: pull the `_djvu.txt`, run the correction pass (de-hyphenate,
     strip running heads/page numbers, fix the systematic OCR errors noted),
     split by book.
2. **Gloss-align** → produce `sources/<slug>-<translator>/anchors.yaml`
   (`{bekker, at: "verbatim phrase"}`) via the existing gloss-aligner. For Ellis
   (A6) and the margin-Bekker items, seed/validate anchors from the inline
   numbers instead of (or alongside) gloss alignment.
3. **Manifest** → add `english.secondary` (or `.third`) block to
   `manifests/<SLUG>.yaml`: `id`, `name`, `dir`, `books`, `marker`, `anchors:`.
4. **Register** → add a `translations[]` entry in `app/src/lib/works.ts`
   (`id`, `name`, `short`, `slot: 'ross'` for 2nd / `'third'` for 3rd; a `third`
   slot also needs the shared slot definition).
5. **Build & spot-check** → `aristotle_pipeline all --work <SLUG>`, then
   `npm run build`; verify chapter/anchor placement at a couple of canonical
   Bekker points.

Owen (A1) and Hammond (B1) each fan out to multiple works — vendor once, then do
steps 2–5 per target work (each work reads its own book-range slice).

## Open verification items (do before ingesting)

- **A1 Owen** — confirm all 6 Organon works fully transcribed on Wikisource (flagged incomplete).
- **A7 Wallace** — confirm Bk II–III complete (one fetch truncated).
- **A8 Bouchier / B4 Jebb / B5 Bywater** — confirm whether Bekker present in the source before counting on inline anchors.
- **B6 Williams** — confirm margin numerals are Bekker, not Williams's own section numbers.

## Suggested sequencing

1. **A3 Butcher (Poet), A2 Roberts (Rhet), A6 Ellis (Pol), A9 Cresswell (HA),
   A4 Chase + A5 Peters (EN)** — all clean, independent, fast. Good first batch
   to validate the secondary-translation flow end-to-end on easy inputs.
2. **A1 Owen** — one source, six works; biggest coverage jump. Do after the flow
   is proven, and after the completeness check.
3. **A7 Wallace + A8 Bouchier** — clean, pending their verification checks.
4. **Batch B** — schedule the OCR-cleanup items; B1 Hammond first (unlocks Parva
   Naturalia ×5 + DA), then B2 M'Mahon, B5 Bywater, B3/B4 Welldon/Jebb Rhetoric.
5. **Batch C** — only on explicit request.
