# Translation Workbench — TODO

State as of 2026-07-03: **Phase 2 committed** (`5adefdde`), **Phase 3 GREENLIT by
John** (no push — branch stays local, his call). Branch
`claude/blissful-rubin-d64797` now lives in the `intelligent-tesla-c10171`
worktree (nervous-saha was auto-cleaned; branch intact). Phase 3 (3A+3B) COMMITTED
`46f65a6e` (John reviewed the summary and approved). 782 tests green;
svelte-check 0 errors.

⚠️ Worktree-cleanup survival kit (this has bitten twice): the gitignored
Scrivener samples die with the worktree — restore from `~/Downloads/meta z 17/`
+ `~/Downloads/APo 1.4 {Greek,English}.md` into
`workbench/.dev-corpus/scrivener-samples/`. The original build spec was never
committed and nearly died the same way — recovered verbatim from the Phase 1
transcript, now at `workbench-design/build-spec.md` (commit it with Phase 3).

## Done this session (2026-07-03, in `46f65a6e`, orchestrator-verified)

- [x] **U+2028/U+2029 parse hardening**: footnote bodies fold the separators to a
  paragraph break on parse AND serialize, mirroring Stage 0's
  `normalizeFootnoteBody`. Deliberately scoped to footnote bodies only — the
  real APo English legitimately contains mid-sentence U+2028 in row content,
  where the separator is inert by format design (a global fold corrupted the
  1:1 row invariant and was reverted). 4 new round-trip tests.
- [x] **Copy-citation element-endpoint fix**: new pure
  `src/lib/editor/citationSelection.ts` (duck-typed `DomNodeLike`, testable
  without jsdom); element-node Range endpoints (triple-click shape) now resolve
  as full-cell coverage instead of false-negative "Nothing to cite". 13 tests;
  plain ⌘C byte-identical; browser-verified end to end (captured clipboard
  payload = correct full citation).
- [x] **APo 1.4 dev sample loader** button beside the Meta one, same
  `devHarness` gate, verified stripped from production bundles; browser-verified
  (64 preview rows, correct work/book/chapter prefill).
- [x] **Full `tauri build` first ever run** (`app:package`): .app bundles
  cleanly, 62MB, all 48MB corpus resources + reference.docx resolved under
  Contents/Resources. Only the DMG step fails headless (`bundle_dmg.sh` needs a
  real Finder session) — rerun at the machine or use `--bundles app`.
- [x] **Phase 3 design round complete**: d4 (AI-assist) dual-dispatched
  deep-reasoner + Codex → synthesized `d4-ai-assist.md` (memos preserved as
  `d4-memo-*.md`); d5 (reference panel) single memo `d5-memo-reference-panel.md`,
  orchestrator-reviewed, codebase claims spot-checked.

## Carried forward

- [ ] **Human-exercise the Tauri-only paths in the real app** (John): Diogenes
  "Add work…", native export/import pickers, compile export, settings folder
  picker on a real synced folder. Still pending — John hadn't tested as of
  2026-07-03.
