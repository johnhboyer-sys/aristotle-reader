# Four directions, 29 October 2026

Four design directions for the whole site, for John's pick: A Bekker (the
Plato redesign's sibling), B Organon (the reader as a workspace), C Axis (a
centre line with Greek and English facing across it) and D Measure (Swiss, the
corpus as measured data). Each one draws the home page, the Nicomachean Ethics
work page, the reader with the word sidebar, search and a lexicon entry, in
both themes, at 1440 and at phone width. Published as a Claude artifact:
https://claude.ai/artifact/7nbtgk2xUiX1TKk3Ex8y3S

The pages run on the site's own data: the Greek and English of Ethics I (all
four translations, each with its own Bekker numbers), every token's parses,
the lemma pages for ἀρετή, εὐδαιμονία, ἀγαθός and τέχνη, and the registry.
Word clicks, translation picking, compare, Greek / Both / English, contents,
footnotes, text settings and Bekker jumps all work. The LSJ entry is a
stand-in outline, since an artifact cannot load Grammata's module; the site
keeps Grammata's entry as it comes.

## Files

- `page.html`, `shell.css`: the artifact's own bar, overview and stage.
- `core.js`: data access, the reading text, the word sidebar's model, routing.
- `dir-a.*` … `dir-d.*`: each direction's templates and styles.
- `notes.js`: the notes shown beside each page.
- `export-registry.mjs`, `prep.py`: build `data.json` from the registry and
  the site's data files.
- `shoot-current.js`, `shoot-current.py`: shots of the current site for the
  overview.
- `build.py`: inline everything into `index.html`, the published page.
- `wrap.py`, `verify.js`: a local test page and the functional check (every
  direction, page, theme and width; reader interactions).

## Rebuild

```bash
npm ci --prefix app
node docs/mockups/2026-10-29-directions/export-registry.mjs
python3 docs/mockups/2026-10-29-directions/prep.py
node docs/mockups/2026-10-29-directions/shoot-current.js
python3 docs/mockups/2026-10-29-directions/shoot-current.py
python3 docs/mockups/2026-10-29-directions/build.py
```

`prep.py` fetches from the live site by default; `--root build/dist` reads a
local build instead. `data/`, `data.json`, `index.html` and `shots/` hold the
site's TLG Greek, so they are gitignored and never committed.
