# Aristotle Reader

Static Astro site, parallel Greek/English Aristotle. Repo lives at ~/Developer/aristotle-reader (kept out of iCloud). Node 22 required.
Live on GH Pages; custom domain aristotle.lyceum.institute pending.

## Hard rules
- Greek source is TLG. Never propose swapping to Bywater or re-raise this.
- Before committing on the main working branch: summarize the work and wait for John's go-ahead.
  EXCEPTION — worktrees auto-clean: in a worktree, commit early and often without asking; push to a claude/ branch promptly. The review gate applies at PR time instead.
- Deploying data is John's call. Never deploy without explicit go-ahead.
- Verify functionally, not with screenshots. Screenshots only when John is on remote-control and asks for them.
- Copyright: for website, free/public-domain translations only, judged by US copyright rules only. (archive.org "NOT_IN_COPYRIGHT" can mean Canada-only — verify US status.); for desktop app, copyright is not an issue for user imported translations.

## Deploy gotchas
- Deploy from origin/main, not local main.
- GH Pages deploys must be an incremental commit on a gh-pages clone; never run app and dist builds concurrently.
- GH Pages incident? Push a fresh empty commit.
- Current deploy state lives in DEPLOY-STATUS.md — update it whenever you deploy.

## Build gotchas
- TLG_DIR="/Users/johnboyer/Documents/CLAUDE CODE ARISTOTLE PROJECT/TLG Files/TLG"; run Diogenes xml-export.pl directly to pre-populate build/export — the pipeline's stripped-PATH subprocess dies (exit 25).
- Multi-work workflows: rebuild stage1 per-work first.
- astro-favicons is incompatible with a subpath base — don't retry; hand-roll if needed.

## Working with John
Philosophy professor, competent Greek. Explain architecture decisions; check in at milestones, not every step.
Per-work alignment recipes and history: see docs/ and git log — don't ask John to re-explain.

## Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. Orchestration and Subagents
 
You are the orchestrator. Plan, decompose, synthesize. Spawn subagents according to your judgment and assign to the model best suited for the job. Your roster:

Opus 4.8 → reasoning-heavy tasks; Sonnet 5 and Codex-gpt-5.6-terra-medium → mechanical work (give codex explicit, well defined goals); Codex-gpt-5.6-Sol-medium → treat as peer on par with Fable 5 for reviewing

High-stakes decisions: task Opus + Codex-GPT-5.6-Sol-Medium on the same problem in parallel, synthesize the best of both, without showing either the other's answer. 

Keep your own context lean.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to over-complication, and clarifying questions come before implementation rather than after mistakes.
