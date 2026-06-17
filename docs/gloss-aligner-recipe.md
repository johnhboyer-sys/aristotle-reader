# Gloss-based Bekker aligner — full recipe (any work, any translation)

Reusable runbook for placing real Bekker line-ticks on an **unmarked** translation
(no Bekker numbers, no Bekker-milestoned sister translation required). This is the
spec-v2 "Method A" (gloss → match) plus the "Method B" verifier, validated on NE
Book 1 (2026-06-16). It needs only the Greek spine + the translation's clean prose.

Implementation lives in `pipeline/aristotle_pipeline/align/`:
`glossing.py`, `reference.py` (`load_gloss_chapters`), `aligner.py`
(`align(..., provider="gloss")`), `eval.py` (`run_gloss_eval`),
`gloss_review.py`. Experiment scaffolding: `build/verify_gather.py`,
`build/verify_score.py`, `build/bakeoff.py`.

The model steps (glossing, verifying) are run by **Claude Code sub-agents on the
Max plan** — no API key, nothing billed. Python only reads the JSON they write.

---

## 0. Prerequisites (per work)

1. The work is built through **stage1** so `build/stage1/` holds *this* work's
   `greek_spine.json` + `english_chunks.json`. `build/stage1` is single-work
   scratch — always (re)build the target work first:
   ```bash
   cd pipeline && uv run python -m aristotle_pipeline stage1 --work <SLUG>
   ```
2. The unmarked translation is vendored under `sources/<dir>/` and parses to
   `{(book, chapter): prose}` via `stage1_ross.parse_translation(dir, books, marker)`
   (markers: `number` | `part` | `part_roman`). Declare it as the manifest's
   `english.secondary` (id, dir, books, marker) so `reference.default_target`
   finds it; otherwise pass `target_prose` explicitly.
3. Confirm the prose is clean (no stray numbers/footnotes):
   ```bash
   uv run python -c "from aristotle_pipeline.stage1_ross import parse_translation; \
   from aristotle_pipeline.config import SOURCES_DIR; \
   t=parse_translation(SOURCES_DIR/'<dir>',<books>,'<marker>'); \
   print(len(t), 'chapters'); print(repr(next(iter(t.values()))[:160]))"
   ```

---

## 1. Emit the tick windows (Greek to be glossed)

Ticks = line 1 of each Bekker column + every 5th line. Each tick gets a **3-line
window** (line above, tick, line below; clamped at chapter/column edges).

```bash
uv run python -m aristotle_pipeline.align --emit-gloss-tasks --work <SLUG> [--books 1]
```
→ writes `build/align/gloss_tasks/<SLUG>/<book>-<chapter>.json`, each a list of
`{tick, is_column_start, lines:[{citation, greek}, ...]}`.

Spot-check a few windows against the spine before glossing.

---

## 2. Gloss the windows (sub-agent per chapter)

Spawn **one sub-agent per chapter** (parallel). Each reads its task file and writes
`build/align/glosses/<SLUG>/<book>-<chapter>.json` = `{line_citation: english}`
covering every line in every window.

**Gloss style — pick per run (see §6 for the trade-off):**
- **Standard-terminology (default, reusable):** lock Aristotle's technical terms
  to conventional scholarly English. Works for any translation; no leakage.
- **Translator-style (booster for well-known translations only):** render in the
  target translator's idiom. Higher accuracy on famous translations, but partly
  reproduces text the model already knows; useless for obscure translations.

### Glossing prompt (fill in WORK / BOOK / CHAPTER; choose one style block)

