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
titles on every poster, with thumbs up and down and a Photo switch, for John's
notes (round four's README, "Title options" to "Votes").
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

## Start here: B stays; which treatment?

John's answer (30 October): keep B and make its title legible, trying the
ways not yet built. The titles page now has Own colour, Strips and Above on
its Photo switch beside Pale, Gray and Dark (round four's README). Next: his
pick of treatment and setting, then fonts if he wants them. A subagent is
searching the Getty for CC0 gelatin silver prints (John: free of the brown
tones that swallow the red), into `gelatin-candidates.json` (not committed).

## Before that: was B still in the running?

The last session ended on John's doubt about B itself (30 October): "still
not sure this is the direction to go in (i'm wondering whether this is too
stylized and too 21st c aesthetic for aristotle...). Maybe if we vary text
color and opacity, we can make it more legible. and maybe different fonts?
idk."

Ask John before building more of B: keep B and make its title legible, make B
plainer, or go back to A or D. What is known:

- **The trouble.** The red (#e2382e at 82%) is as light as the prints' middle
  tones, so where they meet, the letters all but vanish. The median letter
  stands out from the photograph by 1.7 to 2:1 (WCAG asks 3:1 even for large
  text), and 30 to 39 of the 42 posters are hard to read: over a quarter of
  the letters' area below 2:1 (`titles-legibility.py`).
- **Colour and opacity (John's idea), measured** by `titles-colour.py` from
  the same pictures. The red at full strength still leaves 25 to 33 hard, so
  opacity alone does little. A colour picked per photograph does more: dark
  red (#8b1a10) on a light print and cream (#f4efe6) on a dark one leaves 4 to
  9 hard, but 18 to 32 of the 42 still have more than 5% of the letters' area
  below 2:1, because the ground under one title runs from light to dark. Even
  solid black leaves 7 or 8 hard.
- **Washes**, on the titles page now (Photo: Pale, Gray, Dark). Each leaves no
  poster with more than 5% of its letters below 2:1 (medians 3.3 to 4:1), but
  each dims the photographs a good deal. Claude's pick of the three: Gray.
  John's reply: "Hmm".
- **Offered, not built.** Wash only a strip behind each line of the title, and
  leave the rest of the photograph at full strength. Or set the title on
  plain ground above the photograph, so nothing covers it. Claude's view: the
  second may answer the "too 21st c" worry better than any wash, since it
  shows each photograph whole, with the title on the page, not on the print.
- **Fonts: not tried.** Sofia Sans is fixed in three places: `title-layout.js`
  (the `CAPW` cap widths that Now uses), `dir-b.js` (the same table) and
  `titles-page.html` (the Google Fonts link, and the canvas that measures the
  other six settings once the font is in). A new face needs its own widths,
  or a canvas measure for Now as well; then rerun `titles-check.cjs`, and
  `titles-legibility.cjs` (its masks come from the title alone, so they
  follow any face).

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

1. **B's poster title, if B stays.** John: "It should fill the picture. Not
   like the letters are so big they cover every inch, but rather we bump up
   the pt a bit and space out the words and play with kearning." And: "Let a
   word break and wrap." Seven settings are in `title-layout.js` (now; whole
   words: justified, stacked, stacked and spread; broken words: block, bigger
   block, block spread), all on the poster titles page, built by `titles.py`
   and checked by `titles-check.cjs`. Claude recommended the bigger block.
   John's notes lean to Now, Bigger block and Block spread, and against
   Stacked and Justified on the home page; on the spreads he is mixed ("Good"
   on the *Prior Analytics*' desktop poster; on *De Interpretatione* "Too
   much space between words" and "Can't read bottom word against pic"). His
   votes on titles (30 October): Bigger block and Block spread up on the
   *Generation and Corruption*'s desktop poster, Block spread up on its phone
   poster. Read the current set from the page's store (`ArtifactData`,
   `list`, collection `votes`; round four's README, "Votes"). Offered and
   waiting on his word: give Justified's under-filled lines the most spacing
   its rule allows; cap a spread's gap at one line's height. When John picks a
   setting and a way to make it legible, move the rule into `dir-b.js` (its
   `poster()` sizes titles from the `CAPW` table today; `TL.set` measures
   with a canvas, so it needs the font loaded before the first fit) and test
   it in `verify.cjs`. Then answer and resolve the titles page's threads: the
   15 sent to Claude are answered and stay open until then, as does the
   title thread on round four. Three were not sent to Claude (the
   *Posterior Analytics* eclipse, *De Interpretatione*'s bottom word, "This
   one is decent for mobile" on the home page) and only John can resolve
   them.
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
   II.8), not yet searched for; Mumler's spirit photograph for the
   *Sophistical Refutations*: "Don't get picture". Votes on photographs (30
   October): down for the *De Anima* (Asaishi, *Study of Light*), *On Length
   and Shortness of Life* (Watkins, *Grizzly Giant*), *Movement of Animals*
   (Conrad's bagpiper with marionettes) and *Metaphysics* (Rutherfurd's full
   moon); up for nine (GA, IA, Isa, Lin, Mech, Poet, Pol, Rhet, Somn).
5. Round three's "Good layout…" thread (lexicon, Key passages) was not sent
   to Claude, so it can only be resolved on the page.

## On John's Mac

The cloud sessions ran in a container; a local session needs:

- The branch:

  ```bash
  git fetch origin claude/determined-ramanujan-omeckq
  ```

  ```bash
  git switch claude/determined-ramanujan-omeckq
  ```

  If the main checkout is busy, use a worktree and run `npm ci --prefix app`
  in it.
- The gitignored files rebuilt (below): they hold TLG Greek or downloaded
  pictures, so git does not carry them. `prep.py --root build/dist` reads the
  Mac's own corpus build in place of the live site.
- Node 22 (`nvm use 22`; the Mac's system node is 24). The Python scripts
  need Pillow and numpy. `images.py` needs `SSL_CERT_FILE=/etc/ssl/cert.pem`:
  python.org's Python finds no certificates of its own.
- Playwright: the `.cjs` checks call `require('playwright')` and
  `chromium.launch()` with no options, as the container allowed. On the Mac,
  plato-reader's CLAUDE.md ("Headless browser") gives what works there:
  playwright-core and the Chromium headless shell in
  `~/Library/Caches/ms-playwright/`, passed as `executablePath`. Done on
  30 October without touching the checks: `playwright-core@1.62.1` in a
  scratch folder, beside a `node_modules/playwright/index.js` shim whose
  `chromium.launch` adds the headless shell's `executablePath`
  (`chromium_headless_shell-1228`), and `NODE_PATH` pointing at that
  folder. On the Mac `titles-check.cjs` passes; `verify.cjs` fails 14
  checks, all A's phone reader with Bekker numbers outside the page, which
  passed in the container (a font difference, not yet looked into).
- The artifacts: update each by its URL, reading it first. `ArtifactData` and
  `ArtifactComments` read the votes and the comments; without those tools,
  the titles page's own tally shows the votes and the comments are on the
  pages.

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
python3 docs/mockups/2026-10-30-round-four/titles-colour.py
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
