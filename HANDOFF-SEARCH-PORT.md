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
