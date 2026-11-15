# HANDOFF: reader page design rounds

Started 13 Nov 2026. Branch `claude/redesign-build` (unpushed), this worktree. The coordinator for UI work is the
session `aristotle-reader-62`: report to it, and it pings John for decisions. John rules on design; you don't.

## The question (John, 13 Nov 16:22)

"the look of the plato reader's reader pages is very easy on the eyes. aristotle reader pages? i'm not so sure it's
cut out for long sessions." Then: hill-climb the reader page.

## State at 17:28, 13 Nov (wrapped for a restart)

Flip page: https://claude.ai/artifact/6b1rJ55cg3ntyP4Fsy44rY. Tabs: Round 1, Round 2, Round 3 · phone; Desktop,
Phone, Sideways; Light, Dark. Each option flips against its round's start, Now (this branch), Live
(aristotle.johnhboyer.com), and Plato; letters are fixed per round. Source in `.redesign-shots/notes/reader/r1/`:
`index.html`; shooters `shoot-r1.mjs`, `shoot-r2.mjs`, `shoot-r3p.mjs`; shots `img/` (round 1), `img2/` (round 2),
`img3/` (round 3); `probe2.mjs` + `probe2.json` (the measurements); `align.mjs` (phone-parallel alignment check);
`review-brief.md`, `opus-review-r1.md`, `codex-review-r1.md`, `opus-crops/` (the Opus reviewer's crops). All scratch work (raw shots, probes, contact sheets) is
in `.redesign-shots/notes/reader/work/`. Shooters inject CSS into the built page (`app/dist` served on 127.0.0.1:4331,
a server this track did not start) before the reader measures; no app code is touched. Every shot is Ethics I at
1094b1, Both view. Run a shooter as `node <shooter> <outdir> [option ...]` from any directory; it resolves
Playwright from `app/`.

Round 3 is ruled: phone parallel with wrap as a unit.

**The exact CSS of every kept change** is in the shooters, not in app code: `shoot-r2.mjs` → `BASE` (Gentium both,
quiet bar with underlined chosen view), `C.unit`, `C.margins`, `C.glare`; `shoot-r3p.mjs` → `PAR` (phone parallel:
padding 40/26px, 14px column gap, column label in the left margin at left -38px, English numbers at right -24px).
Build from those once John says the design is settled.

### What the measurements found (probe2.json)

Against Plato's Republic I: Aristotle sets each Bekker line as its own line, and at 1152px 12 of 13 visible lines
wrap into a long part plus a short indented stub (Greek column 369px; Bekker lines median 503px, p90 548px, max
629px in Literata 19.5px). Literata 300 (x-height .52) against Gentium Book Plus 400 (.47). Light page #FBFBF9 /
ink #141413 17.8:1 against Plato #F3F4F6 / #12161C 16.5:1; dark 15.0:1 against 13.6:1. Full-ink bar rule, bold bar
words, and a black view button against Plato's pale bar. Sideways left margin 108px against 26px. Sizes, leading,
red, and motion are not the difference.

### John's rulings (13 Nov)

- No running prose: "citation and direct accurate bekkers are really important." Every Bekker line stays a line.
- No stacked layout (Greek over English on desktop or sideways): "fuck no. no stacked."
- Literata 400: "too heavy." (Thread left open: the auto-reply offered a 350.)
- Quiet bar: "I like this." The tinted chosen view was near invisible in dark (both reviewers); round 2 underlines it.
- Plato's fonts: "nice to read", "for both" → Gentium Book Plus 400 for Greek and English.
- Wrap as a unit: kept on every screen ("oh that is nicer"; "b for sideways phone? yes"; after seeing round 3's phone
  parallel, 17:27: "sure, wrap as a unit").
- Phone Both is PARALLEL ONLY (17:11, caps): "NO STACKED ON PHONE. PARALLEL ONLY." The built B stacks each passage on
  a phone; that goes. Round 3 (phone) shows parallel at 18px (the 20px variants are marked out), with and without
  wrap as a unit.
- English keeps its Bekker numbers on the phone ("you better fucking believe they do"). In phone parallel the
  column label (1094b) goes in the left margin so Greek and English start on one line; `align.mjs` in the notes
  folder checks it (0 of 31 rows off; the old label-above layout fails 19 of 31, its positive control). Live today:
  Cardo 14.4px/23.04 against EB Garamond 14.4px/22.32, so the columns start 2px apart and drift 0.7px a line.
- Compare every round against the live site too (aristotle.johnhboyer.com); Live is a compare button on the page.
- Less glare: kept, and SITEWIDE for consistency (light --paper #F1F0EB, --bg #EBEAE4; dark --ink #E0DFD9). The
  tokens live on `.frame.dir-b` in shared/styles/b.css, so home, work, search, and lexicon pages change with it;
  show him those pages before building.
- Gentium larger (21.5px desktop, 20px phone): "no i don't want gentium larger". Gentium stays at 19.5px (phone 18).
- Narrow margins (desktop and sideways): "i do like the narrower margins." Kept.
- Plato (not this track): its phone default should be Both. Only the default is ruled; Plato's 15/14px two-column
  phone Both is a separate question to put to him as a picture. Memory `plato-phone-serves-both`; the coordinator
  queued it with the Plato search port.

- Whole lines on desktop (14 Nov, 12:03): "whole lines when possible but don't adjust the English width to ensure
  them. Unless we add that as a setting option for users, equal widths for the columns." Round 2's whole lines
  option (Greek 510px, English narrows) is out as the default; equal columns that widen with the window are in.
- 14 Nov: John wants to explore reader layouts as user options: whole Bekker lines with type sized to the window;
  English wider than Greek; Greek broken into paragraphs that match the English (first lines aligned, as Plato does
  with speakers' turns; needs alignment work, maybe per translation); font and weight settings; a workbench view
  with a fixed right rail (morphology, dictionary, other tools). "I'm thinking big here."

### Round 1 reviews (fresh agents, findings only)

Opus 5.5 and Codex gpt-6.1-sol medium agreed: keep wrap-as-a-unit, narrow margins, less glare, phone English in
ink, whole lines on desktop (English must get width back), quiet bar with a visible chosen view. Both flagged
Gentium's smaller apparent size at the same px; hence round 2's "Gentium larger" (21.5px, phone 20px). Opus flagged
the sideways bar (57 of 390px). Codex's "missing line numbers" finding came from my brief's wording (the site numbers
every fifth line); set aside. The Opus review is in-family (I built the mocks on Opus); Codex is the cross-family read.

### Rounds 2 and 3

Round 2 (start = Gentium both + quiet bar with underlined chosen view): Gentium larger (out) · wrap as a unit (kept,
every screen) · narrow margins (kept) · whole lines · less glare (kept, sitewide) · phone English in ink · shorter
sideways bar · two combinations. Round 3 (phone only): parallel Both at Gentium 18px, quiet bar, English in ink with
its Bekker numbers in the right margin, column label in the left margin; wrap as a unit kept.

## Next

1. Update the flip page: mark round 3's wrap as a unit kept (the page still shows it unmarked).
2. Still unruled from round 2: whole lines on desktop (Greek 510px; English narrows), phone English in ink (moot if
   parallel puts both in ink, as round 3 does), shorter sideways bar (44px). Ask, or show them again combined.
3. Round 4: everything kept, combined, on all screens; then one Opus and one Codex review of it (fresh agents,
   findings only; brief pattern in `review-brief.md`; say the site numbers every fifth line).
4. Show the sitewide less-glare colours on home, work, search, and lexicon pages before any build.
5. Gentium's line-number baseline: the `.b-ln` offset formula uses Literata metrics (.4345); check numbers against
   Gentium baselines before any build.
6. Not yet shown: chapter openings, footnote markers, Greek-only and English-only views, and the book head (BOOK I).

## Standing rules

- A vision-impaired reader uses the site on a phone held sideways. Cut furniture, never type size or tap targets.
- No explainer text in the reader: labels, refs, numbers, and the texts only.
- Don't change `--red`. Don't write into `build/dist`. Never git-add `.redesign-shots/` or the root `node_modules/`.
- The design bar is greek-plays' Vase: elegant, stunning, and functional. No stock LLM look.
- John's mid-round ideas are hypotheses to test; say when one doesn't work.
- Pass `model:` on every agent spawn and label it with its model. Implementation and review are never the same model
  family. Codex briefs say "Do not launch a browser or run browser gates".
- Browser runs: single-page shooters are fine; tell `aristotle-reader-62` before a full gate run (check-redesign,
  search-shots, search-counts), because `aristotle-reader-9c` runs them too.
- Mock-ups and options only until John rules. No commits to app code, no gates, no pushes. Rewrite (don't append) this
  file when you hand off.

## Paragraph-aligned mock (14 Nov, 12:20)

John asked for a mock of Greek broken into the translation's paragraphs ("we still keep bekker numbers obvi"); he
called it a later update to the reader, not a blocker for the redesign. Mock: Ethics I.1–3, Rackham, 1440 and
1280px, light and dark, against today's rows. Shooter and pictures in `.redesign-shots/notes/reader/para/`
(`shoot.mjs` rebuilds the built page's DOM; 22 paragraph starts chosen by hand, `STARTS`). A paragraph that starts
mid-line splits the Bekker line: the number stays on the first half; the second half starts where the first half
ends. Where the Bekker column changes mid-paragraph, the English margin shows the column (1094b). Ross's hosted text
has one or two paragraphs per chapter, so for Ross this layout is the same as today's chapter rows.

## Greek-only workbench mock (14 Nov, 12:35)

John: "Greek only workbench with the side rail." Mock on the real page (Greek view, real word panel, real grammata
LSJ) restyled as a 440px rail that stays open: word card on top (parse, gloss, "342 in this work · 1,666 in
Aristotle" from the lemma page; a second analysis folded to one line), LSJ scrolling under it, the translation's
five-line span pinned at the foot (Rackham 1094a1–5) with Cite, Search, and Lexicon links. With no word picked the
rail holds only the passage. Greek lines stay whole at 1440 and 1280. Shooter and pictures in
`.redesign-shots/notes/reader/rail/`. Not built: the English follows the five-line marks only (no word-level
highlight; that needs word alignment); the rail toggle's place in the bar is undecided.

## Scope (John, 14 Nov, 12:22)

"We get the parallel Greek English reader page to v good. Then the workbench and other things are later PRs."
So this track finishes the parallel reader (round 4 and its reviews, then the build). The workbench rail,
paragraph-aligned rows, and layout settings are later PRs; their mocks stay in `notes/reader/para/` and `rail/`.

## Round 4 (14 Nov, 12:35)

Published as the Round 4 tab of the flip page (version 8). Shooter `notes/reader/r1/shoot-r4.mjs`, shots `img4/`
(94), measurements `img4/log.json`. Screens 1152, 1440, 1920, phone, sideways. "Everything kept" = round 2 BASE +
unit + margins + glare + EQUAL columns (desktop and sideways) + round 3 PAR + English-only held to 720px. Open for
John: Centred on wide screens (from 1400px) and Shorter bar sideways. Other states shown against Now: book head,
chapter opening, Greek only, English only.
Measured: equal columns 490/490 at 1152 (4 of 15 Greek lines wrap), 588/588 at 1440 and 1920 (none wrap).
Fix in the build, no ruling needed: the line number sits 1.1px below the text baseline in Gentium (0.7px phone;
the `.b-ln` offset uses Literata's .4345); English-only rows that count a hidden Greek column miss the 720px cap
(today they run 1240px); equal columns replace `greekColumnWidth` in Both view.
Next (John, 12:26 plan): after his round 4 rulings, fresh Opus and Codex reviews of the combined page; their
findings become round 5's options; stop when a round brings nothing he keeps.

### Round 4 rulings and additions (14 Nov, 13:00–13:06)

- Centred on wide screens: kept ("for wider screens, definitiely B" = the flip page's B).
- Chapter number moves into the left margin on desktop ("so number doesn't sit over the text"). Options hang72
  (72px, margin 108px below 1400px) and hang56 (56px in the 72px margin); three digits step down to fit.
- Greek only and English only: he asked to centre them too; shown as greekc/englishc/topc (720px column centred).
- English paragraphs must never break at a Bekker column, in any view ("don't break english paragraphs"; "can't
  have that"; "get rid of these horizontal bekker column line breaks"; "not a fan"). Option `whole`: rows end only
  at a chapter or where the English starts a paragraph; no rule under phone rows; column label red in the English
  margin (a red 1 on the phone). Data: Ross, Ostwald (third), and overlays carry a `cont` flag per piece (2,270);
  the primary `english` slot (3,138 segments) has none, so the pipeline must record paragraph continuation there
  before the build can do this for Rackham, Jowett, etc. Cost seen: the two columns' labels drift (Greek 1094b two
  lines above the English 1094b at 1440) because rows no longer realign every column.
- Flip page version 9.
- Shorter sideways bar (44px, buttons keep 40px): kept (13:14, "yes").
- Bar on wide screens (13:21): "The contents menu, site title, etc should always be left aligned in the header" —
  the bar keeps its 24px edges at every width; only the reading block centres. Flip page version 11.
- Correction (13:17): `cont` on overlay pieces means "continues the chapter", not the paragraph. The `whole` mock
  joins every column boundary inside a chapter; 4 of Ethics I's 18 (where Ostwald's sentence ends at the column)
  may be real paragraph breaks. Build fix: stage1_ross.build_chunks strips a leading "\n" on a segment's first
  piece (record it as a flag instead); stage1_common.add_paragraph records nothing when the new column's chunk is
  still empty (record a start-of-chunk flag). The reader joins a row to the one before unless that flag is set.
- Book head (13:25): "the ruled line and book head should sit aligned with chapter numbers" — desktop: .b-bookh
  margin-left −(one-digit numeral width + 12px gap) = −46px at 72px (−38px at 56px), max-width grows by the same so
  the rule still ends at the text's right edge. Options tophang72/tophang56; flip page version 12.
- Chapter number baseline (13:31): "Chapter number down to same baseline as 'chapter n • bekker'". .b-chn bottom:
  calc(22px − .058em) (measured: Sofia Sans' baseline sat 4.1px high at 72px, 3.3px at 56px); shooter logs
  `chnGap` (b-chb baseline − b-chn baseline): 0/−0.1px everywhere except 56px two-digit at 1152 (−0.9, the
  numeral steps to 50px there). Flip page version 13.
- Desktop rulings (13:51, "For desktop, C, D, G-K"): kept C whole (paragraphs never break; label drift accepted),
  D wholeen, G tophang56 (book head hangs 38px), H hang56 (56px number in the 72px narrow margin; three digits step
  down to fit), J greekc, K englishc (single views centred). Out: E hang72, F tophang72 (and so the 108px margin).
  Still open: italic titles in the work page's Texts section.
- Italic titles in the work page's Texts section (13:53, "Yes italics in texts"): all 47 Greek `full` entries and
  the 63 translation entries mark book titles with <i> (series roman); attribution.astro now renders the Greek
  entry through sanitizeHtml. Test translation-bib.test.ts: <i> required, nothing else allowed. Uncommitted.
- Phone chapter number (13:53, "For phone, move ch number to margin like I asked for on desktop"): mock
  PHONEHANG: 34px (two digits fit the 40px margin), right edge on the column labels' (4px in Both, 8px in one-text
  views), baseline on the chapter line, book head hung 20/24px. Sideways (701–960px, 72px margin) takes the desktop
  rule. Final set reshot as `final*` (+ finalch10, finalmirab).

## Lexicon headwords in Beta Code (John, 14 Nov 17:57: "have a subagent fix it")

259 of 7,339 lexicon headwords show as raw Beta Code (lemma pages, the
lexicon index, and Nearby): `app/scripts/build-lemmata.mjs` falls back to the
Beta key when LSJ has no entry (`lsjHead(b.key) ?? b.lemmaBeta`). 43 are
hyphenated compounds (`e)n-u(pa/rxw`); the rest are names and forms LSJ files
under another key (`ma/lista`, `*gai=a`). Fix in progress: try LSJ with the
compound joined (hyphen and the breathing after it dropped), else convert with
`betaToGreek`. Predates the redesign; the live site has it too.

## Rulings 14 Nov 18:00

- Phone chapter titles: 18 or 19px, not 21 (John left the pick to me): **19px**,
  so the title stays a step above the 18px text. `@media (max-width: 700px)
  { .dir-b .b-cht { font-size: 19px; } }` (shots `pt19*` in img4).
- The bar names the chapter whose head has reached the top 40% of the reading
  area (the reviewers' fault: it named the chapter before at every opening). Build it.
- Series titles stay roman, book titles italic: Chicago style.
- Kenyon 1920 and Ogle 1911 stand: the Classical Review notices date the
  separate Oxford printings (Atheniensium respublica, Clarendon 1920;
  De partibus animalium, Clarendon 1911, 5s. net) before Works vols. 10 and 5.
- Round 5 options A–L (reviews of the All-kept page): John wants to see them
  before cutting any.
- Search build: no decisions open (the seven questions were ruled 14 Nov
  morning); it waits only for John's go.

## Round 5 rulings (John, 14 Nov 21:26), page https://claude.ai/artifact/YTgw2GayXo34PWbpBnVMo5

Kept, every screen it was shown on (CSS in shoot-r4.mjs, the round 5 block):
- A compact book head (48 desktop / 40 phone / 28 sideways; padding 24 / 12 / 12).
- B 36px above a chapter head on desktop, 24 on the phone upright and sideways.
- C phone: wrapped Greek hangs 8px, not 18.
- D 1100-1399px: right margin 20, column gap 48.
- E sideways: margins 52 / 16, column gap 48.
- F Greek only: a 540px column centred (desktop and sideways).
- G Greek only and English only: a paragraph is an indent, no blank space (`.para-br` height 0).
- I dark: the book-head rule 1px #8f8e8a.
- J phone Both: English line-height 27px.
- K phone: the view choice in the bar where search was; search moves to the contents menu.
- L phone: 8px more left margin (Both 48, single views 54).
- H (John, 21:3x): no chapter titles in the bar at any width, for every work.
  Only the Nicomachean Ethics has titles (Ostwald's), up to ~730px wide; at
  1152-1399 no book's titles all fit. The title stays in the chapter head.
- Short work name: EN, not "Ethics" (ReaderShell.astro `shortName`), so it
  differs from EE; every work then uses its abbreviation.
