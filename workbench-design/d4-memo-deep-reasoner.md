# D4 — AI-assist (build spec §12) — DESIGN MEMO (deep-reasoner)

Status: **design proposal, 2026-07-03.** Not yet synthesized against Codex. Design only —
no repo file was modified. This memo is the deep-reasoner half of a §12 decision; the
orchestrator should dispatch the same charter to Codex and synthesize, per the build spec's
high-stakes protocol (shell-out to an external CLI + a new capability entry is high-stakes:
a scope mistake fails silently only in the packaged app, exactly the pandoc bug Phase 2 hit).

---

## Decisions summary

| # | Question | Decision |
|---|----------|----------|
| 1 | Invocation | Frontend `@tauri-apps/plugin-shell` `Command.create`, mirroring `runPandocTauri`. **One-shot** `claude -p --output-format json`. Solve GUI-PATH by resolving an **absolute path to the `claude` binary** at first use (probe a fixed candidate list incl. `~/.claude/local/claude`, then a login-shell `-lc 'command -v claude'` fallback), cache it in settings. 60s timeout. One in-flight request at a time (new request cancels the prior). |
| 2 | Detection / invisibility | **Lazy, first-use detection, cached in settings** (`assist.cliPath`, `assist.cliState`). NO startup probe. Control is **always visible and enabled** (never greyed). If no working provider, clicking it silently runs the clipboard fallback — the user never sees a disabled affordance or a setup nag. A one-time detection runs on first click only. |
| 3 | Prompt content | Current row Greek + Bekker address + work/book/chapter, ±N=6 rows of surrounding Greek, and the user's **existing English for surrounding rows only where already drafted** (never the empty target row). System-prompt style guidance. Privacy: draft English is sent to the CLI (local Claude Code subscription auth) — acceptable & flagged; the API-key path gets an explicit consent line. Full template in §3. |
| 4 | UX | Row-level action (gutter affordance on the focused row + `⌘⏎`). Suggestion presented in a **non-modal inline popover anchored under the row** (not a side panel, not ghost text). Accept = **Insert** button → the text enters the cell through the normal editor `insertSuggestion` command → normal transaction → commit-on-idle. The assist layer NEVER writes the model or chapter files. |
| 5 | Fallback ladder | CLI missing/unauth/errored → clipboard action with a structured, paste-ready payload (§5). One `AssistProvider` interface; `CliProvider`, `ApiProvider`, `ClipboardProvider` all implement it. API-key path off by default, labeled pay-per-use, stored in settings, chosen explicitly. |
| 6 | Modules | New `src/lib/assist/` (pure: `prompt.ts`, `parse.ts`, `provider.ts` interface, `clipboardPayload.ts`, `detect.ts` core; Tauri-coupled thin adapters `cliProvider.ts`, `apiProvider.ts`). `FakeProvider` for tests; all pure logic tested in node env, no jsdom. Acceptance gates listed. |
| 7 | Failure table | §7 — every degradation → one plain sentence. |
| 8 | Phasing | Slice 1 = clipboard fallback + detection + inline popover shell (ships value with zero CLI). Slice 2 = CLI provider. Slice 3 = API-key path. Slice 4 = multi-line / refine. |

**ASK JOHN items** collected in §9.

---

## 1. Invocation architecture

### 1a. plugin-shell, not a Rust command

Use the frontend `@tauri-apps/plugin-shell` `Command.create(program, args).execute()`, exactly
as `runPandocTauri` (export/pandoc.ts) and the Diogenes/pandoc probes already do. Rationale:

- **Precedent + one trust model.** Every subprocess in this app already goes through the shell
  plugin capability. A bespoke Rust `#[tauri::command]` wrapping `std::process::Command` would
  be a second, parallel security surface with its own scope reasoning — more to audit, more to
  get wrong, and it bypasses the capability system that the pandoc-scope-bug postmortem taught
  us to respect.
- **Testability.** The provider takes the shell module by dependency injection (same shape as
  `runPandocTauri(job, shell)` — see its `TauriShellModule` structural interface). That keeps
  the module importable and unit-testable in the node/vitest env with a fake shell, with no
  Tauri runtime and no jsdom.

*Rejected — Rust command:* only worth it if we needed streaming stdout into the UI token-by-token
(Tauri events). We deliberately choose one-shot (below), so the Rust complexity buys nothing.

### 1b. The GUI-PATH problem — the load-bearing decision

