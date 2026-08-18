# Spec: word distinctiveness (feature 1)

*Status: ready to implement. Parent: `corpus-analysis-features.md` §1. Needs
the TLG disc, offline only. Governing rule: **compute on the disc, publish an
integer** — no shipped artifact may let anyone reconstruct TLG text.*

## Goal

The word popup gains one line where there is something to say:

> **ἐντελέχεια** — *coined by Aristotle* (139× in his corpus, unattested before him)
> **οὐσία** — (no line: ordinary Greek, "property", long before him)

Backed by three integers per lemma computed offline from the TLG disc: count
in Aristotle, count in authors before Aristotle, first attestation. The lemma
page shows the fuller numbers; the popup shows only a derived label.
**Ordinary words stay silent** (John's call): a line appears only for "coined
by Aristotle" or "rare before Aristotle".

## Decisions

1. **A standalone offline script, not a pipeline stage.** This is
   corpus-of-corpora work that changes only when re-run against the disc.
   New: `pipeline/aristotle_pipeline/offline/word_distinctiveness.py`. It
   generalizes the two existing disc-reading patterns rather than inventing
   new machinery: the `stage1_greek.run_export` Diogenes-export pattern
   (`xml-export.pl` — note the existing call is Aristotle-work-shaped, with
   `-y` verse mode and a `tlg{author}{work}.xml` output convention; the
   offline exporter iterates each external author's works with flags chosen
   per author, it is not a drop-in reuse), and `stage4_morphology`'s
   `greek-analyses.txt` lemmatization for the resulting tokens.
2. **Licence boundary.** Raw per-author exports and frequency dumps stay
   outside the repo (same trust boundary as `build/`). The only committed
   artifact is the integer-and-label table. This script assumes its
   environment: a missing disc or Diogenes install raises, no graceful
   fallback (the standing rule for pipeline tooling, unlike app code).
3. **Join key: LSJ Beta-Code key** (`a)reth/`) with `lemmaBeta` fallback — the
   namespace `app/scripts/build-lemmata.mjs` already buckets on. Reuse
   stage5's key-fallback matching helpers; do not add a new key scheme.
4. **Committed table**: `pipeline/data/word_distinctiveness.json`, keyed by
   LSJ key, rows only for lemmata in the built corpus (the `lemmata.json`
   universe, low thousands) — a few hundred KB.
5. **"Before Aristotle" needs author dates.** Step 1 of implementation checks
   whether Diogenes' local data ships a queryable canon/date file; if yes, use
   it; if no, commit a small hand-curated date table covering only the counted
   authors. Either way: **contemporaries and disputed-date authors are
   excluded from the "before" bucket** — "coined by Aristotle" must never rest
   on a guessed date.
6. **Labels are derived in the offline script and committed in the table.**
   The threshold function lives in Python beside the counting code — where
   `pipeline/tests/` can actually test it (`build-lemmata.mjs` has no test
   harness, so putting the logic there would ship it untested).
   `build-lemmata.mjs` only copies the label through. The client ships
   finished strings, never thresholds. Default bands (John reviews before
   ship): `before == 0 and in_aristotle >= 3` → "coined by Aristotle";
   `0 < before < 5` → "rare before Aristotle"; else `label: null` (silent).
7. **Merge points already exist.** The per-lemma JSON
   (`public/data/lemmata/<slug>.json`) carries a shipped `bonitz: null` stub —
   the designated enrichment slot; `distinctiveness` lands beside it. The
   compact `lemmata.json` manifest (`{key: {slug, head, count}}`) gains
   `distinctiveness_label` for the popup.

## Files

| File | Change |
|---|---|
| `pipeline/aristotle_pipeline/offline/word_distinctiveness.py` | new — export, count, emit |
| `pipeline/data/word_distinctiveness.json` | new, committed — integers only |
| `app/scripts/build-lemmata.mjs` | read table; attach `distinctiveness` + label |
| `shared/components/WordPopup.svelte` | render label line (near `WordPopup.svelte:123-128`, beside the lemma-link card) |
| `app/src/components/LemmaPage.astro` | render the fuller block beside the bonitz stub |
| `pipeline/tests/test_word_distinctiveness.py` | new |

Out of scope: the per-work pipeline (`aristotle_pipeline all` unchanged), LSJ
shards, any gate.

## Data shapes

```json
// pipeline/data/word_distinctiveness.json (committed; licence-safe)
{
  "e)ntele/xeia": { "in_aristotle": 139, "before_aristotle": 0,
                    "first_attestation": "aristotle", "label": "coined by Aristotle" },
  "ou)si/a":      { "in_aristotle": 1077, "before_aristotle": 812,
                    "first_attestation": "pre-classical", "label": null }
}
```

```json
// public/data/lemmata/<slug>.json — beside the bonitz stub; the full row
{ "bonitz": null,
  "distinctiveness": { "in_aristotle": 139, "before_aristotle": 0,
                       "first_attestation": "aristotle", "label": "coined by Aristotle" } }
```

```json
// public/data/lemmata.json — popup-facing, label only
{ "e)ntele/xeia": { "slug": "entelecheia", "head": "ἐντελέχεια", "count": 139,
                    "distinctiveness_label": "coined by Aristotle" } }
```

## Implementation steps

1. **Verify the date source.** Look for a canon/author-date file under the
   Diogenes data tree (`manifest.diogenes_data()`'s parent). Outcome decides
   step 3's date table. Report the finding to John before counting.
2. Author list: a small committed list of pre-Aristotle `tlg_author` ids
   (major prose and verse authors; not all of TLG). John reviews the list.
3. `word_distinctiveness.py`: export each author's works via the Diogenes
   export pattern (flags per author — see decision 1), tokenize with the
   existing stage3/beta machinery, lemmatize via the `stage4_morphology`
   pattern, aggregate per-lemma counts into the two buckets plus first
   attestation, derive `label` from the threshold function, restricted to the
   built corpus's lemma universe.
4. Emit and commit `pipeline/data/word_distinctiveness.json`.
5. `build-lemmata.mjs`: load the table, attach the full row as
   `distinctiveness` beside `bonitz`, copy `label` through as
   `distinctiveness_label` on the `lemmata.json` manifest entries (no logic in
   JS).
6. `WordPopup.svelte`: render the label line when
   `lemmaRef(a)?.distinctiveness_label` is present. `LemmaPage.astro`: render
   the numbers block.
7. John reviews: label wording, thresholds, author list — before deploy.

## Test plan

`pipeline/tests/test_word_distinctiveness.py`:

- Beta-Code key join incl. fallback matching (fixtures in
  `test_short_defs.py` style)
- bucketing against a synthetic date table, including an excluded-contemporary
  case (must land in neither bucket)
- label thresholds at the boundaries (`before=0,in=2` → null; `before=0,in=3`
  coined; `before=4` rare; `before=5` → null) — testable in Python because the
  label function lives in the offline script (decision 6)

`build-lemmata.mjs` has no test harness (same gap as `check-links.mjs`) —
record it in the PR; a minimal fixture test is welcome but not required here.

Front-end: extend `shared/__tests__/word-popup.test.ts` with one case: a
lemma whose `LemmaRef` carries `distinctiveness_label` renders the line; one
without renders nothing new.

## John's calls at implementation time

- Label wording and threshold bands (defaults above are proposals).
- The pre-Aristotle author list, and any contemporary exclusions beyond the
  automatic date rule.
- Whether the Diogenes canon date source (if found) is trustworthy, or the
  hand-curated table is used instead.

## Acceptance criteria

- `uv run pytest tests/test_word_distinctiveness.py` passes (from `pipeline/`).
- `npm run build` in `app/` succeeds; a known coined lemma's popup shows the
  line, a known ordinary lemma's popup is unchanged.
- The committed table contains integers and short enum strings only — no Greek
  text beyond the key, nothing reconstructable.
