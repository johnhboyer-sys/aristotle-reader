# HANDOFF — Athenian Constitution (Ath. Pol.)

Track: add the Athenian Constitution, the first work cited by chapter.section.
Plan: [`docs/ath-pol-plan.md`](docs/ath-pol-plan.md). Branch `claude/ath-pol-plan-ccd05b`
(worktree `.claude/worktrees/ath-pol-plan-ccd05b`). Nothing pushed, merged or deployed.

## State (2026-11-07): built and gated, awaiting John's merge call

Everything in the plan is built. John's rulings are in plan section 6. Q2 is "Match Barnes": no badge, last in Division V after the *Poetics*, and the appendix keeps its name.

- **Greek:** TLG 0086.003 (Oppermann 1928), 69 chapters and 298 sections. Each section is one spine line on synthetic column "Na" (`citation.scheme: chapter-section`). The papyrus column mark `‖` is dropped. Underdots, numerals and lacunae get Beta Code keys.
- **English:** Kenyon, Oxford *Works* vol. X (1921), built by `pipeline/tools/build_athpol_kenyon.py` from the archive.org hOCR. It is checked word by word against Gutenberg 26095 and against the Genie OCR of vol. X, with every difference judged on the page image. It carries 184 footnotes shown as popups and 298 anchors, one per Greek section, each real.
- **Reader:** displayed cites read "49.3"; anchors, `?loc=49a:3` and `#49a3` keep the synthetic form. Other features:
  - every section is numbered;
  - no Bekker jump, column label or chapter span;
  - a section jump lands exactly at the top of the reading area, on the English tick when the Greek is hidden;
  - the scroll spy follows sections;
  - Search shows one English row per section;
  - ⌘K reads "Ath. Pol. 56.6".
- **LSJ:** "Arist. Ath." citations (527 in LSJ) link to their sections. The 36 in entries the corpus doesn't emit stay out. "10.7" stays unlinked, because the Greek has no 10.7.

## Gates (all passing)

The scripts are in the notes folder `athpol-gates/` (`fullbuild.sh`, `cmp.py`, `agg.py`, `leakscan.mjs`, `htmldiff.py`).

- **G1** (scheme present, no work using it), built at `35f699b443` with the registry, manifest and LSJ entry removed, against baseline `b963ae949d`. Data: 8,573 files, 0 differ. Site: 15,203 files, every HTML page identical with asset hashes masked.
- **G2** (AthPol added), at `ed34dabd4e`, with the site rebuilt at `355d33c992`:
  - All 41 other works' data directories are byte-identical to G1.
  - The corpus-wide files differ only by AthPol's share (`agg.py`). Three kinds of residue are explained:
    - the lemma display cap for 20 high-count lemmas;
    - `lemmaBeta` for 2 lemmas;
    - **two homograph slug swaps:** `/lemma/chorion` ↔ `chorion-2` and `antiphon` ↔ `antiphon-2`, because slugs are assigned by count. That instability predates this work; it's a follow-up.
  - **LSJ gate:** G5 links 490 citations, exactly the raw LSJ list, plus the 1 declared. G2-LSJ: 308 links undone, after which every old entry equals G1; 403 entries added, 0 dropped.
  - **HTML (G3c):** besides the lemma pages, only the work switcher on every reader page, the home card (Division V), the home work count (40 → 41), the phrases filter and the attribution page differ.
  - **G6:** preflight, LSJ verify and the link check (6,816 pages, 0 broken) pass. The leak scan passes: 8,731 files, the positive control found, all four scans OK.
- **G3b:** rendered DOM text is identical on 8 sample pages (built at the reader commit).
- **G4:** stage 2 sections check: 69 chapters, 301 English, 298 Greek, 298 witnesses, 298 anchors, 3 merges, ok.
- **Browser** (G2 site):
  - The 49.3 jump lands at the reading top, and the hash reads `#49a3` after scrolling.
  - With English only, 56.4 lands on its tick. Footnotes open.
  - Phone landscape (812×375) reads well.
- **Suites:** pipeline 3,851; scripts 87; shared 685; app 97; desktop 487 (21 skipped). svelte-check: 0 errors.
- **Codex GPT-6.1-Sol, medium:** six findings. Five held and are fixed; the U+0323 scoping was not taken, because the byte gate proves no other work changes. A second pass on the later fixes was run; its outcome is in the final report to the orchestrator.

## Open, for John

1. The print opens Ath. Pol. with spaced dots ". . . [They"; ours reads "...[They". Should we keep the printer's spacing?
2. The lemma slug swaps above. Old links to `/lemma/chorion` and `/lemma/antiphon` now open the other word.
3. The two resume labels ("Resume at" on the landing page, "Continue reading" on home) still print "49a3". They were left so G3 could stay byte-exact; this is a small follow-up.
4. **Chapter openings.** At 50.1, 57.1 and 60.1, Oppermann opens the chapter with a closing sentence that Kenyon prints at the end of the paragraph before. The anchors follow Kenyon, so that Greek sentence pairs with the previous chapter's English.
5. **A defect that predates this work, on Bekker works:** `?loc=…&view=english` scrolls to a hidden Greek line and goes nowhere. It's fixed here for chapter-section only, and needs its own follow-up PR.
6. **De Spiritu (tlg0086043) and tlg0086051** also print `‖` in their exports. Only the section loader drops it.

## Kenyon findings worth knowing

- **Margins.** Kenyon's margin prints 300 numerals; with chapter 8 counted as 5, his numbering has 301 sections. Against Oppermann:
  - 15.5, 26.4 and 49.5 sit inside the section before; these are the declared merges.
  - Chapter 8 prints no "3".
  - 12 anchors sit off their numeral's line because the Greek boundary differs.
  - All of these are declared in the builder, which fails on anything else.
- **Fixes the Genie witness made:** two notes, p374 n.10 "by lot, which" and p417 n.109 "(reading οἱ δῆμοι…)".
- **Suspected misprints, kept as printed:** p372 "Medon,", p392 "the the", p399 "presumbly", p406 "Poloponnesian", p420 "control the while", p426 "Sir. J.", p437 "scare".

## Facts a builder needs

- The builder's inputs live in the worktree's `build/athpol-ocr/`, which git ignores: `hocr.html`, `pg26095.txt`, `genie-x.txt` (lines 6960–8374 of `sources/genie-oxford/Oxford Aristotle X 1921.txt` in the main checkout), and `img/`.
- `/page/nN` on archive.org = hOCR page index N+1.
- The builder runs `main()` only with no arguments.
- The LSJ shared merge is last-writer-wins, so a byte compare needs a full rebuild.
- The site's service worker caches bundles. Unregister it before checking a rebuilt site in the browser.
- Commit `9388a10396` is titled "WIP … not gated". The commits after it gate it. I didn't reword it, because interactive rebase isn't available here.
