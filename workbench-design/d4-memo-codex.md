# D4 Memo — Phase 3 AI Assist

| Topic | Decision |
|---|---|
| Invocation | Use a Rust Tauri command that shells out to Claude Code's local `claude` CLI in print mode; do not call `@tauri-apps/plugin-shell` directly from Svelte. |
| Binary discovery | Resolve `claude` lazily from a saved explicit path, `$HOME/.claude/local/claude`, bundled GUI-safe search paths, then `PATH`; never rely only on a login shell profile. |
| Detection | Probe only when the user opens or invokes AI assist; no startup probe, no disabled toolbar button, no onboarding prompt. |
| Output | Request `--output-format json` and parse a strict suggestion payload; fall back to plain text only if the installed CLI lacks JSON output. |
| UX | A small row action opens a right-side suggestion panel; accepting dispatches an editor transaction into the active English cell, preserving undo and dirty tracking. |
| Privacy | Default prompt includes the Greek row and context, not the user's unpublished English draft; draft inclusion is an explicit per-request checkbox. |
| Fallback | Missing CLI becomes a clipboard action with the same prompt payload; auth/runtime failures show one plain sentence. |
| API key | Optional Anthropic API-key provider lives behind the same provider interface, off by default and labeled pay-per-use. |
| Tests | Pure prompt, detection-state, provider, and reducer logic are unit-tested under Node; Tauri/Rust is smoke-tested in the packaged app. |

## 1. Invocation Architecture

**Decision**

Invoke Claude through a Rust command, tentatively `assist_suggest_translation`, that uses `std::process::Command`/Tokio process to run the local `claude` binary in print mode. The primary invocation is:

```sh
claude -p --output-format json "<prompt>"
```

If the installed CLI rejects `--output-format json`, retry once with plain `claude -p "<prompt>"` and wrap stdout as the suggestion text. The frontend never interpolates a shell string; it passes structured request data to Rust, and Rust passes argv as an array.

Binary discovery is lazy and GUI-safe:

1. user-saved `settings.assistClaudePath`, if present;
2. `$HOME/.claude/local/claude`;
3. `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `/usr/bin/claude`;
4. `claude` resolved through the process environment `PATH` as a last resort.

The command is one-shot rather than streaming for the first slice. Enforce a 45 second timeout for suggestion generation and a 5 second timeout for probes. Allow one in-flight suggestion at a time per app window; a second request replaces/cancels the first if the user moves rows. Use a monotonically increasing request id so stale responses cannot update the panel.

**Rationale**

Build spec §12 names the local Claude Code CLI in headless/print mode as the primary path. A Rust command is still a shell-out to that CLI, but it is better suited than direct `plugin-shell` for this feature because the app must find a binary that often lives at `~/.claude/local/claude`, while a macOS GUI app does not inherit the user's shell-profile `PATH`. Rust can expand `$HOME`, check executability, race output against a timeout, kill the child, and centralize stderr redaction before Svelte sees anything.

This follows the Phase 2 lesson in `TODO.md`: Pandoc was originally missing from `shell:allow-execute` and would have failed only in a packaged app. By moving Claude execution to an app-owned command, the capability surface is explicit and not scattered through UI components. It also keeps the same user-facing failure style as `ExportButton.svelte`: stderr goes to the console/log, while the UI shows one plain English sentence.

The one-shot response is sufficient for "suggest a translation for this line" and avoids partial-output UI states in a row-locked editor used for sustained work. Streaming can be added later if John wants visible generation.

Capability and smoke-test requirements:

- Add explicit Tauri capability permission for the custom assist command, e.g. an app permission entry equivalent to `assist:allow-suggest-translation` and `assist:allow-probe-claude`, depending on the generated command permission naming used by the Tauri 2 setup.
- Do not add broad `shell:allow-execute` for arbitrary commands. If implementation instead uses `plugin-shell`, add named entries for both `claude` and the absolute local path strategy, with fixed allowed args for `--version`, `-p`, and `--output-format json`; then package-test both paths.
- Smoke-test in `npx tauri dev` and a real `tauri build` artifact: temporarily remove `PATH` access, leave `~/.claude/local/claude` present, invoke a row suggestion, confirm the command succeeds; then rename the binary and confirm the feature falls back to clipboard without a stack trace.

**Rejected alternatives**

- Direct `@tauri-apps/plugin-shell` from Svelte: matches `ExportButton.svelte` superficially, but repeats the packaged-app capability risk and does not solve GUI PATH discovery cleanly.
- Spawn a login shell such as `zsh -lc "claude ..."`: would pick up profile PATH, but it expands the injection and quoting surface for unpublished text.
- Streaming first: attractive feedback, but it adds cancellation, partial parsing, and panel state complexity before the basic workflow is proven.
- API-first: contradicts §12's subscription-based local CLI primary path and would surprise users with billing.

## 2. Detection And The Invisibility Principle

**Decision**

Detection is lazy and cheap. The app does not probe for Claude at startup. The row action is visible only after the user has opted into AI assist in settings or after a successful lazy probe in the current session. For a user without Claude Code, the normal editor chrome has no greyed-out AI affordance.

When the user explicitly opens the assist command surface, run a probe:

```sh
claude -p --output-format json "Reply with exactly: ok"
```

If that exits 0 and returns parseable output or an `ok` plain-text fallback, mark the provider as available for the session. Cache failures only for a short period, e.g. five minutes, so installing or logging in later does not require a restart.

**Rationale**

The top design principle in `build-spec.md` says setup-dependent features must degrade invisibly for the non-technical collaborator: no blocking dialogs, no technical error text, and no confusing half-feature. §12 repeats that AI assist is for John, not the collaborator, and should be unremarkable for someone without Claude Code. Lazy probing also avoids adding app-launch latency or network/auth noise to the normal "open chapter, translate, close it" path.

The probe tests both presence and authentication because `claude --version` alone proves only installation. It is still cheap because it runs only after explicit interest in the feature.

**Rejected alternatives**

- Startup probe: violates the invisibility principle and risks slow launch or surprise auth errors.
- Permanent disabled toolbar button: calls attention to a feature the collaborator should not need to understand.
- Version-only detection: would misclassify an installed but unauthenticated CLI as available.

## 3. Prompt Content

**Decision**

The prompt builder lives in pure TypeScript and takes a structured `AssistLineContext`: work metadata, citation span, current row, nearby rows, optional user draft, and style settings. It includes the current Greek row, two preceding and two following Greek rows by default, work/book/chapter plus the scheme-formatted citation, and concise style guidance. The user's own unpublished English draft is excluded by default and included only when `includeDraft: true`.

The prompt uses `CitationScheme.formatCitation` for displayed location and treats `Address.raw` as opaque outside `src/lib/citation/`, per `d2-citation-schemes.md`.

```text
You are assisting a professional classicist translating Aristotle for a polished English manuscript.

