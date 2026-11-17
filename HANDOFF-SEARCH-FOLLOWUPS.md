# Search follow-ups — handoff

The search page shipped with the redesign: PR #195, merged 16 Nov as `de57f687c6`. This file covers the
search PRs that came after it (#197–#202, all merged 16 Nov). **Deployed 16 Nov** (gh-pages `6d05a6d4`;
DEPLOY-STATUS.md). The build's spec and record stay in `HANDOFF-SEARCH-BUILD.md` (closed), and the
redesign's in `HANDOFF-REDESIGN-BUILD.md`.

Porting the search to the other readers has its own handoff, `HANDOFF-SEARCH-PORT.md`. It can start now:
the counting, rows, and phrases it waited for are on main.

## 0. Start here

State on 16 Nov, evening: **every part John ruled is built, merged, and deployed** (gh-pages
`6d05a6d4`, 16 Nov; gate R-S7 passes against the live site). The next track is the port to the other readers,
`HANDOFF-SEARCH-PORT.md`.

The PRs, all merged 16 Nov:

- **#197, PR 1: counting.** Counts chapters, not columns. Both + "and" means both terms anywhere in one
  chapter (`chapterJoin`, `lib/chapter-pages.ts`). Greek hits are words; English hits show only with one
  translation per work; Both counts Greek hits only. Page 67 fixed: a hit is put in its chapter once
  (`chapterPlaces`). English words find their chapter through a new index file,
  `search/eng-chapters.json` (`stage6_search.py`, `segment_chapter_starts`).
- **#198, A: the switch.** **and | and/or | or**, "or" exclusive, "and/or" inclusive and the default;
  old `op=or` links stay inclusive. Chapters split by language. **#199:** Back to a blank search
  unfolds the form.
- **#200, B: the nested list.** Where English was searched, one list of works ("84 chap."), each
  translation under it with its hits there, most first; no separate Translations list (`nestRows`,
  `nestOn`, `setNest`; `.sx-nest`). A Both search's work rows count chapters too: beyond the ruling,
  and John kept it.
- **#201, D: rows a page.** A page holds exactly N rows (a row is one passage drawn, however many
  hits it holds), so a chapter may run on to the next page, heading its part on both. Rows can't be
  counted from the index (merged windows, aligned units, runs into the next section, accent and case
  filters all need the text), so, as John ruled, **rows fill as books load**: page 1 draws when its
  own books load, the rest build four at a time in the background, and the pager reads "1 of …" until
  they finish (`startRows`, `bookRows`, `pageRows`; `buildGroups` has no page filter now). A book that
  fails shows a notice with Retry. **The 100 page follows the TLG:** each row a button with its
  reference and a summary (`.cmp-row`, `summaryOf`: seven words before the first hit, eight after),
  opening in place (`openRows`) with the reader link in its head. It replaces Context "Citations
  only" (`ResultContext` is 1 | 3 | s); `ctx=c` and `ps=c` links open the 100 page.
  `paginate`/`paginatePlaces` no longer serve this page; they stay for their tests and the readers
  still to be ported.
- **#202, C: the phrase list, Exclude only.** Three-word runs around English hits, five hits or more,
  most first, ten shown, the rest under More (`lib/phrase-list.ts`: `phraseText`, `runsAt`,
  `setAside`, `phraseRows`). `loadPhrases` reads every English hit's passage once after the search;
  `withoutPhrases` drops the hits inside an excluded phrase before every count, forms included. A run
  stays within a sentence and crosses piece edges; a term of several words counts once per hit. An
  Exclude lowers the phrases that overlap it and moves no row; URL `xp=`; on the phone the list is a
  sheet screen of its own and the Filter button carries a badge. No list for an exact-phrase search.

Measured on the built site, ἀρετή + virtue (`docs/search-counting/brute.mjs` counts the same from the
books, outside the page):

- Both: 229 chapters · 940 hits (was "311 passages", 2,952 hits). Either: 438 chapters · 967 hits.
- Rows: 890, 23 pages of 40, 10 on the last; 17 chapters split across pages; the 100 page has 9 pages.
- English virtue: EN 84 chap.; Rackham 315, Ostwald 298, Ross 294, Peters 264.
- Phrases: in virtue of 335, virtue of the 108, the virtue of 97, virtue of a 68, virtue of which 67, of
  the virtues 65, virtue or excellence 51, the virtues are 46, of virtue and 41, the other virtues 39.
  With "in virtue of" out: virtue of the 60, virtue of a 34, virtue of which 3.

Gate R-S7 (`app/scripts/check-redesign.mjs`) pins all of the above on desktop and phone; `--prove R-S7`
catches every proof case. Each PR had two Codex reviews (gpt-6.1-sol, medium) and every finding was
fixed.

**Follow-ups:**

- Top 136a, Pickard-Cambridge, draws an English hit whose window misses its word, at every page size
  (the row has no mark). R-S7 tolerates five such rows on the 100 page and lists them.
- The desktop app's corpus needs `search/eng-chapters.json` (without it English hits fall in the
  chapter their section's Greek opens in).
- Three svelte-check errors in `app/src/__tests__/lemma-head.test.ts` predate this work.
- The smaller items in §4.

