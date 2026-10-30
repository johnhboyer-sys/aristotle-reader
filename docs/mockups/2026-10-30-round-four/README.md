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
  were soft in round three are sharp. On the
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
  page and the 41 works), desktop and phone, grouped by work, for John to
  browse, annotate and vote on. Published as
  https://claude.ai/artifact/BVfg5CkJbG8zJmjXHEXPuq.
  `titles-check.cjs` (2,302 checks, each kind with a planted fault first)
  holds it to: every setting on every poster with both photographs; each
  title inside its poster, each line ending where the rule measured it, a
  block's lines meeting both edges, broken words keeping three letters a
  side; every title set exactly as round four's mockup sets it (1,176
  comparisons with `test.html`); the controls, what they hide off the page;
  the photo treatments; the votes; a late font; a phone's width and both
  themes.
- `title-options.cjs` sets the same rules on the mockup's own posters and
  saves pictures, which `title-sheets.py` lays out as the sheets sent in chat
  (in `title-options/`, gitignored).

A title on one line (*Categories*, *Politics*) sits in the middle of the
photograph, top to bottom, in every setting but Now. John, on the titles page:
"Center the text on the vertical access." A spread needs two lines. John has
not picked a setting yet; the open item is in `HANDOFF-REDESIGN.md` at the
repo root.

### Legibility and photo treatments

John: "A lot of these, whether good or bad picks, don't work well with the
title style in terms of readability…" The red sits in the same middle range
of tone as most of these albumen prints, so where they meet the letters all
but vanish, and the see-through letters let the photograph's detail in.
`titles-legibility.cjs` shoots every poster in Now and Bigger block, desktop
and phone, under each treatment, three ways (as shown, without its title, and
its title alone on plain ground); `titles-legibility.py` takes, for each
pixel inside the letters, the WCAG contrast between the poster as shown and
the photograph behind. As round four sets them, the median letter stands out
by 1.7 to 2:1 (WCAG asks 3:1 even for large text), and 35 to 41 of the 42
posters have more than 5% of their letters' area below 2:1.

The page's Photo switch lays a wash between photograph and title: Pale (60%
toward the page's light ground, the title in B's darker red), Gray (the
same, the photograph in gray) and Dark (70% toward the dark ground, the title
in the brighter red). Each strength is the lightest under which no poster has
more than 5% of its letters' area below 2:1 (a model of the washes, checked
against the screenshots, put the cliff at 55% and 65%); the medians rise to
3.3 to 4:1.

