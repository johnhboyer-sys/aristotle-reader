# Build brief: site redesign, direction B ("Poster")

Written 8 Nov 2026 by the brief session (session 2 of 3 in
`HANDOFF-REDESIGN.md`). Uncommitted until John says.

This brief is for the build session. It builds B into `app/` and `shared/`.
It does not open a mockup to guess. Where this brief leaves something open,
that is a defect in the brief: stop and ask John, do not pick.

Every requirement has an ID and a check. A check is either machine-run (a
gate) or a screenshot gate (§6). Every gate is written failing-first: prove
it fails on the named bad case before you trust its pass, and make it print
how many things it examined, failing when that count is 0 (CLAUDE.md, "A gate
that compares a thing to itself reports green forever").

## Safeguards (John, 8 Nov, 16:55: an errant build must not undo the design work)

- **Own branch.** The build works on its own branch cut from `origin/main`.
  Nothing merges to `main` and nothing deploys until John has seen the
  side-by-side screenshots (§6) and says yes.
- **Read-only sources.** The mockup (round eight), the scratch kit
  (`~/Developer/aristotle-plates-scratch/kit/`, above all `kit/dirs/b/`), and
  the repo copies in `docs/redesign-kit/` are read-only for the build
  session. **Check:** at each stage's end, the sha1s in §3 still match, and
  `git diff origin/main -- docs/redesign-kit/` on the build branch is empty.
- **Stages, in order:** (1) home; (2) work page, with picture credits, which
  shares its plate data; (3) reader; (4) search; (5) lexicon. A stage starts
  only when the one before has passed its screenshot gate (§6) and its
  requirements' gates (§4). Requirements that span pages (4.1, 4.2, 4.11,
  4.12, 4.13) are checked at every stage on the pages built so far.
- **A screenshot gate counts only if it was shown failing first:** run it on
  the current live design (`origin/main` built as is) and confirm it reports
  the difference from the mockup.
- **Cross-family review.** A model family other than the builder's checks
  every screenshot gate. The builder's own "matches" does not count.

## Contents

1. Ground rules
2. Settled decisions (John's; fixed)
3. Sources: which files, what to take, what to leave
4. Requirements
   - 4.1 Where the CSS lives
   - 4.2 Fonts, colour, tokens
   - 4.3 Plates and the plate manifest
   - 4.4 The poster
   - 4.5 Home
   - 4.6 Work page
   - 4.7 Reader
   - 4.8 Search
   - 4.9 Lexicon
   - 4.10 Picture credits
   - 4.11 Site data and copy
   - 4.12 Access: targets, focus, contrast, keyboard
   - 4.13 No explainer text; empty states draw nothing
   - 4.14 Build and deploy
5. The check harness
6. Screenshot gates and the departures list
7. Codex findings 1–19, mapped
8. Not for the build
9. Open for John

---

## 1. Ground rules

- **Branch from `origin/main`**, not local `main` (local was 129 commits behind
  on 8 Nov; the six new works live only on `origin/main`). Read
  `shared/lib/works.ts` and the reader code from there.
- **This is a restyle of the live site, not a port of the mockup's JS.** The
  live components (`shared/components/Reader.svelte`, `Search.svelte`,
  `WordPopup.svelte`, `app/src/components/Landing.astro`, `LemmaPage.astro`,
  `app/src/pages/index.astro`, …) keep their data, routes and behaviour. B
  gives them markup classes, layout, type and copy. Where B's script builds
  something from mockup data (`window.U`, `window.DATA`), the site uses its
  live data instead.
- **Blast radius:** `app/`, `shared/`, and new check scripts under
  `app/scripts/`. Nothing in `pipeline/`, `build/`, `desktop/`. `shared/` is
  copied into plato-reader and homer, not a submodule: do not port any hunk
  there in this build.
- **Standing rules, all binding:**
  - A main reader is vision impaired and reads on a phone held sideways.
    Never shrink type or tap targets to make room; cut furniture instead.
    40×40px minimum for every control (R-A1).
  - No explainer text in the reader: labels, refs, numbers and the texts
    only. Empty states draw nothing (4.13).
  - Never name the Greek edition in reader chrome (R-R1).
  - Svelte component `<style>` blocks ship nowhere in the built site; reader
    pages load only `global.css`. B's CSS goes where it ships, and is checked
    in the built `dist/`, not in dev (R-C1).
  - The mockup frame is scaled to fit its window; the site is not. Measure
    layout with `offsetWidth`/`clientWidth`, not `getBoundingClientRect`
    widths, wherever a scale could intrude. Checks written for the mockup are
    not trusted on the site, and the reverse.
  - Build and deploy invariants in `CLAUDE.md` and `DEPLOY-STATUS.md` hold
    (4.14).

## 2. Settled decisions (John's; fixed)

State these in code as fixed values. There is no switch for any of them.

1. **Title place: "As set".** Every work plate's title stands beside its plate
   (`tp-side`); the plate sits right of a 470px title column, 56px clear of
   it, at every desktop width. The home plate alone sits left (`place: left`),
   its title column right. On a phone the title stands above the plate.
2. **Title size: "As set".** Every plate's size is "Full" (`ts = 1`): the
   largest Oswald 700 setting that fits the title box, ragged, whole words
   where they hold, one syllable break per long word by B's rule (`block()`,
   `solve()`, `sylBreaks()` in `script.js` lines 94–205, with `BRK` for
   METEOR/OLOGY and MECH/ANICA).
3. **The site name stays "Aristotle Reader".**
4. **Home line: "As in Plato":** "Parallel Greek–English editions of every
   work of Aristotle. Click any Greek word to parse it and see its definition.
   Search the corpus in Greek and English." "Tap" in place of "Click" on a
   touch screen.
5. **Every plate in dark mode sits on a full paper rectangle, the home bust
   included.** The outline masks (`kit/dirs/b/img/plates/*/mask/`) and the
   `work/masks/*` scripts (`mkmask.py`, `mkcand.py`, `apo.py`, `phys.py`,
   `shapes.py`, `picks.py`) are NOT for the build.
6. **Phone home plate box ends 20px before the title**, `object-fit: cover`,
   centred, so the bust keeps its size and blank paper is trimmed from the
   cut's sides (`.hp-p-side` rules, `style.css` lines 386–393).
7. **Plate images ship in the repo under `app/public`** (96 files, 18 MB).
8. **The Athenian Constitution moves to Moral and Political Philosophy**
   (Division IV, after Pol) in `shared/lib/works.ts`.