Task: suggest one English translation for the target Greek Bekker line.

Work: {{workTitle}}
Author: {{author}}
Location: {{formattedCitation}}
Book: {{bookLabel}}
Chapter: {{chapter}}
Target address: {{targetAddressRaw}}

Style requirements:
- Translate the target line only.
- Preserve a strict one-row correspondence: do not merge this line with neighboring lines.
- Use clear literary English suitable for a scholarly translation.
- Prefer accuracy over paraphrase.
- Preserve important Aristotelian technical terms consistently when possible.
- Do not add commentary, footnotes, alternatives, markdown, or quotation marks.
- If the Greek is syntactically incomplete because the sentence spans rows, produce the best line-level continuation in context.

Context Greek before:
{{previousGreekRows}}

Target Greek:
{{targetGreek}}

Context Greek after:
{{nextGreekRows}}

{{#if includeDraft}}
The translator's current unpublished English draft for this same row is included for style continuity. Do not merely polish it; use it only as context.

Current draft:
{{draftEnglishPlainText}}
{{/if}}

Return JSON only:
{
  "suggestion": "one English translation of the target row",
  "confidence": "low|medium|high"
}
```

**Rationale**

D1 says one row equals one Bekker line and row count is owned by the Greek spine, so the prompt must ask for one row only and forbid merging. `ChapterModel` has `rows[{ address, greek, english }]`, which supplies exact row context without alignment guesswork. D2 says general code must not parse addresses, so prompt display goes through the citation scheme and only passes raw address text as an opaque label. The privacy default matters because the draft is unpublished user work; including it should be visible and intentional.

**Rejected alternatives**

- Include the whole chapter: slower, costlier for API fallback, and more likely to invite cross-row rewriting.
- Always include the user's English draft: useful for style, but wrong as a privacy default.
- Ask for multiple alternatives: increases UI complexity and makes accept/reject slower for a line-by-line tool.

## 4. UX

**Decision**

The action lives at the row level as a subtle icon shown on hover/focus in the English cell gutter area, plus an optional command in the editor toolbar only when assist is enabled/available. Invoking it opens a right-side suggestion panel, not an inline ghost and not a popover. The panel shows the citation, target Greek, suggestion text, a retry button, a copy button, and an Accept button.

Accept inserts/replaces content only by dispatching a normal ProseMirror transaction into the relevant row editor. The AI layer never writes chapter files, never mutates `ChapterModel.rows`, and never calls autosave directly. If the row editor is not mounted in a future mount-on-focus implementation, the accept flow first focuses/hydrates that row, then dispatches the transaction. The transaction participates in the existing app-level history and reaches `ChapterModel` through `dispatchFor(...)`, `history.push(...)`, `commitRowNow(...)`, and autosave.

**Rationale**

D1 and `ChapterEditor.svelte` make `ChapterModel` the single source of truth, with editors committing into it on blur/idle and app-level undo built from editor transactions. Bypassing that path would break undo, dirty tracking, round-trip assertions, and autosave. A side panel matches the existing footnote/reference-panel direction in the build spec: long text stays readable without covering the row being translated. Inline ghosts are common in code editors, but here the user is editing dense prose with one TipTap instance per row; ghost text risks visual confusion with real unpublished text.

**Rejected alternatives**

- Inline ghost text: too easy to mistake for committed translation in a dense row-locked document.
- Popover: cramped for Greek context, suggestion text, errors, and fallback controls.
- Directly write into `ChapterModel` or chapter files: violates D1's commit path and would bypass undo/dirty tracking.

## 5. Fallback Ladder

**Decision**

All providers implement one interface:

```ts
interface TranslationAssistProvider {
  probe(): Promise<AssistProbeResult>;
  suggest(req: AssistRequest): Promise<AssistSuggestionResult>;
}
```

Provider order is:

1. Claude CLI provider, primary.
2. Anthropic API-key provider, off by default and labeled "pay-per-use".
3. Clipboard fallback.

If the CLI is missing, the row action becomes "Copy prompt for Claude" only in the explicit assist surface. The clipboard payload is the same prompt template from section 3, with the current row/context filled in, preceded by one plain instruction line: "Paste this into Claude to ask for a translation suggestion." If the clipboard write succeeds, show "The translation prompt was copied to the clipboard." If it fails, show "The prompt could not be copied."

Unauthenticated CLI shows: "Claude is installed, but it is not signed in." Runtime/timeout errors show one sentence from the failure table, while details go to the console/Rust log.

Settings additions follow the small persisted settings precedent in `src/lib/settings.ts`: optional fields only, sanitized on load, quiet fallback to defaults on settings read/write failure.

Suggested additions:

```ts
assistEnabled?: boolean;
assistProvider?: 'claude-cli' | 'anthropic-api';
assistClaudePath?: string;
assistIncludeDraftDefault?: boolean;
anthropicApiKeyStored?: boolean;
```

The API key itself should be stored in the OS keychain if Tauri plugin support is added; if not, defer the API provider rather than writing a raw key into `settings.json`.

**Rationale**

§12 explicitly requires a clipboard fallback when the CLI is missing or unauthenticated and an API-key alternative that is not the default. One provider interface prevents the UI from knowing whether the response came from Claude CLI, Anthropic API, a fake test provider, or clipboard fallback. `settings.ts` already demonstrates the app's settings style: tiny, optional, and quietly defaulting on errors.

**Rejected alternatives**

- Show install/login instructions by default: violates the invisibility principle for the collaborator.
- Store API keys directly in app-data JSON: inconsistent with the sensitivity of pay-per-use credentials.
- Separate UI flows per provider: duplicates failure handling and makes testing harder.

## 6. Module Boundaries

**Decision**

Add assist code under `workbench/src/lib/assist/` and keep pure logic separate from Tauri/Rust coupling:

```text
workbench/src/lib/assist/
  types.ts                 # AssistRequest, AssistSuggestion, provider interfaces
  prompt.ts                # pure prompt builder
  context.ts               # pure row/context selection from ChapterModel snapshots
  provider.ts              # provider selection and fallback ladder
  fakeProvider.ts          # deterministic tests/dev harness
  claudeCliProvider.ts     # Tauri invoke adapter, no prompt construction
  apiProvider.ts           # optional Anthropic provider adapter
  errors.ts                # error taxonomy -> one sentence
  __tests__/
    prompt.test.ts
    provider.test.ts
    errors.test.ts
```

UI additions:

```text
workbench/src/components/AssistPanel.svelte
workbench/src/components/AssistSettings.svelte
```

Editor bridge additions:

```text
workbench/src/lib/editor/session.svelte.ts  # add assist command proxy
workbench/src/lib/editor/ChapterEditor.svelte # exposes requestAssist/acceptAssist through normal editor transaction path
```

Rust additions:

```text
workbench/src-tauri/src/assist.rs
workbench/src-tauri/src/main.rs             # register assist commands
```

Acceptance gates:

- Prompt builder has stable snapshot/table tests under Node.
- Error mapper tests assert every provider failure maps to exactly one approved sentence.
- Fake provider test proves Accept dispatches through editor command plumbing rather than mutating a model snapshot.
- Packaged-app smoke test verifies `~/.claude/local/claude` discovery without shell-profile PATH.
- Packaged-app smoke test verifies missing CLI copies the prompt and shows no stack trace.

**Rationale**

`vitest.config.ts` uses `environment: 'node'` and no jsdom, so new logic must be pure or dependency-injected to be testable. The existing `pandoc.ts` split is a good precedent: command construction is pure data, while Tauri execution is an adapter. D1's `EnglishCell -> RowEditor` boundary and session bridge make it possible to add an editor command without restructuring the editor.

**Rejected alternatives**

- Put prompt building in Svelte components: hard to unit-test and likely to drift from provider behavior.
- Put provider choice in Rust: would make API fallback and fake-provider tests harder in the current Node test setup.
- Let the provider return ready-to-insert ProseMirror JSON: over-couples AI output to editor schema and complicates privacy/error tests.

## 7. Failure Modes

**Decision**

Every degraded state maps to one plain English sentence. Stack traces, stderr, JSON parse errors, and command names are logged only for debugging.

| Degradation | Plain sentence |
|---|---|
| CLI not found | Claude is not set up on this computer. |
| CLI found but not executable | Claude is not available from this app. |
| CLI unauthenticated | Claude is installed, but it is not signed in. |
| Probe timeout | Claude did not respond in time. |
| Suggestion timeout | Claude took too long to suggest a translation. |
| CLI nonzero exit | Claude could not suggest a translation for this line. |
| CLI output not parseable | Claude returned a response the app could not read. |
| Empty suggestion | Claude did not return a translation suggestion. |
| Request canceled by row change | The previous suggestion was canceled. |
| No active row | Click into a row first. |
| No Greek row text | There is no Greek text for this row. |
| Clipboard fallback copied | The translation prompt was copied to the clipboard. |
| Clipboard fallback failed | The prompt could not be copied. |
| API key missing | Add an Anthropic API key in settings to use pay-per-use AI assist. |
| API auth failed | The Anthropic API key was not accepted. |
| API rate limited | The pay-per-use AI service is busy; try again later. |
| Network unavailable | The pay-per-use AI service could not be reached. |
| Settings read/write failed | AI assist settings could not be saved. |
| Accept failed because row changed/unmounted | The suggestion could not be inserted into this row. |

**Rationale**

This is a direct application of the build spec's top design principle and the existing `ExportButton.svelte` pattern: user-facing messages are plain, while details go to the console. A fixed error taxonomy is also testable under Node.

**Rejected alternatives**

- Surface stderr from `claude`: would expose technical output and possibly unpublished prompt text.
- One generic "AI failed" message for all errors: simpler, but it gives John no useful distinction between missing setup, auth, timeout, and retryable runtime failure.
- Modal error dialogs: too disruptive for an optional assist feature.

## 8. Phasing

**Decision**

Minimal first slice:

1. Pure prompt/context/error modules plus tests.
2. Fake provider and `AssistPanel.svelte` wired to one focused row.
3. Accept flow dispatching a transaction into the row editor and proving undo/dirty tracking still work.
4. Rust Claude CLI provider with lazy probe, `$HOME/.claude/local/claude` discovery, one-shot JSON output, timeout, and one-request concurrency.
5. Clipboard fallback for missing CLI.
6. Packaged-app capability/discovery smoke test.

Increments after that:

1. Add explicit settings UI for `assistEnabled`, CLI path override, and include-draft default.
2. Add API-key provider if secure keychain storage is available.
3. Add streaming only if one-shot latency feels bad in real use.
4. Add richer style profiles per work/translator after John evaluates first suggestions.
5. Reuse the same panel slot for the Phase 3 reference-translation panel only if the interaction remains uncluttered.

**Rationale**

The first slice proves the highest-risk boundaries: editor insertion through normal transactions, GUI-safe CLI invocation, invisible degradation, and packaged-app behavior. It avoids reopening confirmed Phase 2 decisions in `TODO.md` and avoids touching the frozen citation contract from D2 except through its public formatting functions.

**Rejected alternatives**

- Start with settings/API support: lower risk than the editor and CLI boundaries, and not the default path in §12.
- Build streaming before one-shot: extra UI state before real latency is measured.
- Build multi-suggestion history: not needed for the initial "suggest this line" workflow.

## ASK JOHN

- Should AI assist be explicitly enabled in settings for John, or should the first successful lazy probe reveal the row action for that session?
- How many context rows should be sent by default: two before/after, sentence-boundary-aware context, or a larger window?
- Should the current English draft ever be included by default on John's machine, or should it always be a per-request checkbox?
- Are there house style rules or preferred renderings for recurring Aristotelian terms that should be added to the prompt from day one?
- Should accepting a suggestion replace an empty row only, or also replace a non-empty row after confirmation?
- Does John want suggestion text saved nowhere after insertion/rejection, or should there be an ephemeral per-session suggestion history?
- Which exact Aquinas/Latin conventions, if any, should the prompt anticipate once Phase 3 Latin support lands?
