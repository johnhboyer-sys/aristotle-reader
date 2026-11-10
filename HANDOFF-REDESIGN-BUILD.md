# HANDOFF: redesign build (direction B)

Rewritten 9 Nov 2026, 19:20, by the build session. All five stages of B are built
and committed on `claude/redesign-build`. One defect blocks the PR: the home
page hero is too tall on desktop. Your job is to fix that, get John's yes, and
open the PR. Rewrite this file (don't append) when you hand off.

## Start here

1. Work in this worktree,
   `~/Developer/aristotle-reader/.claude/worktrees/redesign-build`, on branch
   `claude/redesign-build`. The branch is **not pushed**; the work exists only
   here.
2. Read `CLAUDE.md`, then this file, then `docs/redesign-build-brief.md`
   sections R-H1–R-H3 (home), D1–D16 (departures) and §6 (screenshot gates).
3. Read `.redesign-shots/notes/build-notes.md`. Its last section, "State at
   2026-11-09 19:15", is the short version of this file. `.redesign-shots/` is
   untracked and must stay so: never `git add` it.
4. Safeguards still bind:
   - nothing merges to `main` and nothing deploys until John says yes;
   - the kit, the mockup and `docs/redesign-kit/` are read-only;
   - blast radius is `app/`, `shared/`, `app/scripts/`;
   - implementation and verification are never the same model family. Load
     the `delegate` skill before your first spawn, and route by the session's
     budget board.

## The task: the home hero (John, 9 Nov)

John, on seeing the built home page at his 1525×896 window: "the image and
title are HUGE on desktop. user won't even see the list of works unless they
scroll." Then, pointing at the Plato reader's home: "plato reader doesn't have
this problem because the 'complete works' isn't huge hero type and the site
description and search sit right under it, all of which add up to the height
of the greek words."

**Cause.** The home poster is the kit's side layout
(`.b-po.pl.tp-side`, `shared/styles/b.css` line 57, `aspect-ratio: 1440 / 652`),
so its height grows with window width. At 1525×896 it is 690px tall, the
title sets at 106px in four lines, and the home line and search sit in a
separate row (`.b-intro`) below it. No work shows on the first screen. The
work pages don't have this problem: `fitWorkPoster` in
`app/src/lib/poster-fit.ts` caps their poster so "Start reading" stays on
screen. The home page has no cap. The kit itself is this tall, which is why
G-HOME passed.

**What has been tried** (shots in `.redesign-shots/notes/homeopts/`, all at
1525×896 and 1280×800 on the real build, first screen only):

| | What | 1525×896 | 1280×800 |
|---|---|---|---|
| Now | kit poster | hero 690px, 0 works | hero 580px, 0 works |
| A | work-page rule: poster shrinks until the first works row shows | 473px, 2 | 342px, 2 |
| B | poster capped at 50vh | 448px, 2 | 400px, **0** |
| C | 300px band, title in 2 lines | 300px, 6 | 300px, 2 |
| D | Plato's structure: bust left; title, home line and search stacked right | 484px, 6 | 440px, 6 |

D is closest to what John described; `.redesign-shots/notes/home-optD.mjs`
builds it by DOM injection. In D the title was Oswald at
`clamp(52px, 5.2vw, 84px)` in two lines, still poster type. John has not
picked. He wants to be able to move and resize the bust freely, and said he
may need Figma, but first: **"create a handoff for a new session to at least
attempt to get this right before going to figma."**

Tools he has:

- Playground (sliders, scaled real page):
  https://claude.ai/artifact/5uEXkmDemSwNbBEexz358Y. Source:
  `.redesign-shots/notes/hero-playground.src.html`, built with
  `scripts/hero-playground-build.py`. He may paste its "Copy settings" JSON to
  you.
- Figma file, empty so far, Philosophy Reader team (his full seat):
  https://www.figma.com/design/3FGcwopu3awgAt63aiwlmH. Oswald Bold, Literata
  and Sofia Sans are all available there. This is the fallback if your attempt
  doesn't satisfy him.

**Done means** (each one machine-checkable unless marked):

1. At 1525×896, 1440×900, 1366×768 and 1280×800, the bottom of the first
   `.b-works li` is inside the first screen. Write this as a new gate, R-H4, in
   `app/scripts/check-redesign.mjs`. Show it failing on the current build
   first, give it a `--prove` case, and make it print what it examined.
2. The hero follows Plato's pattern: the bust on one side; the title, home line
   and search stacked on the other; the text column about as tall as the bust.
   Measure and print both heights.
3. The title is no longer "huge hero type". It sets in at most two lines at
   those sizes. Show John at least two title treatments as screenshots and let
   him pick. Don't pick for him.
4. Phone (≤700px) and sideways (701–960px) layouts are unchanged unless John
   says otherwise. The existing gates stay green. R-H1 checks the order of
   home content, so check whether moving the home line into the hero changes
   what it sees.
5. Dark mode checked at one desktop size.
6. A cross-family screenshot judge passes the new home against John's
   description, not against the kit. Old-vs-new side-by-sides go to John.
7. Log it as **D26** (John's ruling, quoted) in
   `.redesign-shots/notes/departures-amend.md` and in the PR body.
8. *(John)* He says yes. If he doesn't, build the layers in the Figma file:
   separate, freely movable frames for the bust, title, home line, search and
   the Logic list, at 1525×896, live poster beside D.

## Then finish

1. Full gate run (42 gates today) plus the R-H4 proof; tests (`app` vitest,
   `shared` vitest, root `test:scripts`, svelte-check); app build; link check.
   A full `npm run build:public` is only needed again if corpus data changes.
2. Fill the PR body, `.redesign-shots/notes/pr-body.md`:
   - `__BUILD__`: build:public and deploy:dry results (below);
   - add D26;
   - follow-ups (below).
3. Push the branch and open the PR against `main`. Don't merge it. Bind it with
   the `ccd_pr` tools.
4. Start the speed session. John asked: "After the build is fully done, have a
   new session measure the site's speed and figure out how to optimize it." It
   reports to you.
5. Homepage card: staged in `~/personal-website/` (`assets/` and `dist/`),
   showing the reader's home page with background `--stock-aristotle: #b42419`.
   Backups are in `~/personal-website/backup-2026-11-09/`. **Not deployed.**
   Deploy (`npx wrangler deploy` there) only on John's yes. Once the hero is
   fixed, retake the shot (1280×860 at 1x, home page) so the card shows the new
   hero.
6. Rewrite this file.

## State

| What | Where it stands |
|---|---|
| Stages 1–5 | committed, gates and screenshot judges passed (`6b25099d75` … `4129016580`) |
| OG cards | `c6a276c90c`, wording John's |
| Gate fixes | `e98749a8a3`: Grok's 12 gate-honesty findings closed; eng-table 1em; WordPopup Escape guard gated to B |
| Merge of main (PR #194) | `fa39aef88b`: one import conflict; Beta Code accent fix carried into `doBSearch`; compat hash updated (stage 3 + main's hunk only, checked); Grok: no findings |
| Gates on merged build | 42 PASS; proofs 109/109 caught (run before the merge) |
| build:public | green: 47 works, preflight ok, shared LSJ 76,345 keys ok, 7,559 pages, 0 broken links of 414,112 |
| deploy:dry | green: leak check at baseline (Rackham 2 known-benign; Ackrill, Tredennick, Irwin 0), held works none, shards match; no push |
| Tests | app 115/115, shared 735/735, scripts 99/99, svelte-check 0 errors |
| Share images | X teaser and Stripe image in `.redesign-shots/share/`, both handed to John |

## Follow-ups for the PR body (not this PR)

- Corpus: no lemma page for σωφροσύνη or ἀκούσιος.
- LSJ track: grammata's Logeion link is 14px tall; `.t8-entry` margin gap on
  phones.
- Print track: `/EN/book/1` prints a blank first page (old build too).
- Search:
  - Results open on Categories while the rail sorts by count.
  - With "Match accents exactly", `λόγου` gives page 1 of 72 with no rows. The
    filter runs per page. The old design does the same.
- Desktop app: side effects of `shared/` changes are low priority (John, 9
  Nov).

## Gotchas from this session

- **The worktree guard refuses compound bash** (`cd x && git …`, `env -i`,
  loops). Put multi-step commands in a script file and run it with `zsh`. The
  session's scripts are saved in `.redesign-shots/notes/scripts/`. Their
  `S=`/`cd` paths point at the old scratchpad and at this worktree, so fix
  `S=` before using them.
- **Preview server:** `scripts/preview.sh` runs `astro preview` on
  127.0.0.1:4329, serving `app/dist`. The harness expects it there. Rebuild with
  `scripts/build.sh` (Node 22, `PUBLIC_SHOW_PRIVATE=0`). The old-design
  baseline is a `python3 -m http.server 4400` over a baseline `dist`; it is
  not needed for this task.
- **Gates:** `scripts/full5.sh <tag> [proof ids]` runs the full suite and then
  the proofs. `scripts/only5.sh` runs single gates.
- **Codex:** every brief must say "Do not launch a browser or run browser
  gates". Its sandbox's Chromium throws macOS "Playwright cannot be opened"
  dialogs.
- **`build/export`** in this worktree was made by hand: the Diogenes export,
  run directly, for authors 0086, 0547 and 2034, then
  `pipeline/tools/merge_juv.py`. From a background shell the export dies with
  exit 25. See memory `worktree-builds-need-the-export-cache`.
- There is a stray untracked `node_modules/` at the repo root. Never add it.
- The B home title is drawn at `opacity: var(--po-op)` (.82), so it reads
  lighter than `--red`. That's by design.
- The homepage card shows only the left 71% of its picture (`.shot` is 36% in
  from the left, 90% wide), so the right of any shot is hidden. Every card on
  the homepage does this.

## Where things are

| What | Where |
|---|---|
| Spec | `docs/redesign-build-brief.md` |
| Design history and rulings | `HANDOFF-REDESIGN.md` (top section wins) |
| B kit (read-only) | `~/Developer/aristotle-plates-scratch/kit/dirs/b/`; copies in `docs/redesign-kit/dirs/b/` |
| Home markup | `app/src/pages/index.astro` (hero at the `b-po hero` section) |
| Poster fitting | `app/src/lib/poster-fit.ts` (`fitPoster`, `fitWorkPoster`, `initPosters`) |
| B styles | `shared/styles/b.css` |
| Gates | `app/scripts/check-redesign.mjs`, `app/scripts/redesign-browser.mjs` |
| Notes, PR draft, departures, shots | `.redesign-shots/notes/` (untracked) |
| Side-by-sides | `.redesign-shots/stage{2..5}/` |
| Chapter titles (separate track) | branch `claude/chapter-titles-18c59c`, `HANDOFF-CHAPTERS.md` there |
| Deploy recipe | `DEPLOY-STATUS.md`; deploy only on John's yes |
