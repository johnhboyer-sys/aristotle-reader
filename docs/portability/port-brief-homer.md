# Brief for the Homer port session

Written by the lead session on 2026-11-21 (`HANDOFF-PORTABILITY.md`,
"Sessions"), cut from `port-brief-plato.md` after Plato's port merged. The
session is rooted in `~/Developer/homer-reader`, in its own worktree, on
Opus 5.5.

## Background

John Boyer runs four bilingual Greek/English reading sites (Aristotle, Plato,
Homer, Greek plays; Astro + Svelte 5 static sites, app on a Cloudflare Worker,
data on R2) plus Grammata. The portability track makes each one buildable
without his laptop, servable from any static host, and mirrored and backed up
off GitHub and Cloudflare. A lead session rooted in `aristotle-reader` took
Aristotle through phases 0 to 3 and did phase 0 (snapshots, GitLab mirrors)
for every site. Plato's port session finished phases 1 to 3 on 2026-11-21.
You are the port session for Homer. The lead session started you, checks your
reports against your PRs, and brings John only decisions.

Two worked examples, both merged. Read them; never edit either repo, and
never read their checkout files, which are stale.

- **Aristotle** (`johnhboyer-sys/aristotle-reader`): the plan, John's rulings
  (decisions 1 to 10), and the record are in `HANDOFF-PORTABILITY.md` at
  `origin/main` (`git -C ~/Developer/aristotle-reader fetch origin main`, then
  `git -C ~/Developer/aristotle-reader show origin/main:HANDOFF-PORTABILITY.md`).
  Its sections "Goal" (the five tests), "Decisions", "Plan", and the phase 1,
  2, and 3 records are this brief's long form. PRs: #228 (phase 0 tools), #231
  (phase 1), #232 (phase 2), #233 and #234 (phase 3), #236 (two review fixes).
- **Plato** (`johnhboyer-sys/plato-reader`): the same work ported to a
  sibling, which is your case. Its `HANDOFF-PORTABILITY.md` at `origin/main`
  says what differed from Aristotle and what its reviews found. PRs: #130
  (phase 1), #131 (phase 2), #132 (phase 3), #133 (a cleanup fix), #134 and
  #135 (handoff).

Read a PR with `gh pr view <n> --repo <repo>` and `gh pr diff <n> --repo
<repo>`; read a file as merged with `git -C ~/Developer/<repo> show
origin/main:<path>`. Where a script is the same in both, take it from
Aristotle's `origin/main` (at or after `18cfbacbd4`, which has the fixes
Plato's reviews found in `extract.write_all` and in the deploy tag's
`uncleanFiles`). Where a reader's own gates differ (the bundle's gates, the
visits in the no-outside-calls check, the deploy script), Plato's port shows
how a sibling's were fitted.

What is already done for Homer, by the lead session:

- A snapshot of the live site as of 2026-11-20:
  `~/Developer/reader-snapshots/2026-11-20/homer/` (`app/`, `data/`,
  `MANIFEST.json`, `SHA256SUMS`; 4,787 app files, 5,263 data files, 348 MB)
  and `~/Developer/reader-snapshots/2026-11-20/archives/homer-snapshot-2026-11-20.tar.gz`.
  This is test 2's baseline. Read only; do not change it.
  **Live moved on 2026-11-23:** another session redeployed Homer from `main`
  at `24cee78df` (PRs #75 and #76: a sort-by-count switch on the lexicon
  index, and search code that reads ᾽ as an elision). It reported no R2
  upload, so the snapshot's `data/` should still be live; the lead checked
  only that the six changed files are all under `app/` and `shared/`. The
  snapshot's `app/` is one deploy old: the `/lemma/` index page and the
  `_astro` bundles differ, and every other page by the new bundle names.
  So for pages, build the commit before those PRs (`9e327f885`) to compare
  with the snapshot, or build `main` and name those two PRs as the explained
  difference; say which you did.
- A private GitLab mirror, `git@gitlab.com:johnhboyer/homer-reader.git`, 11 of
  11 refs (less `gh-pages`), 809 commits, whole as of 2026-11-21. Nothing
  keeps it current yet; your phase 3 does.

What the audit found for Homer (2026-11-20): the GitHub repo is public with no
licence; the R2 bucket `homer-reader-data` held 5,263 objects, 161 MB, served
at `https://homer-data.johnhboyer.com`; two works, the Iliad and the Odyssey
(TLG 0012, works 001 and 002), in verse. **No Diogenes export and no build is
on disk** (`~/Developer/homer-reader/build` does not exist), unlike Plato, so
`extract` has to run Diogenes here, as Aristotle's did: Aristotle's phase 1
record says how, where the TLG folder is, and what `TLG_DIR` to set.
Diogenes.app is 4.7.2, which has `-y`/`-Y` verse export built in; Homer's
`CLAUDE.md` still says "patched `-y` export" and "Corpus source text is never
committed": correct both in the PR that adds the line files (decision 1).
Homer's `CLAUDE.md` says the export subprocess failed "in-sandbox with exit
25" for one earlier session; if it fails for you, say so with the full error
and stop on that point, since nothing else can stand in for the export.

