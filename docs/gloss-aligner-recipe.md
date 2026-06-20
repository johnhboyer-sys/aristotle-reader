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

## 2. Gloss the windows (one sub-agent per chapter, parallel)
Each agent reads its task file and writes `build/align/glosses/<SLUG>/<b>-<c>.json`
= `{line_citation: english}`. **Default style = standard scholarly terminology**
(reusable, no leakage). Translator-style is a booster for famous translations only
(see §8). Glossing prompt:

> You are translating ancient Greek (Aristotle, **<WORK>**, Book **<B>**, chapter
> **<C>**) for a Bekker-line alignment tool. Be precise and faithful — a scholar
> with good Greek will check your work. Read `build/align/gloss_tasks/<SLUG>/<B>-<C>.json`
> (a list of "windows"; each has "lines": `{citation, greek}` — line above the tick,
> the tick line, the line below; edge windows have 2). Translate EACH Greek line into
> its OWN English line (verse mode — one English line per Greek line, keyed by its
> citation, kept on its own line even if longer). **Each English line must BEGIN with
> the rendering of its Greek line's FIRST word** — do not pull a line's opening word up
> into the previous line, nor borrow the next line's opening; the English line
> boundaries must coincide with the Greek line boundaries even if a line then starts
> mid-clause (Greek line opens διαφέρειν → that English line starts "differ…"). This is
> what the verifier anchors on downstream, so a shifted boundary here becomes a
> mis-placed tick. Use neighbours only to get a mid-sentence line's sense right. Keep
> proper names as names (Καλλίας→Callias). Do
> not merge, reorder, or annotate; each citation appears once. Render Aristotle's
> technical vocabulary with conventional scholarly English, used consistently —
> ἀρετή=virtue, εὐδαιμονία=happiness, ἔργον=function, ἐνέργεια=activity, ἕξις=state,
> τέλος=end, λόγος=reason/account, προαίρεσις=choice, τέχνη=art, πρᾶξις=action. Write
> the flat JSON `{citation: english}` (UTF-8, nothing else) to
> `build/align/glosses/<SLUG>/<B>-<C>.json`. Return a one-line summary.

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
gloss, context_gloss, current_placement}`) and merges `build/align/verify_meta_<WORK>.json`.
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

Run **as a Workflow fan-out, one agent per chapter, with a JSON schema** (forces
structured output → no chatty prose, no malformed JSON, no retries). The workflow
collects the validated results; you write `build/align/verify_out/<SLUG>/<b>-<c>.json`
= `{citation: phrase}` from them. **Lean schema — verdict + phrase, NO free-form `reason`
field** (reasons are the single biggest token sink; omit them):
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

> You are checking Bekker line-marks in **<TRANSLATOR>**'s translation against the GREEK
> (the Greek is authoritative; the gloss is only a sense hint). Read
> `build/align/verify_tasks/<SLUG>/<B>-<C>.json`: "text" (full chapter prose) + "ticks" in
> Bekker order, each with `greek_above`/`greek_tick`/`greek_below` (raw Greek of the line
> before / the tick line / the line after), `gloss` (hint), and `current_placement` (the
> translation text now sitting at the tick).
>
> For EACH tick judge whether `current_placement` BEGINS exactly at the English rendering
> of **`greek_tick`'s FIRST word**: `ok` = it does; `early` = it begins on content that
> belongs to `greek_above` (one clause/line too high); `late` = a clause into `greek_tick`
> or onto `greek_below`; `unsure` = the translation condenses/omits `greek_tick`. ALWAYS
> return a corrected `phrase`: a SHORT verbatim phrase (5–10 words) copied EXACTLY from
> "text" that begins precisely where `greek_tick`'s first word is rendered (so an exact
> string search finds it; for `ok` it matches `current_placement`'s start). Your phrase
> must NOT include anything rendering `greek_above`, and must NOT start as late as
> `greek_below`. Judge by the GREEK, not by which reading sounds smoothest. Example:
> `greek_tick` opens διαφέρειν → start at the English for "differ", even if the gloss put
> "differ" on the line above. Return every tick. **No explanations.**

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

## 5b. One cheap correction pass (built in, run once)
**No single pass is clean** — measured against Rackham's real line numbers, even the
judge-style §4 lands the *median* tick exactly but still misses ~1 in 5 of the harder
ticks by a sentence (and the gloss-eval gold is itself soft, so trust column-starts
most). The quality we ship comes from **one** correction pass on top — do it, but keep
it cheap and bounded:
1. After §5 fold+pass-2+persist, **re-run §4 exactly as above** — `verify_gather` now
   emits `current_placement` from the *pass-2* offsets, so the second run is a true
   confirm/correct of real placements (this is the "audit" we used to run as a separate
   sprawling stage — it is now just §4 a second time).
2. Keep only the `early`/`late` verdicts; overwrite those phrases in `verify_out` and
   re-run §5 (fold+pass-2+persist) **once**. Leave `ok`/`unsure` alone.
3. **Do NOT loop.** One correction pass, then ship. Iterating agent rounds is where the
   tokens went; the recipe is built to converge in two §4 passes, not N.
**Token rules:** lean schema (no `reason`), schema-validated output, correction pass run
**once**, and for a re-check after corrections you may **sample** (1–2 chapters/book via
the `<chapters>` arg) rather than re-judge the whole work.

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
`cp alignment-results/<vid>/glosses/*.json build/align/glosses/<SLUG>/` (then re-run
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
- **One correction pass, not N.** §4 run a second time (now confirming real pass-2
  placements) is the whole "audit" — keep only `early`/`late` fixes, fold once, ship. Do
  not loop. A post-correction re-check may **sample** 1–2 chapters/book.
- **Token rules:** schema-validated output everywhere; **no `reason` field** (the biggest
  sink); correction pass run once; sample the re-check.
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
  #    → write build/align/verify_out/<SLUG>/<b>-<c>.json = {citation: phrase}
  WORK=<SLUG> uv run python tools/verify_to_offsets.py $b                       # 5 fold
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b   # 5 pass 2
  uv run python tools/persist_book.py $b                                        # 5 persist
  # 5b CORRECTION (run §4 ONCE more — current_placement now = pass-2 offsets):
  WORK=<SLUG> VERIFY_ALL=1 uv run python tools/verify_gather.py $b              #   re-gather
  #    judge Workflow again → overwrite only early/late phrases → fold/pass2/persist once
  WORK=<SLUG> uv run python tools/verify_to_offsets.py $b
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b
  uv run python tools/persist_book.py $b
done
uv run python tools/make_index.py <SLUG> <vid>                                  # 7 combined map + index
uv run python -m aristotle_pipeline all --work <SLUG>                           # 7 rebuild data
cd ../app && npm run build                                                      # 7 build app
```
