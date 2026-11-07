# Integration of the new works, 2026-11-07 (PR #191)

Nine branches joined into `claude/integrate-new-works-4e32bb`, merged as PR #191 and
deployed the same day (`DEPLOY-STATUS.md` 2026-11-07). The PR description on GitHub
has the full gate output and the per-work index counts. This file keeps what the PR
does not: the reasoning behind each merge resolution, and the scripts that produced
the numbers.

## Rulings (orchestrator session, John's track)

1. **A column that opens below line 1 is cut only at an entry marked `cut: true`.**
   - De Plantis had cut at any unmarked entry on a column's first spine line, keyed `{col}1`; the Rhet. ad Alex. allowed only a marked entry, keyed by its real citation. The two tests contradicted each other.
   - The explicit rule won, because it cannot fire by accident in another work. Plant 815b10 is marked, in `sources/plant-forster/anchors.yaml` and in `build_plant_forster.py` (`CUTS`).
   - `implicit_cuts.py` scanned all five `anchor_cuts: true` works: no other entry relied on the old rule. 815a10 and 1420a5 are first columns, and nothing is cut before a first column.
2. **The keraia keys as `#`** (Ath. Pol.'s `beta._SIGNS`), so the Problemata's damaged fragments (`φ[αʹ`) are keyed tokens, no longer key failures.
   - The test now checks that the fragment stays a token, keyed `fa#` / `lo/gos#` (it fails on the old `beta.py`), and that a stray Latin letter still fails.
   - Stage 3 writes `numeral_marked_words.json` and prints the count per work: AthPol 6, all others 0.
   - Ath. Pol., its branch tip rebuilt against the merged build (`work_metrics.py`):
     - tokens −38 and unmatched −38, every one a bare numeral (αʹ…ϛʹ);
     - form postings −35, since 3 of those numerals were never in the form index;
     - lemma and English indexes unchanged.

## Other resolutions

- `stage1_chapters`: MM and vol. VI both added a per-entry `book`, in equivalent code; kept MM's, with Rhet. Al.'s checked `word`.
- `stage1_greek.run`: vol. VI's `spine_xml()` chooses the XML (vendored or exported), then MM's relineation applies to it. MM and Ath. Pol. pulled out the same grouping helper under two names; one name, `_segments`, is kept.
- `stage5_lsj._bibl_href`: Rhet. Al.'s author 0547 plus Ath. Pol.'s chapter.section fallback.
- `stage3_tokenize._SIGLA`: both `‖` (Spir) and `{}` (RhetAl).
- `sources/english-corrections.json`: merged entry by entry with `merge_corrections.py` (ours in order, less theirs' removals, plus theirs' additions). 3,063 = 3,070 − 30 retired Taylor Cat/Int + 22 Genie (DM/VV/Oec) + 1 Insomn.
- `test_paragraph_placement` pins: set from the real count, 9 files / 648.
- Every test file that conflicted kept both sides.

## Numbers worth keeping

- **Lemma slugs:** main's code on this corpus would have moved 8 live slugs (chorion, antiphon, eneimi in pairs; agonia, helos). The record kept all 6,418 and added 921.
- **De Plantis has 0 LSJ links, and that is right:** LSJ never cites it.
  - The only 0086 citations in 815a–830b are Mirabilibus's eight at 830a/b (work 027).
  - LSJ's 1,298 `Pl.` titles are Aristophanes' Plutus.
  - No `Plant.` title occurs.

## Scripts (in `integration-2026-11-07/`, run from the repo root)

- `index_counts.py`: per-work postings in the English, lemma and form shards; LSJ links; phrase-index entries; lexicon pages; site pages. It prints any zero.
- `work_metrics.py <dir-a> <dir-b>`: one built work's tokens, unmatched keys and index sizes, a against b, with the surfaces lost and gained.
- `implicit_cuts.py`: lists anchors entries on a column's first spine line below line 1, for every `anchor_cuts: true` work.
- `merge_corrections.py BASE OURS THEIRS OUT`: 3-way merge of `english-corrections.json` by entry.
- `codex-brief.md` / `codex-result.md`: the Codex review of the merge resolutions (no findings; it could not run tests).

The shared notes folder for this group of sessions held copies of these. The other
notes there (`de-spiritu.md`, `ath-pol.md`, `taylor-1812.md` and the rest) belong to
the sessions that wrote them.
