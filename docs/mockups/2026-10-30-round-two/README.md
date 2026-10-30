# Round two, 30 October 2026

Four directions for the whole site, after John's notes on round one (too
utilitarian; chapters matter more than Bekker divisions; no Bekker-line
graphics, timelines or measure bars; show phones). Published as a Claude
artifact: https://claude.ai/artifact/FpxinJwQa35j2SdAgAy7HN. Round one stays
at https://claude.ai/artifact/7nbtgk2xUiX1TKk3Ex8y3S (`../2026-10-29-directions`).

- **A Capitals**: the Plato redesign's sibling. Each work is announced by its
  key word in Greek capitals (ΟΥΣΙΑ, ΨΥΧΗ, ΕΥΔΑΙΜΟΝΙΑ), every word on one
  letter grid. Gentium Book Plus and Commissioner; malachite on limestone.
- **B Collection**: each work with an early photograph from the J. Paul Getty
  Museum, chosen for what the work is about. Noto Serif Display, Literata,
  Source Sans 3; ink on bone.
- **C Diagram**: the home page is a division of the sciences that names every
  work; fourteen work pages carry a diagram of their doctrine, each citing its
  passage. Alegreya and Didact Gothic; indigo and ochre.
- **D Aldine**: each work beside its first printing, the Greek Aristotle of
  Aldus Manutius, Venice 1495–98. EB Garamond; black and rubric red.

Every page is drawn at 1440 and at phone width side by side, on round one's
data: the site's Greek and four translations of Ethics I, the parses, four
lemma pages, the registry. Reading state is shared by both panes.

## Pictures and rights

- Photographs: J. Paul Getty Museum, Open Content program, CC0 (each record
  says "No Copyright"). `picks.json` names the object, its IIIF image and the
  crop that cuts the print out of its mount; `photos.json` holds the credit
  and caption the pages show.
- Aldine pages: Aristotle, *Opera*, Venice: Aldus Manutius, 1495–98, Boston
  Public Library copy at the Internet Archive (`opera01aris` to
  `opera06aris`, Public Domain Mark). The library binds Aldus's fourth volume
  as two, hence six items for five volumes. `aldine-map.json` names each
  work's leaf and the box of the detail; `aldine.json` what the pages show.
- Diagrams and word blocks are drawn for the mockup.

## Files

- `page.html`, `shell.css`: the artifact's bar, overview and the two panes.
- `core.js`: data access, the reading text, the word sidebar's model, the
  panes and routing. `diagrams.js`: C's diagrams.
- `dir-a.*` … `dir-d.*`: each direction. `notes.js`: the Notes drawer.
- `images.py`: fetch and cut the pictures into `img/`.
- `build.py`: inline everything into `index.html` (and `test.html`).
- `verify.cjs`: the functional check (every direction, page, theme and
  width; all 41 work pages; the reader's controls in both panes; planted
  faults as controls). `contrast.py`: WCAG contrast of each palette.

## Rebuild

Round one's `data.json` comes first (its README); then:

```bash
python3 docs/mockups/2026-10-30-round-two/images.py
```

```bash
python3 docs/mockups/2026-10-30-round-two/build.py
```

```bash
cd docs/mockups/2026-10-30-round-two && python3 -m http.server 8765
```

```bash
node docs/mockups/2026-10-30-round-two/verify.cjs
```

`index.html`, `test.html`, `img/` and `img-src/` are gitignored: the built
pages carry the site's TLG Greek, and the pictures are fetched.
