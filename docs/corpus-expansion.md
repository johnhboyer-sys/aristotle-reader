# Corpus expansion — adding Aristotle works

Working doc for the 2026-06-15 push to add as many works as feasible. Branch
`feat/complete-works-da` (the registry-driven multi-work site). Recipe:
[`ADDING-A-WORK.md`](../ADDING-A-WORK.md). NB: the just-shipped **translation
aligner lives on `main`, not here** — these works use the Perseus Bekker-
milestoned English path (NE-grade) or the First1KGreek + MIT-archive path (DA).

## Data on hand
- **Greek spine:** whole-author Diogenes export cached at
  `build/export/Diogenes-Resources/xml/tlg/tlg0086NNN.xml` (works 001–056). No
  TLG re-export needed. Spine needs `type="Bekker-page"` divs + numeric `<l n>`.
- **Perseus TEI** (grc2 + eng2, both Bekker-milestoned) available for 9 Aristotle
  works: 003, 009, 010(NE), 025, 029, 034(Poetics), 035, 038, 045.
- Network reachable; vendor TEI into `sources/`.

## Feasibility (Bekker-lineated Greek + a chapter/English source)

### Tier A — Perseus grc+eng (best, reuses NE path)
| TLG | slug | work | Bekker cols | books | status |
|---|---|---|---|---|---|
| 010 | EN | Nicomachean Ethics | 176 | 10 | ✅ built (shipped on main) |
| 002 | DA | De Anima | 68 | 3 | ✅ built (First1K+MIT path) |
| 034 | Poet | Poetics | 32 | 1 | ✅ built + registered |
| 045 | Virt | De virtutibus et vitiis | 6 | 1 | ⏳ simplest new |
| 029 | Oec | Oeconomica | 22 | 3 | ⏳ |
| 038 | Rhet | Rhetorica | 133 | 3 | ⏳ |
| 035 | Pol | Politica | 182 | 8 | ⏳ |
| 025 | Meta | Metaphysica | 228 | 14 | ⏳ big |
| 009 | EE | Ethica Eudemia | 72 | 8* | ⚠ shares books IV–VI with NE V–VII; defer |

### Tier B — Greek only (need First1KGreek chapters + MIT-archive English)
Big biological/logical works with Bekker Greek but no Perseus TEI: Historia
animalium (306), Problemata (218), Physica (172), Analytica (154), De gen.
animalium (150), Topica (130), De partibus animalium (118), Meteorologica (106),
De caelo (92), De gen. et corr. (50), Sophistici elenchi (42), Categoriae (30),
De interpretatione (18), De motu animalium (14), De memoria (9), etc.

### Excluded
Athenaion Politeia (003 — not Bekker-paginated), Magna moralia / Protrepticus /
fragments (no Bekker divs).

## Strategy (per John, 2026-06-15)
- **Authentic works only** — drop works of dubious authorship: Oeconomica,
  De virtutibus et vitiis, Problemata, De mundo, Mechanica, Magna Moralia,
  Rhet. ad Alexandrum, the minor spuria. (Oec manifest deleted.)
- **Big works first** — they drive interest. **Metaphysics is the priority.**
- **Gradual git rollout**, one work per commit/checkpoint.
- **Metaphysics should feature multiple translations** to showcase the project's
  alignment value-add.

## Aligner port (prerequisite for multi-translation)
The translation aligner shipped on `main` only. To show any *unmarked* PD
translation with real Bekker ticks, port `pipeline/aristotle_pipeline/align/`
here and generalize it (currently NE/Rackham-hardcoded) to: work-scoped, with the
Bekker-milestoned Perseus eng as the alignment *reference*. Then each work can
carry N translations: the milestoned one (if PD) shown directly + unmarked PD
ones aligned to it.

## Metaphysics (025) — target, 14 books, chapter_subtype: section
Translations:
- **W. D. Ross (1924)** — PD, gold standard, MIT archive (unmarked → align).
- **Hugh Tredennick (Loeb 1933)** — Perseus eng2, Bekker-milestoned. Great
  alignment *reference*, but **US copyright until 2029** → scaffold only, do not
  publish as display text unless licensing cleared.
- **J. H. M'Mahon (1857)** — PD, archaic (optional 3rd).
DECISION NEEDED: which translations to display; whether to port aligner now.

## Build steps per work
1. Vendor TEI (done for 009/025/035/038; 029/045 dropped as spurious).
2. `manifests/<SLUG>.yaml` (copy Poet/DA; seed Bekker book ranges, stage2 corrects).
3. `python -m aristotle_pipeline all --work <SLUG>`; spot-check canonical anchors.
4. Register in `app/src/lib/works.ts`; `npm run build`; commit.

## Remaining authentic Tier-A (after Metaphysics)
Politica (035, 8 bk), Rhetorica (038, 3 bk). Eudemia (009) — shares books with NE.

## Per-work progress
- Poetics (034) ✅ built+registered (pre-existing)
- Metaphysics (025) — in progress
