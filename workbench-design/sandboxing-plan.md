# Workbench sandboxing plan — 2026-10-01

**Goal:** before the Workbench is shared, a hijacked window — injected script from
a hostile lexicon pack, a Perseus page, or AI output — cannot write files outside
the app's own data and the places the user picked, and cannot run any program
with arguments the user did not sanction. Follows
`security-review-2026-09-07.md`; John chose the real fix (option 1) on
2026-10-01 because he will share the app.

**Today:** the window may read/write/delete anywhere (`/**` fs scopes), and Rust
runs any absolute executable with any arguments (`assist_run`, `run_program`).
Only the CSP stands between injected content and both.

## The rule

The window may touch only `$APPDATA`, `$RESOURCE`, and what the user picked in a
native dialog. Rust runs only a fixed set of jobs, builds each job's arguments
itself, and runs only programs Rust found or the user picked.

Two facts make this hold without trusting `settings.json` (which the window can
write):

- **Dialog picks already widen the fs scope** (tauri-plugin-dialog 2.7.1
  `commands.rs:162-209`). Persisted across restarts by
  `tauri-plugin-persisted-scope` into `$APPDATA/.persisted-scope`.
- **The window can never write a dotfile** — fs scopes on Unix require a literal
  leading dot (`requireLiteralLeadingDot` defaults true). So `.persisted-scope`
  and Rust's own `.approved-programs.json` are out of the window's reach. A
  test pins this, because the whole design leans on it.

## Why a program allow-list alone is not enough

Approving *a program* approves *every argument it accepts*: `perl -e`,
`pandoc --lua-filter`, an AI CLI's permission-skipping flags all run arbitrary
code. So Rust stops accepting argv from the window. Each job becomes its own
command that builds argv in Rust:

| Job | New Rust command | Program from | Paths checked |
|---|---|---|---|
| Word export | `export_docx(md, docx, reference_doc?)` | Rust-resolved pandoc, or a user-picked one | `md` under `$APPDATA`; `docx` and `reference_doc` must be in the fs scope (i.e. picked) |
| Pandoc probe | `pandoc_version()` | same | — |
| TLG/PHI export | `diogenes_export(corpus, author, line_mode)` | Rust-resolved `/usr/bin/perl` + Diogenes server dir (Rust probes `/Applications/Diogenes.app`, or a picked folder) | disc dir must be in the fs scope; author `^\d{4}$`; output fixed under `$APPDATA` |
| AI assist | `assist_run(tool, prompt, timeout)` | Rust-held registry for Claude/Codex/Gemini (the candidate ladder moves from `tools.ts` into Rust) | args fixed per tool in Rust |
| Custom AI command | same, `tool = "custom"` | set only through a Rust command that shows a **native confirmation** ("Allow Translation Workbench to run …?") | its args are stored with the approval |
| Lexicon pack | `install_lexicon_pack(zip)` (exists) | — | `zip` must be in the fs scope |

`run_program` and the free-form `assist_run` are removed. The shell plugin's
scoped `perl`/`pandoc` entries go, and onboarding's export moves onto
`diogenes_export`.

## Phases

Each phase lands with its tests, and the app stays usable between phases.

1. **Pin the ground.** Rust test: a dotfile under `$APPDATA` is refused by the
   fs scope. Rust tests for argv construction and path checks (pure functions).
2. **Programs.** New job commands above; old ones removed; frontend callers
   moved (`tauriExport.ts`, `discImport.ts`, `onboarding.ts`,
   `cliProvider.ts`/`assistController.ts`, `AssistSettings.svelte`,
   `ExportSettings.svelte`). The custom-command text field becomes a file picker
   plus the native confirmation. Approved programs persist in
   `$APPDATA/.approved-programs.json`.
3. **Files.** Add `tauri-plugin-persisted-scope`. Every directory pick that is
   read deeply gets `recursive: true` (library folder — two levels deep). Remove
   every `/**` entry from `capabilities/default.json`. Existence probes of fixed
   paths (Diogenes, assist ladders) move into Rust, which needs no scope.
