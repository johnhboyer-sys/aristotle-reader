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

## Plan
1. Vendor Perseus grc2+eng2 for Tier-A candidates → `sources/`.
2. Per work: `manifests/<SLUG>.yaml` (copy DA/Poet; seed standard Bekker book
   ranges, let stage2 correct), `python -m aristotle_pipeline all --work <SLUG>`,
   spot-check canonical anchors, register in `app/src/lib/works.ts`, `npm run build`.
3. Order easiest→hardest: Virt → Oec → Rhet → Pol → Meta. EE last (shared books).
4. Commit per work.

## Per-work progress
- (filled in as works land)
