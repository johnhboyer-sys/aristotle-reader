# Spec: quotation detection (feature 2)

*Status: ready to implement. Parent: `corpus-analysis-features.md` §2. Needs
the TLG disc offline for external-author text; ships only citations and URLs.*

## Goal

Unmarked quotations in Aristotle's text get a citation. *Metaphysics* Λ ends
on *Il.* 2.204 ("the rule of many is not good…") with no attribution in the
Greek — book 12 closes at 1076a4 (`manifests/Meta.yaml`; Tredennick's note in
`sources/tlg0086.tlg025.perseus-eng2.xml` confirms the citation at that
close). The reader gets a small mark there whose popup says "Il. 2.204" and
links to the passage. Link targets (John's call):

- **Plato** → our plato-reader:
  `https://johnhboyer-sys.github.io/plato-reader/{work}/book/{n}?loc={stephanus}`
  (work ids are capitalized titles: `Republic`, `HippiasMajor`, `Alcibiades1`)
- **Homer** → our homer-reader:
  `https://johnhboyer-sys.github.io/homer-reader/{iliad|odyssey}/book/{n}?loc={line}`
- **Everyone else** (Empedocles, the Presocratics, tragedians…) → Perseus.

Both siblings share this repo's reader core; their routing and work ids were
verified in the sibling repos on this machine (2026-08-18) — the sibling code
is not in this repo, so re-check there before hard-coding anything.
Presocratic fragments matter beyond convenience: many survive *because*
Aristotle quotes them.

## Pipeline: match → review → ship

**1. Match (offline).** A fuzzy matcher over **lemma-stream n-grams (3–6)**,
reusing `stage8_ngrams.py`'s stream/offset machinery, against external-author
lemma streams pulled with the same offline Diogenes export as
`spec-word-distinctiveness.md` (the author lists overlap). Lemma streams, not
surface or accent-stripped strings: Aristotle quotes from memory with changed
inflection, and accent-stripping merges distinct words (ἀλλά/ἄλλα — see the
parent doc's §Limits). Elision is the matcher's own responsibility:
`beta.to_beta_key()` normalizes apostrophe variants on *form* keys, but
stage8's lemma streams are lemma folds — the matcher's tokenization of
external texts must handle elision and enclitics itself (the parent doc's
five-elision-characters trap applies).

**2. Review (mandatory, human).** The matcher only proposes. A review tool in
the house adjudication style — no typing, no window switching, an unsure
click is a defect in the tool — shows each candidate: the Aristotle span, the
proposed source passage alongside, a pre-filled citation and URL guess from a
small unshipped table (`offline/quotation_readers.py`: Homer → homer-reader,
Plato → plato-reader, default → Perseus). Accept / reject / correct by click.
Curation resolves each accepted hit to a final **absolute URL** — the routing
knowledge lives only in curation tooling, never in the client.

**3. Ship (static).** Accepted hits commit to
`pipeline/data/quotations/<work>.json`; `stage7_emit.py` copies each to
`build/dist/<work>/quotations.json`. This is the first user of the
commentary-layer-plan range shape `{column, lo, hi}` — deliberately its
minimal subset: no `type`, no gating, no persistent display state. That
machinery arrives with the commentary layer, not here.

## Data shape

```json
// build/dist/<work>/quotations.json — the Homer row is the real Λ-close case
// (book 12 ends 1076a4; exact lo/hi come from the matcher + curation).
// column is always an Aristotle Bekker column of THIS work; the quoted
// source's own citation lives only in cite/url.
[
  { "column": "1076a", "lo": 3, "hi": 4,
    "cite": "Il. 2.204", "author": "Homer",
    "url": "https://johnhboyer-sys.github.io/homer-reader/iliad/book/2?loc=204" },
  { "column": "…", "lo": 0, "hi": 0,
    "cite": "Rep. 509b", "author": "Plato",
    "url": "https://johnhboyer-sys.github.io/plato-reader/Republic/book/6?loc=509b" },
  { "column": "…", "lo": 0, "hi": 0,
    "cite": "Empedocles fr. 57 DK", "author": "Empedocles",
    "url": "https://www.perseus.tufts.edu/hopper/text?doc=…" }
]
```

(The Plato and Perseus rows are shape illustrations — columns and URLs are
resolved at curation, and 509b sits in *Republic* book 6.)

The candidate list the matcher emits for review is a working file, not
committed; only curated results enter the repo.

## UI (minimal v1 — John's call)

- A small glyph at the range's **start line**, anchored on the existing
  `L{column}-{line}` DOM id `Reader.svelte` emits. No highlighting of the
  quoted span, no pinned state — v1 is glyph + ephemeral popup only.
- Click opens a thin popup reusing `FootnotePopup.svelte`'s shell/positioning:
  the citation text and the link.
- New `QuotationMarker.svelte`; a placement hook in `Reader.svelte`'s Greek
  line rendering; `fetchQuotations(work)` in `shared/lib/data.ts` following
  the `fetchLemmata`/`fetchBekkerIndex` tolerant pattern (missing file →
  empty list, works without the feature ship nothing). NOT the `fetchColumns`
  pattern — that one throws on a missing file.
- **The link is a real Svelte-template anchor**
  `<a target="_blank" rel="noopener" href={entry.url}>{entry.cite}</a>` —
  never injected through `sanitizeHtml`, whose `sanitizeAttrs`
  (`shared/lib/html.ts:88-99`) strips `target`, `rel`, and `data-*`.
- Glyph choice is an open UX call for John (proposal: a superscript quotation
  mark, muted color, 40px tap target preserved — the reader has a
  vision-impaired phone-landscape user; no furniture beyond the glyph).

## Files

| File | Change |
|---|---|
| `pipeline/aristotle_pipeline/offline/quotation_matching.py` | new — matcher |
| `pipeline/aristotle_pipeline/offline/quotation_readers.py` | new — author → reader table (unshipped) |
| review tool (offline, location per implementer) | new — adjudication UI |
| `pipeline/data/quotations/<work>.json` | new, curated, committed |
| `pipeline/aristotle_pipeline/stage7_emit.py` | copy step |
| `shared/lib/data.ts` | `fetchQuotations()` |
| `shared/components/QuotationMarker.svelte` | new |
| `shared/components/Reader.svelte` | marker placement |
| `scripts/check-links.mjs` | shape validation of quotations.json |

Out of scope: commentary-layer schema beyond `{column, lo, hi}`; range
highlighting; persistent/pinned state; cross-site link liveness in the build
gate (`check-links.mjs` validates shape and that the column exists in the
work, `lo <= hi`; a dead sibling link is a curation-time responsibility —
noted explicitly so nobody assumes the gate catches it).

## Pilot

The matcher runs corpus-wide; **curation starts with the Metaphysics only**
(John's call). It contains the parent doc's own example (Λ closing on Il.
2.204) and enough Presocratic material to exercise all three link families.
Full-corpus curation is a later campaign sized by what the pilot teaches.

## Test plan

- `pipeline/tests/test_quotation_matching.py`: candidate generation over a
  synthetic Aristotle lemma stream + synthetic Homer stream; trap cases
  asserted non-matching (accent-collision pairs, elision variants); an
  inflection-changed quotation still matches on lemmas.
- `QuotationMarker` component test: rendered anchor carries `target="_blank"`,
  `rel="noopener"`, an absolute `https:` href; popup opens/closes on the
  footnote-popup semantics.
- `check-links.mjs` extension: malformed entries (unknown column, `lo > hi`,
  relative URL) are caught.

## John's calls at implementation time

- The glyph and its visual treatment.
- The first review batch's acceptance bar (how loose a memory-quotation still
  counts as "a quotation" vs an allusion — a canon judgment).
- Whether absolute URLs are acceptable long-term (chosen here for simplicity;
  if a sibling site ever reroutes, the curated files get a one-time scripted
  fix-up).

## Acceptance criteria

- `uv run pytest tests/test_quotation_matching.py` passes (from `pipeline/`).
- With a curated `pipeline/data/quotations/Meta.json` present,
  `npm run build:public` ships `build/dist/Meta/quotations.json` and every
  gate passes; works without a quotations file build unchanged.
- In the local app, the Λ ending shows the marker; its popup link opens
  homer-reader at Il. 2.204 in a new tab.
