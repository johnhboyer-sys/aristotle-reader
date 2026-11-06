# Handoff — topic search

Track started 2026-11-05: find passages by topic or idea, not one word. First
topic: necessity. Committed 2026-11-06 on branch `claude/topic-search` (not merged).

## Where it stands (2026-11-06)
- **John is labeling the blind gold sample.** Page:
  https://claude.ai/artifact/JxamyQS7xScTPw9Equ6bp2 (db collection `labels`, one
  doc per unit id with dots as `_`; fields `id, k, bucket, at`). Read with
  ArtifactData `list`. Saves from the page work. 9 of 40 done on 11-06
  (snapshot in `docs/topic-search/necessity/gold/labels-snapshot.json`; the db is
  the record, the snapshot only a copy). The filled `gold/labeler.html` is
  git-ignored: it holds Rackham's EN prose and the repo is public.
- John asked whether it was on purpose that many passages are not about
  necessity. Yes: only the 8 top lexical hits are expected positives; expect
  about 8–15 of 40 to be about necessity. Don't tell him which stratum a passage
  is in until he finishes (`gold/sample-1-strata.json` holds them).

## Next, in order
1. When John finishes: read labels, score each stratum (precision of the top
   hits, junk rate in the pool, misses just outside the cut).
2. LLM sort pilot (subscription) on the same 40, scored against John's labels;
   Grok or Codex recheck.
3. Codex review of `pipeline/tools/topic_embed.py` (Claude-written, not yet
   cross-family checked).
4. Bonitz ἀνάγκη/ἀναγκαῖος held-out key (Bonitz pp. 54–55 from bonitz-text
   `work/reconciled`; citations via `siglum_check.CITE`/`resolve`; mind
   `bonitz_pipeline/book_spans.py` book lettering). Never tune on it.
5. Then: mock static topic page; larger-model or Greek embedding run on Kaggle
   (upload only `build/topics/units.jsonl`, as a private dataset).

## Done
- Phase 1 research. Report: `docs/topic-search/report.md`; agent notes in
  `docs/topic-search/research/` (Sorabji, Owens, Bonitz, library keys, methods
  survey, two Codex reviews).
- `docs/topic-search/necessity/topic-map.yaml` (draft, John to review) and
  `queries.yaml` (15 English queries written from the map's labels only).
- `pipeline/tools/topic_finder.py` (units / score / recall / parse-sorabji; 44
  tests: `cd pipeline && uv run --with pytest pytest tests/test_topic_finder.py`),
  after a Codex review fixed 6 defects. 8,730 paragraph units.
- Sorabji key `necessity/keys/sorabji.json` (72 loci, 32 core; table checked by
  Codex, 6 defects fixed). Sorabji is now spent by method selection.
- Embedding test (bge-base-en-v1.5, English, M3 CPU — the GPU ran out of memory
  twice on 8 GB): `necessity/results/2026-11-05-recall.md`. Words 1000 +
  embedding 500 = 1,273 paragraphs, 20% of words, 30/32 core, 64/72 all.
  Embedding rescues EN III 5; EN X 9 and APo II 16 missed by both.
- Build output (git-ignored, rebuildable): `build/topics/units.jsonl`,
  `emb-bge-base-en-v1.5{,-owner}.npy`, `necessity/` (candidates, features,
  emb order). Chunk files deleted after the joined array was checked.

## Decided (John, 2026-11-05)
- Curated topic pages first (proof of concept); a free search box later.
- For John's research and for readers. Cloudflare allowed if a backend is needed.
- Four buckets for concept X: (1) directly about X; (2) X discussed in service of
  addressing Y; (3) nearby problems; (4) X applied as a principle without
  discussion. Labeler adds 0 = not about X.
- Locus = Bekker line range (paragraph or chapter); consecutive paragraphs are
  one locus. Topic page lists loci, each expandable to Greek + English.
- Use Greek and English together: English filters homonymous Greek senses; use
  synonyms.
- Subscription usage for the proof of concept. Paid API only when clearly scoped
  and priced first. No live LLM on the site unless truly needed and it works well.
- Larger runs go to Kaggle from the start, not the laptop.

## Open (John's calls)
1. Modal syllogistic (APr I 8–22, Int 12–13): bucket 1 or its own topic? 8 of
   the 40 sample passages are APr.
2. δυνατός / ἀδύνατος / ἐνδέχομαι: core terms or context?
3. Fold or keep Sorabji's de re/de dicto and fixed-past splits?
4. Review of `topic-map.yaml`.
5. Extra fields beyond buckets: sense tag, voice, links; method texts optional.

## Cautions
- Every locus table is a Claude agent's reading, unchecked; get a Grok pass
  against the book before using one as a key.
- Hold one answer key out of all tuning (memory: holdout-spent-by-selection).
- "Found" in recall is generous for chapter-long loci.
- Bonitz οὐσία (pp. 556–557) is raw OCR, not adjudicated.
- The Owens "supplement_1" PDF is a byte copy of the book.
- Other sessions have uncommitted files in this checkout (redesign kit,
  CLAUDE.md, HANDOFF-ENGLISH/REDESIGN); this track added one line to CLAUDE.md's
  handoff list. Commit only this track's paths.
