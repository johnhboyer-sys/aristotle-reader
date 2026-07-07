# D7 — AI-assist: any AI the user has (multi-provider) — DECISION

Status: **decided 2026-07-03** by orchestrator, extending `d4-ai-assist.md`.
John's directive: "let users use any AI they have with their own subscription."
Solo design (an extension of the already-dual-dispatched d4 architecture, not
net-new); the one security-relevant widening is §B and is flagged for John.

## John's scope decisions (2026-07-03)

- **Built-in CLIs, auto-detected**: Claude Code, Codex (OpenAI), Gemini — each
  drawing on the user's own subscription. Zero-config.
- **Custom command**: a settings field to point at any other CLI.
- **API keys** (OpenAI / Anthropic / Google): INCLUDED — it costs the app
  nothing (no backend; the user's key, direct calls, billed to them). Off by
  default, clearly labeled pay-per-use.
- **Selection**: a settings picker listing detected tools; default = first
  detected (Claude Code preferred if present). ⌘⏎ uses the chosen provider.
- Clipboard fallback and the §12 invisibility principle are UNCHANGED.

## Architecture (extends d4; the `AssistProvider` interface is already generic)

The pure prompt/context layer, the popover, and `RowEditor.insertSuggestion`
do not change. What generalizes: detection, the CLI provider, output parsing,
provider selection, the Rust exec command, settings, and a new settings panel.

### Provider registry — `src/lib/assist/tools.ts` (Slice A, pure)

```ts
export type CliToolId = 'claude' | 'codex' | 'gemini' | 'custom';
export interface CliToolSpec {
  id: CliToolId;
  label: string;                          // "Claude Code" / "Codex (OpenAI)" / "Gemini" / "Custom"
  binName: string;                        // 'claude' | 'codex' | 'gemini' — the bare name for the `command -v` rung
  candidatePaths(home: string): string[]; // per-tool absolute ladder
  args: string[];                         // fixed print/non-interactive flags
  promptVia: 'stdin' | 'arg';             // how the prompt reaches the tool
  parseOutput(stdout: string): ParseResult;
}
```

Built-in specs (Claude is the known-good one; Codex/Gemini flags are
**best-effort** — the agent verifies against `--help` where the tool is
installed and flags any uncertainty. The custom-command field is the reliable
fallback for any tool whose flags differ):
- **claude**: `["-p","--output-format","json"]`, promptVia `stdin`, parse the
  JSON envelope's `result` (the existing `parseClaudeJson`). Ladder =
  the current claude ladder.
- **codex**: OpenAI CLI non-interactive `exec` mode; parse plain stdout (or its
  JSON if `--json` is confirmed). Ladder = `~/.codex`, homebrew, /usr/local.
- **gemini**: Google Gemini CLI non-interactive mode; parse plain stdout.
- **custom**: user-supplied `binPath` + `args` + `promptVia`; parse = plain
  stdout (trim).

Prompt delivery both ways is injection-safe because the Rust side runs via
`Command`/execve — **no shell parses argv** — so a prompt as a positional arg
is as safe as stdin (the d4 "stdin only" rule was belt-and-suspenders against
shell quoting, which no longer applies to a no-shell exec). `promptVia` exists
only because some CLIs read the prompt from a positional arg, not stdin.

### Generalized pure layer (Slice A)
- `detect.ts` → `resolveToolBinary(spec, deps)`: the same ladder logic, per
  tool (candidatePaths + the injected `command -v <binName>` rung).
- `parse.ts` → keep `parseClaudeJson`; add `parsePlainText` (trim, empty →
  error, auth-sniff via the existing `AUTH_HINTS`). Each spec picks its parser.
- `cliProvider.ts` → `CliProvider` takes a resolved `{ binPath, args, stdin,
  parseOutput }` and invokes the generalized Rust command; maps unauth/timeout/
  error to the vetted sentences.
- `resolveProvider.ts` → choose per `settings.assist.provider` + detection;
  unknown/undetected → clipboard.
- API providers: `apiProvider.ts` (Slice D) behind the same `AssistProvider`.

### Rust exec command — the FIXED contract (Slice B)

```
invoke('assist_run', { binPath: string, args: string[], stdin: string | null, timeoutMs: number })
  => { ok: true; text: string } | { ok: false; kind: 'unauth' | 'timeout' | 'error' }

invoke('assist_which', { candidates: string[], binName: string | null })
  => string | null
```

- `assist_run`: validate `binPath` is an ABSOLUTE EXECUTABLE; run it with
  `args` via `Command` (execve, no shell); write `stdin` if present (helper
  thread, no deadlock); enforce `timeoutMs` with a kill; **redact stderr to the
  Rust log only**; sniff stderr+stdout for the auth signatures → `unauth`;
  return raw stdout as `text`. This is the existing `assist_suggest` internals,
  minus the hardcoded `["-p","--output-format","json"]` argv.
- `assist_which`: check each `candidates` path (absolute executable); then, if
  `binName` is provided AND matches `^[A-Za-z0-9_-]+$` (the one
  security-critical validation — it's interpolated into the login-shell
  `command -v` string), run `/bin/zsh -lc "command -v <binName>"`, 5s timeout,
  return the resolved absolute path if it exists. Reject any binName with a
  shell metacharacter (return null, never run the shell).
- Keep `assist_resolve_claude`/`assist_suggest` as thin deprecated shims or
  remove + update callers — the agent picks whichever keeps the suite green
  with least churn (prefer removing and updating the two call sites).

**Security boundary (flagged for John):** `assist_run` will run any absolute
executable the frontend names, with any args. In a Tauri app the frontend is
our own bundled, non-remote code; the binaries actually invoked come from the
fixed tool registry + the user's explicit custom-command config (== the same
trust as the user running that tool in their terminal, which is the feature).
The prompt is data (stdin or a single argv element under execve), never shell
syntax. This is a small, documented widening of an app-owned command that
already ran `claude`; the capability comment records it.

