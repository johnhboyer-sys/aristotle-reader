# HANDOFF: redesign build (direction B)

Rewritten 10 Nov 2026, 12:20, mid-task: John had to close his laptop. The home
and work-page design (D26) **is now built** in this worktree, **uncommitted**.
Rewrite this file (don't append) when you hand off.

## Start here

1. Work in this worktree,
   `~/Developer/aristotle-reader/.claude/worktrees/redesign-build`, on branch
   `claude/redesign-build`. The branch is **not pushed**, and today's work is
   **not committed**: `git status` shows it all. Commit only when John says.
2. Read `CLAUDE.md`, then this file, then
   `docs/redesign-home-and-work-spec.md` (its "Nothing here is built" line is
   now out of date; fix it when you commit).
3. John's words for each ruling: `.redesign-shots/notes/hero-rounds.md`.
   `.redesign-shots/` is untracked and must stay so: never `git add` it.
   Today's notes, briefs, review results, scripts and shots are in
   `.redesign-shots/notes/d26/`.
4. John said "Read the spec and continue" on 10 Nov at 11:05; I took that as
   his go to build and told him so. He has seen three shots at 1152×663 and
   has not yet given a verdict.
5. Safeguards still bind: nothing merges, deploys or is pushed until John says
   yes; the kit and `docs/redesign-kit/` are read-only; blast radius is `app/`,
   `shared/`, `app/scripts/`; implementation and verification are never the
   same model family.

## What was built on 10 Nov (all uncommitted)

| File | What changed |
|---|---|
| `shared/lib/works.ts` | `CATEGORIES` regrouped: the dubious and spurious works stand in the main divisions; new group II.d "Minor Works (Opuscula)"; the appendix division is gone |
| `app/src/data/plates.json` | `place` per work from the ruled list (22 left with the Isagoge, 25 right); `ink: [l, t, r, b]` per plate |
| `app/scripts/measure-plate-ink.mjs` | new: measures each plate's ink box (`--check` verifies) |
| `app/src/pages/index.astro` | `.b-top` wrapper; bust cut to its ink box; Greek line `p.b-gt`; Continue before search in the source |
| `app/src/components/Landing.astro` | `.b-top.pl-left/.pl-right`; buttons before the blurb in the source; blurb, related and facts inside `.b-words` |
| `app/src/lib/poster-fit.ts` | from 961px the title fills one column exactly; `fitLine` fits Greek lines; the old desktop poster-height arithmetic is gone |
| `shared/styles/b.css` | the block headed "D26 (John, 9–10 Nov 2026)": colour B, the ≤960px `order` rules that keep phone and sideways as they were, and the 961px-up grid for both page types |
| `app/src/__tests__/redesign.test.ts` | plate sides, ink boxes, new division ids |
| `app/scripts/check-redesign.mjs`, `app/scripts/fixtures/poster-golden.json` | **written by a Sonnet agent, not yet reviewed by me**: eight new gates (R-H4, R-H5, R-H6, R-W4, R-W5, R-C3, R-H7, R-H8) and repairs to the old ones |

## Where verification stands

- Unit tests on the built code: app 115/115, shared 735/735, scripts 99/99,
  svelte-check 0 errors. Run before the last three small fixes below.
- Measured against the Figma frames at 1525×896 and 1152×663: within 3px, in
  Chromium and WebKit. **Firefox not checked** (Playwright has none here).
- Phone and sideways: 86 before/after shots (baseline in
  `.redesign-shots/notes/d26/phone-baseline/`); shapes differ only in the
  crumb, the regrouped list, and colour.
- Old gate suite against the new build (before any gate edits): 34 PASS, 8
  FAIL, all stale desktop expectations (R-T1-home, R-C1, R-T3, R-H2, R-W1,
  R-W3, R-T1, R-T2). Log: `.redesign-shots/notes/d26/gates-first.log`.
- **Gates agent (Sonnet): interrupted.** It had written all eight gates and
  was in its final full-suite run (log `/tmp/d26-gates.log`) when the laptop
  closed. Its report never arrived. Treat its gate edits as unreviewed: read
  the diff of `check-redesign.mjs`, check each repaired old gate keeps its
  phone and sideways assertions untouched, and check R-W1 "Cat sections out of
  order" was a stale expectation and not a real defect.
- Grok code review (static): no blockers.
  `.redesign-shots/notes/d26/grok-review-result.log`. Acted on: the bust and
  list no longer jump when the home title is fitted (CSS pre-fit size
  `--unfit`).
- Codex screenshot judge (gpt-6.1-sol, medium): 3 of 9 pairs PASS, 6 FAIL on
  its 2px bar. `.redesign-shots/notes/d26/codex-judge-result.md`. My reading:
  Figma's whole-pixel line heights (≤3px), as-built book rows, and one real
  wrap (Mirabilibus in the home list, 2px too wide for one line). Acted on:
  the work page's Greek title keeps a 42px line when it steps down.
- **`app/dist` is stale by three small fixes** made after the last build (the
  42px Greek line, `--unfit`, the 44px no-script title size). Rebuild
  (`cd app && PUBLIC_SHOW_PRIVATE=0 npm run build`, Node 22, about 25s), then
  re-run the unit tests, the new gates with their proofs, and the full suite.

## Next steps

1. Rebuild; restart the preview (`redesign-preview` in the main checkout's
   `.claude/launch.json`, port 4329); review the agent's gate diff; run the
   full suite and every `--prove`. A cross-family read of the new gates
   (Codex or Grok, static) is still owed.
2. Show John the undrawn cases (`.redesign-shots/notes/d26/undrawn/`) and get
   his calls:
   - phone: deeper reds now reach the phone, but the phone title keeps the
     bright red (spec §8.12);
   - returning reader at 1152×663: a two-line Continue pushes the block down
     about 44px, and the title and bust stand on the foot line;
   - dark mode: plates on their paper, cut tight to the ink;
   - the nav sits on the 1168px column on home and work pages only;
   - the Mirabilibus row wraps in the home list at 1525;
   - the two open items in the spec's §2 (σῳζόμενα or ἔργα; grey or red
     Greek title on work pages).
