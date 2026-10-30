# Round three, 30 October 2026

Round two with John's seven notes applied, and the style he liked (large
semi-opaque red capitals set over a photograph). Published as a Claude
artifact: https://claude.ai/artifact/8svNwSXYLPBHZSfaKiSjuJ. Round two, with
the notes on it: https://claude.ai/artifact/FpxinJwQa35j2SdAgAy7HN
(`../2026-10-30-round-two`).

- **A Capitals**: unchanged apart from the books (below).
- **B Poster**: one early photograph on the home page and one on each work
  page, with the title over it in Sofia Sans capitals at 82% opacity. The
  title is sized to fit: the largest size at which the longest word fits the
  width and the wrapped lines fit the height (`CAPW` holds capital widths
  measured in the browser). No pictures in the reader, search or the
  lexicon. The home page's photograph would change at each visit; the mockup
  steps through eight wide ones.
- **C Diagram**: dropped ("No diagrams. Too gimmicky").
- **D Aldine**: no picture in the reader.
- **All**: a work's books are closed by default (`<details>`), with Open all
  and Close all.

## The notes

1. B home: "Too many photos on homepage."
2. B work page: "These books need to [be] collapsible. Otherwise the page is
   too damn long."
3. B reader: "No pictures on reader pages."
4. B lexicon: "No need for photos on every page. Too much."
5. C: "Nope. Might work for en or physics but on sleep? Or other minor
   works? No diagrams. Too gimmicky."
6. C home: "Might be nice on some sort of side page but horrid as home
   page. Too gimmicky."
7. D reader: "No pictures on reader pages."

`verify.cjs` checks each of them: no pictures in the reader, search or the
lexicon in any direction; one photograph on B's home page; books closed by
default and Open all and Close all working; every B title within its
poster and clear of the text beside it.

## Rebuild

As round two (`../2026-10-30-round-two/README.md`), from this folder:

```bash
python3 docs/mockups/2026-10-30-round-three/images.py
```

```bash
python3 docs/mockups/2026-10-30-round-three/build.py
```

```bash
cd docs/mockups/2026-10-30-round-three && python3 -m http.server 8765
```

```bash
node docs/mockups/2026-10-30-round-three/verify.cjs
```

`index.html`, `test.html`, `img/` and `img-src/` are gitignored.
