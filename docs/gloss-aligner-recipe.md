# Gloss-based Bekker aligner — full recipe (any work, any translation)

End-to-end runbook for placing real Bekker line-ticks on an **unmarked** translation
(no Bekker numbers, no Bekker-milestoned sister translation required) **and wiring
them into the reader**. This is spec-v2 "Method A" (gloss → match) + "Method B"
(direct-reading verifier). Validated full-corpus on Ross's *Nicomachean Ethics*
(2026-06-17): 1293 ticks, ~99.5 % placed by direct reading. Needs only the Greek
spine + the translation's clean prose.

**Code** (`pipeline/aristotle_pipeline/align/`): `glossing.py`, `reference.py`
(`load_gloss_chapters`), `aligner.py` (`align(..., provider="gloss")` + verifier
overrides), `eval.py` (`run_gloss_eval`), `gloss_review.py`.
**Tools** (`pipeline/tools/`, run from `pipeline/`): `verify_gather.py`,
`verify_to_offsets.py`, `persist_book.py`, `make_index.py`, plus eval-only
`verify_score.py` / `bakeoff.py`.

The model steps (glossing, verifying) run as **Claude Code sub-agents on the Max
plan** — no API key, nothing billed. Python only reads the JSON they write.

> Two phases: **A. Produce the alignment** (§0–§6) and **B. Implement it into the
> site** (§7). For a whole work, loop A per book, then do B once.

---

# Phase A — produce the alignment

## 0. Prerequisites (per work)
1. Build the work through **stage1** (single-work scratch — always rebuild first):
   ```bash
   cd pipeline && uv run python -m aristotle_pipeline stage1 --work <SLUG>
   ```
2. The unmarked translation is vendored under `sources/<dir>/` and declared as the
   manifest's `english.secondary` (id, dir, books, marker: `number`|`part`|`part_roman`)
   so `reference.default_target` finds it.
3. Confirm the prose is clean (no stray numbers/footnotes):
   ```bash
   uv run python -c "from aristotle_pipeline.stage1_ross import parse_translation; \
   from aristotle_pipeline.config import SOURCES_DIR; \
   t=parse_translation(SOURCES_DIR/'<dir>',<books>,'<marker>'); \
   print(len(t),'chapters'); print(repr(next(iter(t.values()))[:160]))"
   ```

## 1. Emit the tick windows
Ticks = line 1 of each Bekker column + every 5th line; each gets a 3-line window.
```bash
uv run python -m aristotle_pipeline.align --emit-gloss-tasks --work <SLUG>
```
→ `build/align/gloss_tasks/<SLUG>/<book>-<chapter>.json`.

## 2. Gloss the windows (one sub-agent per *batch* of chapters, parallel)
Run these agents on **Sonnet** (`model: sonnet`) — A/B on NE Bk1 vs Opus-tier baseline
showed no accuracy loss (column tier improved), since the gloss only feeds a word-overlap
matcher and the verifier backstops it. (Keep verification on Opus.)
**Batch small chapters per agent** to amortize fixed per-agent overhead — bundle
consecutive chapters (one agent glosses each chapter in its bundle into its own file,
kept strictly separate). Get the bundles from:
```bash
uv run python -m aristotle_pipeline.align --plan-gloss-batches --work <SLUG> [--books N]
```
A/B (NE Bk1: 13 ch → batches, whole work 116 ch → 51) cut gloss tokens ~57% with no
accuracy loss (magnitude is an upper bound — leaner Workflow sub-agents carry less fixed
overhead than the general-purpose agents the A/B used). The same batching applies to §4.
Each agent reads its task file(s) and writes `build/align/glosses/<SLUG>/<b>-<c>.json`
= `{line_citation: english}`. **Default style = standard scholarly terminology**
(reusable, no leakage). Translator-style is a booster for famous translations only
(see §8). Glossing prompt:

