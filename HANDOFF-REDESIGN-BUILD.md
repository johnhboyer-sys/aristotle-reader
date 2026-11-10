# HANDOFF: redesign build (direction B)

Rewritten 10 Nov 2026, 10:48, by the session that took the home hero to
Figma. All five stages of B are built and committed on `claude/redesign-build`.
The PR is still blocked on the home page, and the fix has grown: over 9–10 Nov
John ruled a new top block and a regrouped list for the home page, **and** a
new top block for every work page. That design is drawn in Figma and written
up as a spec. **None of it is built.** Rewrite this file (don't append) when
you hand off.

## Start here

1. Work in this worktree,
   `~/Developer/aristotle-reader/.claude/worktrees/redesign-build`, on branch
   `claude/redesign-build`. The branch is **not pushed**; the work exists only
   here.
2. Read `CLAUDE.md`, then this file, then
   `docs/redesign-home-and-work-spec.md`. The spec has every measurement and
   marks each statement as ruled by John, drawn and unquestioned, or only my
   recommendation.
3. For John's exact words and the order of events, read
   `.redesign-shots/notes/hero-rounds.md`. `.redesign-shots/` is untracked and
   must stay so: never `git add` it.
4. **Do not build yet.** John's last words on building were "Not yet" and
   "More Figma"; then he closed the session ("lets wrap now"). Ask him before
   you start.
5. Safeguards still bind:
   - nothing merges to `main`, nothing deploys, nothing is pushed until John
     says yes;
   - the kit, the mockup and `docs/redesign-kit/` are read-only;
   - blast radius is `app/`, `shared/`, `app/scripts/`;
   - in Figma, never edit John's own frames, `4:2` ("Yours · move things
     here") and `23:1230`. Draw new frames beside the current ones;
   - implementation and verification are never the same model family. Load
     the `delegate` skill before your first spawn, and route by the session's
     budget board. This session spawned nothing.

## Where the design stands

Figma: https://www.figma.com/design/3FGcwopu3awgAt63aiwlmH, page "Home hero".
The canvas was tidied on 10 Nov:

- **CURRENT DESIGN** (top of the canvas, y −5600 to −1700): the home page for
  a new and a returning reader, three work pages, the same at John's Safari
  size (1152×663), the whole home page, and the plate-side picture.
- **OPEN · YOUR CALL** (inside that block): the two frames John has not ruled.
- **HISTORY** (y 0 down): every earlier round, oldest first, each row
  labelled. Nothing there is current.

Node ids are in the spec, §13. Reference shots of the current frames are in
`.redesign-shots/notes/vplato/current/`.

**Ruled** (John's words are in the spec, §2):

- Titles are tight stacks in ink, set in a box one list column wide. Three
  columns on home (bust, title and Greek line, home line and search) and on
  work pages (plate at one end; title, then blurb and details).
- Plate side follows the picture: 21 works left, 25 right
  (`.redesign-shots/notes/vplato/r3/plate-sides.json`). The crumb stays left.
- Home list: division names above their works, three columns, group labels
  right-aligned.
- Dubious and spurious works sit in the main divisions with tags. The small
  treatises and the Problemata form "Minor works (Opuscula)".
- Colour B: every red on these pages is `--red-ink` (#b42419). The home Greek
  line is that red.

**Open, John's call:**

1. The home Greek line: σῳζόμενα (drawn) or ἔργα (frame `60:5938`).
2. The Greek title on work pages: grey (drawn) or deep red (frame `59:5909`).

**Not drawn** (spec §8 has all thirteen). The ones most likely to bite:

- a returning reader at 1152×663: the Continue line does not fit as specified;
- dark mode;
- the longest titles;
- how far colour B reaches (reader, lexicon, search, phone posters);
- the crop for each of the 25 cut-out plates. Only two are drawn.

## The task

1. Get John's two answers, and draw whatever else he asks for in Figma.
2. On his go, build to the spec:
   - the list: regroup `CATEGORIES` in `shared/lib/works.ts`, restyle the list;
   - the home top block;
   - the work-page top block, `place` and the ink box per plate in
     `app/src/data/plates.json`;
   - colour B on these two page types. Do not change the `--red` token; other
     pages use it and are not ruled.
3. Write the spec's §12 checks as gates in `app/scripts/check-redesign.mjs`,
   failing case first, each printing what it examined. Update R-H1, R-T1-home
   and R-T3 only where they assume the old layout, and say why for each.
   Re-run R-A2.

**Done means:**

1. The §12 gates pass, each with a `--prove` case that fails.
2. Phone (700px and under) and sideways (701–960px) are unchanged, and the
   existing gates (42 today) stay green.
3. Checked at 1152×663 and 1525×896, light and dark, and at the widths in the
   spec's §8.10.
4. Every "Mine" and "not drawn" item in the spec's §8 has been shown to John,
   or built as recommended and listed for him.
5. A screenshot judge from another model family passes the build against the
   shots in `.redesign-shots/notes/vplato/current/`.
6. Logged as **D26**, with John's rulings quoted, in
   `.redesign-shots/notes/departures-amend.md` and in the PR body.
7. *(John)* He says yes to old-against-new side-by-sides.

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
| Home and work-page design | ruled in Figma, spec written, **not built** |
| Tracked files | clean: the tree matches the last commit, apart from this file and the new spec |
| Earlier hero build | superseded; saved as `.redesign-shots/notes/hero-build/landing-hero-superseded.patch` (applies cleanly; 117 lines added to `index.astro`, `b.css`, `check-redesign.mjs`). Its division ids and `.b-gt` Greek line are reusable. Its layout and its R-H4 gate are not |
| Preview server | **stopped** on 10 Nov. `app/dist` is stale: it was built from the superseded hero. Rebuild before you trust a screenshot |
| Gates on the merged build | 42 PASS; proofs 109/109 caught (run before the merge, on the committed tree) |
| build:public | green: 47 works, preflight ok, shared LSJ 76,345 keys ok, 7,559 pages, 0 broken links of 414,112 |
| deploy:dry | green: leak check at baseline (Rackham 2 known-benign; Ackrill, Tredennick, Irwin 0), held works none, shards match; no push |
| Tests | app 115/115, shared 735/735, scripts 99/99, svelte-check 0 errors |
| Share images | X teaser and Stripe image in `.redesign-shots/share/`, both handed to John |

Nothing in the gate, build and test rows was re-run on 10 Nov.

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
