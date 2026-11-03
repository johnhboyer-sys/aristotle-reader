# HANDOFF: site redesign (mockup rounds)

Updated 2026-11-03. This track is the redesign John reviews as clickable
mockups ("rounds"), published as private claude.ai artifacts. It has never
touched the site's code: nothing in `app/`, `pipeline/` or `shared/` changed.
The work lives in the artifacts and in a mockup kit (see "The kit" below).

## Where things are

| What | Link |
|---|---|
| **Round seven (current), version 11** | https://claude.ai/artifact/RtrrFk4cPQDh7mrjUyqcZh |
| Poster title faces (B's faces, with Yes/No picks) | https://claude.ai/artifact/3Q1LLCvfpNvuB3eCgRVhwu |
| Round six (E, F, G, H early) | https://claude.ai/artifact/MkNU79qNssQ7Pco5TKomvj |
| Round five (B alone) | https://claude.ai/artifact/4JKoRv15wqC1mSFfFcmMmz |
| Round four | https://claude.ai/artifact/PNuw2yLEayHuLAn7FjivTn |
| Round three | https://claude.ai/artifact/8svNwSXYLPBHZSfaKiSjuJ |
| Round two | https://claude.ai/artifact/FpxinJwQa35j2SdAgAy7HN |
| Round one | https://claude.ai/artifact/7nbtgk2xUiX1TKk3Ex8y3S |
| Poster titles (round four study) | https://claude.ai/artifact/BVfg5CkJbG8zJmjXHEXPuq |
| Gelatin silver prints (round four study) | https://claude.ai/artifact/XizpnWAJ6xtsoVPtpcX7MJ |

Each round shows every direction on the same six pages (home, a work, reader,
search, lexicon, overview) at desktop 1440 and phone 390 side by side, on real
data: Nicomachean Ethics Book I in Greek with four translations, real parses
and LSJ entries, a real search for ἀρετή.

## Round seven: the four directions as they stand

Dashed switches in the mockup's bar show each direction's versions. Keys: 1–4
pick a direction, v flips the first switch, f steps through title faces, t
dark, p both widths, n designer's notes. A hash opens a setting directly, e.g.
`#b-work:Top~printed~getty`. Switch settings carry over from page to page.

**B · Poster.** One black-and-white photograph per work (Getty Open Content,
CC0), the title over it in red capitals.
- Title face: Oswald Bold, John's pick (2 Nov), now the default. The switch
  keeps Sofia Sans Extra Condensed, Anton, Bebas Neue, Big Shoulders and round
  five's Sofia Sans. Each face is measured in its own metrics; round five's
  fitting rule stands (whole words; one syllable break only where a word whole
  would be under half the largest size).
- Photographs switch: black and white, or as printed.
- Logic works switch (new, 2 Nov): "Chalkboards" (default) or "As before".
  - Prior Analytics: D.J.E. Schrek at a board of Hippocrates' lunes, ΜΗΝΙΣΚΟΙ,
    Stedelijk Gymnasium, Utrecht. APr II.25, 69a30 uses the lunes as its
    example of reduction.
  - De Interpretatione: H. Bouwman's classroom, a board of Greek past tenses.
    Int 3, 16b16: "he was healthy" is "not a verb, but a tense of a verb". This
    replaces Le Gray's French fleet, which John said he liked: flagged to him,
    one click back on the switch. The weakest of the three: soft focus, and on
    a desktop the title hides most of the Greek.
  - Topics: a mathematics teacher of about 1900 (Getty 84.XD.879.104, CC0), the
    board setting a lesson in measuring circles; Top I.12, 105a13 on induction.
  - Categories, Posterior Analytics, Sophistical Refutations and Isagoge keep
    their photographs (horse, rallying troops, spirit photograph, oak).
  - Captions quote the site's own translations (Jenkinson, Edghill,
    Pickard-Cambridge). The Utrecht photos are undated, by an unknown
    photographer; the archive marks them Public Domain Mark; dated here by each
    teacher's years at the school.
