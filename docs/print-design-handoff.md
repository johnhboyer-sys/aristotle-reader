# Print / PDF layout — design handoff

**Update:** the Claude Design critical-edition spec has now been ported into the
real `@media print` stylesheet (white stock per request). The masthead (DM Mono
`ARISTOTLE` eyebrow · Bodoni Moda indigo title · Cardo Greek title · EB Garamond
citation), oxblood rubrication, `Book N, Chapter M` headings, and justified
English all ship. The brief below remains the reference for the locked structure
and the constraints.

Committed: `978a68a` (feature) + the design-port commit (see `git log`).

## Known-deferred / open
- Source citation sits in the masthead header (not a bottom-of-page footer):
  a true content-page footer + running heads + page numbers need Paged.js.
- Greek title (`greekTitle` in works.ts) is populated for EN only so far; add
  per work as desired.
- Two EN data issues were flagged separately (Ostwald hyphenation artifacts;
  Bekker tick 1095a15 misplacement) — alignment/data, not layout.

## Where the code lives

- **All print styling:** the `@media print { … }` block at the **end of**
  [`app/src/styles/global.css`](../app/src/styles/global.css). This is the only
  place to touch for the design pass. It reuses the on-screen
  `view-greek` / `view-both` / `view-english` column CSS.
- **Print-only masthead markup:** in
  [`app/src/components/Reader.svelte`](../app/src/components/Reader.svelte) —
  `.print-head` → `.print-head-main` (header line) + `.print-head-cite`
  (citation). The header/citation strings are built in the `printHeader` /
  `printFooter` reactive vars.
- **Verify any change:** with the dev server running,
  `SHOOT_BASE=http://localhost:4321/aristotle-reader node app/scripts/print-check.mjs /EN/book/1`
  → writes print-media PNGs + real PDFs (Letter, correct orientation per view)
  to `app/.shots/print/`. Use Chrome DevTools → Rendering → "Emulate CSS media
  type: print" for fast iteration.

## Layout that is LOCKED (don't restructure)

- **Bilingual = landscape, monolingual = portrait.** Driven by a named
  `@page bilingual { size: Letter landscape }` + `.reader-body.view-both { page }`.
- **Bilingual columns:** Greek left, content-sized and flush to the left margin;
  English right, taking the remaining width (the primary read). Tight gutter.
- **Greek:** 10pt, one line per canonical Bekker line (no wrap); line numbers
  left-aligned, flush with the chapter label and the `1094A` Bekker ref.
- **English:** 10pt, solid black, first line aligned to the Greek first line
  (a `-3px` nudge offsets the Cardo↔EB-Garamond ascent difference — if you
  change either font or size, re-check this with `print-check.mjs`).
- **Masthead:** one compact header line
  `Aristotle, <Work> - <Book> (<Bekker>) | <Greek source> - <English>` with the
  full English-translation citation as a credit line beneath it.
- **Bekker margin gutter** on the English side is paint-only (relative prose +
  absolute `.bk-num` markers). Don't change `.ross-prose` padding or `.bk-num`
  position or the markers detach from their lines.
- **Page breaks:** chapter heads stay with their text; Greek lines and inline
  tables never split; orphan/widow guards on prose. No forced page-per-chapter.

## HARD constraints for any visual change

- It must live inside `@media print` and survive the browser's native print
  path (the feature is `window.print()` — no Paged.js, no backend).
- **Polytonic Greek** (breathings, accents, iota subscript) must stay clean.
  The current Greek face is **Cardo**, English is **EB Garamond** (both loaded
  in `ReaderShell.astro`). A new face must have full polytonic coverage and a
  redistribution-friendly licence, and should be embedded/bundled rather than
  relied on from the system — the #1 cause of broken Greek in PDFs.
- No `position: fixed` running footer (repeats every page + overlaps text in
  pure print CSS — that's why the citation sits in the masthead).

## OPEN for the design pass (the fun part)

- Colour/ink: header rule, the accent on `CHAPTER n` and its trailing rule, the
  grey `1094A` ref, line-number colour, the `.bk-num` "approx" italic-grey.
- Typography: type scale and the Greek/English face pairing; the UI font used
  for masthead, chapter labels, refs, and line numbers.
- Chapter-head treatment (`.chapter-head` + `::after` rule), `.seg-ref`
  styling, masthead hierarchy and weight.
- Spacing rhythm (segment spacing, gutter, margins).

## Deferred (not for this pass — would need Paged.js)

Running heads, printed page numbers, a true bottom-of-page footer, per-chapter
print, whole-work export. (A separate desktop/LaTeX tier — see
[`docs/pdf-spike/`](pdf-spike/) — is the path for publication-grade output.)
