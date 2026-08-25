# Importer scope — DECISION DOC (drafted 2026-08-25, RULED 2026-08-25)

Scopes the desktop importer so import work can un-park (John's call 2026-07-06: hold
until the tooling is scoped — what it must normalize / strip / reject pre-import).
Written to the standing **two-layer rule**:

- **FORMAT layer** — publisher-invariant, declared in config, reusable. Grows into
  `preset[publisher] + edition + registry[work]` (~6–10 publishers).
- **DAMAGE layer** — per-copy scan repair, entered as decided-file directives (FIX /
  DROP / SEAT / SEAT-chapter / SEAT-witness-chapter / SEAT-commentary-chapter / PAD /
  NOTICK), John-verified, never in config, never committed.

**Governing doctrine (Q2, ruled):** "The app is not an OCR cleanup engine. It documents
what an import file must look like and refuses files that don't comply; heavy repair
stays dev-side, and the FINAL cut is the permanent handoff for witness-arbitrated
copies." §5's steps are a port of the light/pure passes only; nothing below is a
migration toward app-only.

Nothing corpus-literal in code; a control that mixes "which publisher" with "fix these
OCR misses" is wrong by construction. Companion docs, not duplicated here:
`apostle-import-plan.md`, `seating-pass-spec.md`, `witness-structure-spec.md`,
`../pdf-import/{ocr-target-format,importer-acceptance}.md`.

## 1. Current pipeline map

App = runs in the packaged app today. CLI = `desktop/scripts/ocr-repair.ts`, dev-side
only, producing a FINAL cut John imports by hand.

| # | Pass | Module | Runs where | Layer |
|---|---|---|---|---|
| 1 | slice front/back matter | `slice.ts` | CLI | FORMAT (`config.slice`) |
| 2 | skeleton: head insert/strip, folio repair, heading normalize | `skeleton.ts` | CLI | FORMAT + DAMAGE (PAD, SEAT-chapter) |
| 3 | gutter re-seat | `gutter-reseat.ts:966` | CLI | FORMAT geometry; witness **optional** |
| 4 | spacing normalize / de-indent | `spacing.ts:441` | CLI | FORMAT |
| 5 | align + vote (witness arbitration) | `vote.ts`, `align.ts` | CLI | DAMAGE (witness required) |
| 6 | footnote normalize | `footnote-repair.ts:442` | CLI | FORMAT shape; **marker glue witness-gated** |
| 6b | endnote blocks from witness commentary | `endnote-blocks.ts` | CLI | FORMAT trait + DAMAGE source |
| — | layout detection (`\f`) + refusal / collapsed-page choice | `pdf-import/index.ts:45`; `ImportDialog.svelte` `convert-refused`, `convert-choice` | App | FORMAT |
| — | layout → tagged conversion | `pdf-import/index.ts:49` | App import **and CLI grading** (`grade.ts:12`, `scripts/ocr-repair.ts:177`) | FORMAT |
| — | hyphenation audit-by-exception; blank-run → single `\n` | `dehyphenate.ts`; `translation-file.ts:353` | App | FORMAT |
| — | `noTicks` frontmatter peel → aligner | `ImportDialog.svelte:113` → `imports.ts:472` | App | DAMAGE (data) |
| — | alignment + overlay emission | `aligner/import-align.ts` | App | — |

Two verified corrections to the first draft. **Stage 3 does not need the witness**:
`reseatGutter(raw, config, witnessPages?, decisions?)` takes it optionally, only to
decorate ambiguity records (`gutter-reseat.ts:318-320`, `:895`, `:930`); what keeps it
dev-side is John's adjudication of its flags. **Stage 6 is not witness-free**:
`normalizeFootnotes(text, config, witnessText = '')` applies marker glue *only* when the
witness confirms a superscript (`footnote-repair.ts:430`); with none, every candidate
becomes a tier-2 `footnote-marker-unconfirmed` flag and nothing is repaired.

**The gap this doc closes.** Most CLI work is a pure text transform on a layout
extraction — portable. But the app accepts a second class of file the CLI never touches:
an **already-tagged** `.md` with no `\f`, which skips the converter
(`ImportDialog.svelte:120` `acceptText`, `:127`) and gets no pre-clean beyond
hyphenation and blank-run collapse. The Lennox PA v2 fixture is that file, and where the
three defect classes below survived.