> You are translating ancient Greek (Aristotle, **<WORK>**, Book **<B>**, chapter
> **<C>**) for a Bekker-line alignment tool. Be precise and faithful — a scholar
> with good Greek will check your work.
>
> Read this file: `build/align/gloss_tasks/<SLUG>/<B>-<C>.json`. It is a JSON list
> of "windows"; each has "lines": a list of `{citation, greek}` — the line above
> the tick, the tick line, and the line below (edge windows may have 2 lines).
>
> Translate EACH Greek line into its OWN English line (verse mode — one English
> line per Greek line, keyed by that line's citation, kept on its own line even if
> longer). Use the neighbouring lines only to get a mid-sentence line's sense
> right. Keep proper names as names (Καλλίας→Callias). Do not merge, reorder, or
> annotate. Each citation appears once across all windows.
>
> **[Standard-terminology]** Render Aristotle's technical vocabulary with the
> conventional scholarly English, used consistently — e.g. ἀρετή=virtue,
> εὐδαιμονία=happiness, ἔργον=function, ἐνέργεια=activity, ἕξις=state, τέλος=end,
> λόγος=reason/account, προαίρεσις=choice, τέχνη=art, πρᾶξις=action.
>
> **[Translator-style — substitute for the block above]** Translate in the idiom
> and characteristic word-choices of **<TRANSLATOR>**'s translation of this work.
> Translate the Greek that is actually given line by line — do NOT paste remembered
> sentences; render THESE lines as that translator would.
>
> Write the flat JSON object `{citation: english}` (UTF-8, nothing else) to:
> `build/align/glosses/<SLUG>/<B>-<C>.json`. Return a one-line summary: chapter +
> number of lines glossed.

**Commit the glosses** — they are expensive and reused across every translation of
the work. `build/` is git-ignored, so either add a `!build/align/glosses/`
exception or move them to a tracked path (rollout decision).

---

## 3. Align (gloss → translation)

```bash
uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> [--books 1]
```
- Reference = the glosses; fingerprint = the **full 3-line window gloss** (not the
  tick line alone — the window tames the worst mismatches).
- Matcher = **lexical** (word-overlap) by default — zero-dependency and as good as
  or better than the embedding model here, because both sides are English and
  overlap on distinctive words. `--backend quality` uses `sentence-transformers`
  (mpnet) if installed; it does **not** beat lexical for this task.
- Tiers: `chapter` / `column` (line 1) / `five_line` (every 5th) are placed; single
  lines between them are interpolated (`line`, always an estimate).
- Confidence = match margin → `certain` / `reliable` / `uncertain`. Output:
  `build/align/<SLUG>_<vid>_gloss_map.json` (+ `_review.json`).

---

## 4. Verify the uncertain ticks (tail-chasing, sub-agent)

Only the `uncertain` ticks need this. Gather their context, re-place by direct
reading, score.

```bash
uv run python build/verify_gather.py     # edit GLOSS_ROOT/BOOKS at top per run
```
→ `build/align/verify_tasks/<SLUG>/<book>-<chapter>.json` (only chapters with
uncertain ticks) + `build/align/verify_meta.json` (each tick's A-offset, gold,
window). Each task tick carries `{citation, greek (window, " / "-joined), gloss,
excerpt}` where `excerpt` is ±600 chars of the translation around Method A's guess.

Spawn **one sub-agent per chapter** that has uncertain ticks → writes
`build/align/verify_out/<SLUG>/<book>-<chapter>.json` = `{citation: phrase}`.

### Verifier prompt (independent direct-reading placement)

> You are placing Bekker line-marks in an English translation by direct reading —
> an independent check on an automated aligner. Be exact.
>
> Read: `build/align/verify_tasks/<SLUG>/<B>-<C>.json`. It has "ticks":
> `{citation, greek, gloss, excerpt}`. For each tick, "greek" is a short window
> (lines separated by " / "); the line to place is the MIDDLE one (or the first, if
> two). "gloss" is its English meaning. "excerpt" is a passage from the translation.
>
> Find the exact point in the EXCERPT where the content of the tick line begins, and
> copy a SHORT verbatim phrase (5–10 consecutive words) from the excerpt starting at
> that point. The phrase MUST be copied character-for-character (so exact string
> search finds it) — do not paraphrase or fix typos. Pick where THAT line's content
> starts, even mid-sentence. If you genuinely cannot locate it, use an empty string.
>
> Write the flat JSON `{citation: phrase}` to:
> `build/align/verify_out/<SLUG>/<B>-<C>.json` (that object only). One-line summary.

