# D4 — AI-assist (build spec §12) — SYNTHESIZED DECISION

Status: **synthesized 2026-07-03** by orchestrator from two independent design memos
(deep-reasoner: `d4-memo-deep-reasoner.md`; Codex: `d4-memo-codex.md`), per the
high-stakes dual-dispatch protocol. Canonical spec for implementers once John signs
off on the open ASK JOHN items (§6). Deviations require orchestrator sign-off.

## Convergences (both memos independently — treat as settled)

- **Primary path**: shell out to the user's local `claude` CLI in print mode,
  `claude -p --output-format json`, **one-shot** (no streaming in any early slice).
- **GUI-PATH is the load-bearing problem**: a Finder-launched .app inherits launchd's
  minimal PATH; `claude` usually lives at `~/.claude/local/claude`. Resolve an
  **absolute binary path** via a candidate ladder (settings override →
  `~/.claude/local/claude` → `~/.local/bin` → `/opt/homebrew/bin` → `/usr/local/bin`),
  cache it in settings, never trust bare names.
- **Detection is lazy, first-use only.** No startup probe. No greyed-out control,
  no badge, no onboarding nag — §12's invisibility principle read the same way by both.
- **One in-flight request**; a new request cancels the prior; app-side timeout with
  child kill; stale responses can never update the UI.
- **Hard constraint honored identically**: an accepted suggestion enters the English
  cell ONLY through a normal ProseMirror transaction on the row editor (one public
  `insertSuggestion(text)` command) → app undo stack → dirty tracking → commit-on-idle.
  `src/lib/assist/` never imports `editor/model`, `library/storage`, or `chapterfile`
  — enforced by a D2-style source-scan vitest.
- **One provider interface** (`AssistProvider`: cli | api | clipboard), fallback ladder
  CLI → API-key (off by default, labeled pay-per-use) → clipboard. The clipboard floor
  copies the same prompt payload as a paste-ready block — useful, never broken-looking.
- **Every degradation = one vetted plain sentence** from a fixed `messages.ts`
  taxonomy; stderr/exit codes/paths go to console only (ExportButton precedent).
- **Module split**: pure logic (`prompt.ts`, `parse.ts`, `resolveProvider.ts`,
  detection ladder core, clipboard payload) tested under node/no-jsdom; thin
  DI'd adapters for Tauri/fetch/clipboard; `FakeProvider` drives all UI tests.
- **Packaged Finder-launch smoke test is mandatory** (the pandoc-scope lesson):
  build → launch from Finder (NOT `open` from a terminal) → suggest with CLI present,
  then with CLI renamed → expect suggestion, then clipboard fallback, no leaked errors.

## Divergences — adjudicated

