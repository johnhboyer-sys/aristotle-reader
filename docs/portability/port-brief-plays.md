# Brief for the plays port session

Written by the lead session on 2026-11-23 (`HANDOFF-PORTABILITY.md`,
"Sessions"), cut from `port-brief-homer.md` after Homer's port merged. The
session is rooted in `~/Developer/greek-plays`, in its own worktree, on
Opus 5.5.

## Background

John Boyer runs four bilingual Greek/English reading sites (Aristotle, Plato,
Homer, Greek plays; Astro + Svelte 5 static sites) plus Grammata. The
portability track makes each one buildable without his laptop, servable from
any static host, and mirrored and backed up off GitHub and Cloudflare. A lead
session rooted in `aristotle-reader` took Aristotle through phases 0 to 3 and
did phase 0 (snapshots, GitLab mirrors) for every site. Plato's port merged on
2026-11-21 and Homer's on 2026-11-23. You are the port session for the plays,
the last reader and the one that differs most. The lead session started you,
checks your reports against your PRs, and brings John only decisions.

Three worked examples, all merged. Read them; never edit those repos, and
never read their checkout files, which are stale.

- **Aristotle** (`johnhboyer-sys/aristotle-reader`): the plan, John's rulings
  (decisions 1 to 10), and the record are in `HANDOFF-PORTABILITY.md` at
  `origin/main` (`git -C ~/Developer/aristotle-reader fetch origin main`, then
  `git -C ~/Developer/aristotle-reader show origin/main:HANDOFF-PORTABILITY.md`).
  Its sections "Goal" (the five tests), "Decisions", "Plan", and the phase 1,
  2, and 3 records are this brief's long form. PRs: #228 (phase 0 tools), #231
  (phase 1), #232 (phase 2, which self-hosts the fonts), #233 and #234
  (phase 3), #236 (two review fixes).
- **Plato** (`johnhboyer-sys/plato-reader`): PRs #130 (phase 1), #131
  (phase 2), #132 (phase 3), #136 (licence). Speakers' labels survive its
  line files; yours must too.
- **Homer** (`johnhboyer-sys/homer-reader`): PRs #78 (phase 1), #79
  (phase 2), #80 (phase 3), #81 (licence). The nearest to you: verse, with no
  export on disk, margin signs kept in a column of their own, a spine proved
  byte for byte three ways, and gates Codex and Grok found holes in. Its
  `HANDOFF-PORTABILITY.md` at `origin/main` says what its reviews found; fix
  those in your port before a reviewer finds them again.

Read a PR with `gh pr view <n> --repo <repo>` and `gh pr diff <n> --repo
<repo>`; read a file as merged with `git -C ~/Developer/<repo> show
origin/main:<path>`. Where a script is the same in all three, take it from
Homer's `origin/main` (at or after `6c8070f3fc`) and say in the PR which
files are byte for byte the same.

What is already done for the plays, by the lead session:

- A snapshot of the live site as of 2026-11-20:
  `~/Developer/reader-snapshots/2026-11-20/plays/` (`app/`, `MANIFEST.json`,
  `SHA256SUMS`; 10,975 files, 444 MB) and
  `~/Developer/reader-snapshots/2026-11-20/archives/plays-snapshot-2026-11-20.tar.gz`.
  Read only. **It is a floor, not a proven whole.** The plays have no key
  record and no `gh-pages` tree, so the file list came from the site's own
  indexes and from guessed names (Aristotle's handoff, "The plays", says how
  and how well that method did on the other readers: 95.6% to 99.6%). So
  test 2 here is: every file the snapshot holds is in your build byte for
  byte, or differs for a named reason; files only in the build are counted
  and listed by family, not failed.
- **Live moved on 2026-11-23.** Another session redeployed the plays after
  greek-plays #14 and #15 (search code that reads ᾽ as an elision, and a
  sort-by-count switch on the lexicon index); `main` is now `c1cf9b9` (#16
  added only old sweep scripts and design files). The lead does not know
  which commit was deployed or whether any data file changed: the plays ship
  data inside the app, so find out before you compare (the deploying
  session's notes are not in the repo; `git log` and the built files are
  your evidence), and say what you found.
- A private GitLab mirror, `git@gitlab.com:johnhboyer/greek-plays.git`, 22 of
  22 refs, 1,407 commits, whole as of 2026-11-21. Nothing keeps it current
  yet; your phase 3 does.

