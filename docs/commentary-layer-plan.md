# The commentary layer — plan

*Status: plan only. Nothing here is implemented. Drafted 2026-08-07 from a design session; the formal decision doc (schema with worked examples, adversarially reviewed) is still to come.*

***The UI is not settled.*** *What is committed below is information architecture — the two-pole model, the data model, the anchoring. Every visual and interaction treatment is direction, not design. The shipped UI must work really well and be slick, attractive, and functional; each UI phase gets its own design pass with prototypes in the live reader before anything is called final. The mockups are an option-space map, not a spec.*

Mockup artifact (five UI approaches, real DA 402a content): https://claude.ai/code/artifact/1fa4f361-269b-499b-a37f-819e950a45d2

## What this is

A layer of textual commentaries over the corpus: line-keyed philological commentaries (Hicks on DA, Ross on Meta, Newman on Pol, Stewart/Burnet/Grant on EN), lectio-structured commentaries (Aquinas), and eventually the ancient Greek commentators (CAG). Which commentaries are hostable, and when, is mapped in the PD commentary map; copyright state is a first-class property of the data, not an afterthought.

"Lemma" throughout means the commentary sense: the quoted span of source text that heads a note, located by Bekker line — not the dictionary-headword sense the parser uses.

## Governing architecture (decided)

**Two primary modes; the other side is always a supplement panel.**

- **Text-primary**: the normal reader, with commentary as a supplement.
- **Commentary-primary**: the commentary is the book — its own route and TOC — with the base text as a supplement ("peek") scoped to the span under discussion.

Rules that follow:

1. The supplement is always scoped by the primary's position. It is never a free-scrolling second book. Sync flows primary → supplement only; there are no lock-mode matrices.
2. The supplement panel is one component family (right sidebar on desktop, bottom sheet on mobile — the WordPopup/EndnoteSidebar slot), parameterized by content (notes vs. text span) and language setting.
3. The two modes are peers: at any location, one flip swaps figure and ground without losing place. URL carries `(work, location, primary, supplement-config)`.
4. Each pole carries its own language setting. Text-primary: Greek/Both/English as today. Commentary-primary: the commentary's own pair (Latin/Both/English for Aquinas; Greek-only for CAG until its English frees). The peek pane has its own Aristotle-language setting. Two independent language controls per screen is intended, not a bug.

The five mockup approaches reduce to this: A (peek drawer) and E (commentary-primary) are the two poles and are core. B (margin rail) and D (interleave) are optional presentations of the text-primary supplement, addable later without touching the model. C (facing pane with sync modes) dissolves.

## Display state machine (working model — interaction details unsettled)

Commentary display in text-primary mode is one setting: **`off → ticks → persistent`**.

- `off`: no commentary UI.
- `ticks`: gutter dots on annotated lines (default once a commentary is selected). Clicking a dot opens an ephemeral peek with parser-popup semantics: click-off closes.
- `persistent`: commentary stays in view and tracks scroll-spy. Presentation is the layout's decision, not the user's: margin rail on wide screens, docked drawer below the width threshold, collapsed strip on phones. "Pin" is not a separate feature — it is the ticks → persistent transition offered in context.

Interplay with the parser popup: distinct click domains (word → lexicon; gutter/margin → note), one supplement slot, last-click wins. A word lookup displaces a pinned note; closing the parser returns to it. Only `persistent` ever negotiates standing real estate.

## Translator commentaries: shown on all translations (recommended)

Commentary keyed to Greek lemmata is commentary on Aristotle, not on the commentator's English; it displays against every translation. Two caveats carried in the data:

- Word-level English highlighting only works on the commentator's home translation; elsewhere fall back to line-range indication via the existing bekker tick offsets.
- Notes about the translation itself ("I render X as Y…") carry `appliesTo: translation` and are suppressed or badged when a different translation is displayed. Boundary rule: footnotes anchor to a translation; commentary anchors to the work.

## Aquinas and the divisio textus (decided)

