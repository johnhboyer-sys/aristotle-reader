# HANDOFF — Athenian Constitution (Ath. Pol.)

Track: add the Athenian Constitution, the first work cited by chapter.section.
Plan: [`docs/ath-pol-plan.md`](docs/ath-pol-plan.md). Branch `claude/ath-pol-plan-ccd05b`
(worktree `.claude/worktrees/ath-pol-plan-ccd05b`). No push, no merge, no deploy.

## State (2026-11-07, paused for a reboot)

Every question is answered (plan section 6). Q2 is "Match Barnes": no authenticity mark and no badge; the work goes last in Division V ("Rhetoric and Poetics"), after the *Poetics*. The appendix keeps its name. John said to build it.

Commits on the branch, oldest first:

1. `2625c9b07b` pipeline: `citation.scheme: chapter-section` (loader `_parse_sections`, stage 2 `check_sections`, preflight `ordered_citation`, LSJ `_section_href`), `tools/athpol_greek_starts.py`, `tools/athpol_lsj_gate.py`, the check-links exact-line rule, and 25 failing-first tests in `pipeline/tests/test_chapter_section.py`.
2. `8ca3441d1e` plan: Q2 resolved.
3. `2b612173f0` reader (site, desktop, ⌘K palette). Every displayed cite goes through `citeLabel`/`citeLabelOf` in `shared/lib/data.ts`; tests in `shared/__tests__/chapter-section.test.ts`, `reader-chapter-section.test.ts`, `desktop/src/__tests__/chapter-section-cite.test.ts`.
4. `a8b8f27b3b` English: `pipeline/tools/build_athpol_kenyon.py` → `sources/athpol-kenyon/`. Its inputs (hOCR, Gutenberg 26095) are cached in `build/athpol-ocr/` in this worktree, which git ignores. It regenerates byte-identical.
5. `9388a10396` **WIP, not gated:** `manifests/AthPol.yaml`, LSJ map `"003": "AthPol"`, the `works.ts` entry plus its CATEGORIES V place, and the desktop entry after Poet.

## Gates so far

- **G1 (scheme added, no work using it), passed** at `2625c9b07b` and again at `2b612173f0`, against a baseline built at `b963ae949d`:
  - `build/dist`: 8,573 files, 0 differ.
  - `app/dist`: 15,203 files; every HTML page identical with asset hashes masked; only the 9 rebuilt JS/CSS bundles differ.
  - All build gates green: preflight, LSJ verify, links 0 broken.
- **G3b (rendered DOM), passed.** Eight pages (EN 1103a14, Phys 244b5, Isa, Cat, Pol, a lemma page, search, home) give identical text in both builds. Seven are identical in the DOM too. On search the only difference is four empty Svelte `<!---->` markers.
- Front-end suites at `2b612173f0`: shared 682, app 97, desktop 487 (21 skipped), all pass.
- **AthPol pipeline run alone at the WIP commit:** stage 2 passes. The sections check reads 69 chapters / 301 English / 298 Greek / 298 witnesses / 298 anchors / 3 merges.

## Still to do

1. **Decide the `‖` glyph.**
   - Oppermann's export prints the papyrus column break as `‖` (29 in the export, 58 in the built `book-01.json`). No other built work has one.
   - It becomes a Greek "word" with no analysis, and stage 3 logs it as a transliteration FAIL.
   - Likely fix: strip it in `_parse_sections` the way `strip_bars` strips `|`, and make `athpol_greek_starts.py` strip it too.
   - Stage 3 also logs `δʹ` (a numeral mark, U+02B9) and `δεκάτην.’` in verse. Look at those too.
2. Run the suites: `cd pipeline && uv run --with pytest pytest -q`, `npm run test:scripts`, and vitest in shared, app and desktop. Works tests may want AthPol data files.
3. **G2:** full rebuild with AthPol, using `fullbuild.sh <label>` (see "Rebuilding the gate rig" below).
   - Every other work's dist dir must be byte-identical to G1.
   - Run `tools/athpol_lsj_gate.py --dist <new> --before <G1 dist>`.
   - `bekker.json` must equal G1 plus 69 AthPol columns.
   - Ngrams, lemma map and search shards: rebuild with AthPol.yaml moved aside and match G1.
   - G3c: HTML diffs only in the switcher, home and search lists.
   - G6: preflight, LSJ verify, links 0 broken, leak check.
   - Then look at AthPol in the browser: phone landscape, large type, Greek-only, print.
