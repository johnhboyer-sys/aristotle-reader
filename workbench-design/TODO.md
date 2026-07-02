# Translation Workbench — TODO

State as of 2026-07-02: **Phase 1 complete and committed** (`d118d23`, branch
`claude/blissful-rubin-d64797`, not pushed). 301 tests green; tsc, vite build, and
tauri debug build clean. John reviewed in the running app. Phase 2 starts only on
John's explicit greenlight, per the build spec's phase gate.

## Carried forward from Phase 1 (small, no greenlight needed)

- [ ] **Bundle corpus resources into the packaged app** so "Add work…" completes
  standalone: per-work `chapters.json` (+ `analyses.json`, shared `lsj/`) as Tauri
  resources with the existing Resource→AppData copy path in
  `src/lib/data/onboarding.ts`. Today onboarding produces `spine.json` from the
  user's TLG but stops at "This work isn't fully supported yet" because no
  chapters resource ships. Decide size strategy (LSJ is ~46 MB shared).
  Interim workaround in place: both works' corpora seeded directly into
  `~/Library/Application Support/org.aristotlereader.workbench/corpus/`.
- [ ] **Human-exercise the two Tauri-only paths** end to end (verified by build +
  boot + code review only): the full AddWorkDialog Diogenes run against the real
  TLG folder, and the native export flow (save dialog → pandoc → reveal in Finder).
- [ ] **Export cosmetics** (optional, from the Codex OOXML audit): a Pandoc
  reference-docx pinning an explicit Greek-capable run font (`w:rFonts`) and page
  geometry (`w:pgSz`/`w:pgMar`); today both fall back to Word defaults.
  `referenceDocPath` is already plumbed through `src/lib/export/`.
- [ ] **Confirm two orchestrator judgment calls with John**:
  Bekker stamp default in exports (`every-5` + column transitions, plain brackets —
  `stampMode` param supports `every-line`/`every-5`/`columns`), and
  `formatCitation`'s comma when book/chapter absent (`*Metaphysics*, 1041a6`).
- [ ] **Prune or keep** `workbench/src/components/FOOTNOTE_PANEL_WIRING.md`
  (wiring was applied; file is now historical documentation).

## Phase 2 (needs John's greenlight — build spec §0)

- [ ] **Copy-as-citation** (§10): selection → row range → clipboard string
  `{english}. ({title} {book}{chapter}, {range}: {greek})`. Most infrastructure
  exists (schemes, shared range formatter, row addresses, cross-row copy handler);
  needs the Greek-span assembly + clipboard-manager write. No truncation of long
  Greek spans in Phase 2.
- [ ] **Scrivener import** (§9): parse the canonical intermediate format; align
  imported Greek against the bundled spine (monotonic diacritic-normalized
  alignment — `bekker_start` hints narrow the window, NEVER override the match);
  flag unmatched lines for manual confirmation; validate GREEK/ENGLISH counts
  before aligning. ⚠️ The spec references a conversion aid delivered alongside it
  (`scrivener-import-guide.md`, `scrivener_to_canonical.py`) — **these files were
  never provided; ask John for them before starting.**
  The spec marks the spine-alignment approach HIGH-STAKES → dual-dispatch
  (deep-reasoner + Codex, independent) before implementing.
- [ ] **Whole-work compile export** (§8): concatenate chapters in manifest order,
  display-time continuous footnote renumbering (never mutating stored files),
  book/chapter heading levels, sane running Bekker refs, finished-manuscript
  quality. Default English-only; **ask John whether a bilingual mode is also
  wanted** (open question in the spec).
- [ ] **Drive-folder sync** (§11): user-pickable library folder (settings has the
  slot; storage layer keeps `mtime()` for this), reload-on-focus when on-disk
  mtime/hash changed with unsaved-changes warning, surface `(Conflicted copy…)`
  files as flagged items, in-app help text for the turn-taking convention.
  No Drive API, no OAuth — plain files only.
- [ ] **Citation-scheme abstraction exercised for a second scheme** (Aquinas prep):
  bekker-metaphysics already proves the label axis; the Phase 2 intent is a
  non-Bekker row-unit scheme shape-check against the frozen contract
  (`workbench-design/d2-citation-schemes.md`, `GutterSpec.rowUnit`).

## Phase 3 (later; John specifies Aquinas conventions then)

- [ ] AI-assist: shell out to local `claude -p`; graceful copy-to-clipboard
  fallback; API-key alternative clearly labeled pay-per-use; invisible to a user
  who never touches it (spec §12).
- [ ] Reference-translation panel: plain text/Markdown import (NOT a PDF viewer),
  chapter-level display first, optional TF-IDF+DP line-matching (spec §13; the
  Reader's aligner port at `desktop/src/lib/aligner/` is the prior art).
- [ ] Latin: Aquinas citation schemes (Corpus Thomisticum conventions, per work
  type) + Latin morphological backend (Whitaker's Words or equivalent) behind the
  existing `LexiconProvider` interface.

## Open questions for John

1. Bilingual whole-work export in addition to English-only manuscript?
2. Bekker stamp density/format in exports (current default: every 5 lines +
   column transitions, plain brackets).
3. Where are `scrivener-import-guide.md` / `scrivener_to_canonical.py`?
4. Reference screenshots of the old Scrivener layout (spec mentions them;
   never provided — working view was matched to the written description).
5. Push the branch / open a PR to main?

## Accepted limitations (deliberate, documented)

- Standalone single-chapter docx restarts footnotes at 1 (Word auto-numbers;
  continuity arrives with the Phase 2 whole-work compile).
- A row whose literal text equals a section header (e.g. `[FOOTNOTES]`) blocks
  autosave with a plain error rather than corrupting the file.
- Mount-on-focus editor variant is designed but unbuilt — only needed if a
  chapter ever types laggy (worst real chapter Γ.4, 216 rows: 80–99 ms open,
  sub-ms keystrokes, zero long tasks).
- Chapter files without `column_starts` (pre-fix saves) fall back to a
  single-transition export heuristic; any resave adds the field.

## Running things

```
cd workbench
npm run dev                                   # browser harness (localhost:1421)
PATH="$HOME/.cargo/bin:$PATH" npx tauri dev   # the real app
npx vitest run                                # 301 tests
node scripts/build-dev-corpus.mjs             # regen .dev-corpus (Meta + APo)
node scripts/parity-corpus.mjs                # TS-vs-Python corpus parity
node scripts/export-harness.mjs               # docx export + native-footnote checks
npm run shots                                 # Playwright screenshots → shots/
```
