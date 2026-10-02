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

## Things the survey found along the way (fixed in passing, each small)

- `revealItemInDir` after export has never worked: `opener:allow-reveal-item-in-dir`
  was never granted, and a `.catch` hides it.
- `cliProvider.ts:186` calls `assist_suggest`, a command that no longer exists.
- The capability description still says Latin lookup reads Diogenes files; packs
  replaced that.

## What John will notice

- Once after updating: re-pick the library folder (if custom), the TLG folder,
  and the reference doc (if set). Each picker says why.
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
