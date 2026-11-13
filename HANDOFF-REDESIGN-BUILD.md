# HANDOFF: redesign build (direction B)

Section 0 rewritten 13 Nov 2026, 17:30. Rewrite this file (don't append) when you hand
off. The version before this one (11 Nov, with the search mock-up history
stacked on it) is kept at
`.redesign-shots/notes/HANDOFF-REDESIGN-BUILD-archive-2026-11-12.md`.

## 0. State at 17:30, 13 Nov (coordinator, session aristotle-reader-62)

**Build on hold** (John, 14:40) while the search page is redesigned as one page.
The merged tree was fully green before the hold (`6fefc4f536`: app 130, shared
1867, scripts 99, svelte-check 0, stage6 pytest 41, build:public 0 broken,
deploy:dry ok, check-redesign 64/0, search-shots 0 failed, 14 counts unchanged;
logs `.redesign-shots/notes/d26/final7/`). Not pushed. Push, PR, merge, and
deploy each need John's yes.

**Search (search session, `HANDOFF-SEARCH-BUILD.md` in the search-build
worktree, committed `f7e3355c1a` and after).** Full mock-up done, four review
rounds (Opus, Codex, Opus, Codex): https://claude.ai/artifact/F1rX9UHRYpqEvyui5aUk7X;
files in search-build `.redesign-shots/notes/search-mock-13nov/`. Ruled today:
- D6 base (Greek and English side by side on desktop, stacked on the phone); no
  Greek/English/Both switch (the fields with text decide); options show under a
  field once it has text; "In all works | authentic works | choose works" as
  words on the Proximity/Search row.
- Field options: (a) words on desktop (1152, 961); (b) menus on the phone,
  upright and sideways (17:08).
- Phone: H3, labels above, Keyboard and Beta Code beside the Greek label (17:21).
- Phone one-row options: B1 option 3, Accents and Lemma drawn as words, one tap
  each (https://claude.ai/artifact/1cC7rocRSVenhgnwiT5s31). Only 2px spare at 360:
  the build tests it or lets it wrap.
- F 4b with Search on the footer row; G-3 with switches; no "Not searched yet".
Open for John: count on a Both search (word hits or passages); Lemma vs "any
form"; two lines per proximity term upright; name "Keep hits that cross a
chapter" in the folded line; Group by rows shut; 44px phone keys; sideways fold
after Search (all four reviewers back the last two).

**Reader design (new track, `HANDOFF-READER-DESIGN.md`, committed `3f1b1e9409`).**
Round 2 waits for John: https://claude.ai/artifact/6b1rJ55cg3ntyP4Fsy44rY.
Ruled: every Bekker line stays a line; no stacked layout; quiet bar; Gentium
Book Plus for Greek and English.

**Plato (queued with the Plato search port, after this build):** phone default
view → Both (John 16:56). The stacked full-size phone layout is not ruled.

**Alignment: parked by John (17:24).** Branches `claude/int-edghill-realign-2`
and `claude/sens-reverify` (not pushed), each with `review/README.md` listing
the three fixes awaiting John and the candidate track. API runs use John's `ant`
sign-in with `env -u ANTHROPIC_API_KEY` while the dead key is in ~/.zshenv.
Spent today: $1.15.

**Rounds page** (all earlier rounds): https://claude.ai/artifact/RDf6KuWG6TDtKsBedphspV.
Sources of my pages: `.redesign-shots/notes/coordinator-13nov/`.
`.redesign-shots/` and the root `node_modules/` are now in `.git/info/exclude`.
The version of this file before today's rewrite:
`.redesign-shots/notes/HANDOFF-REDESIGN-BUILD-archive-2026-11-13.md`.

**Still to raise:** the Codex review of the coordinator's gate changes
(ef3e1911ea, 09ff5e6728, 49715e6876); at deploy, the Daily Nous pitch.


Branch `claude/redesign-build`, this worktree
(`~/Developer/aristotle-reader/.claude/worktrees/redesign-build`). **Not
pushed.** 183 commits ahead of `main`; `main` has not moved (checked 13 Nov 04:00), so
no merge is due.

| Part | State |
|---|---|
| Stages 1–5 (home, work pages, reader, search, lexicon in B) | built, committed, gates and screenshot judges passed (`ae65fb23b4` … `4129016580`) |
| OG cards, gate fixes, merge of main (PR #194) | committed (`c6a276c90c`, `e98749a8a3`, `fa39aef88b`) |
| Home and work pages | **Round 9 built and committed, `f5f3b4a07f`.** Done: desktop, phone, sideways, On Youth plate, gates rewritten (each with a `--prove` case), spec updated, desktop edition rows 40px (John 12 Nov: round 9's 36 failed the 40px target floor), tool links red underline (John), per-theme dark plates (below), Codex review (7 findings, all fixed: report `.redesign-shots/notes/d26/build9/review/`). Comparison page for John: https://claude.ai/artifact/RqdqPvLasvcgYGLLwrmVHd (source `.redesign-shots/notes/d26/compare/`). |
| Dark plates | **Built.** John ruled all 48 (picker https://claude.ai/artifact/KKa82v6pQudmzSw5dv6Bq6, db `picks`; unpicked plates took the page's proposal, John's yes 12 Nov 20:17; MM dimmed): 18 cut to outline, 20 dimmed, 10 light lines. Baked WebPs in `app/public/plates/dark/{desk,phone}/` from `.redesign-shots/notes/d26/darkplates/make_dark_assets.py` (`final-picks.json`; cut-outs from `recut/recut.py` + `recut/cfg.json`, which uses FULL-PLATE pixel coordinates). Two `<picture>`s per plate, both lazy, inactive one `display:none`, so each theme fetches only its file; gate R-P4. Unicorn face and tail re-cut 12 Nov; John: "it's good". Left as is: mane hair ends, hoof notches, ground strip point and top hatching. |
| Ship plan | **John, 12 Nov 22:05: search lands together with the rest of the UI work, in one deploy.** Both tracks committed and merged; §6 checks run on the merged tree (13 Nov, logs `.redesign-shots/notes/d26/final6/`). |
| Search page | **The new design (round 34) is built** (search session, `HANDOFF-SEARCH-BUILD.md`) and merged here as `5d79e12b36`. |
| Reader | 12 Nov fixes committed, `f638f9fb79`; reader gates R-R5, R-R10–R-R17, R-A5 written and proved. |
| Tests | merged tree, 13 Nov: app 130, shared 1782 (8 skipped), test:scripts 99, svelte-check 0 errors |
| build:public, deploy:dry | green on the merged tree, 13 Nov (0 broken links of 414,159) |

## 2. Two tracks; pick the one John names

- **Track A, home and work pages, round 9.** This file. Work here, on
  `claude/redesign-build`.
- **Track B, the search page.** `HANDOFF-SEARCH-BUILD.md`, on its own branch
  `claude/search-build` in its own worktree, cut from this branch's tip of 12 Nov 13:40. It merges
  back into `claude/redesign-build` before the PR.

The two run at once (John, 12 Nov 13:30). To keep the later merge clean:
Track A leaves the search files alone (`app/src/pages/search.astro`,
`advanced.astro`, `shared/components/Search.svelte`, `shared/lib/search*`);
Track B puts its styles in a new `shared/styles/b-search.css`. Both may need
`shared/styles/b.css`; keep edits there small and say so in the commit
message. If John says only "continue UI work", ask which.
When both are in, do §6 (finish).

**Models (John, 12 Nov 13:29, for both tracks).** The session runs on Opus
5.5 at high effort and reviews. Codex writes the code:
`codex-companion.mjs task --background --model gpt-6.1-sol --effort medium`
(`~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/`); run `status` and
`result` from this worktree. Escalate a task to `--model gpt-6-astra --effort
medium` only after Sol fails it twice. Grok is benched ("no run codex. bench
grok"). Implementation and review are never the same model family. Load the
`delegate` skill before the first dispatch. Every Codex brief must say "Do not
launch a browser or run browser gates": its sandbox's Chromium throws macOS
dialogs. Run the browser gates yourself.

## 3. Track A: what to build

Build round 9 of the mock-ups with John's rulings of 11 Nov applied. Round 9
was drawn as CSS and a script over the built site; it is a sketch to port,
not code to paste.

### 3.1 Sources, in order of authority

1. **John's rulings in the decision page's db.** Artifact
   https://claude.ai/artifact/HaqsYCej1WAwvmF7WhohsU, collection `rulings`,
   one doc per question id. Read it with ArtifactData `list` first; where it
   differs from §3.2, the db is newer.
2. **§3.2 below** (the decisions log, 11 Nov).
3. **The ruled pictures:** phone work pages with the rulings applied, which
   John said "look good": https://claude.ai/artifact/JJsvrUAeMJAC9DxK2xcZ4s
   (source `.redesign-shots/notes/d26/decide/ruled/`); the desktop returning
   masthead: https://claude.ai/artifact/PJCANJ2F7RrFn4EbDtEDef (source
   `decide/masthead/`, variant `ret1q3` in `decide/shots.mjs`).
4. **Round 9 itself**, `.redesign-shots/notes/d26/round9/`: 26 shots
   (`r9-01` to `r9-26`), `BRIEF-R9.md` (what each shot shows, what round 9
   changed, measurements at 1152px, and the owner's settled choices), `r9.css`
   (522 lines) and `r9.js` (126), and the two reviews.
5. **Before and after with the reason for each change:**
   https://claude.ai/artifact/4yCNVqNTXmr2FZHTV5wm7b (source
   `.redesign-shots/notes/d26/final/page/index.html`).
6. `docs/redesign-home-and-work-spec.md` is the spec for what is **built**
   (D26). Update it to match what John accepted from round 9, in the same
   commit as the code.

### 3.2 Decisions log, 11 Nov 2026 (John)

Round 9 departs from earlier rulings in six places; John accepted each:
natural-wrap work titles, 36–60px (a 72px cap was tried and dropped); buttons
under the Greek title, not on the foot line; phone and sideways layouts no
longer frozen; wide plates dropped, one frame for all 47 works; the Greek title
in ink; the home sentence rewritten (below).

Desktop work page:
- Title: round 9's natural-wrap title, 36–60px.
- Buttons under the Greek title, as round 9.
- Plate always on the right, as round 9.
- Greek title in ink.

Home page:
- Greek line τὰ σῳζόμενα (not ἔργα).
- Sentence: "Read and search every work of Aristotle in Greek and English.
  Click any Greek word to parse and define it."
- **Returning reader, desktop: one work, with the passage and search on top**
  (14:59; replaces his 14:49 "two works"). The search box runs across both
  columns at the top of the intro; below it, the most recent work's card on
  the left and, on the right, the sentence the reader stopped at, Greek (16px,
  `--font-greek`) above the English (14px, `--read`), linking to the same
  place. Card sizes drop to keep the masthead height: title 24px, location
  15px, button text 14px (the button stays 44px tall). Only the most recent
  work shows, as on the phone. The passage comes from the book data at the
  saved location: the `greek` lines and the English the public build shows by
  default for that work; never a private translation (`private: true` in
  `shared/lib/works.ts`). For the Ethics that is Rackham's 1926 Loeb in the
  `english` field (the mock showed Ross's wording; that was wrong).

Phone and sideways (each page ruled on its own):
- **Home:** round 9, but **cut the red Greek line on the phone**.
- **Home, returning:** the bust and the full title; no site sentence; one
  "Continue reading" card for the single most recent work. Picture:
  `decide/img/ret-ph-keep.png` (it still shows the Greek line, which goes).
- **Work page (Ethics), new and returning:** round 9's layout with the **plate
  moved up, just under the English and Greek titles** (not round 9's
  tailpiece after the contents, and not the built page's place above the
  Greek title).
- **De Mirabilibus:** round 9.
- **Sideways (Ethics, On Youth):** round 9 with the **plate in a right-hand
  column** beside the title, Greek title, and buttons; the description in the
  left column under them; a long title (On Youth) wraps. For a returning
  reader, round 9's full-width "Continue at…" button and the three buttons
  below it take that left column instead of the description.

Words and plates:
- **No captions.** Round 9's caption code (`r3-cap`) is not ported.
- Edition labels as round 9: "Greek text", "Open Greek and English with",
  "opens first".
- De Mirabilibus count "178", not "about 178".
- **On Youth plate (14:46):** a composite, Milton's heart beside Eustachi's
  lungs (Milton, Anatomy, Viscera, Plate IV fig. 1, London 1814, Wellcome
  cr44ptdy; Eustachi, Tabulae anatomicae Tab. XV fig. I, Rome 1714). Ready to
  drop in: `decide/juv/final/{desk,phone}-Juv.jpg` (same sizes and mode as
  `app/public/plates/{desk,phone}/Juv.jpg`) and the record
  `decide/juv/final/plates-entry.json`. It has two sources, so `who`, `url`,
  and the credit name both; check the credit line shows two prints. Built by
  `decide/juv/comp.py`.

### 3.3 Build notes the rulings raise

- `app/src/lib/poster-fit.ts` `fitWorkPoster` shrinks a phone work title until
  the Start/Continue button fits the first screen. With the plate between
  title and button it drops the title to its 14px floor. With the plate under
  the titles, **the plate gives way** (cap `--plate-height` to the room left),
  never the title.
- The dark theme's cut-out plates (figures cut to their outline) were made
  for the mock-up and are saved in `.redesign-shots/notes/d26/saved-scratch/`
  (`sil/`, `oval/`, `contour/`, each with its script). Whether the build ships
  them is in round 9's shots (`r9-04`, `r9-10`, `r9-11`, `r9-21`); ask John if
  the db says nothing.
- Files in play: `shared/styles/b.css`, `app/src/pages/index.astro`,
  `app/src/components/Landing.astro`, `app/src/lib/poster-fit.ts`,
  `app/src/data/plates.json`, `app/public/plates/`, and the gates
  (`app/scripts/check-redesign.mjs`, `app/scripts/redesign-browser.mjs`).
  Blast radius: `app/`, `shared/`, `app/scripts/`.

### 3.4 Uncommitted edits already in this worktree

Left on purpose (John has not asked for a commit); keep them:
- `app/src/components/Landing.astro`: the facts list names the Greek source and
  each translation in short form ("rev. Reviser" and the imprint kept) and
  drops the "Length" row.
- `app/scripts/check-redesign.mjs`: tighter gates R-W4, R-W5, R-T1, R-T3,
  written after a Grok read and **never run**.
- `app/src/__tests__/redesign.test.ts`: an ink-box unit test (passes).
- `docs/redesign-home-and-work-spec.md`: its header line.
- This file and `HANDOFF-SEARCH-BUILD.md`.

### 3.5 Steps

1. Read the db rulings (§3.1). List any that differ from §3.2.
2. Brief Codex on the desktop pages (home new, home returning, work page) from
   §3.2 and the round 9 shots. Review: diff against the blast radius; tests
   re-run outside Codex's sandbox; build; shots in both themes beside round
   9's.
3. Then the phone and sideways pages, the same way, against `decide/ruled/`.
4. The On Youth plate.
5. Rewrite the gates for what was built (the D26 gates are stale; don't run or
   repair them before the build). **Write each gate's failing case first** and
   make each gate say when it examined nothing (CLAUDE.md, "a gate that
   compares a thing to itself").
6. Update `docs/redesign-home-and-work-spec.md`.
7. Show John the built pages beside round 9 before calling Track A done.

### 3.6 Still open for John (ask; don't guess)

- The Categories scan download again (bsb11761492, p. 833).
- The parentheses in the Greek summary and "rev. Ross" on the Politics.
- The nav on the 1168px column, home and work pages only.
- The De Mirabilibus row wrapping at 1525px (not rechecked against round 9).

### 3.7 Reviewer suggestions on round 9, not ruled (don't build unless John says)

- Opus: a fixed width for the chapter count so the Bekker ranges line up;
  "saved at chapter 3" under the title on desktop; one type treatment for all
  Bekker ranges; a dark-theme button of `#c4392d` with light text; small text
  on desktop at 15px or more; the "opens first" tag's baseline and wrap with
  long names; the Contents link only when the contents fall below the first
  screen; Oswald for book numerals.
- Codex: the go-to field on book-based works too; untitled chapter numbers and
  ranges at 18px or more; about 24px off the contents header on the phone; the
  saved book's numeral in red; larger header icons on the phone.

## 4. Rules that bind both tracks

- Nothing merges, deploys, or is pushed until John says so; commit only when
  he asks.
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

## 5. How to see and check the pages

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

## 6. Finish (after both tracks)

1. Full gate run plus proofs; tests (`app` vitest, `shared` vitest, root
   `test:scripts`, svelte-check); app build; link check (0 broken);
   `npm run build:public` and `npm run deploy:dry` at the root.
2. Fill the PR body, `.redesign-shots/notes/pr-body.md`: `__BUILD__` (the
   build:public and deploy:dry results), D26 and what followed it (logged in
   `.redesign-shots/notes/departures-amend.md`), round 9, the search build, and
   the follow-ups in §7.
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
8. Rewrite this file.

## 7. Follow-ups for the PR body (not this PR)

- **Shard the gate suite (John's yes, 12 Nov 23:17).** `check-redesign.mjs
  --stage 5` takes ~38 min, all gates in sequence in one browser; the gates are
  independent, so run them across ~4 browsers in parallel (target ~10 min),
  keeping `--only`/`--prove` and one combined log. Do it after the reader-fix
  commit, before §6's final run.

- **Reader pages need their own design rounds (John, 12 Nov 22:45: "reader
  pages need hill climbing too", later).** The reader was built in stage 3 and
  never went through the home/work rounds. Red, ruled 12 Nov: the book title
  and top-bar chapter are ink; chapter numerals, column labels, and footnote
  markers stay red (gate R-R17). Already fixed on 12 Nov night:
  fonts (Literata/Gentium/Cardo Greek, Literata/EB Garamond English, Literata
  at 300), no paragraph gap in Both view, split-line indent, line numbers 15px
  and level, footnote box anchored, clipped italic descender in the top bar.
  Proposed method: one review page of every reader state with a note box under
  each, then rounds.

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

## 8. Where things are

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