What the audit found for the plays (2026-11-20, Aristotle's handoff, "What
the audit found" and "Plays history check"):

- The GitHub repo is **private**, with no licence. John flips it to public
  himself, after reading the history check's findings. Do not change its
  visibility, and do not rewrite history.
- The host is one Cloudflare Worker, `greek-drama-reader`, at
  `greekdrama.johnhboyer.com`, **with the data inside its assets**: no R2
  bucket, no `PUBLIC_DATA_ROOT` in use, no key record. The Worker has a
  script (`app/worker/index.js`): `/api/*` is a feedback form with an email
  binding. `CLAUDE.md` still says "Cloudflare Pages (app) + R2 (data)";
  correct it in your first PR.
- There is **no deploy script, no `docs/cloudflare.md`, and no
  `DEPLOY-STATUS.md`** in the repo. The deploy recipe lives in sessions'
  notes: a full `build:public`, then `wrangler deploy` from `app/`.
- Greek: 44 plays from four TLG authors (Aeschylus 0085, Sophocles 0011,
  Euripides 0006, Aristophanes 0019), editions differing per play
  (`expected_sourcedesc`), with some Greek from Perseus and OCR'd editions
  and `text_fixes` in 43 manifests. **No Diogenes export and no build is on
  disk**, so `extract` runs Diogenes 4.7.2, once per author, by
  `docs/tlg-phi-export.md`. The TLG folder is
  `~/Documents/CLAUDE CODE ARISTOTLE PROJECT/TLG Files/TLG`. Homer's port
  found that the export's "exit 25" was a missing `HOME`; set it.
- Fonts come from Google Fonts at runtime (15 source files name them), unlike
  Plato and Homer. Aristotle's #232 self-hosted its fonts; that is your
  model.
- `PUBLIC_SITE_ORIGIN` already exists here. Fit `site-params.mjs` to it; do
  not add a second name for the same thing.
- Export-shaped fixtures: `pipeline/tests/fixtures/play_line/synthetic6.xml`,
  `play_line/synthetic_transposition.xml`, `stephanus/edge_cases.xml`, and
  `stephanus/euthyphro_p2_3.xml`. John ruled "keep, pinned" for Plato's and
  for both of Homer's. Apply the same here (a test that fails if any tracked
  file but the pinned ones is export-shaped, each pinned by size and
  sha256), say in the PR that it rests on those two rulings, and list it for
  John to overrule.

John's rulings since Homer's brief, which bind you:

- **Heavy runs wait (2026-11-23).** The Mac went down at about 12:02 with
  several sessions building at once; John: "let's wait on the heavy tests
  (i think the cpu got overloaded with tasks)". The lead reads that as
  standing until John lifts it. `build:public` here takes more than ten
  minutes. So: no full local build, no full `shared` or pipeline suite, and
  no browser visits on the Mac unless John says so in your session or the
  lead relays his word. CI runs them. What must be local runs local, one
  thing at a time: the Diogenes export (one author per run), `extract`,
  stage 1 on one work, and a test file or two. Before any of these, run
  `uptime` and `df -h /`; if the one-minute load is over 8, wait and look
  again. Commit and push before any run longer than a minute.
