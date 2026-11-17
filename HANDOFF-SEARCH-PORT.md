# Porting the new search to the other readers — handoff

The new search (the 13 Nov form, the result views, `b-search.css`) went into aristotle-reader with the
redesign, PR #195, merged 16 Nov as `de57f687c6`. This file plans its port to the sibling readers. Nothing
has been ported.

**Wait for the counting PR** (`HANDOFF-SEARCH-FOLLOWUPS.md`, PR 1). It changes what the bar counts, how
pages are cut, and adds phrase Include and Exclude. A port before it would have to be redone.

## 0. Start here

- **Order:** the counting PR merges here → John rules each reader's counting unit (§2) → Plato first →
  then the others, one PR per reader, in that reader's repo.
- **`shared/` is copied, not a submodule.** Port hunk by hunk. A directory sync wipes each reader's own
  work (Plato's speakers, Homer's lines, the plays' design). Diff each file against the reader's copy
  first.
- **The B design is in none of them.** Each reader's `shared/styles/` holds `global.css` only (plus
  fonts in two). The new search stands on B's tokens and layout (`b.css`), so a port brings that base or
  restyles the search to the reader's own look. That is John's call per reader (§2).
- **Rules:** implementation and review are never the same model family (a Claude edit gets a Codex
  review); pass `model:` on every Agent spawn; Grok is benched (John, 11 Nov); show John pictures, not
  descriptions; never shrink type or tap targets; no explainer text in the reader. Merge a PR when all
  its checks are green; deploys wait for John.

## 1. The readers (checked 16 Nov)