**Rules that carry over:** no explainer text in the reader or the results; never shrink type or tap
targets (44px); styles go in `b-search.css`; implementation and review are never the same model family
(a Claude edit gets a Codex review); pass `model:` on every Agent spawn; Grok is benched (John, 11 Nov);
John's design calls get a picture, never a description. Merge a PR when all its checks are green;
deploys wait for John.

**Pictures and explainer:** John's rulings were made from
https://claude.ai/artifact/Vj23YYSeYLaJXrUwN75QkZ (source `docs/search-counting/pictures/`, kept out
of git: 3.6 MB of JPEGs) and https://claude.ai/artifact/6MCS6YT13myEw7K2CVvGVx (source
`docs/search-counting/explainer.html`). §2 holds his words.

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

The and/or, phrase, and pages bullets below were proposals; the next subsection holds what John ruled
on them.

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

### The four questions, ruled 16 Nov

- **A is ruled (John, 16 Nov):** the split as pictured, with the switch reading **and | and/or | or**.
  "or" is the exclusive or (one language, not both: Greek only + English only); "and/or" is the
  inclusive or, today's "either". His words: "A (Split) looks good except 'only one' is awkward. What
  if we go with 'and' | 'and/or' | 'or'", then "treat 'or' as exclusive disjunction and 'and/or' as
  inclusive disjunction". Picture A4 shows the panel's labels (Both languages / Either or both / One
  language, not both): a draft he has not ruled. Today's `op=or` links mean inclusive; keep them
  inclusive and give the exclusive or a new value.
- **B is ruled (John, 16 Nov):** one list, each work with its translations under it; the separate
  Translations list goes. A work's row counts chapters with a hit in at least one translation; a
  translator's row counts that translator's hits in that work (sorted by hits). A translator's name
  shows that translator's hits in that work. His words: "for the work as a heading with nested list,
  it should be chapters with at least one hit in at least one translation ... and for translators, it
  should be HITS." The passage rows stay as built: one translator's English, the names of every
  translator with a hit there underneath, to switch between. The work's number reads "84 chap." (B7;
  John, 16 Nov: "84 chap. for work"); a translator's number stands alone. The
  "in more than one" line (B1) was not taken up.
- **D is ruled (John, 16 Nov): pages by rows, exactly N a page** ("n results = n rows per page. do
  that."), so a chapter may run on to the next page (ἀρετή + virtue: 890 rows, 23 pages of 40). A row
  is one passage drawn in the list, however many hits it holds. Cost to solve: counting rows needs
  every book of the search before page 1 (50 books, 30 MB, 7 MB gzipped; "and/or" 100 books, 57 MB,
  13 MB gzipped) unless rows can be counted from the index.
- **And the 100 page follows the TLG** (John, 16 Nov): "a page with 100 rows be citations and summary
  only with 'click to expand' for normal hit passage display." Pictured D4 (the list) and D5 (a row
  opened): each row its reference and a line around its first hit; a tap opens the row in place as
  the other page sizes draw it. It **replaces** Context "Citations only" (`citeList`,
  `citationsFor`; John, 16 Nov: "Yes, replace it"), which lists references alone.
- **C is ruled (John, 16 Nov): Exclude only, no Include.** "Why doesn't the user just search that
  exact phrase with the 'exact phrase' setting?" An Include gives the hits an exact-phrase search
  gives, so it goes, and with it the question of which wins an overlap (C4/C5). And (John, 16 Nov):
  an Exclude lowers the counts of phrases that overlap it ("virtue of the" 108 → 60 with "in virtue
  of" excluded); the rows keep their order after an Exclude; on the phone the Filter button carries
  a badge while a phrase is excluded.

### Ruled 17 Nov (raised by the Homer port)

- **The hits of "and/or" and "or" (John, 17 Nov: "agree on the or count", then "Both or and
  and/or").** These searches show chapters with English hits alone, and the bar counted Greek words
  only, so live read "ἀρετή and/or virtue: 438 chapters · 967 hits" with De Interpretatione and
  Posterior Analytics at "0 hits". Now: with one translation answering (chosen with `t=`, or a work's
  only one), the figure counts the Greek words and that translation's English; with several, the bar
  shows chapters and no hit figure, and the headings none; never "0 hits" of a work that matched.
  "and" keeps its Greek count (every chapter it shows holds a Greek hit), and so does a proximity
  search (its terms are Greek). The Works list keeps ruling B: a work its chapters, a translator its
  hits there. Built in `lib/search-pages.ts` (`hitsInFor`) and `Search.svelte` (`countOf`,
  `groupHits`); tests in `search-pages.test.ts` (`hitsInFor`), in
  `search-chapter-draw.test.ts` (11a–e), and the counting tests that encoded the Greek-only rule
  (components, paired-hit-search, greek-pair-switch, reading-results-search) now choose a
  translation and count both languages.
- **By form pages stay by passage (John, 17 Nov: "A for by form").** Pages count passages in every
  view, so switching views keeps the page. By form files a passage once under each form it holds, so
  its pages may draw more than N (live, ἀρετή at 40 a page: 51 drawn, 57 with Whole section); By
  grammar likewise. Not built: counting by form there, which would make those views read every book
  again (Homer's dbcfb2909 did; the Homer session was told).

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
- Review notes: a spaced em dash loses its leading space; an old
  proximity link with case and tense loses the case when the term is edited.
- The Greek word list covers the Lemma switch after typing: John ruled it no problem (15 Nov). Leave it.
