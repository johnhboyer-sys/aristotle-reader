# Handoff prompt — Translation Workbench, next session

Copy-paste everything below the line into the next session.

---

You are continuing work on the **Classical Translation Workbench** — a Tauri 2 +
Svelte 5 desktop app at `workbench/` in the aristotle-reader repo, on branch
`claude/blissful-rubin-d64797`. It is a row-locked parallel Greek/English
translation editor (one row = one Bekker line) replacing John's Scrivener
workflow; his collaborator is non-technical, so every degraded state must be one
plain sentence, never a stack trace.

**➡️ CURRENT PHASE: hand-TESTING, not new features.** All feature work is
committed; the job now is exercising it in the real .app and triaging what John
finds. See the "TESTING CHECKLIST" at the top of `workbench-design/TODO.md`
(the single source of truth for what to test). Do NOT start new features unless
John asks.

**Branch state (updated 2026-07-06 EOD):** branch is now **PUSHED** and open as
**PR #20 → main** (https://github.com/johnhboyer-sys/aristotle-reader/pull/20) —
John asked to submit, reversing the old "don't push" call. HEAD `6cf0cb11`;
tree clean, fully synced. New commits on this branch roll into PR #20; commit
(with a summary first) as before, and push so the PR stays current. 36 commits /
+52k lines ahead of main, all under `workbench/` + `workbench-design/` (isolated
from the reader). Earlier trail: Phase 1 `d118d23b` · Phase 2 `5adefdde` ·
Phase 3 `46f65a6e` · line-split `ecb7b542` · multi-provider AI `6cccbb8f` · app
icon `62f5ae44`.

**2026-07-06 QA session fixes (on top of the above):** Finder-launch pandoc
export (`aeafc958`) + AI-assist resolution (`2785a8ba`) — WebKit `plugin-fs
exists()` is false for out-of-sandbox SYMLINKED binaries, so RUN to probe, don't
`exists`; AI Check/Reference → right sidebar + rendered Markdown (`31c17ad4`);
Greek selection column-scoped via DOM regroup (`d4ce6222`); Ask → tall right
sidebar + model label (`d4dbce50`); menu descriptions + text-size zoom
(`da77ff00`); multi-line Translate (`ae867363`) + overwrite confirm (`a37af7ae`);
two macOS TCC-prompt fixes — neutral subprocess cwd (`b73e0739`) + Claude Code
MCP-servers-off (`44f1da44`, the Apple Music prompt); line-split leading-punct
(`0d5e34c5`), split/merge menu → top + divider (`168343ac`), export `…` gaps
(`03d6aa63`). Latest built .app: `~/Downloads/Translation Workbench.app`
(unsigned, auto-de-quarantined by the deploy step).

Check `git worktree list` first — the branch was last checked out in
`.claude/worktrees/wb-ai` (worktrees keep getting auto-cleaned; the branch
survives each time). Work in whichever worktree has it, or check it out fresh. **After any fresh checkout:**
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
- **Line-split (`ecb7b542`)**: right-click Greek → "Start new paragraph here";
  both halves get their own English cell; `line_splits` frontmatter + `¶`
  delimiter; exports as a real docx paragraph.
- **Multi-provider AI-assist (`6cccbb8f` + follow-ups)**: runs whatever AI the
  user has — Claude Code / Codex / Gemini CLIs auto-detected, custom command,
  or API keys (off by default). Four right-click modes on the Greek:
  **Translate** (fills cell) · **AI reference** (floating popup) · **Check my
  translation** (linguist diagnosis popup) · **Ask about this line…** (docked
  bottom chat panel, one-shot). Rust `assist_run`/`assist_which` run any
  resolved binary; prompt via `ctx.mode`; providers unchanged across modes.
- **App icon (`62f5ae44`)**: italic α → a, terracotta gradient, light arrow.

**JOHN-VERIFIED in the .app this session:** full AI-assist suite (Claude Code
resolves + real translation / Check / Reference / Ask), Finder-launch (assist +
docx export), column-scoped selection, and ALL of line-split (split gesture +
cursor-division + undo + export paragraph break + `…` gaps). Zoom + multi-line
Translate built + unit-tested, worth a quick eyeball.

**REMAINING core QA — John at the keyboard in the real .app** (full checklist at
the top of TODO.md):
1. **Reference / Scrivener import — the one untested core bucket.** Native
   picker for "Import reference…" (defaults to the open chapter; lands under
   `$APPDATA/references`); the **real-OCR (Ross/Lennox) acceptance case**;
   Scrivener two-file import (`~/Downloads/meta z 17/` staged) → whole-work
   compile, where **John's bilingual/Cambria aesthetic verdict is still
   pending**. The browser preview CANNOT run CLIs — AI is .app-only.
2. Diogenes "Add work…" onboarding in the real app.
3. **Packaging (separate track):** full `tauri build` DMG; updater signing-key
   ceremony.

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

Add-ons discovered this round to fold in when relevant: the app icon source is
`src-tauri/icons/icon-source.svg` (regenerate with `tauri icon <svg>`); Codex's
`codex exec` needs `--skip-git-repo-check` + JSONL `agent_message` parsing +
`-c mcp_servers={}` (baked into the codex tool spec); Tauri commands are
unavailable in the browser preview (isTauri()=false) so AI can only be
live-tested in the packaged .app.

**Start by:** (1) picking up **reference / Scrivener import** testing (the one
remaining core bucket) with John — walk the import script, triage what he finds;
(2) fixing bugs, verifying each in the .app, summary before each commit, then
**push** so PR #20 stays current (rebuild+deploy one-liner: `cd workbench &&
npm run build && (source ~/.cargo/env; npm run app:build -- --bundles app) &&
cp -R src-tauri/target/release/bundle/macos/"Translation Workbench.app"
~/Downloads/ && xattr -dr com.apple.quarantine ~/Downloads/"Translation
Workbench.app"`); (3) NOT starting new features (multi-turn chat, generic-app
fork, Latin/Aquinas 3C) unless he greenlights them — 3C also needs his Aquinas
citation conventions.

NOTE: this session moved the AI Check/Reference output and the Ask panel from
floating popups / a docked bottom panel into RIGHT SIDEBARS (right-panel slot
precedence: AiPanel > Ask > Footnotes > Reference) — the older "floating popup"
descriptions above are superseded.