> Translate ancient Greek (Aristotle, **<WORK>**, Book **<B>**, ch **<C>**) for a
> Bekker-line alignment tool. Precise and faithful — a scholar with good Greek checks
> this.
> - Read `build/align/gloss_tasks/<SLUG>/<B>-<C>.json`: a list of windows, each `lines`
>   = `{citation, greek}` (line above the tick / tick line / line below; edge windows
>   have 2). Use neighbours only to get a mid-sentence line's sense right.
> - Output ONE English line per Greek line, keyed by its citation — verse mode, on its
>   own line even if longer. Each citation appears once; do not merge, reorder, annotate.
> - **Each English line MUST BEGIN with the rendering of its Greek line's FIRST word.**
>   Don't pull a line's opening word up into the previous line or borrow the next line's;
>   boundaries coincide with the Greek even if a line then starts mid-clause (Greek opens
>   διαφέρειν → English starts "differ…"). The verifier anchors on this — a shifted
>   boundary becomes a mis-placed tick.
> - Standard scholarly terms, used consistently: ἀρετή=virtue, εὐδαιμονία=happiness,
>   ἔργον=function, ἐνέργεια=activity, ἕξις=state, τέλος=end, λόγος=reason/account,
>   προαίρεσις=choice, τέχνη=art, πρᾶξις=action. Proper names stay names (Καλλίας→Callias).
> - Write flat JSON `{citation: english}` (UTF-8, nothing else) to
>   `build/align/glosses/<SLUG>/<B>-<C>.json`. Return a one-line summary.

## 3. Align — pass 1 (gloss → translation)
```bash
uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books <b>
```
Reference = the glosses; fingerprint = the full 3-line window; matcher = **lexical**
(word-overlap; `--backend quality` for mpnet, not better here). Writes
`build/align/<SLUG>_<vid>_gloss_map.json`. Ticks get `reliable`/`uncertain` by margin.

## 4. Verify EVERY tick by direct reading (the revised default)
The confidence gate alone misses flagged-but-reliable ticks that snapped to a
sentence start, so verify **all** real ticks (not just `uncertain`):
```bash
VERIFY_ALL=1 uv run python tools/verify_gather.py <book>          # per book
```
→ `build/align/verify_tasks/<SLUG>/<b>-<c>.json` (one file per chapter; carries the
**full chapter text** + every tick's `{citation, greek_above, greek_tick, greek_below,
gloss, current_placement}`) and merges `build/align/verify_meta_<WORK>.json`. (The old
`greek`/`context_gloss` fields were dropped as redundant with `greek_above/tick/below`
and `gloss` — pure prompt savings, no behaviour change.)
**The Greek tick line is the placement target — NOT the gloss.** `greek_tick` is the raw
Greek of the line the tick marks; `greek_above`/`greek_below` are its neighbours;
`gloss` is now a **sense hint only**; `current_placement` is the ~90 chars of translation
at the pass-1 offset, so the verifier can *confirm or correct* an existing placement
rather than produce one cold.
> Why this matters (learned the hard way on Ross-EN **and** Pol-Jowett): anchoring on the
> *gloss* drifts, because (a) the gloss sometimes starts a word off its Greek line, and
> (b) lexical un-matches make the agent grab the nearest strong phrase. Anchoring on
> `greek_tick`'s first word is the fix.
*(Cheaper option: omit `VERIFY_ALL=1` to gather only `uncertain` ticks. Optional args:
`verify_gather.py <book> <PAD> <chapters>` to re-gather a few chapters.)*

Run **as a Workflow fan-out, one agent per *batch* of chapters (same `--plan-gloss-batches`
bundles as §2), with a JSON schema** (forces structured output → no chatty prose, no
malformed JSON, no retries). A/B (NE Bk1 ch1–5, all Opus) put batched vs unbatched at 96%
verdict agreement / 89% same-sentence placement for ~69% fewer tokens — no systematic
drift. The workflow collects the validated results; write each agent's record **verbatim**
(the whole `{chapter, ticks:[{citation, verdict, phrase}]}` object) to
`build/align/verify_out/<SLUG>/<b>-<c>.json` — **keep the `verdict` field**, the §5b
correction pass filters on it (`verify_to_offsets` reads `phrase` from this shape, and
still accepts the legacy flat `{citation: phrase}`). **Lean schema — verdict + phrase,
NO free-form `reason` field** (reasons are the single biggest token sink; omit them):
```json
{ "type":"object","additionalProperties":false,"required":["chapter","ticks"],
  "properties":{ "chapter":{"type":"string"},
    "ticks":{"type":"array","items":{ "type":"object","additionalProperties":false,
      "required":["citation","verdict","phrase"],
      "properties":{ "citation":{"type":"string"},
        "verdict":{"enum":["ok","early","late","unsure"]},
        "phrase":{"type":"string","maxLength":120} }}}}}