9. **John's answers of 8 Nov, 17:04:**
   - **Problemata blurb** ends "…answered with a conjecture." ("Take out
     'gathered into 38 books'"; R-K3).
   - **The appendix section is "Dubious and spurious works"**, sentence case,
     on the home page, in crumbs and on the credits page. New wording, neither
     the live "Doubtful and Spurious Works" nor the mockup's "Doubted and
     spurious works"; it changes site data (R-K5).
   - **The printed footer keeps "Greek text: <edition>"** ("Stay"). Only the
     on-screen reader drops the edition (R-R1).
   - **Home and work pages use the phone layout at 701–960px**: title above
     the plate ("phone"; R-T5).
   - **The sideways-phone reader rules go by width, desktop windows
     included** ("that's fine"; R-R8).
10. Also fixed by John earlier: title face Oswald 700; subheads "Ruled label";
   lexicon headword in Gentium Book Plus, no switch; dark-mode plates "on
   paper"; Porphyry only on the Categories page; columns in EN's and AthPol's
   plates stand (John: "Columns are fine if I pick them"); Metaphysics keeps
   the darker Volpato; the five non-commercial licences stand (the site is
   non-commercial); reader contents read "Book I", not "I Book I"; search
   hits read "I.5 1095b30"; and the reader-column rulings of 8 Nov 13:35
   (R-R4 to R-R9).

## 3. Sources: which files, what to take, what to leave

Scratch kit root: `~/Developer/aristotle-plates-scratch` (outside the repo).

| File | sha1 on 8 Nov | Take |
|---|---|---|
| `kit/dirs/b/style.css` | `0b48b793c01d7cd0054b63a5869863d14197b77e` | All rules for the pages below, less the cuts listed under "Leave" |
| `kit/dirs/b/script.js` | `1fb07959186dc51488607eaabc73ee0b5ffd336f` | Title fitter (lines 75–307), `fitWord` (319–334), `evenGreek` (346–357, as amended below), markup of each page (`B.home`, `B.work`, `B.reader`, `B.text`, `B.side`, `B.note`, `B.panel`, `B.search`, `B.lexicon`, `B.credits`), copy strings |
| `kit/dirs/b/notes.js` | `140e0335ba02efdc088cc49ab0e149c27f119cbb` | Nothing to ship. Its `pages.reader` names "the editions" in the reader head: wrong, ignore (finding 6) |
| `work/final-plates-2026-11-08.json` | `b0950e95b3b34374c5af6bc885804675e81db8bc` | The plate manifest (R-P2) |
| `kit/dirs/b/img/plates/{desk,phone}/*.jpg` | 48 + 48 files | The plate images, byte for byte (R-P1). Not the `mask/` folders |
| `colw/kit/dirs/b/{style.css,script.js}`, `colw/kit/shell.html` | — | The reader-column fixes John ruled on (R-R4 to R-R9): only the `col=fb` (wrap), `wp` (word panel) and `cmpm=cm-side` paths. Not `fa`, `fc`, `fd`, `fe`, `ff`, `cm-under`, `cm-eng` |

Repo copies of the three B files are in `docs/redesign-kit/dirs/b/`; on 8 Nov
they matched the kit byte for byte. If they differ when you start, the kit
wins; say so in the PR.

**What B takes from `kit/shell.html` (finding 19).** Copying B's three files
alone does not reproduce the design. Port these, and nothing else, from the
shell:

1. **The font link** (shell line 5): Gentium Book Plus (400, 700, italic
   400), Literata (400, 500, 600, italic 400), Sofia Sans (400, 500, 600,
   650, 700, italic 400). Add Oswald 700 (from B's `@import`). GFS Didot is
   in the shell's link but loads only on pick on the site (R-R10).
2. **The container.** `.frame { container-type: inline-size; container-name:
   mock; }` (shell line 109). B's phone rules are `@container mock
   (max-width: 700px)`. On the site, either wrap each page in an element with
   `class="frame dir-b"` and that container, so B's selectors and
   `@container` rules port as written, or rewrite them as `@media` on the
   viewport width. Pick one and use it everywhere. The width bands are: phone
   held upright ≤700px; phone held sideways 701–960px; desktop ≥961px.
3. **Shared mechanics** (shell lines 151–160): `box-sizing: border-box` on
   everything; `.tok { cursor: pointer }`; `[hidden] { display: none
   !important }`; buttons inherit font and colour; links inherit colour;
   `.fn` footnote-mark reset (line 158, but see R-A1 for its hit area);
   `:focus-visible { outline: 2px solid currentColor; outline-offset: 2px }`
   (but see R-A2); the `prefers-reduced-motion` rule.
4. **The dark-mode hook.** B keys dark mode on `.dir-b.dark`. The site keys
   it on `:root[data-theme="dark"]` (set by `ThemeInit.astro`). Map one to
   the other; do not add a second theme switch.
5. **`window.U` helpers are mockup stand-ins.** B calls `esc`, `fmt`,
   `ROMAN`, `work`, `divisions`, `divisionOf`, `further`, `workBooks`,
   `bookSpan`, `extent`, `transParts`, `trans`, `readerTrans`, `lineHTML`,
   `engHTML`, `footnote`, `cards`, `longParse`, `t8`, `lemmaPage`, `ALPHA`,
   `search`, `hitWindow`, `engAt`, `showNum`, `BLOCKS`, `TITLES`,
   `chapterList`, `bookList`, `blockOfCite`, `RESUME`. Each maps to live
   data or a live module (`shared/lib/works.ts`, `data.ts`, `search.ts`,
   `resume.ts`, the reader's own rendering). Use the live one. Never port the
   shell's data line (`window.DATA`, 1.5 MB of corpus copies) or any of
   `U.variant`, `U.HERO`, `U.PH`, `U.RESUME`, `U.START`, `U.search` (fixed
   mockup data). List the mapping you used in the PR description.

**Leave out of `style.css`:**

- Line 1's `@import` (it loads Anton, Bebas Neue, Big Shoulders Display and
  Sofia Sans Extra Condensed for switches that are gone). Fonts come from one
  link (item 1 above).
- Lines 20–25 (`var-anton`, `var-bebas`, `var-shoulders`, `var-r5`): set
  `--tface: Oswald, sans-serif; --tw: 700` as the base value.
- Line 11's `--gface`/`--gw` and the `.b-tp` rule (line 94): no type posters
  are drawn.
- Lines 43–57 and 72–79 where they serve photographs or the over/top/foot/band
  title places; keep `.b-po`, `.b-po.pl`, `.tp-side`, `.pl-l`, `.no-pl`.
- Lines 65 (`invert`), 67–71 (masks), 392 (mask on phone home).
- `.b-mock`, `.b-next`, `.b-hero-cr`, `.hw-didot`, `.hw-literata`.

**Leave out of `script.js`:** `CHALK`, `FINDS`, `logic`, `ph`, `src`, `CUT`,
`credit` (the photograph credit), `PL_LATER` (the manifest replaces it),
`REJECTED`, `FACES` other than Oswald, `gw100`, `fitType`, `LEDE` other than
`plato`, every `U.variant` read.

## 4. Requirements

Each requirement: what, then **Check**. "Gate" means the harness in §5 runs
it against `astro preview` of a built `app/dist`. "Unit" means vitest.
"Shot" means a screenshot gate in §6.

Standard viewports, named below by these labels:

| Label | Size | Band |
|---|---|---|
| D1440 | 1440×900 | desktop |
| D1280 | 1280×800 | desktop |
| D1920 | 1920×1080 | desktop |
| D961 | 961×800 | desktop, narrowest |
| S844 | 844×390, touch | phone held sideways |
| S960 | 960×540, touch | phone held sideways, widest |
| P390 | 390×844, touch | phone held upright |
| P360 | 360×780, touch | phone held upright, narrow |

### 4.1 Where the CSS lives

**R-C1. B's CSS ships in a global stylesheet every page loads.** Put it in
`shared/styles/global.css` or a new file imported beside it on every page
(`index.astro`, `[work]/index.astro`, `[work]/book/[n].astro`, `search.astro`,
`lemma/[slug].astro`, `lemma/index.astro`, the new credits page, `404.astro`,
`attribution.astro`, `phrases.astro`, `support.astro`, `desktop.astro`,
`advanced.astro`, `EN/glossary.astro`). No B rule in a Svelte `<style>` block.
**Check (gate):** on the built site, for one page of each kind, read a
sentinel computed style from B's CSS (the work title's `color` on a work page,
`.b-rh` `height` on a reader page, `.b-wp` `font-family` on a lemma page,
`.b-sr-big` `color` on search). Also grep the built `dist/_astro/*.css` for
`--greek-w` (≥1 hit). Failing case first: move one sentinel's rule into a
Svelte `<style>` block, build, and see the gate fail on that page.

**R-C2. One Greek-width variable: `--greek-w`.** B used `--gw` for both the
poster title weight (`style.css` line 11) and the reader's Greek column width
(line 225). The width becomes `--greek-w`; `--gw` does not appear in the
shipped CSS or JS. **Check (gate):** grep built CSS and JS for `--gw\b`: 0
hits. Failing case: a fixture string containing `var(--gw,` is caught.

### 4.2 Fonts, colour, tokens

**R-F1. Faces.** Titles: Oswald 700, uppercase. Reading: Literata. Chrome:
Sofia Sans. Lexicon headword: Gentium Book Plus. Greek reading face: the
reader's pick (R-R10). The screen loads no other face (print-only links with
`media="print"` stay as they are; print is another track). **Check (gate):**
log font requests on home, a work page, a reader page, search and a lemma
page; families requested ⊆ {Oswald, Sofia Sans, Literata, Gentium Book Plus}
plus any `media="print"` link; none of Anton, Bebas Neue, Big Shoulders
Display, Sofia Sans Extra Condensed, GFS Didot, Cardo, EB Garamond on screen.
Failing case: add an Anton link to one page; the gate names it.

**R-F2. Colour tokens** are B's, `style.css` lines 6–7 (light) and 15–16
(dark): `--bg #f4f4f1`, `--paper #fbfbf9`, `--ink #141413`, `--mid #5d5c57`,
`--faint #6c6b66`, `--line #d9d8d2`, `--line2 #e6e5e0`, `--red #e2382e`,
`--red-ink #b42419`, `--soft #e9e8e3`, `--hl #f3e2a4`; dark `--bg #121211`,
`--paper #171716`, `--ink #ecebe6`, `--mid #a7a59e`, `--faint #8d8b85`,
`--line #2d2c29`, `--line2 #22211f`, `--red #ff5a4d`, `--red-ink #ff7b70`,
`--soft #24231f`, `--hl #5a4917`. **Check (gate):** read each token's computed
value on `:root` (or the B wrapper) in both themes and compare to this list.
Failing case: change one hex in a test copy; the gate names it.

**R-F3. Small red text uses `--red-ink`.** `--red` is for display sizes only
(finding 7: `--red` on `--bg` is 3.94:1). This covers `.b-sub.sub-label`
(line 120 sets `--red`: change it, and its 2px rule may stay `--red`).
**Check:** R-A3's contrast gate.

### 4.3 Plates and the plate manifest

**R-P1. Images.** Copy `kit/dirs/b/img/plates/desk/*.jpg` to
`app/public/plates/desk/` and `phone/*.jpg` to `app/public/plates/phone/`: 48
each (47 works and `home`), byte for byte. Never re-encode, re-crop or resize,
in files or in CSS (desk 1280×914, phone 640×558; phone crops differ from desk
crops on purpose). No mask files. **Check (unit):** 96 files; each one's
sha256 equals its kit source's; desk files 1280×914, phone 640×558 (read from
the JPEG header); the set of ids equals the manifest's keys; no `mask`
directory under `app/public/plates`. Failing case: flip one byte in a copy, or
remove one file; the test names it.

**R-P2. Manifest.** Copy `work/final-plates-2026-11-08.json` into the repo as
`app/src/data/plates.json`. Keep per id: `place`, `alt`, `who`, `what`,
`when`, `how`, `where`, `lic`, `url`, and `note` where present. Drop `pick`,
`desk`, `phone` (paths follow from the id). Add `credit` (R-P3). **Check
(unit):** 48 keys; every work id in `shared/lib/works.ts` has a key, and so
does `home`; no other keys; `place` is `left` for `home` and `right` for the
other 47; every `url` is `https://` or `http://` and not `#`. Failing case: a
fixture missing one work id fails.

**R-P3. Holder credit line (finding 14).** Each entry gets a `credit` field:
the holder's own credit line, copied word for word from the record page at
that entry's `url` (for example the Met's "Gift of Mrs. Carroll G. Ross, 1945"
for EN), or `null` where that page gives none. Add `creditChecked` (the date
you read the page). The credits page renders `credit` after `where` when it
is not null, and draws nothing for it when null. **Check (unit):** every
entry has both keys (a missing key fails; `null` passes); the test prints how
many are null; EN's `credit` is exactly "Gift of Mrs. Carroll G. Ross, 1945".
Failing case: delete EN's `credit` key; the test fails.

**R-P4. Dark mode: paper rectangle.** In light mode a plate prints black ink
with its white paper blended into the page (`mix-blend-mode: multiply` on
`--bg`). In dark mode every plate, home included, keeps its paper as a full
rectangle: `filter: sepia(.45) brightness(.76) contrast(1.06);
mix-blend-mode: normal` (`style.css` line 66). No mask, no invert. **Check
(gate):** on home and 47 work pages, in both themes, at D1440 and P390, every
plate `img` has computed `mask-image: none`; light: `mix-blend-mode:
multiply`, `filter: none`; dark: `mix-blend-mode: normal` and the filter
above. Prints the count examined (expect 192). Failing case: give one plate
`filter: invert(1)` in dark mode; the gate names it.

### 4.4 The poster

**R-T1. Title setting matches the kit.** At D1440 (title box 470 wide) and
P390 (title box 354 wide) every work's poster title breaks into the same lines
at the same sizes as the kit's. The box width is the element's real width, not
a constant (finding 3); at those two viewports it equals the kit's. The title
is re-fitted when fonts load and when the box width changes. **Check (gate):**
first generate a golden file from the kit: build it (`python3 -I build.py
--out out/t --dirs b` in `kit/`), load `out/t/index.html#b-work:<id>` for
each of the 47 works in desktop and phone panes, wait for
`document.fonts.ready`, and record each `.b-po-t`'s `.ln` texts and its
`data-set` (sizes, comma-joined). Save as
`app/scripts/fixtures/poster-golden.json` (94 entries). On the site, record
the same and compare: line texts equal, each size within ±1px. Failing case:
edit one golden entry's line break; the gate names that work.

**R-T2. Poster height is capped by screen height (finding 18).** On a work
page, "Start reading" is fully in view at first paint without scrolling at
D1440, D1280, D1920 and P390, on all 47 works. The plate scales down whole
(never cropped) to make room; the title box height shrinks with it (box height
= poster height − 56px) and the title re-fits. At S844 the poster is no taller
than the viewport less the nav, so the button is one screen's scroll away.
**Check (gate):** for each work at each viewport, `Start reading`'s bottom ≤
viewport height − 16px (S844: poster height ≤ viewport height − nav height),
and the plate's rendered box keeps its 1280:914 (or 640:558) ratio within 1%.
Prints 47×5 examined. R-T1's golden is compared at 1440×1400, where the cap
does not bite. Failing case: remove the cap; the gate fails at D1440 for
Categories (Codex measured y≈950).

**R-T3. Desktop layout.** Title column 72px from the page edge, 470px wide;
the plate starts 56px past it (left: 598px) and fills the rest at its own
shape, right-aligned (`style.css` lines 80–90). Home mirrors this (`pl-l`):
plate at left, title column at right, 72px from the edge. Title colour `--red`
at `opacity: var(--po-op)` (.82 light, .86 dark). **Check (gate):** at D1440,
D1280, D961 on EN, Cat and home: gap between the title box and the plate box
is 56px ±1. Failing case: set the gap to 44px; the gate fails.

**R-T4. Phone layout.** Title above the plate (padding 18px 18px 26px), plate
full width at 640:558. Home on a phone: bust left in a box 46% of the page
wide and 48.8% tall, `object-fit: cover`, `object-position: center`; title in
a column beside it with 20px clear on its left and 18px on its right (`style.css`
lines 388–393; settled decision 6). **Check (gate):** at P390 and P360, home:
`img` right edge + 20 = title box's left edge (±1px), `object-fit: cover`; in
both themes. Work pages: title box bottom ≤ plate top. Failing case: set
`object-fit: contain`; the gate fails.

**R-T5. Phone poster layout at 701–960px (John: "phone").** At widths
701–960px, home and work pages use the phone poster layout (R-T4): the title
above the plate, the plate full width at 640:558 from the phone cut; on home
the bust beside the title as on a phone. Only the poster changes band; the
reader keeps its own 701–960 rules (R-R4, R-R8). The title box is the
element's real width (R-T1), so the title re-fits to it. The height cap
(R-T2) still holds. **Check (gate):** at S844 and S960, on home, `/Cat/`,
`/EN/` and `/Int/`: each work page's title box bottom ≤ its plate's top;
home's bust box right edge + 20 = the title's left edge (±1px); every plate
`img` loads from `/plates/phone/`; no title line's `scrollWidth` exceeds its
box. Prints pages × sizes examined (8). Failing case: the desktop layout at
S844 (title column beside a ~250px plate) fails the first assertion.

### 4.5 Home

**R-H1. Content, in order:** nav (brand "Aristotle Reader"; Works, Search,
Lexicon, Phrases, Support; theme button; on a phone a search icon and a menu,
`style.css` lines 498–516); the home poster (title "The complete works of
Aristotle", Huot's bust); the home line (settled decision 4); the search box;
"Continue reading …" only when the reader has a saved place
(`shared/lib/resume.ts`), naming that place; the works by division; the
footer. No "Next photograph". **Check (gate):** brand text is exactly
"Aristotle Reader"; the home line text equals decision 4's string with
"Click" at D1440 and "Tap" at P390 (touch emulated; decide by `(hover: none)
and (pointer: coarse)`); with empty storage there is no "Continue reading"
element; with a saved place there is one, and its link resolves. Failing case:
a build that prints "Click" on P390 fails.

**R-H2. Works by division.** Division names: Logic; Natural philosophy;
Metaphysics; Ethics and politics; Rhetoric and poetics; Dubious and spurious
works (R-K5). Subheads as "Ruled label" (`.b-sub.sub-label`,
`--red-ink` text, 2px red rule). Each work: English title, Greek title,
extent; dubious/spurious tag in `--red-ink`, weight 600. The Isagoge is not
on the home list. **Check (gate):** the division heads read in that order;
Ethics and politics lists EN, EE, Pol, AthPol; Rhetoric and poetics lists
Rhet, Poet; no home link to `/Isa/`; every work link resolves (200). Failing
case: a home page with AthPol under Rhetoric and poetics fails.

**R-H3. Footer.** B's footer links (`script.js` lines 550–553), each to a
real page on the site or to the real sister site. A link with no real
destination is left out, not drawn with `href="#"`. "Picture credits" goes to
the new credits page (R-K1). **Check (gate):** no `href="#"` and no
`data-noop` anywhere in the built HTML of any page (also covers findings 5 and
11); every footer link resolves. Failing case: one `href="#"` in the footer is
caught.

### 4.6 Work page

**R-W1. Content, in order:** nav; crumb "Works / <division name>"; the poster;
the Greek title; the blurb (with tag); the buttons; the facts (Greek source,
English translations, length); "Books and chapters" (or "Chapters"); "In
print" where the registry has entries; "Commentary" (Categories only: the
Isagoge); "Sources"; footer. The work page may name the Greek edition (it is
the record, not reader chrome). **Check (gate):** on each of 47 work pages
these sections appear in this order, the absent ones drawn not at all; the
crumb on `/AthPol/` reads "Works / Ethics and politics"; only `/Cat/` has a
Commentary section, and it links `/Isa/`. Failing case: AthPol's crumb
reading "Rhetoric and poetics" fails.

**R-W2. Buttons route to the right text (finding 4).** "Start reading" opens
this work's first book; "Resume at …" appears only when the saved place is in
this work; "Greek only" opens this work in the Greek view; "Compare
translations" appears only when the work has two or more public translations
and opens Compare. **Check (gate):** for each work, follow Start reading and
assert the reader's work id equals the page's; Greek only lands in the Greek
view. Failing case: a Start reading hard-wired to EN fails on 46 works.

**R-W3. Books.** Each book's number large in red (`.b-bkn`; the Metaphysics
keeps its Greek letters), a visually hidden "Book" before it so it reads "Book
I"; books closed by default; "Open all books" and "Close all" as 40px
targets. Chapter rows link to that chapter in the reader. **Check (gate):**
every chapter link resolves to the right work, book and chapter (sample: all
chapters of EN, Meta, AthPol, Isa); R-A1 covers sizes.

### 4.7 Reader

**R-R1. No Greek edition in reader chrome (finding 6).** The reader head is:
the work's name; "BOOK I" in red Oswald capitals; the Greek title; the English
translators. No editor, edition or year of the Greek text anywhere on screen
in the reader except inside the Greek and English text columns. This removes
the live reader's `rc-greek` line (`Reader.svelte` ~1454) and the Greek half
of `pairText` (~342) from screen chrome. The printed footer keeps "Greek
text: <edition>" (`printCite`, ~411; John: "Stay"). **Check (gate):** for
every work, open book 1 in Greek, Both and English views at D1440 and P390;
take the visible text of the reader outside `.b-gc`, `.b-ec` and footnote
popups; it contains neither that work's `greekSource.short` nor
`greekSource.full` from `works.ts`. With print media emulated, the printed
footer still contains "Greek text: " followed by that `greekSource.full`.
Prints works × views examined. Failing cases: a test page with "Greek:
Bywater, 1894" in the head fails; a build that drops `printCite` fails the
print assertion.

**R-R2. Reader head fits one row.** At every width the head is one row of
fixed height (60px desktop, 54px phone): at S844 it must not break into two
rows over its rule (the known fault). Cut furniture to fit (hide the chapter
title, then use the short work name), never type size or target size. **Check
(gate):** at D961, S844, S960, P390, P360 and every 40px width from 701 to
1440, the head's children share one row (their tops differ by < 10px) and the
head's `scrollHeight` ≤ its `clientHeight`. Failing case: at S844 on the
current kit CSS the gate reports two rows.

**R-R3. Contents panel.** Book heads read "Book I", "Book II", … (not "I Book
I"). Chapter numbers red (`--red-ink` at sizes under 24px). **Check (gate):**
every book head's text matches `^Book [IVXLC]+$` (or the work's own book
labels, e.g. Greek letters for Meta); prints count.

**R-R4. Both view stays side by side on desktop and phone held sideways.**
At ≥701px Greek and English are always side by side, never stacked. Only a
phone held upright (≤700px) stacks each passage: Greek, then English, then a
second translation, at 18px (`style.css` lines 471–488). **Check (gate):** in
Both view at D1440, D961, S844, S960 every `.b-row`'s English cell top equals
its Greek cell top (±2px); at P390 each English cell starts below its Greek
cell. Failing case: stacking at S844 fails.

**R-R5. Greek width: whole lines, then wrap; English never squeezed.** One
Greek column width for the whole book from its widest Bekker line, measured
with `offsetWidth` of the `.b-lt` elements while they are `nowrap` (add a
`gw-measure` class during measurement; `colw` `script.js` lines 350–379).
Then, with `w` that width, `u` the English font size, `n` the columns in the
row, `gap` the column gap and `avail` the row width less gaps:
`emin = (n > 2 ? 18 : 26) · u · (n − 1)`, `gmin = min(w, 20·u)`, and the
Greek column is `w` if `avail ≥ w + emin`, else `avail − emin` if that is ≥
`gmin`, else `avail · gmin / (gmin + emin)`. Set it as `--gcol` with fallback
`var(--greek-w, max-content)`. When the Greek column is narrower than `w`, its
lines wrap with a hanging indent (`padding-left: 1em; text-indent: -1em`) and
keep their line numbers. **Check (gate):** on EN I and one work with long
Bekker lines, at D1440, D1280, 1200×800, D961 and S844, panel closed and
open, Both and Compare: the Greek column's width equals the formula ±1px; no
English line box overlaps any Greek word box (count must be 0; the gate
prints boxes examined); no reading text under 18px. Failing case: the
round-eight rule (`var(--gw, max-content)` only) fails at 1200 with the panel
open (English 0px wide, per the column session).

**R-R6. `evenGreek` reruns** when the word panel opens or closes, on resize,
when fonts load, and when the reader picks a Greek font or text size; on panel
open it keeps the clicked word where it was on screen (`colw` `shell.html`
`setWord` change). **Check (gate):** record `--gcol` at D1440; open the panel;
the value changes and the clicked word's top moves < 4px; switch to GFS Didot;
`--greek-w` changes; resize to D961; `--gcol` changes. Failing case: drop the
rerun on panel open; the gate fails.

**R-R7. Word panel on desktop (≥961px)** is 400px wide, under the head, full
height, and stays in view while the text scrolls. Aa has a row "Word panel"
with "Keep English visible" (default, first) and "Over text". Keep English
visible pushes the text: the text's right padding becomes 400 + 36px, the
column gap at least 56px (the English margin numbers sit at −48px; round
eight's 44px let them touch the Greek), and in Compare the text keeps clear of
the panel too (round eight's `.word-open.cmp .b-text { padding-right: 72px }`
ran it under; use `colw` `style.css` lines 559–562). Over text: the panel lies
over the text, which does not move. **Check (gate):** at D1440 and D1280,
panel open, Both and Compare, Keep English visible: English line boxes under
the panel = 0, column gap ≥ 56px; Over text: `.b-text` padding unchanged from
closed. Scroll 2000px with the panel open: the panel's top = head bottom and
its bottom = viewport bottom. Failing case: round eight's Compare rule gives
20+ English lines under the panel.

**R-R8. Word panel on a phone held sideways (701–960px)** always lies over the
English. These rules go by width alone, so a desktop window 701–960px wide
gets them too (John: "that's fine"): no push, no "Word panel" row in Aa, no bottom sheet. (With it open,
about two letters of each English line show; John knows.) On a phone held
upright the panel is the bottom sheet (`style.css` line 443). **Check
(gate):** at S844 and S960 (touch), and at 900×800 without touch, panel
open: `.b-text` padding equals its closed value; Aa has no "Word panel" row;
the panel is not anchored to the bottom.
At P390 the panel is anchored to the bottom.

**R-R9. Compare** is three columns (Greek, English, English) at ≥701px,
stacked only at ≤700px. **Check:** R-R4's gate, run with Compare on.

**R-R10. Aa panel.** View (Greek, Both, English); Greek font: Literata
(default), Gentium Book Plus, GFS Didot; text size; line spacing; column width
(desktop); the word panel row (R-R7); print; reset. Reset restores Literata.
A Greek face loads only when the reader picks it. Nothing in the Greek may rely
on bold or italic (GFS Didot has one weight). Keep the live reader's other
settings; drop B's "Add the citation when I copy Greek" checkbox unless the
live reader has that feature. **Check (gate):** on a fresh load no GFS Didot
font file is requested; after picking it, one is; Reset sets the Greek face
back to Literata; every element inside `.b-gc` has computed `font-weight` ≤
400 and `font-style: normal` (a selected word is marked by background only).
Failing case: a bold `.hit` in Greek fails.

**R-R11. Book head.** "BOOK I" etc. in `--tface` at 96px desktop, 64px phone,
`--red`; chapter heads: number in `--red`, title in Literata, then "Chapter n ·
Bekker span" (`style.css` lines 214–223, 430–435). **Check:** shot pair
G-READ-D, G-READ-P.

### 4.8 Search

**R-S1. Results.** The count large in `--red`; the works with hits down the
left, sticky (a swipe row on a phone); each hit shows book and chapter in dark
type before the citation, on one line: "I.5 1095b30" (for works not cited by
Bekker line, book.chapter then the work's own citation). Every control works
(language buttons, work filters) or is not drawn (finding 11). Any summary text
in the options row is true of the live search, or it is not drawn. **Check
(gate):** search "ἀρετή": the count element's colour is `--red`; every hit's
ref text matches `^[IVXLC]+\.\d+ \d{3,4}[ab]\d{1,2}$` for Bekker works and is
on one line (its height ≤ 1.5× its line height); clicking a work filter
changes the hits shown; clicking each language button changes the query mode;
no `href="#"`. Failing case: a ref wrapped onto two lines fails.

### 4.9 Lexicon

**R-L1. Headword.** The lemma page opens on the headword as its poster: red,
accents kept, Gentium Book Plus, as large as the column allows, at most 150px
on desktop and 80px on a phone (`fitWord`, `script.js` lines 326–334). No face
switch. **Check (gate):** on 20 lemma pages (include the longest headword in
the index) at D1440 and P390: computed `font-family` starts with "Gentium Book
Plus"; font size ≤ 150 / ≤ 80; the headword's `scrollWidth` ≤ its
`clientWidth`. Failing case: a 200px headword fails.

**R-L2. Live data only.** Counts, "By work" (occurrences, not work posters),
LSJ, Nearby (each a real link to that lemma, or not drawn). "Key passages" is
not drawn until it has data (finding 10). **Check (gate):** on 20 lemma pages
no section heading is followed by no content; every Nearby link resolves; no
text "will appear here".

### 4.10 Picture credits

**R-K1. A credits page** at `/picture-credits/`, linked from the footer: the
home plate, then every work's plate in home-list order (the Isagoge after the
logic works). Each row: the work's title (linking its page), then who, what,
when, how, where, `credit` (when not null), licence, and a "Record" link
whose `href` is the manifest `url` (finding 5). **Check (gate):** 48 rows;
each Record `href` equals its manifest `url`; no `href="#"`; the five
non-commercial licences (home, Cat, Int, Mech, RhetAl) appear as the manifest
gives them. Failing case: render one row with `href="#"`; the gate fails.

### 4.11 Site data and copy

**R-K2. Athenian Constitution in Division IV.** In `shared/lib/works.ts`,
move `{ id: 'AthPol' }` from Division V to Division IV after `{ id: 'Pol' }`.
**Check (unit):** Division IV ids are exactly `EN, EE, Pol, AthPol`; V's are
`Rhet, Poet`. Failing case: the test fails on `origin/main` as it stands.

**R-K3. No book count in any blurb.** Remove "in n books" from every work
`blurb` in `shared/lib/works.ts`: 16 lines end ", in <n> books." or " — in
<n> books."; cut the clause with its comma or dash, so the line ends at the
word before it ("…habits, and behaviour."). The book count stays in the book
list. The Magna Moralia blurb becomes exactly: "An
ethics over the ground of the Nicomachean and Eudemian Ethics; whether
Aristotle wrote it is disputed." The Problemata blurb becomes exactly: "Nearly nine hundred questions of natural
science, each asked as “Why…?” and answered with a conjecture." (John: "Take
out 'gathered into 38 books'"). **Check (unit):** over every
work's `blurb`, `/\b(in|into)\s+[a-z-]+\s+books?\b/i` matches 0 times; the
test prints the number of blurbs examined (every `blurb` in the file: 50 on
`origin/main` on 8 Nov) and fails if it is 0; no blurb ends in " —." or ",."; MM's
and Prob's blurbs equal the strings above. Failing case: the test fails on `origin/main`
(18 matches).

**R-K4. Division display names** come from one map, B's `DIV`
(`script.js` line 20) plus the appendix name (R-K5), used by home, crumbs and
credits. **Check:** R-H2 and R-W1 gates.

**R-K5. The appendix is "Dubious and spurious works" (John, 8 Nov, 17:04).**
Site change: in `shared/lib/works.ts` (~line 1500) the appendix category's
`title` changes from 'Doubtful and Spurious Works' to 'Dubious and spurious
works', and B's `DIV` map uses the same string. Update the comment in
`app/src/pages/index.astro` (~354) to match. No other wording survives.
**Check (unit + gate):** the appendix category's `title` equals 'Dubious and
spurious works'; `git grep -i -E "doubtful and spurious|doubted and
spurious"` over `app/` and `shared/` (tests excluded) finds 0 hits; on the
built home page the last division head reads "Dubious and spurious works"
(the gate reads its text before CSS uppercasing: `textContent`), and on
`/MM/` the crumb reads "Works / Dubious and spurious works". Failing case:
the unit test fails on `origin/main` ('Doubtful and Spurious Works').

### 4.12 Access: targets, focus, contrast, keyboard

**R-A1. 40×40px minimum for every control (finding 2).** Every `a`, `button`,
`summary`, `input`, `select`, `[role=button]`, `[tabindex="0"]` not inside
running text has a box ≥ 40×40px. Running-text exceptions: Greek word tokens
and links inside reading text. Footnote marks keep their look but get a hit
area ≥ 40×40px (a transparent `::after`); B's `.b-ib`, `.b-x` (34px),
`.b-rh-b` (34px; 32px on phone), the language buttons (~32px), "Open all
books" (~22px), chapter links (~36px) all grow to 40px. **Check (gate):** on
home, a work page, a reader page (panel, Aa, contents open in turn), search,
a lemma page and credits, at D1440, S844 and P390: every such element's box ≥
40×40; for each footnote mark, `elementFromPoint` 18px left, right, above and
below its centre returns the mark. Prints the count examined. Failing case: a
34px `.b-ib` fails.

**R-A2. Visible focus everywhere (finding 9).** Inputs that set `outline:
none` (`.b-search input`, `.b-toc-go input`, `.b-sq-f input`) get an explicit
`:focus-visible` style that wins over the reset. **Check (gate):** Tab through
each page; every element that takes focus has, while focused, computed
`outline-style` ≠ `none` and `outline-width` ≥ 2px, or a `box-shadow` ≠
`none`. Failing case: the round-eight search box fails.

**R-A3. Contrast (finding 7).** Text under 24px (under 18.66px if weight ≥
700) has contrast ≥ 4.5:1 against its background; larger text ≥ 3:1; in both
themes. **Check (gate):** walk every text node's element on home, a work page,
a reader page, search, a lemma page and credits; compute the ratio from
computed `color` (with opacity) and the nearest opaque background. Prints the
count examined. Failing case: `.b-sub.sub-label` in `--red` at 14px (3.94:1)
fails.

**R-A4. Keyboard word lookup (finding 8).** One way in: the Greek text has a
single tab stop (roving `tabindex`: the first visible Greek word is `0`, all
others `-1`). On it: ArrowRight/ArrowLeft step a word (the live reader's word
stepping), Enter or Space opens the word panel on the focused word, Escape
closes it and returns focus to that word. Focus is visible (R-A2). Each word
token has `role="button"`. **Check (gate):** on EN I at D1440: Tab from the
head reaches a Greek word; ArrowRight twice moves focus two words on; Enter
opens the panel showing that word; Escape closes it and `document.activeElement`
is that word. The Greek text adds exactly one tab stop (count tab stops
before and after). Failing case: tokens without `tabindex` fail at step one.

### 4.13 No explainer text; empty states draw nothing

**R-E1.** In the reader: labels, refs, numbers and the texts only. Nothing
that tells the reader what to do or what a thing is. Remove from B: "In this
mockup …", the picker's "Each translation keeps its own Bekker numbers in the
margin.", "No analysis for this form." (draw the panel with the word and its
place only), the empty "Key passages" text. Elsewhere (finding 10): the home
line (decision 4) stays; the Ostwald chapter-title note appears only where the
data names the source of chapter titles. **Check (gate):** the built HTML of
every page contains none of: "In this mockup", "No analysis", "will appear
here", "keeps its own Bekker", "Tap any Greek word", "Click any Greek word"
(except the home line, R-H1). Also, on 20 sampled pages of each kind, no
heading is followed by an empty section. Failing case: each string, put back
in one page, is caught.

**R-E2. No toast or pop-up on first visit (John, 8 Nov, 16:54).** The live
reader shows one: `app/src/components/HelpButton.svelte` (used by
`ReaderShell.astro` line 268) sets `showTip` when `localStorage`
`ar-help-seen` is unset and draws `.reader-tip`, "💡 Click on any Greek word
to parse it and see its definition(s)!" with "More tips →" and "Got it". Remove
the tip: its markup, `showTip`, `dismissTip`, and its CSS. The Help modal
itself stays, opened only by the reader's own Help control. Add nothing like it
anywhere: no toast, hint, banner, cookie notice, install prompt or onboarding
pop-up that appears without the reader asking. **Check (gate):** in a fresh
browser context (empty storage) at D1440 and P390, load home, a work page
(`/Cat/`) and the reader (`/EN/book/1`); wait 3s after load; then (a) no
visible element matches `[role=status]`, `[role=alert]`, `[role=dialog]`,
`[aria-live]` with text, or `.reader-tip`; (b) every visible element with
computed `position: fixed` or `sticky` is on an allowlist (the reader head,
the site nav, the word panel and menus, all closed at load so absent). Prints
pages × viewports examined (6). Failing case: run it on `origin/main` built as
is; it must report `.reader-tip` on the reader at both sizes.

### 4.14 Build and deploy

**R-B1.** All of `CLAUDE.md`'s build and deploy invariants hold: app build
with `PUBLIC_SHOW_PRIVATE=0 npm run build` in `app/` on Node 22; full rebuild
`npm run build:public` passes its gates; link-integrity gate 0 broken; leak
check passes with its positive control; `/bonitz` 404 on live after deploy;
deploy only with `npm run deploy` (rehearse with `npm run deploy:dry`). Read
`DEPLOY-STATUS.md` before any deploy. Do not deploy without John's yes.
**Check:** the existing gates; the PR quotes each one's final line.

**R-B2.** `app/public` grows by the plates only (about 18 MB). **Check:** `du`
of `app/public/plates` reported in the PR; no other new binary in `app/public`.

**R-B3.** Existing tests stay green (`npm test` in `app/`, `npm run
test:scripts` at the root), and `npm run smoke` where it applies. A test you
change is changed because it was wrong, with the reason in the commit.

## 5. The check harness

- Write the gates as one Node script, `app/scripts/check-redesign.mjs`, that
  drives Playwright against `astro preview` of a built `app/dist` (never the
  dev server: R-C1). Resolve Playwright the way `app/scripts/shoot.mjs` does
  (local install, else the npx cache); add no dependency.
- Each gate prints `PASS <id> examined=<n>` or `FAIL <id> <what>`; it fails
  when `examined` is 0.
- Each gate has a `--prove <id>` mode that applies its failing case (a page
  fixture, an injected style, or a mutated copy of the data) and must exit
  non-zero. Run every `--prove` once before trusting the gates, and record the
  output in the PR.
- Unit checks (R-P1, R-P2, R-P3, R-K2, R-K3) are vitest tests under
  `app/src/__tests__/`. Write each one first and see it fail on `origin/main`.
- Generate `poster-golden.json` (R-T1) once from the kit with a script kept in
  `app/scripts/`; the kit is outside the repo, so the script takes the kit
  path as an argument and the golden file is committed.
- Svelte 5 tests: do not use `vi.resetModules()` (second runtime,
  `effect_orphan`); mock `lib/data` instead (CLAUDE.md).

## 6. Screenshot gates and the departures list

John, 8 Nov, 16:54: the build must look like the mockup. The reference is
round eight v59 (https://claude.ai/artifact/7Rf66bAjGSuMDrTLZwjbQL), built from
the kit with every switch at its default: in `kit/`, `python3 -I build.py --out
out/t --dirs b`. Shoot it with `node tools/shoot.cjs out/t/index.html <dir>
"<spec>"` (flags `@phone`, `@dark`, `@click=<selector>`; the sandbox blocks
`/tmp` output, so write inside the scratch folder). The kit draws 1440-wide and
390-wide frames only; for the reader held sideways the reference is the column
session's kit, which carries John's column rulings: build
`colw/kit` the same way and shoot with `node colw/shots.cjs <index.html> <dir>
<specfile>`, the spec file holding `colw/specs.json`'s entry `c6-844-fb`
(`"W": 844, "H": 390, "kind": "desktop", "col": "fb"`) and a copy of it with
`"word": true` for the panel open.

Shoot the site at the same sizes with `app/scripts/shoot.mjs` (or the harness)
against `astro preview` of the built `dist`. Name each file
`<gate>-site.png` and `<gate>-kit.png`, one folder per stage, outside the repo.

**The gates, by stage.** Each row is shot in light and dark.

| Stage | Gate | Site page | Size | Kit spec |
|---|---|---|---|---|
| 1 | G-HOME-D | `/` | D1440 | `b-home` |
| 1 | G-HOME-P | `/` | P390 | `b-home@phone` |
| 1 | G-HOME-S | `/` | S844 | `b-home@phone` (arrangement only; see D16) |
| 2 | G-WORK-D | `/Cat/`, `/EN/`, `/Int/`, `/AthPol/` | D1440 | `b-work:<id>` |
| 2 | G-WORK-P | the same four | P390 | `b-work:<id>@phone` |
| 2 | G-WORK-S | the same four | S844 | `b-work:<id>@phone` (arrangement only; see D16) |
| 2 | G-CREDITS-D | `/picture-credits/` | D1440 | `b-credits` |
| 3 | G-READ-D | `/EN/book/1`, Both; then a word open | D1440 | `b-reader`; `b-reader@click=.tok` |
| 3 | G-READ-P | `/EN/book/1`, Both; then a word open | P390 | `b-reader@phone`; `…@phone@click=.tok` |
| 3 | G-READ-S | `/EN/book/1`, Both; then a word open | S844 | `colw` spec above |
| 4 | G-SEARCH-D | `/search?q=ἀρετή` | D1440 | `b-search` |
| 4 | G-SEARCH-P | the same | P390 | `b-search@phone` |
| 5 | G-LEX-D | the lemma page for ἀρετή | D1440 | `b-lexicon` |
| 5 | G-LEX-P | the same | P390 | `b-lexicon@phone` |

For the work-page gates at D1440, also shoot at 1440×1400, where the poster
cap (R-T2) does not bite, so the poster compares like for like.

**How a gate passes.** A reviewer from a model family other than the
builder's gets each pair and this section, and nothing else of the builder's.
For every visible difference it answers: which departure below explains it,
or "drift". A gate passes when no difference is drift. The builder's own
"matches" does not count.

**Failing first.** Before a stage's gate counts, run it once with the site
side shot from `origin/main` built as is (the current live design). The
reviewer must report drift on every pair. A gate that passes the old design
proves nothing.

**The departures list.** These, and only these, are allowed differences from
the mockup. Anything else is drift.

| # | Departure | Why | Requirement |
|---|---|---|---|
| D1 | Controls are at least 40×40px (B's 32–36px buttons, "Open all books", chapter rows, footnote hit areas grow) | vision-impaired reader; finding 2 | R-A1 |
| D2 | Small red text is `--red-ink` (#b42419 light, #ff7b70 dark), not `--red` | contrast; finding 7 | R-F3, R-A3 |
| D3 | A visible focus ring on focused elements, inputs included | finding 9 | R-A2 |
| D4 | No explainer or empty-state text: no "In this mockup…", no "No analysis for this form", no empty "Key passages", no picker note | standing rule; finding 10 | R-E1 |
| D5 | The reader head does not name the Greek edition ("Greek: Bywater, 1894" is gone) | standing rule; finding 6 | R-R1 |
| D6 | The work-page poster is capped by screen height, so the plate may be smaller and the title re-fitted | finding 18 | R-T2 |
| D7 | Every mockup switch is gone and its chosen default is built in; the mockup's own bar and the dashed switch strip do not appear | settled decisions | §2 |
| D8 | Real content: the site's own works, books, chapters, translations, hits, lemma data, resume point; real links in place of `href="#"` | findings 4, 5, 11 | R-W2, R-K1, R-H3, R-S1, R-L2 |
| D9 | The Athenian Constitution sits under Ethics and politics; the appendix reads "Dubious and spurious works" | John | R-K2, R-K5 |
| D10 | Blurbs carry no book count; the Magna Moralia and Problemata lines are rewritten | John | R-K3 |
| D11 | Picture credits rows carry the holder's credit line and a working Record link | finding 14 | R-P3, R-K1 |
| D12 | In Both view at 701px and up, the Greek column wraps (hanging, numbered) when whole lines leave the English under 26em; the panel-open gap is 56px; Compare keeps clear of the panel; the Aa panel has a "Word panel" row on desktop | John's column rulings | R-R5–R-R10 |
| D13 | The reader head stays one row at every width | the 844 fault | R-R2 |
| D14 | The Greek text takes keyboard focus and shows it on the word | finding 8 | R-A4 |
| D15 | Live features B does not draw (for example the reader's existing Help control and print) keep their place, restyled in B's tokens | restyle, not rewrite | §1 |
| D16 | At 701–960px home and work pages take the phone poster layout, wider than the kit's 390px phone frame; the S844 gates compare arrangement (title above plate; bust beside title on home), not widths | John, Q4 | R-T5 |

A reviewer who finds a difference that fits no row reports it as drift, even
if it looks better.

## 7. Codex findings 1–19, mapped

| # | Finding | State | Requirement |
|---|---|---|---|
| 1 | Phone reader shrinks text | Fixed in kit | R-R4 (keeps it fixed) |
| 2 | Controls under 40px | Open | R-A1 |
| 3 | Landscape phone gets desktop layout | Settled (column rulings) + 844 head fault open | R-R2, R-R4–R-R9, R-T1 (real box width) |
| 4 | Every "Start reading" opens Ethics I | Mockup only | R-W2, R-W3 |
| 5 | Record link `href="#"` | Open | R-K1, R-H3 |
| 6 | Reader names the Greek edition | Open | R-R1 |
| 7 | Small red labels 3.94:1 | Open | R-F3, R-A3 |
| 8 | No keyboard way into word lookup | Open | R-A4 |
| 9 | Inputs set `outline: none` | Open | R-A2 |
| 10 | Explainer text and empty states | Open | R-E1, R-L2 |
| 11 | Search filters, lexicon links do nothing | Mockup only | R-S1, R-L2, R-H3 |
| 12 | `side` contradicted the renderer | Fixed (`place`) | R-P2 checks `place` |
| 13 | Prob has no date | Settled | R-P2 (ship `when` as given) |
| 14 | No holder credit line | Open | R-P3, R-K1 |
| 15 | Non-commercial undercounted | Moot; five | R-K1 checks all five render |
| 16 | Columns on EN and AthPol | Settled | none (ship as picked) |
| 17 | AthPol under Rhetoric and Poetics | Settled: move it | R-K2, R-H2, R-W1 |
| 18 | Posters push "Start reading" low | Open | R-T2 |
| 19 | B files alone don't reproduce the design | Open | §3 (shell list), §5 |

## 8. Not for the build

- The outline masks and `work/masks/*`; the shape picker's choices (John
  chose the rectangle everywhere).
- Every mockup switch: title face, title place, title size, phone home,
  headword face, subheads, home line, dark plates. Each is fixed (§2).
- Photographs, `CHALK`, `FINDS`, the Getty set, "Next photograph".
- `shell.html`'s data line, its overview, notes drawer and bar.
- Porting any of this to plato-reader or homer.
- Print layout (its own track: `docs/print-design-handoff.md`). The printed
  footer's "Greek text: <edition>" stays (R-R1).
- After the redesign ships: raise the Daily Nous pitch with John (memory:
  `daily-nous-outreach`). Not part of this build.

## 9. Open for John

None. John answered Q1–Q5 on 8 Nov at 17:04; the answers are in §2, item 9.