- Aquinas segments by lectio. His divisio textus — the hierarchical division each lectio opens with — is transcribed as a tree: nodes `{label, range: {column, lo, hi}, children[]}`, leaves at lemma spans. Aristotle's own commentator does the anchoring.
- The tree is one structure with three presentations: an expandable/collapsible **outline page** linked from the work's homepage; the commentary reader's **TOC rail**; a **"you are here" breadcrumb** over the Bekker spine, visible from either pole.
- Clicking a divisio node lands in the commentary reader (the lectio stating that division). Jumping into Aristotle happens from lemma citations inside the lectio view.
- The commentary-primary reader is the existing reader recursed: seg-row grid, view chips, mobile collapse, pointed at Latin|English instead of Greek|English. The Latin morphology packs built for the sibling readers make a Latin word-popup plausible.
- New pipeline need: Latin–English alignment at lectio/paragraph grain (coarser than Bekker-line work). Existing alignment-verification discipline applies.

## Data model direction

- Per-work `commentaries.json` manifest. Each entry: commentary id, type, language streams, copyright state per stream, home translation if any, routes.
- Notes keyed by Bekker range `{column, lo, hi}` with `type: lemma | lectio | essay | continuous`. Lemma text is display metadata, never the join key (the commentator's edition may differ from ours; range always resolves, word-match is best-effort).
- Lectio-type notes may carry a `divisio` tree.
- Commentary content holds parallel language streams from day one. Retrofitting bilingualism later is the migration that hurts.
- Copyright gates per stream, not per commentary (Aquinas Latin PD forever; English translations individually fragile; CAG Greek hostable now, English locked to ~2083 → permanent Greek-only mode with link-out). The gating and pre-deploy leak-check machinery that protects gated translation prose extends to commentary prose.

## AI translation pilot (agreed in principle)

Because CAG English is locked for decades: pilot an AI translation of one Greek commentator from the PD CAG Greek. Candidate: Themistius's DA paraphrase, Book 1 — continuous prose, moderate size, maps to Bekker spans, and exercises the exact schema E needs.

Bright line: a "modified" Bloomsbury/Sorabji translation is a derivative work and is off the table; no label cures that. The published translation is used only as a private **reference check**, under this discipline:

- Generation never sees the reference: translation passes work from the CAG Greek alone, plus a fixed glossary and style sheet. Provenance chain is provably Greek → English.
- The reference appears only in a separate verification pass that flags divergences of meaning, not wording. Flags go back to re-translation from the Greek.
- Divergence flags are data: some are AI errors, some are genuine ambiguities worth footnoting.
- Full audit trail: passes run, flags raised, changes made.
- Standard technical renderings (ἐντελέχεια → "actuality") are scholarly convention and fine; sentences are not.

Labeling: a visible "AI TRANSLATION" badge plus a methods note stating what it is, how it was checked, and why it exists (copyright), with a correction invitation. Manifest stream type `ai-translation` with model, date, method version. Never gated; never disguised; date-stamped and revisable.

## Ingestion QA gates

- Lemma-to-Bekker resolution: quoted span must match our Greek at the stated line; mismatches are flagged, never forced.
- Divisio extraction: tree ranges must tile the text without gaps or overlaps (machine-checkable).
- AI-translation pipeline: verification passes as above.
- Same honesty standard as alignment verification: "confirmed" names the checker.

## Phasing

1. **Schema first, against the hardest real cases**: write actual JSON for a few real Hicks notes and one Aquinas lectio (with divisio) before any UI work. If one schema holds both, everything else stays open.
2. **A (peek drawer + ticks)**: universal foundation; every later presentation degrades to it. Preceded by its own design pass — prototyped in the live reader, judged against the slick/attractive/functional bar, iterated before shipping.
3. **E (commentary reader + divisio outline)** for Aquinas. Same design-pass discipline.
4. **Persistent presentations** (rail/drawer forms) as judgment calls once real reading experience exists.
5. **AI-translation pilot** can run parallel to 2–3; it is pipeline work, not UI work.

## Open questions (decide early)

- Does commentary prose join the search index? (Third searchable stream; gating implications.)
- Are notes citable/exportable like text?
- Ratify the "all translations" recommendation above.
- Pilot commentator choice (Themistius proposed; confirm against CAG text availability and OCR cost).

## Non-goals for v1

Multi-commentary compare views; cross-commentary "also treated by" links; CAG beyond the single pilot; sync-mode machinery (lock-to-lemma/lock-viewport); commentary annotations by users.
