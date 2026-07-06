# Translation Workbench — TODO

State as of 2026-07-04: **all feature work through the AI-assist suite + app
icon is COMMITTED on `claude/blissful-rubin-d64797` — branch NOT pushed (John's
standing call), local-only.** Now lives in the `.claude/worktrees/wb-ai`
worktree (previous worktrees kept auto-cleaning; branch intact). Latest HEAD
`62f5ae44`. **1006 vitest green; tsc / svelte-check 0 errors / cargo test 15 /
vite build clean.** ➡️ NEXT PHASE: **hand-TESTING in the real .app** — see the
Testing checklist below; that is the focus now, not new features.

⚠️ Worktree-cleanup survival kit (this has bitten repeatedly): the gitignored
Scrivener samples die with the worktree — restore from `~/Downloads/meta z 17/`
+ `~/Downloads/APo 1.4 {Greek,English}.md` into
`workbench/.dev-corpus/scrivener-samples/`. After any fresh checkout:
`cd workbench && npm install && node scripts/build-dev-corpus.mjs`. The build
spec is committed at `workbench-design/build-spec.md`; design docs d1–d7 +
memos are in `workbench-design/`.

## ➡️ TESTING CHECKLIST — the current focus (John, in the real .app)

The app is at `~/Downloads/Translation Workbench.app` (rebuilt `62f5ae44`;
unsigned → first launch right-click → Open). The browser preview CANNOT run the
AI CLIs — only the packaged .app can, so all AI testing must be in the .app.

**AI-assist (⚙️ → AI assist to pick a provider first):**
- [ ] Provider detection: Claude Code + Codex auto-detected (both verified
  present on this Mac); pick one. Gemini not installed → best-effort flags,
  confirm the custom-command path if you install it. API-key path (OpenAI/
  Anthropic/Google) is code-complete + unit-tested but NEVER live-run — test
  with a real key if you want it (Anthropic needs the browser-access header,
  already sent).
- [ ] Right-click a Greek line → **Translate with AI** → fills the English
  cell; ⌘Z undoes as one step.
- [ ] **AI reference** → floating popup with the AI's own translation; drag it,
  Copy, Close; open several; cell untouched.
- [ ] **Check my translation** (line with English) → "Translation check" popup,
  linguist diagnosis vs the Greek; blank line → the guard message.
- [ ] **Ask AI about this line…** → docked bottom chat panel; type a question,
  Enter sends, answer appears; resize the panel; coexists with the reference
  rail. (One-shot — no multi-turn yet.)
- [ ] Clipboard fallback (no provider chosen) shows the plain sentence, not a
  stack trace.
- [ ] **Finder-launch smoke test** (the pandoc/GUI-PATH lesson): launch from
  Finder, NOT `open` from a terminal — confirm assist AND a docx export both
  work (bare-PATH failures only show on a real Finder launch).

**Line-split (D6):**
- [ ] Right-click a Greek word → "Start new paragraph here" → the CLICKED word
  begins the new paragraph; twin gutter address; continuation indented.
- [ ] **Cursor-division** (the one path never verifiable headlessly): type a
  sentence, put the cursor mid-line, split → English divides at the cursor.
- [ ] Un-split (confirm when both halves non-empty); ⌘Z reverses; export shows
  the paragraph break (single-chapter + whole-work, English + bilingual).

**Reference / Scrivener import:**
- [ ] Native file picker for "Import reference…"; assignment defaults to the
  open chapter; the panel shows it; references land under $APPDATA/references
  (never the synced folder).
