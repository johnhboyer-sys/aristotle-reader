# Handoff prompt — Translation Workbench, next session

Copy-paste everything below the line into the next session.

---

You are continuing work on the **Classical Translation Workbench** — a Tauri 2 +
Svelte 5 desktop app at `workbench/` in the aristotle-reader repo, on branch
`claude/blissful-rubin-d64797`. It is a row-locked parallel Greek/English
translation editor (one row = one Bekker line) replacing my Scrivener workflow;
my collaborator is non-technical, so every degraded state must be one plain
sentence, never a stack trace.

**Branch/worktree state:** Phase 1 = `d118d23b`, Phase 2 = `5adefdde` (both
committed, branch NOT pushed, no PR). Last session the branch was checked out in
the worktree `.claude/worktrees/nervous-saha-372f7c` after the original
blissful-rubin worktree directory was auto-cleaned (the branch itself was never
at risk). Check `git worktree list` first: work in whichever worktree has the
branch checked out, or check it out into your session's worktree. After any
fresh checkout: `cd workbench && npm install && node scripts/build-dev-corpus.mjs`.

**Read before doing anything:**
1. `workbench-design/TODO.md` — the Phase 2 ledger: what shipped (with measured
   acceptance numbers), the carried-forward hardening items, every decision John
   has already confirmed (don't re-ask those), and all run commands.
2. `workbench-design/d1-row-lock-editor.md`, `d2-citation-schemes.md` (+ its
   Phase 2 exercise addendum), `d3-scrivener-import.md`, `d3a-stage0-scrivener-md.md`
   — the canonical architecture decisions. Deviations need my sign-off.
3. Your memory file `translation-workbench.md` — full history, orchestration
   verdicts, and gotchas (shell cwd resets between Bash calls; bare `npx tsc`
   from repo root installs a bogus package — always cd into workbench/).

**Where things stand:** All Phase 2 scope is DONE and verified: Scrivener import
(handles my real .md exports end to end — two real sample pairs live gitignored
at `workbench/.dev-corpus/scrivener-samples/`, acceptance tests skip when
absent), copy-as-citation, whole-work compile export (English + bilingual),
shared-folder sync (iCloud/Drive/Dropbox), the busse-paragraph second-scheme
contract proof, and corpus resource bundling (`npm run app:package`). 560 tests
green at commit time.

**This session's likely agenda (confirm with me first):**
1. **My hand-test feedback.** I was asked to exercise the real app
   (`PATH="$HOME/.cargo/bin:$PATH" npx tauri dev`): native import of my two
   chapters, whole-work compile (bilingual layout + Cambria font are explicitly
   awaiting my aesthetic verdict), the shared-folder picker against my real
   synced folder, and a from-scratch "Add work…". Expect bug reports or tweak
   requests from that — they are the top priority.
2. **Push / PR decision** — the branch has never been pushed; ask me.
3. **Possibly Phase 3** — AI-assist (spec §12), reference-translation panel
   (§13), Latin/Aquinas (§14-ish). HARD GATE: needs my explicit greenlight AND
   my Aquinas citation conventions, which I have not yet specified. Do not start
   it on your own.
4. The small carried-forward hardening items in TODO.md (U+2028 parser
   hardening, copy-citation element-endpoint selections, APo dev-loader button,
   full `tauri build`, updater signing key ceremony) can be folded in without a
   separate greenlight.

**How to work (unchanged):** You are the orchestrator, not the sole implementer —
keep your own context lean. Route reasoning-heavy design to **deep-reasoner**
(opus) and mechanical work to **fast-worker** (sonnet) — defined in
`.claude/agents/`; if not registered, use general-purpose agents with model
overrides. Treat **Codex** (`codex:codex-rescue`) as a peer: HIGH-STAKES
decisions get the same brief dispatched to deep-reasoner AND Codex
independently, synthesized by you into a decision doc under `workbench-design/`.
Give parallel agents single-owner file boundaries (this prevented every conflict
across 7+ agents in Phase 2 — the one near-miss was an agent trying to fix
another agent's in-flight file; stand that down immediately). Demand
parity/round-trip tests as acceptance gates. VERIFY EVERYTHING YOURSELF in the
browser harness before calling it done — and read the actual imported/exported
CONTENT, not just counts and green gates: Phase 2's four escaped bugs (doubled
period, Greek-cell English drop, footnote-ref-inside-parenthetical mangling,
doubled-marker leak) were all caught by eyeballing real rows, never by the
agents' own passing tests.

**Hard conventions:** show me your plan (with agent routing) at the top of the
phase and wait for my go-ahead; never commit until I've reviewed a summary and
said so; no TLG-derived text may be committed (`.dev-corpus/` and
`src-tauri/resources/corpus/` are gitignored for this reason — dry-run `git add`
before any commit that touches resources); chapter files are my canonical data —
anything touching their format needs round-trip-by-construction tests and a
migration story; addresses are opaque raw strings outside `src/lib/citation/`;
the frozen `CitationScheme` contract must not grow scheme-conditional branches
(there is an executable source-scan test enforcing this now).

**Current machine state:** corpora for Metaphysics and Posterior Analytics
seeded at `~/Library/Application Support/org.aristotlereader.workbench/corpus/`
and regenerable at `workbench/.dev-corpus/` (`node scripts/build-dev-corpus.mjs`);
`tauri dev` falls back to the dev corpus automatically (DEV-only). Toolchain:
cargo at `~/.cargo/bin` (not on default PATH), pandoc 3.10, Diogenes.app
installed, Node 22. Browser harness: `npm run dev` → localhost:1421 (a
`.claude/launch.json` "workbench" config existed in the nervous-saha worktree;
recreate if missing). 560-test suite: `npx vitest run` from `workbench/`.

**Start by:** (1) asking me how the hand-testing went and triaging whatever I
report; (2) asking whether to push/PR the branch; (3) if I greenlight Phase 3,
asking me for the Aquinas citation conventions before any design work, and
dual-dispatching the AI-assist integration design (it touches my canonical data
workflow, so treat it as high-stakes).