4. **Graceful re-pick.** A stored folder that is no longer in scope (every
   existing user, once) shows "Choose your library folder again" instead of an
   empty library. Same for the TLG folder and the reference doc, which today
   would fail silently.
5. **Review and test.** Codex reviews the Rust and the capability file; Grok
   reviews the frontend. John tests in the built `.app` (list below).

## Codex review of phase 1 (2026-10-01) — what it changes

1. **Write scope must be built per command, not by deleting `/**`.** The
   `fs:allow-appdata-*-recursive` sets add `$RESOURCE` and other app folders to
   a scope the write commands share, so `$RESOURCE` (inside the installed app)
   stays writable after the `/**` entries go. Phase 3 grants write commands
   (`write*`, `create`, `mkdir`, `rename`, `copy_file`, `remove`, `truncate`)
   scoped to `$APPDATA/**` only, and read commands to `$APPDATA`, `$RESOURCE`,
   and picks — and adds a test that reads the effective capability.
2. **The window can delete Rust's dotfiles** by removing `$APPDATA` itself,
   recursively; the scope allows the directory. It still cannot *write* them.
   So every trusted record must **fail closed**: missing, empty or unparsable
   means nothing approved. Phase 2 tests that. (The same remove destroys the
   user's data in `$APPDATA` — that is a data risk the window already holds over
   the library; this plan is about running things, not about deleting.)
3. **`is_inside` must see through symlinks.** Phase 2 canonicalizes the path
   (or, for a file not yet created, its parent) before checking, and refuses a
   path whose real location falls outside the root.
4. **The AI CLIs can run commands of their own** if a prompt asks and the
   user's own CLI settings allow it (Codex's read-only sandbox still runs
   read-only commands; Gemini as invoked has no sandbox). Phase 2 launches each
   with its tools switched off — flags verified against the installed Claude
   and Codex, not assumed — and treats Gemini as unverified until it is
   tested on a machine that has it.

## Phase 2 as built (2026-10-01)

Commits `f2ec0360f5` and `518037fcbd` on `claude/workbench-sandbox`.

- **Job commands** (`src-tauri/src/commands.rs`): `pandoc_version`,
  `pick_pandoc`, `forget_pandoc`, `choose_docx_target`, `export_docx`,
  `diogenes_status`, `diogenes_export`, `assist_detect`, `assist_run(tool,
  prompt)`, `assist_set_custom`, `assist_forget_custom`. `run_program`,
  `assist_which` and the argv `assist_run` are gone, and so is the shell
  plugin (Cargo, npm, capability; a test pins that no `shell:` grant returns).
- **Picks** are made in dialogs Rust opens: a pandoc, the custom AI command
  (file picker, then a native "Allow …?" alert listing each argument on its
  own line), and the Word target of every export. The first two are recorded
  in `.approved-programs.json`; a missing or unparsable record approves
  nothing. A save target is held in memory for one export. The fs plugin's
  runtime scope is not used for this: it also holds open-dialog picks (a
  reference doc, a library folder), which pandoc must not overwrite.
- **Symlinks**: `is_really_inside` resolves both paths (a file not yet
  created through its parent) — used for export's intermediate Markdown and
  Diogenes' output folder.
- **AI CLIs**: Claude with `--tools "" --setting-sources ""` plus the empty
  MCP config; Codex with `code_mode_host`, `shell_tool`, `unified_exec` and the
  features that act outside its sandbox off, web search disabled, user config
  ignored. Both checked against the installed CLIs (claude 2.1.286, codex-cli
  0.159.2): with the old flags each ran a shell command; with these neither
  could run, read, write or fetch, and a translation still came back.
