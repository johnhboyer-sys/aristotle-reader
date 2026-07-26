# Fable Session — Goal-A Pipeline (OCR → importable layout text)

**Handoff doc, v2 — LOCKED 2026-07-07.** All ⟨JOHN⟩ decisions from the v1 draft are
resolved below. Trust this file, `goal-a-assets-manifest.md` (same directory), and
existing project/memory files over re-exploration. The architecture here was
validated in a planning session against the real Lennox files and the real
converter code — the "Data facts" section is measured, not assumed.

---

## Non-negotiables — read before anything else

1. **CHECKPOINT protocol.** At session start and at the top of every phase: output a
   delegation plan (what you're building, in what order, which pieces route to which
   agent), then **end your turn and wait for explicit go-ahead.** Never begin
   implementation in the same turn as a plan.
2. **The target is already specified.** `desktop/src/lib/pdf-import/ocr-target-format.md`
   defines the output format, and the Goal-B converter's honesty report is the GRADER:
   refusal none, collapsed 0, dropped ~0, suppressed ~0, unmatched ~0, divisions
   complete, display blocks only where real, seams none. Do not invent a second
   quality metric. Do not modify the Goal-B converter to accommodate dirty input —
   Goal A moves the input to the spec, never the spec to the input.
   **`desktop/src/lib/pdf-import/` is FROZEN for this session: zero diff.**
3. **The translation's wording is untouchable at the sentence level; OCR misreads are
   repairable at the token level, in two tiers.** Tier 1 (auto-apply, logged):
   deterministic/mechanical repairs — spacing runs inside prose, ligature damage,
   dropped/inserted spaces within a word, em-dash restoration, form-feed and
   page-skeleton reconstruction, running-head restoration. Tier 2 (review-queued,
   never auto-applied): any repair that changes which WORD the text says (a misread
   word, a conjectured character). Greek-script or diacritic-bearing tokens are
   ALWAYS Tier 2, never Tier 1. No paraphrase, no style normalization, no
   "improvements" — ever.
4. **Bekker digits are the highest-value repair and get their own discipline:** a
   marginal number may be corrected ONLY when the cadence/monotonic expectation
   uniquely determines the true value (e.g. the column sequence just closed 639a, so
   the garbled full-form `639 6` is 639b); every such correction goes in the
   change-list John can review. Ambiguous cases stay wrong + flagged — the
   converter's audits will surface them.
5. **Every alteration is logged.** The pipeline's output includes a machine-readable
   change-list (page, line, before → after, tier, rule) alongside the repaired text.
   A cleanup that can't show its work didn't happen.
6. **Local-only.** Scans and OCR text are John's copyrighted material: never synced,
   uploaded, committed, or quoted beyond minimal fragments in pins. Same footing as
   the TLG files and the Reeve extraction. All corpus inputs/outputs live OUTSIDE
   the repo (`~/Documents/aristotle-ocr/pa-lennox/` — create it), passed to the CLI
   as arguments.
7. **Never delete running heads** (the converter strips line 1 of every page
   unconditionally; a missing head silently eats a body line). Reconstruct or
   placeholder them (`PARTS OF ANIMALS`) where OCR lost them.
8. **Witnesses never restructure.** Witness text may only re-spell characters within
   tokens already present in the backbone. Witnesses may never add or remove tokens,
   lines, or line breaks. This is what structurally prevents the prior pipeline's
   reflow-induced paragraph-break defects.

## Ambiguity protocol

On ambiguity: take the conservative option, log it in `implementation-notes.md`
(same file, new section — the Goal-B log is the model), keep working. Halt only when
an ambiguity touches a Non-negotiable or a locked decision below. Terse commits, one
logical change each; worktree + claude/ branch; PR gate at the end.

---

## Locked decisions (were ⟨JOHN⟩ D1–D4; resolved 2026-07-07)

**D1 — Pipeline output target: LOCKED.** The pipeline emits target-format LAYOUT
TEXT fed to the Goal-B converter. Never emit tagged .md directly — that bypasses the
grader (this is exactly what the retired Python pipeline did, and its defect catalog
is the consequence).

**D2 — Architecture: backbone + witnesses. LOCKED.** The Adobe `pdftotext -layout`
extraction is the GEOMETRY BACKBONE (pages, line breaks, gutter columns, indents) —
it is repaired stage by stage and is always valid layout text. History Genie (and
targeted Claude vision, see D5) are TEXT WITNESSES: reflowed prose with the best
wording fidelity and no geometry. Multi-OCR voting fixes wording, which the honesty
report cannot see; it does NOT fix geometry — only the backbone has geometry. The
ocr_translations recipe's text-layer ban is amended in scope: *for Goal-A repair, an
OCR'd text layer is admissible INPUT for repair, not trusted OCR.*

