# Nicomachean Ethics Parallel Reader

A static web application for reading Aristotle's *Nicomachean Ethics* with the Greek and English side by side, morphological analysis on every word, and full-text search across both languages.

---

## What it does

| Feature | Detail |
|---|---|
| Parallel text | Greek and English side by side, aligned at every Bekker column |
| Translations | Rackham (Loeb 1926) and Ross (1925) — switch or compare. Ross ships as an unmarked text mapped onto the Greek spine by the **translation aligner**, so it carries real Bekker ticks (see below) |
| Word popups | Click any Greek word: lemma, short gloss, parse (from Diogenes / Morpheus), and the full LSJ entry |
| Search | Separate Greek and English boxes; All words / Any word / Phrase modes; `*` wildcard on Greek lemmata; AND/OR combination across languages |
| Navigation | Book I–X; deep-link to any Bekker column from search results; jump to any Bekker line |

---

## Requirements

### Data (not included in this repo)

| What | Where to get it | Notes |
|---|---|---|
| **Diogenes 4.7+** | [d.iogen.es](https://d.iogen.es) | Free. Provides both the `xml-export.pl` script and the Morpheus data files (`greek-analyses.txt`, `grc.lsj.xml`). |
| **TLG corpus** | Licensed from the [TLG](https://stephanus.tlg.uci.edu) | Required for the Greek text. The corpus files live at `TLG Files/TLG/` one level above this repo and are never committed. |
| **Perseus English TEI** | Downloaded automatically on first pipeline run (see `manifests/ne.yaml`), or already vendored in `sources/` | Rackham 1926, public domain. |

### Tools

- **Node.js 22+** — for the Astro app
- **uv** — Python package manager (`brew install uv` on macOS)

---

## Building

### 1. Run the pipeline

```bash
cd pipeline
uv run python -m aristotle_pipeline all
```

This runs all seven stages in order and writes the frontend data set to `build/dist/ne/`. The full run takes about two seconds on an M-series Mac.

**Stages:**

| Stage | What it does |
|---|---|
| 1 | Exports Greek from TLG via Diogenes, parses verse-mode TEI; chunks Rackham English at Bekker milestones; aligns the unmarked Ross translation onto the spine (translation aligner) and slices it across columns with real Bekker ticks; builds standoff alignment |
| 2 | Validates column completeness, line gaps, alignment coverage, length ratios, proper-name spot check, sigla inventory |
| 3 | Tokenizes Greek text; converts surface forms to Beta Code lookup keys |
| 4 | Single targeted pass over `greek-analyses.txt`; matches 99.9% of tokens; writes `unmatched.json` for review |
| 5 | Streams `grc.lsj.xml`; extracts corpus-occurring lemmata only; letter-sharded HTML |
| 6 | Builds inverted search indexes (Greek lemma + English word) with per-segment fold-token sequences for phrase search |
| 7 | Emits final `build/dist/ne/` tree: `book-{01–10}.json`, `analyses.json`, `lsj/`, `search/`, `manifest.json` |

To run a single stage: `uv run python -m aristotle_pipeline stage2` (useful after editing the manifest or patch file).

**Patch file:** `manifests/ne-analyses-patch.json` holds hand-reviewed analyses for forms Morpheus does not know (Aristotle's algebraic variable letters in Book V, etc.).

### Translation aligner

`pipeline/aristotle_pipeline/align/` maps an *unmarked* translation (Ross 1925)
onto the Greek spine, so any Bekker citation resolves to a position in it — a
standoff alignment map; the text is never mutated. It runs automatically inside
stage 1, but can also be driven directly:

```bash
cd pipeline
python -m aristotle_pipeline.align            # write build/align/ne_ross_map.json
python -m aristotle_pipeline.align --eval     # offset-error harness
python -m aristotle_pipeline.align --html     # side-by-side Rackham|Ross review page
```

It uses the already-anchored Rackham translation as the reference (no API key):
per chapter, each real Bekker anchor's sentence is matched to the Ross sentence
that begins the same content by a monotonic DP over cosine similarity, with
single lines interpolated by Greek word-count. The zero-dependency lexical
backend is the default; `sentence-transformers` is optional. See
[`align/README.md`](pipeline/aristotle_pipeline/align/README.md). Validated on
Books 1–2 against hand ratings: 0 % off-rate among the anchors shipped as real
ticks.

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

Uses Playwright from the local or npx cache (no project dependency); edit the `scenes` list in `app/scripts/shoot.mjs` to add views.

The `app/public/data` symlink points at `../build/dist/ne/`, so no copy step is needed in development. For a production deployment, copy or serve `build/dist/ne/` at the `/data/` path.

---

## Project layout

```
aristotle-reader/
├── manifests/
│   ├── ne.yaml                  # work metadata, book boundaries, source paths
│   └── ne-analyses-patch.json   # hand-reviewed analyses for unmatched forms
├── sources/
│   └── tlg0086.tlg010.perseus-eng2.xml   # vendored Rackham TEI (public domain)
├── pipeline/                    # uv Python project
│   └── aristotle_pipeline/
│       ├── stage1_greek.py      # TLG export + spine parser
│       ├── stage1_english.py    # Perseus TEI chunker + alignment
│       ├── stage1_ross.py       # Ross translation sliced across columns (uses align map)
│       ├── align/               # translation aligner (Ross → spine) + review page
│       ├── stage2_validate.py   # six-check validation suite
│       ├── stage3_tokenize.py   # Greek tokenizer
│       ├── beta.py              # Unicode → Beta Code conversion
│       ├── stage4_morphology.py # analyses lookup
│       ├── stage5_lsj.py        # LSJ extraction
│       ├── stage6_search.py     # search index build
│       ├── stage7_emit.py       # final dist emission
│       ├── config.py            # manifest loading, path resolution
│       └── refs.py              # Bekker reference utilities
├── app/                         # Astro + Svelte static site
│   └── src/
│       ├── pages/
│       │   ├── book/[n].astro   # reading view (Books I–X)
│       │   ├── search.astro     # search page
│       │   └── attribution.astro
│       ├── components/
│       │   ├── Reader.svelte    # parallel text view + word popups
│       │   ├── WordPopup.svelte # morphology + LSJ popup
│       │   └── Search.svelte    # search UI + engine
│       └── lib/
│           ├── data.ts          # data-fetch helpers
│           └── search.ts        # search engine (inverted index + phrase)
└── build/                       # generated, gitignored
    └── dist/ne/                 # ready-to-serve frontend data
```

---

## Data licences

See [`/attribution`](app/src/pages/attribution.astro) in the running app, or the source file directly. The short version:

- **LSJ** — CC BY-SA 3.0 (Perseus Digital Library / Trustees of Tufts University). This app uses a derivative; downstream use must also carry CC BY-SA.
- **Rackham translation** — Public domain (published 1926, US copyright expired).
- **Ross translation** — Public domain (published 1925), via the MIT Internet Classics Archive.
- **Bywater Greek text** — Public domain (published 1894).
- **TLG electronic corpus** — Separately licensed; not redistributed by this project. Users must hold their own TLG licence.
- **Morpheus morphological data** — Distributed with Diogenes; see Diogenes licence.
- **This software** — MIT licence (pipeline + app code only; data excluded).

---

## MIT Licence

Copyright © 2026 John Boyer

Permission is hereby granted, free of charge, to any person obtaining a copy of this software to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
