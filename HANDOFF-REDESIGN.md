# Handoff: site redesign mockups

The track: design directions for a full redesign of aristotle.johnhboyer.com,
drawn as Claude artifacts with a desktop pane (1440) and a phone pane (390)
side by side. Mockups only: nothing here touches `app/`, and nothing is
deployed. Work is on the branch `claude/determined-ramanujan-omeckq`, one
folder per round under `docs/mockups/`.

## Where things stand (30 October 2026)

| Round | Folder | Artifact |
| --- | --- | --- |
| 1 | `2026-10-29-directions` | https://claude.ai/artifact/7nbtgk2xUiX1TKk3Ex8y3S |
| 2 | `2026-10-30-round-two` | https://claude.ai/artifact/FpxinJwQa35j2SdAgAy7HN |
| 3 | `2026-10-30-round-three` | https://claude.ai/artifact/8svNwSXYLPBHZSfaKiSjuJ |
| 4 | `2026-10-30-round-four` | https://claude.ai/artifact/PNuw2yLEayHuLAn7FjivTn |
| Poster titles | `2026-10-30-round-four/titles.html` | https://claude.ai/artifact/BVfg5CkJbG8zJmjXHEXPuq |

Each round's README lists John's notes on the round before and what changed.
The poster titles page is not a round: it shows seven settings for B's poster
titles on every poster, for John's notes (round four's README, "Title
options").
John leaves his notes as comments on the artifacts. Each new round has been a
new artifact, so the earlier one keeps its notes.

Three directions are left:

- **A Capitals**: the Plato Reader's sibling. Each work is announced by its
  key word in Greek capitals on a letter grid. Gentium Book Plus and
  Commissioner, malachite on limestone.
- **B Poster**: "B is in running." One early photograph (Getty, CC0) on the
  home page and one on each work page, with the title over it in large
  semi-opaque red capitals, the style John picked from a sample. Sofia Sans
  and Literata. No pictures anywhere else.
- **D Aldine**: each work beside its first printing (Aldus, Venice 1495–98,
  Boston Public Library copy, Public Domain Mark). EB Garamond, with Greek in
  Gentium Book Plus. John likes D's logo.

C (diagrams) was dropped: "No diagrams. Too gimmicky."

## Decided by John

- No LLM tropes: no huge hero with one italic word, no excess explanatory
  text, no rounded cards, no eyebrow text. Nothing gimmicky, no skeuomorphism.
- Keep every feature. Parsing and the dictionary open in a sidebar (a bottom
  sheet on a phone). Every work keeps its own page.
- The Greek is the site's TLG text. Greek and English each keep their Bekker
  numbers, but chapters matter more than Bekker numbers, and Bekker numbers are
  not a design element.
- No pictures in the reader, search or the lexicon. Few photographs: one on
  B's home page, not one per work.
- A work's books collapse (closed by default, Open all and Close all).
- On a phone the reader sets Greek and English in parallel columns, until
  matched sentences allow an interlinear view.
- B: wide photograph on a desktop, tall on a phone. Each work's photograph is
  now cut twice by hand (`picks.json`). John reviews every photograph if B
  goes ahead, and may want different photographs for the two shapes.
- The menu marks the current page in the accent colour, in italic only where
  the style takes it (D).
- A work page lists its translations once.
- B's poster titles: a title on one line sits in the middle of the photograph,
  top to bottom ("Center the text on the vertical access", on the titles
  page). Every new setting does this; Now stays as round four set it.
- D: Gentium Book Plus for Greek; the Aldine page does not stick on scroll; on a
  phone it is a banner cut from the top of the page.

## Open

1. **B's poster title.** John: "It should fill the picture. Not like the
   letters are so big they cover every inch, but rather we bump up the pt a
   bit and space out the words and play with kearning." And: "Let a word break
   and wrap." Seven settings are in `title-layout.js` (now; whole words:
   justified, stacked, stacked and spread; broken words: block, bigger block,
   block spread). John asked for them all on one page to browse and annotate:
   the poster titles page above, built by `titles.py` and checked by
   `titles-check.cjs`. His notes arrive as comments on it, and since 30
   October as thumbs up or down on each poster and photograph, kept in the
   page's store: read them with `ArtifactData` (`list`, collection `votes`;
   round four's README, "Votes"). Claude recommended the bigger block.
   Readability: John found that many photographs, good picks or bad, fight
   the title. Measured, the red at 82% over full-strength prints stands out
   by about 1.7:1; the page's Photo switch (Pale, Gray, Dark washes) brings
   every poster to about 3.3 to 4:1 (README, "Legibility and photo
   treatments"). Which treatment, if any, is John's call. When John picks, move the rule into `dir-b.js` (its
   `poster()` sizes titles from the `CAPW` table today; `TL.set` measures
   with a canvas, so it needs the font loaded before the first fit) and test
   it in `verify.cjs`. The thread on round four stays open until then.
