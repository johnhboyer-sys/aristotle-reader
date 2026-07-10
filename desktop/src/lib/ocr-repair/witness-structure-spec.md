# Structured-witness pairing + typography harvest — SPEC (2026-07-10)

## Problem

The Apostle APo read-through surfaced dense unrepaired garbles in chapter I.1
(19 hand-FIXes for one chapter). Root cause: stage 5's witness pairing barely
matched the Genie witness against the backbone (~76k `alignment-gap`
diagnostics), so the vote arbitration that cleaned Barnes never engaged —
every backbone garble survived. The witness itself is CLEAN for the
translation text and carries the printed typography the backbone lost:
endnote superscripts (`<sup>5</sup>` and `$^{17}$` forms) and semantic
italics (`*knows*` = ἐπιστήμη — philosophically load-bearing in Apostle).

The witness is a structured markdown document:

- `## Table of Contents` (52) / `## Summary …` (147) — front matter, skip
- `## *Posterior Analytics*` (240) — THE TRANSLATION, ends at COMMENTARIES
  - `### BOOK A`, chapters as bare-numeral headings `### 1` … (heading LEVEL
    jitters: `## 22`, `## BOOK B` (1092) — the OCR promotes some to H2)
- `## COMMENTARIES ON THE *POSTERIOR ANALYTICS*` (1529) — endnote bodies
  (the future endnote-wiring source), skip for pairing
- `## Glossary` (5486) — skip

## Design (three parts, all config-gated → neutrality preserved)

New corpus-config block (DATA-describing, edition-neutral code):

```json
"witnessStructure": { "format": "genie-markdown" }
```

Absent (pa-lennox, apo-barnes) → every new branch is a no-op; both Clarendon
corpora and the CURRENT apostle cut (before enabling the flag) must reproduce
byte-identical. Enabled → the passes below.

### Part 1 — witness-structure.ts (new module)

`parseWitnessStructure(witnessText)`:
- Find the translation section: the `##` heading whose text (markdown
  stripped) case-insensitively equals the work title, through the next `##`
  heading that is NOT a book/chapter heading (e.g. COMMENTARIES).
- Within it, book boundaries = headings `BOOK <token>` (letter ordinals, same
  GREEK_LETTER_ORDINALS semantics as skeleton, sequence-forced); chapter
  boundaries = headings that are bare numerals at ANY heading level (## or
  ###), sequence-forced per book with the same WINDOW=3 self-heal as the
  skeleton's bare-chapter logic; missing witness chapters are fine (the map
  just lacks that key).
- Returns `Map<"book:chapter", { text: string, startLine: number }>` plus
  tier-2 diagnostics for sequence conflicts.
- ALSO returns the commentary section span (for the later endnote pass —
  parse now, don't consume).

### Part 2 — chapter-scoped pairing (stage 5)

Where vote/witness-pairing currently searches the whole witness, when the
config flag is present and the skeleton has already normalized chapter
headings (stage 2 runs before stage 5), restrict each backbone chapter's
candidate witness lines to that chapter's witness slice (fall back to global
pairing for chapters absent from the witness map). Everything downstream
(arbitration rules, Tier-2 Greek policy, changelists, review rendering) is
unchanged — the goal is coverage, not new edit kinds.

Success metric: alignment-gap diagnostics collapse; the I.1 garbles John
reported get arbitrated (compare against the 19 hand-FIXes — the FIX
directives still apply afterwards and must not conflict; FIX wins because it
runs in the same stage from decisions, applied before/idempotent-with
arbitration — verify ordering).

### Part 3 — typography harvest (new stage-6.5 pass, or inside stage 6)

From high-confidence paired regions only:
- **Endnote markers**: witness `<sup>N</sup>` / `$^{N}$` attached to a word →
  glue `N` at the matching backbone word (`understood,` + sup 5 →
  `understood,5`), the Barnes marker convention the frozen converter reads.
  Where the backbone already carries a garbled glyph at that spot (`>`, `!*`,
  `'®`, stray `"`/`'`/`°`/`?`), REPLACE the glyph with the digit; where the
  backbone has nothing, insert. Skip when a decided-file FIX already covers
  the site (decided file wins).
- **Italics**: witness `*span*` → wrap the matching backbone words in `*…*`
  (converter passes them through; the importer's emphasis scanner renders
  italic). Filter furniture italics: running heads, `*Posterior Analytics*`
  self-references in headings, single `*a*`/`*b*` enumeration markers are
  KEPT (Apostle uses them meaningfully: `(*a*)`), but title-case philosophy
  principles per Apostle's preface are kept too — the filter list is only
  page furniture.
- Every projection is a Tier-2 change record (rule `witness-typography`,
  evidence: witness line, matched offset, confidence); unmatched or
  low-confidence sites become review entries, never guesses.

Grade guardrails: chapters/books/tics counters unchanged; fnUnmatched will
RISE (markers restored but endnote bodies still sliced off — structurally
correct for this edition, do not "fix" it); pdf-import stays zero-diff;
`FINAL` reproducibility from the decided file byte-identical run-to-run.

## Verification checklist

1. Unit tests: witness-structure parse (incl. heading jitter, sequence
   self-heal, missing chapters); chapter-scoped pairing fallback; typography
   projection (replace-glyph, insert-digit, italics wrap, furniture filter,
   FIX-site skip).
2. Neutrality: pa-lennox + apo-barnes FINALs byte-identical with their
   decided files; apo-apostle WITHOUT the config flag byte-identical to the
   current signed-off cut.
3. apo-apostle WITH the flag + decided file: grade holds 2bk/53ch, seats 7,
   dropped-lines not worse; I.1 spot-read against witness lines 247–251
   (the 19 hand-FIX sites must all be clean, whether by FIX or arbitration).
4. Whole-corpus garble sample: pick 10 random witness sup-markers and 10
   italic spans, confirm projection or review-flag (no silent misses).

## Out of scope (later items, same campaign)

- Endnote BODY wiring (commentary section → tappable notes) — reader UX
  decision pending with John; the commentary span from Part 1 is its input.
- The 97a tick-repair sitting (garbled `15`→`75`, glued shallow ticks,
  embedded folios) — separate directives batch, drafted after this lands.
- Publisher house-style presets — generalize AFTER this proves the pattern.