`claude` is almost never on a GUI app's `PATH`. A macOS `.app` launched from Finder/Dock inherits
`launchd`'s minimal environment (`/usr/bin:/bin:/usr/sbin:/sbin`), NOT the user's
`.zshrc`/`.zprofile` PATH. The current pandoc scope uses bare `cmd: "pandoc"`; pandoc via Homebrew
lives in `/opt/homebrew/bin` or `/usr/local/bin` which are *also* not on the launchd PATH — meaning
**the existing pandoc export likely has this same latent bug in the packaged app** and just hasn't
been exercised from a Finder launch yet. (Flagged in §9 as ASK JOHN #6 — worth confirming separately.)

`claude` is worse than pandoc: it commonly lives at **`~/.claude/local/claude`** (the local
installer) or is a shell function/alias, neither of which any PATH probe finds. So we must resolve
an **absolute binary path** ourselves and invoke by absolute path.

**Resolution ladder (run once, on first assist use; result cached in settings):**

1. **Candidate absolute paths**, checked with `fs.exists` (we already have `fs:allow-exists` for
   `/**`), in order:
   - `$HOME/.claude/local/claude`  ← the local-install location the charter calls out
   - `$HOME/.local/bin/claude`
   - `/opt/homebrew/bin/claude`
   - `/usr/local/bin/claude`
2. **Login-shell resolution fallback:** run the user's login shell so it sources their profile,
   and ask it where `claude` is:
   `Command.create('login-shell-claude-which', [])` scoped to
   `cmd: "/bin/zsh", args: ["-lc", "command -v claude"]` (see capability entry in §1e). Trim
   stdout; if it's an absolute path that `fs.exists` confirms, use it. This catches PATH entries
   and *most* real installs. (It does NOT catch a pure shell *function* named `claude` — those
   can't be exec'd as a binary anyway; such a user is treated as "not found" and gets the
   clipboard fallback. Acceptable: this is a power-user edge, and the clipboard path is fully
   functional.)
3. If both fail → provider state = `not-found` → clipboard fallback.

The resolved absolute path is stored as `settings.assist.cliPath`. **But** a stored absolute path
cannot be re-validated by a `{ name, cmd: <fixed> }` scope entry (the path is user-specific and
unknown at build time). Tauri v2's shell scope keys on the `name` and validates `cmd`/`args`
against the manifest. Two ways to run an arbitrary absolute path under scope:

- **Chosen:** invoke through the login shell for the *actual* call too:
  `cmd: "/bin/zsh", args: ["-lc", <script>]` where `<script>` is
  `'exec "$CLAUDE_BIN" -p --output-format json'` with the prompt passed on **stdin** (not as an
  arg — avoids shell-quoting the Greek/English payload) and `CLAUDE_BIN` passed via `env`. The
  scope entry fixes `cmd` to the shell and the first args to `-lc`; the script body is a fixed
  string constant in our code, so nothing user-controlled reaches the shell as code. This reuses
  exactly one scope entry for both detection and invocation.

  *Why stdin, not an arg:* the prompt contains newlines, Greek, quotes, and the user's English.
  Passing it as `-p "<prompt>"` through `-lc` would require bulletproof shell-escaping of
  attacker-adjacent-but-really-just-Greek text. Piping the prompt to the process's stdin
  sidesteps shell parsing entirely. `claude -p` reads the prompt from stdin when given no prompt
  argument. Command.create supports writing to stdin via the spawned child (`Command.spawn()` +
  `child.write()`), or we pass the prompt as a single positional arg to a wrapper that reads it —
  simplest is `spawn` + write + read to close. (Implementation detail for fast-worker; the design
  constraint is: **user text never becomes shell syntax.**)

*Rejected — bare `cmd: "claude"` like pandoc:* fails from a Finder launch for the majority of real
installs (`~/.claude/local/claude` is never on launchd PATH). This is the entire point of the
charter's GUI-PATH callout; copying the pandoc pattern would reproduce the latent bug on purpose.

*Rejected — a Tauri sidecar (`externalBin`) bundling claude:* we don't ship claude; it's the
user's own subscription-authenticated install. Sidecar is for bundled binaries.

### 1c. One-shot, not streaming

`claude -p --output-format json`, wait for exit, parse the JSON envelope, show the whole
suggestion at once. Rationale: a single Bekker line's translation is one short sentence; streaming
tokens into a popover adds real complexity (Rust command + event plumbing, partial-render states,
cancellation of a live stream) for a sub-second payoff on a ~10-word output. The perceived latency
is dominated by model spin-up, which streaming doesn't fix. Keep it simple; revisit only if
multi-line refine (Slice 4) makes waits feel long.

### 1d. Output format — `--output-format json`

`claude -p --output-format json` returns a structured envelope (result text + `is_error` + usage/cost
metadata) instead of raw text. Parsing a documented JSON field is far more robust than scraping
stdout, and it gives us `is_error` to distinguish "model produced a suggestion" from "CLI ran but
errored" cleanly. `parse.ts` extracts the `result` string defensively (unknown-shape JSON →
treat as error → plain sentence, never a crash). If a given CLI version's JSON shape differs, the
defensive parse degrades to the error sentence rather than showing garbage.

