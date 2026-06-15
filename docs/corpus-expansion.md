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
DECISION (John 2026-06-15): **display Tredennick + Ross.** PD risk accepted for
now; the Tredennick TEI is "clutch" (Bekker-milestoned). Build it in but keep it
toggleable so Tredennick can be withheld from the public deploy until John clears
the risk (or it goes PD in 2029). → Metaphysics mirrors NE: Tredennick = primary
(perseus_tei, real ticks from TEI), Ross = secondary (aligned via aligner, with
Tredennick as the Bekker reference). Aligner port: YES.

## Build steps per work
1. Vendor TEI (done for 009/025/035/038; 029/045 dropped as spurious).
2. `manifests/<SLUG>.yaml` (copy Poet/DA; seed Bekker book ranges, stage2 corrects).
3. `python -m aristotle_pipeline all --work <SLUG>`; spot-check canonical anchors.
4. Register in `app/src/lib/works.ts`; `npm run build`; commit.

## Remaining authentic Tier-A (after Metaphysics)
Politica (035, 8 bk), Rhetorica (038, 3 bk). Eudemia (009) — shares books with NE.

## Aligner port — status ✅ COMPLETE
Package ported + generalized (110de85), then wiring finished this session:
1. ✅ `stage1_ross.build_chunks(spine, chapters, prose, align_map=None)` — real-
   tick logic restored from main (`_load_align_map(work_id, version_id)`,
   `_real_ticks`, anchor-based column cuts; `_REAL_CONF={certain,reliable}`).
   `run()` reads `english.secondary` via `reference.default_target` (NE Ross
   fallback) for the prose + version id, loads `{work}_{version}_map.json`.
2. ✅ `__main__._stage1` (else branch): after `stage1_english.run`, calls
   `align(work_id, version_id, target_prose=prose)` before `stage1_ross.run`.
3. ✅ `EN.yaml` `english.secondary` block (id ross, dir ross, books 10).
Regression: EN build is byte-identical to shipped main (276 real ticks among
1327; stage2 PASS, stage3 key_failures=0).

## Metaphysics build — ✅ BUILT + REGISTERED
- Ross vendored: MIT archive `metaphysics.<n>.<roman>.html` per book →
  `sources/meta-ross/book-01..14.html` ("Part N" markers, parsed with marker
  `part`). 142 chapters, counts match grc TEI sections exactly.
- `manifests/Meta.yaml`: tlg_work 025, Tredennick (perseus eng2) primary via the
  perseus path, Ross secondary (meta-ross), grc_tei section chapter override, 14
  canonical Bekker book ranges (derived from TLG line seq cut at grc book divs).
  `expected_line_gaps`: 993a (28 skip) + 1029b (Z.1 transposition, non-monotonic
  3..12,1,2,13..). proper_names: Socrates/Anaxagoras/Empedocles (Plato omitted —
  Tredennick over-supplies it in Books M–N).
- Enablers: `config.perseus_eng()` generalized (work.english_source / tlg_work,
  no longer tlg010-hardcoded); stage3 strips `|` verse-divider (Empedocles frr.).
- `all --work Meta` clean: stage2 PASS, key_failures=0, 14 books emitted.
  Spot-check Λ/12 1072a25 ἔστι τι ὃ οὐ κινούμενον κινεῖ ✓ (unmoved mover; Ross
  real tick at 1072a1). Registered in works.ts (Greek-letter book labels). App
  builds, all 14 pages prerender.
- ⚠ Tredennick US-copyright to 2029 — built in as primary but withhold from the
  public deploy until John clears (toggle/registry gate still TODO if deploying).

## Politics (035) — ✅ BUILT + REGISTERED
8 books. Rackham (perseus eng2) primary, Jowett (MIT archive) secondary aligned
via Rackham. Spot-checks + warts:
- **Chapters via section milestones, not divs.** Politics' grc TEI has NO chapter
  `<div>`s — chapters are `<milestone unit="section" resp="Ross">` (103, reset per
  book; counts match traditional chapters 13,12,18,16,12,8,17,7). Generalized
  `stage1_chapters`: `chapter_marker: milestone` reads section milestones, carries
  each milestone's Bekker (col,line) as an authoritative fallback when the opening
  text's orthography diverges from the spine (3 chapters needed it).
- **Jowett markers are "Part <Roman>"** → new `part_roman` marker + Roman→int in
  `stage1_ross`.
- **Jowett Book 5 = 11 chapters to Ross's 12** (Jowett folds/omits the closing
  Plato critique 1315b10ff). Per John: keep Ross's numbering; Ross-ch12 of book 5
  carries no Jowett overlay (degrades to empty, no crash).
- **Rackham TEI can't pair 8 columns**: omits Bekker page milestones for
  1254b/1279a/1297a/1297b/1314b (English merged into preceding column) and assigns
  book-straddling 1301a/1323a/1337a to one book. New manifest key
  `alignment_allow_unmatched` lists them so stage2 surfaces-but-tolerates;
  aligner `reference.resolve_idx` snaps missing cols to the preceding chunk.
- stage3 now strips ‘ (U+2018) opening-quote (poets quoted in Politics).
- Clean build (stage2 PASS, key_failures=0). Registered in works.ts (Roman I–VIII,
  Rackham+Jowett). App prerenders 8 pages. ⚠ Rackham US-copyright ~2027 — withhold
  from public deploy like Tredennick.

## Per-work progress
- Poetics (034) ✅ built+registered (pre-existing)
- Aligner port ✅ wiring complete
- Metaphysics (025) ✅ built + registered
- Politics (035) ✅ built + registered
- Next authentic Tier-A: Rhetorica (038, 3 bk). Eudemia (009) shares books w/ NE → defer.
