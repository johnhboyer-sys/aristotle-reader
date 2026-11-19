# Search audits, 18 Nov 2026

`shared_spellings.py` reads a built corpus's `data/` (any of the four readers);
`../battery/` runs fixed searches against the live sites.

## Shared spellings (`shared_spellings.py`)

A lemma search folds the typed word (accents, breathings, and case dropped) and takes
every index key in `lemma-map[fold]`. A fold shared by several keys pulls in all their
tokens. That is how τί μήν took in μείς and μής (fixed for phrases in #214).

    python3 -I shared_spellings.py Plato <data dir> 20

"Extra hits" for a fold = the union of its keys' token positions (the per-work
`search/greek_lemma.json` postings the search itself unions) minus the largest single
key's: the fewest hits a search on that fold adds, whichever key was meant. Exact; a
token filed under two keys counts once. Most of the heaviest folds are function words
few readers type (τάν, ἡ, ἐν), so the total is a measure of the problem, not of harm.

| Reader | Folds | Shared by 2+ keys | Extra hits, all shared folds | Folds adding 100+ |
|---|---|---|---|---|
| Aristotle | 53,867 | 7,179 (13.3%) | 541,041 | 353 |
| Plato | 46,138 | 6,742 (14.6%) | 498,392 | 371 |
| Homer | 28,138 | 4,721 (16.8%) | 177,462 | 260 |
| Plays | 72,438 | 9,000 (12.4%) | 468,756 | 428 |

## Would accents separate them? (part 2 of the same script)

From each work's `analyses.json` (accented form → lemmas), each lemma placed on its
index key through the picker (or, where the picker names no Beta Code, its own fold),
folded as the index folds (elision apostrophes kept):

| Reader | Shared folds: accents decide / help / can't / no analyses | Share of all extra hits in folds accents decide or help |
|---|---|---|
| Aristotle | 2% / 2% / 86% / 10% | 53% |
| Plato | 3% / 2% / 86% / 9% | 52% |
| Homer | 2% / 2% / 84% / 12% | 42% |
| Plays | 3% / 3% / 93% / 2% | 34% |

The four classes add up to part 1's total extra hits in every reader. "No analyses"
folds have no accented form in any `analyses.json` and carry under 2% of the hits.

"Can't" means the accented form itself carries every key: μήν is analysed as μείς,
μήν, and μής; δεῖ as δεῖ and δέω. Only knowing which word each token is (a tagged
corpus, or a per-token choice in the data) separates those. They are most of the folds
and about half the extra hits (two thirds in the plays): the heavy folds are short function words (ἡ, ἤ, ἦ; αὐτή
against αὕτη) whose accented forms do decide. A further 190–468 folds per reader hold
two lemmas the index has already merged into one key (ὄρος and ὅρος are both `oros`):
no lookup can split those, only finer postings.

## Live examples (Plato, 18 Nov)

| Search | Hits | What gets in |
|---|---|---|
| αὐτή | 21,140 | every form of οὗτος |
| μήν (one word) | 1,254 (μήν has 941) | μείς: μηνός, μῆνα. The #214 narrowing covers phrases only |
| δεῖ | 1,970 (δεῖ has 1,633) | δέω "bind": δήσας, δεθείς |

These three are `known-bug` cases in `battery/cases.json`.