*Rejected — plain text stdout:* brittle; can't distinguish an error message printed to stdout from
a real suggestion.

*Rejected — `stream-json`:* only useful with streaming, which we rejected.

### 1e. Timeout & concurrency

- **Timeout: 60s**, enforced app-side (race the `execute()` promise against a timer; on timeout,
  kill the child and show the timeout sentence). Cold model start can take several seconds; 60s is
  generous without hanging forever.
- **Concurrency: exactly one in-flight assist request.** Starting a new suggestion cancels/ignores
  the prior (abort the pending promise, kill its child if we used `spawn`). The user is translating
  one line at a time; there is no queue. A module-level `AbortController`/token guards this. This
  also prevents a fumble-double-`⌘⏎` from spawning two CLI processes.

### 1e-scope. The exact capability entries (§12 smoke-test requirement)

Add to `src-tauri/capabilities/default.json`'s `shell:allow-execute` `allow` array:

```json
{
  "name": "claude-assist",
  "cmd": "/bin/zsh",
  "args": [
    "-lc",
    { "validator": "^(command -v claude|exec \"\\$CLAUDE_BIN\" -p --output-format json)$" }
  ]
}
```

Notes on this entry:
- **`cmd` is the fixed login shell**, not `claude` — because the absolute claude path is
  user-specific and unknowable at build time, and because `-lc` is what sources the profile PATH.
- The **second arg is a validator pinned to the two exact fixed script strings** we ever run
  (the detection `command -v claude`, and the invocation `exec "$CLAUDE_BIN" ...`). This is
  tighter than pandoc's `"args": true` — nothing user-controlled is ever an arg; the prompt goes
  over stdin. The `\\$CLAUDE_BIN` is a literal in the script (expanded by the shell from `env`),
  so the regex matches the literal `$CLAUDE_BIN` text.
- `env: { CLAUDE_BIN: <resolved absolute path> }` is passed at `Command.create` time (plugin-shell
  supports per-command env), so the resolved path is injected without ever appearing in argv.

**Smoke-test procedure** (the pandoc-bug lesson — a scope gap only shows in the packaged app):
1. `npm run app:package` (full `tauri build`, not `tauri dev` — dev is more permissive).
2. Launch the built `.app` **from Finder** (NOT `open` from a terminal, which leaks the terminal's
   PATH and masks the bug — this is the exact trap).
3. Click Suggest on a row with the CLI installed at `~/.claude/local/claude`. Expect a real
   suggestion. If instead the clipboard fallback fires, detection failed under the packaged
   launchd environment → the scope or the resolution ladder is wrong.
4. Repeat with `claude` uninstalled/renamed → expect the clipboard fallback and its plain sentence.
5. Verify in Console.app there is no `command not found` or capability-denied error leaking to the
   user; those belong in `console.error` only.

A cheap CI-adjacent guard: a vitest that asserts the two script strings our code can emit both
match the capability regex (import the regex from a shared constant used by both the code and,
ideally, generate the capability entry from it — see §6). This catches "someone edited the script
but not the scope" at test time instead of at Finder-launch time.

---

## 2. Detection & the §12 invisibility principle

### 2a. No startup probe

Detection is **lazy and first-use only**. Nothing runs at app open. Rationale: a startup probe
either (a) spawns a subprocess on every launch — slow, and for the collaborator who has no
`claude`, it's a pointless login-shell spawn every open; or (b) risks a visible hitch. The charter
is explicit: "no startup probe that could nag or slow open." Detection runs the first time the
user actually invokes assist, then the result is cached in settings so subsequent launches are free.

### 2b. The control is always present and always enabled

The Suggest affordance renders identically for everyone. It is **never greyed out** and shows **no
badge, no tooltip about setup, no onboarding**. Rationale straight from §12: "not a greyed-out
control demanding attention... Someone who never touches it should experience the app as if the
feature isn't there." A disabled/greyed control *demands attention* — it says "there's something
here you're missing." An always-enabled control that quietly does the sensible thing does not.

**What happens on click resolves to the best available provider, transparently:**

- CLI present & working → inline suggestion.
- CLI absent/unauth/errored, no API key → the **clipboard fallback runs** and shows its one plain
  sentence ("Copied this line and its context — paste into Claude or another tool."). To the
  collaborator who never uses LLMs, this reads as an innocuous "copy for reference" action, not a
  broken AI feature. He is unlikely to ever press it; if he does, nothing scary happens and no
  setup is demanded.

