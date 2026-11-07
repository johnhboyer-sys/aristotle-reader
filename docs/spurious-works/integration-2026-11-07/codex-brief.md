# Findings-only review: merge resolutions on claude/integrate-new-works-4e32bb

You are reviewing ONE thing: how nine already-reviewed branches were merged
into one integration branch of aristotle-reader (bilingual Greek/English
Aristotle reader; Python pipeline in pipeline/, Astro site in app/, shared TS
in shared/). Each branch was reviewed on its own already. Do NOT review the
branches' own content. Review only (1) each conflict resolution, (2) the extra
code written during the merges, (3) the lemma-slug fix commit. Report
findings only; change no files; run no builds (a full corpus build is running
in this worktree — do not touch build/ or app/dist). You may read any file and
run `cd pipeline && uv run --with pytest pytest -q -p no:cacheprovider <file>`
for single test files, and `git show`/`git diff`.

Base: origin/main 8c5f2529dd. Merge commits, in order (each `git show --cc <sha>`
shows the resolution against both parents):
d2e3024d08 Problemata · 45a42e97eb De Spiritu · 5d62633e6e Magna Moralia ·
d632af2511 vol. VI / De Plantis · b99270af66 Rhet. ad Alex. · cbc593c9e8
De Mundo/VV/Oec · df7af38c38 On Dreams · b5d4072d18 Ath. Pol. · 39036a61eb
Taylor 1812. Slug fix: eea4534fc6. CLAUDE.md edit: a4f5818df7.

## Resolutions made (check each is right and drops nothing from either side)

1. test_stage2_stage3.py (Spir): both sides' new tokenizer tests kept.
2. test_stage5_lsj.py (MM, RhetAl): Spir, MM and RhetAl LSJ tests all kept.
3. stage1_chapters.extract_chapters_explicit (vol6, then RhetAl): MM and vol6
   both added a per-entry `book` (bookstart: `all(c["book"] != book ...)` vs
   `not any(c["book"] == book ...)`, equivalent); kept MM's. RhetAl added a
   validated `word`; wordIndex is now 0 by default and set only after the
   type check.
4. stage1_greek.run (vol6): vol6's spine_xml() chooses the XML (vendored
   `work.greek_lines` or the Diogenes export); MM's `greek.lineation` branch
   then relineates it. MM's local SOURCES_DIR import dropped (module-level now).
5. stage1_archive._column_starts (RhetAl) — SAME LOGIC, contradictory tests.
   De Plantis: an unmarked entry on a column's first spine line cut the column,
   keyed `{col}1`. RhetAl: only an entry marked `cut: true` cuts below line 1,
   keyed by its real citation, with a matching branch in
   stage1_ross.build_chunks. Decision (orchestrator): RhetAl's explicit rule.
   first_lines removed from build_english; sources/plant-forster/anchors.yaml
   815b10 gains `cut: true`; pipeline/tools/build_plant_forster.py emits it via
   CUTS (its `check` reports the file current); Plant's test marks its entry.
   A scan of all five `anchor_cuts: true` works found no other entry relying on
   the implicit rule (815a10 and 1420a5 are first columns, which build_chunks
   never cuts before).
6. stage3_tokenize._SIGLA: both ‖ (Spir) and {} (RhetAl).
7. test_paragraph_placement.py pins: set from the merged tree's real count,
   9 files / 648 paragraphs.
8. sources/english-corrections.json (Insomn, Taylor): merged by entry —
   ours in order, minus theirs' removals/edits, plus theirs' additions. Final
   3,063 = 3,070 sweep − 30 retired Taylor Cat/Int + 22 Genie (DM/VV/Oec) + 1
   Insomn; test count 3063, swept dirs 52, both read from the file.
9. stage1_greek (AthPol): MM and AthPol both extracted the same per-column
   grouping helper (`_segments` / `_segment`); one name, `_segments`, kept with
   AthPol's _rejoin_hyphens/_papyrus_text/_parse_sections.
10. stage5_lsj._bibl_href (AthPol): RhetAl's `(0086|0547)` author and
   _OTHER_AUTHOR_WORKS, plus AthPol's _SECTION_REF/_manifest/_section_href;
   a non-Bekker reference falls back to _section_href.
11. Semantic clash, no textual conflict (AthPol): AthPol's beta._SIGNS keys the
   keraia as '#', so Prob's test that "φ[αʹ"/"λόγοςʹ" stay key failures broke.
   Decision: keep both; test rewritten to pin token kept + keys "fa#"/"lo/gos#"
   (fails on pre-AthPol beta.py), new test that a stray Latin letter + keraia
   still fails. Stage 3 now writes build/stage3/numeral_marked_words.json and
   prints a per-work count of '#'-keyed tokens (numeral_marked_words()).
12. shared/lib/works.ts CATEGORIES: both { id: 'Spir' } and { id: 'RhetAl' };
   shared/__tests__/works.test.ts: both new describe blocks.

## Slug fix (eea4534fc6)

/lemma/<slug> slugs were assigned in frequency order with -2/-3 suffixes, so a
new work could swap two words' addresses. Now app/scripts/build-lemmata.mjs
reads sources/lemma-slugs.json (seeded from the live site's
data/lemmata/_index.json, 6,418 keys): recorded keys keep their slug, new keys
get a slug no recorded key holds (retired ones included) and are appended;
refuses without the record or with a duplicate slug. scripts/deploy-gh-pages.mjs
refuses while sources/lemma-slugs.json has uncommitted changes.

## Look especially for

- any resolution that silently drops one side's behaviour or test;
- #5: anything else in the repo that relied on `first_lines` or on
  `{col}1`-keyed anchors for a below-line-1 column (ticks, stage 2 checks,
  tools), and whether `"cut": False` now present on every line-1 anchor changes
  anything downstream;
- #10: a citation that linked on one branch and no longer links, or vice versa;
- #11: whether numeral_marked_words is wired where it says, and whether the
  rewritten test really pins the new keys;
- slug fix: a path where a slug can still change or be reused (MIN_COUNT drop
  and return, key renames, the picker shards' `s` field, the desktop app,
  check-links), the record write (ordering/format), and the deploy guard's git
  cwd.

## Output

A numbered list of findings, each: file:line, what is wrong, a concrete
failing scenario, severity (blocker / should-fix / nit). If you find nothing
in an area, say which areas you checked and found clean. No praise, no
summary of the branches.