4. Codex GPT-6.1-Sol, effort medium, findings-only review of `b963ae949d..HEAD`. Fix what holds, then re-run the gates.
5. Squash or reword the WIP commit, update the plan's status line, then report to the orchestrator.

## Rebuilding the gate rig (the reboot wipes /private/tmp)

- The scripts are saved in the session notes folder: `~/Library/Application Support/Claude/side-session-notes/local_212c7db4-c183-4538-8ff7-94a2e058767b/athpol-gates/`.
  - `fullbuild.sh <label>` does what build-public.mjs does: each manifest's `all` in node localeCompare order, using the `-public` variant when one exists; waits for any other session's stage8; then stage9, preflight, LSJ verify, app build and check-links; snapshots `<label>.dist` and `<label>.app`.
  - `cmp.py A B [--mask-assets]` hashes two trees.
- It ran in a detached worktree (`buildwt`, in the scratchpad), so builds never touch this checkout. Recreate it and repoint `ROOT`/`OUT` in the script.
- `git worktree prune` clears the dead entry.
- The worktree needs `build/export` rsynced from the main checkout (see memory note on worktree builds).
- The baseline (`b963ae949d`) and G1 (`2b612173f0`) builds are lost with /tmp. Rebuild them, about 4 minutes each. A build is deterministic: two baseline builds were byte-identical.

## What the English agent found (Kenyon 1921)

- **Margins.** The margin prints 300 numerals. Against Oppermann's 298:
  - 15.5, 26.4 and 49.5 sit inside the section before. These are the three declared merges.
  - Chapter 8 prints no "3" (1, 2, 4, 5). The manifest counts Kenyon's numbering, 5, and Oppermann's 8.3 anchor sits at "There were four tribes".
- **Anchors follow the Greek.** 12 sit off the line of Kenyon's numeral: 4.4, 8.5, 9.1, 9.2, 37.2, 40.3, 47.3–5, 49.2, 53.2, 56.4.
  - For 50.1, 57.1 and 60.1, Oppermann opens the chapter with a summary sentence that Kenyon prints at the end of the paragraph before. The anchors follow Kenyon's paragraph there, so the chapter's first Greek sentence pairs with the previous chapter's English.
  - In 47 sections the Greek line data can't fix the clause. Those follow Kenyon's numeral. Worth a look: 4.2, 21.2, 29.3, 31.3, 35.3, 53.6, 67.5.
- **Anchor phrases.** 30.4's phrase contains a footnote ref (`They[^80] were…`), because no ref-free phrase is unique there. It resolves, since stage 2 counts it real. Six phrases are under 5 words.
- **Suspected misprints, kept as printed:** p372 "Medon,", p392 "the the", p399 "presumbly", p406 "Poloponnesian", p420 "control the while", p426 "Sir. J.", p437 "scare".
- **Doubtful readings:** p434 "seers", p393 a comma, p425 a faint iota subscript.

## Decided, and why

- No Bekker or section numbers are invented. Numbers come from Kenyon's printed margins (read from the images) and from Oppermann's sections in the TLG export.
- The URL hash stays `#49a3`; only labels read "49.3". Changing the hash would touch every work's scroll spy and saved positions.
- The reader agent left two labels raw ("Resume at 49a3" on Landing, "Continue reading" on home). Editing them would change every landing page's HTML bytes and break the G3 gate. They need a follow-up after G2.

## Facts a builder needs

- `/page/nN` on archive.org = hOCR page index N+1 in `_hocr.html`.
- LSJ: 527 citations as `tlg,0086,003:C:S`. One, δίδραχμον "10.7", has no such section and stays unlinked (`DECLARED` in the gate).
- The LSJ shared merge is last-writer-wins, so the G2 byte compare needs a full rebuild.