So detection state changes *what the button does*, never *whether the button is there or how it
looks*. This is the cleanest reading of "feels like the feature isn't there."

**Discoverability tension (ASK JOHN #1):** an always-visible "Suggest" button is arguably *more*
present than John may want for the collaborator. An alternative that hides it even harder: **no
visible button at all — assist is `⌘⏎`-only**, undiscoverable unless you know it. The collaborator
never presses a shortcut he doesn't know exists; John, who set it up, does. This is the most
literal "as if the feature isn't there." I lean toward **a very quiet affordance that appears only
on the focused row's gutter on hover, plus `⌘⏎`** — present enough for John to click, invisible at
rest. Flagged for John.

### 2c. Detection caching & invalidation

`settings.assist = { cliPath?: string, cliState?: 'ok' | 'not-found' | 'unauth', checkedAt?: number }`.
Cache the resolved path and last state. Re-detect (cheaply) when: cache is empty; last state was
`not-found`/`unauth` and the user explicitly retries (e.g. re-clicks after installing claude); or
the cached `cliPath` no longer `fs.exists`. Never re-detect automatically on a timer. A successful
run refreshes `checkedAt`. This keeps the happy path zero-subprocess after the first success.

---

## 3. Prompt content

### 3a. What is sent

For "suggest a translation for the current row":

- **Target line:** the current row's Greek (the line to translate) + its Bekker address.
- **Context Greek:** the Greek of ±N rows around it. **N = 6** (chosen: enough for a clause/period
  of Aristotle to be visible on both sides — Aristotle's sentences routinely run several Bekker
  lines — without ballooning the prompt or leaking a whole chapter). Configurable constant, not a
  setting.
- **Context English:** the user's **already-drafted** English for those surrounding rows, each
  paired with its Greek and address — but **only rows that already have content.** The empty target
  row and any other empty rows are shown as blanks. This teaches the model the translator's voice,
  terminology, and register from his own adjacent work — far more valuable than any generic style
  note. This is the single biggest quality lever.
- **Work / book / chapter / scheme**, so the model knows it's *Metaphysics* Ζ.17 and can honor
  technical vocabulary.
- **Style guidance** (system prompt): translate one Bekker line, output ONLY the English for the
  target line (no quotes, no commentary, no restating the Greek), match the surrounding
  translation's register and terminology, keep close correspondence to the target line's Greek
  because the app is row-locked 1:1.

### 3b. Privacy considerations (flagged)

The user's **unpublished draft translation** is sent to the provider. For the **CLI path** this
goes to the user's own Claude Code subscription auth on his own machine — the same trust boundary
as using Claude Code in a terminal on the same draft; low concern, but note it. For the **API-key
path** the draft goes to the Anthropic API under the user's key. Neither bundles or redistributes
anything. **Recommendation:** a one-line note in the assist settings section — "Suggestions send
the current line, nearby lines, and your nearby draft translation to Claude." No per-request
consent dialog (that would nag). The collaborator never triggers this because he never uses assist.
(ASK JOHN #2: is any per-work opt-out wanted, e.g. for a passage under embargo? I recommend not in
Phase 3 — YAGNI — but flag it.)

### 3c. The actual template

`prompt.ts` — a **pure function** `buildAssistPrompt(ctx): { system: string; user: string }`,
fully unit-testable (deterministic string in, string out; no Tauri, no IO):

```
SYSTEM:
You are helping a professional classicist translate {WORK_TITLE} ({AUTHOR}) from
{ORIGINAL_LANGUAGE} into English. The translation is strictly line-locked: each source line
gets exactly one English line, kept in 1:1 correspondence even when English word order forces
an awkward mid-clause break. Match the register, terminology, and style of the surrounding
English shown below. Output ONLY the English translation for the single TARGET line. Do not
add quotation marks, commentary, notes, alternatives, or the Greek. Do not translate the
context lines.

USER:
Work: {WORK_TITLE}, Book {BOOK_LABEL}, Chapter {CHAPTER}  ({SCHEME} citation)

Context (each line: [address] Greek — English draft, blank if untranslated):
[1041a3] {grc} — {english or (untranslated)}
[1041a4] {grc} — {english or (untranslated)}
[1041a5] {grc} — {english or (untranslated)}

>>> TARGET line to translate:
[1041a6] {grc}

Continuing context:
[1041a7] {grc} — {english or (untranslated)}
[1041a8] {grc} — {english or (untranslated)}
...

Provide the English translation for the TARGET line only.
```

Design points:
- The `[address]` labels use the citation scheme's raw address string (opaque, from the row model)
  — assist never parses addresses; it just displays them. No coupling to `citation/` internals.
- Greek is Unicode (the canonical form in the model/on disk, per D1). No Beta Code ever leaves the
  editor.
- The TARGET line is bracketed with `>>>` so the model can't confuse it with context.
- Emptiness is rendered as an explicit `(untranslated)` token, never an empty field the model might
  misread.

---

## 4. UX

### 4a. Where the action lives

- **Primary:** a quiet Suggest affordance on the **focused row** (a small glyph in/near the gutter,
  appearing on row focus/hover only — invisible at rest, per §2b).
- **Keyboard:** **`⌘⏎`** (Cmd-Return) while the caret is in an English cell → suggest for that row.
  `⌘⏎` is unclaimed by the D1 rowKeymap (which owns plain Enter = advance row, Tab, Backspace,
  arrows) and reads naturally as "do the smart thing here." This is the path John will actually use.
- **Not** in the top toolbar: the toolbar is document-scoped (bold/italic, export); assist is
  row-scoped and belongs next to the row.

### 4b. Presentation — inline popover (chosen)

A **non-modal popover anchored just under the focused row**, showing the suggested English with
**Insert** / **Dismiss** buttons (and, Slice 4, **Regenerate**). While the request is in flight the
popover shows a subtle "Thinking…" state; it can be dismissed (which cancels the request, per the
one-in-flight rule).

*Rejected — inline ghost text* (grey suggestion typed into the cell, Tab to accept, à la Copilot):
Tempting, but it fights the architecture. The cell is a restricted-schema ProseMirror instance
where **`⇥`/`Tab` is already bound to "move to next row"** (D1 rowKeymap) and Backspace-at-start is
a guarded no-merge affordance. Injecting provisional ghost text into the live doc risks it leaking
into a commit-on-idle before acceptance (violating the hard constraint that only accepted text
enters the model), and re-binding Tab contextually would muddy hard-won muscle memory. Ghost text
also implies a per-keystroke autocomplete cadence we explicitly rejected (one-shot, on demand).

*Rejected — bottom drawer / side panel:* the bottom drawer is already the click-to-parse
morphology panel (§6); overloading it couples two unrelated features and moves the suggestion far
from the line. A right-side panel is the footnote authoring panel's slot. A popover keeps the
suggestion spatially next to the line it's about — the correct proximity for a per-row action.

### 4c. Accept flow — the HARD CONSTRAINT

Clicking **Insert** does **not** touch the ChapterModel or any file. It calls a normal editor
command on the focused row's TipTap instance — e.g. `RowEditor.insertSuggestion(text)` — which:

1. Runs a standard ProseMirror transaction that replaces the row's current selection/content with
   the suggested text (as plain text with the default/English marks; no Greek mark, no footnote
   nodes — a suggestion is prose).
2. That transaction flows through the **exact same path as human typing**: it dispatches through
   the view, marks the row dirty, participates in the **app-level undo stack** (D1 — one undo
   entry, `before`/`after` PMDocJSON for that row), and commits to the model on the normal
   commit-on-idle debounce.

So an accepted suggestion is **fully undoable with `⌘Z`, dirty-tracked, autosaved on the normal
cadence** — indistinguishable from text the translator typed. The assist layer's only reach into
the editor is calling one public command with a string; it has **no reference to the model, no file
IO, no direct doc mutation.** This is enforced structurally: `src/lib/assist/` imports nothing from
`editor/model.ts` or `library/storage.ts`. (Enforceable as a vitest source-scan gate, §6 — same
technique as D2's `schemeIdIsolation.test.ts`.)

**Insert target semantics:** insert replaces the whole row's English content by default (the common
case is an empty row). If the row already has content and the caret has a selection, replace the
selection; if it has content and no selection, insert at caret. Kept simple; the undo makes any
surprise costless.

---

## 5. Fallback ladder

One interface, three providers (§6). The ladder, top to bottom:

1. **CLI present, authenticated, succeeds** → inline suggestion (§4).
2. **API key set (and CLI unavailable or user preferred API)** → `ApiProvider` (direct Anthropic
   API). Same interface, same popover, same Insert flow.
3. **No working provider** → `ClipboardProvider`: copy a paste-ready payload and show a plain
   sentence. This is the graceful floor the charter demands, and it's genuinely useful (John can
   paste into a terminal `claude` or claude.ai).

