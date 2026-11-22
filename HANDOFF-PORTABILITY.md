# Handoff — portability, mirrors, and backups (four readers and Grammata)

Written 2026-11-20 from an audit of the repos; rewritten the same day when
phase 0 began. Scope: `aristotle-reader`, `plato-reader`, `homer-reader`,
`greek-plays`, and Grammata (`grammar-site`, `grammars`, `classical-grammars`).
Aristotle goes first; the others take each change as a per-hunk port (`shared/`
is copied between the repos, never synced as a folder).

## State (2026-11-21)

Phases 0, 1, and 2 are on `main`: John merged PRs #228, #231, and #232 on
2026-11-21 (main at `5f2b93ad9d`). Phase 0 is done but for the steps that
wait on John (the GitLab mirror, two of the four snapshot copies). Phase 1 is
done. Phase 2 is done but for the bundle on two hosts, which waits on John's
accounts: the site serves its own fonts, test 3 is green, CI builds the whole
site on Linux with data byte for byte live's, and the Docker image builds and
serves every file. CI and the image build passed on the merged commit, which
was the first build of phases 0 to 2 together with main's own share-card
changes. The part of phase 3 that needs no account is on `main` too (PR #233,
merged by John's yes on 2026-11-21, main at `1e1062a539`). John made a GitLab
account the same day (`johnhboyer`), and all seven repos now have a private
git mirror there, each checked whole. The workflow that keeps Aristotle's
mirror current is on `main` (PR #234, merged by John's yes the same day, main
at `b2853f1f41`), and its deploy key, secret, and variable are set. Aristotle
only; no
sibling repo has changed.

| Phase 0 step | State |
|---|---|
| Snapshot of each live site, with checksums | Done for all five; each folder and archive verified |
| Leak check on the snapshots | Done; Aristotle passes all five deploy data gates |
| Copies: GitHub release, iCloud, Google Drive, external drive | iCloud and the flash drive done and verified; the other two wait on John |
| First git mirror on GitLab (seven repos) | Done 2026-11-21: seven private projects under `gitlab.com/johnhboyer`, pushed from GitHub with `mirror-git.mjs`; `mirror-check.mjs` found every ref at the same commit and each history whole (table in the phase 3 record) |
| List of unpushed work for John | Done; given to John, not committed |
| Plays history check | Done; findings below, John flips visibility |
| Diogenes version and Homer's export patch recorded | Done, below |

| Phase 1 step (Aristotle) | State |
|---|---|
| `extract` writes `corpus/greek/`; the build reads only those | Done: 45 files, 110,121 lines, 12.6 MB. Stage 1 runs no program |
| Guard on the committed files, failing cases first | Done: every character of every line must be Greek or one of 29 listed marks; one named exception (Prob 944a9) |
| `merge_juv.py` folded into `extract` | Done: `extract` calls its `merge_spine()` for work 918 |
| Same output as live (test 2, data) | Done: a full build with the Diogenes export off the machine made 9,770 data files, each byte for byte what live serves |
| Snapshot diff as a script | Done: `scripts/compare-snapshot.mjs`, data and pages. Not a CI step; see below |
| Morpheus table and LSJ pinned by checksum, folder from the environment | Done. Check: `aristotle_pipeline.inputs check`, run by `build:public`. Fetch: `aristotle_pipeline.inputs fetch`, from the Diogenes 4.7.2 Mac zip (186 MB, pinned); both files in the release match the pins byte for byte. The fetch is on the phase 2 branch |
| `/tmp/perseus-ne` and other machine paths out of the public build | Done: gone from `EN.yaml` and `config.py`. The manifests still name Diogenes.app, as the local default for `extract` and the two inputs |
| CI runs the full build and uploads the bundle | Done: the `site` job in `ci.yml`. Its first run on GitHub passed in 9 minutes (tests 1 and 3 on Linux). The bundle it uploaded verifies against its `SHA256SUMS`, and its 9,770 data files are byte for byte what live serves (test 2, data, for a build made on Linux with no laptop) |
| Pages match live (test 2, app) | Done: built with the live data address, 7,627 of 7,845 app files are identical, and 213 pages and 5 renamed bundles are byte-equal once 11 named swaps are applied (three Svelte classes, computed from this checkout's path; the five bundles that hold them; three island ids); nothing else differs |

| Phase 2 step (Aristotle) | State |
|---|---|
| Build parameters for origin, base path, and the Grammata address | Done: `SITE_ORIGIN`, `SITE_BASE` (`scripts/site-params.mjs`, read by the Astro config and the link check alike), `PUBLIC_GRAMMATA_LOOKUP`; `robots.txt` is written by the build. Unset, the build is byte for byte what it was |
| Data root | Was already a parameter (`PUBLIC_DATA_ROOT`); unset, data is under `<base>/data` on the site's own origin, which is the mirror bundle's shape |
| A build at a test base path passes the link check | Done: `/mirror/` at another origin, 7,563 pages, 414,408 links, 0 broken |
| Self-host the fonts | Done: `app/public/fonts/`, 94 files and 1.82 MB for the eight families, every file Google served, with each family's licence. No page names a Google font host |
| No outside calls (test 3), as a browser test | Green with its default list, at `/` and at `/mirror/`: `scripts/check-no-outside-calls.mjs` sees one outside host asked for, Grammata. It was red on Google's two font hosts until the fonts moved into the site |
| The mirror bundle, without the host files | Done: `scripts/make-bundle.mjs` packs a same-origin build as one `.tar.gz` with `SHA256SUMS`, leaves out `CNAME` and the Google verification page, refuses a build that holds `_redirects` or `.assetsignore`, and runs the deploy's data gates first. The real build: 17,613 files, 889 MB, 186 MB packed |
| `Dockerfile`, `ARCHITECTURE.md`, `RESTORE.md` | All three written. The `Dockerfile` (the full build, then Caddy) is built and tested by `.github/workflows/image.yml`, which passed on its first run. `RESTORE.md` has a log of which of its steps have been run |
| A check for a served copy | Done: `scripts/check-served.mjs` asks a host for every file a bundle's `SHA256SUMS` names and compares the bytes |
| The bundle on two candidate hosts | Waits on John (accounts). The bundle and the check for a host are ready |

| Phase 3 step (Aristotle) | State |
|---|---|
| Push a repo to a second git host | Done: `scripts/mirror-git.mjs`, run for real against GitLab for all seven repos |
| The deploy tags its commit | Done: `npm run deploy:cloudflare` tags `deploy/<date>` and pushes the tag. Not yet run in a real deploy |
| A release for each deploy tag | Written: `.github/workflows/release.yml` builds the tagged commit's bundle on a clean runner and attaches it and its `SHA256SUMS`. Its build steps are CI's `site` job's (one shared action, which passed on its first run in #233), then a check of the bundle's data against the primary's data host. The release step itself runs first at the next deploy after it merges |
| `mirror.yml`: git on every push, the site on a release | The git half is written, with the weekly check as its second job. Its deploy key is on the GitLab project (write access, and allowed to push to `main`, which GitLab protects), the secret `MIRROR_GIT_SSH_KEY` holds the key, and the variable `MIRROR_GIT_URL` holds the address (all 2026-11-21). First run, on the push of `b27f08b244`: `33 of 33 refs match the source after the push`. The site half waits on decision 6 |
| Check for a stale or silent mirror | Done: `scripts/check-mirrors.mjs`. Run for real: `1 of 1 mirrors whole and current` (GitLab: 32 of 32 refs, 1,609 commits). `mirror.yml` runs it weekly and opens an issue on failure. That job's first run, started by hand on 2026-11-21: `33 of 33 refs match; history: 1612 commits, whole`. There is no release yet, so it had no site list to check, and its issue step has never fired |
| `mirrors.json`, shown on the attribution page | The file names the GitLab mirror. The page does not read it: the mirror is private, so there is nothing a reader could open |

Next: Plato's deploy
key ("Sessions", below); and John's two candidate hosts for the bundle
(decision 6; `check-served.mjs` is the test). The sibling repos get their own
`mirror.yml` and their own deploy key in their ports; until the last one has
its key, the account key below stays.

### Phase 3 record

**GitLab mirrors (2026-11-21).** Seven private projects under
`gitlab.com/johnhboyer`, each made by its first push, each pushed with
`mirror-git.mjs` from `https://github.com/johnhboyer-sys/<repo>.git` and then
checked with `mirror-check.mjs` (which clones the mirror):

| Repo | Refs matching | Commits, history whole |
|---|---|---|
| `aristotle-reader` | 32 of 32 (less `gh-pages`) | 1,609 |
| `plato-reader` | 30 of 30 (less `gh-pages`) | 605 |
| `homer-reader` | 11 of 11 (less `gh-pages`) | 809 |
| `greek-plays` | 22 of 22 | 1,407 |
| `grammar-site` | 12 of 12 | 214 |
| `grammars` | 4 of 4 | 610 |
| `classical-grammars` | 1 of 1 | 4 |

Each project answers 404 to a request with no login, and refuses an anonymous
`git ls-remote`: private, as the plan says every mirror starts. Making one
public is John's call, and for the plays it waits on the same history check
as GitHub's. The mirrors are a copy as of that push. Nothing keeps them
current yet.

The push used a key made for it on John's Mac
(`~/.ssh/gitlab_mirror_ed25519`, no passphrase), which John added to the
GitLab account. It can write to every project there. Once each repo's CI has
its own deploy key, take this one off the account and delete the file.

**The mirror workflow.** `.github/workflows/mirror.yml`, two jobs. `git`, on
every push of a branch or tag: `mirror-git.mjs` from GitHub to the address in
the repository variable `MIRROR_GIT_URL`, with the deploy key in the secret
`MIRROR_GIT_SSH_KEY`; with no address set the job is skipped and shows as
skipped. `check`, weekly and by hand: `check-mirrors.mjs`, with the newest
release's `SHA256SUMS` if there is a release; a failure opens an issue, or
adds to the open one. `.github/actions/mirror-key` writes the key where only
the job can read it and pins GitLab's host keys from
`.github/mirror_known_hosts` (read 2026-11-21; all three fingerprints match
the ones GitLab publishes). Codex read the three
files and found four things: a second Authorization header from the
checkout's own stored token (fixed: `persist-credentials: false`); a host key
could be trusted from the runner's global file (fixed); an empty key stopped
the check job, which a site mirror does not need (fixed); `mirrors.json` was
empty (it now names the mirror).

GitLab protects `main` on a new project: no force push, and only maintainers
push. That is the mirror's rule too (`mirror-git.mjs` never forces `main`),
so keep the protection and add the deploy key to the branch's "allowed to
push" list.

**Aristotle's deploy key (2026-11-21).** A key made for the workflow alone
(ed25519, fingerprint `SHA256:Ru45E76yhk0FJB2a9MmB3n5d5TKzoDObZO0pyNRt2Is`,
titled "aristotle-reader mirror, GitHub Actions, 2026-11-21" on GitLab). John
added the public half to the `aristotle-reader` project with write access and
to `main`'s "allowed to push and merge" list; force push to `main` stays off.
The private half is in the GitHub secret and nowhere else. Tried from this
Mac with the workflow's own ssh options and host-key file before the first
run: it reads `aristotle-reader` (32 refs) and GitLab refuses it on
`plato-reader`. The copy on this Mac was deleted once the first run passed.
A sibling's port makes its own key the same way: GitLab's deploy-key settings
need John's login, so he pastes the public half.

The first runs (2026-11-21, on `b27f08b244`, both green): the `git` job
pushed and found 33 of 33 refs matching, `gh-pages` left out; the `check`
job, started by hand, cloned the mirror and found 33 of 33 refs and 1,612
commits, whole. The merge of #234 was the first push to `main` through the
deploy key: green, and `main` is at `b2853f1f41` on both hosts. Not yet seen:
a tag push, and the check's failure path on GitHub (the issue).

**Git mirror.** `node scripts/mirror-git.mjs --source=<remote>
--mirror=<remote>` fetches the source whole into a temp folder (never from
the checkout it runs in: a CI checkout is shallow), pushes every branch and
tag but `gh-pages`, and compares `git ls-remote` on both with
`mirror-check.mjs`'s comparison. A mirror is a backup, so it gives way slowly:
`main` and every tag go without force, and a rewritten `main` or a moved tag
is refused, left as it was on the mirror, and fails the run. Other branches
are pushed over; a refused ref does not hold the others back. Nothing is ever
deleted from the mirror. An address must be a folder that exists, `https://`,
`ssh://`, `file://`, or `user@host:path`, and one with a password in it is
refused. It does not prove the mirror's history is whole (a mirror that was
shallow before, with the right tips, passes); `mirror-check.mjs` without
`--tips-only` does, by cloning it. Tests use real repos in a temp folder.

**Deploy tag.** After the Worker deploy succeeds, `deploy-cloudflare.mjs` tags
the commit `deploy/<date>` (then `<date>.2`, `.3`: one past the highest number
this checkout or origin holds) and pushes the tag. No tag, with a line that
says why: any changed or untracked file in the tree (the first three are
named), a commit origin already holds a deploy tag for, `--no-tag`. Origin's
tags are read with `ls-remote`, which writes nothing locally. A tag whose push
fails is removed locally, so the next deploy tries again. A failure here is
printed with the two commands that tag by hand, and never fails the deploy,
which is done by then. Tests run the step against a real checkout with a bare
origin.

**What the tag cannot know.** It names `HEAD` when the deploy ran. Nothing
ties `app/dist` to that commit: a build made at one commit and deployed after
a checkout of another is tagged at the other. The Release workflow holds the
tag to its word for the data: before it publishes, `check-served.mjs
--part=data` asks the primary's data host for every data file of the bundle
and fails the release when one differs. Run by hand against the bundle CI
built: a sample of 196 of 9,770 files, all the listed bytes. The pages cannot
be held the same way (a build's page bytes vary), so a tag at a commit whose
pages differ from the deployed ones and whose data does not is still released.

**Release.** A push of a `deploy/*` tag runs `.github/workflows/release.yml`:
the shared action `.github/actions/site-bundle` (the steps CI's `site` job
ran: inputs by checksum, `build:public`, the bundle with its gates, the
no-outside-calls check), then `gh release create` with the bundle and the
`SHA256SUMS` from inside it. So the release is built with no laptop, the way
every pull request is tested. Between the two, the data check above. A
release that exists is never written over.
This changes the plan's first bullet, which had the deploy script attach a
bundle built on the laptop. After it merges, every deploy publishes a public
release of about 187 MB; `--no-tag` holds one back.

**Mirror check.** `mirrors.json` is `{ "git": [{name, url}], "site": [...] }`.
`node scripts/check-mirrors.mjs --source=<the repo> --sums=<the latest
release's SHA256SUMS>` holds each git mirror to the source (every branch and
tag at the same commit, and the history whole, by cloning it) and each site
mirror to the release: it must serve that release's own `SHA256SUMS`, or it
is stale; then its files are asked for and compared with the release's list
(`--every=N` for a sample). One bad mirror fails the run and does not hide
the others. It fails when the list names no mirror, so it fails today. This
replaces the plan's `version.json`: the bundle already carries the list, and
a release has it as its own asset, so no new file is needed. Tests use real
repos and a real http host.

**Review.** Codex (GPT-6.1-Sol) read the three pieces and found ten things,
none in the workflows. Fixed, each with a test first: `--no-force` could take
`main` off the never-forced list; git's remote-helper address form
(`https::https://user:pass@…`) passed the password check and was printed; an
address starting with `-` reached git as an option; a tag whose push failed
stayed local and blocked every later try; an untracked page counted as a
clean tree; `git fetch --tags` could fail on a local tag of another name, and
ran before the cheap skips. Left, and said in the code: a refused `main` does
not hold other branches back (meant); a mirror that was already shallow
passes (the other script's job); a deleted highest number can be given out
again; the tag cannot know what `app/dist` was built from (the release's
data check, above, catches it for the data).

A second Codex read took the mirror check, `--part`, and the release's data
step, and found eight things, none in the workflow. Seven are fixed, each
with a test first: a `--source` with a password was printed; a throw in one
mirror's check stopped the run and hid the results already made; a list
behind a byte-order mark passed as the release's; a mirror could send its
list's address to another host; a missing `--source` kept the site mirrors
from being checked, and a missing or broken list the git ones; `--part` still
asked for a folder's address when the part held an `index.html`, and left
dot files out. The eighth (a mirror with one whole branch and one shallow
one passes) did not hold when tried: the clone comes out shallow and the
check fails.

### Phase 2 record

**CI built it on Linux (2026-11-21).** The `site` job's first run on GitHub
(run 44932431816) fetched the two inputs, ran `build:public`, packed the
bundle, and passed the no-outside-calls check, in 9 minutes. The artifact,
downloaded and unpacked: `verify-snapshot.mjs` read 17,716 of 17,716 files
against `SHA256SUMS`; `compare-snapshot.mjs` found 9,770 of 9,770 data files
byte for byte what the 2026-11-20 snapshot of live holds; the no-outside-calls
check passed on the unpacked folder. The pages were not compared with live's:
they carry this branch's changes, and a checkout's folder still names three
Svelte classes (the phase 1 record), so that comparison belongs to a build of
the commit live was built from.

**A check for a served copy.** `node scripts/check-served.mjs
--origin=<host> --sums=<SHA256SUMS>` asks a running host for every file the
list names (`--every=N` for a sample, which the output says) and fails unless
each answers 200 with the listed bytes; each folder's address serves its
index; pages, stylesheets, scripts, and SVGs come with a type a browser takes;
a page address that cannot exist answers 404 with `404.html`, and a data
address that cannot exist answers 404. An `index.html` may redirect to its own
folder on the same host, as some hosts do. It is the check for the Docker
image, for the two candidate hosts, for a mirror, and for a restore. Against
the Linux-built bundle on a test file server it read 17,715 files in seven
seconds, all matching, and failed on the one true fault: that server has no
404 page. Failing cases first (27 tests); 23 of 24 hand-made breaks fail a
test, and the other repeats a guard above it. Codex (GPT-6.1-Sol) read it and
found five gaps (an index sent to another host passed; a type matched by its
start; only a page address was probed for 404; a redirect's path compared
undecoded; fractions taken as counts), all fixed.

**Dockerfile.** One file: the build stage is `build:public` and
`make-bundle.mjs` on `node:22.23.5-bookworm` with uv 0.13.9, the inputs
fetched by checksum; the serve stage is `caddy:2.11.9-alpine` with the
unpacked bundle at `/srv` and a `Caddyfile` that answers a missing page with
`404.html`. Images are pinned by version tag, not by digest. This Mac has no
container tool, so `.github/workflows/image.yml` is its only test: build the
image, run it, and run `check-served.mjs` against it with the list from inside
the image (which proves Caddy serves the folder as it is; the folder's own
truth is the bundle step's gates). It runs on a pull request only when those
files change, and on every push to `main`. Codex found nothing in the
Dockerfile, the Caddyfile, or the two workflows. Its first run (run
44938088200, 2026-11-21) passed with no change to any of the files: the image
built in 11 minutes, and the container answered 17,715 of 17,715 files with
the listed bytes, 7,560 folder addresses with their index, and a missing page
with `404.html`.

**RESTORE.md.** Three paths (a bundle, the source, Docker), what a restore
does not bring back, and a log. It says plainly that GitHub is today the one
place a stranger can restore from; mirrors are phase 3. Codex found two
commands that would fail as written; fixed.

**The parameters.** `SITE_ORIGIN` is the origin canonical links, cards,
`robots.txt`, and the sitemap name; `SITE_BASE` is the path the site is
served under. `scripts/site-params.mjs` checks both and refuses a value
that is not a bare origin or a path with a slash at each end.
`app/astro.config.mjs` and `scripts/check-links.mjs` read them there, so a
build and its link check cannot disagree. A mirror keeps the default origin:
its canonical links name the primary site. `PUBLIC_GRAMMATA_LOOKUP` is read
in the word popup and the lemma page, each with the old address as its
default. It is read in place in both: a module of its own became a bundle of
its own and renamed a script on 7,552 pages, which `compare-snapshot.mjs`
caught.

**How it was checked.** Built with nothing set but the live data address,
`compare-snapshot.mjs` reports what it reported before the change (7,627 of
7,845 identical, 213 pages and 5 bundles equal under the same 11 swaps), the
generated `robots.txt` among the identical files. Built with
`SITE_BASE=/mirror/ SITE_ORIGIN=https://mirror.example.org` and no data
address, `SITE_BASE=/mirror/ node scripts/check-links.mjs app/dist` finds 0
broken of 414,408 links, and the canonical link, the card image,
`robots.txt`, and the sitemap name the new origin and base. Eleven
hand-made breaks of the parameter checks each fail a test. Codex
(GPT-6.1-Sol) read the change and found one thing: `app/public/CNAME` still
names the primary host in every build, a GitHub Pages file from before the
move. It stays for now; the mirror bundle must leave it out, with the other
host files.

**The bundle.** `node scripts/make-bundle.mjs --out=<file.tar.gz>` packs
`app/dist` from a build with no data address: every file but `CNAME` and
the Google verification page, plus a `SHA256SUMS` that names each one.
Unpacked at a web root it is the site. It refuses a build made for data on
another host (a data root in `sw.js`, or `_redirects` or `.assetsignore` in
the folder), a link, a Finder file, and a name that is not plain ASCII (GNU
tar and bsdtar read a listed name with a backslash or an edge space
differently, and a Mac's tar unpacks an accented name composed another way;
the site has no such name). Before it writes, the data passes the five gates
`deploy:cloudflare` runs, now one exported `dataGates`. A file's sum is
taken at its first read and every later read must match; the archive is
unpacked and read back against its sums; the sums inside it must be the ones
the run took. So the bytes a gate passed are the bytes packed. It never
writes over a file. Checked by 17 tests written first, 40 hand-made breaks
(37 fail a test; three only skip work a later guard repeats), and three reads
by Codex, whose six findings are fixed and tested (the last: the read-back's
own `tar` in `verify-snapshot.mjs` now gets a bare environment too). The archive's bytes are
not the same from run to run (tar keeps file times); the sums are.

**No outside calls (test 3).** `node scripts/check-no-outside-calls.mjs`
serves a built folder from 127.0.0.1 under `SITE_BASE` and opens it in
Chromium whose proxy is a second local server that forwards nothing. Nothing
skips that proxy, this machine's own addresses included; it hands the site's
requests to the file server and writes down and refuses every other, so
nothing leaves the machine and a call from a page or from the service worker
is seen alike. Before the visits a made-up `.invalid` host must be seen over
http and https, or the run fails ("the block is not working"). Six visits:
the Categories page (5,000 visible Greek and 5,000 visible English letters),
a word popup (headword and a gloss or parse, on screen), a search for λόγος
(a hit that links to a page of this build), `lemma/logos/` (headword, gloss,
works list), the work page again under the service worker, and once more
with Cardo and EB Garamond chosen. After each visit goes quiet the
`preconnect` and `dns-prefetch` links are read off every frame of every
window, since
Chromium names no host for those through a proxy. The run fails on any host
not on the list, a visit that did not find its thing, a 404 from the site,
an uncaught page error, a page that never goes quiet, or zero requests. The
allowed list is exact names: `grammata.pages.dev` and the packs bucket
(decision 4); `--allow=` replaces it.

Before the fonts moved (2026-11-20): `FAIL … 2 outside hosts are not allowed:
fonts.googleapis.com x16 …, fonts.gstatic.com x4 …`. Since (2026-11-21), with
the default list: `ok app/dist at /: 6 of 6 visits, 310 requests to the site
(0 not found), 1 outside host asked for, it allowed (grammata.pages.dev x1)`,
and the same at `/mirror/`. The word popup works with Grammata refused
(Grammata is asked for only by the lemma page's LSJ entry, which then says
"Lookup failed", and by the popup's "Show the LSJ entry").

**Fonts.** `app/public/fonts/fonts.css` is Google's CSS for the queries the
pages used to send, with each file's address made local: 149 rules, 94 woff2
files, eight families (Gentium Book Plus, Literata, Sofia Sans, Oswald; Bodoni
Moda and DM Mono for the print masthead; Cardo and EB Garamond, the reader's
optional faces), each with its OFL text. Every subset Google served is kept.
The first cut kept only latin and greek, as Plato's repo does; a scan of the
built site then found U+0323 (406 underdots in the Athenian Constitution) and
U+0301 (the Poetics' scansion), which only the vietnamese and cyrillic files
cover, and a page of the Athenian Constitution does load the vietnamese
file. Keeping all 94 makes the type what it was, with no ruling to make per
face. Plato's four-subset set should get the same scan at its port.

`BFonts.astro` links the stylesheet with `data-reader-font="cardo garamond"`.
`loadReaderFace` in `shared/components/Reader.svelte` now matches that
attribute as a word (`~=`), so on a page that declares the faces it adds no
link; its Google addresses stay for the desktop app, which mounts the same
component and has no font files. That is the hunk each sibling takes, with
its own stylesheet naming the faces. `sw.js` still has its branch for
Google's font hosts; the site can no longer reach it, and it was left alone.
Checks: `scripts/__tests__/fonts.test.mjs` holds the stylesheet and the folder
to each other (18 tests); of 7,563 built pages, 7,560 carry the link and none
names a Google font host (the other three never had web fonts); in Chromium
all 149 faces are declared, none in error, and Cardo and EB Garamond load from
the site; taking the attribute off one built page turns test 3 red at the
typefaces visit. Codex (GPT-6.1-Sol) read it: no path to Google and no
missing face found; two holes in the font test, fixed.

The fresh clone caught one thing no test here had: `.gitignore`'s `*.TXT`,
the guard on raw TLG files, matches `.txt` on a Mac's disk, so the eight
licence texts had stayed out of the commit in silence. The ignore file now
excepts `app/public/fonts/OFL-*.txt`. On GitHub the font test would have
failed for it; here only the clone showed it.

An Opus 5.5 agent wrote it with its failing cases first (16 browser fixtures
in `scripts/__tests__/check-no-outside-calls.browser.mjs`, run by hand with
`node --test`, since they need Chromium; 10 tests without a browser in
`npm run test:scripts`). I added the link-hint read, the typefaces visit,
and the fixes from Codex's two reads (three High, ten Medium, among them:
calls to this machine on another port skipped the proxy; hidden text counted
as shown; a search hit to another host passed; an endless page passed; the
page-error excuse matched by substring; a second window was not read). The
last three fixes have tests and hand-made breaks but no third read. Every
guard and every visit's assertion was broken by hand and caught.

What it cannot see, by its method: what an allowed host's script would call
in turn (it is refused, so it never runs; seeing that needs a run that lets
Grammata through); non-HTTP traffic such as WebRTC (the site has none); a
link hint removed before its visit ends; anything a reader does that the six
visits do not. Playwright is not a package of this repo: the script finds it
as `app/scripts/check-redesign.mjs` does and throws if it cannot. The npx
copy here is newer than the browsers in the cache, so the script falls back
to the newest headless shell already there. The CI job installs Playwright
1.65.1 and its Chromium with `npx` for this one step; it is no package of
the repo.

**Known and left.** Saved searches keep whole paths, base included, in the
browser's storage, so a saved search does not follow a site to another base.
The footer links to the sibling readers by name. One test in
`shared/__tests__/components.test.ts` ("restores English only as I typed
it") failed once in a full run and passed three times after: a timing
fluke, not this change.

### Phase 1 record

**The line files.** `python -m aristotle_pipeline.extract --all` (in
`pipeline/`, with `TLG_DIR` set) reads the Diogenes export under the
git-ignored `build/export`, running Diogenes only when a work's XML is missing,
and writes `corpus/greek/<Work>.tsv`: three heading lines (work, edition,
columns), then one printed line per row under its labels (Bekker column; Busse
page for *Isa*; chapter and section for *AthPol*; book, chapter, and section
for *MM*). It makes and checks every file before it writes the first, and
refuses to replace a file with a shorter one without `--allow-fewer-lines`.
`pipeline/aristotle_pipeline/greek_lines.py` is the format; stage 1 parses the
rows exactly as it parsed the XML. *Plant* and *RhetAl* still read XML vendored
under `sources/`. `APr.tsv` and `APo.tsv` hold the same 6,040 lines: one
edition prints both Analytics.

**The text is kept as exported, not NFC.** Decision 1 says "NFC text". NFC
would rewrite three Greek punctuation marks on 24,978 lines (U+0387 ano teleia
to U+00B7, U+037E question mark to `;`, U+0374 numeral sign to U+02B9) and so
change every served page, and test 2 could not pass. The files hold the
characters the export has, with runs of white space made one space. John has
been told; a normalized copy is one line in `extract` if he wants it.

**How it was proved.** (1) The spine JSON stage 1 writes for all 47 works,
public and private manifests (94 files), is byte-identical before and after the
change. (2) With `build/export` moved off the machine and `TLG_DIR` unset,
`npm run build:public` ran to the end (47 works, 7,560 pages, 0 broken
links, 5 min 7 s) and `node scripts/compare-snapshot.mjs
--sums=<snapshot>/SHA256SUMS --prefix=data/ --build=app/dist/data
--live-only=docs/portability/aristotle-live-only-2026-11-20.list` reported
9,770 of 9,770 files identical, with the 23 live-only files allowed. Compare
`app/dist/data`, not `build/dist`: the 48 `rows.json` files are Astro
endpoints and exist only after the site build. Then the app, built as the
deploy builds it (`cd app && PUBLIC_SHOW_PRIVATE=0
PUBLIC_DATA_ROOT=https://aristotle-data.johnhboyer.com npm run build`):
`node scripts/compare-snapshot.mjs --sums=<snapshot>/SHA256SUMS --prefix=app/
--build=app/dist --pages=<snapshot> --svelte=shared/components
--skip=data/,.assetsignore,_redirects`
reported 7,627 of 7,845 files identical, 213 pages and 5 renamed bundles
equal once 11 names are swapped, 0 differ. Those are the 213 pages and 5
bundles docs/cloudflare.md already records for any rebuild of one commit.

Why they differ, and how the script knows. Svelte names a component's scoped
class `svelte-<hash>`, the hash being of the component's file path, and a
component outside the app's root keeps its whole path
(`svelte/src/compiler/state.js`). `Search`, `Phrases`, and `CommandPalette`
live in `shared/`, so their three classes change with the checkout's folder;
the five bundles that hold those classes get another file name, and three
island ids, which hash the island's HTML, change with them. The script
computes the class Svelte gives each component under `--svelte` in this
checkout (`svelteClass`: this worktree's three match the build exactly) and
accepts a class swap only when the new name is one of those. A bundle swap
needs two bundles alone in sharing a stem, and equal contents under the
same swaps. Every swap is printed and must be one to one. Then the
snapshot's bytes, with exactly those whole names replaced, must be the
build's bytes. Nothing is masked by shape and no page is read for
"context". The snapshot's copy is checked against `SHA256SUMS` as it is
read.

What it cannot see, stated in the script's heading: a word that changes
into the exact class of one of this checkout's components (only the new
name is computed: the folder the live site was built in is not known, and
235 past session folders were tried against the three old hashes without a
match); a renamed bundle's exact file name in a page's words; an
`<astro-island uid="…">` written out as text whose id changed.

This matters for phase 2: a CI build will not be byte for byte a laptop
build, by these same three classes, until the hash is pinned (Svelte's
`cssHash` option). Pinning changes served bytes and is John's call. When
both folders are known, as they will be in CI, the swap table can be
computed outright, old names too.

Without `PUBLIC_DATA_ROOT` the build is the GitHub Pages build and 16
bundles and `sw.js` differ. (3) 76 hand-made breaks of the new guards (44
in the pipeline, 32 in the page comparison) each fail a test. (4) Codex
(GPT-6.1-Sol) reviewed the pipeline code twice and the page comparison six
times. The page comparison failed five: masks by shape hid a changed word;
swaps learned from the page were applied to its words; three rounds of
reading HTML for "where a class may sit" each missed a case
(`<style-guide>`, a single-quoted attribute, a no-break space). The sixth
design, the computed class, drew two cheap fixes (check the snapshot copy
against the list; count a bundle name the snapshot already used) and the
three limits above; a seventh, narrow read of those two fixes found
nothing. On the pipeline:
Its first pass found three real holes in the guard (a fourth heading line
could hold anything; punctuation hid beta code from the pattern; nothing
proved the text was Greek). Its second found that "every letter is Greek"
let through Latin that Python does not call a letter (ⓗⓔⓛⓛⓞ, a combining a).
So the rule is a list, not a pattern: a character is Greek by its Unicode
name, or it is one of the 29 marks the corpus's editions print
(`greek_lines._MARKS`), or the file fails. A new edition's new sign fails
`extract` until someone looks at it and adds it.

**What the review left, on purpose.** (a) `rows_from_xml` raises on a
division that is not directly inside the level above it. The old
chapter-section reader read through such wrappers and the old *MM* reader
skipped them without a word; no file in the corpus has one, and stopping beats
guessing. (b) The edition line of a line file is free text; the corpus test
holds it to the manifest's `greek_edition`, the format check does not. (c) The
README in `corpus/greek/` is held to 4 KB and no markup; its words are for
review. (d) `compare-snapshot.mjs` cannot tell a file no build makes from one
this build lost: the `--live-only` list is a claim a reviewer reads.

**The 22 extra shards are in the bucket's key record.** `_deploy/keys.json`
is the union of every key any deploy has uploaded (the script never deletes),
so it names them and cannot say they are stale. What does: the build's own
`search-shards/index.json`, byte for byte live's, names none of the 22.

**Why the snapshot diff is not a CI step.** It proves that a change to the
build left the output alone, so it is run against the commit the snapshot was
taken at. Once a correction to the corpus merges, a difference is the
correction. The snapshot's checksum list (1.5 MB) is also not in the repo. Run
it by hand at each port, as above.

**The two outside inputs.** `greek-analyses.txt` and `grc.lsj.xml` are pinned
by sha256 and size in `pipeline/aristotle_pipeline/inputs.py`, hashed from
Diogenes 4.7.2's `dependencies/data`. `DIOGENES_DATA` names their folder; each
manifest's `sources.diogenes_data` (the path inside Diogenes.app) is the local
default. The public source is the Diogenes 4.7.2 release on GitHub
(`pjheslin/diogenes`, tag `4.7.2`). `python -m aristotle_pipeline.inputs fetch
--dir FOLDER` downloads its Mac zip (`diogenes-mac-arm64-4.7.2.zip`, 186 MB,
pinned by length and sha256) and takes the two files out; on 2026-11-21 both
matched the pins byte for byte, in the zip and in the Linux package alike.
The zip is used because Python's standard library reads one; the Linux
package (`diogenes-4.7.2.pkg.tar.xz`) is Zstandard under an `.xz` name, which
Python 3.12 cannot read. The fetch writes to `--dir` or `$DIOGENES_DATA` only,
never to the folder a manifest names, never over a file, and leaves the
folder as it was on a failure. 19 of 19 hand-made breaks of its guards fail a
test. Codex found four gaps in those rules (a rename could write over a file
that appeared meanwhile, or a dangling link; a failed second placement left
the first; parent folders were left behind; a failed work folder left the
folder) and one test that proved less than its name; all are fixed.

### Phase 1 baseline: a clean build already matches live

On 2026-11-20 a fresh worktree at `origin/main` (`6e800cdc03`) ran
`npm run build:public` to the end: 47 works, 7,560 pages, 0 broken links,
4 min 53 s. Against the Aristotle snapshot:

- **Data:** all 9,770 files the build makes are byte for byte what live
  serves. Live holds 23 more: the key record and 22 English search shards the
  index no longer names (the bucket never deletes).
- **App:** 7,845 files on each side. 7,614 are identical; 214 are equal once
  bundle hashes are masked; 16 bundles carry another hash; `sw.js` differs.
  The build ran without `PUBLIC_DATA_ROOT`, so the bundle hashes had to
  differ.

So test 2 is within reach, and the build's only inputs from outside the repo
are these:

1. **The Diogenes export, 86 files, 14 MB**, for three TLG authors: 0086
   (Aristotle), 0547, and 2034 (Porphyry, for the Isagoge). That is the upper
   bound on what `corpus/greek/` will hold.
2. **`pipeline/tools/merge_juv.py`, run by hand** after the export. It splices
   TLG works 018 and 037 into a made-up work 918 for *Juv*. No script calls
   it; the build fails at *Juv* without it.
3. **Morpheus and LSJ** from inside Diogenes.app (unchanged from the audit).

And the build's own call to Diogenes no longer works: `stage1_greek.run_export`
passes an environment with no `HOME`, and Diogenes 4.7.2 stops with "Could
not find user profile dir" (exit 25). Nobody saw it because the export was
cached, and the cache is now gone from every checkout. Run by hand with
`HOME` set and `TLG_DIR` at the iCloud folder, the export works. Phase 1's
`extract` has since replaced that call (it sets `HOME`), and the build no
longer has one.

## Goal

A reader must survive the loss of any one of these: John's laptop, the GitHub
account, the Cloudflare account, or the Loyola OneDrive folder. A stranger with a
clone and the written recipe must be able to build the site and serve it from any
static host.

Done means these tests pass, for each reader:

1. **Clean build.** A Linux container with no Diogenes, no TLG files, and no Mac
   paths builds the full site from a clone plus named, checksummed inputs.
2. **Same output.** That build matches the phase 0 snapshot of the live site:
   every data file byte for byte, every page byte for byte once the names a
   checkout's folder changes are swapped (`scripts/compare-snapshot.mjs --pages
   --svelte`; the phase 1 record says which names and why).
3. **No outside calls.** The built folder, served by a plain static server with all
   other hosts blocked, renders a work page, a word popup, a search, and a lemma
   page. Any allowed outside host is on a short list John has ruled on.
4. **Second copy of everything.** Source, built site, and corpus inputs each exist
   in at least two places run by different companies, with checksums, and a
   scheduled check reports when a copy is stale or gone.
5. **Restore drill.** Someone follows `RESTORE.md` from the mirror alone and gets a
   working site. The time it took is written down.

## What the audit found (checked again 2026-11-20)

| | Aristotle | Plato | Homer | Greek plays |
|---|---|---|---|---|
| GitHub repo | public, MIT | public, **no licence** | public, **no licence** | **private**, no licence |
| All heads and tags, less `gh-pages` | 127 MB | 11 MB | 26 MB | 137 MB |
| Old `gh-pages` history | 1,991 MB | 1,220 MB | 288 MB | none |
| `gh-pages` tip now | a redirect page | a redirect page | a redirect page | none |
| Host since 2026-11-19 | Worker + R2 | Worker + R2 | Worker + R2 | Worker, data inside (since 10-24) |
| R2 bucket (wrangler `r2 bucket info`) | 9,793 objects, 459 MB | 7,592 objects, 293 MB | 5,263 objects, 161 MB | none |
| Greek source | TLG 0086 via Diogenes | TLG 0059 via Diogenes | TLG 0012 via Diogenes | TLG via Diogenes; some Perseus and OCR editions |
| Diogenes export on disk | **none** | 9.2 MB | **none** | **none** |
| Fonts | Google Fonts at runtime | self-hosted | self-hosted | Google Fonts at runtime (15 source files) |
| Server code | none | none | none | Worker script: `/api/*` feedback form, email binding |

Each bucket's object count equals its `_deploy/keys.json` plus the record
itself, so the key record names everything in the bucket.

Grammata is larger than the first audit said. It is three repos
(`grammar-site`, private, 5 MB, the site; `grammars`, private, 1.1 GB by
GitHub's count, the data and its scripts; `classical-grammars`, public, 123 MB,
a one-way copy of `grammars`' `data/` and `scripts/` that CI builds from), a
Cloudflare Pages project (`grammata`), and an R2 bucket (`grammata-packs`,
17 objects, 85 MB). `lookup.js` fetches the word packs from
`pub-d505f3fd993b4e01b2ab095428d0493e.r2.dev`. It already builds and deploys in
CI with no laptop (`grammar-site/.github/workflows/deploy.yml`), using a
Cloudflare token held in GitHub's secrets.

The single points of failure, worst first:

1. **The live sites were the only full copy of what they serve.** `build/` is
   git-ignored in every repo; no Aristotle, Homer, or plays build exists on the
   laptop (one built Homer app sits in `~/Developer/homer-reader-speaker-alias/app/dist`,
   2026-11-18). `deploy-cloudflare.mjs` never deletes from R2; on 2026-11-20
   the bucket held 22 search shards no build makes, and nothing else (the
   baseline above). Phase 0's snapshots are now the second copy.
2. **The Greek comes from a licensed disc kept in cloud folders.** Diogenes
   reads the TLG from `~/Library/CloudStorage/OneDrive-LoyolaUniversityNewOrleans/TLG Files/TLG`;
   the plays' recipe names `~/Documents/CLAUDE CODE ARISTOTLE PROJECT/TLG Files/TLG`.
   Both folders list 3,690 files (644.5 MB), and on 2026-11-20 every file in
   both was a cloud-only placeholder: the laptop held no TLG bytes. That day a
   read of `TLG0086.IDT` from the OneDrive folder timed out, with OneDrive
   running; the same file read at once from the second folder, which is
   iCloud's Documents sync and so a copy outside Loyola. Nobody has compared
   the two. `TLG_DIR` points the build at either.
   Until phase 1, stage 1 (`stage1_greek.run_export`) shelled out to
   `/Applications/Diogenes.app/Contents/server/xml-export.pl` when the cache was
   missing; `extract` does that now, and only on John's machine. Stages 4 and 5 read `greek-analyses.txt` (121 MB, Morpheus) and
   `grc.lsj.xml` (116 MB, LSJ) from `/Applications/Diogenes.app/Contents/dependencies/data`.
   Every manifest hard-codes those paths.
3. **One Cloudflare account holds DNS, the Workers, the R2 buckets, and Grammata.**
   A mirror on another host does not help if the name `johnhboyer.com` stops
   resolving.
4. **LSJ entries load from two addresses John does not own.**
   `shared/components/WordPopup.svelte` and `app/src/components/LemmaPage.astro`
   import `https://grammata.pages.dev/t8/lookup.js`, and that script reads its
   packs from the `r2.dev` address above. A standing ruling (2026-08-29) says
   not to vendor, pin, or proxy the module.
5. **CI cannot build a reader.** `ci.yml` says so: "the corpus is machine-local".
   Deploys run from the laptop through wrangler's login.
6. **One GitHub account, one person, and work that is nowhere else.**
   `classical-philosophy-reader` has no remote: 788 commits on 39 branches
   exist only on the laptop. Aristotle has 28 commits on 8 local branches that
   no GitHub branch holds; `grammar-site` has 1. The main checkouts hold
   modified and untracked files (Aristotle 19 and 24, Plato 10 untracked, the
   plays 15 untracked), and Aristotle's local `main` is 371 commits behind.

## Decisions

All ruled by John on 2026-11-20 unless marked open.

1. **How the Greek enters the build: commit a derived file.** ("Yes, commit
   it.") One line-level file per work (work, page or column, line number, NFC
   text), made by a local `extract` command, in each reader's own repo
   (John: "in each reader's own repo"), in one folder that holds nothing else
   (`corpus/greek/`). Stage 1's parsing stays in the build. The Diogenes XML and
   the disc's beta-code files still never enter a repo. The ruling replaces the
   "never committed" comments in Plato's and the plays' `.gitignore` and the
   "Corpus source text is never committed" line in the plays' and Homer's
   CLAUDE.md; correct those in the PR that adds the files. Reopen the
   own-repo choice if a reader's files pass about 50 MB, if they change often
   enough to swell history, or if John wants one shared source for Moerbeke and
   the Lyceum reader.
2. **Second git host: GitLab.com for all seven repos, now.** Codeberg's terms
   (read 2026-11-20) bar CC NC/ND material in public repos and hold private
   repos to about 100 MB; Aristotle's plates, Homer's Kosmos Butler, and
   several plays sources are NC or ND. John: a Codeberg copy without the NC/ND
   files is possible later, and a third host later if need be. Both are open
   and neither blocks anything. (A copy without those files is a filtered
   history, not a mirror; price it before promising it.)
3. **Licences and visibility.** The plays repo goes public after the history
   check (findings below); John flips the setting himself. MIT for code in all
   four repos ("Yes, MIT + CC0"); CC0 1.0 on the `corpus/greek/` files;
   **CC BY 4.0 on John's own derived data** (alignments, chapter data,
   corrections, Bekker ticks); a per-source table for the rest. Data built from
   LSJ or Perseus texts keeps CC BY-SA 4.0. The table names editions, not the
   TLG (John's rule). Precedent John asked for: the CLLG FREED corpus puts
   CC0 1.0 on its TLG-exported texts and CC BY 4.0 on citation structure and
   metadata (gitlab.inria.fr/almanach/cllg/freed-corpus, read 2026-11-20).
4. **Grammata: keep the 2026-08-29 ruling; mirror Grammata too.** Nothing is
   vendored into the readers. Grammata gets a domain John owns, for the site
   and for the packs bucket; its address becomes a build parameter in every
   reader; it is mirrored and snapshotted like the others. Test 3's allowed list
   is two hosts (the site and the packs) until the packs move under one name.
5. **Where the mirror list shows: the attribution page.** All four readers
   have `/attribution/`. The list also goes in each README and on each mirror.
6. **Second live host: open until phase 2.** John will rule after a test of the
   real mirror bundle on two hosts. Limits read from each host's own page on
   2026-11-20: GitLab Pages 1 GB a site (Aristotle's bundle is about 900 MB);
   Netlify free 300 credits a month (20 a GB of bandwidth, 15 a deploy);
   Neocities free 1 GB, $5 a month for 50 GB; Bunny pay-as-you-go, $1 monthly
   minimum. **Archives: Software Heritage for source, Zenodo by hand for named
   releases, and the Internet Archive; no IPFS.** Zenodo allows 50 GB and 100
   files a record, so a release is one zip; a published record cannot be
   withdrawn. Software Heritage's own page sits behind a bot wall and was not
   read; check its terms before the first save. None of the three gets a copy
   until the licence table exists and the leak check passes.
7. **Old `gh-pages` branches: keep on GitHub, skip in mirrors.** Deleting them
   is a later question, and only once two verified snapshots exist.
8. **John's own actions** (no session can do these): confirm the iCloud TLG
   copy is whole, or make a private copy outside Loyola's OneDrive; the
   registrar and renewal date of `johnhboyer.com`, with auto-renew on; an export
   of the DNS zone; a GitHub account successor or a second owner; who gets the
   keys if he cannot act; a remote for `classical-philosophy-reader`.
9. **Snapshot copies: a GitHub release on each repo, iCloud Drive, John's
   personal Google Drive, and an external drive.**
10. **Open: export-shaped test fixtures.** `pipeline/tests/fixtures/stephanus/euthyphro_p2_3.xml`
    (9.4 KB, two Stephanus pages of the Euthyphro in the Diogenes export's
    markup) has been in `plato-reader`, public, since 2026-07-11, and was
    copied into `homer-reader` and `greek-plays`. Homer also has a 1.6 KB
    "synthetic" Iliad fixture with real opening lines, and Aristotle's pipeline
    tests carry short inline snippets. Phase 1's guard test must either allow
    short fixtures or these become synthetic text. John rules; a history
    rewrite on a public repo would be his call too.

## Phase 0 record

### Snapshots

Made by `scripts/snapshot-live.mjs` (this repo) on 2026-11-20, kept in
`~/Developer/reader-snapshots/2026-11-20/<site>/` with `MANIFEST.json` (every
file's address, size, hash, and how it was found; every 404 and redirect) and
`SHA256SUMS`. `scripts/verify-snapshot.mjs <folder or archive>` checks a copy;
so does `shasum -a 256 -c SHA256SUMS`.

| Site | App files | Data files | Bytes | Archive | Not found | Left open |
|---|---|---|---|---|---|---|
| Aristotle | 7,845 | 9,793 | 889 MB | 189 MB | 18 | nothing |
| Plato | 5,582 | 7,592 | 820 MB | 129 MB | 16 | nothing |
| Homer | 4,787 | 5,263 | 348 MB | 60 MB | 22 | nothing |
| Plays | 10,975 in all (data ships in the app) | | 444 MB | 106 MB | 20,753 guesses | the whole is unproven |
| Grammata | 4,725 | 15 packs | 2,130 MB | 445 MB | 8 | 2 bucket objects unnamed |

Aristotle's app count equals the 7,845 files `docs/cloudflare.md` records for
the 2026-11-19 deploy. The archives are `<site>-snapshot-2026-11-20.tar.gz`,
with `SHA256SUMS` at each one's root and a second `SHA256SUMS` beside them for
the archives themselves. "Not found" for the three R2 readers is old bundle
names in the last `gh-pages` tree, `.DS_Store` files, and `/favicon.ico`.

How each part was found, and what that proves:

- **Data on R2 (Aristotle, Plato, Homer):** every key in the bucket's key
  record, fetched from the data address, with its MD5 checked against R2's
  ETag. The bucket's object count equals the record plus one. This part is
  complete.
- **App on a Worker:** Cloudflare cannot list a Worker's files, so the app was
  walked from the sitemap, the last full `gh-pages` tree (the parent of each
  redirect commit), `app/public` at `origin/main`, and every same-origin
  address the fetched pages, stylesheets, and scripts name. A file that only a
  script builds the name of, and that no list names, would be missed. Every
  sitemap page was saved.
- **The plays:** no key record and no `gh-pages` tree. The data list came from
  `scripts/snapshot-candidates.mjs`: the site's own indexes (each work's
  manifest, `lemmata/_index.json`, `search-shards/index.json`), the three key
  records with the work and numbers taken out, and file names the plays' code
  mentions. Measured the same way against a reader whose real list is known
  each of the other three, from the other two's records): it named 97.8% of
  Homer's real keys, 95.6% of Plato's, and 99.6% of Aristotle's. The misses
  were each reader's own families (Homer's scansion, Cunliffe, and plates),
  Plato's per-translation files (its manifests list no translations; the
  plays' do), and search shards the index does not name (Plato's `accents`
  stream; 22 stale English shards in Aristotle's bucket). So the plays'
  snapshot is a floor, not a proven whole; phase 4's clean build is diffed
  against it.
- **Grammata:** the Pages site walked from its home page, `public/`, and
  `/t8/lookup.js` (no page links the module the readers import, so the list
  names it). The site has no sitemap and no 404 page: it answers any missing
  address with its home page and a 200. The first run saved nine such copies
  under names like `robots.txt` and `sw.js`; the tool now asks the host for
  an address that cannot exist and counts any file equal to that answer as
  not found. The packs were fetched by the 15 names in `classical-grammars`'
  `data/wordtool`, and each pack matches the hash in Grammata's own
  `manifest.json`. The bucket holds 17 objects, so two are not named by the
  repo and are not in the snapshot; the laptop's rclone token cannot list
  that bucket.

### Review of the tools

Codex (GPT-6.1-Sol) read the three snapshot scripts and returned 16 findings.
Ten were real gaps and are fixed, each with a test that fails without the fix:
the verifier followed links and missed names a Mac holds as one file; the
walk could save one address over another; a data file with no ETag passed
unchecked; an empty key record passed; a dead redirect left no trace in the
exit code; the link finder missed the bundler's own file lists and `url()` in
HTML. None had touched today's copies: the fixed link finder, run over all
five snapshots, named no address the walk had not tried; no two saved names
collide; every data file's ETag was checked; and all ten copies pass the
stricter verifier. A second pass found smaller gaps, fixed the same way: a
doubled slash in an address, a page sent under a file's name (the tool now
refuses `text/html` at a name like `x.js`), two more link shapes, and a
mirror check that compared branch tips only (it now clones the mirror and
runs `git fsck`, since a mirror pushed from a shallow checkout has the right
tips and no history). A third pass closed those and found three small
faults in the fixes, also fixed. Left as they are, on purpose: queries are dropped from
addresses (static hosts); a 404 that a page names, and a redirect that leaves
the site, are listed in the manifest without failing the run.

### Leak check

Aristotle's snapshot went through the five data gates `deploy-cloudflare.mjs`
runs (`scanForLeaks`, `scanGatedSlots`, `scanHeldWorks`,
`scanTranslationIndexes`, `scanSearchShards`), after a planted "Tredennick"
file failed the first as it must: 9,698 JSON files, the control word in 1,633,
no Ackrill, Tredennick, or Irwin, and Rackham only in the two files
`KNOWN_BENIGN` lists. The siblings keep no list of gated names; the same name
scan over their data (Plato 7,555 JSON files, Homer 5,260, the plays 10,670,
each with a control word found) hit twice, both in Shorey's footnotes to the
Republic citing Rackham and Grube as scholars. Grammata holds grammars and
lexica, no translations, and was not scanned.

### Copies

| Copy | State |
|---|---|
| Laptop, `~/Developer/reader-snapshots/2026-11-20/` | folders and archives, verified |
| iCloud Drive, `reader-snapshots/2026-11-20/` | five archives, verified where they sit; macOS reports all uploaded |
| GitHub release `snapshot/2026-11-20` on each repo | waits on John's yes (public on the three public repos) |
| Google Drive (John's personal account) | waits on John: Drive for desktop is not installed |
| Flash drive `BOYER USB`, `reader-snapshots/2026-11-20/` | five archives, verified where they sit |

### Open after phase 0

- A past session's `wrangler deploy --dry-run` read 25,362 files from an
  Aristotle worktree's `app/dist`; live holds 17,638 and a clean build's
  `app/dist` holds 17,615. The larger count did not come back; that
  worktree's dist was not a clean build.
- The plays' deployed file count: Cloudflare reports none for a Worker's
  assets, and the 9,739 in `app/wrangler.jsonc` dates from 2026-10-23.
- Grammata's two unnamed bucket objects.

### Plays history check (every blob in all 52 refs; 6,346 blobs, 1,087 MB)

No raw TLG or PHI file names, no Diogenes export paths, no dense beta-code
text, no key or credential files, no build output. What John should know
before the repo goes public:

- The export-shaped Euthyphro fixture (decision 10).
- `app/wrangler.jsonc` and `app/worker/index.js` name John's Gmail address as
  the feedback form's destination, and the Cloudflare account id.
- `sources/kosmos/*.html` (13 saved pages) carry a Google API key that belongs
  to the Kosmos Society's own page. It is theirs and public, but GitHub's
  secret scanning may flag it.
- Eugene O'Neill Jr. is named only in rules, the allowlist, and docs; none of
  his text is in the history. All 81 `sources/perseus` XML files carry a
  Perseus header.
- `docs/redesign/drawings/contact-sheet.html` is in history eight times at
  about 20 MB each: most of the repo's 137 MB.

The search was tested first on a small repo with a planted TLG file name, a
beta-code file, an export XML, and a token, all removed by a later commit; it
found each one.

### Diogenes

Diogenes.app 4.7.2 (`xml-export.pl` dated 2025-02-06; `grc.lsj.xml` and
`greek-analyses.txt` dated 2025-02-21). Homer's "patched `-y` export" is
obsolete: 4.7.2 has `-y`/`-Y` built in. The plays' `docs/tlg-phi-export.md`
records the change (2026-08-29) and a byte-for-byte calibration of the native
path against a 4.5-era export; the old patch survives there only as history.
Homer's CLAUDE.md still says "patched"; its port session corrects it.

## Plan

Each phase ends in a check a machine can run. Finish Aristotle through phase 3
before porting.

### Phase 0 — copies first, no changes to any reader's code

State table at the top. Still to do once John has a GitLab account: push each
repo's heads and tags (less `gh-pages`) from a fresh fetch of `origin`; every
project starts private. *Check: `scripts/mirror-check.mjs --source=<GitHub>
--mirror=<GitLab>` compares `git ls-remote` on both hosts and fails on a
missing ref, a ref at another commit, an unreadable remote, or a source with
no refs; its tests start from a deleted ref.*

### Phase 1 — build without the laptop (Aristotle)

- `extract` (local, needs TLG) writes the committed line-level files (decision 1).
  `build` reads only those and raises if one is missing; it never runs Diogenes.
  Measure the files' total size per repo before the first commit and tell John.
  *Check: a test that the committed files hold no beta code and no Diogenes XML
  markup, with a planted case that fails it.* (Decision 10 settles the fixtures.)
- Morpheus table and LSJ XML: fetched from a pinned source with a checksum; path
  from the environment, with the Diogenes.app path as a local default only.
- Remove the other machine paths from the public build (`/tmp/perseus-ne/...` in
  the manifests). Offline tools may keep theirs.
- Diff the snapshot's data against a clean build (done once, by hand, in the
  baseline above; make it a script and a CI step). The 22 stale shards on
  live need a ruling: delete them from R2, or leave them.
- `merge_juv.py` becomes part of `extract`, so *Juv*'s spliced spine is a
  committed file like the rest.
- *Check: tests 1 and 2. CI runs the full build (about 4 minutes locally) and
  uploads the bundle.*

### Phase 2 — a bundle any host can serve

- Build parameters for site origin, base path, data root, and the Grammata
  address; defaults give today's build. The mirror bundle has same-origin data,
  base `/`, and canonical links to the primary.
- Self-host the fonts. Make the plays' feedback form hide when `/api` is absent.
- `Dockerfile` (build, then Caddy), `ARCHITECTURE.md`, `RESTORE.md`.
- Test the real bundle on two candidate hosts and bring John the results
  (decision 6).
- *Check: test 3, plus a second build at a test base path that passes the link
  check and the same browser test.*

### Phase 3 — mirrors that follow a deploy

- The deploy script, after a deploy succeeds, tags `deploy/<date>`; a workflow
  builds that commit's bundle on a clean runner and attaches it and
  `SHA256SUMS` to a GitHub release. (As first written, the deploy script
  attached a bundle built on the laptop.)
- `.github/workflows/mirror.yml`, calling repo scripts: on every push, mirror git
  (`fetch-depth: 0`; `refs/heads/*` and `refs/tags/*`, less `gh-pages`); on a
  release, verify the bundle's checksums, run the leak check with its positive
  control, then publish to the second host. Zenodo and the Internet Archive run
  only by hand.
- A weekly job runs `check-mirrors.mjs` (each mirror's `SHA256SUMS` against the
  latest release's; as first written, a `version.json`) and opens an issue when
  a mirror is stale or silent.
- `mirrors.json`, shown on the attribution page (decision 5).
- *Check: test 4, then test 5 run once by hand.*

### Phase 4 — port

Plato, then Homer, then the plays, then Grammata's address and domain. Per
hunk, with each repo's own rules read first. The plays differ most: data ships
inside the Worker, the Worker has a script, the repo is private, and
`PUBLIC_SITE_ORIGIN` already exists.

## Why the plan is shaped this way

The plan answers a prompt John brought from Gemini. Where that prompt was wrong:

| It says | What is true | Do this |
|---|---|---|
| Build compiles `dist/` from a committed `data/corpus/` | Three steps: TLG → Diogenes export (`build/export`) → nine pipeline stages and gates (`build/dist`) → Astro (`app/dist`). The site is split: app on a Worker, data on R2, joined by `PUBLIC_DATA_ROOT` at build time. | Cut the pipeline at stage 1's input, not at `dist`. |
| Extraction runs on every build | It runs only when `build/export` is missing. The trouble is that the cache is not kept anywhere. | Make the build refuse to call Diogenes; keep the extract as a named input. |
| Only the Greek text is local | So are the Morpheus table and the LSJ XML, both read from inside Diogenes.app. | Fetch both from a pinned source with a checksum. |
| Check `dist/` is 100% identical before and after | Pages are not byte-stable: a clean rebuild of the same commit differed from live on 213 pages and 5 bundles (docs/cloudflare.md). | Compare data by hash, and pages by exact name swaps, against the phase 0 snapshot. |
| Replace domains with `./` so one `dist` runs in any subfolder | Astro bakes `base` into every page; sitemap, canonical links, robots, and OG cards need an absolute origin. | Make origin, base, and data root build parameters. A subfolder is a rebuild with a different base, proved by one test build. |
| Bundle every outside script | Right for fonts. Wrong for Grammata, which a ruling forbids. The plays' feedback form needs a Worker. | Decision 4. The form hides itself when its endpoint is absent. |
| Dockerfile that serves `dist/` | A static folder needs no container. What is missing is a pinned build environment. | One Dockerfile: build stage, then Caddy. Building it in CI is test 1. |
| Mirror on every push to `main` | Deploys are John's call in every repo. | Git mirrors follow every push. Site mirrors follow a deploy tag. |
| `git push --mirror` | `--mirror` pushes `refs/pull/*` (refused) and `gh-pages` (1.2–2 GB). `actions/checkout` clones shallow by default. | `fetch-depth: 0`; push heads and tags only, less `gh-pages`. |
| Pin to IPFS | Pinata's free plan holds 1 GB and 500 files, Filebase's 5 GB and 500 pinned files; a pin lasts only as long as the account. | Dropped (decision 6). |
| The workflow is the system | The workflow would itself depend on GitHub. | Put the logic in repo scripts; the workflow only calls them. |

## Sessions

One lead session, rooted in `aristotle-reader`, takes Aristotle through phase 3
and does phase 0 for all five sites (it changes no reader's code). Then one
port session per sibling, each rooted in its own repo: Plato's, Homer's, and
the plays' `CLAUDE.md` forbid editing a sister repo from another repo's
session. The ports touch separate repos, so they can run side by side, each
briefed from Aristotle's merged PRs. The lead session starts them once
Aristotle's phase 3 is merged, checks their reports, and brings John only
decisions.

**Plato (2026-11-21).** John said to start it. The brief is
`docs/portability/port-brief-plato.md`. The session started that afternoon:
"Plato portability port [Opus 5.5]", name `plato-port`, id
`local_02eaa70b-28e3-403e-bf55-0c1d9024a980`, rooted in `plato-reader` in its
own worktree. (A turn that comes over Remote Control cannot start a session;
it took John's word from the desktop app.) It reports to the lead session at
each phase's PR or when it needs a decision. Homer and the plays wait for
John's word.

**Plato's report, and what the lead session checked (2026-11-21, evening).**
Three stacked PRs were open in `johnhboyer-sys/plato-reader` (merged since; see below): #130
(phase 1, base `main`), #131 (phase 2, base `claude/portability-phase1`), #132
(phase 3, base `claude/portability-phase2`), head `5cb973c4ec`. Plato's own
`HANDOFF-PORTABILITY.md` on that branch is the full record. Merging them in
order means moving #131's and then #132's base to `main` after the one before
it lands, and letting CI run again each time.

Checked here, on a copy of the phase 3 tree made with `git archive` and never
in Plato's checkout:

- CI is green on all three; on #132 the two `mirror.yml` jobs show as skipped,
  as they must while `MIRROR_GIT_URL` is unset.
- `mirror-git.mjs`, `mirror-check.mjs`, `check-mirrors.mjs`, `check-served.mjs`,
  `mirror.yml`, the `mirror-key` action, the pinned host keys, and the three
  mirror scripts' tests are byte for byte Aristotle's `main`. `release.yml`,
  `image.yml`, `mirrors.json`, and the `Dockerfile` differ only in the names.
- The committed Greek, read by a scan written here and not by Plato's guard:
  36 files and a README, 71,700 lines under 108 heading lines, 7,253,778
  bytes; no ASCII letter, no `&`, no beta-code shape in any text cell; the 183
  angle-bracket pairs all hold Greek (the editor's supplements); the only
  marks outside Greek are the dash, the dagger, and single quotation marks.
  The branch adds no XML file.
- Plato's guard, run here: 152 tests pass and one fails, which is the copy's
  doing (the test asks git whether `build/export` is ignored, and a
  `git archive` copy is no repository; it failed and did not pass by
  default). Three breaks made by hand each turned it red: beta code added to a
  line of the Crito, an export `<label>` added to one, and a stray
  `tlg0059.xml` in the folder.
- Script tests: 180 of 180.
- `mirror-check.mjs` for real: `30 of 33 refs match`, the three port branches
  named as missing on the mirror, which is the truth until the key is set.
- Test 2 on Linux, redone: the bundle CI built for `5cb973c4ec` (run
  44965501016, 13,172 listed files, `shasum -c` clean) compared with the
  snapshot by Aristotle's `compare-snapshot.mjs`: `7591 of 7591 build files
  are byte for byte what the snapshot holds; 1 live-only file allowed`.

Not checked here: the laptop build's page comparison (5,582 of 5,582), test 3
in a browser, and the image run; those stand on Plato's record and on CI.
Plato's format differs from Aristotle's in one way worth knowing: a speaker's
label stays in the line in braces (`{ΣΩ.}`), since Burnet prints it and the
build needs where each speech starts.

Since that check (all the same evening): John ruled decision 10 in Plato's
session, **A**: keep the Euthyphro fixture, pinned. The pin's test went into
#130 and was merged forward, so the heads are now `16b7e64b9f` (#130),
`420b884b4a` (#131), and `597dd74d51` (#132); the change since `5cb973c4ec`
is one test file and Plato's handoff, and CI is green on each. A fourth PR,
#133 (base `claude/portability-phase3`, head `3d8b79d0e6`, CI green), carries
the put-back's two cleanup fixes named below; its `write_all` is line for
line Aristotle's, comments aside.

**Merged (2026-11-21, 19:15).** John said to merge all four. #130 to #133
went into Plato's `main` in order, each later one moved to base `main` first;
`main` had not moved, and each merge's tree was the tree of the PR head CI
had passed. Plato's `main` is at `54326c2271`. (John also said "merge" in Plato's
session, which merged #130 seconds before the lead session merged the other
three; the result is the same.) On that commit CI passed (runs 44970583891:
app, shared, pipeline, scripts, and site, the full Linux build) and the image
built and served its files (run 44970583851); `mirror.yml` skipped, as it
must until the key is set.
Plato's #134 (its handoff alone, recording the merges) followed on John's
word in that session; `main` is at `432e1381f9`.

Open for John: Plato's deploy key. The key pair was made on 2026-11-21
(`~/.ssh/plato_mirror_deploy_ed25519`, fingerprint
`SHA256:APlUVBfEj4TWBheyDuvCrzpwAUwyaIcAaM5lnv/G2Vc`, titled "plato-reader
mirror, GitHub Actions, 2026-11-21"). Nothing is set on GitHub or GitLab yet:
John adds the public half on GitLab, then the lead session sets the secret
and the variable, tests the key, and deletes the local private half.

**Two fixes Plato's reviews found in files it took from here (2026-11-21).**
Both are ported back, tests first, on `claude/portability-handoff-plato`.
`extract.write_all` moved its staged files into place outside its `try`, so a
move that failed part way left the earlier files moved and the later
temporary files on disk, and a write that failed left its half-written
temporary file; it now puts back what it moved, each file by its own write
and rename, and names any it could not. And the deploy tag's guard asked
plain `git status --porcelain`, which a `status.showUntrackedFiles=no` setting
makes blind to an untracked page; `uncleanFiles()` now asks with
`--untracked-files=all`. Four new tests, each seen to fail on the old code
(the deploy one also with `normal` in place of `all`).

Codex (GPT-6.1-Sol, medium) read the port twice. Its first read found two
gaps in the put-back's own cleanup, which Plato's copy has too: an error
while removing a temporary file (a read-only folder, or a folder sitting at
that name) stopped every put-back and reached the caller in place of the
first error. Both fixed, each with a test that failed first: such a file is
named and the rest go on. Its second read found one thing, answered and not
fixed: if stderr itself is closed, the line that names a file raises in place
of the first error. The run still stops, and `git status` shows any mix,
since the files are committed. Pipeline corpus tests 124 of 124, script tests
321 of 321. Plato's copy has the same two fixes in its #133.

## Rules for the session

- Work in a fresh worktree from `origin/main` in each repo. The main checkouts are
  stale and hold other sessions' uncommitted work; do not touch them.
- Deploys, pushes to a new host, new accounts, spending, licences, making a repo
  public, and anything that cannot be recalled are John's call.
- Read each repo's `CLAUDE.md` and `docs/cloudflare.md` first.
- Every new gate gets its failing case first and says how much it examined.
- Never commit raw TLG files or the Diogenes XML. Run the gated-translation leak
  check before any copy leaves the machine; Zenodo, Internet Archive, and
  Software Heritage copies cannot be recalled.
- No new npm or Python packages without a reason in the commit message.
- Load the `delegate` skill before any subagent. The implementer and the reviewer
  come from different model families.
- In zsh, never name a loop variable `path`: it is tied to `PATH` and empties it.

## Secrets John will add

| Secret | For | Needed when |
|---|---|---|
| `MIRROR_GIT_SSH_KEY` (a deploy key per repo, write access), and `MIRROR_GIT_URL` as a repository variable (an address is no secret, and a workflow can skip its job when a variable is unset) | git mirror to GitLab | phase 3 |
| Second host's deploy token and site id | live mirror | after decision 6 |
| `ZENODO_TOKEN` | archive releases | manual job only |

No R2 S3 token was needed for phase 0: the key records are complete. No
Cloudflare token goes into the readers' CI unless John wants CI to deploy the
primary.

## Not covered

The Aristotle desktop app and its updater; Moerbeke; bonitz-text;
`classical-philosophy-reader` beyond noting it has no remote; `~/.claude` memory
and review notes, which hold much of how these sites are run and live only on the
laptop.
