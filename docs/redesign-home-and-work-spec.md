# Handoff spec: home page and work pages (direction B)

This spec describes round 9 as built on 12 Nov 2026 on `claude/redesign-build`.
It replaces the D26 spec (10 Nov), which the Figma frames drew. The Figma file
(https://www.figma.com/design/3FGcwopu3awgAt63aiwlmH) now shows a superseded
design. Round 9's pictures are in `.redesign-shots/notes/d26/round9/`
(`BRIEF-R9.md` says what each shows). The decisions log is
`HANDOFF-REDESIGN-BUILD.md` §3.2. Where this spec and that log differ, this
spec is right: the owner's rulings of 12 Nov corrected two facts in the log
(§3.5 and §3.2 below).

Each statement is marked by where it comes from:

- **Ruled**: the owner said so.
- **Built**: in the code and pinned by a gate (§12).
- **Open**: not decided. Do not build a choice.

## 1. Overview

Two page types: the home page (`/`) and every work page (`/<work>`). Round 9
sets desktop (961px and up), phone (up to 960px wide) and sideways (up to 500px
tall) on one design. Earlier specs froze phone and sideways; round 9 does not.

**Why.** The owner opened the first build at 1525×896 and saw no list: "the
image and title are HUGE on desktop." Round 9 keeps the list on the first
screen at 1152×663, gives a returning reader a short masthead, and puts the
edition choice, the Bekker ranges and the saved place on the work page where a
reader looks for them.

## 2. Rulings

| # | Ruling |
|---|---|
| 1 | Titles near the Plato reader's scale, with side margins |
| 2 | The crumb sits at the left edge of the content column |
| 3 | Division names sit above their works; works run in three columns |
| 4 | Dubious and spurious works sit in the main divisions, tagged |
| 5 | The small treatises form "Minor works (Opuscula)"; the Problemata is in it |
| 6 | No Greek interleaved with the English title |
| 7 | Desktop work titles wrap naturally, 38–60px (round 9 replaced the stacked, fitted title) |
| 8 | Buttons sit under the Greek title, not on a foot line |
| 9 | The plate is always in column 3 on desktop; no captions anywhere |
| 10 | The Greek title on work pages is ink |
| 11 | "Resume at" is "Continue at" at every width |
| 12 | The home Greek line is Ἀριστοτέλους ἅπαντα τὰ σῳζόμενα, desktop only |
| 13 | De Mirabilibus counts "178 reported marvels", not "about 178" |
| 14 | Phone and sideways are no longer frozen; each page was ruled on its own |

## 3. Layout

### 3.1 Grid

One grid serves the top block and the list.

| | 1525 wide | 1152 wide |
|---|---|---|
| Side gutter | centred column | 72px |
| Content column | 1168px (max) | 1008px |
| Columns | 3 × 362.67px | 3 × 309.33px |
| Column gap | 40px | 40px |
| Column left edges | 178.5, 581.2, 983.8 | 72, 421.3, 770.7 |

Rule: content width = `min(1168px, viewport − 144px)`, centred; three equal
columns, 40px gap.

### 3.2 Home top block, desktop

**First-time visitor (Built; R-T3, R-H8, R-H1).** Three columns: bust | title
and Greek line | sentence and search.

| Part | 1525×896 | 1152×663 |
|---|---|---|
| Bust (col 1) | 189×320 | 161×272 |
| Greek line (col 2) | 22.18px, one line, fitted to the column | 18.86px |
| Sentence (col 3) | Literata 24px, line-height 1.42 | same |
| Search (col 3, foot) | underlined field, 54 tall | same |
| List starts | y 453 at 1152 (R-H4) | |

- The Greek line is Ἀριστοτέλους ἅπαντα τὰ σῳζόμενα, in `--red-ink`, `lang="grc"`.
- The sentence reads "Read and search every work of Aristotle in Greek and
  English. Click any Greek word to parse and define it." "Click" reads "Tap" on
  touch devices.
- Under the top block a subject strip links to each division and shows its
  Bekker page range: Logic 1–184, Natural philosophy 184–980, Metaphysics
  980–1093, Ethics and politics 1094–1353, Rhetoric and poetics 1354–1462
  (R-H5, R-H6).

**Returning visitor, desktop (Built; R-H4, R-H9, R-H10).** A short masthead
(the title is 43.9px; the sentence is cut). Search runs across the intro, on
top. Below it sit two parts:

| Part | Spec |
|---|---|
| Card (left) | one card, for the most recent work only: title 24px, location 15px, "Continue reading" button 44px tall with 14px text |
| Passage (right) | the sentence the reader stopped at: Greek 16px above English 14px, one link to that place |

- The English is the work's default public translation (`defaultTranslation`
  in `shared/lib/works.ts`). For the Ethics that is Ostwald. A private
  translation never appears.