- **Diogenes and perl** are found by Rust only (`/Applications/Diogenes.app`
  on macOS; Linux and Windows candidates untested). No picker was added:
  nothing in the UI ever set `diogenesPath`/`perlPath`; settings now drop them.
- **settings.json** no longer carries `pandocPath`, `diogenesPath`, `perlPath`;
  `cliPaths` and `custom` stay parseable but nothing runs from them.
- Fixed in passing: Reveal in Finder (permission granted); `cliProvider.ts`'s
  dead `assist_suggest` path removed.

Codex's verification of the fixes: the Word target fix is correct. Claude
still loads *managed* (admin-installed) settings and their hooks — no flag
skips those, by Claude's design, and a prompt cannot trigger them; accepted.
Line separators and invisible characters are now refused in a custom
command's arguments and program name.

**Gemini disabled (John, 2026-10-02)** until its own tools can be switched
off and that is tested: Rust no longer knows it, Settings no longer offers
it, and a saved Gemini choice falls to the clipboard (labelled "Gemini
(disabled)"). Its untested invocation is noted on `AssistTool` in jobs.rs.

**Grok not added (2026-10-02).** John asked for it as an option. grok 1.0.46
cannot be stopped from using its tools in `-p` mode: with `--tools ""`, with
every built-in tool named in `--disallowed-tools`, and with a `--deny` rule
per tool plus `--permission-mode dontAsk`, it still ran `touch`, read a file
outside its folder, wrote a file and fetched a page. It also loads the user's
MCP servers and skills, and an unknown `--sandbox` profile only warns and
runs anyway. Re-test a newer grok before adding it; until then the custom
command (with its native confirmation) is the way to use it, at the user's
own risk.

**Handed to phase 3:**
- Reference-doc and disc-folder paths are checked for "is a file / folder"
  only. Checking that they were picked needs picks to survive a restart
  (persisted-scope); checked now, every export with a saved reference doc
  would fail after a restart.
- Codex: while the window may write `/**`, it can overwrite a program Rust
  later runs (a user-writable pandoc, AI CLI, or Diogenes' `xml-export.pl`).
  Phase 3's write scope (`$APPDATA/**` only) closes this — **phase 3 must
  land before the app is shared.**

## Phases 3–4 as built (2026-10-02)

Branch `claude/workbench-sandbox-p3`.

- **Capability** (`src-tauri/capabilities/default.json`): no `/**`, and no fs
  permission *set* at all — `fs:default` also brings in a global scope over
  every app folder, and `fs:allow-appdata-*` brings in `$RESOURCE`. Each fs
  command is granted alone with its own scope: `exists`, `read-text-file`,
  `read-file`, `read-dir`, `stat` on `$APPDATA` and `$RESOURCE`;
  `write-text-file`, `rename`, `remove`, `open` on `$APPDATA/**` only (`open`
  counts as a write: it takes write options from the window); `mkdir` also on
  `$APPDATA` itself; `read`/`seek` act on an open handle and carry no scope.
  `copy_file`, `write_file`, `create`, `truncate` are not granted (nothing
  used them once onboarding's shard copy became read + write).
- **Rust's dotfiles can no longer be removed** either: `remove`/`rename` reach
  `$APPDATA/**` only, which never matches a dotfile and never `$APPDATA`
  itself. Codex's phase-1 point 2 is closed; the records still fail closed.
- **Picks are read and write.** The dialog plugin adds a pick to the fs
  plugin's runtime scope, which every fs command consults — write commands
  included. That is what lets a library folder be saved to; it also means a
  picked TLG folder or reference doc is writable by the window. Folders read
  deeply (library, TLG/PHI) are picked with `recursive: true`; the export
  folder is not (it is only where the save dialog opens). Files dropped on the
  window are added by the fs plugin too.
- **tauri-plugin-persisted-scope 2.3.7** (2.4 needs a newer tauri) restores
  picks at launch from `$APPDATA/.persisted-scope`; a missing or garbled
  record restores nothing.
- **Tests that read the effective capability** (`src-tauri/src/capability_tests.rs`):
  fs calls sent through Tauri's IPC to a mock app built from the real
  `generate_context!` and the real plugin wiring (`with_fs_plugins` in
  lib.rs), each test under its own app identifier so `$APPDATA` is a fresh
  folder. Written against the old capability first: 6 of 8 failed.
- **Pick checks in Rust**: `is_picked` asks the fs plugin's runtime scope
  (picks only, not the capability). `export_docx`'s reference doc must be the
  bundled one (by real path) or a pick; `diogenes_export`'s disc folder must
  be a pick; `install_lexicon_pack`'s zip must be a pick.
- **Phase 4**: `pick_status(path, deep)` → `ok` / `missing` / `not-picked`
  (not-picked wins, so the window learns nothing about a path it was never
  given). The library folder is checked at startup before anything loads
  (`LibraryRepickDialog`: choose again, or use the default location); Add
  work and Import a text check the saved TLG/PHI folder; both exports check
  the reference doc before the save dialog, and Settings › Export shows the
  reason. A *missing* reference doc still falls back to the bundled one, as
  before; a *not-picked* one stops the export.
- No existence probe of a fixed path outside the scope was left in the
  frontend: phase 2 had already moved Diogenes and the AI CLIs into Rust.
- Not handled: `referenceRoot` (where imported reference translations live)
  is still read from settings, but nothing in the UI sets it.

**Codex's review (GPT-6-Sol, 2026-10-02)** found five things:
1. *A symlink inside `$APPDATA` would let a write land outside it* (the scope
   checks a new file's path before the OS follows a parent link). Not
   reachable: the fs plugin has no command that makes a symlink, and nothing
   Rust writes into `$APPDATA` makes one. Recorded, not fixed.
2. *A pick can name Rust's record* — fixed. A hijacked window could aim a save
   dialog at `.approved-programs.json`; one click on Save put it in the
   runtime scope, which the leading-dot rule does not cover. The capability
   now denies `$APPDATA/.*` in the fs plugin's global scope, which every
   command checks before any allow (`a_pick_cannot_open_rusts_records`).
3. *`is_picked` accepts any pick* (a save target, a file inside a picked
   folder), not only one made for that purpose. Accepted: it gives Rust's jobs
   nothing the window could not already read itself.
4. *The persisted-scope plugin rewrites its record non-atomically.* Accepted:
   a torn record restores nothing, so the user is asked again.
5. *Two refusal tests could pass for the wrong reason* — fixed (`write_file`
   now sends its path header; `copy_file` copies a file that exists).

## Things the survey found along the way (fixed in passing, each small)

- `revealItemInDir` after export has never worked: `opener:allow-reveal-item-in-dir`
  was never granted, and a `.catch` hides it.
- `cliProvider.ts:186` calls `assist_suggest`, a command that no longer exists.
- The capability description still says Latin lookup reads Diogenes files; packs
  replaced that.

## What John will notice

- Once after updating: re-pick the library folder (if custom), the TLG folder,
  and the reference doc (if set). Each picker says why. (Phase 2: a pandoc
  chosen in Settings, if any, must be chosen again.)
- Setting a custom AI command shows a macOS confirmation.
- Nothing else.

## John's test list (built `.app`, at the end)

Open a chapter and save · library in a custom folder: re-pick prompt, then
saves and survives restart · move the library to another folder · Add work from
TLG · Import a text from the disc · Perseus TEI import · New document from a file
· reference import · chapter and whole-work Word export, with and without a
reference doc · Markdown export · Reveal in Finder after export · AI Translate /
Check / Ask with Claude · install and remove a lexicon pack · ⌘Q and close still
save.

## Not covered

- A user who installs a malicious *program* and picks it: the app trusts the
  user's own choice, as any Mac app does.
- Data inside `$APPDATA` and the library folder stays writable by the window —
  it is the user's own data, and nothing there is executed.
