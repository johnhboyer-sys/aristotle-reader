# D2 — Citation-scheme abstraction (SYNTHESIZED DECISION)

Status: **decided 2026-07-02** by orchestrator synthesis of two independent design memos
(deep-reasoner + Codex). This document is the canonical spec for implementers. Deviations
require orchestrator sign-off.

## Governing rule

A `CitationScheme` is a **frozen interface** (fixed function set + data fields) with open
implementations. General code (editor, library browser, export, autosave) calls the interface
and NEVER branches on scheme id. Acceptance tests, enforced in review:

1. Adding the Aquinas scheme in Phase 3 = one new file in `schemes/` + one registry line.
2. `if (scheme.id === 'bekker-metaphysics')` anywhere outside `schemes/bekkerMetaphysics.ts`
   is a defect.
3. Addresses are **opaque raw strings** outside the `citation/` module. General code never
   inspects `raw`, never compares raws with `<` (Bekker raws are not string-sortable:
   "999b" vs "1000a"), never parses them itself.

## Module layout

```
workbench/src/lib/citation/
  types.ts        # Address, RefSpan, GutterSpec, CitationScheme, WorkMeta — the frozen contract
  bekker.ts       # refs.py port: parse/compare/columnRange (internal parsed structs stay here)
  range.ts        # formatBekkerRange() — THE one shared en-dash range collapser
  registry.ts     # Map<SchemeId, CitationScheme> + getScheme(id) (throws on unknown)
  schemes/
    bekkerStandard.ts     # Roman-numeral book labels
    bekkerMetaphysics.ts  # spread of bekkerStandard, overrides bookLabel only (~15 lines)
    aquinasStub.ts        # implements the full interface; every method throws
                          # NotImplemented("Aquinas citation is Phase 3"). Registered —
                          # compile-time proof the contract fits a non-Bekker scheme.
```

## The frozen contract (types.ts)

```ts
export type SchemeId = 'bekker-standard' | 'bekker-metaphysics' | 'aquinas-tbd';

/** Opaque scheme-owned address. Only the owning scheme parses/compares it. */
export interface Address { scheme: SchemeId; raw: string }   // e.g. "1041a6"

export interface RefSpan {
  scheme: SchemeId;
  book?: number;        // 1-based index into the work's book list
  chapter?: number;
  start: Address;
  end: Address;         // === start for a point reference
}

export interface GutterSpec {
  rowUnit: 'bekker-line' | 'paragraph' | 'sentence';  // Phase 1 renders only 'bekker-line'
  gutterMode: 'address' | 'structural';
}

export interface CitationScheme {
  id: SchemeId;
  parseAddress(raw: string): Address;                  // throws on malformed
  compareAddress(a: Address, b: Address): number;      // total order (page→col→line for Bekker)
  bookLabel(bookIndex: number, work: WorkMeta): string; // reads work manifest labels;
                                                        // scheme provides fallback (Roman / Greek)
  formatRange(span: RefSpan): string;                  // delegates to shared range.ts for Bekker
  formatCitation(span: RefSpan, work: WorkMeta): string; // "*Metaphysics* Ζ.17, 1041a6–b3"
  gutter: GutterSpec;
}

export interface WorkMeta {
  id: string; title: string; author: string;
  scheme: SchemeId;
  books: { n: number; label: string }[];   // labels explicit in manifest, per build-spec §3
}
```

Scheme-internal parsed structs (`{page, column, line}`) live inside `bekker.ts` and are not
exported outside `citation/`.

## Range formatting (range.ts) — used EVERYWHERE

En dash (–, U+2013) always. Three collapse cases (from the build spec §10):

| case | rule | example |
|---|---|---|
| same page, same column | omit repeated page+column | `1041a5–20` |
| same page, column a→b  | omit page, keep column     | `1041a31–b5` |
| different page         | full ref both ends         | `1041b25–1042a5` |

One implementation, called through `scheme.formatRange`. Every display site (citations, chapter
library, export headers, Phase 2 copy-as-citation) goes through it. Note: the reader app has ~4
drifting ad-hoc formatters (annotations.ts:288, Reader.svelte:243/898, Landing.astro:37,
data.ts:38) — do NOT import from or add to those; workbench `citation/range.ts` is canonical here.

## refs.py port (bekker.ts)

Faithful TS port of `pipeline/aristotle_pipeline/refs.py`: `column_key`, `ref_key`, `line_key`,
`column_range` semantics (page → a/b side → line ordering; inclusive column enumeration across
pages). Parity tests: table-driven vitest cases mirroring the Python behavior, including
"999b" < "1000a"-style ordering and a→b transitions.

## Work manifest (YAML, per work)

```yaml
id: metaphysics
title: "Metaphysics"
author: "Aristotle"
original_language: greek
citation_scheme: bekker-metaphysics
tlg_author: "0086"
tlg_work: "025"
books:
  - { n: 1, label: "Α" }
  - { n: 2, label: "α" }    # lowercase alpha — a distinct book, not a typo
  # ... through 14 / Ν
```

