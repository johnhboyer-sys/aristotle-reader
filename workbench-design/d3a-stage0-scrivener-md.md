# D3a — Stage 0: normalizing real Scrivener `.md` exports (ADDENDUM to D3)

Status: **decided 2026-07-02** — deep-reasoner design memo grounded in the two real
export pairs (`workbench/.dev-corpus/scrivener-samples/`, gitignored: John's
unpublished translation + TLG Greek, local-only), reviewed and adopted by the
orchestrator. Subordinate to `d3-scrivener-import.md` — its Governing decisions are
FROZEN and unamended. Two workflow defaults are flagged for John (§1, §4c); both are
implemented as stated unless he overrules.

## 0. What the real exports are (measured)

| file | content lines | Greek paragraphs | markers harvested |
|---|---|---|---|
| Meta 7.17 Greek | 3 | 3 | 24 raw (~18 boundaries after dedup) |
| Meta 7.17 English | 85 | — | 23 |
| APo 1.4 Greek | 5 | 5 | 19 |
| APo 1.4 English | 33 | — | 25 (incl. 4 enum false positives `(1)…(4)`) |

Greek = paragraph flow (3–5 lines per ~60–75-Bekker-line chapter) with inline
markers ~every 5 lines and print soft-hyphens (both `ἐπι- στήμην` and the
marker-interleaved `διορί-\t(25) σωμεν`). English = many short content lines
carrying the SAME marker skeleton, plus Markdown footnotes (`[^fnN]` refs +
multi-paragraph EOF bodies) and inline parenthetical Greek. Neither side fits the
old converter's 1:1 verse format (`scrivener_to_canonical.py` refuses both).
Segment measurement (English-lines vs spine-rows per inter-marker segment):
**Meta 9/17 exactly 1:1, 8 off-by-1, 0 worse** (near-verse, fast path);
**APo 1/10 1:1, 7 off by >1** (merged paragraphs — the case §4c exists for).

## 1. Format detection

`detectFormat(raw): 'canonical' | 'scrivener-md' | 'unknown'` in
`parseImportFile.ts`, before the block parser:

- **canonical**: YAML frontmatter AND `[GREEK]`/`[ENGLISH]` headers → existing path.
- **scrivener-md**: no section headers; ≥3 harvested markers; Greek-script content.
  Two-file selection in the dialog (Greek file + English file; the ≥90%-Greek-tokens
  one is the Greek side). Frontmatter (work/book/chapter/optional bekker_start)
  comes from a small dialog form; d3 hint semantics unchanged.
- **unknown** → refuse: "This file isn't a chapter export I recognize — it needs
  either the workbench's own saved format, or a Greek-and-English pair exported
  from Scrivener with Bekker line numbers."

Both formats converge on the same `ParsedImportFile` and the same preview UI.
**DEFAULT (pending John):** exports are always two files; no combined-file splitter
unless he says Scrivener produces those.

## 2. Marker-harvesting grammar

Ordered `Marker[] {raw, kind, charIndex, bekker?}`:

```
FULL_REF      \((\d{1,4}[ab]\d{1,3})\)          (73a21) (1041b1)
PAREN_LINE    \((\d{1,3})\)                      (25) (9)
UNCLOSED_REF  \((\d{1,3})(?=\s|$)                 (16   → repaired as closed
TAB_BARE      (?:\t| {2,})(\d{1,3})(?=\s|$)      \t14
```

**Enum disambiguation** (APo English `(1)(2)(3)(4)` mid-prose): a `paren-line`
token is dropped as an enum iff single-digit AND space-preceded (not tab) AND
uncorroborated by the Greek side's marker skeleton at the aligned position. Never
drop a corroborated token. `tab-bare` and `full` are always markers.

**Hints only (d3 Governing 2–3):** the first full-ref recenters seeding like
`bekker_start` (frontmatter wins if they disagree; disagreement → console.warn).
Markers become token-boundary anchors (§3) — a prior on where the DP may break;
content wins, and a marker landing >±1 token from the DP's boundary surfaces as a
per-row ⚠: "the line number you typed here sits a word or two off from where the
standard text breaks — check this row."

## 3. Greek re-lineation (paragraph flow → spine line boundaries)

New `relineateGreek()` in `align.ts` (additive; `align()` untouched): token-level
banded DP producing CUT POINTS; the spine's line boundaries dictate where imported
Greek breaks (spine owns structure).

Preprocess `scrubGreekFlow`: join paragraphs (recording offsets); harvest markers
FIRST; hyphen-rejoin both sample forms (rejoin when halves form a plausible token,
re-anchor an interleaved marker to the join; else keep + flag `uncertain-hyphen`);
strip markers keeping token indices; drop provable junk (§7); KEEP editorial `<…>`.

