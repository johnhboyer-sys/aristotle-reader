# Handoff prompt — Translation Workbench, next session

Copy-paste everything below the line into the next session.

---

You are continuing work on the **Classical Translation Workbench** — a Tauri 2 +
Svelte 5 desktop app at `workbench/` in the aristotle-reader repo, on branch
`claude/blissful-rubin-d64797`. It is a row-locked parallel Greek/English
translation editor (one row = one Bekker line) replacing John's Scrivener
workflow; his collaborator is non-technical, so every degraded state must be one
plain sentence, never a stack trace.

**Branch state:** all work committed, branch **NOT pushed** (John's standing
call — keep it local unless he says otherwise). Commit trail:
- `d118d23b` Phase 1
- `5adefdde` Phase 2
- `46f65a6e` Phase 3 (AI-assist + reference panel) + `98daf28f` ledger fix
- `ecb7b542` line-split feature (D6) + `0d4f0d6b` ledger fix

Check `git worktree list` first — the branch was last checked out in
`.claude/worktrees/intelligent-tesla-c10171` (worktrees keep getting
auto-cleaned; the branch survives each time). Work in whichever worktree has it,
or check it out fresh. **After any fresh checkout:**
`cd workbench && npm install && node scripts/build-dev-corpus.mjs`, AND restore
the gitignored Scrivener samples into `workbench/.dev-corpus/scrivener-samples/`
from `~/Downloads/meta z 17/` (Meta 7.17 pair) + `~/Downloads/APo 1.4 {Greek,
English}.md` — they die with every worktree cleanup and the acceptance tests
skip without them. `.claude/launch.json` "workbench" config is committed on this
branch (browser harness on port 1421).

**Read before doing anything:**
1. `workbench-design/TODO.md` — the live ledger: everything shipped (with
   measured numbers), what remains, and every decision John has confirmed
   (don't re-ask those). Run commands are at the bottom.
2. `workbench-design/build-spec.md` — John's canonical build spec (recovered
   from the Phase 1 transcript; §12 AI-assist, §13 reference panel are Phase 3).
3. The design docs for anything you touch: `d1` (row-lock editor), `d2`
   (citation schemes — frozen contract), `d3`/`d3a` (Scrivener import),
   `d4-ai-assist.md` (AI-assist synthesis), `d5-memo-reference-panel.md`,
   `d6-line-split.md` (line splitting). The `d4/d5/d6-memo-*.md` files are the
   raw dual-dispatch memos behind the synthesized decisions.
4. Memory file `translation-workbench.md` — full history, orchestration
   verdicts, gotchas.

**Where things stand (all committed, all verified):**
- **Phase 1–2**: row-lock editor, Scrivener import, copy-as-citation, whole-work
  compile export, shared-folder sync, corpus bundling.
- **Phase 3 (`46f65a6e`)**: (3A) AI-assist — `claude -p` via a Rust command
  (`assist.rs`), hover-✦-glyph + ⌘⏎, popover, suggestions enter cells only
  through `RowEditor.insertSuggestion`; clipboard fallback when no CLI.
  (3B) reference-translation panel — local-only OCR storage under
  `$APPDATA/references` (never synced, never committed), right-rail panel
  mutually exclusive with footnotes. Plus a latent pandoc Finder-launch PATH
  bug fixed along the way.
- **Line-split (`ecb7b542`)**: split a Bekker line at a paragraph boundary —
  right-click Greek → "Start new paragraph here"; both halves get their own
  English cell; stored as `line_splits` frontmatter + `¶` delimiter; exports as
  a real docx paragraph. 901 tests green.

**REMAINING — all need John at the keyboard (Tauri-native, not headless-testable):**
1. **Line-split cursor-division check**: type a sentence, put the cursor
   mid-way, right-click-split — confirm the English divides at the cursor. This
   is the one path the browser harness couldn't exercise (ProseMirror only
   adopts a caret from real input); it's unit-tested and wiring-verified, just
   wants a real-cursor confirmation.
2. **Finder-launch smoke test** of a fresh `npm run app:package` build, launched
   from Finder (NOT `open` from a terminal): try assist (⌘⏎) with his real
   `claude` install, and a docx export (validates the pandoc PATH fix). If
   assist falls back to clipboard or export fails, the binary-resolution ladder
   or a capability scope is wrong — see d4 §1 / the pandoc rider in d4-ai-assist.md.
3. **Real-OCR reference import** — his Ross or Lennox text through
   "Import reference…", to shake out the native file picker + assignment flow.
4. Carried Phase-2 hand-test items (Diogenes "Add work…", native pickers,
   folder picker on a real synced folder); full `tauri build` DMG step (needs a
   real Finder session); updater signing-key ceremony.

**HARD GATE — Latin/Aquinas (3C) is PARKED.** Do not start it without John's
explicit greenlight AND his Aquinas citation conventions (which works, the
citation string format, what one row is, the spine/source numbering) — he has
not specified these. The citation contract is proven ready (busse-paragraph
precedent + `aquinas-tbd` registered stub).

**How to work (unchanged):** you are the orchestrator — keep your own context
lean, route implementation to fast-worker subagents with single-owner file
boundaries, and route high-stakes design (anything touching the canonical
chapter-file format or D1's row model) to a dual dispatch: the same brief to
**deep-reasoner** (opus) AND **Codex** (`codex:codex-rescue`) independently,
synthesized by you into a `workbench-design/dN-*.md` decision doc. VERIFY
EVERYTHING YOURSELF in the browser harness (`npm run dev` → localhost:1421) —
read the actual imported/exported/stored CONTENT, not just green gates and
counts. Show John a plan (with agent routing) before a phase and a summary
before any commit; **never commit until he's reviewed a summary and said so**;
never push without his say-so.

**Hard conventions:** no TLG-derived text may be committed (`.dev-corpus/`,
`src-tauri/resources/corpus/`, `references/` are gitignored — dry-run `git add`
before any commit that touches resources); chapter files are canonical user data
— anything touching their format needs round-trip-by-construction tests and a
migration story; addresses are opaque raw strings outside `src/lib/citation/`;
the frozen `CitationScheme` contract must not grow scheme-conditional branches
(an executable source-scan test enforces this).

**Gotchas:** shell cwd resets between Bash calls — `cd` explicitly every time;
never run bare `npx tsc` from the repo root (it installs a bogus package — cd
into `workbench/` first); cargo lives at `~/.cargo/bin`, not on the default PATH
(`PATH="$HOME/.cargo/bin:$PATH" …`); in the preview harness, `Selection.modify`
moves a real caret but ProseMirror still won't adopt it, and the viewport must
be wide (≥1600px) or Greek cells sit at negative x and `caretRangeFromPoint`
returns null. Codex via `codex:codex-rescue` can misfire (lost prompt) or hit
its usage limit — give the forwarding call a long Bash timeout and retry.
Toolchain: Node 22, pandoc 3.10, Diogenes.app, rust ~1.96.

**Start by:** (1) asking John how the hand-testing went (the four REMAINING
items above) and triaging whatever he reports — that's the top priority;
(2) asking whether to push/PR the branch; (3) NOT starting 3C unless he
greenlights it and supplies the Aquinas conventions.
