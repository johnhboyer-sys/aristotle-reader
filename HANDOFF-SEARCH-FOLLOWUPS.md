# Search follow-ups — handoff

The search page shipped with the redesign (PR #195, merged 16 Nov as `de57f687c6`). This file covers the
search work after it, PRs #197–#212. The build's spec and record stay in `HANDOFF-SEARCH-BUILD.md`
(closed), the redesign's in `HANDOFF-REDESIGN-BUILD.md`, and the port to the other readers in
`HANDOFF-SEARCH-PORT.md`.

## 0. Start here

State on 17 Nov, evening: **everything John ruled is built, merged, and live** (gh-pages `85ec93f0`, source
`a2c5545d6a`; DEPLOY-STATUS.md). Nothing is in flight on this track. The next track is the port,
`HANDOFF-SEARCH-PORT.md`.

**What is live:**

- **#197, counting.** Chapters, not columns. Both + "and" means both terms anywhere in one chapter
  (`chapterJoin`, `lib/chapter-pages.ts`). A hit is placed in its chapter once (`chapterPlaces`);
  English words find theirs through `search/eng-chapters.json` (`stage6_search.py`).
- **#198, the switch:** **and | and/or | or**, "or" exclusive, "and/or" inclusive and a new search's
  default (a link with no `op` reads as "and"). Under the count, the chapters split by language.
  **#199:** Back to a blank search unfolds the form.
- **#200, the nested list.** Where English was searched, one list of works ("84 chap."), each
  translation under it with its hits there (`nestRows`; `.sx-nest`).
- **#201, rows a page.** Exactly N rows a page, a chapter running on to the next if it must. The 100
  page lists each row as its reference and a summary, opened in place (`.cmp-row`); it replaced
  "Citations only".
- **#202, the phrase list, Exclude only** (`lib/phrase-list.ts`; URL `xp=`).
- **#208, the row table.** `data/<work>/rows.json`, made at site build, counts each book's rows, so page
  1 and the page total come without reading the books, and a page reads only its own. Each book read is
  checked against the table; a mismatch retires the table and every book is read. The phrase list's
  words load when the list opens. Design: `HANDOFF-SEARCH-PORT.md`, "The row table".
- **#210:** with Lemma on, the Greek form choice is hidden (it searches every form).
- **#212, the "and/or" and "or" counts** (§1, ruled 17 Nov): Greek plus English hits where one
  translation answers, chapters alone over several, never "0 hits" (`hitsInFor`,
  `lib/search-pages.ts`).

**Measured live, 17 Nov** (Chrome, cache off; `docs/search-counting/brute.mjs` counts the same from the
books, outside the page):

| Search | Result |
|---|---|
| ἀρετή + virtue ("and") | 229 chapters · 940 hits; 890 rows, 23 pages of 40; page 1 reads 7 books, 2.2 MB gzip (98 books, 14.1 MB before #208) |
| ἀρετή and/or virtue | 438 chapters, no hit figure |
| ἀρετή or virtue | 209 chapters, no hit figure |
| and/or over the Physics | 31 chapters · 67 hits (13 Greek, 54 Hardie) |
| virtue | 415 chapters; EN 84 chap., Rackham 315, Ostwald 298, Ross 294, Peters 264 |
| virtue, phrases | in virtue of 335, virtue of the 108 (60 with "in virtue of" out), the virtue of 97 |

Gates: R-S7 pins these counts and R-S8 bounds page 1 (7 books, 10 MB unzipped), both in
`app/scripts/check-redesign.mjs`; `--prove` catches every case of each.

**Open:**

- Top 136a, Pickard-Cambridge, draws an English hit whose window misses its word (the row has no mark).
  R-S7 tolerates five such rows on the 100 page and lists them.
- The desktop app's corpus has no `rows.json` and no `search/eng-chapters.json`. Its search reads every
  book, and English hits fall in the chapter their section's Greek opens in.
- The row table trusts the English index's word places. An index built apart from the books can miss;
  that book's count is then wrong until it is read, when the page's check reads every book.
- Flaky under load, not failing alone: `s2-form-menus` "an address with ?l=" (a 20 ms wait) and
  `search-review-fixes` "adversarial patterns … return quickly". Once, right after a build, R-S7 found
  page 21 of ἀρετή + virtue short (24 of 40 rows, most likely a book fetch that failed); the rerun
  passed.
- Three svelte-check errors in `app/src/__tests__/lemma-head.test.ts` predate this work.
- The smaller items in §3.

**Rules that carry over:** no explainer text in the reader or the results; never shrink type or tap
targets (44px); styles go in `b-search.css`; implementation and review are never the same model family (a
Claude edit gets a Codex or Grok review; Grok is back, John, 17 Nov); pass `model:` on every Agent spawn;
John's design calls get a picture, never a description. Merge a PR when all its checks are green; deploys
wait for John's own word, not a relayed one.

**Pictures and explainer:** John's 16 Nov rulings were made from
https://claude.ai/artifact/Vj23YYSeYLaJXrUwN75QkZ (source `docs/search-counting/pictures/`, kept out of
git) and https://claude.ai/artifact/6MCS6YT13myEw7K2CVvGVx (source `docs/search-counting/explainer.html`).

## 1. What John ruled (15–17 Nov)

- **Count chapters, not columns** (15 Nov): "Bekker columns are not grouped by coherent thematic
  treatments. So anywhere in a chapter." If the Greek were divided into paragraphs, the paragraph would
  be the unit.
- **Both + "and": both terms anywhere in the same chapter** (option 2, over a shared column piece; the two
  differ by 2 of 230 chapters).
- **Greek hits are words. English hits show only where one translation answers** (one chosen, or a
  work's only one); over several, a total counts translators, so the bar shows chapters.
- **A, the switch (16 Nov):** "What if we go with 'and' | 'and/or' | 'or'", then "treat 'or' as
  exclusive disjunction and 'and/or' as inclusive disjunction". Old `op=or` links stay inclusive; the
  exclusive or is `op=xor`.
- **B, the nested list (16 Nov):** "for the work as a heading with nested list, it should be chapters
  with at least one hit in at least one translation ... and for translators, it should be HITS." The
  work's number reads "84 chap."; a translator's stands alone.
- **D, pages (16 Nov):** "n results = n rows per page. do that." A row is one passage drawn, however
  many hits it holds. The 100 page: "a page with 100 rows be citations and summary only with 'click to
  expand' for normal hit passage display"; it replaces Citations only ("Yes, replace it").
- **C, phrases (16 Nov): Exclude only.** "Why doesn't the user just search that exact phrase with the
  'exact phrase' setting?" An Exclude lowers the phrases that overlap it and moves no row; on the phone
  the Filter button carries a badge while a phrase is out.
- **Page 1 light again (17 Nov, fix a):** the row table (#208), without changing a page or a count.
- **The "and/or" and "or" counts (17 Nov):** "agree on the or count", then "Both or and and/or". These
  searches show chapters with English hits alone, so their figure counts Greek and English where one
  translation answers, chapters alone over several, never "0 hits". "and" and proximity keep the Greek
  count. The Works list keeps ruling B.
- **By form (17 Nov): "A for by form".** Pages count passages in every view, so switching views keeps
  the page. By form files a passage once under each form it holds, so its pages may draw more than N
  (ἀρετή at 40 a page: 51 drawn, 57 with Whole section); By grammar likewise. Counting by form would make
  those views read every book again; Homer's dbcfb2909 did, and the Homer session was told.
- **Lemma (17 Nov, through the Homer session):** with Lemma on, no Greek form choice (#210). John's own
  reading of the label: "I thought exact form meant 'exactly as typed'", which is right; it must not
  show under Lemma.

## 2. How to measure

- `node docs/search-counting/brute.mjs [build/dist]` counts ἀρετή + virtue from the built books alone (no
  index, no engine): chapters by language, Greek and English hits, the nested list, the phrases, and the
  Physics's and/or figure. R-S7 pins what it prints; rerun it after a corpus rebuild.
- `app/scripts/search-counts.mjs --pages` walks every page of a fixed list of searches and records each
  page's rows; `app/scripts/search-counts-compare.mjs A.json B.json` compares two runs and exits 1 on any
  difference (it says so when it compared no rows). Record a baseline before a change that should move
  no count, and compare after.
- `app/scripts/check-redesign.mjs --stage 5 --base <url> --only R-S7` (or `R-S8`) against a served build;
  `--prove R-S7` breaks each case on purpose and must catch every one. A run while the machine is busy
  can time out on page loads: rerun alone before believing a failure.
- `count.mjs` and `idiom.mjs` (in `docs/search-counting/`) count chapters and phrases from the page's
  CSV export; their 15 Nov baseline (`counts-base-2026-11-15.json`) predates every change above.

## 3. Smaller follow-ups (from PR #195's list)

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
- Review notes: a spaced em dash loses its leading space; an old proximity link with case and tense loses
  the case when the term is edited.
- The Greek word list covers the Lemma switch after typing: John ruled it no problem (15 Nov). Leave it.
