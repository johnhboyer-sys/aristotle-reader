# Apostle import campaign — plan (written 2026-07-09)

The Goal-A OCR-repair pipeline shipped for the two Clarendon build corpora
(Parts of Animals / Lennox, Posterior Analytics / Barnes) in PR #29. This doc
scopes the **follow-on track**: importing Hippocrates G. Apostle's Aristotle
translations (Peripatetic Press). Apostle translated most of the corpus
(Posterior Analytics, Metaphysics, Physics, Nicomachean Ethics, …), so this is a
*recurring edition format*, not a one-off — worth first-class, config-declared
support.

Apostle's *Posterior Analytics* was the stage-7 held-out neutrality corpus; it
proved the pipeline is edition-neutral (config-only, no forced converter change)
and produced the reusable heading-style support below.

## The Apostle edition format (measured on the APo scan)

- **Books = a single Greek letter** — `BOOK A` / `BOOK B` (Α=1 … Ω=24; watch the
  Metaphysics little-α book-2 wrinkle). Body headings carry a WIDE internal gap
  (`BOOK⎵⎵⎵⎵⎵⎵A`); the table of contents and the commentary repeat them at a
  single space (`BOOK A`). The wide-vs-narrow gap is the stage-1 slice
  distinguisher (body heading vs furniture).
- **Chapters = a bare centred arabic numeral** (`2`, `3`, …) with no `CHAPTER`
  keyword. Each book's opening chapter 1 is UNLABELLED (the text starts straight
  in, often after a mangled `]` glyph). Printed numerals sit shallow (indent
  ~9–19), below the converter's `LEFT_MIN` heading gate.
- **All Bekker ticks are VERSO** (leading gutter); a rough scan cuts some off.
- **ENDNOTES, not footnotes** — the body carries superscript markers, but the
  note *bodies* live in the commentary / back-matter section that stage-1 slice
  discards. So "unmatched footnote markers" in the honesty report are
  structurally correct for this edition, not errors.
- The History Genie witness barely aligns with the backbone (translation is
  interleaved with heavy commentary) → tens of thousands of stage-5
  `alignment-gap` diagnostics. These are diagnostics only; the grade is
  unaffected. A future "near-zero witness coverage → single no-witness flag"
  guard would tame the noise.

## What already shipped (PR #29)

A gated `config.headingStyle` block (`corpus-config.ts` + `skeleton.ts`) — every
branch is a no-op when the field is absent, so the Clarendon corpora reproduce
byte-identical:

- `bookOrdinal: "greek-letter"` — a single-letter book label → the spelled
  English ordinal (`BOOK ONE`/`BOOK TWO`), sequence-forced (a misread is flagged,
  never silently renumbered).
- `chapterNumeral: "bare"` — a centred bare numeral → `CHAPTER N`, **re-indented
  to the book-heading column** so it clears `LEFT_MIN`; self-heals over an
  OCR-dropped numeral within a small forward window; **synthesizes each book's
  unlabelled opening `CHAPTER 1`**.
- `applyHeadInsert` now places a running-head placeholder above a letter-ordinal
  book heading that opens a fresh page (no labelled chapter follows it).

Result on Apostle APo, config-only: **2 books / 46 of 53 chapters**. The 7
missing chapters (Book A: 5, 7, 31; Book B: 7, 11, 17, 18) have numerals the scan
dropped — a data floor, not a code gap.

The corpus is staged at `~/Documents/aristotle-ocr/apo-apostle/` (DATA, never
committed): `config.json` (with `headingStyle` + `side: "verso"`), `backbone.txt`,
`witness-genie.txt`. Run: `npx tsx desktop/scripts/ocr-repair.ts --config
~/Documents/aristotle-ocr/apo-apostle/config.json --through 6`.

## TODO

1. **`SEAT-chapter` decided-file directive** (small; the fast first win). The
   OCR-dropped chapter numerals can't be placed automatically, but John
   hand-verifies chapter positions anyway. Add a `SEAT-chapter <book>.<n> <=
   <anchor>` directive parsed in `review.ts` and applied in the stage-2/skeleton
   or a stage-5 pass, mirroring the tick `SEAT` directive (see
   `seating-pass-spec.md`): John points at the line each lost chapter starts on;
   the pipeline inserts a synthesized `CHAPTER n` heading there, sequence-checked.
   Takes Apostle APo 46 → 53. Reusable for every bad Apostle scan.
2. **Endnote wiring** (bigger; own feature). Pull Apostle's endnote bodies from
   the sliced-off back matter and attach them to the body superscript markers so
   the reader shows them. Decide reader UX first (footnote-style popover reusing
   the existing FootnotePopup, vs an end-of-work notes section). Touches the
   importer (capture endnote bodies before/at slice) + the marker→note linking.
3. **Per-work configs** as each Apostle book is imported: Bekker range + book
   count + the shared `headingStyle` / `side: "verso"` block. Metaphysics needs
   the little-α book-2 handling.

## Guardrails (unchanged from the pipeline)

`desktop/src/lib/pdf-import/` stays frozen (zero diff). Corpus files are John's
copyrighted material — local-only, never committed. Every edit logged; Greek
always Tier 2. Any new code stays edition-neutral (behaviour comes from config,
not corpus literals) so the three-corpus neutrality result holds.