- **The licence pattern** (Plato #136, Homer #81): MIT for the code, CC0 1.0
  on `corpus/greek/`, CC BY 4.0 on John's own apparatus and derived data, and
  a per-source table for everything else, each line repeating what the repo
  already states for that source. The plays carry NC, ND, and share-alike
  sources. Prepare it as a fourth PR, stacked last, and ask John once, with
  the table in front of him. Name any Greek edition printed after 1930, since
  for Homer's 1931 Allen he was asked "CC0 now or on 1 January 2027" and
  answered "Now".
- **Outside hosts** (decision 4, and Homer's two): the allowed list is
  Grammata's two hosts and nothing else until John allows more. If test 3
  finds another host the site calls, name it, say what it serves, recommend,
  and ask.

A point that is new with the plays, and John's: **the repo is private, so
GitHub Actions minutes are metered.** A full build in CI on every push would
spend them. Before you add a `site` or `image` job, measure: run the build
once by `workflow_dispatch`, read the minutes it billed, and report that
number with your proposed triggers (the lead's starting point: the full
build on pull requests to `main` and by hand, never on every branch push; the
image by hand and on a deploy tag). Spending is John's; do not let a workflow
loose on every push before he has seen the number.

## Task

Port the portability work to `greek-plays`: phases 1, 2, and 3 of the plan in
Aristotle's `HANDOFF-PORTABILITY.md`, one phase per PR, stacked, then the
licence PR. Work phase by phase and stop for the lead session between phases
only when you need a decision; otherwise go on.

**Before any edit**

1. Read this repo's `CLAUDE.md`, `README.md`, `ADDING-A-WORK.md`, `DRIFT.md`,
   and `docs/tlg-phi-export.md` as they are at `origin/main`, then the worked
   examples. The plays' own rules win over the other readers' habits wherever
   they differ: sister repos are read-only, `shared/` changes get a `DRIFT.md`
   line in the same commit, and reader-facing copy is draft until John
   approves it.
2. Run `git fetch origin` and make sure your branch starts at `origin/main`
   (`c1cf9b9` or later). The main checkout `~/Developer/greek-plays` and any
   other worktree hold other sessions' work: never edit, build, stash, or
   switch branches there.
3. Load the `delegate` skill before any subagent or Codex or Grok run. You
   implement; a different model family reviews each phase before its PR
   (Codex with `--model gpt-6.1-sol --effort medium`, or Grok; brief either
   as a static read of the diff, since neither can run `uv`, Chromium, or the
   data). Go by the budget board your session opens with. Never spawn a Fable
   subagent. At most five agents at once, and no agent runs a build. Every
   agent's label carries its model.
4. Write `HANDOFF-PORTABILITY.md` at this repo's root in your first PR (state
   table per phase, what was decided and why, what failed), and rewrite it as
   state changes.

**Phase 1: the build runs without the laptop.** Per decision 1: a local
`extract` command writes one line-level file per play into `corpus/greek/` (a
folder that holds nothing else), and the build reads only those and raises if
one is missing; it never runs Diogenes. Measure the folder's total size and
report it to the lead session before the first commit of those files.
Everything stage 1 reads out of the export's markup must survive the line
file: speakers, line numbers as printed, transposed lines in printed order,
repeated refs, lacunae, lyric and stichic marks, and whatever else the
manifests' citation blocks lean on. Prove it as Homer did: the spine stage 1
makes is byte for byte the same from the export and from the line file, for
all 44 plays, with the count printed. Plays whose Greek is already a
committed Perseus or OCR'd edition get no line file; say which, with the
count, so 44 is accounted for. The Morpheus table and LSJ XML come from a
pinned source with a checksum, their folder from the environment (Homer's
`homer_pipeline.inputs` is the model; say whether the plays' two files are
byte for byte the same pins). Take machine paths out of the public build.

- Check, failing case first: a guard test that the committed files hold no
  beta code and no Diogenes XML markup, proved by planted cases that fail it,
  and that reports how many files and lines it read. Start from Homer's, with
  the holes its reviews found already closed (an empty play, a number like
  `01` or in other digits, a tab in a heading, namespace-prefixed and
  upper-case tags, a tracked symlink, a file deleted from the working tree).
- Check: test 1 (a clean Linux build from the clone plus the pinned inputs,
  in CI, by hand until John has ruled on the minutes) and test 2 as the
  background defines it for a floor snapshot, run on the CI build's artifact
  so the Mac builds nothing. `scripts/compare-snapshot.mjs` is the tool; fit
  it to a snapshot with no `data/` half and no live-only list, and prove the
  fitted tool still turns red on one changed byte and on one missing file.

**Phase 2: a bundle any host can serve.** Build parameters for site origin,
base path, and the Grammata address, with defaults that give today's build
byte for byte; the fonts self-hosted; a mirror bundle with `SHA256SUMS`
(`make-bundle.mjs`, with the plays' own gates: whatever `build:public` and
the deploy recipe run, each required to say how much it checked);
`check-no-outside-calls.mjs` (test 3; visits that cover the plays' own pages:
a play, a word popup, a speaker's lines, search, a lemma page, the landing
page, the feedback form, and a page under the service worker);
`check-served.mjs`; a `Dockerfile` (build, then Caddy) built in CI, never on
the Mac; `ARCHITECTURE.md` and `RESTORE.md`. On a plain static host there is
no `/api`: the feedback form must hide itself when its endpoint is absent
(Aristotle's handoff, the solutions table), and test 3 must see that it does.

- Check: test 3 at `/` and at a test base path, the link check at that base
  path reporting 0 broken and failing a root-relative link that leaves out
  the base, and the image build green in CI. These need a browser and a
  build: run them in CI, or ask for John's word first.

**Phase 3: mirrors that follow a deploy.** `mirror-git.mjs`,
`mirror-check.mjs`, `check-mirrors.mjs` with `mirrors.json` naming
`git@gitlab.com:johnhboyer/greek-plays.git`, `release.yml`, `mirror.yml` with
the `mirror-key` action and `.github/mirror_known_hosts`. Take the unchanged
files whole from Homer's `origin/main`.

The deploy tag has no script to live in here. Write
`scripts/deploy-cloudflare.mjs` for the plays in the shape of Homer's: it
refuses an unclean tree (`uncleanFiles()`), runs the gates, rehearses by
default or with `--dry-run`, runs `wrangler deploy` from `app/` only when
told to, and tags `deploy/<date>` only after a deploy that succeeded. Write
`docs/cloudflare.md` and `DEPLOY-STATUS.md` from what the repo and the live
site show, marking what you could not confirm. Test the script's every
branch with fakes. **Never run it for real**, and say in the PR that no real
deploy has gone through it.

- Check: the scripts' tests green, `mirror-check.mjs` run for real against
  the GitLab mirror (read it with `GIT_SSH_COMMAND="ssh -i
  $HOME/.ssh/gitlab_mirror_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes"`;
  it will name your new branches as missing, which is the truth), and the
  `mirror.yml` push job showing as skipped while `MIRROR_GIT_URL` is unset.
  The weekly check job does not look at that variable (Homer's review found
  the handoff said it did); write what is true.
- The release workflow attaches the bundle to a GitHub release. While the
  repo is private the release is private; once John makes the repo public,
  every release is public, sources under NC and ND terms included. Say so in
  the PR and leave it to John.
- The deploy key is the lead session's job. Do not make a key, set a GitHub
  secret or variable, or tell John to make a key. When `mirror.yml` is in a
  PR, say so in your report. If John asks you about the key, send him to the
  lead session's message; if he then tells you his GitLab steps are done,
  send the lead one line.

**Rules that bind every phase**

- Every new gate gets its failing case first, says how much it examined, and
  fails when it examined nothing. Mutation-check a guard by hand before
  trusting it. A gate that compares a thing to itself reports green forever.
- Never commit raw TLG files, beta code, or the Diogenes XML. `build/` stays
  ignored.
- No new npm or Python package without its reason in the commit message.
- `shared/` is a per-reader copy, not a submodule: port per hunk, never sync
  a directory from another reader.
- Yours to do without asking: commit early in your worktree, push your
  `claude/` branches to `origin`, and open PRs. Use `git add` with explicit
  paths, and check `git status --short --ignored` after adding files.
- John's alone: merging a PR, any deploy, any push to a host other than
  `origin`, new accounts, spending (CI minutes among it), adding a licence
  file outside the draft PR, making anything public, rewriting history. If
  John tells you in your own session to merge, that is his word: do it, and
  tell the lead session in one line so the two sessions do not both merge.
- John reads on his phone and wants short messages. A step that needs his
  hands goes to him once, from one session, as a link, the text to paste, and
  the taps. A decision goes to him as one question with its options and your
  recommendation, the trade-offs in a few lines.
- Disk (John, 2026-11-21: mind the disk, and pause if it is too low): run
  `df -h /` before every install, download, unpack, and export. Under 5 GB
  free, or a step that would take it under: delete your own build output and
  temp files, check again, and if it is still under, pause and report with
  the number. Delete export files, `build/`, and temp files as soon as a
  phase's checks are recorded. Never delete anything outside your own
  worktree and scratch folder.
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

Done means: four PRs open or merged in `johnhboyer-sys/greek-plays` (phases
1, 2, 3, and the licence), each with its machine-run checks green and quoted
in the PR body, each reviewed by another model family with its findings fixed
or answered, `HANDOFF-PORTABILITY.md` current, and your worktree's build
output and installs deleted.
