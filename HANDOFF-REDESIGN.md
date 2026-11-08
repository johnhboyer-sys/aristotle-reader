# HANDOFF: site redesign (mockup rounds)

**8 Nov, evening: the build brief exists** at `docs/redesign-build-brief.md`
(uncommitted). John answered its five questions at 17:04; they are folded in,
and nothing is open. The build session works from the brief alone.

## Next: write the build brief (handoff of 8 Nov 2026, 11:20 CST)

John, 8 Nov: "write a detailed handoff so another session can write up the
design brief for a separate build session." So there are three sessions:

1. **This handoff** (the mockup track, rounds one to eight). Done.
2. **The brief session (you, if you are reading this).** You write the design
   brief. You do not build. The brief is one text file in the repo,
   `docs/redesign-build-brief.md`, uncommitted until John says. Every
   requirement in it is checkable, and every gate has a failing case first
   (CLAUDE.md, "A gate that compares a thing to itself").
3. **The build session.** It takes the brief and builds B into `app/` and
   `shared/`. It never opens a mockup and guesses; anything the brief leaves
   open is a defect in the brief.

John answered the open questions on 8 Nov ("John's answers" below). The
last three were settled at 16:47: title place and title size both "As set",
and the site name stays "Aristotle Reader". Nothing is left to ask before
the brief.

### Where things are