### 5a. Clipboard payload (the exact copied text)

The same context `prompt.ts` builds, formatted as a self-contained human/LLM-pasteable block —
because the value of the fallback is that pasting it into *any* Claude surface just works:

```
Translate this single line of {WORK_TITLE} ({AUTHOR}) into English, matching the style of the
surrounding draft. Line-locked 1:1 (one English line per source line).

Context:
[1041a3] {grc} — {english or (untranslated)}
[1041a4] {grc} — {english or (untranslated)}
[1041a5] {grc} — {english or (untranslated)}

TRANSLATE THIS LINE:
[1041a6] {grc}

[1041a7] {grc} — {english or (untranslated)}
...
```

Reuses `buildAssistPrompt`'s context assembly (one source of truth for what "context" means), just
rendered flat instead of as a system/user split. Plain text (`clipboard-manager:allow-write-text`
is already in the capability). Plain sentence shown: **"Copied this line and its context — paste it
into Claude or another tool."**

### 5b. Unauthenticated / errored CLI

If the CLI is found but returns an auth error (detected via the JSON envelope's `is_error` +
message, or a nonzero exit with a recognizable auth signature), state → `unauth`. **We do NOT show
technical auth text.** We fall through to the clipboard action and show its sentence — the
collaborator sees nothing alarming, and John (who knows he has Claude Code) will recognize that his
auth lapsed and can run `claude` once in a terminal to re-login. (ASK JOHN #3: does John want a
slightly more specific sentence for himself when `unauth` specifically, e.g. "Claude Code needs a
sign-in — copied to clipboard instead"? This is a nicety for him that stays invisible to the
collaborator because the collaborator never reaches this state. I lean yes — one extra sentence,
still non-technical.)

