# HANDOFF: redesign build (direction B)

Rewritten 15 Nov 2026, 21:50, at the end of the build session. Rewrite this file (don't append) when
you hand off. The version before this one is at
`.redesign-shots/notes/HANDOFF-REDESIGN-BUILD-archive-2026-11-15b.md` (untracked) and in git history.

## 0. Start here

**Merged: PR #195, 16 Nov, as `de57f687c6` (all CI green). Not deployed: the deploy waits for John.**
At deploy: retake the homepage card (`~/personal-website`, deploy only on his yes) and raise the Daily
Nous pitch. Search follow-ups moved to `HANDOFF-SEARCH-FOLLOWUPS.md`, the port to the other readers to
`HANDOFF-SEARCH-PORT.md`. Still open from this track: the site speed session, and the duplicate
secondary chapter (`pieceCont`, its own PR). §1 to §4 below stay as the record.

- **Worktree:** `~/Developer/aristotle-reader/.claude/worktrees/redesign-build`, branch
  `claude/redesign-build`. Auto-fix is on for the PR in the session that opened it.
- **Last full check, 15 Nov at `79e3e4b2e0`:** check-redesign stage 5, 79 gates via
  `node app/scripts/check-redesign-shards.mjs --base URL --stage 5 --jobs 4 --log FILE` (13.7 min):
  78 pass, R-P4 load-flaky (passes alone). Many "no loaded Gentium" or `page.goto` timeouts at once
  mean Google Fonts or the network: rerun those alone. search-shots 136/0, search-counts 14/14,
  shared vitest 1,891, app 247, `test:scripts` 99, svelte-check 0, `build:public` 0 broken,
  `deploy:dry` ok (add 271, change 17,204, delete 48; leak check clean). Opus reviewed the Codex app
  code, Codex reviewed the Claude gates and fixes; all findings fixed but the pre-existing
  `pieceCont` duplicate chapter (its own PR).
- **John's rulings, 15–16 Nov:** the word list covering the Lemma switch is not a problem. Search
  counting goes in its own PR after this one (the PR body's follow-ups list the model: count
  chapters; Both + and = anywhere in the chapter; English hits only for one translation per work;
  phrase Include and Exclude; the empty page 67). Explainer:
  https://claude.ai/artifact/6MCS6YT13myEw7K2CVvGVx. The Plato search port waits for that PR.
- **Next:** the site speed session; at deploy, the homepage card retake (`~/personal-website`) and
  the Daily Nous pitch; then the search counting PR.
- **Review page for John:** https://claude.ai/artifact/4MoW4SyZrTn5KQxby8hena.
- **Load the `delegate` skill before the first spawn.** Pass `model:` on every Agent spawn; a Claude
  edit gets a Codex review.

## 1. What to build

### 1.1 Reader (`HANDOFF-READER-DESIGN.md`)

The mock-ups are CSS and JS laid over the built page in `.redesign-shots/notes/reader/r1/shoot-r4.mjs`.
**Everything kept is `F4` plus `F4JS`** (line ~283). `F4` is `F3`, which is `F2`, the round-5 keeps,
plus round 6, with round 7's A, C, D, H, J, K, L, and M added. `F4JS` adds round 7's B (curly quotes)
and G (chapter-number edge fit). Port the result into `shared/styles/b.css` and the reader
components. It is a sketch to port, not code to paste. These parts need real behaviour, which the
shots only faked:
- **Round 7 C:** the sideways bar hides on scroll down and comes back on scroll up or a tap at the top.
- **Round 7 B:** curly quotes and apostrophes in the English, and ’ for the Greek elision mark. Do
  this in the data or at render, not as a DOM walk. The stored text itself does not change.
- **Round 7 G:** a chapter number keeps 12px from the window edge on desktop and 10px on the phone,
  stepping down in size to fit (floor 18px).
- **The bar names the chapter** whose head has reached the top 40% of the reading area (rulings of
  14 Nov 18:00).
- **Phone chapter titles are 19px.** There are no chapter titles in the bar at any width. The short
  work name is EN, not "Ethics".
- **English paragraphs never break at a Bekker column** (round 4 C). This needs the pipeline to record
  paragraph continuation for the primary `english` slot. Today only overlays carry `cont`. The fixes
  are in `stage1_ross.build_chunks` and `stage1_common.add_paragraph` (READER-DESIGN round 4, the
  13:17 correction).
- **Full Greek lines** (READER-DESIGN, "Full Greek lines"): a switch in the Aa panel under Column
  width, off by default. When on, the Greek column takes the width of the book's longest Bekker line
  and the English the rest. It appears only where lines fit: desktop, and sideways Greek only. It
  recomputes on text size, font, and book change. Set an English floor; below it, wrap as usual. The
  mock-up measures with `FGJS` and adds the checkbox with `AAJS` (shoot-r4.mjs ~285–292).
- **Build fixes found in review, no ruling needed:**
  - Phone English margin numbers sit about 5px low since the 27px line height; their offset was
    tuned for 31px.
  - The phone opening-fragment turnover outdents. It should take the fragment indent + 8px.
  - At 1152px, round 6 C's 88px gap wraps a few lines.
  - The `.b-ln` offset uses Literata metrics (.4345); measure against Gentium.
  - English-only rows that count a hidden Greek column miss the 720px cap.
  - Equal columns replace `greekColumnWidth` in Both view.
- **Not kept, so don't build:**
  - round 7 E, F, I, I2, and N;
  - E2, deferred ("maybe later"), so phone Both stays 50/50.
  - Crowded numbers: if one ever has to go, 1 and every multiple of 5 stay.

### 1.2 Every page (READER-DESIGN, "Every page gets the reader's colours")

- **Less glare everywhere:** paper #f1f0eb, ground #ebeae4, dark ink #e0dfd9. Pictures of the B pages
  with these colours: https://claude.ai/artifact/92KozgPAJKHqzCLYjEJazr (source
  `.redesign-shots/notes/site-glare/`).
