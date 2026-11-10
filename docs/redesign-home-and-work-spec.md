# Handoff spec: home page and work pages (direction B, desktop)

Written 10 Nov 2026 from the Figma frames John ruled on over 9–10 Nov.
Nothing here is built. The branch `claude/redesign-build` still carries the
kit's tall home poster.

- Figma: https://www.figma.com/design/3FGcwopu3awgAt63aiwlmH (page "Home hero").
  The block at the top of the canvas, "CURRENT DESIGN", holds every frame this
  spec describes. Everything under "HISTORY" is superseded.
- Reference shots of the same frames: `.redesign-shots/notes/vplato/current/`.
- John's words for each ruling, with times: `.redesign-shots/notes/hero-rounds.md`.

Each statement below is marked by where it comes from:

- **Ruled**: John said so. His words are quoted in §2.
- **Drawn**: in a current frame he has seen and not questioned.
- **Mine**: my recommendation for something no frame shows. He has not seen it.
  Show him before it ships.

## 1. Overview

Two page types change: the home page (`/`) and every work page (`/<work>`), at
desktop widths (961px and up). Phone (700px and under) and sideways (701–960px)
layouts do not change.

**Why.** John opened the built home page at 1525×896 and saw no list: "the image
and title are HUGE on desktop. user won't even see the list of works unless they
scroll." The first fix made the titles small (64px, two long lines) and he found
that flat: "the non stacked title loses punch when long". The design that
answers both keeps the tight stacked title but sets it in a box one list column
wide. The title stays heavy, the block stays short, and the list shows on the
first screen.

**What a reader gets on the first screen**