| What | Where |
|---|---|
| **Reference mockup: round eight v47** (B alone, every pick in) | https://claude.ai/artifact/7Rf66bAjGSuMDrTLZwjbQL |
| Plates page (each plate beside its title, v86) | https://claude.ai/artifact/67yjHJmBbi7e9bUCpgRQTa |
| Scratch kit (outside the repo; `kit/`, `work/`, `review-codex-2026-11-08/`, `plates-r9/`) | `~/Developer/aristotle-plates-scratch` |
| B's code (the source of truth) | `kit/dirs/b/{script.js,style.css,notes.js}` in the scratch kit; repo copies in `docs/redesign-kit/dirs/b/` match v34 byte for byte (checked 8 Nov, 11:20) |
| Shell (routing, `window.U`, data, fonts, focus rule) | `kit/shell.html`. Never in the repo: its data line is 1.5 MB of corpus copies |
| Plate manifest | `work/final-plates-2026-11-08.json` |
| Plate images | `kit/dirs/b/img/plates/{desk,phone}/<work>.jpg`, 48 each, 18 MB |
| Adversarial design review (Codex, 19 findings) | `review-codex-2026-11-08/findings.md`, its shots in `shots/` |
| Reader column cases and fix options | [Reader column layout: problem cases and fix options](#local_9cbac3c2-5d2a-4447-93ec-f8cc2a646769), done 13:35; page https://claude.ai/artifact/8g8LyjpLYjxziktNF8rUUQ |

Build the mockup to look at it: in `kit/`, `python3 -I build.py --out out/t
--dirs b`, then open `out/t/index.html`. Walk it with
`NODE_PATH=../pw/node_modules node tools/walk.cjs out/t/index.html b`. Shots:
`node tools/shoot.cjs out/t/index.html <outdir> "b-reader@max=900"` (flags
`@phone`, `@dark`, `@click=<selector>`). The sandbox blocks /tmp output dirs;
write inside the scratch folder.

### The site has moved on: work from origin/main

Local `main` here is 129 commits behind `origin/main` (as of 8 Nov 11:15).
The six new works (AthPol, MM, Plant, Prob, RhetAl, Spir) shipped live
there (PR #191, see DEPLOY-STATUS.md); the mockup's data already has them.
Read `shared/lib/works.ts` and the reader code from `origin/main`, not from
this checkout. The brief should tell the build session to branch from
`origin/main`.

### What B is (from `notes.js`, John's picks in rounds one to eight)

- **Idea.** The home page and each work page open on one poster: an old
  print, black ink, whole at its own shape, with the title beside it in red
  capitals. On a phone the title stands above the plate. In the lexicon the
  headword is the poster. The reader opens plainly, with no plate. Everything
  under the poster stays quiet.
- **Type.** Titles: Oswald 700, uppercase, red. Body: Literata for reading,
  Sofia Sans for chrome. Subheads: "Ruled label", small tracked red capitals
  over a red rule (John, 7 Nov: "go with this."). Title face settled 7 Nov
  ("this is the one", "remove others"). Load only the faces used: the
  `@import` on line 1 of B's `style.css` still loads Anton, Bebas Neue, Big
  Shoulders and Sofia Sans Extra Condensed for switches that are gone.
- **Colour.** Tokens are on lines 6–16 of B's `style.css`. Use `--red-ink`
  (#b42419 light, #ff7b70 dark) for all small red text; `--red` (#e2382e)
  fails AA at 14px (Codex finding 7).
- **Home.** Huot's bust left, title right (the only `place: left`). Line
  under the title, "As in Plato" (John, 7 Nov): "Parallel Greek–English
  editions of every work of Aristotle. Click any Greek word to parse it and
  see its definition. Search the corpus in Greek and English." "Tap" on a
  touch screen. Works by division; spurious and dubious tags in `--red-ink`,
  a step bolder (John, 7 Nov).
- **Work page.** Plate across the page, title beside it, 56px apart at every
  desktop width. Under it only the record (who · what · when · how · where ·
  licence · link). Then the facts and the books, each book number large and
  red. Porphyry lives only on the Categories page until other commentaries
  exist (John, 6 Nov).
- **Reader.** Plain head: the work's name, BOOK I in red title-face
  capitals, the Greek title, then the English translators. **Not the Greek
  edition** (memory rule; the mockup still prints "Greek: Bywater, 1894" on
  line 706 of `script.js`: Codex finding 6). Chapter numbers red. Contents
  read "Book I", not "I Book I" (John, 8 Nov).
- **Reader, Both view.** One Greek column width for the whole book, from its
  widest Bekker line (`evenGreek` in `script.js`; measure `offsetWidth`, not
  `getBoundingClientRect`, which returns scaled sizes and broke v33). On a
  phone held upright each passage stacks, Greek over its English, at 18px.
- **Reader columns when space is short: John ruled on every case, 8 Nov
  (13:35).** Record: `~/Developer/aristotle-plates-scratch/colw/reader-columns-options.md`,
  section "FINAL RULINGS" (copied there from the app's side-session notes).
  Live page: https://claude.ai/artifact/8g8LyjpLYjxziktNF8rUUQ (v10).
  1. Desktop and a phone held sideways: Greek and English always side by
     side, never stacked (John: stacking "defeats point of site"). Only a
     phone held upright stacks: Greek, English, then a second translation.
  2. The Greek keeps whole Bekker lines while the English keeps 26em. When
     there is no room, the Greek wraps with a hanging indent and keeps its
     line numbers: it gives way down to 20em, then both share in proportion.
     The English is never squeezed (John: squeezing is "unusable").
  3. Aa on desktop gets "Word panel: Keep English visible | Over text"
     (John asked for both as a setting). Default: Keep English visible (the
     panel pushes the text).
  4. A phone held sideways: the panel always lies over the English. No push,
     no Aa row, no bottom sheet. John knows that with it open only about two
     letters of each English line show.
  5. Compare: three columns (Greek, English, English) on desktop and a phone
     held sideways; stacked only on a phone held upright.
  6. The Greek width gets its own variable, `--greek-w`.

  Build notes: `evenGreek` reruns when the panel opens or closes, on resize,
  and when fonts load. With the panel open the column gap is at least 56px
  (the English margin numbers sit at -48px; round eight's 44px lets them
  touch the Greek). Compare with the panel open keeps clear of the panel
  (round eight's `.word-open.cmp .b-text { padding-right: 72px }` runs it
  under). Working code: `~/Developer/aristotle-plates-scratch/colw/kit/dirs/b/`
  (variants `wp`, `col=fb`, `cmpm=cm-side`) and that kit's `shell.html`
  changes to `setWord` and `close:word`. Round eight itself does not carry
  these fixes.

  Still open: the grey band over the reader on John's iPhone (v10 removes the
  likely cause; unconfirmed). At 844 wide the reader head breaks into two
  rows over its rule: a known fault, not yet fixed.
- **Aa panel.** View (Greek, English, Both), text size, the word panel row
  (desktop only, above), and a Greek font:
  Literata (default), Gentium Book Plus, GFS Didot. GFS Didot has one weight,
  so nothing in the Greek may rely on bold or italic. Load a face only when a
  reader picks it. Reset restores Literata.
- **Search.** The count in red; works with hits down the left; each hit shows
  book and chapter in dark type before the line, "I.5 1095b30", on one line
  (John, 8 Nov).
- **Lexicon.** The headword is the poster, at most 150px on desktop and 80px
  on a phone, in Gentium Book Plus (John, 8 Nov).
- **Dark mode.** Plates stay "on paper": the print keeps its white ground (John, 8 Nov).

### The plates

- **Manifest** `work/final-plates-2026-11-08.json`: an object keyed by the
  site's work id (`home` for the home page), 48 keys, each with `pick`,
  `place` (left/right; 47 right, `home` left), `desk`, `phone` (paths from
  the scratch root), `alt`, and the credit: `who`, `what`, `when`, `how`,
  `where`, `lic`, `url`. Built by `work/manifest.cjs` from B's `PL_LATER`;
  John's raw picks are in `work/picks-db-2026-11-08.json`.
- **Images.** Desk 1280×914, phone 640×558, greyscale JPEG, black ink on
  white. Cat's desk cut was shifted 150px right on 8 Nov (John: too much
  paper to the right; the full 302px to the margin was "too far"), about 100px short of the page margin. The old cut is
  `work/picks-2026-11-08/Cat-desk.before-shift.jpg`. Phone crops differ from desk crops on purpose (Cat-27 keeps the top
  of the tree; DA-1 lost its tongue and its border rule). Ship the files as
  they are, never re-crop in CSS.
- **Credits.** Every print passed a cross-family credit check with its fixes
  applied. Five carry non-commercial licences (home, Cat, Int, Mech, RhetAl);
  the site is non-commercial, so they stand (John, 8 Nov: "We don't care about
  non commercial as the site isn't commercial"). Prob has no holder date; its
  `when` says so. The Record link must carry the real `url` (the mockup emits
  `href="#"`: finding 5). Quote the holder's own credit line where it gives
  one (finding 14; e.g. the Met's "Gift of Mrs. Carroll G. Ross, 1945" for
  EN): the brief must say where that line comes from, since the manifest has
  no field for it.
- **The last twelve picks** (8 Nov) went in with `work/apply-picks.py`:
  Cat-27, DA-1, DivSomn-8, EE-2, EN-13, GC-23, HA-3, Int-30, Mirab-19,
  Poet-2, Rhet-3, Top-4. Metaphysics stays the darker Volpato. A recut
  needs its source leaf fetched again: the early `dl/` folders are gone
  (DA-1 and EE-2 were re-fetched on 8 Nov and matched the old cuts exactly).
- **EN and AthPol show columns**, which the early ban list forbade. John,
  8 Nov: "Columns are fine if I pick them." No change.
- **Where the 18 MB go** (`app/public` is 480 KB today) is John's question.
  See `repo-weight-is-dead-build-output` in memory.

### Copy changes the site must make

- "In n books" comes out of every work description (John, 8 Nov). On
  `origin/main`, `shared/lib/works.ts` has 17 `blurb` lines with it. The Magna
  Moralia line becomes "An ethics over the ground of the Nicomachean and
  Eudemian Ethics; whether Aristotle wrote it is disputed." The book count
  stays in the book list.
- `shared/` is copied into plato-reader and homer, not a submodule. Any port
  is per hunk (memory: `shared-is-copied-not-a-submodule`).

### Codex review: where each finding stands

| # | Finding | Status |
|---|---|---|
| 1 | Phone reader shrinks text for two columns | Fixed in v33: phone Both stacks at 18px |
| 2 | Controls under 40px (`.b-ib`, `.b-x`, `.b-rh-b` 34px, 32px on phone; "Open all books"; chapter links; footnote marks) | Open: build to 40×40 minimum |
| 3 | Landscape phone gets the desktop layout (only a 700px width rule; 436px word panel) | Settled: John's column rulings (above); the 844 head fault is open |
| 4 | Every "Start reading" opens Ethics I | Mockup only: real routing in the build |
| 5 | Record link is `href="#"` | Open: use `url` |
| 6 | Reader names the Greek edition | Open: drop it from the reader head and from `notes.js` |
| 7 | Small red labels 3.94:1 | Open: `--red-ink` |
| 8 | No keyboard way into word lookup | Open: the brief must specify it |
| 9 | Inputs set `outline: none` | Open: a `:focus-visible` style |
| 10 | Explainer text and empty states ("In this mockup…", "No analysis for this form", the empty Key passages text) | Open: draw nothing when empty |
| 11 | Search filters and lexicon links do nothing | Mockup only: wire to real data |
| 12 | `side` contradicted the renderer | Fixed: manifest field is now `place` |
| 13 | Prob has no date | Settled: `when` says the holder gives none |
| 14 | No holder credit line | Open: see Credits above |
| 15 | Non-commercial records undercounted | Moot (John: not commercial); there are five |
| 16 | Columns on EN and AthPol | Settled: John picked them |
| 17 | AthPol sits under Rhetoric and Poetics | **John's call**: that is the live site's grouping on `origin/main` (Division V), not a mockup slip |
| 18 | Posters push "Start reading" low (y≈950 at 1440) | Open: cap poster height by screen height |
| 19 | The B files alone don't reproduce the design | Open: the brief lists what B takes from `shell.html` (`window.U` helpers, the `mock` container query, `.frame :focus-visible`, footnote rules, the font link) |

### Rules the brief must carry

- A main reader is vision impaired and reads on a phone in landscape. Never
  shrink type or tap targets to make room; cut furniture instead.
- No explainer text in the reader: labels, refs, numbers and the texts only.
  Empty states draw nothing.
- Never name the Greek edition in reader chrome.
- Component `<style>` blocks ship nowhere in the built site; reader pages
  load only `global.css` (memory: `svelte-styles-dead-in-built-site`). The
  build must put B's CSS where it ships, and check it in the built `dist/`,
  not in dev.
- B's CSS uses `--gw` for two things: the poster title's weight (`--gw: 800`
  on the frame, line 11) and the reader's Greek column width (line 220). The
  frame's 800 leaks into the grid whenever the width is unset (confirmed
  by the column session). The width becomes `--greek-w`.
- The mockup's frame is scaled to fit the window; the site's is not. Checks
  written for the mockup must not be trusted as-is on the site, and the
  reverse.
- Build and deploy invariants are in CLAUDE.md and DEPLOY-STATUS.md
  (`PUBLIC_SHOW_PRIVATE=0`, the leak check, link gate at 0, `/bonitz` 404).
- After the redesign ships, raise the Daily Nous pitch with John (memory:
  `daily-nous-outreach`).

### John's answers, 8 Nov (13:40)

1. **Grey band on the iPhone:** gone in v10 of the column page.
2. **Lexicon headword face:** Gentium Book Plus. Drop the switch.
3. **Phone home:** title beside the bust (`p-side`: a smaller bust on the
   left, the title in a column beside it, the search box higher). Desktop
   home is unchanged. Then "keep bust same location on screen but have
   closer crop", then "I didn't mean crop out part of the bust. I meant just
   crop paper on left and right". v38 trimmed the side paper; John: "The
   crop looks worse. Either we go back to what we had or we have the paper be
   just an outline around plates that don't take up full rectangle". v39 is
   back to the pre-v35 box, and the outline became a dark-mode option (item 4).
4. **Plates in dark mode:** on paper. Then (13:52) the paper-outline idea,
   which matters only in dark mode, since light mode blends the paper into
   the page. v39 offers "Paper outline" (default) or "Paper rectangle". The
   outline keeps paper only about 20px around the ink, using one alpha mask
   per plate (`img/b/plates/{desk,phone}/mask/<id>.png`, from
   `work/masks/mkmask.py`). The 20 plates whose ink reaches half their
   border keep the rectangle. The edge is hard, not blurred (John, 14:24; v41). "Too uneven" on Int (14:25): v42 smooths every contour and gives near-convex plates (hull area ≤ 1.10× the shape) an even hull; plates whose ink reaches 30% of the frame, and Aud, keep the rectangle. Int (v43, John: "straight edges … equal distance from ink … right angles") gets a square-kernel outline instead (the `SQUARE` list in `mkmask.py`; it needs numpy and scipy). APo (v44) has a drawn block outline (`work/masks/apo.py`; rerun it after `mkmask.py`, which overwrites APo). John then asked to pick per plate: the picker is https://claude.ai/artifact/6femagKxta8X2YeMhbkCsJ (db collection `shape`, doc per work id, `{shape: outline|rect}`; no doc = the current rule). Read it with ArtifactData and apply before the brief is final. Phys (v45, John: "circle around whole thing") has a circle mask and a print scaled to 94%/96% so the circle fits (`work/masks/phys.py`; originals in `work/picks-2026-11-08/Phys-*.before-circle.jpg`); rerun it after `mkmask.py` too. Ink cutoff raised to 232 (`INK`) after John found outlines cutting light lines (Poet, Lin, Aud; picker v3, round eight v47). Cael is forced to rectangle (John: "better without outline"). Later picker threads (picker v4–v6, round eight v48–v50): Int is one rectangle R out from the outermost ink (`work/masks/shapes.py`, which also draws Mem as an ellipse, widened 0.8 R more; rerun it after `mkmask.py`); `PER` in `mkmask.py`/`mkcand.py` sets per-plate ink cutoff and margin (Sens, Somn ×1.7; Juv, MA ink 246, ×1.5); PA never takes a hull, APr always does; IA fills each column down to one floor line; Somn keeps its outline though its wider band reaches the frame. Round eight v51: the dashed switches sit in a strip below the pinned bar and scroll away (John: "make this menu non sticky"). John, 15:40, on APr: "paper rectangle looks fine on desktop and mobile" — he had already picked Rectangle for APr. Round eight v53 applies the picker's picks (`work/masks/picks.json`, applied by `work/masks/picks.py`, run LAST): rectangle for APr, Cael, HA, IA, Juv, Lin, MA, Mech, Phgn, Plant, Poet, Sens, Somn, Spir, and Int (John, 15:41: "rectangle looks better on both"); MM outline. Then John, 15:57: "Only place outlines kinda work is on homepage. And even there? Eh not amazing." So round eight v55 puts every work plate on its full rectangle in dark mode (`picks.json` lists all but home); John, 16:28: "I think all rectangles." Round eight v58 makes Paper rectangle the default for every plate, home included (the outline stays as the second switch option for comparison only). On the phone home the plate box is 46cqw wide, ends 20px before the title, and uses object-fit: cover so the bust keeps its size, centred, with blank paper trimmed from the cut's sides (John: "I don't want the plate's paper to overlap the title"; "That's good"). v59 restores the full-size Physics cuts (the 94%/96% shrink was only for the circle outline). John, 16:30, on the switches: Home line "As in Plato" ("This is the one") and Plates in dark mode "Paper rectangle" ("This one"); both were already the defaults, so v59 needs no change. **For the brief: dark-mode plates sit on a paper rectangle; the outline machinery (masks, mkmask/apo/phys/shapes) is not for the build.** The Phys print is still scaled to 94%/96% from the circle work; restore it from `work/picks-2026-11-08/Phys-*.before-circle.jpg` if the rectangle stays. **John has not picked yet.** Mask images load
   CORS-mode: they fail from `file://`, so test over HTTP
   (`tools/shoot-http.cjs`, `tools/walk-http.cjs` with a server on :8765).
5. **Title place and size switches:** place settled 8 Nov, 16:47: "As set" (John: "this is what we do"). Size settled 16:47: "As set" (John: "this"). John wants to look again
   ("b"). The brief session shows him round eight's "Title place" and "Title
   size" switches and gets a pick before the brief is final.
6. **Athenian Constitution:** move it to Moral and Political Philosophy
   (Division IV, after Pol) in `shared/lib/works.ts`. That changes the live
   home list and its breadcrumb, so the brief lists it as a site change.
7. **Plate images:** in the repo, under `app/public`. John: other people's
   clones don't matter. 18 MB, 96 files.

Item 5 settled 16:47 (both "As set"). Site name settled 8 Nov, 16:47: John on "Aristotle Reader", "This name is fine"; the build keeps it.

Threads 539d4ad3 ("too quiet") and 434b336a ("rewrite this copy") are still
open on round eight, but John's later picks (Ruled label; As in Plato)
answered both. Resolve them with a one-line reply once he agrees.

### Not done

- Nothing in this track is committed. The repo copies under
  `docs/redesign-kit/` and this file are uncommitted edits.
- The handoff below this section is history (rounds one to eight). Where it
  disagrees with this section, this section wins.

---

# History: the mockup rounds

## Where things are (rounds one to eight)

| What | Link |
|---|---|
| **Round eight (current): B with plates** | https://claude.ai/artifact/7Rf66bAjGSuMDrTLZwjbQL |
| **Your notes, as options** (title places, 36 new prints; Pick buttons) | https://claude.ai/artifact/WisALWsDFT2m2EVuxsXWJS |
| **The plates, one by one** (each beside its title, new prints, Pick) | https://claude.ai/artifact/67yjHJmBbi7e9bUCpgRQTa |
| Round seven (B, D, H; v30), with its comment threads | https://claude.ai/artifact/RtrrFk4cPQDh7mrjUyqcZh |
| **Decision sheet for round seven** (answered 4 Nov) | https://claude.ai/artifact/UGg8nKUSiSHw7x32hE8WGD |
| Poster title faces (B's faces, with Yes/No picks) | https://claude.ai/artifact/3Q1LLCvfpNvuB3eCgRVhwu |
| Round six (E, F, G, H early) | https://claude.ai/artifact/MkNU79qNssQ7Pco5TKomvj |
| Round five (B alone) | https://claude.ai/artifact/4JKoRv15wqC1mSFfFcmMmz |
| Round four | https://claude.ai/artifact/PNuw2yLEayHuLAn7FjivTn |
| Round three | https://claude.ai/artifact/8svNwSXYLPBHZSfaKiSjuJ |
| Round two | https://claude.ai/artifact/FpxinJwQa35j2SdAgAy7HN |
| Round one | https://claude.ai/artifact/7nbtgk2xUiX1TKk3Ex8y3S |
| Poster titles (round four study) | https://claude.ai/artifact/BVfg5CkJbG8zJmjXHEXPuq |
| Gelatin silver prints (round four study) | https://claude.ai/artifact/XizpnWAJ6xtsoVPtpcX7MJ |

**Scratchpad saved, 7 Nov.** Before a restart the session scratchpad
(groups, cuts, plates page build, mockup shots) went to
`~/Developer/aristotle-plates-scratch` (967 MB, outside the repo). Its
README gives the one-line symlink that makes every "scratchpad/..." path
in this file, every record `src`, and every script work again. Left
behind: whole downloads (only each live record's source leaf kept),
proofs, work dirs, `kit-alt/out/`, old shot folders.

Each round shows every direction on the same six pages (home, a work, reader,
search, lexicon, overview) at desktop 1440 and phone 390 side by side, on real
data: Nicomachean Ethics Book I in Greek with four translations, real parses
and LSJ entries, a real search for ἀρετή.

## John's answers, 4 November

From the decision sheet (`picks`), verbatim where he wrote a note:

1. Direction: none yet.
2. B title face: Oswald (already the default).
3. B blackboards: no pick. "Undecided, but lets see if we can't find the
   following: For categories, something with a classifcatory tree or
   something being drawn on a blackboard. for de interp, something with
   sentences being written on board. for posterior analytics, something
   invovling a scientific demonstration. for topics, either keep the fencing
   or go with two people discussing something deeply. for sophistical
   refutations, a debate."
4. B, De Interpretatione: the Greek verbs. "Look for alternatives? idk."
5. H plates: 1700–1900 (already the default).
6. H title face: no pick. "None of these. Lets explore others."
7. H portrait: Jesi's engraving (already the default).
8–9. P colour and masthead: green; three rows with ΣΤΑΓΕΙΡΙΤΗΣ. Moot: then in
   chat, "we aren't doing P."
10. D phone division pictures: no pick.
11. Search count: smaller in both (as built).

Then in chat: "also decided i don't like the site title in the header of D
and H. come up with alternative."

## Version 14: what changed from 13

- **P removed**: not built (`--dirs b,d,h`), gone from the overview, and its
  three thumbnails deleted from the artifact (`ov/p-*.jpg`). `dirs/p/` stays
  in the repo as history.
- **Edition labels** fixed in `shell.html`'s data to the site's strings in
  `shared/lib/works.ts`: "Benjamin Jowett, rev. W. D. Ross (Oxford, 1921)",
  "S. H. Butcher (Macmillan, 4th ed. 1907)", "F. H. Peters (Kegan Paul, rev.
  ed. 1893)", "Thomas Taylor (1812, modernized)" (Taylor twice: Cat, Int).
  `U.transParts` renders them as "Benjamin Jowett, rev. W. D. Ross, Oxford,
  1921" and so on.
- **B, logic works**: the Logic works switch now has three sets: `finds`
  (default, "New finds (4 Nov)"), `chalk` (round seven's blackboards) and
  `getty` (as before). In `finds`:
  - De Interpretatione: a Dutch lesson for Englishwomen, Arlington House,
    London, 1943 (Nationaal Archief 935-2002, CC0). The board: "Hou je mond =
    hold your tongue", "houden = to hold", "zitten zat gezeten", "sterven
    stierf gestorven": a sentence, its verb, verbs in their tenses. Int 4,
    16b26 (Edghill).
  - Posterior Analytics: a physics lesson, Christelijke HBS, Utrecht, 1935
    (Het Utrechts Archief, Public Domain Mark). APo I.2, 71b17 (Mure).
  - Topics: "Twee mannen in gesprek", Willem van de Poll, 1932 (Nationaal
    Archief 254-5411, CC0). Fluted columns behind them, close to the column
    cliché: flagged to John; the fencers are on `getty`. Top I.2, 101a27.
  - Sophistical Refutations: REM debate in the Eerste Kamer, De Wilde
    speaking, Jac. de Nijs / Anefo, 1964 (Nationaal Archief 917-1881, CC0).
    SE 2, 165a38. The caption names the debate, never the speaker as a
    sophist.
  - Prior Analytics keeps Schrek's lunes; Categories keeps the horse: no
    classification tree on a board or drawn turned up in any open collection
    (the nearest were KNIL military drawings, one from the 1947 colonial war).
  - Records, runners-up and cuts: `image-tools/chalk/SOURCES.md` (second
    section) and `image-tools/chalk/cuts2.py`. Images at
    `img/b/logic2/{bw,printed}/{desk,phone}/<id>.jpg` (16 files). In the code:
    `FINDS` and `logic()` in `dirs/b/script.js`.
- **H, title faces**: new Google faces replace Bodoni Moda, EB Garamond,
  Instrument Serif, Piazzolla and Archivo: `caslon` (Libre Caslon Display,
  default), `young` (Young Serif);
  `didone` keeps Noto Serif Display as before. `baskerville` (Baskervville),
  `oldstandard` (Old Standard TT), `besley` and `fell` (IM Fell English, "too
  affected") were four more; John turned them down (comments, 4 Nov) and
  v20–v23 dropped them. Young Serif sets the bar's brand
  smaller (`--bfs`) so the phone bar stays one row. Titles got .08em of top
  padding (cancelled by margin) because Young Serif's ascenders were cut by
  1–2 px.
- **D and H, site name**: a new "Site name" switch in both: `caps`
  (ARISTOTLE in spaced capitals, default), `capsrd` (ARISTOTLE READER on a
  desktop, ARISTOTLE alone on a phone; v16, after John's comment), `greek`
  (Ἀριστοτέλης), `oldname` (Aristotle Reader). John turned down The Works of
  Aristotle (comment, 4 Nov), so v15 dropped it.
- **Phone site menu (v17, John's comment 4 Nov)**: on a phone, B, D and H fold
  the site links into a `<details>` menu (`.k-sm`, panel `.k-sm-p`, full width
  under the bar) beside a search icon; the moon stays. Desktop is unchanged.
  The CSS is a block at the end of each `style.css`; the markup is in `nav()`.
  Code: `brand()` in each `script.js`. Switch ids must match `\w+` (the hash
  regex); `nm-caps` broke routing.
- **H home title (v24)**: John on the big "Aristotle Reader": "Let's move
  away from this logo." `homeTitle()` in `dirs/h/script.js` now follows the
  Site name switch: "Aristotle" alone on one line (`caps`, `capsrd`), the
  Greek name in GFS Didot (`greek`), the old two lines only for `oldname`.

Checks on version 14 (test build `out/t14`): walk (b,d,h, light and dark: no
script errors; failed loads only for images not fetched locally), labelfit (36
labels, 0 bad), namefit (D and H bars for every name and H face at both
widths: one row, nothing cut, the expected text; its control, `min-width:
260px`, gave 8 BAD earlier today), navfit (all one row; control 4 BAD),
headmeasure (0.0 px baseline spread in every bar), controls and cmpjump (all
ok), hclip and fitbox (see "Check results" below).

## Round seven: the three directions as they stand

Dashed switches in the mockup's bar show each direction's versions. Keys: 1–3
pick a direction, v flips the first switch, f steps through title faces, t
dark, p both widths, n designer's notes. A hash opens a setting directly, e.g.
`#b-work:Int~chalk` or `#h-home~young~greek`. Settings carry over from page to
page.

**B · Poster.** One black-and-white photograph per work (Getty Open Content,
CC0), the title over it in red capitals.
- Title face: Oswald Bold (John's pick); the switch keeps Sofia Sans Extra
  Condensed, Anton, Bebas Neue, Big Shoulders and round five's Sofia Sans.
  Round five's fitting rule stands (whole words; one syllable break only where
  a word whole would be under half the largest size).
- Photographs switch: black and white, or as printed.
- Logic works switch: see Version 14.
- Reader: Book I opens on a plain head: the work, BOOK I in red Oswald, the
  Greek title and editions.
- Search: count 88 px desktop, 60 phone; works with hits down the left.
- The home page rotates through eight Getty photographs.

**D · Aldine.** Each work beside its first printing, Aldus Manutius, Venice
1495–98 (Boston Public Library copy via the Internet Archive, Public Domain
Mark), EB Garamond and Gentium Book Plus. New site-name switch.

**H · Plates.** One old print per work in one blue ink.
- Since v25, each later plate shows what its work is about as a whole (see
  "Version 25: whole-subject plates").
- Plates switch: "1700–1900" (default; all 41 works and the home page) or
  "1500s" (24 works and home; 17 get their Greek title as the plate).
- Title face and site name switches: see Version 14. Archivo for labels,
  Piazzolla for reading, GFS Didot for large Greek.
- Home portrait: Samuele Jesi's engraving after the ancient bust (Wellcome).
- Search count 96 px desktop, 64 phone.

All three: every work on the home page; Greek and English side by side in the
reader on a phone too; top-bar items on one baseline; works list on every
search page.

## Captions

**No picture in B, D or H has a caption since v19.** John, 4 Nov, on B's Int
photo: "i don't like these claude generated captions"; then on D's home
picture: "either cut them down or cut them entirely and just include details
on attributions page." v18 cut B's to the archive record; v19 cut every
caption (B's records, D's home and work figcaptions, H's plate captions on
home and work pages) and added a **Picture credits page** in each direction:
`B.credits`, `Dd.credits`, `H.credits`, reached from the footer's "Picture
credits" link (`data-go="credits"`) and by hash `#b-credits`. It lists the
pictures for whichever set the switches show. `shell.html`'s hash regex
(`readHash`) gained `credits`; shell.html is not in the repo, so a restore
from v18 or earlier lacks it. D's short division labels ("Categories, first
printed 1495") stay. The `cap` fields were deleted from B's `CHALK` and
`FINDS` (version 17 of the artifact still has them; FINDS was never
committed); H's `q`/`c`/`t`/`note` fields stay in `PL`/`PL_LATER` but nothing
renders them. The history below is for anyone bringing captions back.

Every caption in B and H that quotes Aristotle was checked on 3 Nov against
the English the site shows, by work, book and Bekker line (`tools/capcheck/`).
The four new B captions were checked on 4 Nov the same way, against
`sources/{int-edghill,apo-mure,top-pickard,sr-pickard}/` and their
`anchors.yaml`. Caption text lives in `dirs/b/script.js` (`CHALK`, `FINDS`),
`dirs/h/script.js` (`PL`, `PL_LATER`) and, for B's Getty photographs,
`shell.html` (`DATA.photos`; that data line escapes `/` as `\/`).

## Version 25: whole-subject plates

John rejected later plates that illustrate one sentence: "the spider in
physics makes no sense"; "the swallow for nicomachean ethics is so tenuous.
it's one flipping line / lots of these seem tenuous"; "prior analytics can't
be a fucking goat" (it was a mule). Rule since: **the picture must show what
the work as a whole is about; never a one-line example.**

v25 replaced 26 later plates: Cat, Isa, APr, APo, Phys, Cael, GC, DM, Long,
Juv, DA, Meta, DivSomn, Aud, Rhet, HA, PA, IA, MA, GA, EN, EE, VV, Pol, Phgn,
Mirab. Sens took Meta's old eye (Milton 1809). Five Sonnet agents found and
cut them under one brief; a Grok 4.7 pass checked every record against the
holder's page, and its fixes are applied. Everything is in
`docs/redesign-kit/image-tools/h-plates/whole-subject/`: `BRIEF.md`,
`cut.py` (prep.py's chain at 1280×914 and 640×558), `sheet.py`,
`spec-<group>.json` (crop boxes; `src` paths point at a scratchpad that is
gone, so re-download from each record's `url`), `records-<group>.json` (the
agents' own records with `why` and `runner_up`), `verdicts-grok.md`, and
`apply.py` (the final field values, as written into `PL_LATER`). The cut
JPEGs are in the artifact only (v25 `img/h/later/`). New records carry no
`q`/`c`/`t`/`note`/`pos`.

Grok's four "FAIL"s (Cat, APo, Phys, EN) were Internet Archive pages with
no rights field; those books date 1703–1866, so they are public domain by
age, and the brief to Grok was stricter than the rule. EE's Yale page blocks
robots; its Commons file gives CC0, Yale, 1771. EN's maker comes from the
plate's own signature ("Paulo de Matthaeis Pinx: / Sim: Gribelin Sculps:").

Untouched later plates still to judge by the same rule: Int, Top, SE, Mete,
Mem, Somn, Insomn, Oec, Mech, Col, MXG, Lin, Vent, Poet, and Sens's eye.

## Version 26: titles on the plate (dropped in v28)

John, 4 Nov: "How about we try a mix of poster and plates. That is poster
titles on the plates?" v26 gave H a Titles switch that set Oswald capitals
in vermilion over each plate. John, 5 Nov: "Just having the titles over the
plates with the rest of H's design doesn't work at all." v28 took it out
(H's script is pre-v26 plus small caps; backup of the v26 code at
`scratchpad/work/h-script.v27.js` in the session, not kept), and
`tools/pstfit.cjs` went with it.

## Version 27: the name in small caps

John, 5 Nov, on ARISTOTLE READER in H's bar: "Maybe small caps?" H's Site
name switch gained `smallcaps`: "Aristotle Reader" in Playfair Display SC,
both words at both widths. Real small caps only: none of H's title faces
(Libre Caslon Display or Text, Young Serif, Noto Serif Display) has small
caps as Google Fonts serves it; with `font-synthesis-small-caps: none` they
fall back to lower case (tested 5 Nov). D did not get the option.
`tools/namefit.cjs` now skips a name a direction does not offer.

## Version 28: B with plates

John, 5 Nov: "Could you do a variant of B with plates instead of photos?
Don't have the plate ink lines be blue." B's first switch (`photo`) is now
Pictures: `bw`, `printed`, or `plates`, e.g. `#b-work:HA~plates`. With
plates, `poster()` in `dirs/b/script.js` shows `img/h/later/{desk,phone}/ID.jpg`
(H's later plates, read through `window.T.h.plates()`) with
`object-fit: contain` and `mix-blend-mode: multiply`, so the ink prints
black on B's paper; dark mode inverts it and screens it. The home page takes
H's `home` plate (Jesi) and drops "Next photograph"; the credits page lists
the plate records through `H.plateCredit`. v29, after John's note on On the Heavens ("the image works well on mobile,
but not on desktop"): on a desktop the plate poster spans the page at the
plate's own shape (`aspect-ratio: 1280 / 914`, about 1030 px tall at 1440)
and `fitPoster` fits the title to a 1296×972 box; the phone keeps the
488 px poster with the plate contained.

## Version 30: De Anima's plate

John, 5 Nov, on Boilly's Les cinq sens: "This de anima plate is awful. It's
comic. No." Searched (in order): Prud'hon's L'Âme and Boudard's Anima beata
(both a soul leaving the body: Plato's soul, not Aristotle's; L'Âme's museum
photo is CC BY-NC-SA); Bonnet's Échelle des êtres naturels (1745,
traitdinsectolog01bonn leaf 40: a 1:6 column of type, 572 px wide); Llull's
ladder (1512: only a 399 px copy on Commons; no open large scan found at
Commons, IA, Wellcome, Gallica; Göttingen and Dartmouth hold copies). Took
Diego de Valadés's order of beings, Rhetorica christiana (Perugia, 1579),
Getty copy, archive.org rhetoricachristi00vala leaf n259 (2352×3528), cut to
the living bands (people, birds, fish, beasts, trees): desk crop
x500–2045 y1395–2500, phone x620–1925 y1370–2508, cutter
`scratchpad/plates-new/G/tools/vcut.py` (session only). The plate's God,
angels and hell are cut out. Boilly's images kept at `scratchpad/work/da-boilly/`.

## Round eight: B with plates, alone (5 Nov)

John: "So I'm thinking B with plates." Then: "Take out D and H." "We will
need to address the home page image." "And a careful audit of all the other
plates. Give me artifact with all the plates for each work. Show both desktop
and mobile views. Thumbs up or down buttons for each."

- Round eight is a new artifact, so round seven keeps D, H and its 18 open
  threads. Built `--dirs b`; shell title and bar say round eight.
- The later plates (`PL_LATER`, `plateCredit`) moved from `dirs/h/script.js`
  into `dirs/b/script.js`; B no longer reads `window.T.h`. Images moved to
  `dirs/b/img/plates/{desk,phone}/` (42 each; pulled from round seven's live
  files, which matched the local copies). Plates is now the first, default
  option of B's Pictures switch. B's photographs (`img/b/desk`, `phone`,
  `printed/*`, `chalk/*`) were never in the kit: they were copied server side
  from round seven into round eight.
- Overview rewritten for B alone; round seven's is saved as
  `overview-round7.html`. Pictures `ov/b8-*.jpg` (session kit only).
- The plates page: `docs/redesign-kit/review/` (`make.py`, `shell.html`,
  `audit.json` = my verdict and note per plate, `plates.json` = the records).
  Screens are B's posters shot by `tools/shoot.cjs` at desktop max=1160 and
  phone max=760; shoot one spec per run (a long multi-spec run dies on its
  first screenshot). Votes: `votes/<plate id>` = `{v: "up"|"down", at}`,
  rule `votes` read view, write owner. Read with ArtifactData `list`
  collection `votes`. Empty at publish.
- Audit (mine, against "shows what the whole work is about", plus how the
  poster reads): 22 keep, 15 doubt, 5 replace. Replace: Categories (Haeckel),
  Sophistical Refutations (coin), Physics, On Colours (grey grape), MXG
  (Neptune). Doubt includes the home page, De Int (one example), Topics
  (fencing metaphor), Meteorology, Sense, Memory, Metaphysics (School of
  Athens cliché), NE (Hercules's choice runs against Aristotle on pleasure),
  EE, De Mundo, Lines, Rhetoric, and three that read badly as posters:
  Poetics, GA, Vent (the title hides the band of winds).
- 16 plates carry no record link (home, Int, Top, SE, Mete, Sens, Mem, Somn,
  Insomn, Oec, Mech, Col, MXG, Lin, Vent, Poet). Grok was sent to find and
  check their holder pages. Result (`docs/redesign-kit/review/verdicts-16.md`):
  6 pass, 9 fix, 1 fail, all 16 found. Fixes applied to B's records and both
  pages republished: every plate now has a record link. Changes worth
  knowing: Jesi's home plate is undated on Wellcome ("after the ancient
  bust" dropped); Int is 1779–90, etching and engraving, two LoC impressions
  (89712610 coloured, 00651172 not; which one our image came from is not
  known, linked the first); Top's lettering names the plate (riposte of
  quarte, plate 23); Mech and Poet are 1861, not 1840; MXG is after
  Boucher; Lin's page names no engraver (Aveta and Lasinio dropped);
  Oec shows ducks, not hens (I checked the plate; alt rewritten). The fail
  is On Colours: Wellcome dates it to the 17th century after Jan Polydore
  (1646–1726), impossible for a lithograph; left as undated, and it is
  already marked Replace.
- Correction: an earlier message said Daczický's 1577 comet is in the later
  set; it is in the 1500s set. The later Meteorology is an 1860 wood engraving.

## Round eight, evening: notes and votes into options (5 Nov)

John: "Look at notes", "And votes". 28 of 42 voted. Keep (13): Isa, Cael,
Mete, Somn, DivSomn, Long, MA, Oec, Mech, Phgn, Aud, Lin, Mirab. Replace (15):
Cat, SE, DA, Mem, PA, Meta, EN, EE, Pol, VV, Col, MXG, Vent, Rhet, Poet. Not
voted (14): home, Int, APr, APo, Top, Phys, GC, Sens, Insomn, Juv, HA, IA,
GA, DM. Thirteen threads on the plates page (plus one, Meteorology, not sent
to Claude) asked for placement fixes and second options.

- Title breaks: John marked METEOR / OLOGY and MECH / ANICA. `BRK` in
  `dirs/b/script.js` holds his breaks; a word in it breaks only there.
- Two new switches in B: Title place (`tpos`: as set, over, top, foot,
  above the plate = `band`, beside = `side`; a phone sets `side` as `band`)
  and Title size (`tsize`: as set, Full, Whole words, Smaller). A plate's
  own choice will go in its record as `tp` / `ts` once John picks. Off the
  plate, titles set ragged in whole words (justified lines opened holes);
  any size but Full keeps words whole. The current APo phone title breaks
  POSTE / RIOR / ANALY / TICS, which is likely what he meant.
- Sense: recut from Wellcome's full scan (V0008055FA, fig. I) and in round
  eight now: desktop whole and centred, phone larger. Spec in
  `image-tools/plates-r9/spec-fix.json`. The later set's source scans are
  gone (they lived in a temp `dl/`); re-download from the holder to recut.
- GA: the white space is the print (six embryos on a grid); a tighter cut
  breaks the series. Offered `side` instead.
- New plates: five Sonnet searches (brief `image-tools/plates-r9/BRIEF.md`,
  records and specs `records-*.json`, `spec-*.json`) found 37 candidates for
  19 plates (the 15 down votes plus home, Phys, APr, APo and SE, where he
  asked for options). Thin: Cat (1, Imperato's museum), MXG (1, Fludd's
  rings). The cuts live only in the session scratchpad and the options
  artifact. Grok checked all 37 records against the holders' pages
  (`image-tools/plates-r9/verdicts-grok.md`): 12 pass, 23 fix (applied,
  mostly maker credits such as "after Bruegel" and Fludd's engravers de Bry
  and Merian), 2 fail. Meta-3 (Jacoby's School of Athens) is out: its only
  scan is CC BY 4.0 on Commons. APo-1 (Byrne) fails only the brief's
  print-only rule (letterpress with colour-printed diagrams); kept, since
  John asked for proof steps, and its technique corrected. 36 remain.
- The options page: `docs/redesign-kit/review/options/` (`make.py`,
  `shell.html`, `groups.json`, `gen-plates.py`; `altbuild.py` builds a copy
  of the kit with candidate N in place, `shoot-cands.sh` shoots it). Picks:
  `picks/<group id>` = `{o: option id | "none", at}`, rule `picks` read
  view, write owner. Group ids `tp-<work>`, `ts-APo`, `br-Mete`, `br-Mech`,
  `pl-<work>`; plate option ids are the candidate ids (`Meta-1`) or `now`.
- Round eight v4: breaks, switches, Sens recut, overview line. All 13 threads
  answered and left open.

## Round eight, late: title beside the plate (5 Nov)

John: "I'm leaning towards the side of the plate placement. The title on top
of plate only works for some of these." Then: "redo the plate artifact with
alternative options."

- B's default title place is now `side` (beside the plate; on a phone,
  above it). `poster()` reads a plate's own `tp`, else `side`; Title place
  still shows the rest. Round eight v6 has it, with an overview line.
- The plates page (same URL, v3) is rebuilt from
  `docs/redesign-kit/review/plates2/` (`make.py`, `shell.html`): each work
  shows its present print and its candidates, all beside the title, with
  Pick (`picks/<work>` = `{o: "now" | candidate id | "none", at}`) and
  "Title over works here" (`over/<work>` = `{v: true, at}`), over a small
  shot of the old over-plate setting. His earlier `votes` show as a chip.
  Rules: votes, picks, over all read view, write owner. A list of the
  image sources sits at the foot.
- Group F (Int, Top, GC, HA, IA, DM) found 11 candidates
  (`records-F.json`, `spec-F.json`); they are on the plates page (v4), so 25
  works there have new prints. IA has one (Borelli; its diagram letters
  stay in the cut). Weak: GC-1's wide cut shows only bodies (the print is
  upright), Int-2 is greyish, DM-2 busy. Int-2 and Top-1 share Cort's
  Liberal Arts series. Grok (`verdicts-grok-F.md`): 8 pass; the Met's site
  blocked it for Int-1, Top-2 and HA-2, which I checked against the Met's
  open API instead (all public domain, fields match). That check is
  in-family; rerun Grok on those three before any goes into B. Fixed:
  GC-1's LACMA url and maker, DM-2's holder (Commons only).
- home-3: John sent Huot's bust of Aristotle (about 1775, etching and
  engraving; British Museum 1901,1022.1576, CC BY-NC-SA 4.0). Cut from his
  copy of the BM scan (`records-H.json`, `spec-H.json`: four keep boxes
  that step around the round stand, so the table's lines stay out). On the
  plates page v5. The BM site blocks scripts; its record was read in the
  built-in browser. Under the new licence rule (top of this file), Meta-3
  (Jacoby's School of Athens, CC BY 4.0), dropped earlier on licence alone,
  could come back if John wants it.
- "Image on left" (thread on home-3): a plate record with `left: true`
  sits at the left in beside mode, the title in a column at the right
  (class `pl-l`). Not `side`: ten older PL_LATER entries already carry an
  unrelated `side: 'l'`, and the first try flipped all of them.
- Pol-1 (Leviathan) is out (`dropped` in `records-D.json`). Group P found
  Pol-3 (Athens restored from the Pnyx, Smith's Smaller History of Greece,
  New York 1878), Pol-4 (Saenredam, Lycurgus, 1596, Rijksmuseum) and Pol-5
  (Solon writing laws, Merry's Museum, Boston 1842); `records-P.json`,
  `verdicts-grok-P.md` (1 pass, 2 fixed). On the plates page v8. The globs
  in `altbuild.py` and `make.py` are now `[A-FHP]`: a new group letter must
  be added there or its candidates silently vanish.
- Dark mode: "Not loving these inverted versions." Plates now keep dark ink
  on a dimmed paper (`dp-paper`: sepia .45, brightness .76); the switch
  Plates in dark mode (`dplate`) still shows light lines. Round eight v7.

## Round eight: John's picks applied (6 Nov)

Read from the plates page's `picks` (16 rows; `over` empty; the options
page's picks agree). Round eight v8 has them.

- New prints in B: home-3 (Huot), APo-2, Col-2, DM-1, MXG-1, PA-2, Vent-1.
  Each PL_LATER entry was rewritten with only `side`, the credit fields and
  `left`: plates mode reads no `q`, `c`, `t`, `note`, `pos` or `pre`, and
  those described the old prints. Backup: `scratchpad/work/b-script.v36.js`.
- Kept as now: Cael, Isa, Long, Mete, Sens, Somn.
- "None of these": Cat, GC, Top. Search again for those three.
- Not picked yet: Pol (new set; his options-page "none" predates it), and
  the down-voted DA, EE, EN, Mem, Meta, Poet, Rhet, SE, VV.
- Records: Grok's fixes for MXG-1, PA-2 and Vent-1 are in. APo-2 keeps
  "Paris" (Cavellat's shop faced the Collège de Cambrai) and "woodcut"
  for Vent-1 and APo-2, read from the prints; the holders don't state
  them. home-3 has no cross-family check: the BM blocks scripts, so only
  my read in the built-in browser stands behind it.
- Round eight v9, two threads: "we need some more margin between title and
  image" — the beside plate now starts at a fixed 598px (72 + 470 + 56), so
  the gap holds at every desktop width; the phone rule lists `pl-l` too, or
  its desktop width would win there. "Remove photo options" — `plates()`
  returns true; the Pictures and Logic works switches are gone from
  `notes.js` (so `U.variant('b')` now reads the face switch; nothing in
  plates mode depends on it). The photograph code in `script.js` is unused,
  not deleted. Notes and overview rewritten for plates; credits recounted.
- v10, "Let's rewrite this copy" (the home line); v14, "either the slug
  line that sells the site OR the slug line that tells the user what they
  can do ... What do we have for Plato?" `LEDE` in `script.js`, switch
  Home line (`lede`): What you can do (default), What it is, As in Plato
  (plato-reader's lead, ported), None. `{c}` is Click/Tap by pane, as
  Plato's say-click/say-tap. v11, "This is too quiet" (home subheads): switch Subheads
  (`sub`): Ruled label (his pick, 6 Nov: "Go with this"; default since
  v13), Capitals, Red capitals, As before. The home line awaits his pick.
- Group Q (Cat, GC, Top, after "none of these"): `records-Q.json`,
  `spec-Q.json`, `verdicts-grok-Q.md` (3 pass, 2 fixed: Top-3 is plate 30
  and its makers are the Met's list; GC-3's page gives only "1664" and no
  technique). Top-3 Rowlandson/Pugin's Debating Society (an aquatint, so it
  prints as a grey block), Top-4 The Triple Plea, GC-3 Kircher's springs
  and rivers, GC-4 Altzenbach's Ages of Man (busy, German verse), Cat-3
  Llull's Arbor scientiae (the whole framed woodcut, recut on white; a
  tree, so near the Isagoge's). Cat has one: no PD table of the ten
  predicaments turned up. On the plates page v9; his old "none" picks for
  the three still show until he picks again. The globs are now `[A-FHPQ]`;
  `altbuild.py`'s anchor is now `const plates = () => true;`.
- v15, "until we have other commentaries, Porphyry only lives on the
  Categories work page": `B.home` uses `U.divisions()` without `withIsa`;
  the Categories page's Commentary section links the Isagoge. The credits
  page still lists its plate.
- Plates page v10: Int-1 and Int-2 dropped ("Not this. Remove";
  "Symbolically fine, but not fitting. Remove"); Int shows only its sea
  fight. Cat-3 (Llull): "Better...but something less medieval?" Group R
  (Cat-4..6, 1650–1900 sorting prints, Ehret's Linnaean classes first) is
  out to a search agent; globs are now `[A-FHPQR]`.
- Plates page v11: group R gave two Cat options. Cat-4 is Ehret's
  Methodus plantarum sexualis (Leiden 1736, copperplate engraving, Commons
  PD; the file page names no holder). Cat-5 is Pyrula pl. 434 from the
  Tableau encyclopédique, 23e partie (Paris, Mme veuve Agasse, 1816,
  Smithsonian via IA), signed "Deseve del et D[irexit]". Grok flagged both
  (verdicts-grok-R.md); the fixes are applied, and the plate number and
  signature were checked on the scan. Awaiting John's pick.
- Plates page v12–v19 (6 Nov). John asked for many options: Cat ~20,
  Int 10, APr more ("no metaphorical or symbolic images of people"),
  Gorgias/Protagoras for SE, then GC more literal and "other plates about
  chemical change" (the Encyclopédie laboratory "fits", so it stays).
  Groups T (Cat-6..15, science), U (Cat-16..21), V (Int-3..12 less 11),
  W (APr-3..11 less 6), X (SE-3..5), Y (GC-5..12, search still running).
  Each went to Grok (verdicts-grok-{T,V,WU,X}.md; fixes applied). The
  orchestrator dropped weak cuts with a `dropped` reason: Int-11, APr-6,
  APr-12, Cat-22..24. John dropped APr-1 (Reisch), APr-2 (Sadeler), APo-1
  (Byrne, "ugly"), GC-1 (Matham, "naked chicks? too metaphorical"), GC-2
  (Wierix), GC-4 (Altzenbach). GC-3 (Kircher) is a "maybe".
- Plates page v20–v28 (6 Nov). John dropped every Int story or symbol
  print: Int-5..8 (Babel ×2, Adam, Pentecost) and Int-10 (Comenius,
  "too confusing"). Also Cat-1 (Imperato's museum), Cat-17 and Cat-18
  (instrument plates). Y passed Grok 8/8 (verdicts-grok-Y.md) and went
  up in v28; GC-8 (Hooke) is CC BY 4.0, Wellcome. Int is the weak work:
  group Z (Int-13 on) is searching printed squares of opposition, the
  literal subject, after John asked "what about square of opposition?".
- v29 (6 Nov): group Z up, three printed squares, Grok-checked
  (verdicts-grok-Z.md, fixes applied): Int-13 Reisch, Margarita
  philosophica, 1508 (leaf n133, not n132); Int-14 Sanderson, Oxford 1705
  (Bodleian copy on microfilm); Int-15 Marsh's table of opposed modals,
  Dublin 1681 (Cambridge copy). Holders name no process, so "how" says so.
  Cuts used padcut.py, gutter.py (threshold a gutter stripe) and blot.py
  (paint specks out of the source) in image-tools/plates-r9/. Unsearched:
  e-rara, Gallica, MDZ, Melanchthon, Eck, Ramus, Whately, Jevons.
- v30–v33 (6 Nov): plates page has a Reject button per print (db
  collection `rejects`, doc `<work>--<option>`, owner-write rule); a
  rejected print leaves its row, "Show rejected (n)" restores it, and
  rejecting a picked print clears the pick. On the next rebuild, read
  `rejects` and set `dropped` on those records. v32: Int-15 (Marsh) was
  warped, not tilted; `unwarp.py` straightens every ruled line (slopes.py
  measures them). v33: six more squares, groups J/K/L (brief
  `image-tools/plates-r9/BRIEF-squares.md`), Grok 3 pass / 3 fixed
  (verdicts-grok-JKL.md): Int-16 Peter of Spain with Versor, Venice 1572
  (BSB); Int-17 Caesarius, Paganus 1548; Int-20 Mastri and Belluti, Venice
  1646; Int-21 Wallis, Oxford 1763 (A E I O, the best); Int-24 Keynes 1884;
  Int-25 Fowler 1883. Dropped by me as weaker or duplicate: Int-18
  Guinellius, Int-22 Du Trieu, Int-23 Burgersdijck, Int-26 Jevons. Still
  unsearched: e-rara, Gallica, MDZ proper, Melanchthon, Ramus, Eck.
- v34 (6 Nov): John: Categories needs abstract diagrams like the other
  logic works. Group M (brief `image-tools/plates-r9/BRIEF-cat.md`, one
  Sonnet search): Cat-25 Pourchot's "Arbor Purchotii" (Tab. 2, Lyon 1733,
  Wellcome via IA, PDM); Cat-26 Pourchot's classic "Arbor Porphyrii"
  (Tab. 1), found only as a Commons PNG (PD-old-100, BnF-stamped copy, no
  source named), flattened with `flatten.py` before cutting. Published
  before Grok's check, then checked (verdicts-grok-M.md): Cat-25 PASS
  ("Filloeul Sculp." and "Tab. 2" read on the leaf by me); Cat-26 FIX,
  credit now says Commons names no library (the stamp is on the scan).
  v35 carries that. v36: Cat-27, the Bamberg 1733 copy (MDZ bsb11761492,
  page 833): its Tab. 1 is a DIFFERENT engraving from the Commons one,
  "Arbor Porphyrii secundum doctrinam Aristotelis et Peripateticorum",
  set in a leafy tree, signed Fillœul; sharp scan, deskewed (-0.65°) and
  cut inside the border. Grok PASS (verdicts-grok-M2.md). Licence is
  NoC-NC (No Copyright – Non-Commercial Use Only): John accepted it
  for Cat-27 (6 Nov); treated like CC BY-NC from here on. Bizkaia (Venice 1730) unreachable from here. Leads not
  taken: a Fulda dissertation (Siebert/Vogler) with Porphyrian trees, only
  800 px on DDB; a Boethius (Migne 1847) tree on Commons, source
  unconfirmed. Rejects: the page hides them live, so I left `dropped`
  unset (baking them in would remove "Show rejected").
  Playwright was gone after the reboot (moerbeke's node_modules too);
  shots now use S/pw/node_modules (shoot-new.sh updated).
- Round ten (6 Nov, started 14:55): John asked for 20 candidates each for
  Phys and DA, 10 each for Mem, Insomn, and every work without a pick (Cat
  left out: its three trees await his look). 24 Sonnet searches, five at a
  time; queue and status in S/plates-r9/QUEUE-r10.txt; brief
  `image-tools/plates-r9/BRIEF-r10.md`, per-work notes `SUBJECTS-r10.md`.
  Groups are named r10-<Work>[-a|-b]; the globs in opts/altbuild.py,
  plates2/make.py and make_checked.py now add `r10-*/records.json`.
  Published 6 Nov as v37–39: 116 prints over 21 works (Phys 13, DA 12,
  Int 9, Insomn 7, Mech 7, DivSomn 6, HA 6, IA 6, Juv 6, SE 6, Mem 5,
  GA 5, Aud 5, Rhet 4, APo 4 (the Euclid proofs, APo-14..17), Meta 3,
  Poet 3, Oec 3, GC 3, Mirab 2, EE 1). EN's two and VV's search gave
  nothing usable. Every group had a Grok check, and the fixes were
  applied after checking them against the source (Grok put Meta-4 on
  n18; the scan shows n17, as recorded). Records, specs, verdicts and
  the fix files are in `image-tools/plates-r9/r10/`. GA-1 is under the
  Etalab Licence Ouverte: John accepted it (6 Nov), so it counts as
  an accepted licence from here on (it asks for a credit, like CC BY).
  Euclid III.31 sources: Gregory's Oxford 1703 Greek-Latin from Google
  Books 041oAAAAcAAJ (Prague copy, PA70; `jscmd=click3` gives a signed
  src, `&w=2000` returns 1513×2500), cleaner than the BEIC copy (fetch
  BEIC with `r10/beic.sh`: its IIIF id is per request). Heiberg 1883 is
  IA euclidisoperaomn01eucl n255–256; Grynaeus 1533 IA
  bub_gb_NLFLZAoXkSoC n49.
- One artifact version holds at most 511 files and one publish sends at
  most 255 (removals count). v37 hit both: the page needed 552 images.
  make_checked.py now leaves out the options John rejected
  (`rejects.txt`, copied from the page's `rejects` collection), so
  "Show rejected" no longer brings those back; re-add a line's removal
  and rebuild if he wants one. To swap many files, publish the removals
  first, then the additions.
- Straightening (6 Nov, v40): John asked that each plate be straight.
  cut.py takes `"rot"` (degrees counter-clockwise, about the desk box
  centre; copy in `r10/cut.py`). Projection-sum skew finders gave false
  large angles on pictures; what worked was `straight/hv.py`: the four
  strongest horizontal-edge rows and vertical-edge columns, measured
  apart. Call a tilt real only when H and V agree within 0.3° and it is
  0.4° or more, then judge `straight/ba.py` before/after sheets by eye.
  Rotated: Mem-4 1.28, Mem-6 1.29, Mech-1 0.88, Oec-2 1.36, Phys-9 0.7,
  Phys-8 -0.82, GC-23 -0.88, Int-13 1.14, Cat-25 -1.06, SE-11 -1.04,
  APo-16 -0.65, and the present Lin plate +0.64 (kit/dirs/b/img/plates,
  rotated in place). IA-7 and Meta-6 looked worse turned and were left.
  make_checked.py now adds `?v=<mtime>` to each image URL so a recut
  file is not served stale.
- Picks applied 7 Nov (plates page v43; kit only, B not republished).
  New prints in `kit/dirs/b` (images and PL_LATER, each entry rebuilt
  from its checked record, keeping the work's `side`): APo-16 (Grynaeus
  1533, III.31), APr-4 (Euler/Hunter 1802), GA-3 (Hunter's gravid uterus,
  1774), Juv-1 (Eustachi 1714), Mech-1 (Reynolds 1872, CC BY-NC-SA 3.0),
  Pol-5 (Boston 1842), SE-6 (Burgkmair), Top-3 (Rowlandson/Pugin's
  Debating Society), VV-1 (Bruegel/van der Heyden's Avarice). "Now" kept:
  Aud, Cael, Isa, Lin, Long, MA, Mete, Oec, Phgn, Sens, Somn. Cat stays
  "none" (Cat-25 and Cat-27 still open). Backup of the old script and
  plates: `S/work/picks-2026-11-07/`.
- Later picks, 7 Nov: Insomn-3 (Goya, Sleep of Reason, Met CC0) and Phys-3
  (Apian/Frisius 1584 sphere diagram), both Grok PASS. John, 7 Nov: "Keep
  Apian"; and "that wasn't a rule" of the no-spheres line (below). Entries rebuilt from the records
  (`pos`, `q`, `c`, `t` dropped); backup `S/work/picks-2026-11-07b/`.
  **Round eight v16** published with all 7 Nov picks plus Lin's
  straightened plate (24 plate files, index). Last publish copy:
  `kit/out/pub16`. Walk clean, light and dark. The scratch kit now lives
  at `~/Developer/aristotle-plates-scratch` (symlink per its README);
  Playwright for the checks is `NODE_PATH=../pw/node_modules`.
- **Round eight v17, 7 Nov: the six works of the 7 Nov deploy** (MM, Prob,
  Plant, Spir, RhetAl, AthPol), at John's ask. `shell.html`'s DATA got their
  registry entries (from `shared/lib/works.ts` on origin/main), main's
  CATEGORIES (AthPol under Rhetoric and Poetics; the appendix is now
  "Doubtful and Spurious Works") and `workChapters`/`spans` from gh-pages
  `data/<id>/chapters.json`; the old data was checked unchanged. AthPol cites
  by chapter and section, so `U.isBekker` now also excludes
  `chapter-section`: no Bekker ranges, chapter numbers only. Plates are
  John's six picks from branch `claude/new-work-plates-61b59e`
  (`r11-new/`, extracted to `S/plates-r9/new-work-picks/` (a name outside the `r1[01]-*` globs)); RhAl-3 is filed
  as `RhetAl`, the site's id. The branch's cuts are first-pass and were used
  as they are. Credit lines rewritten from the records into the house form
  (RhetAl carries "© The Trustees of the British Museum, CC BY-NC-SA 4.0").
  Prob-5 is still provisional. Backup of the shell: `S/work/picks-2026-11-07b/`.
  Walk clean; no overflow on the new work pages. Last publish copy
  `kit/out/pub17`.
- **Plates page v50–51, 7 Nov.** v50: HA-3 (Jonston's sheet) turned 90°
  clockwise at John's word; source `r10-HA/dl/HA3/rot.jpg`, spec backed up
  as `spec.pre-rot.json`, shot retaken. v51, after John asked why the page
  showed rejects and not his new-work picks: (1) the "New works" section read
  the stale scratch `r11-new` (the old candidates, Prob-2 and MM-1/2 among
  them, none of his picks); it now shows each of the six as "As now", shot
  from B v17 into `opts/raw-side`, credits read from B's PL_LATER. (2)
  `rejects.txt` held 106 rows against 158 in the page's `rejects`; it is now
  regenerated from the database (old copy `rejects.pre-db-2026-11-07.txt`).
  **Before every plates-page build, regenerate `rejects.txt` from the
  `rejects` collection**; a check confirmed no rejected card is shown and
  every card dropped was a reject.
- **Later, 7 Nov (plates v52–56, B v20–21).** HA-4 and HA-8 turned right and
  HA-7 left, each with a `keep` mask over book edges (`r10-HA/spec.json`
  notes). RhAl-3: "alexander is washed out", recut from the BM `huge_`
  image (1050x1600; BM pages 403 to curl, so the media URL came from the
  built-in browser; the media host serves curl) with `hi` 0.94. MM-6:
  "shrink them so they fit", Wellcome V0009321 padded 400px top and bottom
  so both heads fit whole. Sources now live in `S/plates-r9/new-work-picks/dl/`.
  **B hides rejected plates** (John: "make sure round eight artifact doesn't
  show rejected plates"): `REJECTED` in `dirs/b/script.js` holds Cat, DA,
  EN, Poet, Rhet (their "As now" is rejected, no pick yet). They show the
  title alone in the side column (`.no-pl`, 360px on desktop); plates mode
  no longer falls back to the old photographs. A check against the
  `rejects` collection found no other B plate rejected. When John picks for
  one of the five, take it out of `REJECTED`.
- **Evening of 7 Nov (B v22–26, plates v57–58).** B: the "As in Plato" home
  line is the default; Anton is gone and Oswald is the only title face
  ("this is the one", "remove others"); "Ruled label" is the only subhead;
  the spurious/dubious tags are red (`--red-ink`, 13px). Plates v57: phone
  shots were halved to 200x390 because `sips -Z 390` caps the longest side;
  `conv()` now uses 760 (Int-31 "looked blurry" was this). APo-16 (B's
  Posterior Analytics plate): "uneven tone", recut with a new `even` step in
  `tools/cut.py` (`[12, 0.5]`: each pixel divided by the local ink maximum,
  so faint words reach their neighbours' weight; old tool
  `cut.pre-even.py`). Plates-page cards are page *screenshots*, so a recut
  needs `zsh opts/shoot-new.sh "WORK" N` before `make_checked.py`.
  Mirab: John asked for "obviously marvels or crazy curiosities"; a finder
  returned Mirab-11–19 (`r11-Mirab/`: Aldrovandi monk-fish, centaur, hydra;
  Schott; Olaus Magnus; Jonston), verified by a second reader in
  `verify-r11-Mirab/`. **Any rebuild picks up every `r1[01]-*/records.json`
  on disk, finished or not**: v58–60 showed Mirab-11–19 with broken images
  because only the changed files were uploaded. After each build, upload
  every `img/` path the page references that the artifact's file listing
  lacks. `opts/altbuild.py` now empties B's `REJECTED` in kit-alt: before
  that, a candidate shot for Cat, DA, EN, Poet or Rhet came out with no
  plate (Rhet-6, v62). `tools/cut.py` gained `grow` (widen hairlines
  before the shrink: Poet-2, recut from the full-size IA leaf n18) and
  `blot` (paper over lettering: HA-3, John: "cut out the words without
  affecting the drawings"). **Check every blot with a removed-ink map**
  (pixels dark before, white after, drawn red over the cut): John caught
  two clipped arm tips by eye on 8 Nov.
- **More candidates, 7–8 Nov (plates v67–72).** EN-21–26 (`r11-EN-scales/`,
  weighing scenes, John: "someone weighing things… the mean"), Meta-11–17
  (`r11-Meta/`) and Meta-21–25 (`r12-Meta/`). The `r1[01]` globs in
  `altbuild.py` and `make_checked.py` are now `r1[012]`. Verification: Grok
  passed Mirab and EN but hung twice on Meta (2 h, then 15 min, nothing
  written); Codex's sandbox reached few holder APIs, so its 10
  "UNREACHABLE" were closed by direct fetches of the Met API
  (isPublicDomain true), Rijksmuseum linked data (PDM), Cleveland API (CC0),
  IA metadata (states nothing), Commons extmetadata and Yale's page in the
  built-in browser (curl gets 403). Unverified: the leaf of Meta-13 and
  Meta-15 (IA, John Carter Brown copies).
- Int-30 (plates v73, John: "crisper lines… darkness uneven"): recut from
  the Bamberg copy at MDZ (`bsb11759943`, canvas 86 = p. 28, 2128 px wide;
  the IA/Google JP2 is only 1519). `even [12,0.5]`; blots for "Fig: I" and
  a foxing spot, checked with a removed-ink map. The licence is now NoC-NC
  1.0 (MDZ's mark), not IA's PDM: fine for a non-commercial site, but note
  it if the site's terms change. Backups: `spec.pre-bsb.json`,
  `records.pre-bsb.json`.
- "As now" drift (plates v74): `review/plates.json`, the credit source for
  every "As now" card, had fallen behind B on 16 works (home, APr, APo, Top,
  SE, Phys, Insomn, Juv, PA, GA, Pol, VV, DM, Mech, Col, MXG, Vent), and the
  APo, Phys and Insomn "now" shots predated their B plates. Synced from B's
  `PL_LATER` (evaluate it with the constants above it: MET, IA(), LOC…) and
  reshot. Whenever a B plate changes, reshoot its "now" AND copy its credit
  into `review/plates.json`. Backup: `review/plates.pre-apo16.json`.
- John, 7 Nov evening: "No more trees. Categories and isogoge are enough."
  No tree diagrams for any other work (two Llull trees, DA-32/33, were
  dropped before publishing; `r13-DA/records.with-trees.json` keeps them).
  New De Anima candidates in `r13-DA/`: DA-31 (Bovelles, steps Est / Vivit
  / Sentit / Intelligit, IA bub_gb_MumicQwuD8gC n245) and DA-34 (Llull's
  1512 ladder, MDZ bsb10203463 canvas 113, show-through cleared with
  `work/clip.py` before padding with `work/pad.py`). Codex's sandbox had no
  network for their check; Grok's verdicts land in `verify-r13-DA/`.
- John, 7 Nov evening, on Metaphysics: "It's fine to have god in some of
  these. But not god creating." Rejected (added to `plates2/rejects.txt`,
  backup `rejects.pre-god.txt`): Meta-11 Blake ("too deistic"), 12 de
  Jode ("flying god is odd"), 13 Kircher ("Tetragrammaton seems out of
  place"), 14 Martin and 16 van Gunst (creation; "Aristotle thought the
  world and the sun and stars were eternal"), 21 Doré ("too Christian…
  the angels"). DA-31 and DA-34 are live (plates v77; Grok passed 31 and
  fixed 34's wording). A Sonnet search for eternal-cosmos and
  being/causes plates writes `r13-Meta/` (brief `BRIEF-r13-Meta.md`); it
  is held off the page by `hold.txt` until a cross-family check passes.
- Trees (plates v78, John: "We only want to have one or two porpherian
  trees"): EE-3 and DA-21 added to `rejects.txt`; tree diagrams now only on
  Isagoge and Categories. `plates2/hold.txt` lists groups the page build
  skips until verified (r13-Meta, r13-Meta-b, r13-Meta-c: three Sonnet
  searches for John's "another 20" Metaphysics options); remove a line once
  its group passes a cross-family check. Do not move an agent's
  records.json aside while it may still be writing.
- Meta (B v28, plates v75, John: "less washed out"): recut from the Met's
  4000 px Volpato (716834) with lo .58, hi .9, gamma .55, same boxes as
  `whole-subject/spec-C.json`; `r13-MetaNow/`. Old cut in its `proof/`.
- Thread recuts, 7–8 Nov (plates v79–v82):
  - Pol-3 ("clearer, less damaged"): the print is sound, but its ruled sky
    broke into streaks when shrunk. Recut from the same leaf (IA
    smithgreecehistory00smitrich n111) with a thin band of sky, under
    `r13-Pol/`.
  - Aud-5 ("side by side"): John meant the two Casserius heads within the
    print, not two cards. The heads are now set in a row (`r10-Aud/work5/`),
    with captions and frame rules blotted.
  - Mirab-19 (phone, unicorn "a little to the right"): source padded top
    and bottom (`dl/Mirab-19/1/padv.jpg`).
  - Cat-27 (phone "shouldn't exclude the top of the tree"): new
    `dl/Cat-27/padT.jpg` adds a 6% paper margin at top and bottom, with the
    frame rules painted out. The top blot is narrowed to spare the Ens
    circle. Cat-25 was already whole.
  - The Meta "another 20" (plates v83): 15 went up. r13-Meta (31–36, sphere
    figures), r13-Meta-b (41–46) and r13-Meta-c (51–53). Grok's verdicts
    are in `verify-r13-Meta*/`; Meta-33's circle names and Meta-51's
    technique and licence were fixed. Meta-54 (an orrery) and Meta-55 (an
    armillary), both Copernican, were dropped; `records.all.json` keeps
    them. `hold.txt` is now empty.
  - DA-1 (v84; phone, the tongue is "awfully ugly"): the phone box is now
    [0.42,0.12,0.97,0.541] and stops at the upper lip; backup
    `C/spec.pre-tongue.json`. The early groups (`C/` and others) lost their
    `dl/` sources when the old temp dir went. I re-fetched IA
    margaritaphiloso00reis n403 full size into `C/dl/DA/r403/p.jpg`, and a
    fresh desk cut matched the old one pixel for pixel. Expect the same for
    any other early plate you recut.
  - EE-2 (v85; desktop, "a little space between plate and title"): Met
    410924 re-fetched (`D/dl/EN/410924/img.jpg`, matched the old cut).
    `padL.jpg` adds 250 px of paper on the left; desk box
    [0.04172,0.02,0.93914,0.895] shows about 90 source px of it and trims
    the right edge. Backup `D/spec.pre-gap.json`.
  - DA-1 (v86; "get rid of left black border line"): the frame rule runs
    within ~40 px of the nose, so it was painted out, not cropped:
    `C/work/norule2.py` removes ink regions at most 80 px wide lying wholly
    in a strip (x 1225–1340, y 0.08–0.82), using true brightness (an RGB
    mean reads yellow paper as ink and joins the rule to foxing). Source
    `C/dl/DA/r403/p-norule.jpg`; backup `C/spec.pre-norule.json`.
- The "now" shots for the round-eight picks (Col, DM, MXG, PA, Vent, home)
  were shot 5 Nov, before those picks went in, so "As now" showed the old
  prints until v43, and John's "now" rejects on those works (and on APo,
  Pol, Top) were rejects of prints no longer in B: those nine rows were
  deleted from `rejects`. Reshoot a work's "now" from a no-candidate build
  (`altbuild.py 999`, then `tools/shoot.cjs out/alt999/index.html ...`)
  whenever its kit plate changes. `rejects.txt` regenerated from the page
  (106 rows).
- Recuts from threads, 7 Nov: Cat-27's desk cut has its paper all on the
  right (`padL.jpg`), so the tree sits by the title; APo-16's phone cut is
  a close crop of the III.31 figure; Rhet-3 recut in tonal mode (`k` 400,
  levels 0.25–0.92, no despeckle): a lithograph's greys are not paper.
  Rhet-4 ("too vertical") recut wide from the full leaf (`o.jpg`), the
  band moved down to keep the feet, levels 0.08–0.96, gamma 1.15 (v44).
- EN round eleven, 7 Nov: John asked for "a stunner ... fine details. One
  of our flagship works", then "It can tonally fit. Doesn't have to be
  symbolic." Group `r11-EN`, ids EN-13 to EN-20; the globs now read
  `r1[01]-*`. Five Met prints, all CC0, Grok 5 PASS (`r11/r11-EN/`):
  EN-13 Piranesi's Paestum temple (the Met dates it ca. 1748), EN-14
  Dürer's Saint Jerome in His Study, EN-15 Rembrandt's Three Trees, EN-16
  Piranesi's Temple of Saturn, EN-17 Piranesi's Campo Vaccino. No diagram
  was strong enough. Cuts retuned by me to tonal levels (lo 0.2, hi 0.93):
  the agent's default levels blew out skies and filled the hatching.
  Plates page v45.
- De Anima, 7 Nov: "stop giving me anatomy for de anima. It's about the
  soul, not the body. I'm considering the ones naming the powers.
  Otherwise, pick something else." In play: DA-1 (Reisch), DA-2 (Fludd),
  DA-3 (Bovelles). DA-5, 13, 18, 19, 20 marked `dropped` (v46). The rule
  is in SUBJECTS-r10.md's DA section. Search `r11-DA`, ids DA-21 to DA-28:
  diagrams naming the powers first, then tonal fits; no anatomy at all.
  Result (v47): DA-21 Bovelles's Arbor cognitivarum anime virium (same
  1510 volume as DA-3; the only new diagram naming the powers), DA-22 and
  DA-24 Besler lilies (tonal fits), DA-23 Comenius's "Soul of Man" (a
  dotted outline; John may read it as a body). Grok 4 PASS.
- Physics, 7 Nov: "is there nothing for physics that isn't Newtonian
  besides the organization of the cosmos into spheres?" then "Give me
  plenty of choices." The search brief in SUBJECTS-r10.md skipped spheres,
  projectiles, falling bodies and air pumps; that was my reading of his
  question, not his rule (John: "that wasn't a rule"), and spheres stay open. Groups `r11-Phys-a` (Phys-21 to 23 kept: two
  Oresme latitude-of-forms figures, 1482; Swineshead's latitudo
  alterationis, 1520; 24 and 25 dropped) and `r11-Phys-b` (Phys-31 to 37:
  Lull's Arbor elementalis, two Isidore wheels, Bovelles on opposites,
  Galileo's polygon wheel, two Fromondus; 38 dropped). Grok found four
  "how"/"when" fixes in b, checked against the IA metadata and applied; in
  a it misread "Tractatus.IIII." as III (scan checked). Phys-21 and 22 are
  Early European Books scans stamped "Copyright © 2011 ProQuest LLC";
  their `lic` says unclear. John, 7 Nov: "Oresme are out because they
  aren't good fits" — 21 and 22 dropped on fit, not licence (v49).
  Plates page v47.
- Six new works (Prob, Spir, MM, Plant, RhAl, AthPol), 6 Nov: found by a
  separate session (branch `claude/new-work-plates-61b59e`, notes
  `docs/new-work-plates.md` there), two each, copied in as group
  `r11-new`. Its `work` fields were prose; set to the id prefix. Six tonal
  prints recut at house levels (`k` 300, lo 0.15–0.2, hi 0.82–0.93); the
  first-pass cuts are in `peer-cuts/`. None of these works is in B, so
  `make_checked.py` now ends with a "New works, not yet in B" division
  that shows the bare cuts: no "As now", no mockup shots, no title-over
  row. The page's phone width overflows by 19px (409 at 390); that was
  there before this section. Grok 7 PASS / 5 FIX (`r11/r11-new/`): the
  Grew, Besler and Commons process fields, checked against the holders and
  applied (DA-22 and 24 given the same Besler wording); the Bidloo `what`
  lines lost their notes on what the cut shows. Plates page v48.
- Codex audit of B (6 Nov, GPT-6.1-Sol high): `review/audit-b-2026-11-06/`.
  13 findings; main claims checked against the code. Fixing waits on John.
- Scratchpad backup before a reboot: ~/Developer/scratch-backup-765e4c4f
  (all of S minus kit/out except pub44, kit-alt/out, and old groups' dl/).
  Spec `src` paths are absolute under S, so restore it to S's path.
- Candidate shots live in S/opts/craw-side/N, one folder per candidate
  number for every work; `review/options/shoot-new.sh "Cat Int" 3 4 ...`
  shoots only the named works. A group letter missing from the globs in
  make.py and altbuild.py silently drops its shots (X was missed once);
  the globs are now `[A-FHJ-MPQRTUVWXYZ]`. Publish only checked groups: build
  with a narrowed glob copy (make_checked.py) until Grok has passed a group.
- v12, "beside the plate is how we will do desktop homepage. Might want to
  still tweak mobile though." Desktop home is decided. Phone home switch
  (`hphone`): Title above (default, as before), Title below, Title beside
  (the whole bust smaller, `hp-p-side`, fit box 168x300).
- Switch option ids must be unique across all of B's switches:
  `setVariant` sets the first switch holding the id. "As before" in
  Subheads is `s-old`, Title size's "As set" is `ts-set` (it had collided
  with Title place's `set`, so its As set never applied).

## Decision sheet and comments

The decision sheet keeps answers in its database: `picks/<viewer id>`,
`{answers: {qid: option}, notes: {qid: text}, updatedAt}`; question ids
direction, bface, blogic, bint, hplates, hface, hport, pcol, pmast, dpic,
count, plus `other` for notes. Read with ArtifactData (`list`, collection
`picks`). Code: `decision-sheet/index.html` (its images are in the artifact
only). The sheet still asks about P; it was not changed.

Round-seven threads: "Not loving the HERO text", "Smaller" and "I like this
feature" were replied to on 2 Nov and are left for John to resolve. The faces
page `votes` collection was empty on 4 Nov.

## Open for John

Superseded: see "Open for John (ask before the brief is final)" at the top.

## The kit

The kit's code is in `docs/redesign-kit/`: the round modules (`dirs/<k>/`;
`p` and round six's `e`, `f`, `g` kept as history), the overview, `build.py`,
`maps_r7.py`, the check tools, and the scripts that found and cut the
pictures (`image-tools/`). Left out, and both in the round-seven artifact:
`shell.html` (its data line is 1.5 MB of corpus copies, four whole
translations of Ethics I among them) and every image. Never commit either:
the repo is public, and the images live in the artifacts.

On 4 Nov these were copied into the repo from the scratch kit, uncommitted:
`dirs/{b,d,h}/{script.js,notes.js}`, `dirs/{d,h}/style.css`,
`overview.html`, `image-tools/chalk/{SOURCES.md,cuts2.py}`, and new tools
`tools/labelfit.cjs`, `tools/namefit.cjs`, `tools/unskeleton.py`. The track's
rule says never write to the repo from a mockup task; John decides whether
they stay. `shell.html`'s label fix is not in the repo (the file never is);
the published page carries it, so a restore gets it.

Layout: `shell.html` (chrome, `window.DATA` as one line, `window.U` helpers,
routing, panes); `dirs/<k>/` (`style.css`, `script.js`, `notes.js`, `img/`);
`overview.html` (a `<style>` and a `<main id="overview">`, thumbnails in
`ov/`); `build.py`; `tools/*.cjs` checks.

To restore a working kit, in the scratchpad, never in the repo:
1. Copy `docs/redesign-kit/` to the scratchpad as `kit/`.
2. Read the round-seven artifact (`Artifact`, action `read`). The service
   returns the page wrapped in its skeleton, even by `path: index.html`, and
   `unbundle.py` refuses that. Strip it: `python3 -I tools/unskeleton.py
   <read file> <bare.html>`, then `python3 -I tools/unbundle.py <bare.html> .`
   in the copy to write `shell.html` (`--modules` also writes the modules and
   overview, for when the code itself is lost).
3. Images only if a check needs them or you republish them: list the files
   (`action: list, scope: files`, only `url`) and fetch with `read` and
   `paths` (up to 256 per call) into `dirs/<k>/img/…` and `ov/…`.
4. Prove it: `python3 -I build.py --out out/re --dirs b,d,h --publish`, then
   `cmp out/re/index.html <bare.html>`, plus a control (change one word in a
   module, e.g. `Chalkboards` in `dirs/b/notes.js`; the cmp must fail). On 4
   Nov the committed code rebuilt version 13 byte for byte (with `p`) and the
   control failed. Version 14 needs `--dirs b,d,h` and the 4 Nov repo code.
5. Playwright is not in this repo's `node_modules`: run checks with
   `NODE_PATH=~/Developer/moerbeke/node_modules`. Pillow: `uv run --with
   pillow python -I`. The system python's urllib has no SSL certificates; use
   curl.

Build and check:

```
python3 -I build.py --out out/t --dirs b,d,h            # test page
python3 -I build.py --out out/pub --dirs b,d,h --publish # no skeleton
node tools/walk.cjs out/t/index.html b,d,h               # errors, failed loads, overflow
node tools/controls.cjs …   tools/cmpjump.cjs …   tools/homecount.cjs …
node tools/headmeasure.cjs out/t/index.html b,d,h        # baselines in every bar
node tools/fitbox.cjs out/t/index.html                   # B titles inside photographs
F=caslon,young,didone
node tools/hclip.cjs out/t/index.html $F                 # H titles keep whole letters
node tools/navfit.cjs out/t/index.html $F [control]      # control must fail
node tools/namefit.cjs out/t/index.html caps,capsrd,greek,oldname $F [control]
node tools/labelfit.cjs out/t/index.html b,d,h           # edition labels fit
```

Overview thumbnails: `tools/shoot.cjs` at `@max=900` (desktop) or
`@phone@dark@max=780`, then scale to 1000×625 or 340×680 with Pillow.

Publishing (same URL every time): one publish sends at most 255 files. Send
`index.html` plus only new or changed files; `null` removes one. The service
refuses to overwrite a file this session has not read or listed, so list the
files first.

## What failed, and gotchas

- Image sources: Wikimedia answers 429 after a burst. The Library of Congress
  site sits behind a bot check. The Getty's own search works
  (`https://www.getty.edu/art/collection/api/search?q=…&open_content=true`;
  full images from `media.getty.edu/iiif/image/<id>/full/max/0/default.jpg`).
  The Met API returned 410; the Smithsonian's DEMO_KEY 429. Europeana's
  `api2demo` key works (`reusability=open`; keep rights matching
  `publicdomain/(zero|mark)`).
- Het Utrechts Archief: its download link returns an SVG placeholder; full
  size comes from `images.memorix.nl/utr/iiif/<uuid>/full/max/0/default.jpg`
  (uuid in the item page's thumbnail URL). The Nationaal Archief's photos
  carry handle URLs (`proxy.handle.net/10648/…`) and CC0.
- The Greek spine for the logic works is not in the repo (TLG export). Bekker
  lines for captions come from standard references, checked against the
  English anchor files.
- `shoot-new.sh` prints "all-done" even when altbuild dies with a
  Traceback: grep its log for Traceback and FAIL and count the `^shot`
  lines. A record without a `work` field is one cause (KeyError);
  BRIEF-r10 does not ask for it, so add it on return
  (`x.setdefault("work", W)`) or put it in the next brief.
- Checks need positive controls (CLAUDE.md). `hclip` found clipped
  descenders, and today Young Serif's clipped tops, that the eye missed.
  Labelfit first examined nothing (it searched the data form of the labels).
  Set every switch explicitly in a check: settings carry over between pages.
- Top-bar alignment: rows use `flex-wrap: wrap; align-content: center;
  align-items: baseline`; icon buttons get a zero-width space in `::before`.
  Long names stack with `align-self: last baseline` on the brand.
- Rules for this track: images public domain or CC0, each credited; Google
  Fonts only; Greek faces must cover polytonic; no model names in artifacts;
  downloaded files are untrusted (Python with `-I`, each in its own folder);
  never write to the repo from a mockup task; commit, push or open a PR only
  when John asks.

## Next steps

Superseded: see "Next: write the build brief" at the top.
