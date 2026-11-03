# Round six kit: one direction module per designer

The Aristotle Reader is a bilingual Greek/English reading site for the complete
works of Aristotle (41 works, live at aristotle.johnhboyer.com). Its owner,
John H. Boyer, reviews redesign proposals as clickable mockups ("rounds"). Each
round shows every direction on the same six pages, at desktop (1440 wide) and
phone (390 wide) side by side, on the site's real data: the Greek of
Nicomachean Ethics Book I, four English translations, real parses, real LSJ
entries, a real search for ἀρετή, a real lexicon page for ἀρετή.

You build ONE direction as a module that plugs into this mockup.

## Files

- `shell.html` — the mockup: its own grey chrome (bar, overview, stage), the
  data (`window.DATA`, one 1.5 MB line — never print it whole), the shared
  code (`window.U` helpers, routing, panes, word sidebar model, events). Do not
  edit it; if it truly blocks you, say so in your final report.
- `ref/dir-b.css`, `ref/dir-b.js`, `ref/notes-b.js` — round five's direction B
  ("Poster"), a complete working module. Read it first: it is the reference
  for every function and data helper you need. Do not copy its look.
- `dirs/<k>/` — YOUR module (k is your letter): `style.css`, `script.js`,
  `notes.js`, `img/` (optional), `concept.md`.
- `build.py` — assembles shell + modules into a test page.
- `tools/shoot.cjs`, `tools/walk.cjs`, `tools/errs.cjs` — Playwright checks.

## Build and look

```
cd <kit>
python3 build.py --out out/<k> --dirs <k>            # your direction alone
python3 build.py --out out/<k>b --dirs <k> --ref-b   # yours beside round five's B
node tools/walk.cjs out/<k>/index.html <k>           # errors, failed loads, sideways overflow, every page, both themes
node tools/shoot.cjs out/<k>/index.html out/<k>/shots "<k>-home@max=2600" "<k>-work:EN@max=2600" "<k>-reader@max=1600" "<k>-search@max=1400" "<k>-lexicon@max=1400" "<k>-home@phone@max=2400" "<k>-reader@phone@max=1600" "<k>-work:Cat@phone@max=1800" "<k>-home@dark@max=1200"
```
Then Read the PNGs to see them. Chromium and Playwright are preinstalled
(`require('playwright')` works; never run `playwright install`). Hash routes:
`<k>-home`, `<k>-work` (Ethics) or `<k>-work:<ID>`, `<k>-reader`,
`<k>-search`, `<k>-lexicon`, `overview`.

## The module contract

`style.css`: every rule scoped under `.frame.dir-<k>` (light) and
`.frame.dir-<k>.dark` (dark: the frame gets class `dark`). Phone layout inside
`@container mock (max-width: 700px) { … }` — the panes are container queries,
not media queries. The file may begin with ONE `@import url('https://fonts.googleapis.com/css2?…&display=swap');`
(Google Fonts is the only font host allowed; give each face a fallback). Set
colours as custom properties on `.frame.dir-<k>` and override them on
`.frame.dir-<k>.dark`. Respect `prefers-reduced-motion`.

`script.js`: one IIFE that sets `window.T.<k> = { … }`:

| key | called | returns / does |
|---|---|---|
| `home(S, P)` | render | HTML for the home page |
| `work(S, P)` | render | HTML for the work page of `U.work(S.workId)` |
| `reader(S, P)` | render | the reader's frame: an element with `data-body`, a sticky head with `data-sticky`, and a `<main data-text>` that the shell fills with `text()` |
| `text(S, P)` | after reader, on view/translation change | the reading text: book opening, chapter heads, rows of Greek (`U.lineHTML`) and English (`U.engHTML`) |
| `side(S, P)` | when a Greek word is clicked | the word sidebar (`U.cards(S.word.k)`, `U.longParse`, `U.t8(lsj)` for the LSJ entry) |
| `panel(S, P)` | when `P.ui.panel` is `toc`, `book`, `picker` or `aa` | the contents drawer, book menu, translation picker, text settings |
| `note(S, P)` | when `P.ui.fn` is set | a footnote popup (`U.footnote(P.ui.fn)`) |
| `hp` | after reader render | `{ name: (S, P) => html }` fills `[data-hp="name"]` |
| `search(S, P)`, `lexicon(S, P)` | render | those pages |
| `after(S, P)` | optional, after every render | e.g. fit type to a measured width |
| `fitText(P)` | optional, after each text fill | same, for the reader |
| `tick(S, P)` | optional, on scroll | live position updates |
| `act(S, a, v, el, e, P)` | optional | your own `data-act="a:v"` actions |
| `keepPanelOnTrans` | flag | keep a menu open after choosing a translation |