John then asked whether the title's colour and opacity could do this
instead. `titles-colour.py` answers from the same pictures, with no new
shots: a solid letter shows its own colour, so only the photograph behind it
counts. Opacity alone does little: the red at full strength leaves 25 to 33
of the 42 posters hard to read (over a quarter of the letters' area below
2:1), against 30 to 39 at 82%, since the red is as light as the prints'
middle tones. A colour picked per photograph does more: dark red (#8b1a10)
on a light print and cream (#f4efe6) on a dark one leaves 4 to 9 hard, but
18 to 32 still have more than 5% of the letters' area below 2:1, because the
ground under one title runs from light to dark. Solid black leaves 7 or 8
hard; the washes leave none. The script's first row, the page as it is,
checks its model against the shots: the counts agree to within one poster.

John then asked whether B stays in the running (30 October): he chose to
keep it and make its title legible, and to see the ways not yet built. The
Photo switch now has three more, each leaving the photograph at full
strength. **Own colour**: no wash, the title solid in dark red or cream,
whichever stands at 2:1 or better against more of that cut's pixels
(`titles.py` picks it from `img/`; cream wins on 26 desktop cuts and 25
phone cuts of 42). **Strips**: the Pale wash and its darker red, behind
each line of the title only. **Above**: the title on the page above the
photograph, which shows whole; spreads and middles start at the top there.
Fonts are still untried. `titles-check.cjs` (2,438 checks) holds each to
its rule, with a planted fault first.

### Gelatin silver prints

John: "perhaps gelatin silver prints would be better, as those are generally
free of brown tones". `gelatin-candidates.json` lists 48 Getty CC0 candidates
for 26 works (a search, five spot-checked against the Getty's records).
`gelatin.py` builds `gelatin.html`, published as
https://claude.ai/artifact/XizpnWAJ6xtsoVPtpcX7MJ: each work's present
photograph, then each candidate as a desktop poster, a phone poster, and the
whole print, under round four's red title, with one thumbs up and down per
candidate. `gelatin-cuts.json` holds each cut's box and focus, set by eye from
gridded sheets and checked on sheets of the results; a stereograph's box is
its left half. Votes are in the artifact's store, collection `votes`,
documents `c:<work>:<n>`, n being the candidate's place in its work's list.
`gelatin-check.cjs` holds the page to its rules, with a planted fault first.
The local server drops connections under load, so it gives a picture a second
try. Six works are not on the page because they already use gelatin silver
(APr, Phys, GC, GA, EN, Lin); nine have no candidate (Sens, Somn, Insomn,
DivSomn, Pol, Rhet, Col, Aud, VV).

John's votes (30 October): ten of these went into `picks.json` and
`photos.json`, with their citations checked against the site's Greek and
their captions rewritten to fit: DA Bruguière, Long the redwood (his pick of
two), Meta the comet, EE Fleckenstein, Phgn Dmitriev, MXG Stieglitz, Mirab
Gleason, Vent Fleckenstein, Oec Hine, Mech Hine's power house. The others keep
their photographs while he double-checks them; he said Topics' is fine.
Measured under the red title as it stands (a model on the title's shape, as
`titles-colour.py` models it; the full `titles-legibility.cjs` ran out of disk
on the Mac): six got easier to read, Meta most (median 1.5 to 2.9:1), and four
got harder (EE, Phgn, Mirab, Vent). Over all 41 works, 37 desktop and 33 phone
posters still have more than 5% of their letters below 2:1. Gelatin silver
alone does not make the title legible; a treatment is still needed.

### Votes

John: "Add thumbs up and thumbs down selectors for each option. And have a
thumbs up down on photo for each." Every desktop and phone poster in every
setting has thumbs up and down under it, and each work's photograph has a pair
beside a line naming it and saying why it was chosen; a tally per setting sits
at the top. A second click on a thumb takes the vote back. The votes live in
the artifact's own store (the `db` capability), collection `votes`, one
document per poster or photograph: `t:<setting>--<work>:<desk|phone>` or
`p:<work>`, with `vote` up or down. Only the page's owner writes there;
everyone who can open the page reads. Read them with the `ArtifactData` tool
(`list`, collection `votes`, the artifact's URL). Locally `titles-check.cjs`
stands in for the store (`STUB`), and `titles-test.html` carries the publish
skeleton's reset, whose `[hidden]` rule the page also sets itself.

The page waits 4 seconds for Sofia Sans, sets the titles with a stand-in
face, and sets them all again when the font arrives (a late font once left
titles measured in the wrong face); `titles-check.cjs` holds the font back
7 seconds to test it.

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
node docs/mockups/2026-10-30-round-four/titles-legibility.cjs
```

```bash
python3 docs/mockups/2026-10-30-round-four/titles-legibility.py
```

```bash
python3 docs/mockups/2026-10-30-round-four/titles-colour.py
```

```bash
node docs/mockups/2026-10-30-round-four/title-options.cjs
```

```bash
python3 docs/mockups/2026-10-30-round-four/title-sheets.py
```

```bash
SSL_CERT_FILE=/etc/ssl/cert.pem python3 docs/mockups/2026-10-30-round-four/gelatin.py
```

```bash
node docs/mockups/2026-10-30-round-four/gelatin-check.cjs
```

`index.html`, `test.html`, `titles.html`, `titles-test.html`, `gelatin.html`, `gelatin-test.html`, `img/`,
`img-src/`, `title-options/` and `title-legibility/` are gitignored.