**D3 — Sign-off target: LOCKED.** Done-condition is Lennox PA imported into the
desktop app with a clean honesty report and John's hand verification — the same bar
Reeve NE met. (Unblocks the parked importer-cleanup memory item and the
History-Genie playbook decision.)

**D4 — Tier-2 review: LOCKED.** A single markdown review file John processes in one
sitting, with disagreements GROUPED BY PATTERN (same before→after word pair = one
decision covering all N instances), sorted by instance count descending, checkbox
decisions, ±1-line backbone context per instance. The apply step parses decisions by
stable id and re-runs the vote stage. No interactive UI (v2 idea, deferred).

**D5 — Third witness (Claude vision): TARGETED ARBITRATION ONLY.** No full 424-page
pass (it would agree with Genie ~99% of the time). Run the `ocr_translations/CLAUDE.md`
single-reader recipe only on: (1) pages Genie dropped or paired badly; (2) pages
whose Tier-2 disagreement density exceeds a threshold; (3) the specific lines of
every cadence-ambiguous Bekker full-form. Verdicts attach as evidence to Tier-2
records (2-of-3 makes John's review fast) — but word-identity changes still go to
the review queue, never auto-applied, even at 2-of-3.

**D6 — Branching: MERGE PR #24 FIRST.** John merges PR #24 (claude/pdf-importer) to
main before this session starts (`gh pr merge 24` or GitHub UI). The Goal-A tooling
branch cuts from main. If for any reason #24 is still open at session start, STOP at
Phase 0 and ask.

**D7 — Scope: PA first, generalize after.** Build against Lennox PA with clean stage
boundaries (each stage a pure function), but do not abstract for a second corpus
yet. Generalization is a later session with a second book.

---

## Architecture

**Backbone + witnesses, converter as sole grader.**

Pipeline = ordered pure stages, each `layoutText → layoutText + changeRecords`. The
harness re-runs `convertLayoutExtraction` after every stage and prints the honesty-
report delta. Output at every stage is valid layout text (`\f` pages, head-first
page skeleton intact). Two separate campaigns share the machinery:

- **Geometry campaign (backbone-only, stages 1–4):** every counter the honesty
  report measures — slicing, skeleton, tic re-seating, spacing — is deterministically
  repairable from the backbone alone. No witness needed.
- **Wording campaign (witnesses, stage 5):** everything the report CANNOT see —
  word identity, em-dashes, punctuation, ligatures. Invisible to the grader by
  design; its deliverables are the change-list and the Tier-2 review file.

### Data facts (measured in the real files — trust these)

- **Recto tics print with a SINGLE space of gap** before the tic; the converter
  requires ≥4 (`RECTO_MIN_GAP` in `pdf-import/line-shape.ts`). Verso body indents to
  col ~6 vs the side-decision threshold of ≥8. This alone explains most of the
  205-suppressed / 364-side-ambiguous baseline → fixed backbone-only by re-seating.
- **Superscript garble hits full-forms**: `639 6` = `639b` (b→6 plus inserted
  space). Uniquely repairable from the monotonic column sequence → Tier 1, logged.
- **Genie has page boundaries after all**: `PA - Lennox-2.txt` contains 424 `---`
  separators with running heads inline (`BOOK ONE $639^{\mathrm{b}}$`) vs the
  backbone's 416 `\f`. Page pairing MUST anchor on running heads / Bekker anchors,
  never raw index. Produce a pairing reconciliation report before trusting any votes.
- **The PA translation body appears to have no numeric footnote blocks** (the `$^a$`
  chaos in Genie is running-head Bekker superscripts) → footnote counters should be
  near-trivial for this corpus.
- Known Genie failure mode: silent whole-page dropouts logged as `--- [blank] ---`.
  Backbone survives; dropout pages get zero votes and a `no-witness-span` flag.

### Stages (each with its grader target)

0. **Grader harness + pinned baseline.** Thin CLI runs converter on the raw Adobe
   txt, prints the report. Pin the baseline (prior smoke: 51 emitted / 205
   suppressed / 56 dropped / 1,369 displayBlocks / 364 side-ambiguous / seams from
   commentary). No repair. This is the regression anchor for every later stage.
1. **Slice** (backbone-only). Cut front matter (everything before the `BOOK ONE`
   page) and everything from the first `COMMENTARY`-headed page on. Page-boundary
   cuts only; verify the two seam pages by eye once; reconcile against
   `PA - Lennox-chapter-map.json`. Target: `seams=[]`, divisions = 4 books, chapters
   per the map, marker-storm flags gone. Sliced material stays on disk, not deleted.
2. **Page-skeleton repair** (backbone-only). Every page's first non-blank line must
   be a running head — insert placeholder where lost (never delete). Folios = lone
   integers. Target: stray-number flags gone; `droppedLines` shrinks to genuine
   print gaps.
3. **Gutter re-seat + Bekker digit repair** (backbone-only; highest-value stage).
   Reuse `classifyTicToken` / `findTrailingToken` / `findLeadingToken` from
   `pdf-import/line-shape.ts`. Validate tics against the monotonic 639a→697b column
   sequence and 5-cadence; repair garbled full-forms ONLY when cadence-unique
   (Tier 1, rule `bekker-digit`); ambiguous → Tier 2 with Genie's column anchors as
   evidence. Re-lay each page: verso → body margin to col 11, tic at col 0–1;
   recto → body at col 0, tics re-padded to a fixed start column ≥40 with ≥4-space
   gap, tight ±6 band. Preserve paragraph indents RELATIVE to the new margin.
   Target: `ticsSuppressed → ~0`, side-ambiguous → 0, `collapsedPages=[]`.
4. **Prose spacing normalization** (backbone-only). Collapse internal ≥2-space runs
   on prose-shaped lines, preserving leading indent and +2..+8 paragraph deltas.
   Lines still display-shaped after normalization stay wide and surface in
   `report.displayBlocks` for hand review — NEVER auto-flatten a real table/diagram.
   Target: displayBlocks 1,369 → ~0 (every survivor hand-checked).
5. **Witness alignment + token vote.** Page pairing by anchors, then token LCS
   within each ~300-word page (jsdiff `diffArrays` with a custom comparator, or a
   hand-rolled LCS — normalized tokens for MATCHING, raw forms for VOTING). Matched
   pairs whose raw forms differ become vote sites: mechanical class → Tier 1
   (em-dash restore, ligature, in-word spacing); word-identity → Tier 2 record.
   Also diff paragraph-break positions against Genie's paragraphs — mismatches are
   Tier-2 diagnostics, not a new score. Target: invisible to the report by design;
   deliverables = change-list + review file.
6. **Final grade → import → hand-verify.** Converter output clean per the spec;
   John imports in the app and hand-verifies (Reeve-NE bar); accepted Tier-2
   decisions applied by re-running stage 5 with the decision file; re-grade.

### Change-list format

JSONL, one record per edit, append-only:

```json
{"id":"p117-L14-c52-1","stage":3,"tier":1,"rule":"bekker-digit","page":117,"line":14,"col":52,"before":"639 6","after":"639b","evidence":{"cadence":"639a closed at a34; next full-form","genie":"639^b"}}
```

Rules enumerated: `slice`, `head-insert`, `tic-reseat`, `bekker-digit`,
`spacing-collapse`, `emdash-restore`, `ligature`, `word-identity` (Tier 2 only),
`no-witness-span` (flag, no edit).

### Placement / toolchain

- Branch off main (post-#24 merge), worktree + `claude/` branch.
- `desktop/src/lib/ocr-repair/` — pipeline stages as pure TS modules (`slice.ts`,
  `skeleton.ts`, `gutter-reseat.ts`, `spacing.ts`, `align.ts`, `vote.ts`,
  `changelist.ts`), importing from `../pdf-import` as a library. Under `src/lib`
  so vitest picks tests up with zero config AND ImportDialog can later run the
  identical cleanup in-app — **no Tauri sidecar, no companion app; everything is
  pure TS like the converter itself.**
- `desktop/scripts/ocr-repair.ts` — thin CLI (read file → run stages → write
  repaired text + change-list + report deltas). **Add `tsx` as a devDependency**
  and run `npx tsx desktop/scripts/ocr-repair.ts` (Node 22.12 +
  `moduleResolution: bundler` + extensionless imports won't run under plain node).
  Keep the tsx addition in its own commit, clearly separate from pipeline commits.
- Vitest fixtures BEFORE full-file runs, especially for the verso re-margin
  (col 6 → 11) re-layout.
- The 4 Python scripts on `claude/lennox-pa-scripts` are RETIRED AS PRIOR ART — the
  gutter rule and section boundaries transfer as knowledge; do not keep a second
  live pipeline in two languages. Do not port difflib wholesale; the page-scoped
  LCS above replaces it.

---

## Orchestration — how you work

Same routing discipline as the Goal-B session (it caught real errors four times):

| Stakes | Route | Items |
|---|---|---|
| **High** — expensive to unwind | **dual-dispatch (deep-reasoner ∥ Codex), you synthesize** | Bekker-digit uniqueness policy edge cases · the stage-3 re-layout algorithm (re-seating tics + margins without disturbing relative indents) |
| **Reasoning-heavy, recoverable** | deep-reasoner alone | Page-pairing reconciliation (416 vs 424) · prose-vs-display disambiguation · slice-boundary verification |
| **Mechanical** | fast-worker (or Codex as peer) | Stage scaffolds · change-list plumbing · grader-loop harness · fixtures · CLI |

Known harness gotcha: custom `.claude/agents/*.md` register at session start only —
if deep-reasoner/fast-worker don't resolve, fall back to general-purpose with model
overrides (opus / sonnet). Codex sandbox may lack network/write access — it designs
and reviews; verification runs locally.

---

## What this is

Goal A: turn OCR output of a scanned printed translation into text conforming to
`ocr-target-format.md`, so the existing Goal-B importer can import it with a clean
honesty report. Goal B assumed clean text in; Goal A manufactures that cleanliness —
conservatively, loggedly, gradeably.

**IN:** grader harness + baseline; front/back-matter + commentary slicing; page-
skeleton reconstruction (running heads, folios); gutter re-seat + audit-guided
Bekker-digit repair; prose spacing normalization with table preservation; witness
alignment + token vote (Tier 1 auto+logged, Tier 2 review file); targeted Claude
arbitration; end-to-end PA import + sign-off.

**OUT (scope locks):** no changes to the Goal-B converter or its pins (zero diff
under `pdf-import/`); no editorial renumbering; no wording changes outside accepted
Tier-2 review items; no full-book vision OCR; no ImportDialog/review UI work; no
handling of the Goal-B deferred special cases (Metaphysics α, NE/EE common books,
Physics 7); no web-pipeline work; no second corpus.

## Phase 0 — Verify, then STOP

The planning session already characterized the assets (see
`goal-a-assets-manifest.md`); Phase 0 is confirmation, not exploration:

1. Confirm PR #24 is MERGED to main (D6). If not, stop and ask.
2. Confirm the manifest's files exist at their listed paths (ls, not re-reading).
3. Create `~/Documents/aristotle-ocr/pa-lennox/` and copy working inputs there.
4. Build the stage-0 harness; re-run the converter on the raw Adobe txt; pin the
   CURRENT baseline counters against the manifest's recorded ones (they should
   match the prior smoke; investigate if not).
5. Present the delegation plan for stages 1–6 with any deltas discovered, then
   **STOP — end turn** (CHECKPOINT protocol).

## Acceptance checklist (maintain in-branch, same discipline as Goal B)

- [ ] Grader baseline captured (stage 0) and every stage's delta measured against it
- [ ] Every alteration in the change-list with tier + rule; zero unlogged edits
- [ ] Bekker corrections only where cadence-unique; ambiguous stay flagged
- [ ] No wording changes outside accepted Tier-2 review items
- [ ] Greek/diacritic tokens never Tier-1-repaired
- [ ] Witnesses never added/removed tokens or line breaks (spot-check via change-list rules)
- [ ] Real tables/diagrams preserved; fake display blocks eliminated (counts pinned)
- [ ] Running heads present on every page of output
- [ ] Page-pairing reconciliation report produced before any votes trusted
- [ ] One work per output file; commentary/front matter sliced, not deleted from disk
- [ ] Lennox PA imports with a clean honesty report; John hand-verified in-app
- [ ] Goal-B converter and all its pins untouched (zero diff under `pdf-import/`)
- [ ] All corpus inputs/outputs local-only, outside the repo

## Deferred — not this session

Full vision-OCR path for no-text-layer scans (reuses stages 1–6 after a vision
pass produces a backbone substitute); History-Genie skill authoring (decide after
PA sign-off, per memory); ImportDialog-integrated review UX (D4 v2); generalization
to a second corpus; the Goal-B deferred list (range tics, display-block render
fidelity, special-case works).