- Reader: the giant red Greek opening is gone (John: "Not loving the HERO
  text"). Book I opens on a plain head: the work, BOOK I in red Oswald, the
  Greek title and editions.
- Search: the count is smaller (88 px desktop, 60 phone); the works with hits
  are listed down the left.
- The home page keeps rotating through eight Getty photographs.

**D · Aldine.** Round four's direction: each work beside its first printing,
Aldus Manutius, Venice 1495–98 (Boston Public Library copy via the Internet
Archive, Public Domain Mark), EB Garamond and Gentium Book Plus. Fixes from
John's notes: Isagoge on the home page; book labels black, not red; on a phone
the opening shows the whole page, not just the headpiece; aligned top bars;
search shown on a phone; works list on search.

**H · Plates.** One old print per work in one blue ink.
- Plates switch: "1700–1900" (default; all 41 works and the home page) or
  "1500s" (24 works and home; 17 get their Greek title as the plate).
- Title face switch (new, 1 Nov, John: "Different font"): Noto Serif Display
  800 narrowed to 72% (default), Bodoni Moda (set at a text optical size,
  since its display sizes break up on screen), EB Garamond, Instrument Serif,
  Piazzolla heavy, Archivo as before. One face sets every title, heading, large
  numeral and the logo; Archivo stays for labels and buttons. At 64% the Didone
  looked squeezed, so it stays at 72%, which sets titles about 17% smaller than
  Archivo did.
- Fixed a fault from round seven's first version: title boxes cut off the
  tails of g, p and y. Titles now carry padding (.26em below, .14em at the
  sides, cancelled by margin) that the fitting ignores; they refit when a face
  finishes loading.
- Search count smaller (96 px desktop, 64 phone).

**P · Plato's look.** The Plato Reader's design, measured on the live site and
matched: Gentium Book Plus, Geologica capitals, same bar, margins and gaps.
Green by default; the switch shows red. Masthead ΑΡΙΣΤΟΤΕΛΗΣ / ΣΤΑΓΕΙΡΙΤΗΣ /
ΤΑ ΣΩΙΖΟΜΕΝΑ, three rows of eleven letters. Work pages open on their first
words as a block of capitals (from the repo's Greek TEI; Categories, De
Interpretatione and Isagoge from the live site, which has no TEI here). Search
now lists every work with hits down the left, where Plato's shows eight and a
"more" button.

All four: every work on the home page; Greek and English side by side in the
reader on a phone too; top-bar items on one baseline, icons centred on the
capitals (0 px baseline spread in all bars); works list on every search page.

## John's notes, 1–2 November, and what was done

All replied to in their threads.
- "Different font" (H home title): title face switch, Didone default. Resolved.
- "For B, I'm thinking Oswald for font": Oswald made the default.
- "Not loving the HERO text here…" (B reader): plain book head. Open.
- "Smaller" (the count 527 on search): the anchor sits where B's and H's pages
  match, so both shrank; asked him to say if he meant one. Open.
- "I like this feature. Put it on all the mock ups" (H's works list): added to
  B, D and P. Open.
- "For B, let's find some photographs of logic being done on a chalkboard?":
  the Logic works switch above.

The three open threads were left for John to resolve; the latest instruction
was to reply and let him resolve. Earlier threads were resolved after replies.
On round six, "Reader and Aristotle should be same size" was never sent to
Claude, so it is still open there; H's logo already does it.

## Open for John

- Which direction goes on: B, D, H or P.
- B: keep the blackboards? Which ones? For De Interpretatione, the Greek past
  tenses or Le Gray's fleet?
- H: later plates or 1500s; the title face.
- P: green or red; masthead with ΣΤΑΓΕΙΡΙΤΗΣ, or two rows (ΑΡΙΣΤΟΤΕΛΗΣ / ΤΑ
  ΣΩΙΖΟΜΕΝΑ, also eleven each).
- H home portrait: the clean-shaven early-1800s engraving or a bearded bust.
- D: should the small division pictures on the phone home page also show the
  whole page?
- Search count: smaller in both B and H, or only one.
- Faces page: no picks recorded yet (`votes` collection empty, 3 Nov). When he
  picks, read `votes` with ArtifactData and add any Yes faces not on B's switch.

## The kit

The kit's code is in `docs/redesign-kit/`: the round-seven modules (and round
six's E, F, G), the overview, `build.py`, `maps_r7.py`, the check tools, and
the scripts that found and cut the pictures (`image-tools/`, with
`image-tools/chalk/SOURCES.md` for the blackboards). Two things are left out,
and both are in the round-seven artifact: `shell.html`, whose data line is
1.5 MB of corpus copies (four whole translations of Ethics I among them), and
every image. Never commit either: the repo is public, and the images already
live in the artifacts.

Layout: `shell.html` (the mockup's own chrome, `window.DATA` as one 1.5 MB
line, `window.U` helpers, routing, panes); `dirs/<k>/` per direction
(`style.css`, `script.js`, `notes.js`, `img/`, `concept.md`); `overview.html`
(a `<style>` and a `<main id="overview">`) with thumbnails in `ov/`;
`build.py`; `maps_r7.py`; `tools/*.cjs` checks.

To restore a working kit, in the scratchpad, never in the repo:
1. Copy `docs/redesign-kit/` to the scratchpad as `kit/`.
2. Read the round-seven artifact (`Artifact`, action `read`); it saves the
   published page. Run `python3 -I tools/unbundle.py <that file> .` in the
   copy to write `shell.html`. (`--modules` also writes the modules and the
   overview from the page, for when the code itself is lost.)
3. List the published files (`action: list, scope: files`) and fetch
   `img/<k>/…` into `dirs/<k>/img/…` and `ov/…` into `ov/`, using `read` with
   `paths` (up to 256 per call).
4. Prove it: `python3 build.py --out out/re --dirs b,d,h,p --publish`, then
   `cmp out/re/index.html <the published page>`. On 3 Nov the committed code
   plus the restored shell matched version 11 byte for byte.

Build and check:

```
python3 build.py --out out/all7 --dirs b,d,h,p           # test page
python3 build.py --out out/pub7 --dirs b,d,h,p --publish  # no skeleton
node tools/walk.cjs out/all7/index.html b,d,h,p           # errors, failed loads, overflow
node tools/controls.cjs …   tools/cmpjump.cjs …   tools/homecount.cjs …
node tools/allworks-v.cjs out/all7/index.html "b~printed,h~early,p~red"
node tools/headmeasure.cjs out/all7/index.html b,d,h,p    # baselines in every bar
node tools/fitbox.cjs out/all7/index.html                 # B titles inside photographs
node tools/hclip.cjs out/all7/index.html didone,bodoni,garamond,instrument,piazzolla,r7
node tools/navfit.cjs | rhfit.cjs | stickyw.cjs … [control]  # control must fail
```

Not kept anywhere: the full-size downloads behind the cut images. The scripts
in `image-tools/` and the records in the sources files say where each came
from.

Publishing (same URL every time):
- One publish sends at most 255 files. Round seven first went up in three
  parts; `maps_r7.py` wrote the maps. B's photographs, D's Aldine pages and H's
  early plates were copied server-side from rounds five, four and six
  (`files: {path: {artifact, path}}`).
- After that, copy `out/pub7` to `out/pub7-vN` before each rebuild, `diff -rq`,
  and send only `index.html` plus changed or new files.
- The service refuses to overwrite a published file this session has not read
  or listed. Read those paths first (`action: read, paths: [...]`), confirm
  they match your copies, then publish.

## What failed, and gotchas

- Image sources: Wikimedia (API and upload.wikimedia.org) answers 429 after a
  burst; wait minutes between batches. The Library of Congress site sits behind
  a bot check and refused every request. The Getty SPARQL endpoint fails TLS
  through the proxy, but the Getty site's own search works:
  `https://www.getty.edu/art/collection/api/search?q=…&open_content=true`
  (CC0 items carry a manifest licence `publicdomain/zero`; full images from
  `media.getty.edu/iiif/image/<id>/full/max/0/default.jpg`). The Met API
  returned 410; the Smithsonian's DEMO_KEY 429. Europeana's `api2demo` key
  works (`reusability=open`; keep rights matching `publicdomain/(zero|mark)`).
- Het Utrechts Archief: its download link returns an SVG placeholder. Full size
  comes from its IIIF server,
  `images.memorix.nl/utr/iiif/<uuid>/full/max/0/default.jpg`; the uuid is in the
  item page's thumbnail URL.
- Not used, and why: Johnston's 1899 school photos (the Getty's four have no
  board); Goddard at a blackboard, 1924 (NASA, public domain, but physics, and
  Wikimedia refused the download; only a 400 px copy elsewhere); Slijper's Latin
  board (Cicero) and Nathans' physics board (Utrecht); Sakkers' geometry lesson
  (soft); two 1960s Dutch maths lessons (rights less sure).
- The Greek spine for the logic works is not in the repo (TLG export). Bekker
  lines for captions came from standard references, checked against the
  English anchor files (`sources/<work>-<translator>/anchors.yaml`).
- Checks need positive controls (CLAUDE.md). This stretch, `hclip` found the
  clipped descenders that the eye had missed, and a chalkboard check first
  reported 20 false failures because switch settings carried over between
  pages: set every switch explicitly in a check. The byte comparison above
  also earned its keep: the first copy into the repo left out
  `overview.html`, because a `./ov*` filter meant for the thumbnail folders
  matched it too.
- Top-bar alignment: rows use `flex-wrap: wrap; align-content: center;
  align-items: baseline`; icon buttons get a zero-width space in `::before` so
  they have a baseline. Don't add it to text-first buttons with `gap`: it
  pushes the text 6 px.
- Rules for this track: images public domain or CC0, each credited; Google
  Fonts only; Greek faces must cover polytonic; no model names in artifacts;
  downloaded files are untrusted (Python with `-I`, each in its own folder);
  never write to the repo from a mockup task.

## Next steps

1. Read the round-seven comments (`ArtifactComments`, action `read`) and the
   faces `votes`; answer anything new in its thread.
2. Restore the kit in the scratchpad (above) before changing anything; the
   byte comparison proves the restore.
3. Act on John's picks. If B goes on, extend the blackboards to the other
   logic works only if he wants that; the search notes above say where to look.