## 2. Pre-cleaner contract

**Input bounds.** The pre-cleaner gets the **body only** — what is left after
`parseFrontmatter` and `splitFootnoteBlock` (`translation-file.ts:573`, `:577`); never a
frontmatter fence, never a numbered definition inside the `<<notes>>` block, since a
note definition is exactly the shape S2/S3 delete. Two tests, one per fence. **Order**,
each adjacency load-bearing: `N4 blank-run collapse` → `N3 hyphenation` → `N2 soft-wrap
join` → `N1 page-break join` → tag scan. N4 first because a page-break hyphen arrives as
`word-\n\nword` while the site pattern is `/([A-Za-z]+)-\r?\n([A-Za-z]+)/`
(`dehyphenate.ts:38`) — one newline only. N3 before N2/N1 because both joins delete that
newline. N1 before the tag scan because `scanTags` takes offsets off the normalized body
(`translation-file.ts:359-360`). `[T]` below = must run on the tagged-text path too, not
only the layout path.

**NORMALIZE.**

- **N1 — page-break sentence join `[T]`.** A paragraph boundary that is really a lost
  source page break. **Not decidable from characters alone**, so N1 is
  audit-by-exception like N3, never silent — it *proposes*, and review is one screen
  listing every proposed join in context, a single Accept-all, and per-join exclusion by
  click; no typing anywhere (Q8). *Candidate*: preceding char is a Unicode lowercase letter (`\p{Ll}` — so
  polytonic Greek counts; explicitly not `[a-z]`) or `,`, with `\p{Ll}` following. *Also
  a candidate*, missed by the draft: preceding char `—`, `–`, `"`, `'`, `)` or `»` with
  `\p{Ll}` following — a page break lands after closing punctuation as readily as after
  a letter. *Never, whatever the characters say*: either side inside a display block, a
  list item (`-`/`*`/`•`/`N.`), or a converter-preserved verbatim line; the next
  paragraph opens an open parenthetical or bare Bekker cite (`(see 639a…`, `639a12`);
  the join would cross a `{b.c}` tag. *Defect (a): ~90 of 491 paragraphs in the Lennox
  fixture.* Test: proposals equal the catalogued count; none where the preceding char is
  `.`/`?`/`!`/a digit or the following is `\p{Lu}`; none inside a protected context.
- **N2 — soft-wrap join `[T]`.** Hard-wrapped lines inside a paragraph join at a space.
  Proven on the layout path (`emit.ts`); tagged sources may be hard-wrapped too (Q3), so
  N2 runs on both paths. **On the tagged path N2's activation is DECLARED, not detected.**
  Two content heuristics were tried and both failed adversarial review — one read a
  short-lined, unpunctuated FINAL cut (heading-like paragraphs, polytonic Greek) as
  hard-wrapped and fused every paragraph in the file; the other refused a genuine scan
  because one line overran the measure. The file shape is not decidable from characters,
  and the cost of guessing wrong is the destruction of every paragraph boundary, so the
  importer is asked instead: one screen, two answers, one click, no typing — "Each
  paragraph is one line" (N2 never joins; today's FINAL-cut shape) or "Lines wrapped as
  printed; blank lines separate paragraphs" (single newlines inside a blank-line-delimited
  block join, and N4's blank-line boundaries survive the join as the paragraph newlines).
  This is Q10's precedent — the file declares what the parser cannot infer — applied one
  layer down. The heuristic survives only to choose which answer is preselected; it can
  never act on its own, and the screen is skipped only when both answers give identical
  bytes. **N3 — hyphenation** and **N4 — blank-run collapse** are unchanged
  (`dehyphenate.ts` auto-join / auto-keep / review queue; `translation-file.ts:353`),
  already in-app on both paths.

**STRIP.** Every strip rule **reports its count, including zero** — a rule that silently
finds nothing has not demonstrated it looked.

- **S1 — running heads.** The converter omits each page's first non-blank line from body
  emission (`emit.ts:372`, `gutter.ts:807`), so cleanup must never delete a head —
  insert `runningHeadPlaceholder` instead (`corpus-config.ts:33`; `skeleton.ts`
  `applyHeadInsert`). Correction: not unconditional at *tic* level — a header carrying a
  cadence-consistent tic stays in the tic scan (`gutter.ts:318`, `:811`), so a Bekker
  anchor printed on a head survives though its text does not. `[T]` A tagged source has
  no page skeleton: S1 is layout-only.
