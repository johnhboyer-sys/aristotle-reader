# Machine-wipe handoff — 2026-07-07

John is wiping this machine. This branch (`claude/machine-wipe-handoff`) preserves everything
git-pushable that lived only locally. State of all ongoing work is in the PRs and branches below;
the session-memory snapshot lives in the **private** repo `johnhboyer-sys/claude-memory`
(pushed the same day — restore it to
`~/.claude/projects/-Users-johnboyer-Developer-aristotle-reader/memory/` on the new machine).

## Open PRs (merge order where it matters)

- **#20** Translation Workbench (base) — hand-testing was in progress.
- **#25** Workbench D8 + refinement pass — STACKED on #20's branch; retargets to main when #20
  merges. 1392 tests green. John's .app checklist at top of `workbench-design/TODO.md`.
- **#21** Dubious works (Oeconomica + authenticity labels) · **#22** DA/Smith Tier 2 ·
  **#23** HA/Thompson alignment — all awaiting John's review. (#22/#23 both touch
  `docs/alignment-status.md`; second merge has a trivial conflict — keep both rows.)

## What this branch adds

- `CLAUDE.md` — the project instructions (were untracked at repo root!).
- `docs/fable-orchestration.md` — John's orchestration prompt (was untracked).
- `docs/handoff/goal-a-session-handoff.md` + `goal-a-assets-manifest.md` — the LOCKED Goal-A
  OCR-pipeline plan (next big session; was only in ~/Downloads).
- `docs/handoff/D8-workbench-handoff.md` — the D8 handoff (superseded by PR #25's description
  but kept for the testing checklist provenance).
- `docs/handoff/PA-Lennox-desktop-import-v2.md` — the Lennox PA defect-catalog fixture.

## Branches rescued to origin today (were local-only)

`claude/workbench-paragraph-views` (PR #25) · `claude/blissful-austin-35873e` (UI polish +
uncommitted feasibility tools, committed at rescue) · `codex/my-task` (codex-session pipeline
work, committed at rescue) · `claude/cool-chebyshev-ce3faf` · `claude/elastic-leakey-ce4885`
(parallel-Organon interp edition tools) · `claude/lennox-pa-scripts` (Goal-A prerequisite
scripts) · `claude/optimistic-bose-e812b3` (Lennox OCR normalizer) · `claude/tender-pare-4824d8`
(LSJ dedup 514→153MB) · `claude/vigorous-aryabhata-daea8c` (HA §5b, superseded by PR #23 but
kept) · `parked/pipeline-stranded` (the big parked pipeline branch).

## Backup locations at wipe time (updated after John's iCloud copies)

- **iCloud Drive `/Developer`** — full copy of `~/Developer` (22GB; verified: `bonitz/book.pdf`
  byte-exact, `build/` 282M matches source, gitignored `desktop/src-tauri/tauri.release.conf.json`
  present, `greek-keyboard/` present). TEMPORARY archive — salvage the gitignored assets into a
  fresh GitHub clone, then DELETE this iCloud copy (see "Restoring" below).
- **iCloud Drive `/WIPE BACKUP/Downloads`** — all of ~/Downloads (29 project .md files incl.
  the `meta z 17/` staging + the Workbench .app, 1.0GB) + a `claude files` folder.
- **TLG files** — `/Users/johnboyer/Documents/CLAUDE CODE ARISTOTLE PROJECT/TLG Files/TLG`
  already rides Desktop & Documents iCloud sync (evicted locally, content verified fetchable).
  On the new machine: right-click → Download Now BEFORE the first pipeline run.
- **Private repo `johnhboyer-sys/claude-memory`** — session memory + plans, PLUS `assets/`:
  `greek-keyboard.bundle` (full git bundle; restore via `git clone greek-keyboard.bundle greek-keyboard`)
  and `tauri.release.conf.json` (the gitignored updater-pubkey config).

## NOT saved anywhere — hand-carry required

1. **`~/.tauri/aristotle-reader.key` (+ `.pub`)** — the Tauri UPDATER SIGNING KEY. Never goes
   to git. Without it, installed v0.2.0 apps can't receive signed updates. → password manager
   (passphrase already there) or USB. **The one irreplaceable file.**
2. **`~/.claude` global config** (settings, plugins incl. codex-companion, keybindings) —
   reinstallable; workbench AI-assist expects `claude`/`codex` CLIs on PATH.

## Restoring (no-duplicates discipline)

Code from GitHub only: fresh clone into `~/Developer` (plain folder, OUTSIDE iCloud — iCloud
round-trips can corrupt `.git`). From the iCloud `/Developer` copy salvage ONLY: `build/`,
`desktop/src-tauri/tauri.release.conf.json`, `bonitz/book.pdf`, `greek-keyboard/` — right-click
→ Download Now first, copy out of iCloud, then delete the whole iCloud `/Developer` copy once
the fresh clone passes its test suites. TLG stays where it is (it's the primary, synced).
`claude-memory` clones back to the paths in its README.

## New-machine bootstrap (short form)

1. Clone the repo OUTSIDE iCloud (`~/Developer/aristotle-reader`), Node 22.
2. Restore TLG files to the Documents path above; restore `~/.tauri` keys.
3. Clone `johnhboyer-sys/claude-memory` (private) back to the Claude memory path.
4. `npm install` at root + `workbench/` + `desktop/`; rebuild the corpus per
   `docs/` recipes (TLG_DIR gotcha in CLAUDE.md: run Diogenes xml-export.pl directly).
5. Resume points, in memory's "Resume here" order: PR reviews (#20–#25), then the reader-layout
   pass (P0 for the v0.2.0 release), then Goal-A (docs/handoff/goal-a-session-handoff.md).