- The passage code (`shared/lib/resume-passage.ts`) loads by dynamic import,
  only on this path. The home page stays at 42.9 KB; a first draft that
  embedded every chapter map weighed 330 KB (R-H11 pins the limit at 60 KB).
- The list starts at y 361 at 1152 (R-H4).

**Phone (Built; R-H9).** First-time: bust, full title, sentence, search, subject
strip. The Greek line is cut. Returning: bust and full title; no sentence; one
card with the Continue button to the right of the title. The subject-strip
links are 44px targets.

### 3.3 Home list

Each division, top to bottom:

| Part | Spec |
|---|---|
| Division box | 1px top rule `--ink`; padding 26px top, 34px bottom |
| Division name | Oswald 700, 40px, capitals, `--red-ink` |
| Group label | right-aligned; Sofia Sans 600, 14px, capitals, tracking .12em, `--ink`; 1px `--line` rule under it |
| Works | three columns, 40px gap; rows in one line of the grid share a height |
| Row, line 1 | title, Literata 400, 20/25, `--ink`; tag after it |
| Row, line 2 | Greek title in `--ink`; length at right, 14px |
| Tag | 14px, `--mid` (16px on the phone) |

Divisions without groups (Logic, Metaphysics, Ethics and politics, Rhetoric and
poetics) have no label. The list (R-H7): five divisions, 46 works, sixteen
tags, and "Minor works (Opuscula)" holding Col, Aud, Phgn, Plant, Mirab, Mech,
Prob, Lin, Vent, MXG. The Isagoge stays off the home list.

### 3.4 Work page, desktop

Three columns, always in this order: title column, words column, plate. The
plate is in column 3 whatever `place` says in `plates.json` (R-W5).

| Column | Contents |
|---|---|
| 1 | title, Greek title in ink straight under it, buttons under the Greek title, then "Greek and English · <translator>" 6px under the buttons |
| 2 | blurb, then the editions block |
| 3 | plate; no caption |

**Title (Built; R-T1).** Natural wrap. Size 38–60px; with a comma in the title,
32–60px, split at the commas. The fitter picks the largest size at which the
title fits one, two or three lines, and prefers fewer lines when the size
costs under 16%. Two lines cap at 50px and three at 42px; a three-line title
gets looser leading.

**Buttons.** The main button's left edge is the content column's. Its top, at
1152px (R-W4, ±4): Categories 253, Meteorology 245, Ethics 289, De
Mirabilibus 267, On Memory 253, Prior Analytics 289, On Youth 358.

**Edition rows (Built; R-W1, R-A1).**

- Labels: "Greek text" and "Open Greek and English with".
- Each translation is one row, the whole row a link. Rows are 40px tall on
  desktop and 46px on the phone. Round 9 drew 36px; the owner ruled 40 on 12 Nov
  so the rows meet the 40×40 target floor. With 40px rows the Ethics contents
  start at y 516 at 1152×663 (R-W4, ±6), not 500.
- Only the translator's short name is underlined.
- "opens first" marks the default row when there are two or more.
- A tools row follows: "Compare translations" (when there are two or more
  editions) and "Glossary" (Ethics).

**Contents (Built; R-W8, R-W9).**

- A titled book shows its Bekker range beside its chapter count.
- A returning reader's book shows "saved at chapter N" in `--red-ink` beside
  the count. Rows do not shift: numeral and title keep the edge of every other
  row.
- A short work beside a tall plate tucks the contents up beside it (On Memory,
  R-W9). A script measures this; it adds a class only when the plate overhangs
  the words by more than 90px.
- Untitled chapters run in five columns with full ranges (De Mirabilibus, 178
  chapters), with a heavier rule every ten. A form takes a chapter or Bekker
  number.

**Returning reader (Built; R-W2).** The primary button reads "Continue at …".
"Start reading" becomes "From the start".