| # | Question | deep-reasoner | Codex | DECISION |
|---|----------|---------------|-------|----------|
| A | Invocation host | plugin-shell via `/bin/zsh -lc <fixed script>`, `CLAUDE_BIN` in env, prompt on stdin | Rust `#[tauri::command]`, argv array, no shell at all | **Rust command** (`src-tauri/src/assist.rs`). No shell ever parses anything: argv is an array, the prompt goes over **stdin** (both memos' "user text never becomes shell syntax" principle, satisfied more strongly). Rust owns $HOME expansion, executability checks, timeout + kill, and stderr redaction before the frontend sees bytes. Capability = one narrow app permission (`assist:allow-suggest`, `assist:allow-resolve`), not a login-shell execute grant whose safety hangs on a validator regex. The login shell survives ONLY as the last discovery rung: fixed constant argv `["/bin/zsh","-lc","command -v claude"]`, no user data near it. deep-reasoner's testability concern is met by injecting the `invoke` function into the frontend adapter (same DI shape as `runPandocTauri(job, shell)`). |
| B | Suggestion UI | Inline popover anchored under the focused row | Right side panel | **Inline popover** (Thinking… / suggestion / Insert / Dismiss). The right rail is already contended: D5 just claimed it for the reference panel, mutually exclusive with footnotes — a third occupant guts both designs. A Bekker line's suggestion is ~one sentence; proximity to the row beats panel real estate. Both memos rejected ghost text for the same reasons (Tab is taken by rowKeymap; provisional text must never risk a commit-on-idle leak) — that stays rejected. |
| C | Send John's draft English as context | Yes by default (surrounding rows only, never the target) — "the single biggest quality lever"; one disclosure line in settings | No by default; per-request checkbox | **ASK JOHN (§6.2) — recommend deep-reasoner's default-include.** The CLI path runs under John's own subscription auth on his own machine — the same trust boundary as running Claude Code on the repo. Voice/terminology matching is the entire point of context; a per-request checkbox on a per-line action is friction where §12 wants unremarkable. If John prefers caution, Codex's checkbox is the fallback shape. |
| D | Detection probe | Resolve binary only; let the first real request surface auth state from its error envelope | Dedicated `claude -p "Reply with exactly: ok"` probe on first use | **No dedicated probe.** Binary resolution (fs checks) is the only pre-flight; the first real suggestion doubles as the auth test — its failure path already exists and costs nothing extra. Codex's probe spends a real model call to learn what the real call would tell us anyway. Cache `cliPath` + last state in settings; re-detect only on explicit retry or when the cached path stops existing. |
| E | Model output contract | Take the `result` text from the CLI's JSON envelope | Ask the model to emit nested JSON `{suggestion, confidence}` | **Envelope text only.** Nested model-emitted JSON adds a parse failure mode and `confidence` has no consumer. The prompt instructs "output ONLY the English for the target line"; `parse.ts` defensively extracts the envelope's result field (malformed → plain sentence, never a throw). |
| F | API key storage | Plaintext in settings.json (parity with app threat model) | Keychain, or defer the API provider | **Defer the API provider to the last slice** (both memos rank it last; §12 calls it an escape hatch). Storage decision is deferred with it — ASK JOHN only when/if it's built. |

## Prompt (settled shape, both memos near-identical)

`buildAssistPrompt(ctx)` — pure, golden-string tested. System: professional-classicist
framing, row-locked 1:1 line discipline, match register/terminology of surrounding
draft, output ONLY the target line's English, no quotes/commentary/Greek. User: work/
book/chapter + scheme-formatted citation; ±N surrounding rows as `[address] greek —
english-draft-or-(untranslated)`; target line bracketed with `>>>`. Addresses are
opaque raw strings displayed via the scheme — assist never parses them (D2). N default
**±6** (deep-reasoner; Aristotle's periods run long) — confirm in §6.3. The clipboard
payload reuses the same context assembly rendered flat, headed by one instruction line.

## Modules

```
workbench/src/lib/assist/
  provider.ts / prompt.ts / clipboardPayload.ts / parse.ts / messages.ts   # pure
  detect.ts (ladder core, fs+invoke injected) / resolveProvider.ts         # pure
  cliProvider.ts / apiProvider.ts(later) / clipboardProvider.ts            # thin adapters
  fakeProvider.ts + __tests__/
workbench/src/components/AssistPopover.svelte
workbench/src-tauri/src/assist.rs            # resolve + suggest commands (argv array,
                                             # stdin prompt, timeout+kill, redaction)
RowEditor.svelte: + insertSuggestion(text)   # the ONLY editor surface assist touches
```

Settings: `assist { cliPath?, cliState?, checkedAt? }` (+ API fields only in the last
slice), sanitized/merged per the `libraryRoot` precedent.

## Failure modes

Union of both memos' tables, one plain sentence each, vetted constants in
`messages.ts`; the worst case is always the useful clipboard action ("Copied this
line and its context — paste it into Claude or another tool."). Auth-lapse nicety
for John pending §6.4. Full tables: memos §7.

## Phasing

1. **Slice 1 — clipboard-first**: interface + prompt + payload + popover +
   `insertSuggestion` + FakeProvider tests. Ships value with zero CLI; de-risks the
   two hardest UX pieces. Browser-harness verifiable end to end.
2. **Slice 2 — CLI provider**: `assist.rs`, resolution ladder, capability entry,
   parse, **packaged Finder smoke test**. (Slice 1+2 together = the John-reviewable
   minimum.)
3. **Slice 3 — API-key path** (deferred until wanted; storage decided then).
4. **Slice 4 — refinements** (regenerate, refine-my-draft, range suggest) — only on
   John's ask.

## Rider: fix the latent pandoc GUI-PATH bug (same root cause)

Both memos flag it: `runPandocTauri` uses bare `cmd: "pandoc"`, which fails on a real
Finder launch (Homebrew paths aren't on launchd's PATH) — the Phase 2 capability fix
solved scope, not resolution. Fix alongside Slice 2 with the same resolution ladder
(settings override → `/opt/homebrew/bin/pandoc` → `/usr/local/bin/pandoc` → bare name
as last resort), and add pandoc to the packaged Finder smoke checklist.

## §6 ASK JOHN (blocking items before implementation)

1. **Affordance visibility**: (a) quiet hover-only glyph on the focused row's gutter
   + ⌘⏎, or (b) ⌘⏎-only, no visible control at all. Both memos lean (a).
2. **Draft-as-context default** (divergence C): include your surrounding draft English
   by default with a settings disclosure line (recommended), or per-request checkbox?
3. **Context window**: ±6 rows (recommended) or fewer (Codex proposed ±2)?
4. **Auth-lapse sentence**: when the CLI is installed but signed out, a slightly more
   specific sentence ("Claude Code needs a sign-in — copied to clipboard instead."),
   or the generic clipboard one? Recommend the specific one.
5. **Insert semantics on a non-empty row**: replace whole row / replace selection /
   insert at caret (recommended: replace selection if any, else insert at caret;
   empty row = fill). ⌘Z always undoes.
6. **Model choice on the CLI path**: inherit your Claude Code default (recommended) or
   pin a model via `--model`?
7. **House terminology**: any fixed renderings for recurring Aristotelian terms to
   bake into the system prompt from day one (e.g. οὐσία, τὸ τί ἦν εἶναι)?