- [ ] **Finder-launch smoke test** of the built .app (NOT `open` from a
  terminal): now doubly important — both d4 memos flag that the shipped pandoc
  export likely fails on a real Finder launch (bare `cmd: "pandoc"`, launchd
  PATH has no Homebrew dirs). Fix rides with d4 Slice 2 (shared binary
  resolution ladder). Updater still unwired (John's signing key ceremony).
- [ ] **Bilingual compile layout + Cambria font**: still awaiting John's
  aesthetic verdict on a real docx.
- [ ] Prune `workbench/src/components/FOOTNOTE_PANEL_WIRING.md` at commit time.

## Phase 3 — 3A + 3B COMMITTED `46f65a6e` (2026-07-03)

- [x] **3A AI-assist** (spec §12, design `d4-ai-assist.md`) — Slices 1+2 BUILT
  and orchestrator-verified: pure `src/lib/assist/` library (64 tests incl.
  isolation source-scan); Rust `assist.rs` (`assist_resolve_claude` ladder —
  finds John's real install at `~/.local/bin/claude`; `assist_suggest` with
  argv-array + prompt-over-stdin, timeout+kill, stderr redaction — live-proven
  against the real CLI); popover UI + hover-✦-glyph + ⌘⏎ +
  `RowEditor.insertSuggestion` through the normal dispatch path (browser-
  verified: suggest → Insert → single-step ⌘Z; clipboard floor payload has
  neighbor drafts in, target draft out). API-key path = deferred Slice 3.
  REMAINING: the packaged **Finder-launch smoke test** (John at the machine).
- [x] **3B reference panel** (spec §13, design `d5-memo-reference-panel.md`) —
  Slice 1 + edition picker BUILT and orchestrator-verified: `src/lib/reference/`
  (63 tests incl. copyright regression), local-only storage
  (`$APPDATA/references`, never the synced folder), ReferencePanel +
  ReferenceImportDialog + App/rail wiring (browser-verified end to end: paste
  with `# Book 7/## 17` headings → pre-filled assignment → stored
  `chapter-07-17.md` with hyphenation rejoined + line structure verbatim →
  panel renders it, chapter switch shows the quiet absence line, footnote
  exclusivity works both ways). REMAINING: native file-picker path (Tauri-only,
  John at the machine); real OCR acceptance import (his Ross Z.17).
- [x] **Rider: pandoc Finder-launch fix** — absolute-path scope entries +
  frontend probe (ExportButton AND CompileDialog); dev/terminal behavior
  unchanged. Verify in the same Finder smoke test.
- [ ] **3C Latin/Aquinas** — PARKED by John (2026-07-03) until he supplies
  citation conventions (works, citation string format, row unit, spine/source
  numbering). Contract proven ready (busse-paragraph precedent, aquinas-tbd
  stub registered).

Gates at wrap: **782 vitest / tsc clean / svelte-check 0 errors / cargo check
clean / cargo test 7 / vite build clean**.

## Line-split feature (D6) — BUILT 2026-07-03, uncommitted, awaiting John

Split a Bekker line at a paragraph boundary (John's request). Design:
`d6-line-split.md` (synthesized from `d6-memo-deep-reasoner.md` +
`d6-memo-codex.md`, dual-dispatched). John's §4 answers: right-click-Greek
gesture; English divides at the caret (else continuation empty); bilingual
export breaks the Greek block too; repeated gutter address. Built in 3 slices,
all orchestrator-verified:
- [x] **Slice 1 — format layer**: `line_splits` frontmatter (opaque
  `<addr>@<offset>`, code-unit + word-boundary validation) + `¶` [ENGLISH]
  segment delimiter (escaped `\¶`); RowModel.splitOffsets/english2; autosave
  round-trip + drift policy (out-of-range/skew → line loads unsplit, English
  rejoined, one plain sentence, never dropped); schema_version stays 1 with a
  future-version refusal. 47 tests.
- [x] **Slice 2 — editor UI**: pure `gridRows.ts` (expandRows/divideDocAt/
  split-unsplit/merge); grid expands one line → two tracks; right-click-Greek
  "Start new paragraph here" (word-snap); English divides at PM caret;
  explicit un-split w/ confirm when both non-empty (Backspace NEVER joins —
  navigation only); one-undo-step; copy-citation + assist fold segments per
  address. 46 tests.
- [x] **Slice 3 — export**: pure `chapterSegments`; paragraph break at splits
  (single + whole-work, English + bilingual w/ Greek parity); Bekker stamp
  once per address on first non-empty segment; stored files untouched.
  14 tests + 4 new export-harness checks (real pandoc → two `<w:p>`).

Gates: **901 vitest / tsc clean / svelte-check 0 errors / vite build /
export-harness 47/47**. Browser-verified end to end: split → twin 1041a6
gutters + 1.5em continuation indent → independent English cells → persists
`line_splits`+`¶` → reload restores (no drift notice) → un-split confirm →
rejoin with single space → clean undo. NOTE: caret-division of existing
English is unit-tested + wiring-verified (reads live PM selection.head) but
couldn't be exercised headlessly (PM only adopts caret moves from real input);
worth John confirming with a real cursor during hand-test.

## Decisions John has confirmed

2026-07-03:
- Phase 3 greenlit, scope 3A + 3B now, 3C parked pending his conventions.
- Branch stays unpushed.
- AI-assist: draft-English context ON by default (settings disclosure);
  hover-glyph + ⌘⏎ affordance; ±6 context rows; insert = fill-empty /
  replace-selection / else-caret; inherit his Claude Code default model;
  auth-lapse gets the specific sign-in sentence.
- References: LOCAL-ONLY (never the synced folder) + footnote/reference panels
  mutually exclusive in the right rail.

2026-07-02 (unchanged):
- Bekker stamp default: every-5 + column transitions, plain brackets. KEEP.
- formatCitation comma when no book/chapter. KEEP.
- Whole-work compile: BOTH modes (English-only default + bilingual).
- Whole-disk fs permission for the shared-folder feature: APPROVED.
- Copy-as-citation: separate explicit command; normal ⌘C untouched (his ask).
- Scrivener import defaults: two-file selection; proportional pre-split ON
  (flagged, editable). D3 §9.5 duplicate-import Replace/Cancel shown to John.

## Running things

```
cd workbench
npm run dev                                   # browser harness (localhost:1421)
PATH="$HOME/.cargo/bin:$PATH" npx tauri dev   # the real app
npx vitest run                                # 577 tests
node scripts/build-dev-corpus.mjs             # regen .dev-corpus (Meta + APo)
node scripts/parity-corpus.mjs                # TS-vs-Python corpus parity
node scripts/export-harness.mjs               # docx export checks (43)
node scripts/make-reference-docx.mjs          # regen reference.docx
npm run stage:corpus                          # stage packaged-app corpus (47MB)
npm run app:package                           # stage + tauri build
npm run shots                                 # Playwright screenshots → shots/
```

Real Scrivener sample pairs (John's translation + TLG Greek — LOCAL ONLY,
gitignored): `workbench/.dev-corpus/scrivener-samples/`. Acceptance tests
skip when absent. Restore from ~/Downloads after any worktree cleanup (see top).
