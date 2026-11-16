# Search follow-ups — handoff

The search page shipped with the redesign: PR #195, merged 16 Nov as `de57f687c6`. **Not deployed yet**: the
deploy waits for John's word. This file covers the search PRs that come after it. The build's spec and
record stay in `HANDOFF-SEARCH-BUILD.md` (closed), and the redesign's in `HANDOFF-REDESIGN-BUILD.md`.

Porting the search to the other readers has its own handoff, `HANDOFF-SEARCH-PORT.md`. That work waits
for PR 1 below, so the readers are ported once, with the new counting.

## 0. Start here

- **PR 1: counting, pages, phrases, and page 67** (§1–§3). John ruled the model on 15–16 Nov; it is not
  built.
- **PR 2 onward: the smaller search follow-ups** (§4). Each is its own PR, unless two touch the same lines.
- **Rules that carry over:** no explainer text in the reader or the results; never shrink type or tap
  targets (44px); styles go in `b-search.css`; implementation and review are never the same model family
  (a Claude edit gets a Codex review); pass `model:` on every Agent spawn; Grok is benched (John, 11 Nov);
  John's design calls get a picture, never a description. Merge a PR when all its checks are green;
  deploys wait for John.
- **Explainer for John:** https://claude.ai/artifact/6MCS6YT13myEw7K2CVvGVx (source
  `docs/search-counting/explainer.html`).

## 1. What is wrong today

Measured on the built site with a Both search, ἀρετή + virtue (`/search?g=ἀρετή&e=virtue`):

| Count | Value | Shown |
|---|---|---|
| Bekker columns with a hit (one `SearchResult` each) | 311 | the bar, as "311 passages" |
| Rows drawn on the pages (`.instance-list > li`) | 829 | nowhere |
| Word hits: Greek words plus English words in every translation | 2,952 | the bar, as "2,952 hits" |
| Pages | 83 | "page 1 of 83" |

- **The bar's "passages" are columns.** `totalPassages = shown.length` (`Search.svelte` ~799) counts
  results, one per segment, and a segment is a Bekker column.
- **Pages are cut by hits.** `paginate(shown, offsets, pageTarget(pageSize))` (~808; `lib/chapter-pages.ts`)
  fills a page to about 40 hits (`hitCount`, `lib/search-pages.ts`) and never splits a chapter. A row can
  hold 1 hit or 10, so pages run from 1 to 20 rows.
- **Hits count translators.** `hitCount` adds Greek hits and every English hit in every translation. A
  Categories ἀρετή, with three translations, weighs four times one in the Prior Analytics, with one.
