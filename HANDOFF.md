# HANDOFF: corpus statistical analysis, and what it could give the reader
Generated: 2026-08-18 · Branch `claude/greek-statistical-analysis-tihpcs` · **Nothing deployed, nothing held**

## 1. Goal
A friend suggested pointing statistical/semantic tools at the Greek. That produced a
stylometry toolkit (research, not a site feature), and then — more usefully — a survey
of what these methods could actually give readers, plus a hard-won list of traps.

## 2. Current state
- **Site: untouched.** No build, no deploy, no pipeline change. Live state is exactly
  where the 2026-08-13 deploy left it; see `DEPLOY-STATUS.md`.
- **New, isolated:** `analysis/` — self-contained toolkit reading `sources/` directly.
  Writes nothing to `build/`, `app/`, `manifests/` or `pipeline/`. No site build
  depends on it. `cd analysis && python3 run_all.py` (needs only numpy).
- **New:** `docs/corpus-analysis-features.md` — **the document to read.** Eight candidate
  reader features, the licensing rule, inherited limits, and the traps section.
- Three commits pushed. Working tree clean.

## 3. What the analysis found (research, not features)
- **Ethics common books.** All ten surviving EN books, held out one at a time, classify
  against the EN and EE centroids: I–IV and VIII–X prefer the EN, **V–VII prefer the EE**
  (p = 1/C(10,3) = 0.0083). Edition-controlled by construction — the common books sit in
  Bywater's own EN file. Survives chunk sizes 1000–3000 and 200/200 random half-vocabularies.
  Agrees with Kenny 1978.
- **Authenticity.** Consensus spuria separate at AUC 0.824; 0.921 genre-matched. Main axis
  is genre, not authorship — Topics/Analytics/Physics misclassify because PC1 is logical formalism.
- **Seams.** Length-corrected, *HA* X is the most distinctive book in the corpus and is the
  one book scholarship rejects. Metaphysics Λ, Metaphysics K and Politics VII are **not** flagged.
- Full record: `analysis/FINDINGS.md`, `analysis/report.html`,
  https://claude.ai/code/artifact/0480cf4b-78ed-4395-90da-fca27a9f9828

## 4. Key decisions (and why)
- **`analysis/` is deliberately outside the pipeline.** It is research tooling; coupling it
  to the build would put experimental code on the deploy path.
- **The stylometry is not a site feature.** John's call, and correct — it is paper-shaped.
  `docs/corpus-analysis-features.md` is the site-relevant output.
- **TLG: compute on it, don't publish from it.** Terms forbid redistribution (already settled
  in `README.md` and `commentary-layer-plan.md`), but that governs strings. Frequencies, ranks,
  first-attestation dates and citations are facts. Rule: no shipped artifact should let anyone
  reconstruct TLG text.
- **Ordering:** LSJ citation linking and the text-quality gate first — both need no TLG and
  are cheap. Word-distinctiveness next. CAG anchoring when the commentary layer moves.

## 5. Traps & dead ends
The full list is in `docs/corpus-analysis-features.md` §Known traps — read it before touching
Greek text programmatically. The four that cost the most:

- **Bekker anchoring is not uniform across the TEI families.** Most First1K files have no Bekker
  at all; `<pb>` is Bekker's 1837 *volume page*, not a citation. The stable unit is the div
  hierarchy. A few files hide columns inside `<note type="marginal">`, which note-stripping deletes.
- **U+1FBF (psili) marks elision** in 6,430 places and is easy to miss; δ᾿ then never folds into δέ.
- **"One edit from a frequent word" does not detect OCR errors in Greek.** It measures inflection
  and scored a clean and a dirty text family identically. Orthographic impossibility (breathing
  in an illegal position) works: First1K 3.00/10k vs Perseus 0.92/10k.
- **Per-book distance needs a length correction** (r = −0.49 with log length). Metaphysics α
  *elatton* looked like a major outlier until corrected, then vanished.

**Text quality, newly measured:** First1K files are ~3× noisier than Perseus `grc2` — run-together
words and displaced accent glyphs. The Physics is First1K. This is a real finding for the site,
not just for the analysis.

**A methodological caution worth carrying.** Working one word (αἰτία/αἴτιον) turned up ~9 errors.
Every one that produced an *implausible number* was caught automatically; every one that produced
a *plausible number on a false premise about Greek* needed John. At corpus scale nobody reads the
output, and a systematic linguistic error does not average out — it becomes a confident, precise,
wrong number. Absences scale well ("zero in 830,000 words"); ratios do not. Any corpus-scale study
without a known-answer control is resting on plausibility alone.

## 6. Open work carried forward (unchanged, from the previous handoff)
- ~30 interpolated Ostwald ticks outside Book I await photographs of those columns' margins.
- Owen/Isagoge note 44 awaits page images of the Bohn edition; Wikisource numbering diverges at 42–43.
- Footnote paragraph structure — note 502 renders as ~2,300 unbroken characters. Unmade decision.
- Desktop app v0.2.0 signed release is still a DRAFT GitHub Release.
- `/bonitz` stays off live; the XSS fix is outstanding.
- classical-philosophy-reader has the landscape block merged locally but is **undeployed** — no git
  remote, Cloudflare Pages + R2 never provisioned (`docs/cloudflare-setup.md` unstarted).

## 7. Prompt for the fresh agent
Read `DEPLOY-STATUS.md` for deploy state and recipe. Nothing is held; the site is current as of
2026-08-13. If picking up this session's thread, `docs/corpus-analysis-features.md` is the
document — start at §Known traps, not at the feature list.