| Reader | Repo, local path | `Search.svelte` lines | Notes |
|---|---|---|---|
| Aristotle (source) | this repo | 5,442 | |
| Plato | johnhboyer-sys/plato-reader, `~/Developer/plato-reader` | 5,435 | Closest to this one. The search-vs-TLG plan's PRs 1–4 are merged there; PR 5 (POS) is held for John (`docs/search-update/` here). John, 13 Nov: the phone default must be Both. |
| Homer | johnhboyer-sys/homer-reader, `~/Developer/homer-reader` | 2,895 | `homer-reader-deploy` and `homer-reader-panorama` are other checkouts of the same repo on their own branches; work in `~/Developer/homer-reader` on a new branch. Check whether its works carry translations before planning Both. |
| Greek plays | johnhboyer-sys/greek-plays, `~/Developer/greek-plays` | 1,797 | Has its own design (the Vase), which sets the bar for the redesign; B may not apply. The checkout was on `claude/glued-words-2026-11-15` (another session's work): branch from its `main`, never from that. |
| Classical philosophy | `~/Developer/classical-philosophy-reader`, no git remote | 1,713 | Ask John whether it is still live before any work. |
| Lyceum library | kempleb/lyceum-library (Brian's repo), `~/Developer/lyceum-library` | 1,719 | Not John's repo: nothing without John's word, and then as a PR to Brian. |
| Desktop app | `desktop/` in this repo | uses this `shared/` | Mounts the new Search unstyled (needs the `b.css` tokens and `b-search.css`). Low priority (John, 9 Nov). |

## 2. What John must rule per reader

- **The counting unit.** Aristotle counts chapters (John, 16 Nov: "If we had aristotle's greek divided
  into paragraphs, we would go by that"). Most Plato dialogues have no chapters (the Republic and Laws have
  books); options are the Stephanus page, the speech, or a section. Homer has books and lines. The plays
  have lines and scenes. Show each option with real counts from that reader, the way
  `docs/search-counting/` did for Aristotle.
- **The look:** B's design, or the search restyled to the reader's own.
- **The phone default view** (Plato: Both, already ruled).

## 3. What the search is made of here

Changed in `shared/` between old main (`6941109fb7`) and the merge (`de57f687c6`); list it with
`git diff --stat 6941109fb7 de57f687c6 -- shared/lib shared/components shared/styles`:

- **The page:** `components/Search.svelte`, `components/SavedSearches.svelte`, `styles/b-search.css`, and
  the tokens and layout in `styles/b.css`.
- **The engine and URL:** `lib/search.ts`, `lib/search-url.ts`, `lib/search-pages.ts`,
  `lib/chapter-pages.ts` (new), `lib/result-views.ts`, `lib/form-panel.ts`, `lib/english-hit.ts`,
  `lib/english-place.ts`, `lib/paired-hit.ts`, `lib/proximity-sentence.ts`, `lib/running-text.ts`
  (+ `running-text.worker.ts`, `running-match.ts`), `lib/greek-keys.ts`, `lib/betacode.ts`,
  `lib/saved-searches.ts`.
- **Some of these came from Plato** during the search-vs-TLG work (`speakers.ts`, `sect-ticks.ts`,
  `speaker-colors.ts`, `corpus-tools.ts`, `inscription.ts`). Several are dead code in Aristotle; keep
  each reader's own version.
- **Data the search needs from the corpus build:** `running.json` per work (stage 6 writes it), the
  search indexes, and the outline (chapters) per book. Check every fetch against that reader's build: a
  missing file may fail quietly rather than loudly (not tested).

### The row table: page 1 reads only its own books (17 Nov)

Pages by rows (#201) and the phrase list (#202) made page 1 read every book a search reaches: a row's
edges turn on the book (aligned units, passages that share lines), and the phrases on its words. Found in
the Homer port: θάλασσα + sea read 47 books there. Here ἀρετή + virtue read all 98 books, 13.5 MB gzip
(59 MB unzipped), where page 1 draws from 7. John chose the fix on 17 Nov, and every reader that ports the
rows needs it:

- **`data/<work>/rows.json`, made at site build** by an Astro endpoint
  (`app/src/pages/data/[work]/rows.json.ts`) from the built books, by the page's own functions
  (`shared/lib/row-table.ts`, `encodeRowBook`): per book, each section's Greek lines (number, suffix,
  words a line), the aligned unit of each Greek word and of each translation's words (run-length), and
  whether its English carries Bekker ticks. The build checks the English answers against
  `unitAtEnglish` on a sample and fails on the first that differs. Here: 1.25 MB, 338 KB gzip, about
  55 seconds of build; EN's is 27 KB gzip.
- **`countRows`** counts a book's rows from it as `buildGroups` lays them out (the same windows, joins and
  merges; `greek-lines.ts` holds the line helpers both use). The page counts every book from the table,
  shows the page total at once, and reads only the books its page draws (`countKnown`, `pageRows`).
- **The page checks the table:** each book it reads, it compares with the table's count; a book that
  differs (an index built apart from the books, whose word places miss) retires the table for the visit,
  and every book is read as before. A work with no table (the desktop app's corpus) or a search with the
  accent or case filter (which reads its books anyway) is read as before.
- **The phrase list's words are read when the list is opened** ("Show" on the desktop, the Phrases screen
  on the phone), or at once when the address sets a phrase aside.
- **Proof here:** `app/scripts/search-counts.mjs --pages` records every page's rows;
  `search-counts-compare.mjs` compares two runs (18 searches, 13,759 rows: identical; a one-row shift
  and a table count one row high both fail it). Gate R-S8 bounds page 1 of ἀρετή + virtue at its 7 books
  and 10 MB unzipped, and fails on the site before the table (98 books). `row-table-search.test.ts`
  renders the page over a turn-aligned and a tick-aligned book in each context and compares.
- **For a port:** each reader's units differ (Homer's turns, Plato's speeches), but the table holds what
  that reader's `buildGroups` reads, so port `row-table.ts` with the reader's own `paired-hit.ts`, and
  check `countRows` against the reader's `buildGroups` hunk by hunk before trusting it.

## 4. How to prove a port

- **Write each reader's own baseline before touching it:** a `search-counts.mjs`-style list of 10 to 15
  searches with their totals, measured on its current build, then compared after the port. A count that
  moves must be explained.
- **Port the gates with the code:** the `R-S*` gates in `app/scripts/check-redesign.mjs` and
  `app/scripts/search-shots.mjs` are written against Aristotle's pages and counts. Rewrite their expected
  values from that reader's data, and prove each one catches its failure (`--prove`) before trusting a
  pass.
- **Screenshots for John:** phone (390 and 360), sideways (844), desktop (1440), both themes, old against
  new.