Below the top block the page is as built: books and chapters, In print,
Resources, Commentary, Sources. On desktop "In print" lists its entries in two
columns by kind.

### 3.5 Work page, phone (Built; R-W10, R-W11, R-T2)

Order: title, Greek title, plate, buttons.

- The title is capped at 64px and never shrinks to make room.
- The plate gives way: its height is capped to the room left, 120px at
  minimum, so the main button stays on the first screen.
- The line "Greek and English · <translator>" sits under the buttons. For a new
  reader it ends in a "Contents" link; a returning reader has none, because the
  contents follow.
- "Editions and tools" is a fold (a `details` element).
- A returning reader sees a full-width "Continue at …" button, then "From the
  start" and "Greek only". The summary moves below the contents.
- Edition rows are 46px. A saved chapter sits on its own line under the count.
- Untitled chapters run two to a row with full ranges, and a heavier rule every
  ten (R-W11).

### 3.6 Work page, sideways (Built; R-T5)

At `max-height: 500px` the plate sits in a right-hand column, 250px wide. Start
reading, Greek only and Contents sit in one row. Long titles wrap. A returning
reader sees a full-width Continue over the three buttons.

## 4. Design tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | #f4f4f1 | #121211 |
| `--ink` | #141413 | #ecebe6 |
| `--mid` | #5d5c57 | #a7a59e |
| `--line` | #d9d8d2 | #45433f |
| `--line2` | #e6e5e0 | #302f2c |
| `--red-ink` | #b42419 | #e0574b |

Dark theme (Built; R-F2, R-C3): rules are a step lighter, and there is one
red, #e0574b. Fonts: Oswald 700 for titles and division names; Literata for
reading text and Greek; Sofia Sans for labels, buttons and navigation.

On home and work pages at 961px and up: titles are `--ink` at full opacity;
book numerals are `--ink`; the current nav link is `--ink` at weight 650;
crumb links are `--ink` with a 2px `--red-ink` underline. The `--red` token is
unchanged; the reader, lexicon and search use it.

**Open: the dark treatment of plates.** The owner is choosing per plate among
four: a paper rectangle (as built), dimmed, light lines, and cut to outline.
The picker is https://claude.ai/artifact/KKa82v6pQudmzSw5dv6Bq6 (db collection
`picks`). Cut-outs come from `.redesign-shots/notes/d26/darkplates/recut/recut.py`,
with per-plate `bright` and `lift` settings in `recut/cfg.json`. Do not build
a choice until he picks.

## 5. Components

### 5.1 The fitted title

- Home (first-time): `fitPoster` fits the title to the column.
- Work, desktop: `fitDesktopWork` in `app/src/lib/poster-fit.ts` (§3.4).
- Work, phone: `fitPoster` with a 64px cap; `phonePlateHeight` sizes the
  plate.
- The h1's text stays one string; the fitter draws the lines.

### 5.2 Home bust

The cut-out bust, true orientation, sized by the title. R-T3 pins 189×320 at
1525 and 161×273 at 1152, in both themes.

### 5.3 Plates

- One frame for all 47 works; wide plates are dropped. `ink` boxes in
  `plates.json` crop cut-out drawings.
- No captions on work pages. The credits page carries the record.
- A plate record's `url` may be an array of `{part, href}`. The credits page
  then renders "Records: heart, lungs".
- **On Youth** is a composite: Milton's heart (Wellcome cr44ptdy, London 1814)
  beside Eustachi's lungs (Tab. XV fig. I, Rome 1714). Ruled 11 Nov 14:46. The
  decision db's earlier "Juv-2" pick is superseded.

## 6. States and interactions

| Element | State | Behaviour |
|---|---|---|
| Work row (home) | hover | title turns `--red-ink` |
| Edition row | hover | ground `--soft` |
| Search | submit | goes to `/search?q=…` |
| Continue card | present | only when the reader has a saved place; built by script after load |
| Continue card | absent | draws nothing |
| Title | before fonts load | hidden by `poster-fitting` until fitted; shown unfitted after 3s if the script fails |

Tap-target fixes made while gating: phone subject-strip links, In print
citations, and credits record links.

## 7. Responsive behaviour

