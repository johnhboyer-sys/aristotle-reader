# Handoff — dubious and spurious works

**Shipped 2026-11-07** (PR #191; gh-pages `1d3c1859`; `DEPLOY-STATUS.md` 2026-11-07).
John's goal (2026-11-06) was to make the site complete for the dubious and spurious
Bekker works. Live now:
- Problemata (`Prob`), De Spiritu (`Spir`), Magna Moralia (`MM`), De Plantis (`Plant`), Rhetorica ad Alexandrum (`RhetAl`), Athenian Constitution (`AthPol`);
- the Genie correction pass over the vol. VI works, De Mundo, VV and Oec;
- Mirabilibus and On Dreams in their printed Latin;
- Taylor's 1812 Cat./Int.;
- Barnes 1984 labels (Prob, Oec, MM dubious), under the home group "Doubtful and Spurious Works".

How the branches were joined, and the two rulings it took, are in
`docs/spurious-works/integration-2026-11-07.md`. Per-work notes:
- `docs/dubious-works.md`;
- `docs/spurious-works/` (Problemata reviews and briefs, `vol6-genie-pass.md`);
- `HANDOFF-ATHPOL.md`.

## Open follow-ups

- `?loc=…&view=english` on Bekker works scrolls to a hidden line.
- The ‖ papyrus marks are kept in the 043 (Spir) and 051 (Plant) Greek exports. Decide whether they display.
- The older gloss-aligned Bekker ticks are not print-exact (e.g. Beare's Parva Naturalia, On Dreams 459b15/20/25). This is a separate project.
- Unresolved anchors: Mirab 844b5 and 840b35, Mech 851a40.
- True indented verse is left to the redesign.
  - For now DM's 21 verse quotations are one line per `<p>`, the Rhetoric's convention.
  - Indented verse needs a `verse` marker in the source, stage 1 and stage 7 markers, the reader's flowParts, CSS, desktop, and the `shared/` copies in plato-reader and homer. The Rhetoric (Roberts) and the Poetics quote verse too.
  - Move this note into `HANDOFF-REDESIGN.md` when that file is free; another session holds uncommitted edits to it.
- Lin (Joachim): a stray Greek fragment. This is a display question.
- History Genie returned an unrelated Virgin Galactic earnings press release for Problemata page 883a (between 5.22 and 5.25): a possible leak of another customer's data. Whether to report it to History Genie is John's call. Genie is a flag-raiser only, never a witness: never copy its text.
- Plates for the six new works: branch `claude/new-work-plates-61b59e`, unmerged and not deployed.
- The desktop Rust tests were not run for this deploy; only its vitest suite was.

Problemata questions last listed as open for John (2026-11-06). Check whether they were settled before acting:
- Book 3 25a/25b and Book 19 35a/35b are each kept as one Part (`MERGE`; the recommendation was to keep them merged).
- 19.9 "y a flute" (the print reads "y").
- 23.9 "in" has no scan-A page image.

## Reference

**Genie's read of the Oxford volumes:** `sources/genie-oxford/` in the main checkout. It is untracked, and `*.txt` is gitignored. Whole-book `.txt` and `.docx` files, pages split by `---`; a per-page glob finds nothing.

| Volume file | Works |
|---|---|
| `Oxford Aristotle III 1931.txt` | DM, Spir |
| `Oxford Aristotle VI 1913 Opuscula.txt` | Col, Aud, Phgn, Plant, Mirab, Mech, Lin, Vent, MXG |
| `Oxford Aristotle VII 1927 Problemata.txt` | Prob |
| `Oxford Aristotle IX 1925.txt` | MM, VV |
| `Oxford Aristotle X 1921.txt` | Oec, Ath. Pol. (Kenyon) |
| `Oxford Aristotle XI 1924.txt` | RhetAl |

**The correction method:** diff our English against an independent read, and judge every difference on the page image. Then fix with:
- `PRINT_READS`, read off the image, which stop the build if stale;
- `VERIFY_ALLOW` entries bound to a place;
- a planted-defect self-test;
- a review by another model family.

The Problemata's `build_prob_forster.py` is the model. Its rebuild:

```
cd pipeline
uv run python tools/build_prob_forster.py --ocr-dir ../build/prob-ocr --pass1   # only if Part counts change
uv run python -m aristotle_pipeline all --work Prob
uv run python tools/build_prob_forster.py --ocr-dir ../build/prob-ocr
uv run python -m aristotle_pipeline all --work Prob
uv run python tools/build_prob_forster.py --ocr-dir ../build/prob-ocr --verify   # must exit 0
```

The OCR inputs live in `build/prob-ocr/`, which is ignored. If they are lost, download them again from archive.org: `worksofaristotle07arisuoft` and `worksofaristotle0007unse_o7n4`. Run `docs/spurious-works/dropcheck.py build/prob-ocr` from the repo root; from elsewhere it reads 0 words and says nothing is wrong.

**Lessons:**
- Both scans misread stacked fractions, and a merge cannot see an error both share.
- For the second Problemata scan, hOCR leaf N is roughly image `n(N-1)`; check the page text before trusting a crop.
- Several stage 8 runs at once crawl (35+ minutes each); run stage 8 one at a time.
- The Mac has 8 GB: at most two correction sessions at once.
- A new work renumbered `/lemma/` slugs until 2026-11-07. `sources/lemma-slugs.json` now holds them; commit it after any build that adds to it (the deploy refuses otherwise).