- **S2 — folio paragraphs `[T]`.** The draft rule — any paragraph whose whole content is
  a 1–4 digit numeral — is far broader than its layout twin and would eat list items,
  table cells, standalone quantities, bare chapter heads. The twin demands **position
  and cadence**: `getFolioCandidate` (`skeleton.ts:848`) looks only at a page's *last*
  non-blank line; `applyBottomFolioStrip` (`skeleton.ts:1004`) refuses on fewer than 2
  candidates, requires a shared cadence constant, and strips only candidates equal to
  `page + constant`. (`isPageNumberStray`, `skeleton.ts:251`, is a separate page-*head*
  helper — the draft conflated the two.) **Revised `[T]` rule**: a bare-numeral
  paragraph is a folio candidate only inside a maximal run of **≥3** adjacent bare
  numerals whose values form a constant-step arithmetic run (step ≤2) at monotonically
  increasing positions with roughly uniform spacing; every qualifying maximal run is
  proposed, and a run may not start at a value ≤3 directly under a `{b.1}` first-chapter
  tag (numbered-section guard, tightened from ≥2 after adversarial review). Never call a
  bare number a folio from content alone; off-run candidates are reported. *Defect (c): the stray `83` is a
  lone occurrence, so reported, not dropped.*
- **S3 — stray heading numerals `[T]`.** A paragraph whose whole content is a numeral,
  adjacent to a `{b.c}` tag, whose value equals the expected next chapter, is a
  mis-OCR'd division heading. Drop; if it contradicts the tag, flag. *Defect (b): `I I`
  before `{1.4}`.* **The draft cited the wrong parser.** `degarbleNumeral`
  (`skeleton.ts:161`, over `shapeNumeral` `:134`) maps OCR glyphs to *decimal digits* —
  `I`→`1`, `O`→`0`, `S`→`5`, `Z`→`2` — so `I I` returns **11**, not Roman II = 2; the
  Roman parser is `parseCleanRoman` (`skeleton.ts:193`) and is **private**. Required:
  export one style-aware parser taking `strayNumeralStyle` plus the expected chapter,
  trying strict Roman and OCR-shaped Arabic as separate branches and returning whichever
  matches the expectation, else null. Still one parser.
- **S4 — interior running heads.** Split per Q9: the preset supplies the **pattern** —
  what this publisher's interior heads look like (numeral + running-head title shape) —
  as a FORMAT field (§3); the per-copy decided file supplies the **switch** — whether
  this scan needs stripping — as a DAMAGE directive. This replaces the single
  `config.interiorRunningHeads: 'strip'` boolean (`corpus-config.ts:89`) with two fields;
  the split shape is **NEW**. **S5 — front/back matter** (`config.slice`,
  `corpus-config.ts:115`), unchanged.

**REJECT** — fail loud, never import dirty.

- **R1 — no anchors at all.** *Correction: an untagged file does not import as a
  chapterless blob today.* `runImport` already throws "No {book.chapter} tags found…"
  when `parsed.density === 'none'` (`imports.ts:478-484`). R1 is not a new guard but an
  **earlier** one: refuse at file-accept time with the format help, not after the
  metadata form and the dehyphenation/emphasis passes.
- **R2 — no gutter marks** (`pdf-import/index.ts:65`), **R3 — collapsed pages** (`:71`). Unchanged.
- **R4 — structural key audit, both paths.** The draft covered only the seam. *Layout
  path*: more than one work in the file — today a warning (`ConvertReport.seams`,
  `emit.ts:509`); REJECT, since every downstream key restarts across the seam, and the
  refusal names the boundary location (Q5). *Tagged path*: **no audit exists at all** — `splitChapters`
  (`translation-file.ts:627`) slices between chapter tags in file order without checking
  them, then `runImport` builds `new Map(...)` keyed `b:c` (`imports.ts:499-501`), so a
  **duplicate chapter tag silently replaces the earlier chapter's prose**. Required on
  both paths before alignment: reject duplicate, backward, out-of-range, restarted
  chapter keys.
