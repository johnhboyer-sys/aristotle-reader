# Handoff prompt — Translation Workbench, next session

Copy-paste everything below the line into the next session.

---

You are continuing work on the **Classical Translation Workbench** — a Tauri 2 +
Svelte 5 desktop app at `workbench/` in the aristotle-reader repo, on branch
`claude/blissful-rubin-d64797` (Phase 1 committed as `d118d23`, not pushed). It is
a row-locked parallel Greek/English translation editor (one row = one Bekker
line) replacing my Scrivener workflow; my collaborator is non-technical, so every
degraded state must be one plain sentence, never a stack trace.

**Read before doing anything:**
1. `workbench-design/TODO.md` — the current work ledger, open questions, and run
   commands.
2. `workbench-design/d1-row-lock-editor.md` and `d2-citation-schemes.md` — the
   two synthesized architecture decisions. They are canonical; deviations need my
   sign-off.
3. Your memory file `translation-workbench.md` — full project history and status.
4. The original build spec is in the first message of the previous session; its
   Phase 2 scope is: copy-as-citation (§10), Scrivener import (§9), whole-work
   compile export (§8), Drive-folder sync (§11), citation-scheme second-scheme
   exercise. Do NOT build Phase 3 features (AI-assist, reference-translation
   panel, Latin).

**How to work (unchanged from Phase 1):** You are the orchestrator, not the sole
implementer — keep your own context lean. Route reasoning-heavy design to
**deep-reasoner** and mechanical work to **fast-worker** (both defined in
`.claude/agents/`; if the harness doesn't register them, use general-purpose
agents with model overrides opus/sonnet). Treat **Codex** (`codex:codex-rescue`
agent) as a peer: for HIGH-STAKES decisions, dispatch the same brief to
deep-reasoner AND Codex independently — neither sees the other's answer — and
synthesize the result yourself into a decision doc under `workbench-design/`.
The spec explicitly marks **the Scrivener-import spine-alignment approach** as
high-stakes → dual-dispatch it before implementing. Give parallel implementation
agents single-owner file boundaries (this prevented every merge conflict in
Phase 1), demand parity/round-trip tests as acceptance gates, and verify the
result yourself in a browser before calling anything done.

**Hard conventions:** show me your plan (with agent routing) at the top of the
phase and wait for my go-ahead; never commit until I've reviewed a summary and
said so; no TLG-derived text may be committed (`.dev-corpus/` is gitignored for
this reason); chapter files are my canonical data — anything that touches their
format needs round-trip-by-construction tests and a migration story; addresses
are opaque raw strings outside `src/lib/citation/`; the frozen `CitationScheme`
contract in `src/lib/citation/types.ts` must not grow scheme-conditional branches.

**Current machine state:** corpora for Metaphysics and Posterior Analytics are
seeded at `~/Library/Application Support/org.aristotlereader.workbench/corpus/`
and in `workbench/.dev-corpus/` (regen: `node scripts/build-dev-corpus.mjs`);
`tauri dev` falls back to the dev corpus automatically when app data is empty
(DEV-only). Toolchain: cargo at `~/.cargo/bin` (not on default PATH), pandoc
3.10, Diogenes.app installed, Node 22.

**Start by:** (1) confirming with me which Phase 2 items to build and in what
order, (2) asking me for the Scrivener conversion aid files
(`scrivener-import-guide.md`, `scrivener_to_canonical.py` — referenced by the
spec but never handed over) if Scrivener import is in scope, and (3) answering
the open questions in `workbench-design/TODO.md` §Open questions as they become
relevant. The small carried-forward items in TODO.md (corpus resource bundling,
export reference-docx, the two judgment-call confirmations) can be folded in
without a separate greenlight.