### API-key providers — `src/lib/assist/apiProvider.ts` (Slice D)
- OpenAI (`/v1/chat/completions`), Anthropic (`/v1/messages`), Google
  (`generateContent`) behind one `ApiProvider` with an injected `fetch`
  (testable). system+user from `buildAssistPrompt`; response text extracted
  defensively (any non-2xx / bad shape → the vetted error sentence; 401 →
  the "key didn't work" sentence).
- `tauri.conf.json` CSP `connect-src` gains the three API hosts (the app is
  otherwise offline; this is the only outbound surface). Off by default.
- Keys stored in `settings.assist.apiKeys` (plaintext, consistent with the
  app's existing settings threat model — same as every other setting; flagged).

### Settings (Slice C) — `AssistSettings` grows, back-compatible

```ts
interface AssistSettings {
  provider?: 'claude'|'codex'|'gemini'|'custom'|'openai'|'anthropic'|'google';
  cliPaths?: Partial<Record<'claude'|'codex'|'gemini', string>>;  // cached resolved paths
  custom?: { binPath?: string; args?: string[]; promptVia?: 'stdin'|'arg' };
  apiKeys?: { openai?: string; anthropic?: string; google?: string };
  models?: Partial<Record<string, string>>;  // optional per-provider model override
  includeDraft?: boolean;   // unchanged
}
```

**Migration**: sanitize reads the OLD `{ cliPath, cliState, checkedAt }` shape
and maps `cliPath` → `cliPaths.claude`, defaulting `provider` to `'claude'`
when an old cliPath was present. Old settings.json loads unchanged; a
round-trip test asserts it.

### Settings UI — `src/components/AssistSettings.svelte` (Slice C)
Reached from the existing settings surface (the gear / LibrarySettingsDialog
pattern). Shows: detected tools (a "Detect" action running `assist_which` per
built-in spec), a provider picker, a custom-command form (path + args +
stdin/arg), and API-key fields each labeled "pay-per-use — billed to your key,"
off by default. The §12 invisibility principle holds: someone who never opens
this and has no CLI still gets the silent clipboard fallback.

## Slices & acceptance
- **A** (pure TS) + **B** (Rust) in parallel against the fixed contract above.
- **C** (settings migration + UI + assistController wiring) after A+B; browser-
  verified end to end with the dev FakeProvider AND a real detected CLI path.
- **D** (API providers + CSP) after C.
- Gates each slice: full vitest green, tsc/svelte-check clean, cargo check +
  cargo test (B), and the isolation source-scan still passes (assist never
  imports editor/model, library/storage, chapterfile). Browser-verify real
  content, not just counts. Nothing commits until John reviews a summary.

## ASK JOHN (non-blocking; sensible defaults chosen)
1. Confirm the §B exec-surface widening is acceptable (or ask for a dual-
   dispatch second opinion on the Rust change).
2. Codex/Gemini exact print-mode flags are best-effort until hand-tested with
   his real installs — the custom-command field covers any mismatch.
3. Plaintext API keys in settings.json (parity with all other settings) vs. OS
   keychain — recommend plaintext for now (the keychain is a later hardening).