```bash
uv run python build/verify_score.py      # before/after error vs gold (when gold exists)
```
Code locates each phrase in the translation (occurrence nearest Method A's guess),
snaps to the sentence start, and replaces the tick. Fold confirmed placements back
into the map (mark `confirmed`); leave genuinely unlocatable ones as estimates.

---

## 5. Validate + review

- **Numeric eval (needs a Bekker-milestoned translation as gold, e.g. Rackham):**
  ```bash
  uv run python -m aristotle_pipeline.align --gloss-eval --work <SLUG> [--books 1]
  ```
  Gloss-aligns the milestoned English (treated as unmarked) and scores predicted
  ticks against its real embedded ticks — a true cross-method gold. Reports
  per-tier exact / mean / median / max. Use `build/bakeoff.py` to compare gloss
  styles, `build/verify_score.py` to measure the verifier's lift.
- **Human spot-check (any translation, no gold):**
  ```bash
  uv run python -c "from aristotle_pipeline.align.gloss_review import write_html; \
  print(write_html('<SLUG>', [1]))"
  ```
  → dark-mode HTML: each tick's **full window gloss** (tick line highlighted) beside
  the translation text it landed on. If the gloss and the excerpt say the same
  thing, the citation is right. Uncertain rows are tinted.

### Validated results (NE Book 1, vs Rackham gold)
- Neutral gloss: 69% exact. Standard-terminology: 75%. **Translator-style (Ross):
  86% exact, mean error 22 chars** (word-overlap matcher).
- **Verifier on the uncertain ticks: exact 3/9 → 8/9, mean error 143 → 23 chars**
  (the 1 holdout is soft-gold — the verifier was actually correct).

---

## 6. Decisions, caveats, knobs

- **Matcher:** lexical (word-overlap) — default, no dependency, ties/beats mpnet.
- **Fingerprint:** the full 3-line window gloss (not the tick line alone).
- **Gloss style:** standard-terminology = robust default (reusable, no leakage);
  translator-style = booster **only** for translations the model knows well, and it
  reproduces that translation's wording on famous lines (a `1097a15` Ross gloss came
  back as Ross's exact opening). The eval is honest because it scores against a
  *different* translation (Rackham), where copying can't help.
- **Soft gold:** a milestoned reference's own mid-column (~line-20) ticks are
  approximate, so the numeric eval slightly *understates* accuracy at the
  `five_line` tier. Trust the `column`-start numbers most.
- **Confidence gate:** before emitting real ticks into the reader, recalibrate
  `stage1_ross._REAL_CONF` for the gloss provider (its margins differ from the
  milestoned path). Ticks below the gate ship as estimates.
- **Reuse:** gloss a work **once**; align every translation of that work against the
  same glosses. Verify only the uncertain ticks (targeted mode), not every tick.
- **Persistence:** glosses/maps land in git-ignored `build/`; give them a tracked
  home before relying on them long-term.

---

## Quick reference — one translation, one work

```bash
cd pipeline
uv run python -m aristotle_pipeline stage1 --work <SLUG>                 # 0
uv run python -m aristotle_pipeline.align --emit-gloss-tasks --work <SLUG>   # 1
# 2: sub-agent per chapter → build/align/glosses/<SLUG>/<b>-<c>.json (glossing prompt)
uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG>     # 3
uv run python build/verify_gather.py                                     # 4 (gather)
# 4: sub-agent per chapter with uncertains → build/align/verify_out/... (verifier prompt)
uv run python build/verify_score.py                                     # 4 (score)
uv run python -c "from aristotle_pipeline.align.gloss_review import write_html; write_html('<SLUG>',[1])"  # 5
```
