# Round four, 30 October 2026

Round three with John's notes on it applied. Published as a Claude artifact:
https://claude.ai/artifact/PNuw2yLEayHuLAn7FjivTn. Round three, with the notes on it:
https://claude.ai/artifact/8svNwSXYLPBHZSfaKiSjuJ (`../2026-10-30-round-three`).

## The notes and what changed

- **B work page**: "This picture doesn't work for the title layout. It's too
  small and the title only partly overlaps it. I think landscape oriented
  photos work best like on the homepage. But the vertical image does work
  better on mobile. I think I'll want to review all the photos first if we
  pick this direction. Maybe (if we use b) we have different ones for mobile
  (portrait vertical) and desktop (landscape horizontal)." Every B poster, on
  the home page and on each work page, runs across the page at the home
  page's size (1440 by 600 on a desktop, 390 by 488 on a phone), and a work's
  details come below it. Each work's photograph is cut twice by hand: wide for
  a desktop (2.4 to 1) and tall for a phone (4 to 5). `picks.json` holds both
  crops as fractions of the Getty image; `images.py` has the Getty's IIIF
  server cut each region from the full-size original, so the photographs that
  were soft in round three are sharp. Only one original, Duchenne's frowning
  man for the *Physiognomics*, is too small for a sharp desktop poster. On the
  site one `<picture>` would hold both cuts; a work can take a second
  photograph for either shape instead of a cut.
- **Reader on a phone, all directions**: "The alternating Greek then English
  simply doesn't work here for Aristotle. Needs to be parallel columns (or at
  least until we finish with matching sentences so we can do interlinear mode
  as alternative)." Greek and English side by side on a phone, each with its
  own Bekker numbers (the Greek's in the left margin, a column's label above
  its first line; the English's in the right margin). Compare stacks the
  second translation under the first, beside the Greek; English only sets the
  two translations side by side.
- **Menus, all directions**: "Nice subtle way to highlight the current page.
  Have this feature on each option (i.e., accent color; italics only if it
  fits the style)." The current page in the accent colour; italic in D only
  (A's Commissioner has no italic; B's sans stays upright). Work pages mark
  Works.
- **Work pages, all directions**: "Don't we have this at the top of the page
  too?" Translations are listed once, in the facts at the top, and each name
  opens that translation. The separate Translations list and the repeat in the
  credits are gone.
- **D lexicon**: "Don't like this font at all" (the ἀρετή headword). D's Greek
  is Gentium Book Plus everywhere, scaled to EB Garamond's x-height
  (`font-size-adjust`). EB Garamond stays for English and the logo ("I like
  this logo").
- **D search**: "Text seems too big?" Smaller hits: Greek 19px, English 17px.
- **D work page**: "Not sure about the photo being sticky with scrolling." The
  Aldine page scrolls with the text, here and on the home page.
- **D on a phone**: "Too much space for the photo here on mobile" (home) and
  "Doesn't work on mobile. Maybe a landscape crop that acts like a banner?"
  (work page). Each Aldine picture gives way to a banner cut from the top of
  its detail: the woodcut headpiece and the title.
- **Noted, not changed**: A's word blocks on the phone's home page ("This works
  on desktop. Not on mobile. Hmm. Note that. Don't change yet.") and on work
  pages ("Not loving this on works pages. I dunno").
- The notes on the Greek font and on text size are taken to be about D's
  lexicon and search pages: John left them in the same minute as his note on
  D's logo, and B's lexicon sets its headword in Literata. If they were B's,
  B's Greek face and search sizes are the ones to change.

## Checks

`verify.cjs` (1,346 checks) adds, each with a planted fault that must fail
first:

- every B poster in both panes: the page's full width, 600 or 488 high, the
  photograph filling it, the wide cut on a desktop and the tall cut on a
  phone, the title inside the photograph, a work's details below it;
- one link per translation on every work page in every direction, and no
  Translations heading;
- the menu in every direction, page and theme: one current page, the right
  one, in the accent colour, italic only in D;
- the phone reader in every direction: Greek and English side by side, both
  columns at least 120px wide, every Bekker number inside the page; compare
  stacked; English only side by side;
- D: no sticky picture; a banner on the phone; every Greek element in Gentium
  Book Plus, and the font loaded.

## Title options (after round four)

John on round four's posters: "I think title could to be bigger. It should
fill the picture. Not like the letters are so big they cover every inch, but
rather we bump up the pt a bit and space out the words and play with
kearning. Generate a few options in chat." Then: "Let a word break and wrap."

`title-layout.js` holds seven settings for a poster title: now (round
four's); whole words (justified, stacked, stacked and spread); and words
breaking between letters, three letters a side at least (block, bigger block,
block spread). Two things use it:

- `titles.py` builds `titles.html`: every setting on every poster (the home
  page and the 41 works), desktop and phone, for John to browse and annotate.
  Published as https://claude.ai/artifact/BVfg5CkJbG8zJmjXHEXPuq.
  `titles-check.cjs` (2,206 checks, each kind with a planted fault first)
  holds it to: every setting on every poster with both photographs; each
  title inside its poster, each line ending where the rule measured it, a
  block's lines meeting both edges, broken words keeping three letters a
  side; every title set exactly as round four's mockup sets it (1,176
  comparisons with `test.html`); the controls, a phone's width and both
  themes.
- `title-options.cjs` sets the same rules on the mockup's own posters and
  saves pictures, which `title-sheets.py` lays out as the sheets sent in chat
  (in `title-options/`, gitignored).

A title on one line (*Categories*, *Politics*) sits in the middle of the
photograph, top to bottom, in every setting but Now. John, on the titles page:
"Center the text on the vertical access." A spread needs two lines. John has
not picked a setting yet; the open item is in `HANDOFF-REDESIGN.md` at the
repo root.

## Rebuild

As round two (`../2026-10-30-round-two/README.md`), from this folder:

```bash
python3 docs/mockups/2026-10-30-round-four/images.py
```

```bash
python3 docs/mockups/2026-10-30-round-four/build.py
```

```bash
cd docs/mockups/2026-10-30-round-four && python3 -m http.server 8765
```

```bash
node docs/mockups/2026-10-30-round-four/verify.cjs
```

```bash
python3 docs/mockups/2026-10-30-round-four/titles.py
```

```bash
node docs/mockups/2026-10-30-round-four/titles-check.cjs
```

```bash
node docs/mockups/2026-10-30-round-four/title-options.cjs
```

```bash
python3 docs/mockups/2026-10-30-round-four/title-sheets.py
```

`index.html`, `test.html`, `titles.html`, `titles-test.html`, `img/`,
`img-src/` and `title-options/` are gitignored.
