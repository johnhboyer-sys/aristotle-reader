# Translation Workbench — TODO

State as of 2026-07-02 (evening): **Phase 2 complete, UNCOMMITTED** on branch
`claude/blissful-rubin-d64797` (now checked out in the `nervous-saha-372f7c`
worktree — the original blissful-rubin worktree directory was cleaned up; the
branch survived intact). 560 tests green; tsc, vite build, svelte-check, cargo
check clean; export harness 43/43. Awaiting John's review of the phase summary
before commit.

## Phase 2 — DONE (all verified in the browser harness by the orchestrator)

- [x] **Copy-as-citation** (§10): toolbar `“ ”` button + ⌘⇧C; `{english}. ({title}
  {book}{chapter}, {range}: {greek})` composed via scheme.formatCitation; plain
  ⌘C provably untouched (additive diff + regression tests). Terminal-punctuation
  period rule; Greek-cell/mixed selections carry full-row English fallbacks.
- [x] **Scrivener import** (§9): dual-dispatched design (d3) + real-export Stage 0
  addendum (d3a). Core: line-level banded DP + rare-token seeding, spine owns
  rows, hints never override content, orphans block import. Stage 0: real .md
  pairs (paragraph-flow Greek w/ inline markers + soft hyphens; marker-segmented
  English; markdown footnotes incl. multi-paragraph; inline Greek → {grc:…};
  enum-vs-marker disambiguation corroboration-gated; editorial <…> kept+flagged).
  ImportDialog: two-file picker, form, preview table w/ state badges + editable
  cells + merge-up/push-down, orphan assign/discard, Replace/Cancel duplicate
  guard, dev-only sample loader. ACCEPTANCE (measured, real files): Meta 7.17 —
  95% quiet rows, fn1–15 anchored (fn6 multi-paragraph intact), zero silent
  drops; APo 1.4 — enums 4/4 dropped 0 real lost, 73b→74a reset survived,
  no text dumps, both <20ms. Per-cell marker/residue audit in acceptance tests.
- [x] **Whole-work compile export** (§8): manifest-order concatenation, gap
  notice, headings via contract, continuous native footnotes across chapters
  (stored files untouched — asserted), stamps default every-5+columns, English
  and bilingual (stacked Greek-then-English per chapter) modes, reference.docx
  (Cambria + US Letter 1" — see flags) bundled as resource. Found & fixed:
  pandoc was never in shell:allow-execute scope (Phase 1 export would have
  failed in the packaged app).
- [x] **Shared-folder sync** (§11): folder picker (settings gear, Tauri-only),
  reload-on-focus (mtime + hash confirm; clean→silent reload, dirty→Keep mine /
  Load theirs), conflicted-copy surfacing (Drive/Dropbox verbose names + iCloud
  bare `Name 2.md` matched only against our own file stem), iCloud `.icloud`
  placeholder stubs shown greyed w/ plain sentence, turn-taking help popover.
  John approved the /** fs-scope broadening (2026-07-02).
- [x] **Second-scheme exercise**: `busse-paragraph` (CAG page.line, rowUnit
  'paragraph') = one file + one registry line + SchemeId union member; generic
  contract-conformance suite over ALL schemes; executable no-scheme-id-branching
  source test. Friction documented in d2 addendum: bookless works need an
  "empty bookLabel = omit" convention (doc-comment for Phase 3).
- [x] **Corpus resource bundling** (carried from Phase 1): `stage:corpus` +
  `app:package` scripts; 47MB staged (lsj 46MB shared, copied to app-data once,
  idempotent) gitignored at src-tauri/resources/corpus/; onboarding completes
  standalone for bundled works (Meta + APo); unbundled works keep the same
  plain sentence. No TLG text ships — spine still comes from the user's TLG.

## Carried forward (small)

- [ ] **Human-exercise the Tauri-only paths in the real app** (John, or next
  session with John at the keyboard): real Diogenes "Add work…" run; native
  export save dialog (now that the pandoc capability bug is fixed); native
  import file picker; compile export; settings folder picker on a real synced
  folder. All logic-verified + browser-verified only.
- [ ] **Full `tauri build` / `app:package` never run** — artifact size, packaged
  resource resolution (cargo check materialized resources correctly, strong
  signal), updater still unwired (needs John's signing key, from Phase 1).
- [ ] **chapterfile parse.ts U+2028 fragility**: a HAND-AUTHORED footnote body
  containing U+2028 silently merges on round-trip (imports are safe — Stage 0
  normalizes). Hardening candidate.
- [ ] **Copy-citation element-endpoint selections** (e.g. some triple-click
  paragraph selections) resolve as empty → "Nothing to cite" false negative.
  Minor UX hardening: treat element-level endpoints as full-cell coverage.
- [ ] **Dev sample loader** only loads the Meta pair; APo path is
  acceptance-tested but has no one-click UI loader.
- [ ] **Bilingual compile layout** (stacked Greek-then-English per chapter) needs
  John's aesthetic review on a real docx; row-locked facing-page parallel
  remains LaTeX-only territory (docs/pdf-spike).
- [ ] Reference-docx font is **Cambria** (ships with Word, full polytonic
  coverage; EB Garamond is a webfont Word can't resolve). One-line change if
  John prefers an installed manuscript font.
- [ ] Prune `workbench/src/components/FOOTNOTE_PANEL_WIRING.md` at commit time
  (historical doc; wiring long applied).

## Decisions John has confirmed (2026-07-02)

- Bekker stamp default: every-5 + column transitions, plain brackets. KEEP.
- formatCitation comma when no book/chapter. KEEP.
- Whole-work compile: BOTH modes (English-only default + bilingual).
- Whole-disk fs permission for the shared-folder feature: APPROVED.
- Copy-as-citation: separate explicit command; normal ⌘C untouched (his ask).
- Scrivener import defaults: two-file selection; proportional pre-split ON
  (flagged, editable). D3 §9.5 duplicate-import Replace/Cancel shown to John.

## Phase 3 (later; John specifies Aquinas conventions then)

- [ ] AI-assist: local `claude -p`, clipboard fallback, API-key alt (spec §12).
- [ ] Reference-translation panel: text/MD import, chapter-level first (spec §13).
- [ ] Latin: Aquinas schemes (contract proven ready — see d2 addendum +
  busse-paragraph precedent) + Latin morphology behind LexiconProvider.

## Running things

```
cd workbench
npm run dev                                   # browser harness (localhost:1421)
PATH="$HOME/.cargo/bin:$PATH" npx tauri dev   # the real app
npx vitest run                                # 560 tests
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
skip when absent.
