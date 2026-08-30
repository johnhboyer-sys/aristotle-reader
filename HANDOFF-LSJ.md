# HANDOFF: the LSJ entry, to be redesigned from first principles

Generated: 2026-08-20 midday · Read this before touching LSJ presentation.

**Status note, 2026-08-29.** This is the LSJ-track handoff for aristotle-reader.
It was called `HANDOFF.md` until today; renamed so it cannot be overwritten by a
handoff from another track. Question #1 is being answered in the **grammar-site**
repo, not here — John has the entry design built there and is having a second
session check it before it ports across. So §3's "Decision for John" is no longer
live as posed: the forms-block repair on `claude/lsj-entry-parts` sits inside
`renderLsjEntry`, the same function the port must land on, so the port either
absorbs it or replaces it. That branch is unmerged and unshipped; its 237 tests
pass (re-run 2026-08-29) and it is 21 commits behind main.

## 1. The frame John set (do not lose this)

The work splits in two, and they must be solved in this order:

**#1 — What is the ideal digital presentation of an LSJ entry, on its own?**
Applies to the lexicon/lemma pages of every reader AND to the separate
grammar-site repo. No reader context available or assumed.

**#2 — What is the ideal presentation of an LSJ entry inside the reader's word
popup?** Reader sites only. Adds context utility — the parse, the author, the
work, the surrounding tokens. **#2 depends on #1 and must not be started until
#1 is settled.**

The failure of the 2026-08-19/20 session was doing neither: it reacted to one
defect at a time, then reached for context utility (case chips, routing) to
rescue a standalone presentation that was not yet right. Do not repeat that.

## 2. What the entry actually is (established, with numbers)

14,047 entries in the deployed shards. Parts, all already marked by the
pipeline — none of this needs new data:

| Part | Marked as | Count |
|---|---|---|
| Headword | `lsj-head`, `lsj-gen`, `lsj-itype`, `lsj-orth` | 14,047 |
| Forms / morphology | `lsj-tns`, `lsj-gram`, `lsj-mood`, `lsj-per`, `lsj-number` | 25,517 labels |
| Etymology | `lsj-etym` | 2,805 |
| Sense taxonomy | `lsj-sense` + `data-level` | 47,826 |
| Definition | a leading `<i>` opening a sense | 26,123 (56% of senses) |
| Quotation | `lsj-cit` (87,758) **or** `lsj-greek` + a `lsj-bibl` (33,430) | 121,188 |
| Cross-reference | bare `lsj-bibl` | ~136,000 |

**The markup is FLAT.** Max nesting depth 1 — hierarchy lives entirely on
`data-level` (values 0–4), never in nesting. 8,528 entries use multiple levels.

**Composition by class** (verbs are 12% of the dictionary and drove 100% of the
last session's design — that was the mistake):

| Class | n | under 300 chars | signature |
|---|---|---|---|
| noun | 5,112 | 46% | gender |
| particle/preposition | 2,932 | 56% | governed case |
| adjective | 1,972 | **75%** | terminations |
| adverb | 1,721 | 23% | comparison |
| verb | 1,651 | 6% | principal parts |
| proper name | 345 | 51% | identification |

**Long entries come in three shapes, and only one is about forms:**

- **Case-governed** — ἐπί 31,057 chars / 93 senses / 1 form. A/B/C are the
  cases: ἐπί 19 gen, 27 dat, 17 acc, 24 other. Also παρά, πρός, ὑπό, κατά;
  527 entries carry a case axis.
- **Sense-forest** — λόγος 32,734 chars / 64 senses / **0 forms**. ὡς 75 senses.
  ἐπί aside, this is the commonest long shape.
- **Forms + senses** — τίθημι 24,098 chars / 51 senses / 69 forms. εἰμί, φέρω.

**The scale problem, measured:** λόγος on a phone in landscape (932×430) is
15,498px of entry — **36 screens**. That is the real problem; short entries
never were one.

## 3. What is LIVE, and the defect that is live with it

Deployed 2026-08-19/20 to aristotle-reader, plato-reader, homer-reader (cpr is
built and held — see `LSJ-PORT-HELD.md` there). Shipped: sense hierarchy by
relative depth, one quotation per line, per-entry contents list, accessibility
fixes. Full record in DEPLOY-STATUS.md.

**⚠️ A DEFECT FROM THAT DEPLOY IS LIVE ON ALL THREE SITES.** The block of
inflected forms that opens 65% of entries is written label-then-form ("fut.
λέξω Od. 24.224"), and the one-quotation-per-line rule breaks before the FORM,
stranding every label at the end of the line above. Worst on the most looked-up
words: τίθημι 55 forms, εἰμί 37, δίδωμι 26, φημί 24, οἶδα 23. John reported it
from a screenshot of λέγεται.

**The fix is written, reviewed and NOT deployed:** branch
`claude/lsj-entry-parts` in aristotle-reader (`fcea5a089`). It cuts the forms
block into label+form rows at the dictionary's own ":" and ";", aligns them
where the labels really are labels, marks the definition and the untagged
quotations. Grok reviewed it — DO NOT DEPLOY, eight findings, all fixed. 237
tests. Verified over all 14,047 entries: 0 unbalanced tags, 0 senses lost, and
the only text change is punctuation the layout now carries (1,669 entries lose a
row separator, 7 a label comma, 170 both — stated honestly this time; an earlier
claim of "136 commas only" was false because the audit stripped `:;—` from both
sides before comparing).

**Decision for John:** ship that branch as a repair while #1 is designed, or
leave the defect live until the redesign lands. It is a repair of a defect this
project introduced, and its core move (structure rendered as structure) survives
any redesign.

## 4. Traps, all paid for

- **A form is not always a citation.** ἀνέχω writes "impf. ἠνειχόμην A. Ag. 905"
  as `lsj-greek` + `lsj-bibl`, not `lsj-cit`.
- **A label is not always tagged.** λέγω's "Ep." before ἐλέγμην is bare text.
  Rows can only be found from the dictionary's own punctuation.
- **`&lt;` ends in a semicolon.** Splitting on ";" tears entities in half. LSJ
  marks editorial supplements with angle brackets (φ&lt;ε&gt;ισθήσομαι).
- **Tag depth is not element depth.** Cutting at a comma "outside a tag" still
  splits `<span>ἦγον,</span>` — 90 entries had unclosed spans from this, twice,
  at two different layers.
- **A preamble is a table only as far as it stays one** (λέγω stops after 7
  forms) **but an aside is not the end** (τίθημι breaks for a 136-char note then
  runs for 50 more).
- **Loose content in a CSS grid becomes its own cell** — that is how "(" ended
  up opposite "κατ-, συν".
- **Quantity marks are not quotations.** "[ᾰπ]" beside a headword was being
  given a line break through the head.
- **Never shrink type.** The reader is vision impaired; two separate rounds
  introduced font-size cuts that had to be removed.
- **Verify a claim before making it**, and make the audit able to see the thing
  it is auditing.

## 5. Where the analysis pointed, before John stopped it

The one asset not yet used: **the section gloss.** "relation, correspondence,
proportion" is how a reader recognises a sense, not "II." — 56% of senses carry
one and it already feeds the contents list. Any navigation for a 64-sense entry
will lean on it.

For #2 only, and only after #1: the reader's context is known and currently
discarded — the popup already parses the clicked token, and the LSJ entry's
Aristotle citations link into this very corpus.

---
## Prompt for the fresh session

Read this file. Then answer #1 from first principles, for the whole range of
entries (84 chars to 32,734), before writing any code. #2 comes after.