- **R5 — proposed-deletion review.** *Denominator*: paragraphs in the pre-clean body
  (post-frontmatter, post-footnote-block, post-N4), counted once. *Numerator*:
  **distinct** paragraphs marked by S2 or S3 — one claimed by both counts once. *Gate*:
  no cap of any kind (Q4 voided the fractional/absolute-cap machinery) — every import
  with any S2/S3 candidate **always** stops, before any mutation, at a list step showing
  every candidate with its neighbours; nothing auto-applies, and nothing is written until
  the list is dispositioned.
- **R6 — division audit.** The draft's mechanism cannot work.
  `ConvertReport.divisions.books` counts **printed BOOK headings** (`emit.ts:280`,
  reported `:505`), so a valid single-book work — or any file whose books ride on dotted
  `{b.c}` tags — reports `books: 0` and fails a comparison against `WORKS[].books`.
  **Revised**: audit the *emitted tags* — distinct book numbers among `{b.c}` tags, and
  ordered chapter keys within each book — against the registry and `chapters.json`. A
  chapter gap is not cosmetic: since `splitChapters` slices between tags, a missing
  `{1.5}` means chapter 4 **swallows chapter 5's prose**, and a duplicate discards a
  chapter's (`imports.ts:499`). The parser cannot tell "the edition lacks this chapter"
  from "the numeral was dropped in OCR" — so instead of asking the parser to infer it,
  the file declares it (Q10). **Scoped to the file's declared books-covered set** (§3,
  §4): duplicate and backward chapter keys always reject; a missing chapter *inside* the
  declared coverage rejects by default, with a recorded per-copy waiver possible; a book
  *outside* the declared coverage is simply not expected and raises nothing. (Apostle
  APo: 46 of 53, from dropped numerals inside its declared coverage — the case the waiver
  exists for.)

## 3. Preset, edition, work — three tiers, not two

The draft called several fields publisher-invariant that known editions differ on.
Corrected: the **preset supplies defaults**, an **edition** row may override one, the
**registry** supplies structure. Citations into `corpus-config.ts`; `NEW` = does not
exist. The registry itself is bundled in code, not a user-editable file: adding a
publisher ships with an app release (Q7).

Publisher preset (defaults):