- **"And" matches by column** (`lib/search.ts` ~1466, `intersect(grkHits, engHits)` over segments), and a
  column can cross a chapter break. In this search it returns 311 columns over 238 chapters, and 10 of
  those chapters hold one language only (e.g. Nicomachean Ethics III 4 appears only for Rackham's "the
  virtues are exercised" at 1113b; the matching ἀρετή sits in the same column, but in chapter 3).
- **"Either language" is an inclusive or** (`union`).
- **Page 67 of this search is empty.** The pager counts it; it draws no rows and logs no error. Likely
  place: `buildGroups` (~2440) drops an instance whose chapter, by `chapterOf(column, line)`, puts its
  source result on another page (`add`, the `pageOf(source, ch.chapter) !== pageIdx` test), while
  `paginate` placed that result by a different chapter. Not traced yet. Write the failing test first.

## 2. The model John ruled (15–16 Nov)

- **Count chapters, not columns.** "Bekker columns are not grouped by coherent thematic treatments. So
  anywhere in a chapter." If the Greek were divided into paragraphs, the paragraph would be the unit.
  Chapters stay the page's headings, and pages hold whole chapters, as now.
- **Both + and: both terms anywhere in the same chapter** (John chose this, option 2, over requiring a
  shared column piece). Measured, the two differ by 2 of 230 chapters (MM II 8; Rhet. ad Alex. 3).
- **Greek: hits are words.** Report hits and chapters.
- **English: hits only when the translation set has at most one translation per work.** That covers one
  translation, the main translation of every work, or any single slot. (Slots: `english` 50 works,
  `secondary` 13, `third` 4, `overlay` 3.) With every translation, a hit total counts translators, so
  report chapters instead: chapters where at least one translation has the term, and chapters where more
  than one does. Only works with a second translation can reach the second count. Show it out of the
  chapters where it is possible (e.g. "in more than one: 80 of 120"). John has not seen that form yet.
- **Both: hits are the Greek words only.** The English decides whether a chapter qualifies and adds
  nothing to the hit count.
- **And, inclusive or, exclusive or.** Not ruled. Proposed: the bar splits the chapters three ways (Greek
  and English, Greek only, English only). "And" is the first, inclusive or is all three, exclusive or is
  the last two. The and/or switch decides only which chapters the list shows. Show John a picture before
  building.
- **Phrase Include and Exclude for English** (John 16 Nov: "showing users common phrases with the english
  word so they can click include or exclude"). Proposed design, not yet seen by John:
  - Build the list from the hits: each English hit with a neighbour or two on each side, grouped and
    ranked by count. Top ten, the rest under More.
  - Each phrase has Include and Exclude. Exclude drops every hit inside it. Include keeps only hits inside
    the included phrases. With none ticked, every hit counts.
  - It acts on hits, not chapters: excluding "in virtue of" keeps a chapter that also says "moral virtue".
  - Each translation is matched on its own text.
  - Counts update as you tap. The URL keeps it, like `xforms` (excluded forms) does today. The Filter
    panel's form list (`formPanel`, `excludedForms`) is the pattern to follow.
  - Overlap rule to show John: a hit inside "in virtue of" and inside "virtue of the soul" is dropped if
    it falls in any excluded phrase, and kept if it falls in any included one.
  - Measured value: "in virtue of" or "by virtue of" alone accounts for 170 of the 187 chapters with
    "virtue" but no ἀρετή.
- **Pages.** With chapters as the unit, page by chapters, or by rows at about 40 a page. Not ruled. Rows
  exist only after the books load (`buildGroups` fetches them), so paging by rows means loading every book
  in the search before page 1 shows. Measure that cost before proposing it.

### Measured chapter counts, ἀρετή + virtue, every translation

| Chapters with | Count |
|---|---|
| ἀρετή or virtue | 440 |
| both, anywhere in the chapter | 230 |
| both, sharing a column piece | 228 |
| ἀρετή, no virtue | 23 |
| virtue, no ἀρετή | 187 |

## 3. How to measure (tools in `docs/search-counting/`)

- Export every hit from the built site with the page's own "Export results as CSV" (one row per Greek
  instance and per translation row; columns Work, Book, Chapter, Bekker, Language, Translation, Snippet,
  URL). For the figures above: `/search?g=ἀρετή&e=virtue&op=or` saved as `hits-or.csv`, and the same
  without `op=or` as `hits-and.csv`. A Playwright script must run from inside `app/scripts/`, or
  `playwright` does not resolve; delete it after.
- `node count.mjs` (in a folder holding the two CSVs) prints the chapter counts, the chapters the two
  "and" tests disagree on, and today's one-language chapters. `node idiom.mjs` measures the phrases.
  Snippets are context windows, so phrase counts are close, not exact.
- `counts-base-2026-11-15.json` is the `app/scripts/search-counts.mjs` baseline before any counting
  change (14 searches; compare name, total, pages, and shown, ignoring the port). PR 1 changes these on
  purpose: record the new values and say why each moved.
- Gate `R-S7` in `app/scripts/check-redesign.mjs` pins 311 passages and 2,952 hits and the noun
  "passages", and checks the Filter sheet's foot ("Show 311 passages"). PR 1 must rewrite it against
  John's model, with values measured outside the page under test.

## 4. Smaller follow-ups (from PR #195's list)

- The desktop app mounts the new Search unstyled (needs `b.css` tokens and `b-search.css`). Low priority
  (John, 9 Nov).
- "Group by grammar" needs per-word grammar data. Grammar group counts count the shown page; counting the
  whole result fetched 54 books (33 MB) against 9 (6 MB).
- An opened section's English can start a clause early (a corpus alignment issue).
- Proximity-editor controls are under 44px on desktop (`.prox-sel`, `.prox-win`, `.prox-chip`, the
  field's clear button; the 44px test allow-lists them).
- `b.css` still uses `max-width: 960px` in places.
- After "Find this phrase in any inflection", the address keeps the old `sp`, `sn`, and `wf`.
- `/saved` is not in check-redesign's contrast list (checked separately; it passes).
- Dead code from the port: `groupState`, `corpus-tools`, `inscription`, `sect-ticks`, `speaker-colors`.
- The 6-term proximity cap needs a speed test.
- Review notes: an old `ps=c` link opens at 40 a page; a spaced em dash loses its leading space; an old
  proximity link with case and tense loses the case when the term is edited.
- The Greek word list covers the Lemma switch after typing: John ruled it no problem (15 Nov). Leave it.