```
Judge-style verifier prompt:

> Strict Greek-to-English alignment judge. Check Bekker line-marks in **<TRANSLATOR>**'s
> translation against the GREEK — the Greek is authoritative, the gloss is only a hint.
> - Read `build/align/verify_tasks/<SLUG>/<B>-<C>.json`: `text` (full chapter prose) +
>   `ticks` in Bekker order, each with `greek_above`/`greek_tick`/`greek_below` (raw Greek
>   of the line before / tick / after), `gloss` (hint), `current_placement` (translation
>   now sitting at the tick).
> - For EACH tick, judge whether `current_placement` BEGINS exactly at the English of
>   **`greek_tick`'s FIRST word**: `ok` = it does; `early` = begins on `greek_above`
>   content (a line too high); `late` = a clause into `greek_tick` or onto `greek_below`;
>   `unsure` = translation condenses/omits `greek_tick`.
> - ALWAYS return `phrase`: a 5–10 word verbatim substring copied EXACTLY from `text`,
>   beginning precisely where `greek_tick`'s first word is rendered (an exact search must
>   find it; for `ok` it matches `current_placement`'s start). It must NOT include any
>   `greek_above` rendering and must NOT start as late as `greek_below`.
> - **Judge by the GREEK, not by which reading sounds smoothest.** Example: `greek_tick`
>   opens διαφέρειν → start at the English for "differ", even if the gloss put it on the
>   line above.
> - Return every tick. Output strictly the schema JSON. **No explanations.**

## 5. Fold + re-align + persist (per book)
```bash
uv run python tools/verify_to_offsets.py <book>                              # phrases → overrides (monotonic)
uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books <book>  # pass 2: applies overrides, re-interpolates
uv run python tools/persist_book.py <book>                                   # → alignment-results/<vid>/{maps,glosses,review}/book-NN.*
```
`verify_to_offsets` writes `build/align/<SLUG>_<vid>_gloss_overrides.json`; pass-2
`align` upgrades verified ticks to `confirmed` and re-interpolates single lines
around them. `persist_book` saves the per-book map, glosses, and a dark-mode
3-line-window review HTML to the **tracked** `alignment-results/<vid>/`.

## 5b. One cheap correction pass (built in, run once — scoped to early/late)
**No single pass is clean** — measured against Rackham's real line numbers, even the
judge-style §4 lands the *median* tick exactly but still misses some of the harder ticks
by a sentence (and the gloss-eval gold is itself soft, so trust column-starts most). The
quality we ship comes from **one** correction pass on top — do it, but keep it cheap and
**scope it to the ticks pass 1 actually moved**:
1. After §5 fold+pass-2+persist, **re-run §4's gather with `VERIFY_FILTER`** so it
   re-judges ONLY the ticks the previous pass marked `early`/`late` (skips `ok`/`unsure`):
   ```bash
   WORK=<SLUG> VERIFY_ALL=1 VERIFY_FILTER=early,late uv run python tools/verify_gather.py <book>
   ```
   `current_placement` now comes from the *pass-2* offsets, so this is a true
   confirm/correct of the real placements that were corrected. **Safe to scope:** the
   monotonic clamp moves **0** non-corrected real ticks (measured on Ross-EN), so
   confirmed (`ok`) ticks don't drift and need no re-judging. A tick absent from the prior
   pass falls through and is re-included (fail-safe = verify).
   - **Ordering:** the gather reads the *existing* `verify_out` for verdicts, so run it
     **before** the correction judge overwrites those files. Gather → judge → fold is
     sequential; do not re-gather after the correction judge writes.
2. Re-judge that delta (the §4 Workflow again, same schema), overwrite only those phrases
   in `verify_out`, and re-run §5 (fold+pass-2+persist) **once**. Leave `ok`/`unsure` alone.
3. **Do NOT loop.** One correction pass, then ship. Iterating agent rounds is where the
   tokens went; the recipe is built to converge in two §4 passes, not N.
4. **Log the saving:** have the §4 workflow print the early/late count per chapter
   (`early_late / total`). That ratio is the correction-pass token saving and is the
   honest number to track per work — on Ross-EN pass-1 placement is coarse, so expect a
   *modest* (~30%, not 70%) reduction; obscurer translations may differ.
**Token rules:** lean schema (no `reason`), schema-validated output, correction pass run
**once** and scoped via `VERIFY_FILTER`, and for a re-check you may also **sample** (1–2
chapters/book via the `<chapters>` arg) rather than re-judge the whole delta.

> **Archived — do NOT add a residual/confidence gate to pass 1.** We tested gating §4 so
> it skips "confident, on-the-linear-progression" ticks (offset vs cum-Greek-word
> expectation). Measured against Rackham gold it fails: drift happens across whole text
> blocks, so a misplaced tick often sits *near* the linear expectation. Even a 23 % skip
> already loses ~30 % of bad-tick recall; bigger skips collapse recall to ~50–60 %.
> `VERIFY_ALL=1` stays **mandatory for pass 1** (100 % baseline recall). The cheap win is
> scoping pass *2* (above), not gating pass 1.

## 6. Validate (optional)
- **Numeric eval** (needs a Bekker-milestoned gold, e.g. Rackham): `--gloss-eval --work
  <SLUG> --books 1`. Gold is soft (its own mid-column ticks are approximate) — **trust
  the `column` tier over `five_line`**; a median error of 0 with a few sentence-sized
  outliers is the expected shape, not a failure.
- **Human spot-check** (any translation): open `review/book-NN.html`. Watch for
  **early drift** — a tick placed on the line *above* its Greek line. The §4 + correction
  pass removes most; a residual few are normal. This is incremental — refine the prompts
  over successive works rather than chasing a perfect single run.

---

# Phase B — implement the alignment into the site (do once, after all books)

## 7. Wire the ticks into the reader
1. **Build the combined map + index** the pipeline reads:
   ```bash
   uv run python tools/make_index.py <WORK> <vid>      # e.g. EN ross
   ```
   → `alignment-results/<vid>/<WORK>_<vid>_gloss_map.json` (tracked) + `index.html`.
2. **The pipeline auto-consumes it — no edits needed.** `stage1_ross._load_align_map`
   prefers `alignment-results/<vid>/<WORK>_<vid>_gloss_map.json`; `_REAL_CONF` already
   includes `confirmed`; `_real_ticks` upgrades **every** confident cadence tick to
   real. The reader renders the secondary translation as flowing prose with each
   Bekker number floated into the margin at its exact offset (`.ross-prose`/`.bk-num`
   in `Reader.svelte`/`global.css`) — no line break, no in-text number.
3. **Rebuild the data + app:**
   ```bash
   uv run python -m aristotle_pipeline all --work <WORK>   # stage2 PASS, key_failures=0
   cd ../app && npm run build                              # Node 22
   ```
4. **Verify** in the reader (`/<WORK>/book/<n>?view=english&trans=<vid>`): the gutter
   shows mostly real numbers, sitting mid-sentence where they belong.
5. **Deploy** per the usual gh-pages flow (the pipeline reads the tracked map, so a
   clean rebuild reproduces the ticks).

**Restoring glosses for a re-run:** the aligner reads `build/align/glosses/<SLUG>/`
(git-ignored). If `build/` was wiped, copy the tracked copies back first:
`cp alignment-results/<vid>/glosses/<SLUG>/*.json build/align/glosses/<SLUG>/` (glosses
are namespaced per work under `glosses/<SLUG>/` — works sharing a vid, e.g. ross = EN +
Meta + Juv, would otherwise clobber each other's `<book>-<ch>.json`; then re-run
from §3). Only the combined **map** is needed for the app build itself.

---

## 8. Decisions, caveats, knobs
- **Matcher:** lexical (word-overlap) — default, no dependency, ties/beats mpnet.
- **Fingerprint:** the full 3-line window gloss.
- **Gloss style:** standard-terminology = robust default; translator-style = booster
  only for translations the model knows well (it reproduces their wording on famous
  lines — fine when that translation is the target, useless for obscure ones).
- **Verify = Greek-anchored, judge-structured (the §4 rewrite).** The target is the raw
  `greek_tick` line, not the gloss; the agent judges/corrects `current_placement` (the
  pass-1 offset) and returns a lean `{verdict, phrase}` under a schema. This replaced the
  old "gloss = target, free-form phrase" verifier that drifted ~40% (early, onto the line
  above) and forced the sprawling correction rounds on Ross-EN and Pol-Jowett.
- **One correction pass, not N — scoped.** §4 run a second time (now confirming real
  pass-2 placements) is the whole "audit", but re-gather only the pass-1 `early`/`late`
  ticks (`VERIFY_FILTER=early,late`) — confirmed ticks don't move (0 clamp collateral on
  Ross-EN). Fold once, ship; do not loop. A post-correction re-check may **sample** 1–2
  chapters/book.
- **Pass 1 stays full (`VERIFY_ALL=1`).** Do not gate pass 1 by confidence or by
  offset-vs-linear residual — both drop bad-tick recall hard (see the archived note in
  §5b). The cheap win is scoping pass *2*, not skipping pass 1.
- **Token rules:** schema-validated output everywhere; **no `reason` field** (the biggest
  sink); keep `verdict` in `verify_out`; correction pass run once and scoped via
  `VERIFY_FILTER`; sample the re-check.
- **No single pass is clean.** Measured against external (Rackham) gold, even the judge
  pass lands the *median* tick exactly but misses ~1 in 5 hard ticks — the correction
  pass and a human eye on `review/*.html` are load-bearing, not optional polish.
- **Soft gold:** a milestoned reference's own ~line-20 ticks are approximate, so the
  numeric eval *understates* `five_line` accuracy. Trust the `column` tier most.
- **Honest estimates:** ticks the verifier can't place (translator condenses the
  passage; chapter-boundary divergence) stay `reliable`/`uncertain` → shown italic/grey.
- **Reuse:** gloss a work **once**; align every translation of it against the same
  glosses.

## Quick reference — whole work, end to end
```bash
cd pipeline
uv run python -m aristotle_pipeline stage1 --work <SLUG>                       # 0
uv run python -m aristotle_pipeline.align --emit-gloss-tasks --work <SLUG>     # 1
# 2: sub-agent per chapter → build/align/glosses/<SLUG>/<b>-<c>.json
for b in <books>; do
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b   # 3 pass 1
  WORK=<SLUG> VERIFY_ALL=1 uv run python tools/verify_gather.py $b              # 4 gather (greek + current_placement)
  # 4: judge-structured Workflow fan-out (schema {citation,verdict,phrase}, NO reason)
  #    → write each agent record VERBATIM ({chapter,ticks:[...]}, keep verdict) to
  #      build/align/verify_out/<SLUG>/<b>-<c>.json
  WORK=<SLUG> uv run python tools/verify_to_offsets.py $b                       # 5 fold
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b   # 5 pass 2
  uv run python tools/persist_book.py $b                                        # 5 persist
  # 5b CORRECTION (scoped — re-gather ONLY pass-1 early/late ticks, before re-judging):
  WORK=<SLUG> VERIFY_ALL=1 VERIFY_FILTER=early,late uv run python tools/verify_gather.py $b
  #    judge Workflow again on the delta → overwrite those phrases → fold/pass2/persist once
  WORK=<SLUG> uv run python tools/verify_to_offsets.py $b
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b
  uv run python tools/persist_book.py $b
done
uv run python tools/make_index.py <SLUG> <vid>                                  # 7 combined map + index
uv run python -m aristotle_pipeline all --work <SLUG>                           # 7 rebuild data
cd ../app && npm run build                                                      # 7 build app
```