2. **A's word blocks.** On the phone's home page: "This works on desktop. Not
   on mobile. Hmm. Note that. Don't change yet." On work pages: "Not loving
   this on works pages. I dunno." The second thread on round three is open.
3. **Notes on font and size read as D's.** "Don't like this font at all" (the
   ἀρετή headword) and "Text seems too big?" (search) were taken to be about
   D's lexicon and search pages, since John left them in the same minute as
   his note on D's logo. If he meant B's, change B's Greek (Literata) and its
   search sizes instead.
4. **B's photographs.** Some pairings are loose (Edinburgh Ale for the
   *Eudemian Ethics*). Duchenne's frowning man (*Physiognomics*) is too small
   for a sharp desktop poster. John's notes so far, on the titles page: the
   *Topics* keeps Muybridge's *Fencing* ("Good photo choice"), its desktop
   cut now two frames of the top row ("zoom in more so it's clear it's
   fencers"); the *Categories* horse is "okay"; the *Posterior Analytics*
   might take an eclipse instead of Le Gray's troops ("I get the 2.19
   allusion though"), the book's stock example of a demonstration (II.2,
   II.8). Not yet searched for. Votes on the titles page (30 October): down
   for the *De Anima* (Asaishi, *Study of Light*), *On Length and Shortness
   of Life* (Watkins, *Grizzly Giant*), *Movement of Animals* (Conrad's
   bagpiper with marionettes) and *Metaphysics* (Rutherfurd's full moon); up
   for nine others. Read the current set from the page's store.
5. Round three's "Good layout…" thread (lexicon, Key passages) was not sent
   to Claude, so it can only be resolved on the page.

## Rebuild a round (round four shown)

The mockups run on the site's own data. Round one's `prep.py` builds
`data.json` (fetched from the live site by default; `--root build/dist` reads
a local build). Every later round reads that file.

```bash
npm ci --prefix app
```

```bash
node docs/mockups/2026-10-29-directions/export-registry.mjs
```

```bash
python3 docs/mockups/2026-10-29-directions/prep.py
```

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
node docs/mockups/2026-10-30-round-four/title-options.cjs
```

```bash
python3 docs/mockups/2026-10-30-round-four/title-sheets.py
```

## Rules and gotchas

- `data.json`, `index.html` and `test.html` hold the site's TLG Greek: they are
  gitignored and never committed. So are `img/`, `img-src/`,
  `title-options/`, `title-legibility/`, and the built titles page
  (`titles.html`, `titles-test.html`).
- Verify functionally: `verify.cjs` (1,346 checks in round four) and
  `titles-check.cjs` (2,302) plant a fault for each new check and stop if the
  check misses it.
- The test scripts are `.cjs` because the repo's `package.json` sets
  `"type": "module"`. `build.py` also writes `test.html` with a doctype and a
  charset, which Playwright needs; the published page has neither.
- To publish, give the Artifact tool `index.html` with the pictures as
  `files` and `root` set to the round's folder. To update round four in place
  from another session, pass its URL and read it first. The titles page is
  published the same way: `titles.html`, with `img/desk/*.jpg` and
  `img/phone/*.jpg` as `files`. It declares the `db` capability (rule:
  `votes` read by viewers, written by the owner) and `user`; a republish
  leaves `capabilities` out so the stored declaration and John's votes
  stay.
- `titles-check.cjs` compares the titles page with the mockup's `test.html`,
  so run `build.py` before it.
- Pictures: Getty Open Content (CC0) and the Boston Public Library's Aldine
  volumes at the Internet Archive (Public Domain Mark). Getty's IIIF server
  refuses `!w,h` sizes larger than a small original (400); `images.py` then
  asks for `max`.
- Interface copy and captions are drafts until John approves them.