### 5c. Two paths, one interface

`CliProvider` and `ApiProvider` both implement `AssistProvider` (§6). The **selection policy** lives
in one `resolveProvider(settings)` function:

- If `settings.assist.apiKey` is set AND `settings.assist.preferApi` → `ApiProvider`.
- Else if CLI detection succeeds → `CliProvider`.
- Else if `settings.assist.apiKey` is set → `ApiProvider` (API as fallback when CLI missing).
- Else → `ClipboardProvider`.

The API key is off by default, stored in settings (extend `WorkbenchSettings`), entered in a
settings field **clearly labeled "Uses your Anthropic API key — pay-per-use, billed to you"**, per
§12. Never the default; only reached by explicit opt-in. (Security note: the key sits in
`settings.json` in app-data as plaintext, same as every other setting. That matches this app's
existing threat model — single-user desktop, no secrets store — but flag it: ASK JOHN #4, is a
plaintext API key in app-data acceptable, or should we use the OS keychain? I recommend plaintext
for Phase 3 parity with the rest of settings, since the CLI path is the real path and the API path
is the rarely-used "if ever shared" escape hatch.)

---

## 6. Module boundaries

```
workbench/src/lib/assist/
  provider.ts        # AssistProvider interface + AssistResult/AssistContext types (pure)
  prompt.ts          # buildAssistPrompt(ctx) — pure; system/user strings + context assembly
  clipboardPayload.ts# buildClipboardPayload(ctx) — pure; reuses prompt.ts context assembly
  parse.ts           # parseClaudeJson(stdout) → { text } | { error } — pure, defensive
  detect.ts          # resolveClaudeBinary(deps) — path ladder; deps (fs.exists, runShell) injected
  resolveProvider.ts # selection policy over settings (pure given settings + a detect result)
  cliProvider.ts     # CliProvider — thin Tauri adapter: takes injected shell module, calls parse.ts
  apiProvider.ts     # ApiProvider — thin fetch adapter (Anthropic API)
  clipboardProvider.ts# ClipboardProvider — thin clipboard-manager adapter
  fakeProvider.ts    # FakeProvider for tests (canned results / canned errors / delay)
  __tests__/...

workbench/src/components/
  AssistPopover.svelte  # the inline popover (Thinking / suggestion / Insert-Dismiss)
  (Suggest affordance folded into the row gutter component from D1, or a tiny sibling)
```

Editor coupling: **`RowEditor.svelte` gains one public command `insertSuggestion(text: string)`**
(a normal PM transaction). That's the *entire* editor surface assist touches. Assist imports
nothing from `editor/model.ts`, `library/storage.ts`, or `chapterfile.ts`.

### The provider interface (frozen shape)

```ts
export interface AssistContext {
  work: { title: string; author: string; originalLanguage: 'greek' | 'latin'; scheme: string };
  book: { index: number; label: string };
  chapter: number;
  target: { address: string; greek: string };
  before: { address: string; greek: string; english: string | null }[]; // N rows, oldest→newest
  after: { address: string; greek: string; english: string | null }[];
}

export type AssistResult =
  | { kind: 'suggestion'; text: string }
  | { kind: 'clipboard'; message: string }   // provider handled it by copying; UI just shows message
  | { kind: 'error'; message: string };      // message is ALWAYS a plain sentence

export interface AssistProvider {
  readonly id: 'cli' | 'api' | 'clipboard';
  suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult>;
}
```