## Chapter-file frontmatter (the user's canonical data — highest stakes)

```yaml
---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041b33"
---
```

Decisions baked in (both memos converged independently):
- **`span_start`/`span_end`, NOT `bekker_start`/`bekker_end`.** Deliberate deviation from the
  build-spec example, flagged to John. The values are raw strings the scheme parses; an Aquinas
  chapter uses the identical fields. Bekker-named fields in canonical user files would force a
  file migration in Phase 3 — the exact failure decision 5 of both memos ranked #1.
- **Raw strings, never parsed structs, in saved files.**
- **Chapter file repeats `citation_scheme`** (redundant with manifest by design — a detached
  file must be self-describing). On load, validate equality with the manifest; mismatch = a
  real error surfaced plainly.
- `schema_version: 1` from day one; cheap insurance on canonical data.
- Frontmatter stays flat scalars only (matches the deliberately tiny parser convention from
  desktop/translation-file.ts).

## Phase 1 scope fences

- Both Bekker schemes fully implemented (they differ only in `bookLabel`).
- `aquinas-tbd` registered but throwing; chapter creation for scheme `aquinas-tbd` is disabled.
- Gutter renderer switches on `gutter.rowUnit`; only `'bekker-line'` arm implemented, others
  TODO-stubbed. This scopes the Aquinas punt explicitly instead of assuming a line spine.

## Phase 2 exercise outcome

A real (non-throwing) second, non-Bekker scheme — `busse-paragraph`, modeled on the CAG
page.line citation used for Porphyry's Isagoge on the reader site — was added to prove the
contract at compile time and in tests, not just as a throwing stub. Result: **the contract
holds.** `src/lib/citation/schemes/busseParagraph.ts` (one file) + one `registry.ts` line was
sufficient; no change to editor, library, export, or autosave code was needed. `getScheme`,
`isKnownScheme`, and every general call site keep working unmodified because they were already
written against the interface, never against `bekker-standard`/`bekker-metaphysics` literals.

**SchemeId-union extension precedent.** `types.ts` is "frozen" in the sense of its function set
and data fields, not its `SchemeId` string union — adding `'busse-paragraph'` to that union was
necessary and is the sanctioned extension point for acceptance test 1 ("one new file + one
registry line"). A scheme can't exist without a union member for the type system to attach it
to; this is additive (widens a union) and doesn't touch any interface shape. Future non-Bekker
schemes (including the real Aquinas scheme in Phase 3) follow the same precedent.

**Friction found, reported honestly:**

- `bookLabel(bookIndex, work)` and `RefSpan.book`/`chapter` are shaped for a work with numbered
  books and chapters. Isagoge has neither — it is one continuous text. The scheme still had to
  implement `bookLabel` (can't omit a contract method) against a `WorkMeta.books: []`; the
  decision made here is to return the empty string rather than throw or invent a fallback
  numbering scheme, and `formatCitation` treats an empty label as "no book part" so no stray
  `.` or space leaks into the citation string. This works, but it means every bookless scheme
  must independently re-derive "empty string means absent" — the contract doesn't say so itself.
  Not severe enough to warrant changing `types.ts` (the union-of-optionals shape in `RefSpan`
  already allows `book`/`chapter` to be omitted entirely at the span level, which is the
  cleaner way a bookless work should be cited — this friction is really about the always-called
  `bookLabel(bookIndex, ...)` method needing SOME return value even when index 1 has no meaning,
  not about `RefSpan` itself). Recommend Phase 3 either accept this documented convention or,
  if Aquinas is also bookless/paragraph-shaped, make the convention explicit in `types.ts`'s
  doc comment on `bookLabel` — a doc change, not a contract shape change.
- `formatRange`'s doc comment says Bekker schemes delegate to the shared `range.ts` formatter;
  `busse-paragraph` does NOT delegate (its page.line collapse semantics — "12.3–7" — don't map
  onto `formatBekkerRange`'s page/side/line assumptions) and instead owns ~10 lines of range
  logic inside its own scheme file, per this doc's guidance. No contract change needed; flagging
  only so Phase 3 doesn't assume every scheme can reuse `range.ts` without checking first.
- No other friction: `parseAddress`/`compareAddress`/`formatCitation`/`gutter` all fit a
  page.line, paragraph-rowUnit, address-gutterMode scheme with no strain.

Tests: `src/lib/citation/__tests__/busseParagraph.test.ts` (scheme-specific table-driven cases),
`schemeIdIsolation.test.ts` (D2 acceptance test 2 made executable — source scan for
`scheme.id === '<id>'` outside `schemes/`), `contract.test.ts` (generic conformance suite run
over every registered scheme, including the throwing `aquinas-tbd` stub) — this last file is
the reusable harness Phase 3 should extend, not replace, when the real Aquinas scheme lands.
