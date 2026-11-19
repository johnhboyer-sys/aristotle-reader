# HANDOFF — word-by-word hover alignment

Track: Greek ↔ English word hover for the reader and search pages, and the word-level alignment it needs. The work lives in `docs/mockups/2026-11-18-word-hover/`. **Read `PROCESS.md` there first.** It explains the method, John's rulings, and how the review page works.

## State (2026-11-19)

- The gold has two chapters:
  - **NE I.2 (Rackham)**: done, John's whole chapter.
  - **NE I.3 (Ostwald)**: in progress on the review page https://claude.ai/artifact/B9zXqmvkpRQF6QAnEBMSKE. At the last snapshot (16:22 CST), he had saved 229 token corrections, 9 unit docs (4 joins: περὶ πᾶν at a1, a3.4–6, a3.11+a4.0, and a4.2+a4.3), and 7 Supplied marks. His corrections reached 1095a11, and the chapter ends at a13. Ask him whether he's finished before scoring.
- **Prompt v4 is the best aligner prompt.** On I.2 it gets 117–123 of 159 units exact. The main error left is too many Loose links.
- **The review page is settled.** John likes it. Don't redesign it. Add only what he asks for. Version 3 added a Supplied brush and Join/Split.
- **Nothing is deployed**, and no site code has changed. This is all a mock-up and benchmark folder.

## Next

1. **When John says I.3 is done:**
   - Snapshot `corrections` and `units` into `test-i3/john-db/` (ArtifactData `list` with `out_dir`).
   - Write an I.3 scorer modelled on `test-i3/score2.py`:
     - Merge joined units.
     - Count Supplied as Loose, and also report it on its own.
     - Treat τε … καί (b26.3 + b27.0) as one unit.
   - Score Opus, Codex, and Sonnet v4 against his reading.
   - Score the recall of his changes for list A (75 units), list B (92), and A ∪ B (125), from `triage_i3.py`. The answer decides how much of a new chapter he must check.
2. **Draft prompt v5** from his I.3 patterns, then test it on I.2 and I.3. Running it is a priced run, so it needs his yes.
   - Give Supplied its own label.
   - Add τε … καί and preposition + object as units.
   - Add rule 11: the meaning-bearing word stays Literal across a change of part of speech, and the frame around it is Loose or Supplied.
   - Check whether splitting out Supplied raises Loose precision.
3. **Open questions for John:**
   - Supplied adjectives ("all desire", "practical importance", "one ultimate").
   - Whether "political" in ταύτην → "the political science" is Supplied.
   - Whether an article with no noun of its own (τὰ τῶν ἄλλων, τὸ τῆς πόλεως) is a unit.
   - Coordinated words under one article (τῶν ἐπιστημῶν ἢ δυνάμεων).
4. **Later:**
   - The route to corpus scale: a priced LLM Batch (Opus ≈ $0.00024 a Greek word, ~$135 for primary translations only) or an embedding aligner.
   - Phone portrait.
   - Use on the search page.

## Decided, and why

- **Ostwald over Rackham for the gold.** John finds Rackham "too loose", and all three models agree Ostwald is more literal.
- **The literal crib (prompt v3) was dropped.** It didn't help. Models miss John's conventions, not the meaning of words.
- **John's review starts from Opus v4's reading.** He asked for that. He checks every word, so units he leaves alone count as accepted.
- **Supplied is scored as Loose** for any comparison with earlier rulings. Before 2026-11-19, he put supplied words under Loose.

## Failed or watch out

- **Don't republish a review page mid-review without a snapshot.** The database survives a republish, but a page bug could write bad rows.
- **Model runs cost money.** Each priced run needs John's yes. The env `ANTHROPIC_API_KEY` is invalid, so use `env -u ANTHROPIC_API_KEY`. Haiku hit max_tokens on v2 and is out of the benchmark.
- **The repo is public.** Built pages and plain copies of corpus text are gitignored. The chapter cuts can't safely be re-cut, so they live in `~/Developer/word-hover-cuts/`.
- **Greek stops are U+0387 and U+037E.** Escape them in any regex.
- **A token's `o` offset includes a leading bracket.** Find a word by text search from `o`.

## Where things are

- **On main**, since PR #220 (2026-11-19).
- **The chapter cuts every saved alignment counts against are off git**, in `~/Developer/word-hover-cuts/` (John's call: the repo is public). Copy them back before rebuilding or scoring (`PROCESS.md`, Rebuild). Never re-cut an existing chapter from the live site.
- **Pages, all private artifacts:**
  - I.3 review: https://claude.ai/artifact/B9zXqmvkpRQF6QAnEBMSKE
  - Ostwald I.2 review: https://claude.ai/artifact/Km7zXfNjveQRR5cmgQtbna
  - I.2 comparison: https://claude.ai/artifact/QaoGxFUD8f1wWC83vKyJWt
  - I.3 comparison: https://claude.ai/artifact/HTpRa9VWNBW1EhNJrrEXKe
  - I.2 Correct mode (Rackham): https://claude.ai/artifact/TD3Qdm1bUNWyFKgEQ8vZQX
  - I.1 mock-up: https://claude.ai/artifact/PJWvpwrUwkPu8NBQHM69Xm