Homer ships one text under a no-derivatives licence: the Kosmos Society
revision of Butler (CC BY-NC-ND 3.0), with its own preflight list. Phase 3's
release workflow attaches the whole bundle to a public GitHub release at each
deploy. Do not decide whether that is within the licence: say plainly in the
phase 3 PR that the bundle holds this text, and leave it to John.

The licence. For Plato John ruled "Same as Aristotle for license" on
2026-11-21 (an MIT `LICENSE`, CC0 on `corpus/greek/`, other sources under
their own terms; plato-reader #136). Homer carries sources under NC and ND
terms, so do not copy that over unasked: in your phase 1 report, lay out what
a Homer licence section would have to name apart from the MIT code and the
CC0 Greek, and ask John once.

Export-shaped test fixtures (decision 10). Homer has
`pipeline/tests/fixtures/stephanus/euthyphro_p2_3.xml` (a copy of Plato's)
and `pipeline/tests/fixtures/stage1_tlg/tiny_tlg_iliad.xml` (1.6 KB, called
synthetic, with real opening lines). For Plato John ruled: keep the fixture,
pinned (a test that fails if any tracked file but the pinned ones is
export-shaped; Plato's #130 has it). That ruling was for Plato's file. Lay out
Homer's two the same way, recommend what you judge right, and ask John; go on
with everything else meanwhile.

Facts about the machine: the disk had 7.6 GB free at 20:17 on 2026-11-21 and
is under pressure from another session. Node 22 via `source ~/.nvm/nvm.sh &&
nvm use 22`. zsh aborts a command on an unmatched glob, and a loop variable
named `path` empties `PATH`.

## Task

Port the portability work to `homer-reader`: phases 1, 2, and 3 of the plan in
Aristotle's `HANDOFF-PORTABILITY.md`, one phase per PR, stacked as Plato's
were. Work phase by phase and stop for the lead session between phases only
when you need a decision; otherwise go on.

**Before any edit**

1. Read this repo's `CLAUDE.md` (long; its worktree bootstrap, `build:public`
   in a worktree, and deploy sections bind you), `docs/cloudflare.md`, and
   `DEPLOY-STATUS.md` as they are at `origin/main`, then the two worked
   examples as the background says. Homer's own rules win over Aristotle's
   and Plato's habits wherever they differ.
2. Run `git fetch origin` and make sure your worktree's branch starts at
   `origin/main` (the local `main` is 7 commits behind; if your branch was cut
   from it, reset the fresh branch to `origin/main` before the first commit).
   The main checkout `~/Developer/homer-reader` and its other worktrees hold
   other sessions' work: never edit, build, stash, or switch branches there.
   Homer's `CLAUDE.md` describes symlinking `build` and the venv from the main
   checkout; the main checkout has no `build/` now, so make your own inside
   your worktree and never write into a shared one.
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
report it to the lead session before the first commit of those files. Homer's
speakers, book and line numbers, and anything else stage 1 reads out of the
export's markup must survive the line file: prove the spine stage 1 makes is
byte for byte the same from the export and from the line file, as Plato did
for its speakers' labels. The Morpheus table and LSJ XML come from a pinned
source with a checksum, their folder from the environment (Aristotle's
`aristotle_pipeline.inputs` is the model; say whether Homer's two files are
byte for byte Aristotle's pins; `manifests/odyssey-analyses-patch.json` is
Homer's own and stays in the repo). Take machine paths out of the public
build. CI runs the full build and uploads the bundle.

- Check, failing case first: a guard test that the committed files hold no
  beta code and no Diogenes XML markup, proved by planted cases that fail it,
  and that reports how many files and lines it read.
- Check: test 1 (a clean Linux build from the clone plus the pinned inputs, in
  CI) and test 2 (that build's data is byte for byte the snapshot's; pages
  equal once named, explained swaps are applied; `scripts/compare-snapshot.mjs`
  is the tool). If `DEPLOY-STATUS.md` shows a deploy after 2026-11-20, the
  snapshot is no longer live: say so and compare against what it can still
  prove.

**Phase 2: a bundle any host can serve.** Build parameters for site origin,
base path, and the Grammata address, with defaults that give today's build
byte for byte; a same-origin mirror bundle with `SHA256SUMS`
(`make-bundle.mjs`, with Homer's own data gates in place of Aristotle's leak
checks, and the Kosmos preflight among them if the deploy runs it);
`check-no-outside-calls.mjs` (test 3; the allowed list is Grammata's hosts
only, decision 4; choose visits that cover Homer's own pages, such as a book,
a word popup, search, a lemma page, the apparatus or plates if they fetch, and
the page under the service worker); `check-served.mjs`; a `Dockerfile` (build,
then Caddy) built in CI; `ARCHITECTURE.md` and `RESTORE.md`. Prove the fonts
are self-hosted with test 3; do not assume it.

- Check: test 3 at `/` and at a test base path, the link check at that base
  path reporting 0 broken (and failing a root-relative link that leaves out
  the base, as Plato's now does), and the image build green in CI.

**Phase 3: mirrors that follow a deploy.** `mirror-git.mjs`,
`mirror-check.mjs`, `check-mirrors.mjs` with `mirrors.json` naming
`git@gitlab.com:johnhboyer/homer-reader.git`, the deploy tag in
`scripts/deploy-cloudflare.mjs` (with `uncleanFiles()`), `release.yml`,
`mirror.yml` with the `mirror-key` action and `.github/mirror_known_hosts`.
Take the unchanged files whole from Aristotle's `origin/main` and say in the
PR which are byte for byte the same; port the deploy tag per hunk into
Homer's own deploy script and keep its tests.

- Check: the scripts' tests green, `mirror-check.mjs` run for real against the
  GitLab mirror (read it with `GIT_SSH_COMMAND="ssh -i
  $HOME/.ssh/gitlab_mirror_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes"`;
  it will name your new branches as missing, which is the truth), and the
  `mirror.yml` jobs showing as skipped while `MIRROR_GIT_URL` is unset.
- The deploy key is the lead session's job. Do not make a key, set a GitHub
  secret or variable, or tell John to make a key. When `mirror.yml` is in a
  PR, say so in your report; the lead session makes the pair and gives John
  the public half. If John then does GitLab's two steps in your session (add
  the deploy key with write access; tick it under `main`'s "Allowed to push
  and merge", force push left off), guide him, and send the lead session one
  line when he confirms both.

**Rules that bind every phase**

- Every new gate gets its failing case first, says how much it examined, and
  fails when it examined nothing. Mutation-check a guard by hand before
  trusting it. A gate that compares a thing to itself reports green forever.
- Never commit raw TLG files, beta code, or the Diogenes XML. `build/` stays
  ignored.
- No new npm or Python package without its reason in the commit message.
- `shared/` is a per-reader copy, not a submodule: port per hunk, never sync a
  directory from another reader.
- Yours to do without asking: commit early in your worktree, push your
  `claude/` branches to `origin`, and open PRs. Use `git add` with explicit
  paths, and check `git status --short --ignored` after adding files.
- John's alone: merging a PR, any deploy, any push to a host other than
  `origin`, new accounts, spending, adding a licence file (flag where one is
  needed and add none), making anything public, deleting from R2, rewriting
  history, and ruling on the fixtures. If John tells you in your own session
  to merge, that is his word: do it, and tell the lead session in one line so
  the two sessions do not both merge.
- Other Homer sessions may be at work. Follow `CLAUDE.md`'s rules for claiming
  files, and never touch another worktree.
- Disk (John, 2026-11-21: mind the disk, and pause if it is too low): run
  `df -h /` before every build, every `npm install` or `uv sync`, every
  download, and every unpack. If free space is under 5 GB, or the step would
  take it under 5 GB, do not start the step: delete your own build output and
  temp files, check again, and if it is still under, pause and report with
  the number. One build at a time; never build the Docker image on this Mac
  (CI does); delete `app/dist`, `build/`, and temp files as soon as a phase's
  checks are recorded. Never delete anything outside your own worktree and
  scratch folder to make room.
- Writing, in the handoff, PRs, and reports: short plain words, active voice,
  no stock figures of speech, the Oxford comma. No explainer text in the
  reader's pages.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Reports.** End a turn only when a phase's PR is open with its checks
recorded, or when you need a decision. Your report to the lead session says,
in this order: what is now true (with the numbers each check printed), what
failed or is unverified, the PR link, and any decision needed as one question
with its options and your recommendation. A check you could not run is
reported as not run, never as passed.

Done means: three PRs open or merged in `johnhboyer-sys/homer-reader` (phases
1, 2, 3), each with its machine-run checks green and quoted in the PR body,
each reviewed by another model family with its findings fixed or answered, and
`HANDOFF-PORTABILITY.md` current.