DP: spine window flattened to a token stream remembering each token's row index;
rare-token content seeds (d3 §3.1, token→token) + marker seeds DEMOTED below
content seeds; banded token DP (BAND, GAP ≈ 0.35 reused); emit one import line per
spine row at each row crossing; assert `greekLines.length === spineRows.length`
(row-count invariant at the token layer). User's Greek ≈ spine text, so this is
near an exact-match walk. Divergences per d3 §5: low-sim token → row
`low-confidence` ⚠ with side-by-side; editorial `<λευκόν>` → importGap, kept,
row flagged ("your text has an editorial insertion the standard text doesn't —
kept, but check the line break here"); coverage <40% → d3 §7(a). The SAVED Greek
is the spine Greek (d3 §5); the user's Greek is retained for the on-demand diff.

## 4. English distribution

**4a. Segment by markers**, collapsing consecutive duplicate boundaries (samples
double them: "(9) …(9)"). Segment → spine rows spanning
[thisBoundary, nextBoundary) resolved via SPINE INDEX RANGE, never Bekker
arithmetic (column resets like 73b→74a break arithmetic — measured).

**4b/4c. Placement:** 1:1 count → place by position (quiet ✓; Meta's whole
chapter effectively). Off-by-1 boundary artifacts auto-resolve. Otherwise —
**length-proportional pre-split as an EDITABLE suggestion**: join the segment's
English, cut into row-count pieces at sentence/clause boundaries (`. ; · ” —`)
nearest each row's length-proportional target, weighted by the row's Greek token
count; place piece k on row k; flag EVERY row of the segment ⚠ `split` with
"we guessed how to spread these lines across the standard text's lines — drag
text between rows to fix." Never auto-accepted. Measured effect: APo's 7 hard
segments go from ~30 blank rows of hand-work to a handful of clause drags (~70%
less); Meta unaffected.
**DEFAULT (pending John):** pre-split ON whenever a segment isn't 1:1 (the
alternative — dump-on-first-row with an opt-in "spread these out" button — is
implemented trivially by disabling the heuristic).

## 5. Footnote import

`[^fnN]` refs + EOF bodies → `{^id:phrase}` anchors + `[FOOTNOTES]` entries
(multi-line bodies already supported by chapterfile parse.ts). Ids remap to
chapter-local in first-appearance order. Anchor = the word immediately preceding
the ref, extended left over an abutting parenthetical Greek gloss; unclear anchor →
smallest enclosing sentence + `low-confidence` ⚠. Footnotes travel with their text
through distribution/drags (markup is opaque to the aligner). Orphans: ref without
body → keep anchor, empty body, non-blocking sentence "Footnote N is referenced
but has no text — it'll import empty; add the text later or remove the marker.";
body without ref → cannot be anchored, surfaced: "There's a footnote with no place
in the text (its marker is missing) — it can't be attached, so it's been left out;
check footnote N." Nothing dropped silently.

## 6. Inline Greek in English

A parenthetical whose content is ≥60% Greek-script tokens becomes `{grc:…}` with
the parens OUTSIDE the span: `(τὸ καθόλου)` → `({grc:τὸ καθόλου})`. Greek
punctuation (`·`, `’`) stays inside; pure-Latin and <60%-Greek parentheticals
untouched; detection per-token.

## 7. Artifact scrubbing (conservative, lossless-where-uncertain)

Strip: trailing `[[[[`-style junk; collapse whitespace runs AFTER marker harvest.
Preserve: markdown emphasis (opaque), curly quotes, em-dashes (load-bearing for
§4c), editorial `<…>` (flagged, never deleted), real dashes (never rejoined).
Every content-touching scrub decision produces a preview ⚠, not a silent edit.

## 8. Module placement (core untouched)

```
src/lib/import/scrivenerMd.ts   NEW: detectFormat impl, harvestMarkers,
                                scrubGreekFlow, segmentEnglish, distributeSegment,
                                importFootnotes, markInlineGreek → ParsedImportFile
parseImportFile.ts              + detectFormat dispatch (canonical path unchanged)
align.ts                        + relineateGreek() (additive token DP)
compareKey.ts                   + tokenStream helper
plan.ts                         UNCHANGED signature; runs relineateGreek before the
                                line aligner when source==='scrivener-md'
```

No ImportPlan/RowState type changes — §3/§4 reuse `split`/`low-confidence` etc.

## 9. Test plan

**Committed synthetic fixtures** (invented pseudo-Greek, zero TLG/translation
text): format detection ×3; all four marker forms + unclosed repair; enum
disambiguation (corroboration-gated drop asserted); both hyphen forms + marker
re-anchor; re-lineation (8 fake tokens → 4 rows, typo → low-confidence, editorial
→ importGap + flag); distribution (1:1 fast path quiet, merge segment → pre-split
all-flagged); footnotes (remap, multi-paragraph round-trip, both orphan
sentences); inline Greek ×3; scrub rules. Gates: row-count invariant at token
layer, honesty (every anomaly ⇒ visible flag, asserted), round-trip through
serializeChapterFile.

**Local-only acceptance** (skip-when-absent, real pairs):
- Meta 7.17: all 23 markers within ±1 row of content-aligned position; ≥90%
  segments fast-path or auto-resolved; fn1–fn15 anchored (fn6 multi-paragraph
  intact); zero silent drops; plan not blocked.
- APo 1.4: full-refs seed across the 73b→74a column reset; all 4 enums dropped,
  0 real markers dropped; `<λευκόν>` row flagged not dropped; fn1–fn2 anchored;
  no segment dumps >1 row of text with the rest blank; zero silent drops; plan
  not blocked.