- **Pure vs Tauri-coupled:** `provider.ts`, `prompt.ts`, `clipboardPayload.ts`, `parse.ts`,
  `resolveProvider.ts`, and the *core* of `detect.ts` (the ladder logic, with `fs.exists`/shell
  injected) are pure and run in node/vitest with **no jsdom, no Tauri** — matching the repo's
  `environment: 'node'` config and the `runPandocTauri(job, shell)` DI precedent. The thin
  `*Provider.ts` adapters are the only Tauri-coupled code, and they're a few lines each around an
  injected shell/fetch/clipboard module.
- **Plain-sentence guarantee is a type-level habit:** every `AssistResult` that isn't a suggestion
  carries a `message` that is, by construction, one of a small set of vetted plain sentences
  (constants in one `messages.ts`). No provider ever puts stderr, an exit code, or an exception
  string into `message`; raw diagnostics go to `console.error` only (ExportButton precedent).

### Testing strategy & acceptance gates

- **FakeProvider** drives every UI test: canned `suggestion`, canned `clipboard`, canned `error`,
  and an artificial delay to exercise the Thinking/cancel path — all in node env.
- **`prompt.ts` / `clipboardPayload.ts`:** golden-string tests over a fixed context, incl. the
  empty-target-row and interleaved-untranslated cases (assert `(untranslated)` rendering, assert
  the target line is never in the "english draft" position, assert Greek is Unicode).
- **`parse.ts`:** feeds real `--output-format json` sample envelopes (success + `is_error` +
  malformed/truncated) → asserts suggestion vs error, and that malformed JSON yields an error
  result, never a throw.
- **`detect.ts`:** injected fake `fs.exists`/shell → asserts the ladder order, the login-shell
  fallback, and the not-found terminus.
- **Isolation gate (D2-style source scan):** a vitest asserting `src/lib/assist/` contains no import
  of `editor/model`, `library/storage`, or `chapterfile` — the structural enforcement of the §4c
  hard constraint.
- **Capability/script parity gate:** a vitest asserting the two script strings the code can emit
  both match the capability regex in `default.json` (import both from a shared constant; ideally
  the capability entry's regex is generated from that constant so they can't drift). This is the
  automated guard against the pandoc-class "scope never covered the real invocation" bug.
- **Packaged smoke test:** the manual Finder-launch procedure in §1e-scope. Not automatable here;
  documented as a release checklist item, same status as Phase 2's "human-exercise the Tauri-only
  paths."

---

## 7. Failure modes → the one plain sentence

Every row: raw diagnostics go to `console.error` only. The user sees exactly the right-hand column.

| Situation | Provider state | What the user sees |
|-----------|----------------|--------------------|
| `claude` not installed anywhere the ladder finds | `not-found` | Runs clipboard fallback → "Copied this line and its context — paste it into Claude or another tool." |
| `claude` found but not signed in / auth expired | `unauth` | Clipboard fallback (+ optional §5b nicety for John: "Claude Code needs a sign-in — copied to clipboard instead.") |
| CLI runs but returns `is_error` / nonzero (non-auth) | `error` | "Couldn't get a suggestion just now — copied this line to the clipboard instead." + clipboard payload copied |
| CLI hangs > 60s | `error` (timeout) | Same as above (child killed, clipboard copied). |
| CLI returns malformed / unexpected JSON | `error` | Same as above. |
| CLI returns empty result | `error` | Same as above. |
| API path: no network | `error` | "Couldn't reach Claude just now — copied this line to the clipboard instead." |
| API path: 401 (bad/expired key) | `error` | "That Anthropic API key didn't work — check it in Settings. Copied this line to the clipboard instead." |
| API path: 429 / overloaded | `error` | "Claude is busy right now — copied this line to the clipboard instead." |
| Clipboard write itself fails (rare) | `error` | "Couldn't copy — try again." |
| Assist invoked on an empty chapter / no Greek on the row | n/a (guard) | "There's no line here to translate yet." (guarded before any provider call.) |
| Assist invoked with caret not in a row | n/a | Button/shortcut simply does nothing (no-op, no message). |
| Two rapid invocations | one-in-flight | Second cancels the first silently; only the latest popover shows. |