`notes.js`: `window.NOTES = window.NOTES || {}; window.NOTES.<k> = { name, idea, pages: { home, work, reader, search, lexicon }, type, images, risk, tries: { … } };`
`name` is the direction's short name (one or two words) shown on the switch.

Attributes the shell already handles (use them, as B does):
`data-go="home" | "work:<ID>" | "reader" | "reader:<cite>" | "reader:greek" | "reader:compare" | "reader:<translationId>" | "search" | "lexicon:<slug>"`;
`data-act="view:greek|both|english"`, `"trans:<id>"`, `"cmp:<id>|off"`,
`"panel:toc|book|picker|aa"`, `"close:word|fn|panel"`, `"card:<id>"` (LSJ
toggle), `"fn:<n.n>"`, `"ch:<n>"`, `"books:open|close"`, `"step:-1|1"`,
`"reset"`, `"theme"`, `"msg:book"`, `"hero"`; inputs `data-jump` (inside
`data-jump-host`, message in `data-jump-msg`), `data-search`,
`data-range="fs|lh|cw"`; live fields `data-here`, `data-here-ch`,
`data-here-title`, `data-ch-link`. The reader body (`[data-body]`) gets
`data-view`, class `word-open` while the sidebar is open, class `cmp` when two
translations are shown, and CSS variables `--fs --lh --cw` (text size, line
height, column width). Classes the shell sets in the text: `.tok` (a Greek word;
`.tok.on` the open one; `.tok.hit` a search hit), `.bk` (an English Bekker
tick; `.bk.approx` estimated), `.fn` (footnote button), `.target` (jump target).

Helpers on `window.U` (see `shell.html` and B for use): `esc fmt ROMAN GNUM
caps fold`, `W` (all 41 works), `work(id)`, `divisions()`, `divisionOf(id)`,
`workBooks(id)` (books → chapters, Ostwald's titles for the Ethics),
`extent(w)`, `transParts(t)`, `further(id)` (books in print), `bookSpan`,
`BLOCKS` (Book I, split by chapter), `lineHTML(bk, L)`, `engHTML(bk, tid)`,
`readerTrans(S)`, `TITLES` (Book I chapter titles), `chapterList()`,
`bookList()`, `cards(key)`, `longParse`, `t8(lsjKey)`, `lemmaPage(slug)`,
`ALPHA`, `search` (the ἀρετή results), `hitWindow`, `engAt`, `footnote`,
`EN_TRANS`, `trans(id)`, `RESUME`, `START`, `HERO`, `PH` (round two's Getty
photo metadata), `KEY`, `KEY_GR`, `KEY_EN` (a key Greek word per work, from
round two). Work fields: `id title greekTitle blurb books bookLabels
translations defaultTranslation greekSource authenticity spans commentaries`.

## What every direction must do (John's standing rules)

- Every work on the home page; every work has its own page.
- Chapters lead: a work page lists every chapter (titles where the site has
  them); books are collapsible and closed by default ("These books need to be
  collapsible"). Bekker numbers stay in the margins; they are not design.
- Reader: Greek and English side by side, on the phone too ("The alternating
  Greek then English simply doesn't work here"); each keeps its own Bekker
  numbers in its margin. Greek / Both / English, compare two translations,
  footnotes, text size and width, contents drawer, jump to a Bekker line.
- Click a Greek word: its parse opens in a sidebar on the right; on a phone it
  comes up from the bottom. The LSJ entry is Grammata's module, shown in one
  neutral setting (`U.t8`), never restyled beyond inheriting colour.
- The site's menu marks the current page in every direction.
- A work page lists its translations once.
- Light and dark, both designed.
- No pictures in the reader. At most one picture on the home page. Search and
  the lexicon need none.
- Nothing gimmicky: no diagrams of doctrine, no charts, bars, timelines or
  data graphics, no novelty interactions, no animation beyond the quiet.
- Greek must be set in a face with full polytonic Greek (check the Google
  Fonts CSS has the `greek-ext` subset, U+1F00–1FFF). John dislikes EB
  Garamond's Greek.

Write all interface copy and notes in plain English: short words, active
voice, no stock phrases, no mannered asides.

## Variants (round seven)

A direction may offer variants, shown on a dashed switch in the mockup's bar
(key `v` cycles them). Declare them in `notes.js`:

```js
window.NOTES.p = { name: '…', variants: [{ id: 'green', label: 'Green' }, { id: 'red', label: 'Red' }], … };
```

The first is the default. The frame gets the class `var-<id>`
(`.frame.dir-p.var-red`), and `U.variant('p')` returns the current id in a
template. Changing variant re-renders the page. Hash routes carry a non-default
variant as `~id` (`p-work:Meta~red`), and overview links may too
(`data-open="h-work:APo~early"`).
