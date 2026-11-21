# Brief for the Plato port session

Written by the lead session on 2026-11-21 (`HANDOFF-PORTABILITY.md`,
"Sessions"). The session is rooted in `~/Developer/plato-reader`, in its own
worktree, on Opus 5.5. Homer's and the plays' briefs are cut from this one;
the "What the audit found" paragraph and the snapshot numbers change, and the
plays differ most (the handoff's phase 4 says how).

## Background

John Boyer runs four bilingual Greek/English reading sites (Aristotle, Plato,
Homer, Greek plays; Astro + Svelte 5 static sites, app on a Cloudflare Worker,
data on R2) plus Grammata. The portability track makes each one buildable
without his laptop, servable from any static host, and mirrored and backed up
off GitHub and Cloudflare. A lead session rooted in `aristotle-reader` has
taken Aristotle through phases 0 to 3 and did phase 0 (snapshots, GitLab
mirrors) for every site. You are the port session for Plato. The lead session
started you, checks your reports, and brings John only decisions.

The plan, the decisions John has ruled, and the record of what Aristotle's
port found are in `HANDOFF-PORTABILITY.md` in `johnhboyer-sys/aristotle-reader`
at `origin/main` (read it with `git -C ~/Developer/aristotle-reader fetch
origin main` then `git -C ~/Developer/aristotle-reader show
origin/main:HANDOFF-PORTABILITY.md`; never read that repo's checkout files,
which are stale, and never edit that repo). Its sections "Goal" (the five
tests), "Decisions" (1 to 10), "Plan", and the phase 1, 2, and 3 records are
your brief's long form. Aristotle's worked example is five merged PRs in
`johnhboyer-sys/aristotle-reader`: #228 (phase 0 tools: `snapshot-live.mjs`,
`verify-snapshot.mjs`, `mirror-check.mjs`), #231 (phase 1: the build reads
committed Greek line files), #232 (phase 2: bundle, build parameters, CI
build, Dockerfile), #233 (phase 3: `mirror-git.mjs`, deploy tag, release
workflow, `check-mirrors.mjs`), #234 (`mirror.yml`, the `mirror-key` action,
pinned GitLab host keys). Read each with `gh pr view <n> --repo
johnhboyer-sys/aristotle-reader` and `gh pr diff <n> --repo
johnhboyer-sys/aristotle-reader`; read a file as merged with `git -C
~/Developer/aristotle-reader show origin/main:<path>`.

What is already done for Plato, by the lead session:

- A snapshot of the live site as of 2026-11-20:
  `~/Developer/reader-snapshots/2026-11-20/plato/` (`app/`, `data/`,
  `MANIFEST.json`, `SHA256SUMS`; 5,582 app files, 7,592 data files, 820 MB)
  and `~/Developer/reader-snapshots/2026-11-20/archives/plato-snapshot-2026-11-20.tar.gz`.
  This is test 2's baseline. Read only; do not change it.
- A private GitLab mirror, `git@gitlab.com:johnhboyer/plato-reader.git`, 30 of
  30 refs (less `gh-pages`), 605 commits, whole as of 2026-11-21. Nothing
  keeps it current yet; your phase 3 does.

What the audit found for Plato (2026-11-20): the GitHub repo is public with no
licence; fonts are already self-hosted; the R2 bucket `plato-reader-data` held
7,592 objects, 293 MB; a Diogenes export exists on disk at
`~/Developer/plato-reader/build/export` (9.2 MB), which Aristotle did not
have; `pipeline/tests/fixtures/stephanus/euthyphro_p2_3.xml` is export-shaped
Greek already public (decision 10, open, John's to rule).

Facts about the machine: the disk had 14 GB free on 2026-11-21 and John has
noticed it running low. Node 22 via `source ~/.nvm/nvm.sh && nvm use 22`. zsh
aborts a command on an unmatched glob, and a loop variable named `path`
empties `PATH`.

## Task

Port the portability work to `plato-reader`: phases 1, 2, and 3 of the plan in
Aristotle's `HANDOFF-PORTABILITY.md`, one phase per PR, Aristotle's merged PRs
#231 to #234 as the worked example. Work phase by phase and stop for the lead
session between phases only when you need a decision; otherwise go on.

**Before any edit**

1. Read this repo's `CLAUDE.md`, `pipeline/CLAUDE.md`, `shared/CLAUDE.md`,
   `docs/cloudflare.md`, and `DEPLOY-STATUS.md` as they are at `origin/main`,
   then Aristotle's handoff and PRs as the background says. Plato's own rules
   win over Aristotle's habits wherever they differ.
2. Run `git fetch origin` and make sure your worktree's branch starts at
   `origin/main` (the local `main` is 9 commits behind; if your branch was cut
   from it, reset the fresh branch to `origin/main` before the first commit).
   The main checkout `~/Developer/plato-reader` holds other sessions'
   uncommitted work: never edit, build, stash, or switch branches there. You
   may read `~/Developer/plato-reader/build/export` and may clone it into your
   worktree with `cp -Rc` (copy-on-write; never a plain copy, never a
   symlink).
3. Load the `delegate` skill before any subagent or Codex or Grok run. You
   implement; a different model family reviews each phase before its PR
   (Codex with `--model gpt-6.1-sol --effort medium`, or Grok; brief either as
   a static read of the diff, since neither can run `uv`, Chromium, or the
   data). Never spawn a Fable subagent. At most five agents at once. Every
   agent's label carries its model.
4. Write `HANDOFF-PORTABILITY.md` at this repo's root in your first PR (state
   table per phase, what was decided and why, what failed), and rewrite it as
   state changes. If `CLAUDE.md` lists handoffs, add it there.