Design rule behind the table: **there is no failure that shows a stack trace, a `command not found`,
an exit code, a stderr line, or a path.** The worst case is always "copied to clipboard instead,"
which is a *useful* action, so even total failure leaves the user with something they can act on.

---

## 8. Phasing

**Slice 1 — Fallback-first, ships value with zero CLI dependency.**
The `AssistProvider` interface, `prompt.ts`, `clipboardPayload.ts`, `ClipboardProvider`, the
`AssistPopover` shell, the `⌘⏎`/gutter affordance, and `RowEditor.insertSuggestion`. With no CLI,
Suggest = "copy this line + context." This alone is genuinely useful and de-risks the two hardest
UX pieces (popover + Insert-through-transaction) before any subprocess is involved. Fully testable
in the browser harness with FakeProvider.

**Slice 2 — CLI provider.** `detect.ts` (the GUI-PATH ladder), `cliProvider.ts`, `parse.ts`, the
capability entry, and the packaged Finder smoke test. This is where the real value and the real risk
(scope/PATH) live; isolating it as its own slice means the smoke test has a stable target.

**Slice 3 — API-key path.** `apiProvider.ts`, the settings field (labeled pay-per-use),
`resolveProvider` policy. Lowest priority per §12 ("useful only if ever shared"); trivial once the
interface exists.

**Slice 4 — refinements** (only if John wants them): Regenerate button, multi-line suggest for a
selected row range, "refine my draft" (send the existing English + ask for a polish rather than a
from-scratch translation). Explicitly deferred — flag as future.

Minimal shippable first slice worth John's review: **Slice 1 + Slice 2** together (the clipboard
floor plus the real CLI path), since Slice 1 alone might read as underwhelming to the one user
(John) who actually wants AI assist.

---

## 9. ASK JOHN items (§12 underspecified points)

1. **Affordance visibility.** §12 says "as if the feature isn't there." Do you want (a) a quiet
   hover-only gutter glyph on the focused row + `⌘⏎`, or (b) `⌘⏎`-only with NO visible button at
   all (maximally invisible to the collaborator)? I lean (a).
2. **Draft-privacy opt-out.** Any per-work/per-passage "don't send to AI" toggle wanted, or is the
   single settings-line disclosure enough? I recommend disclosure-only (no per-work toggle) for
   Phase 3.
3. **`unauth`-specific sentence for you.** When the CLI is present but signed out, do you want a
   slightly more specific (still non-technical) sentence than the generic clipboard one, so *you*
   know to re-login? I lean yes.
4. **API key storage.** Plaintext in `settings.json` (parity with all other settings) vs OS
   keychain. I recommend plaintext for Phase 3 given the API path is the rarely-used escape hatch.
5. **Context window N.** ±6 rows of surrounding Greek/English is my default. Want more/less? (More
   = better voice-matching but larger prompts and more draft sent.)
6. **Latent pandoc PATH bug.** The existing pandoc scope uses bare `cmd: "pandoc"`, which likely
   also fails on a Finder-launched packaged build (Homebrew paths aren't on launchd's PATH). Worth
   confirming/fixing under the same GUI-PATH work — the packaged export may never have been run
   from a real Finder launch. Not strictly §12, but the same root cause.
7. **Model / cost control on the CLI path.** `claude -p` uses whatever default model the user's
   Claude Code config selects. Do you want the app to pin a model (e.g. a fast one for
   line-suggestions) via `--model`, or inherit the user's default? I lean inherit (simplest,
   respects their config); pinning is a one-arg add if wanted.

---

## 10. One-paragraph rationale for the orchestrator

The whole design hangs on three load-bearing choices, each chosen to obey a constraint that has
already bitten this project once: (1) resolve `claude` to an **absolute path** and invoke via a
**fixed-string login-shell script with the prompt on stdin**, because the pandoc-scope postmortem
proved that a bare-command shell scope fails silently only in the packaged app and only from a real
Finder launch — so the design comes with an explicit packaged smoke test and an automated
script↔scope parity gate; (2) an **always-present, never-greyed** affordance that quietly degrades
to a *useful* clipboard action, because §12's "as if the feature isn't there" is violated by any
disabled control or setup nag; and (3) accepted suggestions enter the cell through **one public
`insertSuggestion` command → normal PM transaction → app undo stack → commit-on-idle**, with
`src/lib/assist/` structurally forbidden (source-scan tested) from importing the model or storage —
so the AI layer can never write chapter files or the ChapterModel, exactly as the hard constraint
requires. Everything else (one-shot JSON invocation, one-in-flight concurrency, the fake-provider
test strategy, the API-key escape hatch) follows from keeping the module pure and dependency-injected
so it's testable in the repo's node/no-jsdom vitest env.