- [ ] Real-OCR reference import (Ross/Lennox) — the acceptance case.
- [ ] Scrivener import via the native two-file picker; whole-work compile export
  (bilingual layout + Cambria — John's aesthetic verdict still pending).

**Packaging / release (still open):**
- [ ] Full `tauri build` DMG step (needs a real Finder session; `--bundles app`
  used so far); updater signing-key ceremony (John's key, from Phase 1).
- [ ] The Diogenes "Add work…" onboarding path in the real app.

**App icon:** shipped `62f5ae44` — italic α → a, warm gradient, light arrow;
source at `src-tauri/icons/icon-source.svg`. Nothing to test beyond eyeballing
it in the dock.

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

## Line-split feature (D6) — COMMITTED `ecb7b542` 2026-07-03

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

## Multi-provider AI-assist (D7) — COMMITTED `6cccbb8f` 2026-07-03

Generalized AI-assist beyond Claude Code (John: "let users use any AI they
have with their own subscription"). Design: `d7-multi-provider-assist.md`
(+ `d7-memo-*` not used — solo design extending d4). 4 slices, all landed:
- CLIs auto-detected (Claude Code / Codex / Gemini) + custom command + API
  keys (OpenAI/Anthropic/Google, off by default, pay-per-use to the user's
  key — costs the app nothing). Settings picker; clipboard floor + §12
  invisibility unchanged.
- Rust generalized: assist_run(binPath,args,stdin,timeoutMs) +
  assist_which(candidates,binName) replace the claude-specific commands;
  execve no-shell, prompt-as-data, binName validated before the one
  `command -v` rung (unsafe-name test proves no shell exec).
- Settings migrate old {cliPath,cliState} → {provider:'claude',
  cliPaths.claude}. CSP connect-src scoped to the 3 API hosts.
- VERIFIED against the real installs: claude + codex both translate
  correctly through the app's actual tools-spec→buildCliInvocation→parser
  path. Gemini not installed (best-effort; custom covers). API path
  unit-tested (fake fetch), NOT live (no key).
Gates: 992 vitest / tsc / svelte-check 0 err / 15 cargo tests.
Codex gotcha baked in: `codex exec` needs --skip-git-repo-check + JSONL
agent_message parsing + `-c mcp_servers={}`.

## AI-assist round (D7 follow-ups + modes + Ask + icon) — COMMITTED 2026-07-03/04

John hand-tested (in the browser preview, which CANNOT run CLIs → always the
clipboard fallback; the real .app runs headless in-app). Fixes:
- `f48adb17` line-split: the clicked Greek word now begins the new paragraph
  (was forward-snapping to the next word on right-edge clicks).
- `e8f31c9f` discoverable AI trigger: right-click Greek → "Translate with AI"
  (was hover-glyph + ⌘⏎ only); reference import defaults the assignment to the
  chapter you're viewing. (Bekker gutter numbers already user-select:none.)
- `f81d59a5` AI-assist MODES: "Translate with AI" (fills cell) + "AI reference"
  (floating persistent popup, draggable, Copy/Close, multiple coexist, never
  touches the cell) — mode on AssistContext, prompt branches; new
  ReferencePopup.svelte. "Copy as citation" → "Copy with citation".
  DEFERRED: "Check my English" mode + Apple Intelligence provider (slots into
  the provider layer when its on-device API ships).
- `0b9c42a4` **Check my translation** mode: AI as SOLELY a linguist diagnosing
  the row's existing English vs the Greek (morphology/syntax/lexical fidelity,
  cites the Greek, no interpretation); sends the target's OWN English + names
  the reference; "Translation check" popup; blank-line guard.
- `66e699dc` **Ask about this line** (one-shot): a free-form question in a
  DOCKED, RESIZABLE BOTTOM chat panel (AskPanel.svelte) that coexists with the
  right rail; session-bridge (assistCommands.askAboutLine); mode 'ask' on
  AssistContext + `question`. Multi-turn is the small documented follow-up.
- `a6eee54b` → `62f5ae44` app icon: italic **α → a** on a warm terracotta
  gradient with a light chevron arrow; icon-source.svg + all platform assets.
- Built/refreshed the real .app (`stage:corpus` + `tauri build --bundles app`,
  63MB) → ~/Downloads/Translation Workbench.app. assist_run/assist_which +
  the icon confirmed in the bundle.
DEFERRED (documented, John's call): multi-turn chat in the Ask panel; Apple
Intelligence provider (slots into the provider layer when its on-device API
ships); the generic-app fork (see backlog).
Gates at wrap: **1006 vitest** / tsc / svelte-check 0 err / vite build / cargo.

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

## Future / backlog (John's ideas — NOT scheduled, capture only)

- **Generic edition workbench, possibly a FORK** (John, 2026-07-03): a version
  NOT hard-wired to one author, work, or language — any source text on any
  citation/reference scheme, not just Greek/Latin classics on a Bekker spine.
  The architecture already leans this way: the `CitationScheme` contract is
  frozen + scheme-agnostic (busse-paragraph proved a non-Bekker scheme drops in
  as one file + one registry line), the row model is spine-driven, and the
  AI-assist prompts already say "original language," not "Greek." Generalizing
  means: arbitrary source-text ingestion (not just TLG/Diogenes export), a
  pluggable per-work spine/citation, and language-neutral onboarding.
- **AI-backed parsing + definitions for languages without a lexicon/analyzer**:
  Greek has LSJ + click-to-parse morphology; Latin was planned behind a
  LexiconProvider. For other languages (no analyzer, no digital lexicon), use
  the AI to supply morphology/parsing + definitions on demand — an AI-backed
  LexiconProvider impl behind the SAME click-a-word UX, just a different
  backend. (Now that the multi-provider AI layer exists, this is a natural fit.)
- **Fork vs. mode**: decide whether this is a separate generic fork or a config
  "mode" in this app. Lean fork if the classical-specific assumptions (Bekker,
  TLG, LSJ) can't stay clean opt-ins; lean mode if they can.

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