**Phase 1: the build runs without the laptop.** Per decision 1: a local
`extract` command writes one line-level file per work into `corpus/greek/` (a
folder that holds nothing else), and the build reads only those and raises if
one is missing; it never runs Diogenes. Measure the folder's total size and
report it to the lead session before the first commit of those files. The
Morpheus table and LSJ XML come from a pinned source with a checksum, their
folder from the environment (Aristotle's `aristotle_pipeline.inputs` is the
model; say whether Plato's two files are byte for byte Aristotle's). Take
machine paths out of the public build. CI runs the full build and uploads the
bundle. Correct the "never committed" comments decision 1 names, in the same
PR as the files.

- Check, failing case first: a guard test that the committed files hold no
  beta code and no Diogenes XML markup, proved by a planted case that fails
  it, and that reports how many files and lines it read.
- Check: test 1 (a clean Linux build from the clone plus the pinned inputs, in
  CI) and test 2 (that build's data is byte for byte the snapshot's; pages
  equal once named, explained swaps are applied; Aristotle's
  `scripts/compare-snapshot.mjs` is the model). If `DEPLOY-STATUS.md` shows a
  deploy after 2026-11-20, the snapshot is no longer live: say so and compare
  against what it can still prove.

**Phase 2: a bundle any host can serve.** Build parameters for site origin,
base path, and the Grammata address, with defaults that give today's build
byte for byte; a same-origin mirror bundle with `SHA256SUMS`
(`make-bundle.mjs`); `check-no-outside-calls.mjs` (test 3; the allowed list is
Grammata's hosts only, decision 4); `check-served.mjs`; a `Dockerfile` (build,
then Caddy) built in CI; `ARCHITECTURE.md` and `RESTORE.md`. Fonts are already
self-hosted here: prove it with test 3 instead of assuming it.

- Check: test 3 at `/` and at a test base path, the link check at that base
  path reporting 0 broken, and the image build green in CI.

**Phase 3: mirrors that follow a deploy.** `mirror-git.mjs`,
`mirror-check.mjs`, `check-mirrors.mjs` with `mirrors.json` naming
`git@gitlab.com:johnhboyer/plato-reader.git`, the deploy tag in
`scripts/deploy-cloudflare.mjs`, `release.yml`, `mirror.yml` with the
`mirror-key` action and `.github/mirror_known_hosts`. Port per hunk and keep
each script's tests; carry over the fixes Codex's three reviews forced in
Aristotle (they are in the merged files, and listed in Aristotle's phase 3
record) instead of rediscovering them.

- Check: the scripts' tests green, `mirror-check.mjs` run for real against the
  GitLab mirror, and the `mirror.yml` jobs showing as skipped while
  `MIRROR_GIT_URL` is unset.
- Do not make a deploy key, touch GitLab's settings, or set a GitHub secret or
  variable. When `mirror.yml` is in a PR, say so in your report; the lead
  session sets up the key with John, who has to do the GitLab part himself.

**Rules that bind every phase**

- Every new gate gets its failing case first, says how much it examined, and
  fails when it examined nothing. Mutation-check a guard by hand before
  trusting it. A gate that compares a thing to itself reports green forever.
- Never commit raw TLG files, beta code, or the Diogenes XML. `build/` stays
  ignored.
- No new npm or Python package without its reason in the commit message.
- `shared/` is a per-reader copy, not a submodule: port per hunk, never sync a
  directory from Aristotle.
- Yours to do without asking, per this repo's `CLAUDE.md`: commit early in
  your worktree and push your `claude/` branches to `origin`; open PRs. Use
  `git add` with explicit paths, and check `git status --short --ignored`
  after adding files.
- Not yours, and not the lead session's either; these are John's: merging a
  PR, any deploy, any push to a host other than `origin`, new accounts,
  spending, adding a licence file (decision 3 is ruled in outline, but the
  licence table does not exist yet: flag where a licence is needed and add
  none), making anything public, deleting from R2, rewriting history, and
  ruling on decision 10 (the Euthyphro fixture: phase 1's guard has to either
  allow short fixtures or need them replaced; lay out both and stop on that
  point only).
- This repo has one writer at a time on `main`: other Plato sessions may be at
  work. Claim your files at the start as `CLAUDE.md` says, and never merge.
- Disk: check `df -h /` before each full build, run one build at a time, and
  delete your build output and temp files when a phase's checks are recorded.
  If free space drops under 6 GB, stop and report.
- Writing, in the handoff, PRs, and reports: short plain words, active voice,
  no stock figures of speech, the Oxford comma. No explainer text in the
  reader's pages.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Reports.** Do not notify John yourself. End a turn only when a phase's PR is
open with its checks recorded, or when you need a decision. Your report to the
lead session says, in this order: what is now true (with the numbers each
check printed), what failed or is unverified, the PR link, and any decision
needed as one question with its options and your recommendation. A check you
could not run is reported as not run, never as passed.

Done means: three PRs open or merged in `johnhboyer-sys/plato-reader` (phases
1, 2, 3), each with its machine-run checks green and quoted in the PR body,
each reviewed by another model family with its findings fixed or answered, and
`HANDOFF-PORTABILITY.md` current.