| Width | What happens |
|---|---|
| 1313px and up | content column 1168px, centred |
| 961–1312px | 72px gutters; the fitter shrinks titles |
| under 1240px | detail text steps down to 16px |
| 700–960px | phone layout (§3.5), unless the screen is 500px or less tall |
| max-height 500px | sideways layout (§3.6) |

## 8. Edge cases

1. **Longest titles.** *On Youth, Old Age, Life and Death, and Respiration*
   sets in three lines at the comma floor (button top 358 at 1152).
2. **More than two buttons.** A returning reader on a work with two editions
   shows Continue, From the start and Greek only; Compare translations moves to
   the tools row on desktop and stays a button on the phone.
3. **Dark theme.** Tokens are built; plate treatment is open (§4).
4. **Footer, widths over 1525.** Not drawn.
5. **No script.** The title shows unfitted; the Continue card never appears;
   the list and search work.

## 9. Motion

None designed. The build keeps the reveal after the title is fitted and the
`prefers-reduced-motion` block.

## 10. Accessibility

- Source order on the home page: title, Greek line, sentence, search, then the
  list. R-H1 checks it.
- The h1 keeps its full text. Greek lines and titles keep `lang="grc"`.
- Each "Continue reading" button carries the work's name in its accessible name
  (R-H10).
- Targets: 40×40 minimum on desktop, 44 on the phone; edition rows 40 and 46px
  tall (R-A1).
- One reader is vision-impaired and reads on a phone held sideways. Never
  shrink type or a target; cut furniture instead.

## 11. Where it lands in code

| What | File |
|---|---|
| Home markup | `app/src/pages/index.astro` |
| Work page markup | `app/src/components/Landing.astro` |
| Styles | `shared/styles/b.css` (round 9 blocks: desktop at `min-width: 961px`, phone at `max-width: 960px`, sideways at `max-height: 500px`) |
| Title fitter | `app/src/lib/poster-fit.ts` (`fitPoster`, `fitWorkPoster`, `fitDesktopWork`, `phonePlateHeight`) |
| Resume passage | `shared/lib/resume-passage.ts` |
| Default translation | `shared/lib/works.ts` (`defaultTranslation`) |
| Plates | `app/src/data/plates.json`, `app/src/pages/picture-credits.astro` |
| Gates | `app/scripts/check-redesign.mjs`, `app/scripts/redesign-browser.mjs`, `app/src/__tests__/redesign.test.ts` |

`shared/` is copied into the Plato and Homer readers by hand, hunk by hunk.

## 12. Checks a machine can run

Every gate has a `--prove` case, a failing input it must catch, and prints what
it examined.

| Gate | What it pins |
|---|---|
| R-W1 | Edition rows: labels, one link per translation, translator underline, "opens first" |
| R-W2 | "Continue at …" and "From the start" for a returning reader |
| R-W3 | Book numerals in ink |
| R-W4 | First column positions and button tops (Cat 253, Mete 245, EN 289, Mirab 267, Mem 253, APr 289, Juv 358, ±4); Ethics contents at 516 (±6) |
| R-W5 | Plate in column 3; no captions |
| R-W8 | Book ranges and the saved chapter |
| R-W9 | The contents tuck beside a tall plate |
| R-W10 | Phone work page |
| R-W11 | Phone untitled-chapter lists |
| R-T1 | Title sizes |
| R-T2 | Phone plate budget: the main button stays on the first screen |
| R-T5 | Sideways layout |
| R-H1 | The home sentence and source order |
| R-H4 | List tops: 453 first-time, 361 returning |
| R-H5, R-H6 | Home masthead and subject strip |
| R-H9 | The Greek line, and the phone returning page |
| R-H10 | The desktop returning card and passage |
| R-H11 | Home page under 60 KB (unit test) |
| R-F2 | Dark tokens |
| R-C3 | Dark accent |
| R-A1 | Tap targets |

The last full run (`.redesign-shots/notes/d26/build9/gates/full-final.log`,
54 pass, 2 fail) predates the 40px edition rows. After the change, R-W1
(examined=94), R-W4 (examined=21), and R-A1 (examined=45229) pass, and the
R-W1 and R-W4 proofs still fail as they should (logs in `build9/gates/rows40/`).
The other failure, R-A3, is a timing flake in a search-page helper; it passes
run alone and this spec does not cover it.

Then the human checks: the owner's eye at his Safari size in light and dark,
and a screenshot judge from another model family.