| Window | Home | Work page |
|---|---|---|
| 1525×896 | top block, Logic (both rows), the Natural philosophy heading | top block, the books heading, the first books |
| 1152×663 (John's Safari) | top block, Logic (both rows) | top block, the books heading, Book I |

## 2. Rulings

| # | Ruling | John's words |
|---|---|---|
| 1 | Titles near the Plato reader's scale, page with side margins | "Much better… I feel more comfortable"; "They breathe better" |
| 2 | Plate side follows the picture (rule in §5.3) | "I like your rule for works plates placement" |
| 3 | The crumb sits at the left edge on every work page | "And crumb goes on left yeah" |
| 4 | Group labels sit at the right end of their rules | "Subheading crumbs right aligned" |
| 5 | Division names sit above their works; works run in three columns | "And division names above" |
| 6 | Titles are stacked, not set in two long lines | "Not yet… feel flat (the non stacked title loses punch when long)" |
| 7 | Dubious and spurious works go in the main divisions, tagged. No section of their own | "Go in main divisions with tags" |
| 8 | The small treatises are grouped as "Minor works (Opuscula)" | "If opiscula is traditional (I think it is?) then yeah" (it is: Oxford vol. VI, 1913) |
| 9 | The Problemata sits in that group | "With the Opuscula" |
| 10 | Colour B: titles in ink; every red deepened to `--red-ink` | "B" (after asking "Is this looking too communist/tabloid with the colors?") |
| 11 | No Greek interleaved with the English title | "It doesn't work." |
| 12 | The Greek line under the home title is deep red | "Deep red" |

**Open, John's call** (frames in the "OPEN" row of the canvas):

1. The home Greek line: `Ἀριστοτέλους ἅπαντα τὰ σῳζόμενα` (drawn in Current) or
   `Ἀριστοτέλους ἅπαντα τὰ ἔργα` (frame `60:5938`). He floated ἔργα and has not
   chosen. σῳζόμενα is the old editions' formula and matches the Plato reader.
   Build σῳζόμενα unless he says otherwise.
2. The Greek title on work pages: grey `--mid` (drawn in Current) or deep red
   (frame `59:5909`). Build grey unless he says otherwise.

## 3. Layout

### 3.1 Grid

One grid serves the top block and the list, so the title's left edge is the
second list column's left edge.

| | 1525 wide | 1152 wide |
|---|---|---|
| Side gutter | centred column | 72px |
| Content column | 1168px (max) | 1008px |
| Columns | 3 × 362.67px | 3 × 309.33px |
| Column gap | 40px | 40px |
| Column left edges | 178.5, 581.2, 983.8 | 72, 421.3, 770.7 |

Rule: content width = `min(1168px, viewport − 144px)`, centred; three equal
columns, 40px gap. The nav already sits on this column.

### 3.2 Home top block (Drawn; frames `55:4907`, `55:4766`, `49:4498`)

Three columns: bust | title and Greek line | home line and search.

| Part | 1525×896 | 1152×663 |
|---|---|---|
| Nav | 0–87 | 0–87 |
| Bust (col 1, centred in the column) | 189×320, y 109–429 | 161×272, y 109–381 |
| Title stack (col 2) | 82.5px, 4 lines, box 363×292, y 101–393 | 70.3px, 4 lines, box 310×248, y 102–350 |
| Greek line (col 2) | 22.2px, y 406–435 | 18.9px, y 361–386 |
| Home line (col 3, top) | 21/31.5, 5 lines, y 102–260 | 21/31.5, 6 lines, y 102–291 |
| Continue line (col 3, returning reader only) | y 331–357 | not drawn (see §8) |
| Search (col 3, foot) | 54 tall, y 375–429 | 54 tall, y 327–381 |
| Foot line of the block | 429 | 381 |
| List starts | 473 (foot + 44) | 425 (foot + 44) |

How the block is set:

1. The title is fitted to the column width (§5.1). Its height follows.
2. The Greek line is fitted to the column width on one line, 13px under the
   title box.
3. The foot line is the bottom of the Greek line's text (429 at 1525).
4. The bust is as tall as title plus Greek line: its top is level with the
   title's cap line (109), its foot is on the foot line. It keeps its aspect
   (0.592 wide to 1 tall) and is centred in column 1.
5. The home line starts level with the title's cap line. The search sits with
   its underline on the foot line.
6. The list's first rule is 44px under the foot line.

The bust faces right, toward the title. It is the Huot bust cut out of its
plate, not the framed plate (`.redesign-shots/notes/figma/bust-cutout.png` is
the cut used in Figma). The mirrored bust from earlier rounds is retired.

The division links from the earlier build (`.b-divs`) are not in this design.

### 3.3 Home list (Ruled 4, 5, 7, 8, 9; frame `48:4259`)

Each division, top to bottom:

| Part | Spec |
|---|---|
| Division box | 1px top rule `--ink`; padding 26px top, 34px bottom |
| Division name | above the works, full width; Oswald 700, 40px, line-height .92, tracking −.005em, capitals, `--red-ink` |
| Groups | start 16px under the name; 30px between groups |
| Group label | a full-width box with a 2px bottom rule `--red-ink`, 10px padding under the text; text right-aligned; Sofia Sans 600, 14px/1.2, tracking .12em, capitals, `--red-ink`; 6px between the rule and the first row |
| Works | grid of three columns, 40px gap, filled left to right then down |
| Work row | 10px padding top and bottom; 1px bottom rule `--line2`; 72px tall when nothing wraps |
| Row, line 1 | title, Literata 400, 20/25, `--ink`; tag after it when the work is dubious or spurious |
| Row, line 2 | Greek title left, Literata 400, 16/24, `--mid`; length right, Sofia Sans 400, 13.5/16.2, `--faint`; 14px between; 2px under line 1 |
| Tag | Sofia Sans 600, 13px, lowercase, `--red-ink`, 10px left of it (the built `.b-tag` already matches) |

Divisions without groups (Logic, Metaphysics, Ethics and politics, Rhetoric and
poetics) have no label; their works start 16px under the name.

The list, in order (Ruled 7–9; the placements marked † are mine, by Bekker's
order; John saw them in two frames and did not question them):

| Division | Group | Works |
|---|---|---|
| Logic | | Cat, Int, APr, APo, Top, SE |
| Natural philosophy | Major works on nature | Phys, Cael, GC, Mete, DM† (spurious), DA |
| | Short works on nature (Parva naturalia) | Sens, Mem, Somn, Insomn, DivSomn, Long, Juv, Spir† (spurious) |
| | Biological works | HA, PA, MA, IA, GA |
| | Minor works (Opuscula) | Col, Aud, Phgn, Plant, Mirab, Mech (all spurious), Prob (dubious), Lin, Vent, MXG (all spurious) |
| Metaphysics | | Meta |
| Ethics and politics | | EN, MM† (dubious), EE, VV† (spurious), Pol, Oec† (dubious), AthPol |
| Rhetoric and poetics | | Rhet, RhetAl† (spurious), Poet |

Sixteen works carry a tag. The division "Dubious and spurious works" is gone.
The Isagoge stays off the home list, as now.

Heights at 1525, for checking: Logic 473–731; Natural philosophy 731–1940;
Metaphysics 1940–2126; Ethics and politics 2126–2456; Rhetoric and poetics
2456–2642.

### 3.4 Work page top block (Drawn; frames `55:5048`, `55:5076`, `55:5105`, `55:5185`, `55:5213`)

Three columns. The plate takes one end; the other two are always title, then
words, left to right.

| Plate side | Column 1 | Column 2 | Column 3 |
|---|---|---|---|
| right | title, Greek title, buttons | blurb, details | plate |
| left | plate | title, Greek title, buttons | blurb, details |

| Part | Spec (1525) | At 1152 |
|---|---|---|
| Crumb | y 93; left edge of the content column whatever the plate side (Ruled 3); Sofia Sans 500, 15px; "Works" is a link in `--red-ink`, the rest `--mid` | same |
| Title | top of box y 124; fitted to the column (§5.1); `--ink` | same rule, 309px column |
| Greek title | 12px under the title box; Literata 400, 28/42, `--mid`; one line | steps down to stay on one line (GC: 24.8px) |
| Blurb | top y 123; Literata 400, 21/31.5, `--ink` | same |
| Details | 22px under the blurb; rows 10px apart | same |
| Detail row | label column 90px, 18px gap; label Sofia Sans 600, 13.5px, tracking .04em, capitals, `--mid`; value Literata 400, 17/24.6, `--ink` | label column 72px, 12px gap; value 15.5/22.5 (the site's small-window setting) |
| Plate | top y 130; one column wide (§5.3 for the crop) | same |
| Buttons | 46px tall, 10px apart; their bottom edge is on the foot line | same |
| Foot line | the bottom of the tallest column | same |
| Books heading | its top rule is 44px under the foot line | same |

Measured results, for checking:

| Work | Title | Foot | Books heading |
|---|---|---|---|
| GC, 1525 | 66px × 4 lines | 486 (plate) | 530 |
| Meteorology, 1525 | 60.5px × 1 line | 434 (details) | 478 |
| Movement of Animals, 1525 | 80.9px × 3 lines | 473 (plate) | 517 |
| GC, 1152 | 56.2px × 4 lines | 446 | 490 |
| Meteorology, 1152 | 51.5px × 1 line | 450 | 494 |

Below the top block the page is as built (books and chapters, In print,
Resources, Commentary, Sources). Only the reds change (§4).

## 4. Design tokens

`shared/styles/b.css` has colour and font tokens but no spacing tokens; its
spacing is written in pixels, and the pixel values above follow that.

| Token | Light value | Used for |
|---|---|---|
| `--bg` | #f4f4f1 | page ground |
| `--ink` | #141413 | titles (new), text, rules over divisions, search underline, outline buttons |
| `--mid` | #5d5c57 | Greek titles in the list and on work pages, detail labels, crumb |
| `--faint` | #6c6b66 | lengths in the list, search placeholder |
| `--line` | #d9d8d2 | rules between book rows |
| `--line2` | #e6e5e0 | rules between work rows |
| `--red-ink` | #b42419 | every accent on these pages: division names, group labels and their rules, tags, the home Greek line, the Continue rule, book numerals, links, the primary button |
| `--red` | #e2382e | **not used on these pages after colour B** |
| `--soft` | #e9e8e3 | outline button hover (as built) |
| `--tface` / `--tw` | Oswald / 700 | titles, division names |
| `--read` | Literata | reading text, Greek, work titles in the list |
| `--sans` | Sofia Sans | labels, buttons, nav, lengths |

Colour B in the stylesheet, on home and work pages:

- `.b-po-t` (the title): `color: var(--ink)`, opacity 1. Today it is
  `var(--red)` at `--po-op` (.82).
- `.b-dh`, `.b-sub.sub-label` border, `.b-cont-t` border, `.b-facts dd a`
  border, `.b-bkn` (book numerals): `var(--red)` → `var(--red-ink)`.
- Do not change the `--red` token itself. The reader, the lexicon and search
  use it too (`.b-bk-t`, `.b-chn`, `.b-toc-w`, `.b-wp`, `.b-lx-n dd`,
  `.b-sr-big`), and John has not ruled on those pages.
- Why it matters beyond taste: `--red` on `--bg` is 3.94:1, under the 4.5:1 that
  small text needs. `--red-ink` is 5.94:1.

Not ruled: whether colour B reaches the reader, lexicon and search pages, and
what it does in dark mode (dark `--red` is #ff5a4d, dark `--red-ink` #ff7b70).
See §8.

## 5. Components

| Component | Where | Figma | Notes |
|---|---|---|---|
| Fitted title | home, work | text "Title" in each frame | §5.1 |
| Greek line (home) | home | "Greek title" | one line, fitted to the column width; `lang="grc"` |
| Search field | home | `3:15` | as built; underline 2px `--ink`; placeholder 21px, 18px under 1240px wide (already in the CSS) |
| Continue line | home, returning reader | "Continue reading" in `55:4766` | as built (`.b-cont`); its rule becomes `--red-ink` |
| Work row | home list | `40:1914` | §3.3 |
| Group label | home list | "Label" in `48:4259` | §3.3 |
| Tag | home list, work blurb | text run in the row title | as built (`.b-tag`) |
| Button, primary | work | `32:1530` | as built (`.b-btn.pri`) |
| Button, outline | work | `32:1532` | as built (`.b-btn`) |
| Detail row | work | `32:1534` | §3.4 |
| Book row | work | `32:1537` | as built; numeral `--red-ink` (the Figma master still shows the old red; the instances in Current are right) |
| Plate | work | "Plate" in each frame | §5.3 |

### 5.1 The fitted title

Use the fitter the site already has (`app/src/lib/poster-fit.ts`), with one
change: its box is one column wide and as tall as it needs.

- Face Oswald 700, capitals, one size for every line, line-height .88,
  tracking .01em.
- The fitter picks the largest size at which the lines fill the column width.
- Desktop keeps `floor: 0`: it never breaks a word. METEOROLOGY stays on one
  line, as on the phone. The phone's syllable breaks (`BRK`) are not used here.
- The column (363px, or 309px) is nearly the phone poster's box (354px), so the
  lockups are the ones John already approved on the phone. With more height to
  use, some titles take one more line at a larger size (GC four lines, not
  three). No new title rulings are needed.
- The h1's text stays one string ("The complete works of Aristotle"). The
  fitter draws the lines.

### 5.2 Home bust

The cut-out bust, true orientation, sized by the title (§3.2 step 4). `alt` is
`plates.home.alt`, as now. John noted on 9 Nov that light and dark themes drew
the bust at different sizes in the built page; the note is in
`hero-rounds.md` under "21:34-21:45". Check both themes.

### 5.3 Plates on work pages (Ruled 2)

**Side.** Two tests, in order:

1. A plate that points (a figure walking, a face in profile, a hand) faces the
   title. It goes on the side that makes that so.
2. Otherwise a framed scene goes left and a cut-out drawing goes right.

The result for all 47 works is in
`.redesign-shots/notes/vplato/r3/plate-sides.json` with a reason per work, and
drawn as a picture in Figma frame `39:1914`: 21 left, 25 right, the Isagoge
left. It goes into the `place` field that `app/src/data/plates.json` already
has (today every work says "right"). Seven of those calls were close and I
flagged them to John: APo, IA, Rhet, Pol, AthPol, DM, MXG.

**Size and crop.**

- A framed scene (Meteorology) shows whole, one column wide, at the plate's own
  aspect (1280:914): 363×259 at 1525. It is drawn with `mix-blend-mode:
  multiply` on the page ground.
- A cut-out drawing (the GC wheel, the Movement of Animals figure) is enlarged
  until its ink fills the column, and cropped to the ink: GC shows 363×356 from
  an image scaled to 519 wide; Movement of Animals 363×343 from 497 wide.

Only these three plates are drawn. The cut-outs need each plate's ink box.
**Mine:** measure it once per plate with a script and store it in
`plates.json` beside `place`; do not hand-tune 25 crops in CSS.

## 6. States and interactions

Nothing new is designed here; every state below is already in the build and
stays.

| Element | State | Behaviour |
|---|---|---|
| Work row | hover | title turns `--red-ink` |
| Work row | focus | 2px outline in the text colour, 2px off |
| Search input | focus | same outline |
| Search | submit | goes to `/search?q=…` |
| Continue line | present | only when the reader has a saved place; built by script after load |
| Continue line | absent | draws nothing and leaves no gap marker |
| Primary button | default | `--red-ink` ground, white label (6.55:1) |
| Outline button | hover | ground `--soft` |
| Nav link | current | `--red-ink` |
| "Click any Greek word" | touch device | reads "Tap" |
| Title | before fonts load | hidden by `poster-fitting` until fitted; shown unfitted after 3s if the script fails |

## 7. Responsive behaviour

| Width | What happens |
|---|---|
| 1313px and up | content column 1168px, centred; nothing grows past it |
| 961–1312px | 72px gutters; columns narrow; the fitter shrinks the title; the bust shrinks with it |
| under 1240px | search placeholder 18px; detail rows use the small setting (§3.4) |
| 701–960px (sideways) | unchanged from the build |
| 700px and under (phone) | unchanged from the build |

Drawn widths are 1525 and 1152 only. 961–1151px and anything over 1525px are
not drawn (§8).

## 8. Edge cases and what is not drawn

Each of these needs a decision or a look before John is asked for his yes.

1. **Returning reader at 1152×663.** Not drawn, and it does not fit as
   specified: the home line ends at 291 and the search starts at 327, a 36px
   gap; the Continue line needs about 47. **Mine:** let column 3 set the foot
   line when it is the tallest, as on work pages, and tell John the cost: the
   second row of Logic then ends roughly 15px below a 663px window (my sum,
   not a drawing).
2. **Long work titles in "Continue reading".** The line wraps inside its
   column and grows upward from the search. At 1525 there is room for three
   lines.
3. **Longest titles.** *De Mirabilibus Auscultationibus* sets at about 44px;
   *On Youth, Old Age, Life and Death, and Respiration* runs to many lines. Not
   drawn on desktop. Build them, shoot them, and show John.
4. **Greek title too long for one line.** Drawn once (GC at 1152: 28 → 24.8px).
   **Mine:** shrink to fit, no lower than 20px, then wrap.
5. **More than two buttons.** Works with two English editions add "Compare
   translations"; a returning reader adds "Resume at…". Not drawn. **Mine:**
   they wrap to a second row inside the column; the last row sits on the foot
   line.
6. **Tag in the blurb and the "related" link** on work pages: not drawn; keep
   as built, in the words column.
7. **Wrapping in the list.** A long title or Greek title makes its row taller
   (96, 121, 145px drawn). Rows in one line of the grid share a height.
8. **Dark mode.** Not drawn. The earlier dark frame (`18:630`) is of a
   superseded layout.
9. **Footer.** Not drawn; the frames end 80px under the list.
10. **Widths 961–1151 and over 1525.** Not drawn. Check 961×700, 1024×700,
    1280×800, 1366×768, 1440×900, 1920×1080.
11. **Colour B beyond these two page types.** Not ruled.
12. **Colour B on phone posters.** Not drawn; phone is "unchanged", so the
    phone title stays red until John says otherwise. Ask him: it will look
    odd beside an ink desktop title.
13. **No script.** The title shows unfitted; the Continue line never appears;
    the list and search work.

## 9. Motion

None is designed. Keep what the build has (the reveal after the title is
fitted; the `prefers-reduced-motion` block). The bust's size depends on the
fitted title, so size both before the reveal, or the block will jump.

## 10. Accessibility

- **Order in the source:** title, Greek line, home line, Continue line, search,
  then the list. The bust is decoration beside the title and carries its alt
  text. Gate R-H1 checks home order; update what it expects.
- **Focus order:** nav, Continue link (when present), search input, search
  button, then works left to right and down, which the three-column grid gives
  if the source order is the list order.
- **Names:** the h1 keeps its full text; the section keeps
  `aria-label="The complete works of Aristotle"`; the Greek line and Greek
  titles keep `lang="grc"`; search keeps `role="search"` and its label.
- **Tags** are text ("spurious", "dubious"), so a screen reader reads them
  after the title.
- **Contrast on `--bg`:** `--ink` 16.7:1, `--mid` 6.08:1, `--red-ink` 5.94:1,
  `--faint` 4.85:1. All pass 4.5:1.
- **Targets:** the build's 40px minimum stays (nav, Continue, search). List
  rows are 72px tall links.
- **One reader is vision-impaired and reads on a phone held sideways.** That
  layout does not change. If anything here pushes you to shrink type or a tap
  target at any width, stop and cut furniture instead.

## 11. Where it lands in code

| What | File |
|---|---|
| Home markup | `app/src/pages/index.astro` |
| Work page markup | `app/src/components/Landing.astro` |
| Styles | `shared/styles/b.css` (home and work rules; the `:where(.pg-home, .pg-work)` blocks hold the phone settings) |
| Title fitter | `app/src/lib/poster-fit.ts` (`fitPoster`, `fitWorkPoster`, `initPosters`) |
| List grouping | `CATEGORIES` and `DIVISION_NAMES` in `shared/lib/works.ts`; `buildDivisions` in `app/src/lib/corpus.ts` |
| Plate side and crop | `app/src/data/plates.json` |
| Gates | `app/scripts/check-redesign.mjs`, `app/scripts/redesign-browser.mjs` |

`shared/` is copied into the Plato and Homer readers by hand, hunk by hunk.
`CATEGORIES` is this reader's own data. The work page uses the same list
classes, so check that moving a spurious work into a main division gives its
work page the right crumb.

A superseded build of an earlier layout is saved as
`.redesign-shots/notes/hero-build/landing-hero-superseded.patch` (117 lines
added across `index.astro`, `b.css`, `check-redesign.mjs`). It applies cleanly
to the branch. Its division ids and its `.b-gt` Greek line are reusable; its
layout and its R-H4 gate are not.

## 12. Checks a machine can run

Write each as a gate with a failing case first, and make it print what it
examined (see "Hard gotchas" in `CLAUDE.md`).

1. **First screen, home.** At 1525×896 and 1152×663 with no saved place, the
   bottom of the sixth work row (the second row of Logic) is inside the
   window. This replaces the R-H4 written for the old layout.
2. **One grid.** The title's left edge equals the second list column's left
   edge, and its width equals a list column's width, within 1px.
3. **Foot line, home.** The bust's foot and the search underline's bottom are
   within 2px of each other; the list's first rule is 44px (±2) below.
4. **Foot line, work.** The buttons' bottom equals the lowest of plate, title
   column and words column, within 1px; the books heading's rule is 44px (±2)
   below. Run on GC, Meteorology, Movement of Animals and one long title.
5. **Plate side.** For every work, the plate's column matches `place` in
   `plates.json`; the crumb's left edge equals the content column's.
6. **Colour B.** On home and three work pages, light theme, no element's
   computed colour, border colour or background is #e2382e; the title's colour
   is `--ink` at opacity 1.
7. **List.** No division named "Dubious and spurious works"; no work listed
   twice; sixteen tags; the group label "Minor works (Opuscula)" holds ten
   works with the Problemata seventh.
8. **Greek line.** One line; computed colour `--red-ink`; as wide as its
   column within 2px.
9. **Phone and sideways.** The existing gates pass unchanged.

Then the human checks: John's eye on the built pages at his Safari size, in
light and dark, and a screenshot judge from another model family comparing the
build with the shots in `.redesign-shots/notes/vplato/current/`.

## 13. Figma map

| Frame | Node |
|---|---|
| Home, first screen, new reader, 1525×896 | `55:4907` |
| Home, first screen, returning reader, 1525×896 | `55:4766` |
| Home, whole page, 1525 | `48:4259` |
| Work, GC, plate right, 1525×896 | `55:5048` |
| Work, Meteorology, plate left, 1525×896 | `55:5076` |
| Work, Movement of Animals, plate left, 1525×896 | `55:5105` |
| Home, 1152×663 | `49:4498` |
| Work, GC, 1152×663 | `55:5185` |
| Work, Meteorology, 1152×663 | `55:5213` |
| Open: home Greek line with ἔργα | `60:5938` |
| Open: work Greek title in deep red | `59:5909` |
| Plate sides, all works (a picture) | `39:1914` |
| Components | `3:2` ("Parts") |

Do not edit `4:2` ("Yours · move things here") or `23:1230`; John arranged
those himself.
