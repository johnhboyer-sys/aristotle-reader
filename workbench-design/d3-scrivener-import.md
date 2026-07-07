# D3 — Scrivener-import spine alignment (SYNTHESIZED DECISION)

Status: **decided 2026-07-02** by orchestrator synthesis of two independent design memos
(deep-reasoner + Codex; neither saw the other's). Canonical spec for implementers.
Deviations require orchestrator sign-off. Both memos converged on every load-bearing
decision; §9 lists the divergences and the rulings.

## Governing decisions (both memos independently)

1. **Imported Greek is evidence, never structure.** The bundled spine — in DOCUMENT
   order, not Bekker sort (the Ζ.1 transposition prints 1029b3–12 before 1029b1–2,
   see `src/lib/data/chapterRows.ts`) — is the sole source of row structure. The
   produced chapter always has exactly one row per spine row of the matched chapter
   window; the importer never invents or destroys a row (D1 §Model).
2. **Alignment is Greek-driven.** English rides its Greek partner; English content is
   never matched against anything. (Corollary: the converter's known hazard — its
   `TRAILING_MARKER` regex eating a legitimate trailing number in an English line —
   is benign for placement and needs no special handling beyond a fixture proving it.)
3. **Hints narrow, content decides.** Frontmatter `work` selects the corpus;
   `book`/`chapter` select the primary window; `bekker_start` recenters seeding and
   breaks repeated-phrase ties. None of them ever overrides the content match; a
   contradiction is surfaced as one plain sentence, never silently resolved.
4. **Nothing silently guessed.** Every non-1:1 event is a visible flagged row in a
   preview the user confirms; unplaceable lines BLOCK import until resolved.
5. **Reuse `norm()`** (`src/lib/corpus/normalize.ts`) as the comparison normalizer —
   the same function that governed corpus chapter anchoring. **Reject** `betacode.ts`
   (input-method decoder, not a comparison normalizer — imports are already Unicode)
   and **reject** the desktop TF-IDF aligner's similarity (`desktop/src/lib/aligner/
   similarity.ts` is Latin-only English-prose TF-IDF; its `WORD` regex matches zero
   Greek). The desktop `monotonicAlign` DP is reused as a *pattern* only.
6. **Chapter files are written ONLY via `serializeChapterFile`**; addresses stay
   opaque raw strings outside `src/lib/citation/`; the frozen `CitationScheme`
   contract does not grow. Works whose scheme has `gutter.rowUnit !== 'bekker-line'`
   refuse import up front: "Import isn't available for this work's citation style yet."

## 1. Normalization (comparison-only; on-disk text is never rewritten)

- Base: `norm()` verbatim — NFD, strip `\p{M}` (diacritics AND iota subscript),
  lowercase (final sigma folds for free), punctuation→space (elision apostrophe
  dropped, stem kept), whitespace collapsed. Verified empirically by deep-reasoner.
- New derived-features layer on top (per line, cached): **token set** and **char
  trigram profile** of the normalized string.
- **Movable nu**: folded in the token-derivation layer only — when deriving the token
  set, also index each token's terminal-ν-stripped form (ν after vowel). `norm()`
  itself is NOT forked or modified. (Ruling §9.1.)

## 2. Similarity (new: `src/lib/import/similarity.ts` — Greek-space, distinct from desktop's)

```
sim(u, v) = 0.5 * tokenJaccard(u, v) + 0.5 * trigramCosine(u, v)     ∈ [0, 1]
```

Token overlap is robust to word-order jitter and single differing tokens
(crasis, movable-nu residue); trigram cosine absorbs hand-typing typos and
elision stems. Raw edit distance rejected as a primary component (O(len²)/pair,
over-penalizes legitimate merge/split length changes); permitted only as an
in-cell tie-breaker if fixtures demand it. Calibration expectation: clean
line ≈ 1.0, one-typo line ≈ 0.8–0.9, unrelated < 0.15 — verify on fixtures and
tune the §5 thresholds there.

## 3. Alignment algorithm (`seed.ts` + `align.ts`)

Rare-token anchor seeding → banded monotonic Needleman–Wunsch with gap moves:

1. **Seeding**: inverted index token→spine-row over the window; for each import
   line take its rarest window token (length ≥ 4); a unique posting whose full-line
   `sim ≥ 0.6` becomes a hard seed. Keep the longest strictly-monotonic seed
   skeleton (drop violators, keeping higher-sim).
2. **Banded DP** between consecutive seeds (and both ends): moves are
   **match** (i→j, cost −sim(i,j)), **spineGap** (spine row skipped: user omitted a
   line, or a merge's continuation), **importGap** (import line consumes no spine
   row: a split's continuation, or an alien line). Band `|Δ| ≤ 6` off the
   seed-interpolated diagonal. Gap penalties ≈ 0.35, tuned on fixtures.
   Deterministic: ties break toward the lowest spine index.
3. **Complexity**: hinted case O(N·B) — sub-100ms for a 350-line chapter. Unhinted:
   escalate window chapter → book → whole work (Codex), scoring only the seed
   skeleton at each candidate offset of a sliding window (O(M) cheap passes), then
   one banded DP at the best offset — a few seconds at M ≈ 10k. The full N×M DP is
   never run.

## 4. Window strategy

- `work` → `loadCorpus(workId)`; absent corpus is failure (f) in §7.
- `book`+`chapter` → spine window `[startIndex(K) … startIndex(K+1)-1]` computed by
  THE SAME code the editor uses (see §8 refactor), **dilated ±8 rows** into the
  neighbors — the user's chapter division may differ from TLG's by a line or two;
  dilation affects only where the aligner may look, the written chapter file is
  still bounded to the canonical window.
- `bekker_start` → parsed by the scheme (never by the importer), recenters the seed
  diagonal, breaks repeated-phrase ties. Absent → pure content. Contradicting
  content → content wins + failure sentence (b).
- No book/chapter at all → whole-work sweep, then the user confirms the located
  chapter.

## 5. Per-row assignment semantics + confidence

Path → one English cell per spine row:

| event | placement | state/flag |
|---|---|---|
| 1:1 match | English of line i → row j; **spine Greek is what's saved** (user's Greek shown as on-demand diff when it differs) | `matched` (quiet ✓) or `low-confidence` ⚠ |
| split (1 import line ↔ 2+ spine rows) | whole English on the FIRST row of the span; later rows empty | both rows ⚠ `split`; user may move text in preview |
| merge (2+ import lines ↔ 1 spine row) | English lines concatenated with a space into that row | ⚠ `merged` |
| user omitted a spine line | row's English empty | ⚠ `no-source` |
| alien import line (matches nothing) | NO home; goes to the "unplaced lines" list | `orphan` — **blocks import** until user assigns or discards it |

Auto-accept (quiet ✓) requires ALL of: 1:1 span, `sim ≥ 0.55`, healthy margin over
the runner-up spine row, no adjacent gap event. `0.30 ≤ sim < 0.55` → ⚠
`low-confidence` (user's Greek shown beside spine Greek). `sim < 0.30` → not a
match; becomes gap/orphan. Structural flags are always ⚠ regardless of score.
A chapter with > ~25% ⚠ rows shows a banner: "This chapter's lines didn't line up
cleanly with the standard text — review carefully before importing." No numeric
scores are ever shown to the user — plain-language badges only.

## 6. Preview/confirmation UI (`src/components/ImportDialog.svelte`)

Modal preview table, one row per SPINE row (so its length is the true chapter
length): Bekker address | spine Greek | proposed English | state badge. Below it,
the unplaced-lines list ("this line didn't match any Greek line — assign it to a
row or discard it": per-item [assign to row ▾] [discard]). The Import button is
disabled while any orphan is unresolved. Quiet rows render with a check; the eye
goes to ⚠ rows. Footnote/format markup inside imported English (`{^id:…}`,
`{grc:…}`, `**…**`) is opaque to the importer and passes through untouched.
On confirm: build `ChapterFile` (spine Greek + assigned English + `column_starts`
computed from the window's column transitions) → `serializeChapterFile` →
`libraryStorage().write`.

## 7. Failure modes — exact user-facing sentences (details to console.warn only)

| # | condition | sentence |
|---|---|---|
| a | whole-chapter no-match (coverage < 40%) | "None of this chapter's Greek lines matched the standard text for this work — check that the file's work and chapter are right, or that the Greek isn't from a very different edition." |
| b | content matched a different book/chapter than frontmatter | "This file is labeled Book 7, Chapter 17, but its text matches Book 8, Chapter 2 — import there instead, or cancel and fix the label." |
| c | chapter file already exists | "You already have a saved Book 7 Chapter 17 — importing will replace it; the current version will be lost." (explicit Replace/Cancel; see ruling §9.5) |
| d | [GREEK]/[ENGLISH] count mismatch (pre-alignment guard) | "This file has 24 Greek lines but 23 English lines — they must match one-to-one; fix the file and try again." |
| e | empty block (pre-alignment guard) | "This file's [GREEK] (or [ENGLISH]) section is empty — there's nothing to import." |
| f | corpus absent | "The standard Greek text for this work isn't on this Mac yet, so lines can't be matched — add the work first, then import." |

## 8. Module layout + one shared-code refactor

```
src/lib/import/
  parseImportFile.ts   # frontmatter + [GREEK]/[ENGLISH] → {frontmatter, greek[], english[]}
                       #   + guards (d), (e). No Bekker parsing here.
  compareKey.ts        # norm() re-export + token-set/trigram derivation (movable-nu fold here)
  similarity.ts        # hybrid Jaccard+trigram (Greek-space)
  seed.ts              # rare-token inverted index + monotonic seed skeleton
  align.ts             # banded NW + path → per-spine-row assignments
  plan.ts              # orchestration: corpus, window, align, ImportPlan for the dialog
  __tests__/           # incl. the degraded-fixture builder
src/components/ImportDialog.svelte
```

**Refactor (required):** `chapterRows.ts` exports its windowing primitives (one
`chapterSpineRows(corpus, chapters, book, chapter)` helper wrapping `flatLines` +
`startIndex`) so the importer and the editor share the identical window by
construction. Zero behavior change; makes the row-count invariant structural.

## 9. Divergences between the memos — rulings

1. **Movable nu** — reasoner: let the metric absorb it; Codex: fold in a secondary
   token key. **Ruling: fold in the token layer** (one deterministic line;
   token-level metrics otherwise score ἐστίν/ἐστί as a full token mismatch).
2. **Similarity components** — Codex added an edit-ratio term. **Ruling: two-component
   hybrid** (perf; edit distance as tie-breaker only if fixtures demand).
3. **Search shape** — reasoner: seeds + banded NW; Codex: 1–3-row span DP with top-3
   paths. **Ruling: seeds + banded NW** (simpler, faster, same expressiveness), PLUS
   Codex's margin condition folded into auto-accept (§5).
4. **Auto-accept gate** — **Ruling: union of both**: threshold (reasoner) AND
   structural conditions 1:1/margin/no-adjacent-gap (Codex).
5. **Duplicate chapter file** — reasoner: explicit Replace/Cancel; Codex: block with
   no overwrite path. **Ruling: Replace/Cancel with the plain warning** — the app has
   no file-manager UI, so a hard block strands a non-technical user with no in-app
   way forward. FLAGGED FOR JOHN in the phase summary (canonical-data safety call).
6. **Module path** — `src/lib/import/` flat (files are few; re-nest under
   `import/scrivener/` only if a second import source ever appears).

## 10. Test plan (acceptance gates)

Fixture builder degrades a real dev-corpus chapter (Ζ.17 book 7 ch 17, the guide's
worked example) into import files:

1. diacritic/breathing noise + σ/ς flips + movable-nu drops on every line → all
   still `sim ≥ 0.55`, 100% auto-accept, exact addresses;
2. one merged line (two spine rows' Greek in one import line) → `split` semantics
   per §5, spine still M rows;
3. one split line (one spine row's Greek across two import lines) → `merged`
   concatenation, no row invented;
4. one missing line → `no-source` row, monotonicity intact around it;
5. one alien line ("a translator's note to self") → orphan list, plan `blocked`;
6. wrong `bekker_start` (plausible ref elsewhere in the work) → content wins,
   discrepancy surfaced, correct window chosen;
7. English line whose trailing "…Book 14" number was eaten by the converter →
   lands intact-minus-14 on the right row (placement is Greek-driven);
8. wrong declared chapter → failure sentence (b) verbatim.

Gates: **round-trip** (`parseChapterFile(serializeChapterFile(f))` deep-equals);
**row-count invariant** (imported chapter row count === `chapterRows(...)` length —
the single most important assertion); **address fidelity** (each row's implied
address === spine row's `address.raw`); **determinism** (same input → identical
plan); **performance** (350-row hinted < 100ms; whole-Metaphysics unhinted < 3s;
soft budgets, hard-fail at 2×); **honesty** (alien line present ⇒ plan blocked —
"nothing silently guessed" as a failing assertion, not a vibe); all six §7
sentences produced verbatim by their triggering fixtures; every §5 state reachable
in the dialog.
