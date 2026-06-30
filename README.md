# Aristotle Parallel Reader

A static web application for reading and searching Aristotle's complete works with the Greek and English side by side, morphological analysis on every word, multiple translation comparison, and full-text search across both languages.

Live at **[johnhboyer-sys.github.io/aristotle-reader/](https://johnhboyer-sys.github.io/aristotle-reader/)**

---

## What it does

| Feature | Detail |
|---|---|
| Parallel text | TLG Greek and public-domain English translations, aligned at every Bekker column |
| Word popups | Click any Greek word: lemma, short gloss, parse (from Diogenes / Morpheus), and the full LSJ entry |
| Search | Separate Greek and English boxes; All words / Any word / Phrase modes; `*` wildcard on Greek lemmata; AND/OR combination across languages |
| Navigation | Books and chapters; deep-link to any Bekker location from search results; URL tracks scroll position |
| Translation picker | Multiple public-domain English translations available for most works (e.g. Ross, Rackham, Jowett, Fyfe, Owen) |
| Print / PDF | Browser print saves a clean bilingual PDF (landscape) or English-only portrait layout |
| Bekker Index | Index Aristotelicus (Bonitz) reader (in progress) |

### Works covered (26 total)

**Logic (Organon):** Categories, De Interpretatione, Prior Analytics, Posterior Analytics, Topics, Sophistical Refutations

**Natural Philosophy:** Physics, On the Heavens, On Generation and Corruption, Meteorology, De Anima

**Parva Naturalia:** Sense and Sensibilia, On Memory, On Sleep, On Dreams, On Divination in Sleep, On Length and Shortness of Life, On Youth, Old Age, Life and Death, and Respiration

**Biological Works:** History of Animals, Parts of Animals, Movement of Animals, Progression of Animals, Generation of Animals

**Metaphysics**

**Moral and Political Philosophy:** Nicomachean Ethics, Eudemian Ethics, Politics

**Rhetoric and Poetics:** Rhetoric, Poetics

---

## Requirements

### Data (not included in this repo)

| What | Where to get it | Notes |
|---|---|---|
| **Diogenes 4.7+** | [d.iogen.es](https://d.iogen.es) | Free. Provides both the `xml-export.pl` script and the Morpheus data files (`greek-analyses.txt`, `grc.lsj.xml`). |
| **TLG corpus** | Licensed from the [TLG](https://stephanus.tlg.uci.edu) | Required for the Greek text. The corpus files live at `TLG Files/TLG/` one level above this repo and are never committed. |
| **English translations** | Vendored in `sources/` or downloaded automatically on first pipeline run (see `manifests/`) | All public domain. |

### Tools

- **Node.js 22+** — for the Astro app
- **uv** — Python package manager (`brew install uv` on macOS)

---

## Building

### Public build for GitHub Pages

Use the repo-level public build command for anything that may be deployed:

```bash
npm run build:public
```

That single command:

- rebuilds the generated data in the normal local path, `build/dist/`, so the app still reads through `app/public/data -> ../../build/dist`;
- uses `manifests/<work>-public.yaml` whenever that file exists, falling back to `manifests/<work>.yaml` only for works with no public/private split;
- removes old generated output first, so a previous local/full build cannot leave private overlay JSON behind;
- runs the Astro build as `PUBLIC_HIDE_PRIVATE=1 npm run build`, which drops private translation registry entries from the public bundle.

A GitHub Pages deploy should therefore use exactly:

```bash
npm ci --prefix app
npm run build:public
```

Deploy `app/dist/` only after that command succeeds. Do not deploy an app build made with plain `npm run build` inside `app/`; that build can include local/private translation entries if the data was produced from the full manifests.

### 1. Run the pipeline (per work)

```bash
cd pipeline
WORK=ne uv run python -m aristotle_pipeline all
```

Set `WORK` to the work's short identifier (`ne`, `pol`, `rhet`, `poet`, `da`, `phys`, `meta`, `gc`, `mete`, `apr`, `apo`, `top`, `se`, `ha`, `cat`, `de_int`, `sens`, `mem`, `somn`, `insomn`, `div_somn`, `juv`, `ee`, …). The pipeline writes data to `build/dist/{WORK}/`.

To run a single stage: `WORK=ne uv run python -m aristotle_pipeline stage2`

**Pipeline stages:**

| Stage | What it does |
|---|---|
| 1 | Exports Greek from TLG via Diogenes; chunks English translation at Bekker milestones; builds standoff alignment |
| 2 | Validates column completeness, line gaps, alignment coverage, length ratios |
| 3 | Tokenizes Greek text; converts surface forms to Beta Code lookup keys |
| 4 | Single targeted pass over `greek-analyses.txt`; matches 99.9% of tokens |
| 5 | Streams `grc.lsj.xml`; extracts corpus-occurring lemmata only; letter-sharded HTML |
| 6 | Builds inverted search indexes (Greek lemma + English word) with phrase search support |
| 7 | Emits final `build/dist/{WORK}/` tree: `book-*.json`, `analyses.json`, `lsj/`, `search/`, `manifest.json` |

**Alignment pipeline** (produces `anchors.yaml` per work, then wired into Stage 1):

```bash
cd pipeline
WORK=ne uv run python stage1_gloss.py    # extract Greek glosses
WORK=ne uv run python gloss_align.py     # align translation to Greek spine
WORK=ne uv run python gloss_map_to_anchors.py  # emit anchors.yaml
```

### 2. Run the app

```bash
cd app
npm install       # first time only
npm run dev       # http://localhost:4321
```

```bash
npm run build     # static build → app/dist/
npm run preview   # preview the static build
```

### Review screenshots

With the dev server running, capture key views as PNGs (handy for reviewing changes remotely):

```bash
npm run shots                # all scenes → app/.shots/
npm run shots -- /book/3     # one ad-hoc shot of a path
```

Uses Playwright from the local or npx cache (no project dependency).

---

## Project layout

```
aristotle-reader/
├── manifests/
│   ├── {work}.yaml              # per-work metadata, book boundaries, source paths
│   └── {work}-analyses-patch.json  # hand-reviewed analyses for unmatched forms
├── sources/                     # vendored public-domain English translations (TEI XML)
├── pipeline/                    # uv Python project
│   └── aristotle_pipeline/
│       ├── stage1_greek.py      # TLG export + spine parser
│       ├── stage1_english.py    # Perseus TEI chunker + alignment
│       ├── stage1_gloss.py      # Greek gloss extractor (for alignment)
│       ├── gloss_align.py       # translation aligner (gloss method)
│       ├── gloss_map_to_anchors.py  # anchors.yaml emitter
│       ├── stage2_validate.py   # validation suite
│       ├── stage3_tokenize.py   # Greek tokenizer
│       ├── betacode.ts / beta.py  # Unicode ↔ Beta Code conversion
│       ├── stage4_morphology.py # analyses lookup
│       ├── stage5_lsj.py        # LSJ extraction
│       ├── stage6_search.py     # search index build
│       ├── stage7_emit.py       # final dist emission
│       ├── config.py            # manifest loading, path resolution
│       └── refs.py              # Bekker reference utilities
├── app/                         # Astro + Svelte static site
│   └── src/
│       ├── pages/
│       │   ├── index.astro      # home page (5 corpus divisions)
│       │   ├── [work]/          # per-work reading view
│       │   ├── search.astro     # full-corpus search
│       │   ├── support.astro    # support / donation page
│       │   └── attribution.astro
│       ├── components/
│       │   ├── Reader.svelte    # parallel text view + word popups
│       │   ├── WordPopup.svelte # morphology + LSJ popup
│       │   └── Search.svelte    # search UI + engine
│       └── lib/
│           ├── works.ts         # work registry + corpus categories
│           ├── data.ts          # data-fetch helpers
│           └── search.ts        # search engine (inverted index + phrase)
├── bonitz/                      # Index Aristotelicus (Bonitz) pipeline (in progress)
└── build/                       # generated, gitignored
    └── dist/{work}/             # ready-to-serve frontend data per work
```

---

## Data licences

See [`/attribution`](app/src/pages/attribution.astro) in the running app, or the source file directly. The short version:

- **LSJ** — CC BY-SA 3.0 (Perseus Digital Library / Trustees of Tufts University). This app uses a derivative; downstream use must also carry CC BY-SA.
- **English translations** — All public domain (pre-1928 US publications). See attribution page for per-work details.
- **TLG electronic corpus** — Separately licensed; not redistributed by this project. Users must hold their own TLG licence.
- **Morpheus morphological data** — Distributed with Diogenes; see Diogenes licence.
- **This software** — MIT licence (pipeline + app code only; data excluded).

---

## MIT Licence

Copyright © 2026 John Boyer

Permission is hereby granted, free of charge, to any person obtaining a copy of this software to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