| Field | Clarendon / OUP | Peripatetic Press | Source |
|---|---|---|---|
| `headingStyle.bookOrdinal` | absent (keyword `BOOK FOUR`) | `'greek-letter'` | `:78` |
| `headingStyle.chapterNumeral` | absent (keyword `CHAPTER I`) | `'bare'` | `:79` |
| `side` | omitted (decided per page from tics) | `'verso'` | `:44` |
| `endnotes.source` | absent (page-bottom footnotes) | `'witness-commentary'` | `:107` |
| `witnessStructure.format` | absent | `'genie-markdown'` | `:95` |
| `presetId` | `'clarendon'` | `'peripatetic'` | **NEW** |
| `footnotePlacement` | `'page-bottom'` | `'endnote'` | **NEW** (today implied by `endnotes`; explicit so the app can pick popover vs sidebar — `ImportRecord.noteRender` already carries `'endnote'`). Peripatetic's `'endnote'` is set unconditionally by the preset; a per-import override lives in the Edition step's override disclosure, not a question asked at import time (Q6). |
| `strayNumeralStyle` | Roman | Arabic | **NEW** (drives S3's parse branch; without it S3 guesses) |
| `interiorRunningHeads.pattern` | TBD | TBD | **NEW** (Q9 split — the *pattern* half: what this publisher's interior heads look like, numeral + running-head title shape. The *switch* half — whether a given scan needs stripping — stays a per-copy DAMAGE directive, below.) |

**Edition-level — preset default, edition may override.** Not publisher-invariant, so
not to be presented as such: `chapterTitles` (`:58`), Clarendon default `false` but
**Reeve sets `true`**, same publisher; `slice.bodyStart` / `bodyStartNextLine` (`:117`,
`:123`), which turn on whether the work prints book *and* chapter heads, not on the
house (`slice.ts:22`); `slice.trimBodyStartPreamble` (`:130`); `slice.backMatterStart`
(`:132`), index/notes head vs `COMMENTARIES` head.

Per-work registry:

| Field | Where it comes from | Source |
|---|---|---|
| `workTitle` | `WORKS[].title` (`shared/lib/works.ts:48`) | `:27` |
| `runningHeadPlaceholder` | derived from `workTitle`; overridable | `:33` |
| `divisions.books` | `WORKS[].books` (`works.ts:52`) | `:38` |
| `divisions.chaptersPerBook` | **PROPOSED, not "derived today".** `loadCorpusConfig` *requires* `divisions` in the config JSON and validates `chaptersPerBook.length === books` (`corpus-config.ts:144`, `:186-194`); `fetchChapters` (`shared/lib/data.ts:165`) only fetches `chapters.json`, and no code builds a `CorpusConfig` from it. Needs a resolver that computes and validates before preset use. | `:38` |
| `bekkerStart` / `bekkerEnd` | **PROPOSED, same story** — both in `REQUIRED` (`corpus-config.ts:142-143`), so today declared, not derived | `:35`, `:36` |
| `booksCovered` | **NEW** — not registry-derived, a per-import declaration made in the Edition step (§4): the user marks which of `divisions.books` this file contains, default all. Exists because some translations cover only individual books of a work (Clarendon Physics-style single-book volumes) — common enough that R6 (§2) must be scoped to it rather than assume full coverage (Q10). | — |

**Damage layer — both misfiled in the draft.** `preserveDisplayLines` (`:51`) is
`{page,from,to}`: page-and-line coordinates of one extraction, and physical page
coordinates never belong in a FORMAT panel — it stays per-copy, and is *not* an Edition
override row. `interiorRunningHeads` (`:89`) splits per Q9: the code itself calls the
existing single field a **"Scan-damage trait"** (`corpus-config.ts:82`) — "the scan's
page breaks fall INSIDE our pages" — so the *switch* (whether this scan needs stripping)
stays here, a per-copy DAMAGE directive; the *pattern* (what this publisher's interior
heads look like) moves to the preset table above as `interiorRunningHeads.pattern`
(**NEW**). Neither preset nor registry: the per-import paths
`backbonePath` (`:46`), `witnessPath` (`:48`), `outDir` (`:135`), `id` (`:25`), which
must never appear in a shipped preset.

## 4. UI split

Two panels that never share a control. **Format panel — "Edition". A new preflight step,
BEFORE conversion.** The draft put it at the `form` step; that cannot work. `acceptText`
runs `convertLayoutExtraction` and only then sets `step = 'form'`
(`ImportDialog.svelte:135`, `:141`), while slice, skeleton, spacing and footnote repair
all run *before* conversion. Revised flow: `pick` → **`edition`** (publisher + work) →
configured layout stages → convert → `form` (metadata) → … On the **tagged** path the
metadata form is followed by the pre-clean's own steps, in pass order: `review` (N3
hyphenation) → **`line-mode`** (the §2 N2 declaration — two answers, one click,
preselected by the heuristic and decided by the importer; skipped only when both answers
give identical bytes) → `page-join-review` (N1) → `deletion-review` (R5). Each of the last
two offers Back to the step before it, restoring the working text as well as the screen,
because N1's accepted joins mutate it. **Publisher** is a dropdown
over the preset registry plus "Other / plain text" (all preset fields absent = today's
behaviour), one choice, no sub-toggles. **Work** is the existing `WORKS` dropdown moved
up from `ImportDialog.svelte:500`; picking it fills title, book count, chapter counts
and Bekker span from the §3 resolver, read-only, so a mismatch shows before import (R6).
It also exposes **books covered** (§3): a multi-select over the work's book numbers,
default all, so a partial-coverage translation declares its scope before R6 audits it
(Q10). **Edition override** is a disclosure, collapsed by default, exposing
edition-level fields plus `footnotePlacement`/`noteRender` — the preset sets it
unconditionally (Peripatetic defaults `'endnote'`), but a per-import override lives here
(Q6); overriding one never changes the publisher.

**Damage panel — cut from v1 (Q1).** No dedicated in-app UI for decided-file directives
in v1; a copy needing them stays CLI-repaired and is imported as a FINAL, as today.
NOTICK ingestion is unaffected — it is not this panel, but the existing frontmatter peel
(`ImportDialog.svelte:113` → `imports.ts:472`). A **possible later addition**: a
read-only decided-file picker (one file picker, a count of directives parsed by kind, no
per-directive editors, no free-text field mistakable for a setting), gated on this Q1
ruling. Its **execution contract** is fixed now even though dormant (Q11): `parseDecisions`
(`review.ts:224`) reads ten directive kinds; only NOTICK is consumed by the app today.
Not applied on any app path: PAD and SEAT-chapter (stage 2, `skeleton.ts`); SEAT,
EXCLUDE, BREAK (stages 3/5); FIX and DROP (stage 5, `vote.ts`); SEAT-witness-chapter and
SEAT-commentary-chapter (stages 5/6b). Whenever a decided-file picker exists, the app
**refuses** a file carrying a directive the chosen path cannot apply, naming it — never
silently ignores it. The Done step keeps the honesty report and adds one line per strip
rule, zero included.

## 5. Porting plan sketch

0. **Pristine-source fix — prerequisite for everything below.** `ImportDialog` passes
   `raw: dehyphenatedText ?? file.text` and omits `original` for a non-layout upload
   (`ImportDialog.svelte:363`, `:367`), so `runImport`'s `req.original ?? req.raw`
   (`imports.ts:538`) writes *dehyphenated* text into the `.original` safety-net file.
   Destructive pre-cleaning on top of that loses the upload. Always pass the untouched
   upload as `original`; cleaned text stays a separate working value.
1. **Pre-cleaner contract (§2)** on the tagged path — N1, S2, S3, R1, R4's tagged-path
   key audit, R5, count reporting. Independent of the preset library; unblocks the
   Lennox PA v2 fixture alone, and is pinned against it.
2. **Preset registry + resolver** — `presetId`, the edition tier, and the §3 resolver
   computing `divisions`/Bekker bounds from `chapters.json`. "Other" is the identity
   preset, so existing behaviour is the default.
3. **Edition preflight step (§4)** — before any stage below, since all are config-driven
   and pre-conversion.
4. **Slice (stage 1)**, then **skeleton strips (stage 2, partial)** — head insert, folio
   repair, heading normalize, with PAD and SEAT-chapter left in the damage layer,
   dev-side (§4) — then **spacing (stage 4)**, whose `preserveDisplayLines` arrives from
   the damage layer, not from an Edition row. All pure and config-driven.
5. **Footnote normalize (stage 6), witness-free subset only** — detached-marker and
   heading-residual handling. Marker glue is witness-gated (`footnote-repair.ts:430`)
   and does **not** port; in-app those sites stay flagged rather than fixed. A stated
   loss, not glossed.

**Stays dev-side.** Stage 5 align+vote and stage 6b endnote blocks need a second
extraction and John's adjudication. Stage 3 could run geometry-only in-app, but its
output is a flag list nobody in-app can rule on — dev-side for the adjudication, not the
witness. The FINAL cut remains the handoff artifact.

## 6. Rulings (John, 2026-08-25)

1. **Q1 — damage-layer UI in v1: (a).** None; a decided-file picker is a possible later
   addition, gated by Q11. See §4.
2. **Q2 — app as sole import path: (a).** Governing doctrine recorded verbatim above,
   after the two-layer rule; §5's steps are a port, never a migration.
3. **Q3 — tagged sources hard-wrapped: (b).** Yes; N2 runs on both paths. See §2, N2.
4. **Q4 — R5 caps: (b).** No caps — R5 always shows the full list, nothing auto-applies.
   See §2, R5.
5. **Q5 — seam: (a).** Reject, both paths, boundary named in the refusal. See §2, R4.
6. **Q6 — endnote reader UX: (a).** Preset sets it unconditionally; per-import override
   lives in the Edition override disclosure. See §3, §4.
7. **Q7 — preset registry location: (a).** Bundled in code, no user-editable file. See §3.
8. **Q8 — N1 review: (b).** One screen, every join in context, single Accept-all,
   per-join exclusion by click, no typing. See §2, N1.
9. **Q9 — `interiorRunningHeads`: (b), split.** Preset gets the pattern (FORMAT),
   decided file gets the switch (DAMAGE); new shape. See §2 S4, §3.
10. **Q10 — R6 structural gaps: new mechanism**, not (a)/(b)/(c) as drafted — none
    handle a translation covering only some of a work's books (common on Clarendon
    editions). New **books-covered declaration** at the Edition step: user marks which
    books this file contains, default all. R6 then judges structure only inside declared
    coverage: duplicate/backward keys always reject; a missing chapter inside coverage
    rejects by default with a recorded per-copy waiver possible (Apostle APo); books
    outside coverage raise nothing. See §2 R6, §3 (`booksCovered`), §4.
11. **Q11 — unappliable directives: (a).** Refuse the file, naming them; dormant until
    any damage-layer UI exists (Q1), contract fixed now. See §4.
