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
> citation, kept on its own line even if longer). Use neighbours only to get a
> mid-sentence line's sense right. Keep proper names as names (Καλλίας→Callias). Do
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
**full chapter text** + every tick's `{citation, greek (window), gloss}`) and merges
`build/align/verify_meta.json`.
*(Cheaper option: omit `VERIFY_ALL=1` to gather only `uncertain` ticks with a ±600-char
window. Optional args: `verify_gather.py <book> <PAD> <chapters>` to re-gather a few
chapters with a wider window.)*

Spawn **one sub-agent per chapter** → `build/align/verify_out/<SLUG>/<b>-<c>.json`
= `{citation: phrase}`. Verifier prompt:

> You are placing Bekker line-marks in **<TRANSLATOR>**'s translation by direct
> reading — the authoritative placement. Read `build/align/verify_tasks/<SLUG>/<B>-<C>.json`:
> it has "text" (the full chapter prose) and "ticks" `{citation, greek, gloss}` in
> Bekker order. For each tick the line to place is the MIDDLE of "greek" (or the first,
> if two); "gloss" is its meaning. For EACH tick, copy a SHORT verbatim phrase (5–10
> words) from "text" starting exactly where that line's content begins — copied
> character-for-character (exact search must find it), placed even mid-sentence (do NOT
> default to a sentence start), with phrases in increasing order. If a tick's content
> genuinely isn't in this chapter, use "". Write the flat JSON `{citation: phrase}` to
> `build/align/verify_out/<SLUG>/<B>-<C>.json`.

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

## 6. Validate (optional but recommended)
- **Numeric eval** (needs a Bekker-milestoned translation as gold, e.g. Rackham):
  `uv run python -m aristotle_pipeline.align --gloss-eval --work <SLUG> --books 1`
  (+ `tools/bakeoff.py` to compare gloss styles, `tools/verify_score.py` for the
  verifier's before/after lift).
- **Human spot-check** (any translation): open the per-book `review/book-NN.html`.

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
- **Verify scope:** verify **every** tick (`VERIFY_ALL=1`) for shipping quality;
  uncertain-only is the cheap tail-clean. Re-verify a few chapters with a wider
  window (`verify_gather.py <book> 4000 <chapters>`) if the verifier returns empties
  because Method A placed the window off (often a chapter-boundary mismatch).
- **Soft gold:** a milestoned reference's own ~line-20 ticks are approximate, so the
  numeric eval slightly *understates* `five_line` accuracy. Trust column-starts most.
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
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b   # 3
  VERIFY_ALL=1 uv run python tools/verify_gather.py $b                          # 4 gather
  # 4: sub-agent per chapter → build/align/verify_out/<SLUG>/<b>-<c>.json
  uv run python tools/verify_to_offsets.py $b                                   # 5 fold
  uv run python -m aristotle_pipeline.align --provider gloss --work <SLUG> --books $b   # 5 pass 2
  uv run python tools/persist_book.py $b                                        # 5 persist
done
uv run python tools/make_index.py <SLUG> <vid>                                  # 7 combined map + index
uv run python -m aristotle_pipeline all --work <SLUG>                           # 7 rebuild data
cd ../app && npm run build                                                      # 7 build app
```