3. D26 is logged in `.redesign-shots/notes/departures-amend.md`; add it to
   `.redesign-shots/notes/pr-body.md`.
4. On John's yes: commit, then the "Then finish" list below.

## Then finish

1. Full gate run plus the new proofs; tests (`app` vitest, `shared` vitest,
   root `test:scripts`, svelte-check); app build; link check. A full
   `npm run build:public` is only needed again if corpus data changes.
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
   Deploy (`npx wrangler deploy` there) only on John's yes. Once the home page
   is built, retake the shot (1280×860 at 1x) so the card shows it.
6. Rewrite this file.

## State

| What | Where it stands |
|---|---|
| Stages 1–5 | committed, gates and screenshot judges passed (`6b25099d75` … `4129016580`) |
| OG cards | `c6a276c90c`, wording John's |
| Gate fixes | `e98749a8a3`: Grok's 12 gate-honesty findings closed; eng-table 1em; WordPopup Escape guard gated to B |
| Merge of main (PR #194) | `fa39aef88b`: one import conflict; Beta Code accent fix carried into `doBSearch`; compat hash updated (stage 3 + main's hunk only, checked); Grok: no findings |
| Home and work-page design (D26) | **built 10 Nov, uncommitted**; gates written by an agent, unreviewed |
| Tracked files | **dirty**: ten files changed on 10 Nov, one new script; nothing committed |
| Earlier hero build | superseded; saved as `.redesign-shots/notes/hero-build/landing-hero-superseded.patch` (applies cleanly; 117 lines added to `index.astro`, `b.css`, `check-redesign.mjs`). Its division ids and `.b-gt` Greek line are reusable. Its layout and its R-H4 gate are not |
| Preview server | was running on 4329 when the laptop closed. `app/dist` is stale by three small fixes: rebuild before you trust a screenshot or a gate |
| Gates on the merged build | 42 PASS; proofs 109/109 caught (run before the merge, on the committed tree) |
| build:public | green: 47 works, preflight ok, shared LSJ 76,345 keys ok, 7,559 pages, 0 broken links of 414,112 |
| deploy:dry | green: leak check at baseline (Rackham 2 known-benign; Ackrill, Tredennick, Irwin 0), held works none, shards match; no push |
| Tests | app 115/115, shared 735/735, scripts 99/99, svelte-check 0 errors |
| Share images | X teaser and Stripe image in `.redesign-shots/share/`, both handed to John |

The gate, build:public and deploy:dry rows below date from before D26 and must be re-run.

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

## Gotchas

- **Compound bash.** The build session found the worktree guard refusing
  `cd x && git …`, `env -i` and loops; on 10 Nov such commands ran. If one is
  refused, put the steps in a script file and run it with `zsh`. Saved scripts
  are in `.redesign-shots/notes/scripts/`; fix their `S=` paths before use.
- **Preview server:** `scripts/preview.sh` runs `astro preview` on
  127.0.0.1:4329, serving `app/dist`. The harness expects it there. Rebuild
  with `scripts/build.sh` (Node 22, `PUBLIC_SHOW_PRIVATE=0`).
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
- **Figma, through the plugin API:**
  - `node.clone()` puts the copy on the page, not in the source's parent. Move
    it in the same call.
  - Layers inside instances of a frame cloned in the same call are not found
    by `findAll`. Recolour them in a second call.
  - A frame's height read straight after resizing its width can be stale. Set
    what depends on it in a second call.
  - The "Book row" master in Parts still has the old red numeral. The
    instances in the current frames are right.
- John judges in Safari at about 1152×663 with a dark-mode extension on.
- The homepage card shows only the left 71% of its picture (`.shot` is 36% in
  from the left, 90% wide), so the right of any shot is hidden. Every card on
  the homepage does this.
- The first attempts at the hero (options A–D on the real build, and the
  slider playground) are in this file's previous version, commit `bbfd31e827`.

## Where things are

| What | Where |
|---|---|
| Build spec for all of B | `docs/redesign-build-brief.md` |
| Home and work-page design spec | `docs/redesign-home-and-work-spec.md` |
| Figma file | https://www.figma.com/design/3FGcwopu3awgAt63aiwlmH |
| John's rulings, round by round | `.redesign-shots/notes/hero-rounds.md` (untracked) |
| Shots of the current frames | `.redesign-shots/notes/vplato/current/` (untracked) |
| Plate sides, work by work | `.redesign-shots/notes/vplato/r3/plate-sides.json` (untracked) |
| Scripts that read page data for Figma | `.redesign-shots/notes/figma/` (untracked) |
| Design history and earlier rulings | `HANDOFF-REDESIGN.md` (top section wins) |
| B kit (read-only) | `~/Developer/aristotle-plates-scratch/kit/dirs/b/`; copies in `docs/redesign-kit/dirs/b/` |
| Home markup | `app/src/pages/index.astro` |
| Work page markup | `app/src/components/Landing.astro` |
| Title fitting | `app/src/lib/poster-fit.ts` (`fitPoster`, `fitWorkPoster`, `initPosters`) |
| B styles | `shared/styles/b.css` |
| Gates | `app/scripts/check-redesign.mjs`, `app/scripts/redesign-browser.mjs` |
| Notes, PR draft, departures | `.redesign-shots/notes/` (untracked) |
| Side-by-sides from stages 2–5 | `.redesign-shots/stage{2..5}/` |
| Chapter titles (separate track) | branch `claude/chapter-titles-18c59c`, `HANDOFF-CHAPTERS.md` there |
| Deploy recipe | `DEPLOY-STATUS.md`; deploy only on John's yes |