- **Six pages still in the old design move to B:**
  - `support.astro`
  - `attribution.astro`
  - `EN/glossary.astro`
  - `phrases.astro`
  - `desktop.astro`
  - `404.astro`

  All are under `app/src/pages/`. Only the 404 has a mock-up. Give the other five the B header,
  footer, type, and buttons the B pages already use, keep their words, and show John all five in both
  themes before you commit them.

### 1.3 The 404 (READER-DESIGN, the 15 Nov 404 entries)

- **Layout** (mock-up v3, https://claude.ai/artifact/BvZQQrfNeTS51c46XKrWVo; source
  `.redesign-shots/notes/404/mock/shoot2.cjs`):
  - one centred 640px column under the B header;
  - the plate, then the caption "τραγέλαφος · the goat-stag";
  - then "Page not found" as the h1 but set in the text face at text size: no capitals, not a title;
  - then today's paragraph, unchanged;
  - then "Back to the corpus" (red) and "Search".
  - No breadcrumb, no eyebrow, and no nav item marked current.
- **Copy:** today's words exactly (John: "SAME COPY AS OLD ONE"). Keep the page's meta and `noindex`.
- **Plate:** Jonston 1657, Tab. XXXIV. The credit is in READER-DESIGN, and the plate needs a
  picture-credits entry. Files are in `.redesign-shots/notes/404/`:
  - Light: `desk-404-914.jpg` (1280×914, padded like the other plates), used on every screen so the
    Latin labels are never cropped; multiply blend, as on work pages.
  - Dark: the cut-out `cut/404.png`, from `cut404.py` + `cut404.json` through the d26 `recut.py`.
    Bake it to WebP the way `.redesign-shots/notes/d26/darkplates/make_dark_assets.py` bakes the
    others, into `app/public/plates/dark/desk/`. One `<picture>` per theme, as on work pages
    (gate R-P4's pattern).
  - John approved the plate, light and dark ("Looks fine now"). Don't re-clean it.
  - `cut/404.png` is already made. To rerun `clean.py` or `cut404.py`, make a venv with numpy, scipy, and
    Pillow first: the one used on 15 Nov was in a temp folder and did not survive the reboot.

### 1.4 Search form (`HANDOFF-SEARCH-BUILD.md`)

- Build the 13 Nov form design (§0 "The new form design") with the 14 Nov rulings (§0 "The seven
  questions"). John's go: 15 Nov 15:30. The rendered target is the 13 Nov mock-up, not round 34.
- §8's tweaks, all ruled 15 Nov:
  - the View sheet drops Close;
  - no descriptions in the phone sheets;
  - rail lists stay as built (scrolling boxes with a fade);
  - "Any form" keeps its name;
  - Citations only moves to the Context menu.
- Search styles go in `shared/styles/b-search.css`.

## 2. Order

1. Reader CSS and components (1.1), then the reader gates: write each new gate's failing case first,
   and make every gate say when it examined nothing.
2. The pipeline paragraph flag, and a corpus rebuild for the English rows.
3. Colours and the six pages (1.2, 1.3).
4. Search form (1.4), with `search-shots` and `search-counts` unchanged.
5. §5 Finish. The PR waits for John's yes, and deploying is his call alone.

Commit on this branch as each stage passes its gates and review. The main checkout (`main`) holds
about 40 uncommitted files from other tracks. They are not this build's work: leave them.

## 3. Rules

- Commits on this branch are fine. Nothing is pushed, merged, or deployed
  until John says so.
- `.redesign-shots/` is untracked and must stay so: never `git add` it. Nor
  the stray `node_modules/` at the repo root.
- The kit and `docs/redesign-kit/` are read-only.
- Never shrink type or tap targets (one reader is vision-impaired and reads on
  a phone held sideways). Don't change the `--red` token. No explainer text in
  the reader.
- In Figma, never edit John's frames `4:2` and `23:1230`.
- Never write into `build/dist` (a read-only link chain).
- The design bar is the Vase (memory `design-bar-is-the-vase`); design is
  collaborative unless John says NOT THIS or MUST HAVE THIS.
- Svelte component `<style>` blocks: keep styles in `shared/styles/b.css` or
  `global.css` and check the built page (memory
  `svelte-styles-dead-in-built-site`).

## 4. How to see and check the pages

- **Preview:** start `redesign-preview` from the main checkout's
  `.claude/launch.json`, or, with Node 22 (`~/.nvm/versions/node/v22.23.1/bin`),
  `cd app && npx astro preview --port 4329 --host 127.0.0.1` (serves
  `app/dist` at http://127.0.0.1:4329). Rebuild with
  `cd app && PUBLIC_SHOW_PRIVATE=0 npm run build` (about 25s).
- **Round 9 shots again:** start the preview, then
  `node .redesign-shots/notes/d26/round9/shots9.mjs`. Copy it to shoot the
  build at the same states with no overlay.
- **Gates:** `.redesign-shots/notes/scripts/full5.sh <tag> [proof ids]` runs
  the full suite, then the proofs; `only5.sh` runs single gates. The older
  scripts there point at dead temp folders; fix their `S=` paths before use.
- Shot rules: set the viewport height to the shot height (`fullPage: true`
  with injected CSS blanks the plates); wait for `document.fonts.ready`.
- `build/export` in this worktree was made by hand (memory
  `worktree-builds-need-the-export-cache`).
- John judges in Safari at about 1152×663 with a dark-mode extension on.
- A shell heredoc holding JavaScript trips a safety check; write a Python
  patch file and run it.

## 5. Finish

1. **Done 15 Nov.** Full gate run plus proofs; tests (`app` vitest, `shared` vitest, root
   `test:scripts`, svelte-check); app build; link check (0 broken);
   `npm run build:public` and `npm run deploy:dry` at the root.
   Then one adversarial review of the whole branch diff since `main`, findings only, by a model
   family that did not write the code. Screenshots of every changed page in both themes for John.
2. **Done 15 Nov.** Fill the PR body, `.redesign-shots/notes/pr-body.md`: `__BUILD__` (the
   build:public and deploy:dry results), D26 and what followed it (logged in
   `.redesign-shots/notes/departures-amend.md`), round 9, the search build, and
   the follow-ups in §6.
3. On John's yes: push with an explicit refspec and open the PR against
   `main`. Don't merge it.
4. Start the speed session. John: "After the build is fully done, have a new
   session measure the site's speed and figure out how to optimize it." It
   reports to you.
5. Homepage card: staged in `~/personal-website/` (`assets/`, `dist/`;
   backups in `~/personal-website/backup-2026-11-09/`). **Not deployed.**
   Retake the shot (1280×860 at 1x) once the home page is final; deploy
   (`npx wrangler deploy` there) only on John's yes. The card shows only the
   left 71% of its picture.
6. At deploy, raise the Daily Nous pitch with John.
7. Then port the search design to plato-reader (memory
   `port-search-fixes-to-plato`), per hunk.
8. Rewrite this file (done 15 Nov; again at the next handoff).

## 6. Follow-ups for the PR body (not this PR)

- ~~Shard the gate suite~~: done, `app/scripts/check-redesign-shards.mjs` (79 gates in ~14 min).
- **Pre-existing, own PR:** a secondary translation's chapter can show twice (`pieceCont` falls back to
  `pieces[0]` in `Reader.svelte`; EN 5 1129a, 6 1144b, 8 1155a and 1158a, Rhet 2 1378a, Rhet 3
  1404a). The row join makes it more visible.
- Pipeline: `tests/test_running_text.py` imports `backfill_running_text`, never committed.
- One English Bekker number in EN sits on the line above its text (34.8px).
- Grammar group counts count the shown page (the whole result fetched 54 books, 33 MB).
- Review nits left: an old `ps=c` link opens at 40 a page; a spaced em dash loses the space before
  it (the mock did the same); an old proximity link with case and tense loses the case when the
  term is edited (G-3 derives one word class).
- ~~Reader pages need their own design rounds~~: done, rounds 1–7 (READER-DESIGN); built in this
  pass (§1.1).
- Search Forms list: accented spellings need an "accents" stream in
  Aristotle's search shards (Plato's build has one; `formAccents` in
  `shared/lib/search.ts`); then tick boxes split by case. John, 13 Nov: not
  this PR. Until then the results group ἀρετή and ἀρετῇ apart (key: accents
  stripped, breathing and subscript kept) while the list shows one "αρετη".
- English search refs to the line, once every work is properly aligned (John,
  13 Nov: column for now).
- Corpus: no lemma page for σωφροσύνη or ἀκούσιος.
- LSJ track: grammata's Logeion link is 14px tall; `.t8-entry` margin gap on
  phones.
- Print track: `/EN/book/1` prints a blank first page (old build too).
- Search (old design; check again after Track B): results open on Categories
  while the rail sorts by count; with "Match accents exactly", `λόγου` gives
  page 1 of 72 with no rows (the filter runs per page).
- Plates for the six new works (Prob, Spir, MM, Plant, RhAl, AthPol), ruled 7
  Nov, are on the unpushed branch `claude/new-work-plates-61b59e` (memory
  `plates-new-six-works`); RhAl-3 needs its British Museum credit shown.
- Desktop app: side effects of `shared/` changes are low priority (John, 9
  Nov).

## 7. Where things are

| What | Where |
|---|---|
| Build brief for all of B | `docs/redesign-build-brief.md` |
| Spec for the built home and work pages | `docs/redesign-home-and-work-spec.md` |
| Search build spec | `HANDOFF-SEARCH-BUILD.md` |
| Mock-up rounds, reviews, decision pages | `.redesign-shots/notes/d26/` (untracked); round N in `roundN/` |
| Search mock-up history (rounds 0–34) | the archive named at the top; flip page https://claude.ai/artifact/B9pKNaLxdQHqVYbVCzzb8U |
| Figma file | https://www.figma.com/design/3FGcwopu3awgAt63aiwlmH (page "Home hero"; the built pages are the block "BUILT · THE REAL SITE ON 10 NOV 2026", label `75:6138`) |
| John's rulings, round by round | `.redesign-shots/notes/hero-rounds.md` (untracked) |
| Design history and earlier rulings | `HANDOFF-REDESIGN.md` in the main checkout (top section wins) |
| B kit (read-only) | `~/Developer/aristotle-plates-scratch/kit/dirs/b/`; copies in `docs/redesign-kit/dirs/b/` |
| Notes, PR draft, departures | `.redesign-shots/notes/` (untracked) |
| Chapter titles (separate track) | branch `claude/chapter-titles-18c59c`, `HANDOFF-CHAPTERS.md` there |
| Deploy recipe | `DEPLOY-STATUS.md`; deploy only on John's yes |

Figma plugin gotchas (if a session draws there): `node.clone()` puts the copy
on the page, not in the source's parent, so move it in the same call; layers
inside instances of a frame cloned in the same call are not found by
`findAll`, so recolour them in a second call; a frame's height read straight
after resizing its width can be stale; the "Book row" master in Parts still
has the old red numeral.
